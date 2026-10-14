// The Book room: one book per realm, its annal eras as chapters. The page prints a chapter's events
// (key events first, then rulers, wars, famous deaths and the rest, to a page of prose) with the
// chronicle's own text, grouped by year; names open a note in the right margin (a bottom sheet on a
// phone) and the page never moves. A plate maps only the places the text names. Everything is read
// from the record: no sentence here is written by the room.

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { civColor, DEFAULT_CONTENT } from '../../content';
import { eventYear, linkSegments, yearText, type Id, type SimEvent } from '../../engine';
import { Link, cap, count, plural, useLegends } from '../legends-ctx';
import type { BookLink } from '../map-view';
import { RoomShell, type RoomId } from '../rooms/Rooms';
import { indexRows, legendIds, rolesOf, watchOf } from '../people/data';
import { createAtlas, defaultScale, type Atlas } from '../tales/atlas';
import {
  bodyIds,
  booksOf,
  chapterAt,
  chaptersOf,
  cropBox,
  dropCapFits,
  eraEvents,
  fitBox,
  lifeSpanText,
  nearestOther,
  paragraphsOf,
  perilsOf,
  pickBook,
  placesNamed,
  roman,
  searchBook,
  siteInYear,
  stripYear,
  summaryOf,
  type BookInfo,
  type Chapter,
  type Hit,
} from './data';
import '../tales/fonts.css';
import './book.css';

interface Props {
  /** The book, chapter and highlighted event the address names. */
  link: BookLink;
  /** The book last read, for a bare Book press. */
  lastBook: Id | null;
  onRoom: (room: RoomId) => void;
  /** Open another book or chapter, as a new history entry. */
  onOpen: (link: BookLink) => void;
  /** The margin note opened or closed: the address follows, on the same history entry. */
  onNote: (note: Note | null) => void;
}

type Note = { kind: 'person' | 'place' | 'civ'; id: Id };

const shade = (id: number | null) => {
  const [r, g, b] = civColor(id ?? 0);
  return `rgb(${Math.round(r * 0.72)},${Math.round(g * 0.72)},${Math.round(b * 0.72)})`;
};
/** Realms listed before "more realms". */
const BOOKS_SHOWN = 8;
const LIVES_SHOWN = 8;
const PERILS_SHOWN = 6;
const PLATE_MAX_PLACES = 10;
/** The plate's smallest crop in cells, and the most its atlas may be stretched on screen. */
const PLATE_MIN = { w: 64, h: 40 };
const PLATE_STRETCH = 1.5;
/** The narrow layout (contents drawer, note sheet, search under the box). */
const NARROW = '(max-width: 800px)';

/** True at the narrow layout. */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);
  useEffect(() => {
    const query = window.matchMedia(NARROW);
    const on = () => setNarrow(query.matches);
    query.addEventListener('change', on);
    on();
    return () => query.removeEventListener('change', on);
  }, []);
  return narrow;
}

export function BookRoom({ link, lastBook, onRoom, onOpen, onNote }: Props) {
  const { world, index } = useLegends();
  const books = useMemo(() => booksOf(world, index), [world, index]);
  const civId = books.some((b) => b.civId === link.civ) ? link.civ! : pickBook(books, lastBook);
  const book = books.find((b) => b.civId === civId);
  return (
    <RoomShell current="book" onRoom={onRoom} className="bk-root" data-testid="book">
      {book ? (
        <BookView
          key={book.civId}
          book={book}
          books={books}
          ch={link.ch}
          ev={link.ev}
          note={link.note ?? null}
          onOpen={onOpen}
          onNote={onNote}
        />
      ) : (
        <main className="bk-main">
          <p className="bk-empty">No realm has a book yet.</p>
        </main>
      )}
    </RoomShell>
  );
}

function BookView({
  book,
  books,
  ch,
  ev,
  note: linkNote,
  onOpen,
  onNote,
}: {
  book: BookInfo;
  books: readonly BookInfo[];
  ch: number;
  ev: Id | null;
  note: Note | null;
  onOpen: (link: BookLink) => void;
  onNote: (note: Note | null) => void;
}) {
  const { world, index, content, textOf, nameOf, titleOf, finalYear, siteActions } = useLegends();
  const chapters = useMemo(
    () => chaptersOf(world, index, content, book.civId),
    [world, index, content, book.civId],
  );
  const evEvent = ev === null ? undefined : index.event(ev);
  // A highlighted event belongs to its own chapter, whatever `ch` says.
  const found = evEvent ? chapterAt(chapters, eventYear(evEvent)) : -1;
  const at = Math.max(0, Math.min(chapters.length - 1, found >= 0 ? found : ch));
  const chapter = chapters[at];
  const [note, setNote] = useState<Note | null>(linkNote);
  const [tocOpen, setTocOpen] = useState(false);
  const [moreBooks, setMoreBooks] = useState(false);
  const [q, setQ] = useState('');
  const narrow = useNarrow();
  const pageEl = useRef<HTMLDivElement>(null);
  const shownAt = useRef(`${at}|${ev}|${book.civId}`);

  const rows = useMemo(() => indexRows(world, content), [world, content]);
  const lives = useMemo(() => {
    const legends = legendIds(world);
    const chosen = rows.filter((r) => legends.has(r.id));
    return (chosen.length >= 4 ? chosen : rows).slice(0, LIVES_SHOWN);
  }, [world, rows]);
  const perils = useMemo(() => perilsOf(world, content), [world, content]);
  const famous = useMemo(() => {
    const legends = legendIds(world);
    const fames = [...world.people.values()]
      .filter((p) => p.title !== undefined)
      .map((p) => p.fame);
    fames.sort((a, b) => a - b);
    const top = fames[Math.floor(fames.length * 0.75)] ?? Infinity;
    return (event: SimEvent) => {
      const person = world.people.get(event.actors[0] ?? -1);
      return (
        person !== undefined &&
        (legends.has(person.id) || person.title === 'ruler' || person.fame >= top)
      );
    };
  }, [world]);
  const [morePerils, setMorePerils] = useState(false);

  const events = useMemo(
    () => (chapter ? eraEvents(index, book.civId, chapter.from, chapter.to) : []),
    [index, book.civId, chapter],
  );
  // The line an event prints: the chronicle's text without the year its paragraph already shows.
  const lineOf = (event: SimEvent) => stripYear(textOf(event), eventYear(event));
  const ids = useMemo(
    () => (chapter ? bodyIds(index, chapter, events, ev, { lineOf, famous }) : []),
    [index, chapter, events, ev, famous],
  );
  const shown = useMemo(() => ids.flatMap((id) => index.event(id) ?? []), [ids, index]);
  const paragraphs = useMemo(() => paragraphsOf(shown), [shown]);
  const summary = chapter ? summaryOf(chapter.from, chapter.to, events) : '';
  const places = useMemo(() => placesNamed(index, shown, lineOf, nameOf), [index, shown]);
  const capped = paragraphs[0]?.ids[0] !== undefined && dropCapFits(lineOf(shown[0]!));

  // A new chapter starts at the top; a highlighted event scrolls into view instead.
  useEffect(() => {
    const el = pageEl.current;
    if (!el) return;
    const mark = el.querySelector('.bk-hl');
    if (ev !== null && mark) mark.scrollIntoView({ block: 'center' });
    else el.scrollTop = 0;
    // A new page closes the note; the page the address was opened on keeps the one it names.
    if (shownAt.current !== `${at}|${ev}|${book.civId}`) setNote(null);
    shownAt.current = `${at}|${ev}|${book.civId}`;
  }, [at, ev, book.civId]);
  // The note is part of the address, so Back from the Town room restores it.
  useEffect(() => {
    if (note?.kind !== linkNote?.kind || note?.id !== linkNote?.id) onNote(note);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note]);

  // Escape closes the note (and the contents drawer) at every width.
  useEffect(() => {
    if (!note && !tocOpen) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setNote(null);
      setTocOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [note, tocOpen]);

  const open = (n: number) => {
    setTocOpen(false);
    onOpen({ civ: book.civId, ch: n, ev: null });
  };
  const openBook = (civ: Id) => {
    setTocOpen(false);
    onOpen({ civ, ch: 0, ev: null });
  };

  const hits = useMemo(
    () =>
      searchBook(
        q,
        world,
        books,
        chapters,
        rows.map((r) => ({
          id: r.id,
          name: r.name,
          hint: `${r.role.split(' · ')[0]} · ${lifeSpanText(r.years)}`,
        })),
      ),
    [q, world, books, chapters, rows],
  );
  const pick = (hit: Hit) => {
    setQ('');
    if (hit.kind === 'book') openBook(hit.id);
    else if (hit.kind === 'chapter' || hit.kind === 'year') open(hit.ch!);
    else setNote({ kind: hit.kind, id: hit.id });
    setTocOpen(false);
  };

  const shownBooks = moreBooks ? books : books.slice(0, BOOKS_SHOWN);
  const listed = shownBooks.some((b) => b.civId === book.civId)
    ? shownBooks
    : [book, ...shownBooks];

  const nameButton = (
    kind: 'person' | 'place' | 'civ',
    id: Id,
    text: React.ReactNode,
    k: number,
  ) => (
    <button
      key={k}
      type="button"
      className="bk-name"
      data-kind={kind}
      onClick={() => setNote({ kind, id })}
    >
      {text}
    </button>
  );
  const sentence = (event: SimEvent, dropCap: boolean) => {
    const line = lineOf(event);
    const segments = linkSegments(
      line,
      index.refs(event.id).map((ref) => ({ ref, name: nameOf(ref) })),
    );
    // A drop cap on plain text is the paragraph's ::first-letter (CSS); a name button opening the
    // paragraph holds its own cap span, so the cap is never the year label.
    const withCap = (text: string, k: number, button: boolean): React.ReactNode =>
      dropCap && button && k === 0 && text !== '' ? (
        <>
          <span className="bk-cap">{text[0]}</span>
          {text.slice(1)}
        </>
      ) : (
        text
      );
    return segments.map((s, k) => {
      if (!s.ref) return s.text;
      if (s.ref.kind === 'person')
        return nameButton('person', s.ref.id, withCap(s.text, k, true), k);
      if (s.ref.kind === 'site') return nameButton('place', s.ref.id, withCap(s.text, k, true), k);
      if (s.ref.kind === 'civ' && books.some((b) => b.civId === s.ref!.id))
        return nameButton('civ', s.ref.id, withCap(s.text, k, true), k);
      return s.text;
    });
  };

  const foundList = <FoundList hits={hits} onPick={pick} />;

  return (
    <main className="bk-main">
      <header className="bk-top">
        <button
          type="button"
          className="bk-tocbtn"
          aria-expanded={tocOpen}
          onClick={() => setTocOpen((v) => !v)}
        >
          Contents
        </button>
        <h1>The Chronicle of {world.seed}</h1>
        <p className="bk-crumb">
          Book of the {book.title}
          {chapter ? ` · Chapter ${roman(chapter.n)}` : ''}
        </p>
        <div className="bk-searchbox">
          <input
            type="search"
            className="bk-search"
            placeholder="Find a name, a place, a year…"
            aria-label="Search the book"
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {narrow && q.trim() !== '' && (
            <div className="bk-results" role="region" aria-label="Search results">
              {foundList}
            </div>
          )}
        </div>
      </header>
      <div className={`bk-cols${note ? ' has-note' : ''}`}>
        {tocOpen && (
          <div className="bk-scrim" onClick={() => setTocOpen(false)} aria-hidden="true" />
        )}
        <nav className={`bk-toc${tocOpen ? ' open' : ''}`} aria-label="Contents">
          {q.trim() !== '' && !narrow ? (
            foundList
          ) : (
            <>
              <section>
                <h2>Books of the realms</h2>
                <ul className="bk-books">
                  {listed.map((b) => (
                    <li key={b.civId}>
                      <button
                        type="button"
                        className={`bk-bookbtn${b.civId === book.civId ? ' on' : ''}`}
                        aria-current={b.civId === book.civId ? 'true' : undefined}
                        onClick={() => openBook(b.civId)}
                      >
                        <span>{b.title}</span>
                        <small>
                          {b.from}–{b.to}
                        </small>
                      </button>
                      {b.civId === book.civId && (
                        <ol className="bk-chapters">
                          {chapters.map((c, k) => (
                            <li key={c.n}>
                              <button
                                type="button"
                                className={k === at ? 'on' : ''}
                                aria-current={k === at ? 'true' : undefined}
                                onClick={() => open(k)}
                              >
                                <span>
                                  {roman(c.n)}. {cap(c.name)}
                                </span>
                                <small>
                                  {c.from}–{c.to}
                                </small>
                              </button>
                            </li>
                          ))}
                        </ol>
                      )}
                    </li>
                  ))}
                </ul>
                {books.length > BOOKS_SHOWN && (
                  <button type="button" className="bk-more" onClick={() => setMoreBooks((v) => !v)}>
                    {moreBooks ? 'fewer realms' : `${books.length - BOOKS_SHOWN} more realms…`}
                  </button>
                )}
              </section>
              <section>
                <h2>Lives</h2>
                <ul>
                  {lives.map((r) => (
                    <li key={r.id}>
                      <Link to={{ kind: 'person', id: r.id }} className="bk-life">
                        <span>{r.name}</span>
                        <small>{r.role.split(' · ')[0]}</small>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
              {perils.length > 0 && (
                <section>
                  <h2>Perilous places</h2>
                  <ul>
                    {(morePerils ? perils : perils.slice(0, PERILS_SHOWN)).map((p) => (
                      <li key={p.siteId}>
                        <Link to={{ kind: 'site', id: p.siteId }} className="bk-life bk-peril">
                          <span>{p.name}</span>
                          <small>
                            {p.beasts
                              .slice(0, 2)
                              .map((b) => `${cap(b.name)}, ${b.status}`)
                              .join('; ')}
                            {p.beasts.length > 2 ? ` and ${p.beasts.length - 2} more` : ''}
                          </small>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {perils.length > PERILS_SHOWN && (
                    <button
                      type="button"
                      className="bk-more"
                      onClick={() => setMorePerils((v) => !v)}
                    >
                      {morePerils ? 'fewer' : `${perils.length - PERILS_SHOWN} more…`}
                    </button>
                  )}
                </section>
              )}
            </>
          )}
        </nav>

        <div className="bk-page" ref={pageEl} data-testid="book-page">
          {chapter && (
            <article className="bk-chapter" key={`${book.civId}:${at}`}>
              <p className="bk-kicker">
                Chapter {roman(chapter.n)} · {book.title}
              </p>
              <h2 className="bk-title">{cap(chapter.name)}</h2>
              <p className="bk-summary">{summary}</p>
              <div className="bk-body">
                {paragraphs.map((p, i) => (
                  <Fragment key={p.ids[0]}>
                    <div className="bk-year">Year {yearText(p.year)}</div>
                    <p className={`bk-para${capped && i === 0 ? ' dc' : ''}`}>
                      {p.ids.map((id, j) => {
                        const event = index.event(id);
                        if (!event) return null;
                        return (
                          <span
                            key={id}
                            className={id === ev ? 'bk-hl' : undefined}
                            data-event={id}
                            title={titleOf(event)}
                          >
                            {sentence(event, capped && i === 0 && j === 0)}{' '}
                          </span>
                        );
                      })}
                    </p>
                    {i === 0 && (
                      <Plate
                        key={`${book.civId}:${at}`}
                        places={places}
                        years={`${yearText(chapter.from)}–${yearText(chapter.to)}`}
                        n={chapter.n}
                      />
                    )}
                  </Fragment>
                ))}
              </div>
              <ChapterNav chapters={chapters} at={at} onOpen={open} />
            </article>
          )}
        </div>

        <aside className={`bk-margin${note ? ' open' : ''}`} aria-label="Margin note">
          {note ? (
            <>
              <button
                type="button"
                className="bk-close"
                aria-label="Close the note"
                onClick={() => setNote(null)}
              >
                ×
              </button>
              {note.kind === 'person' ? (
                <PersonNote id={note.id} finalYear={finalYear} siteActions={siteActions} />
              ) : note.kind === 'civ' ? (
                <RealmNote book={books.find((b) => b.civId === note.id)} onRead={openBook} />
              ) : (
                <PlaceNote
                  id={note.id}
                  year={chapter?.to ?? finalYear}
                  finalYear={finalYear}
                  onNote={setNote}
                />
              )}
            </>
          ) : (
            <p className="bk-hint">
              Tap any underlined name and its note opens here in the margin. The book never leaves
              the page.
            </p>
          )}
        </aside>
      </div>
    </main>
  );
}

function FoundList({ hits, onPick }: { hits: readonly Hit[]; onPick: (hit: Hit) => void }) {
  return (
    <section>
      <h2>Found</h2>
      {hits.length === 0 ? (
        <p className="bk-none">Nothing in the book by that name.</p>
      ) : (
        <ul>
          {hits.map((h) => (
            <li key={`${h.kind}${h.id}`}>
              <button type="button" className="bk-hit" onClick={() => onPick(h)}>
                <span>{h.label}</span>
                <small>{h.hint}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ChapterNav({
  chapters,
  at,
  onOpen,
}: {
  chapters: readonly Chapter[];
  at: number;
  onOpen: (n: number) => void;
}) {
  const prev = chapters[at - 1];
  const next = chapters[at + 1];
  return (
    <nav className="bk-nav" aria-label="Chapters">
      <button
        type="button"
        className="prev"
        disabled={!prev}
        aria-label={
          prev ? `Previous chapter: ${roman(prev.n)}. ${cap(prev.name)}` : 'No previous chapter'
        }
        onClick={() => onOpen(at - 1)}
      >
        {prev ? (
          <>
            <small>‹ Previous: {roman(prev.n)}</small>
            <span>{cap(prev.name)}</span>
          </>
        ) : (
          '‹'
        )}
      </button>
      <span
        className="bk-progress"
        role="progressbar"
        aria-label="Progress through the book"
        aria-valuemin={1}
        aria-valuemax={chapters.length}
        aria-valuenow={at + 1}
      >
        <i style={{ width: `${((at + 1) / chapters.length) * 100}%` }} />
      </span>
      <button
        type="button"
        className="next"
        disabled={!next}
        aria-label={next ? `Next chapter: ${roman(next.n)}. ${cap(next.name)}` : 'No next chapter'}
        onClick={() => onOpen(at + 1)}
      >
        {next ? (
          <>
            <small>Next: {roman(next.n)} ›</small>
            <span>{cap(next.name)}</span>
          </>
        ) : (
          '›'
        )}
      </button>
    </nav>
  );
}

function PersonNote({
  id,
  finalYear,
  siteActions,
}: {
  id: Id;
  finalYear: number;
  siteActions: { enabled: boolean; watchTown: (siteId: Id, who?: Id) => void };
}) {
  const { world, content, index } = useLegends();
  const person = world.people.get(id);
  if (!person) return null;
  const roles = rolesOf(world, person, content).line;
  const watch = watchOf(world, person, siteActions.enabled);
  const deeds = index.events({ kind: 'person', id }).length;
  const age = (person.died ?? finalYear) - person.born;
  return (
    <div className="bk-note" data-testid="book-note" data-kind="person">
      <div className="head">
        <span
          className="bk-disc"
          style={{ background: shade(person.civId ?? null) }}
          aria-hidden="true"
        >
          {person.name.slice(0, 1)}
        </span>
        <div>
          <h3>{person.name}</h3>
          <p className="role">{roles}</p>
        </div>
      </div>
      <ul>
        <li>Born in Year {yearText(person.born)}</li>
        <li>
          {person.died === undefined
            ? `Living, aged ${age}`
            : `Died in Year ${yearText(person.died)}, aged ${age}`}
        </li>
        {deeds > 0 && (
          <li>
            {count(deeds)} {plural(deeds, 'record', 'records')} in the chronicle
          </li>
        )}
      </ul>
      <Link to={{ kind: 'person', id }} className="bk-btn dark">
        Read {person.sex === 'f' ? 'her' : 'his'} life
      </Link>
      {watch && (
        <>
          <button
            type="button"
            className="bk-btn"
            disabled={watch.reason !== undefined}
            onClick={() => siteActions.watchTown(watch.siteId, id)}
          >
            {person.died === undefined
              ? `Watch ${person.sex === 'f' ? 'her' : 'him'} in ${watch.name}`
              : `Watch ${watch.name}`}
          </button>
          {watch.reason && (
            <small className="bk-why">
              {watch.reason}
              {watch.fallen && (
                <>
                  {' · '}
                  <Link to={{ kind: 'site', id: watch.siteId }} className="bk-ln">
                    See {watch.name} on the world map
                  </Link>
                </>
              )}
            </small>
          )}
        </>
      )}
    </div>
  );
}

function RealmNote({ book, onRead }: { book: BookInfo | undefined; onRead: (civ: Id) => void }) {
  if (!book) return null;
  return (
    <div className="bk-note place" data-testid="book-note" data-kind="civ">
      <p className="kind">Realm</p>
      <h3>{book.title}</h3>
      <p>
        Held Years {book.from}–{book.to}.
      </p>
      <button type="button" className="bk-btn dark" onClick={() => onRead(book.civId)}>
        Read its book
      </button>
      <Link to={{ kind: 'civ', id: book.civId }} className="bk-btn">
        See on map (leaves the book)
      </Link>
    </div>
  );
}

function PlaceNote({
  id,
  year,
  finalYear,
  onNote,
}: {
  id: Id;
  /** The chapter's last year: the note says how the place stood then. */
  year: number;
  finalYear: number;
  onNote: (note: Note) => void;
}) {
  const { world } = useLegends();
  const site = world.sites.get(id);
  if (!site) return null;
  const then = siteInYear(world, id, year);
  const pop = Math.round(then ? then.pop : site.pop.reduce((sum, b) => sum + b.count, 0));
  const ruined = then ? then.ruined : site.ruinedYear !== undefined;
  const civ = then ? then.civ : site.civId;
  const owner = civ === null ? undefined : world.civs.get(civ);
  // Without the yearly record, the note says plainly that it shows the end of history.
  const when = then ? `In Year ${yearText(year)}` : 'At the end of history';
  const folk = [...world.people.values()]
    .filter((p) => p.siteId === site.id && p.died === undefined && p.title !== undefined)
    .sort((a, b) => b.fame - a.fame || a.id - b.id)
    .slice(0, 4);
  return (
    <div className="bk-note place" data-testid="book-note" data-kind="place">
      <p className="kind">Place</p>
      <h3>{site.name}</h3>
      <p>
        {ruined
          ? `${when}, a ${site.kind} fallen to ruin; ${count(site.peakPop)} people at its height.`
          : `${when}, a ${site.kind} of ${count(pop)} people.`}
        {owner ? ` Held by the ${owner.name}.` : ''}
      </p>
      {folk.length > 0 && (
        <>
          <p className="kind folk-head">Living there in Year {yearText(finalYear)}</p>
          <ul className="folk">
            {folk.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="bk-ln"
                  onClick={() => onNote({ kind: 'person', id: p.id })}
                >
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <Link to={{ kind: 'site', id }} className="bk-btn">
        Open on the world map
      </Link>
    </div>
  );
}

/** Terrain atlases, one per world and scale: the plate re-crops them chapter by chapter. */
const ATLASES = new WeakMap<object, Map<number, Atlas>>();
function atlasFor(
  cells: NonNullable<ReturnType<typeof useLegends>['world']['cells']>,
  scale: number,
) {
  const byScale = ATLASES.get(cells) ?? new Map<number, Atlas>();
  ATLASES.set(cells, byScale);
  let made = byScale.get(scale);
  if (!made) {
    made = createAtlas(
      cells,
      DEFAULT_CONTENT.biomes.map((b) => b.id),
      scale,
    );
    made.draw({
      mode: 'plain',
      key: 0,
      owner: new Uint16Array(cells.width * cells.height),
      fillOf: () => null,
      borderOf: () => [0, 0, 0],
      towns: [],
      holy: [],
    });
    byScale.set(scale, made);
  }
  return made;
}

/** Label size in CSS pixels (the plate's text is DOM text, so it is the same size at any dpr). */
const PLATE_FONT = "600 12px 'Alegreya', Georgia, serif";
interface PlateLabel {
  id: Id;
  name: string;
  x: number;
  y: number;
  /** A town shown for context, not named in the chapter. */
  context: boolean;
  left: boolean;
}

/**
 * The plate: the Tales atlas in Plain mode, cropped around the places the text names (at least
 * 64 by 40 cells, widened to the plate's shape) and drawn at its displayed size times the device
 * pixel ratio. Marks and names are DOM, in CSS pixels. A single place also shows its nearest other
 * town, as context.
 */
function Plate({ places, years, n }: { places: readonly Id[]; years: string; n: number }) {
  const { world } = useLegends();
  const cells = world.cells;
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const dpr = window.devicePixelRatio || 1;
  const named = useMemo(
    () => places.filter((id) => world.sites.has(id)).slice(0, PLATE_MAX_PLACES),
    [places, world],
  );
  const shown = useMemo(() => {
    const context =
      named.length === 1
        ? nearestOther(world, world.sites.get(named[0]!)!.cell, new Set(named))
        : undefined;
    return [
      ...named.map((id) => ({ id, context: false })),
      ...(context === undefined ? [] : [{ id: context, context: true }]),
    ];
  }, [named, world]);

  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return undefined;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((old) =>
        old && Math.abs(old.w - r.width) < 1 && Math.abs(old.h - r.height) < 1
          ? old
          : { w: r.width, h: r.height },
      );
    };
    measure();
    const watcher = new ResizeObserver(measure);
    watcher.observe(el);
    return () => watcher.disconnect();
  }, [named.length]);

  // The atlas is stretched at most 1.5 times: its scale follows the plate's pixels a cell (the
  // closest crop is 64 by 40 cells), up to a 2048 pixel plane.
  const need = useMemo(() => {
    if (!cells || !size) return 0;
    const perCell = Math.min(size.w / PLATE_MIN.w, size.h / PLATE_MIN.h) * dpr;
    return Math.min(Math.floor(2048 / cells.width), Math.ceil(perCell / PLATE_STRETCH));
  }, [cells, size, dpr]);
  useEffect(() => {
    if (!cells || named.length === 0 || need === 0) return undefined;
    const scale = Math.max(defaultScale(cells.width), need);
    const handle = window.setTimeout(() => setAtlas(atlasFor(cells, scale)), 0);
    return () => window.clearTimeout(handle);
  }, [cells, named.length, need]);

  const layout = useMemo(() => {
    if (!cells || !size || shown.length === 0) return null;
    const sites = shown.map((s) => world.sites.get(s.id)!);
    const crop = cropBox(
      sites.map((s) => s.cell),
      cells.width,
      cells.height,
      PLATE_MIN,
      6,
    );
    const box = fitBox(crop, size.w / size.h, cells.width, cells.height);
    const at = (cell: number) => ({
      x: (((cell % cells.width) + 0.5 - box.x0) / (box.x1 - box.x0)) * size.w,
      y: ((Math.floor(cell / cells.width) + 0.5 - box.y0) / (box.y1 - box.y0)) * size.h,
    });
    const measure = document.createElement('canvas').getContext('2d');
    if (measure) measure.font = PLATE_FONT;
    const dots = sites.map((s, k) => ({ ...at(s.cell), context: shown[k]!.context, id: s.id }));
    const taken = dots.map((d) => ({ x0: d.x - 5, y0: d.y - 5, x1: d.x + 5, y1: d.y + 5 }));
    const labels: PlateLabel[] = [];
    // Named places claim their label first; context comes last and may go unlabelled.
    for (const [k, s] of sites.entries()) {
      const d = dots[k]!;
      const w = (measure?.measureText(s.name).width ?? s.name.length * 7) + 2;
      const tries = [
        { x: d.x + 8, y: d.y, left: false },
        { x: d.x - 8, y: d.y, left: true },
        { x: d.x + 8, y: d.y - 14, left: false },
        { x: d.x - 8, y: d.y + 14, left: true },
        { x: d.x + 8, y: d.y + 14, left: false },
        { x: d.x - 8, y: d.y - 14, left: true },
      ];
      for (const t of tries) {
        const rect = {
          x0: t.left ? t.x - w : t.x,
          x1: t.left ? t.x : t.x + w,
          y0: t.y - 8,
          y1: t.y + 8,
        };
        const fits = rect.x0 >= 2 && rect.x1 <= size.w - 2 && rect.y0 >= 2 && rect.y1 <= size.h - 2;
        if (
          !fits ||
          taken.some((o) => rect.x0 < o.x1 && rect.x1 > o.x0 && rect.y0 < o.y1 && rect.y1 > o.y0)
        )
          continue;
        taken.push(rect);
        labels.push({ id: s.id, name: s.name, x: t.x, y: t.y, context: d.context, left: t.left });
        break;
      }
    }
    return { box, dots, labels };
  }, [cells, size, shown, world]);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !atlas || !layout || !size) return;
    const W = Math.round(size.w * dpr);
    const H = Math.round(size.h * dpr);
    el.width = W;
    el.height = H;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const k = atlas.scale;
    const { box } = layout;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      atlas.canvas,
      box.x0 * k,
      box.y0 * k,
      (box.x1 - box.x0) * k,
      (box.y1 - box.y0) * k,
      0,
      0,
      W,
      H,
    );
  }, [atlas, layout, size, dpr]);

  if (named.length === 0) return null;
  return (
    <figure className="bk-plate" data-testid="book-plate">
      <div className="bk-plate-map" ref={frame}>
        <canvas
          ref={canvas}
          role="img"
          aria-label={`Plate ${roman(n)}: the places this chapter names, ${years}`}
        />
        {layout?.dots.map((d) => (
          <i
            key={d.id}
            className={`bk-dot${d.context ? ' ctx' : ''}`}
            style={{ left: d.x, top: d.y }}
          />
        ))}
        {layout?.labels.map((l) => (
          <span
            key={l.id}
            className={`bk-plbl${l.context ? ' ctx' : ''}${l.left ? ' left' : ''}`}
            style={{ left: l.x, top: l.y }}
          >
            {l.name}
          </span>
        ))}
      </div>
      <figcaption>Places in this chapter</figcaption>
    </figure>
  );
}
