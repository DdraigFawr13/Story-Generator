// The Book room: one book per realm, its annal eras as chapters. The page prints a chapter's key
// events with the chronicle's own text, grouped by year; names open a note in the right margin
// (a bottom sheet on a phone) and the page never moves. A small plate maps only the places the
// chapter names. Everything is read from the record: no sentence here is written by the room.

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { civColor, DEFAULT_CONTENT } from '../../content';
import { eventYear, linkSegments, yearText, type Id, type SimEvent } from '../../engine';
import { Link, cap, count, plural, useLegends } from '../legends-ctx';
import type { BookLink } from '../map-view';
import { RoomShell, type RoomId } from '../rooms/Rooms';
import { indexRows, legendIds, rolesOf, watchOf } from '../people/data';
import { createAtlas, type Atlas } from '../tales/atlas';
import {
  bodyIds,
  booksOf,
  chapterAt,
  chaptersOf,
  cropBox,
  eraEvents,
  paragraphsOf,
  pickBook,
  placesOf,
  roman,
  searchBook,
  summaryOf,
  type BookInfo,
  type Chapter,
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
}

type Note = { kind: 'person' | 'place'; id: Id };

const shade = (id: number | null) => {
  const [r, g, b] = civColor(id ?? 0);
  return `rgb(${Math.round(r * 0.72)},${Math.round(g * 0.72)},${Math.round(b * 0.72)})`;
};
/** Realms listed before "more realms". */
const BOOKS_SHOWN = 8;
const LIVES_SHOWN = 8;
const PERILS_SHOWN = 6;
const PLATE_MAX_PLACES = 10;

export function BookRoom({ link, lastBook, onRoom, onOpen }: Props) {
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
          onOpen={onOpen}
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
  onOpen,
}: {
  book: BookInfo;
  books: readonly BookInfo[];
  ch: number;
  ev: Id | null;
  onOpen: (link: BookLink) => void;
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
  const [note, setNote] = useState<Note | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [moreBooks, setMoreBooks] = useState(false);
  const [q, setQ] = useState('');
  const pageEl = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => indexRows(world, content), [world, content]);
  const lives = useMemo(() => {
    const legends = legendIds(world);
    const chosen = rows.filter((r) => legends.has(r.id));
    return (chosen.length >= 4 ? chosen : rows).slice(0, LIVES_SHOWN);
  }, [world, rows]);
  const perils = useMemo(() => {
    const tiers = new Map(content.creatures.map((def) => [def.id, def.tier]));
    return [...world.creatures.values()]
      .filter((c) => c.dragon !== undefined || (tiers.get(c.defId) ?? 'beast') !== 'beast')
      .sort((a, b) => (b.kills?.length ?? 0) - (a.kills?.length ?? 0) || a.id - b.id);
  }, [world, content]);
  const [morePerils, setMorePerils] = useState(false);

  const events = useMemo(
    () => (chapter ? eraEvents(index, book.civId, chapter.from, chapter.to) : []),
    [index, book.civId, chapter],
  );
  const ids = useMemo(() => (chapter ? bodyIds(index, chapter, ev) : []), [index, chapter, ev]);
  const paragraphs = useMemo(
    () => paragraphsOf(ids.flatMap((id) => index.event(id) ?? [])),
    [ids, index],
  );
  const summary = chapter ? summaryOf(chapter.from, chapter.to, events) : '';
  const places = useMemo(() => placesOf(index, ids), [index, ids]);

  // A new chapter starts at the top; a highlighted event scrolls into view instead.
  useEffect(() => {
    const el = pageEl.current;
    if (!el) return;
    const mark = el.querySelector('.bk-hl');
    if (ev !== null && mark) mark.scrollIntoView({ block: 'center' });
    else el.scrollTop = 0;
    setNote(null);
  }, [at, ev, book.civId]);

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
        rows.map((r) => ({ id: r.id, name: r.name, hint: r.role.split(' · ')[0]! })),
      ),
    [q, world, books, chapters, rows],
  );
  const pick = (hit: (typeof hits)[number]) => {
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

  const nameButton = (kind: 'person' | 'place' | 'civ', id: Id, text: string, k: number) => (
    <button
      key={k}
      type="button"
      className="bk-name"
      data-kind={kind}
      onClick={() => {
        if (kind === 'civ') openBook(id);
        else {
          setNote({ kind, id });
        }
      }}
    >
      {text}
    </button>
  );
  const sentence = (event: SimEvent) => {
    // The paragraph's year label says the year, so a line's own "Year 7: " lead is dropped.
    const own = textOf(event);
    const lead = own.match(/^Year [\u2212-]?\d+: /);
    const line = lead ? cap(own.slice(lead[0].length)) : own;
    const segments = linkSegments(
      line,
      index.refs(event.id).map((ref) => ({ ref, name: nameOf(ref) })),
    );
    return segments.map((s, k) => {
      if (!s.ref) return s.text;
      if (s.ref.kind === 'person') return nameButton('person', s.ref.id, s.text, k);
      if (s.ref.kind === 'site') return nameButton('place', s.ref.id, s.text, k);
      if (s.ref.kind === 'civ' && books.some((b) => b.civId === s.ref!.id))
        return nameButton('civ', s.ref.id, s.text, k);
      return s.text;
    });
  };

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
        <input
          type="search"
          className="bk-search"
          placeholder="Find a name, a place, a year…"
          aria-label="Search the book"
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </header>
      <div className="bk-cols">
        {tocOpen && (
          <div className="bk-scrim" onClick={() => setTocOpen(false)} aria-hidden="true" />
        )}
        <nav className={`bk-toc${tocOpen ? ' open' : ''}`} aria-label="Contents">
          {q.trim() !== '' ? (
            <section>
              <h2>Found</h2>
              {hits.length === 0 ? (
                <p className="bk-none">Nothing in the book by that name.</p>
              ) : (
                <ul>
                  {hits.map((h) => (
                    <li key={`${h.kind}${h.id}`}>
                      <button type="button" className="bk-hit" onClick={() => pick(h)}>
                        <span>{h.label}</span>
                        <small>{h.hint}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
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
                    {(morePerils ? perils : perils.slice(0, PERILS_SHOWN)).map((c) => (
                      <li key={c.id}>
                        <Link to={{ kind: 'beast', id: c.id }} className="bk-life">
                          <span>{cap(c.name)}</span>
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
                <Plate
                  places={places}
                  years={`${yearText(chapter.from)}–${yearText(chapter.to)}`}
                  n={chapter.n}
                />
                {paragraphs.map((p, i) => (
                  <Fragment key={p.ids[0]}>
                    {i === 0 && <div className="bk-year bk-dateline">Year {yearText(p.year)}</div>}
                    <p className="bk-para">
                      {i > 0 && (
                        <>
                          <b className="bk-year">Year {yearText(p.year)}</b>{' '}
                        </>
                      )}
                      {p.ids.map((id) => {
                        const event = index.event(id);
                        if (!event) return null;
                        return (
                          <span
                            key={id}
                            className={id === ev ? 'bk-hl' : undefined}
                            data-event={id}
                            title={titleOf(event)}
                          >
                            {sentence(event)}{' '}
                          </span>
                        );
                      })}
                    </p>
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
              ) : (
                <PlaceNote id={note.id} onNote={setNote} />
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
      <button type="button" disabled={!prev} onClick={() => onOpen(at - 1)}>
        {prev ? `‹ ${roman(prev.n)}. ${cap(prev.name)}` : '‹'}
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
      <button type="button" className="next" disabled={!next} onClick={() => onOpen(at + 1)}>
        {next ? `${roman(next.n)}. ${cap(next.name)} ›` : '›'}
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
  siteActions: { enabled: boolean; watch: (siteId: Id) => void };
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
            onClick={() => siteActions.watch(watch.siteId)}
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
                    See {watch.name} in Legends
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

function PlaceNote({ id, onNote }: { id: Id; onNote: (note: Note) => void }) {
  const { world } = useLegends();
  const site = world.sites.get(id);
  if (!site) return null;
  const pop = Math.round(site.pop.reduce((sum, b) => sum + b.count, 0));
  const owner = site.civId === null ? undefined : world.civs.get(site.civId);
  const folk = [...world.people.values()]
    .filter((p) => p.siteId === site.id && p.died === undefined && p.title !== undefined)
    .sort((a, b) => b.fame - a.fame || a.id - b.id)
    .slice(0, 4);
  return (
    <div className="bk-note place" data-testid="book-note" data-kind="place">
      <p className="kind">Place</p>
      <h3>{site.name}</h3>
      <p>
        {site.ruinedYear !== undefined
          ? `A ${site.kind} that fell in Year ${yearText(site.ruinedYear)}; ${count(site.peakPop)} people at its height.`
          : `A ${site.kind} of ${count(pop)} people.`}
        {owner ? ` Held by the ${owner.name}.` : ''}
      </p>
      {folk.length > 0 && (
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
      )}
      <Link to={{ kind: 'site', id }} className="bk-btn">
        Open its page
      </Link>
    </div>
  );
}

/** The plate: the Tales atlas in Plain mode, cropped to the places the chapter names. */
function Plate({ places, years, n }: { places: readonly Id[]; years: string; n: number }) {
  const { world } = useLegends();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const cells = world.cells;
  const sites = useMemo(
    () =>
      places
        .map((id) => world.sites.get(id))
        .filter((s): s is NonNullable<typeof s> => s !== undefined)
        .slice(0, PLATE_MAX_PLACES),
    [places, world],
  );
  // The terrain is drawn once per Book room, and only when a chapter has places to show.
  useEffect(() => {
    if (!cells || sites.length === 0 || atlas) return undefined;
    const handle = window.setTimeout(() => {
      const made = createAtlas(
        cells,
        DEFAULT_CONTENT.biomes.map((b) => b.id),
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
      setAtlas(made);
    }, 0);
    return () => window.clearTimeout(handle);
  }, [cells, sites, atlas]);
  useEffect(() => {
    const el = canvas.current;
    if (!el || !atlas || !cells || sites.length === 0) return;
    const box = cropBox(
      sites.map((s) => s.cell),
      cells.width,
      cells.height,
      { w: 36, h: 24 },
      4,
    );
    const k = atlas.scale;
    const sw = (box.x1 - box.x0) * k;
    const sh = (box.y1 - box.y0) * k;
    const W = 760;
    const H = Math.round((W * sh) / sw);
    el.width = W;
    el.height = H;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(atlas.canvas, box.x0 * k, box.y0 * k, sw, sh, 0, 0, W, H);
    const px = (cell: number) => ({
      x: (((cell % cells.width) + 0.5 - box.x0) / (box.x1 - box.x0)) * W,
      y: ((Math.floor(cell / cells.width) + 0.5 - box.y0) / (box.y1 - box.y0)) * H,
    });
    ctx.font = "600 26px 'Alegreya', Georgia, serif";
    ctx.textBaseline = 'middle';
    const taken: { x0: number; y0: number; x1: number; y1: number }[] = [];
    for (const s of sites) {
      const { x, y } = px(s.cell);
      ctx.fillStyle = '#a0442c';
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
      const label = s.name.toUpperCase();
      const w = ctx.measureText(label).width;
      const lx = Math.max(8, Math.min(W - w - 8, x - w / 2));
      const ly = y - 24 < 18 ? y + 24 : y - 24;
      const rect = { x0: lx - 4, y0: ly - 15, x1: lx + w + 4, y1: ly + 15 };
      if (taken.some((t) => rect.x0 < t.x1 && rect.x1 > t.x0 && rect.y0 < t.y1 && rect.y1 > t.y0))
        continue;
      taken.push(rect);
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(242,235,218,0.9)';
      ctx.strokeText(label, lx, ly);
      ctx.fillStyle = '#3a342b';
      ctx.fillText(label, lx, ly);
    }
  }, [atlas, cells, sites]);
  if (sites.length === 0) return null;
  return (
    <figure className="bk-plate" data-testid="book-plate">
      <canvas
        ref={canvas}
        role="img"
        aria-label={`Plate ${roman(n)}: the places this chapter names, ${years}`}
      />
      <figcaption>Plate {roman(n)}. Only the places named in this chapter are marked.</figcaption>
    </figure>
  );
}
