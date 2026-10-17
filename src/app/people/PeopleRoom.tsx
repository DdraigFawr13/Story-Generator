// The People room: an index of the world's notable figures and a personal page for each. It sits
// inside the Legends context, so every name, town and event links to the same pages Legends uses,
// and the chronicle is the one Legends shows. It only reads what the history logged.

import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { civColor } from '../../content';
import {
  eventYear,
  yearText,
  type Id,
  type Person,
  type SimEvent,
  type WorldState,
} from '../../engine';
import { AllEvents, PageView } from '../LegendPages';
import { RoomShell, type RoomId } from '../rooms/Rooms';
import { KIND_LABEL, Link, plural, useLegends, type PageRef } from '../legends-ctx';
import {
  PERSON_FILTERS,
  rolesOf,
  chipsOf,
  deedsOf,
  familyOf,
  filterRows,
  indexRows,
  lifeRows,
  type LifeRow,
  rivalsOf,
  watchOf,
  type IndexRow,
  type PersonFilter,
  type WatchState,
  magicOf,
  type MagicRecord,
} from './data';
import { HousePage } from './HouseTree';
import '../tales/fonts.css';
import './people.css';

interface Props {
  /** The person whose page is open, or null for the index. */
  person: Id | null;
  onRoom: (room: RoomId) => void;
  /** Open Tales with this person followed. */
  onFollow: (person: { id: Id; name: string }) => void;
  /** Back from a page to the index. */
  onIndex: () => void;
  /** Any other page (a town, realm, family, beast, treasure, event or race), shown here too. */
  page?: PageRef | null;
  /** Every chronicle line on a record page, or the shortened list. */
  all?: boolean;
  onAll?: (all: boolean) => void;
  /** Back from a record page: to the page before it, else the index. */
  onBack?: () => void;
  /** The person page this one was opened from, if any: the house tree focuses on them. */
  from?: PageRef | null;
}

/** Index rows shown at a time; scrolling to the end of the list reveals the next page. */
const PAGE = 80;

export function PeopleRoom(props: Props) {
  const { person, onRoom, onFollow, onIndex, page } = props;
  const { world } = useLegends();
  const found = person === null ? undefined : world.people.get(person);
  return (
    <RoomShell current="people" onRoom={onRoom} className="pp-root" data-testid="people">
      <main className="pp-main">
        {page ? (
          <RecordPage
            key={`${page.kind}:${page.id}`}
            page={page}
            all={props.all ?? false}
            onAll={props.onAll ?? (() => undefined)}
            onBack={props.onBack ?? onIndex}
            from={props.from?.kind === 'person' ? props.from.id : undefined}
          />
        ) : found ? (
          <PersonPage key={found.id} person={found} onFollow={onFollow} onIndex={onIndex} />
        ) : (
          <PeopleIndex />
        )}
      </main>
    </RoomShell>
  );
}

/** A town, realm, family, beast, treasure, event or race: its Legends page in the room's look. */
function RecordPage({
  page,
  all,
  onAll,
  onBack,
  from,
}: {
  page: PageRef;
  all: boolean;
  onAll: (all: boolean) => void;
  onBack: () => void;
  from?: Id | undefined;
}) {
  return (
    <div className="pp-scroll" data-testid="record-page">
      <button type="button" className="pp-back" onClick={onBack}>
        ‹ Back
      </button>
      {page.kind === 'dynasty' && <HousePage id={page.id} focus={from} shade={shade} />}
      <div className="pp-record lg-page" data-kind={KIND_LABEL[page.kind]}>
        <PageView page={page} all={all} onAll={onAll} />
      </div>
    </div>
  );
}

const shade = (id: number | null) => {
  const [r, g, b] = civColor(id ?? 0);
  return `rgb(${Math.round(r * 0.72)},${Math.round(g * 0.72)},${Math.round(b * 0.72)})`;
};

function Disc({
  name,
  civId,
  legend,
  big,
}: {
  name: string;
  civId: Id | null;
  legend: boolean;
  big?: boolean;
}) {
  return (
    <span
      className={`pp-disc${big ? ' big' : ''}`}
      style={{ background: shade(civId) }}
      aria-hidden="true"
    >
      {name.slice(0, 1)}
      {legend && <i className="gold" />}
    </span>
  );
}

function PeopleIndex() {
  const { world, content } = useLegends();
  const rows = useMemo(() => indexRows(world, content), [world, content]);
  const [chips, setChips] = useState<ReadonlySet<PersonFilter>>(new Set());
  const [q, setQ] = useState('');
  // The list follows the text a moment later, so typing never waits on a long list.
  const deferred = useDeferredValue(q);
  const shown = useMemo(() => filterRows(rows, chips, deferred), [rows, chips, deferred]);
  // How many rows are loaded, for the filter they were loaded under (a new filter starts over).
  const filterKey = `${deferred}|${[...chips].join(',')}`;
  const [loaded, setLoaded] = useState({ key: filterKey, count: PAGE });
  const limit = loaded.key === filterKey ? loaded.count : PAGE;
  const more = shown.length > limit;
  const sentinel = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !more || typeof IntersectionObserver === 'undefined') return;
    const watcher = new IntersectionObserver(
      (seen) => {
        if (seen.some((s) => s.isIntersecting)) setLoaded({ key: filterKey, count: limit + PAGE });
      },
      { rootMargin: '600px 0px' },
    );
    watcher.observe(el);
    return () => watcher.disconnect();
  }, [more, limit, filterKey]);
  const toggle = (id: PersonFilter) => {
    setChips((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  return (
    <div className="pp-scroll" data-testid="people-index">
      <header className="pp-top">
        <h1>People</h1>
        {rows.length === 0 && world.people.size === 0 ? (
          <p>The world is still being made…</p>
        ) : (
          <p>
            {shown.length.toLocaleString('en-GB')} of {rows.length.toLocaleString('en-GB')} notable
            figures, the most famous first
          </p>
        )}
        <input
          type="search"
          className="pp-search"
          placeholder="Search names, roles, realms, races and faiths"
          aria-label="Search people"
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="pp-chips" role="group" aria-label="Filters">
          {PERSON_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={chips.has(f.id)}
              onClick={() => toggle(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>
      {shown.length === 0 ? (
        <p className="pp-empty">Nobody matches those filters.</p>
      ) : (
        <ul className="pp-list">
          {shown.slice(0, limit).map((r) => (
            <Row key={r.id} row={r} />
          ))}
          {more && <li ref={sentinel} className="pp-sentinel" aria-hidden="true" />}
        </ul>
      )}
    </div>
  );
}

const Row = memo(function Row({ row }: { row: IndexRow }) {
  return (
    <li>
      <Link to={{ kind: 'person', id: row.id }} className="pp-row">
        <Disc name={row.name} civId={row.civId} legend={row.legend} />
        <span className="who">
          <b>{row.name}</b>
          <span className="role">{row.role}</span>
          <span className="meta">
            {row.years}
            {row.realm ? ` \u00b7 ${row.realm}` : ''}
          </span>
        </span>
        <span className="when">
          {row.years}
          <small>{row.realm}</small>
        </span>
      </Link>
    </li>
  );
});

type Tab = 'life' | 'family' | 'magic' | 'deeds' | 'rivals' | 'all';

function PersonPage({
  person,
  onFollow,
  onIndex,
}: {
  person: Person;
  onFollow: (person: { id: Id; name: string }) => void;
  onIndex: () => void;
}) {
  const { world, index, content, textOf, titleOf, finalYear, siteActions } = useLegends();
  const [tab, setTab] = useState<Tab>('life');
  const ref = { kind: 'person' as const, id: person.id };
  const events = useMemo(
    () => index.events(ref).flatMap((id) => index.event(id) ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index, person.id],
  );
  const legend = useMemo(
    () => events.some((e) => e.type === 'legend_risen' && e.actors[0] === person.id),
    [events, person.id],
  );
  const roles = useMemo(() => rolesOf(world, person, content).line, [world, person, content]);
  const chips = chipsOf(world, person, content, finalYear);
  const life = useMemo(
    () => lifeRows(world, person, events, textOf, { legend, titleOf }),
    [world, person, events, textOf, titleOf, legend],
  );
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(new Set());
  const deeds = useMemo(() => deedsOf(events), [events]);
  const family = familyOf(world, person);
  const rivals = useMemo(() => rivalsOf(world, person, events), [world, person, events]);
  const watch = watchOf(world, person, siteActions.enabled);
  const magic = useMemo(() => magicOf(world, person, content), [world, person, content]);
  const tabs: { id: Tab; label: string }[] = [
    { id: 'life', label: 'Life' },
    { id: 'family', label: 'Family' },
    ...(magic ? [{ id: 'magic' as const, label: 'Magic' }] : []),
    { id: 'deeds', label: 'Deeds' },
    { id: 'rivals', label: 'Rivals' },
    { id: 'all', label: `All ${events.length} records` },
  ];
  return (
    <div className="pp-scroll" data-testid="person-page">
      <button type="button" className="pp-back" onClick={onIndex}>
        ‹ People
      </button>
      <header className="pp-head">
        <Disc name={person.name} civId={person.civId ?? null} legend={legend} big />
        <div className="id">
          <h1>{person.name}</h1>
          <p className="role">{roles}</p>
          <div className="pp-tags">
            {chips.map((c) =>
              c.to ? (
                <Link key={c.key} to={c.to} className="pp-tag">
                  {c.text}
                </Link>
              ) : (
                <span key={c.key} className="pp-tag">
                  {c.text}
                </span>
              ),
            )}
          </div>
        </div>
        <div className="acts">
          <WatchButton
            watch={watch}
            onWatch={(site) => siteActions.watchTown(site, person.id)}
            primary
          />
          <button
            type="button"
            className="pp-btn"
            onClick={() => onFollow({ id: person.id, name: person.name })}
          >
            Follow {person.sex === 'f' ? 'her' : 'his'} story
          </button>
        </div>
      </header>
      <TabStrip tabs={tabs} tab={tab} onTab={setTab} />
      <div className="pp-body">
        <section
          className="pp-panel"
          role="tabpanel"
          aria-label={tabs.find((t) => t.id === tab)!.label}
        >
          {tab === 'life' && (
            <ol className="pp-life">
              {life.map((r, k) => {
                const open = unfolded.has(r.key);
                const line = (row: LifeRow, first: boolean, sub = false) => (
                  <li key={row.key} className={`${row.gold ? 'gold' : ''}${sub ? ' sub' : ''}`}>
                    <span className="age">
                      <b>{first ? `Age ${row.age}` : row.age}</b>
                      <small>Year {yearText(row.year)}</small>
                    </span>
                    <i aria-hidden="true" />
                    <span className="txt">
                      {row.eventId === undefined ? (
                        row.text
                      ) : (
                        <Link to={{ kind: 'event', id: row.eventId }} className="pp-ln plain">
                          {row.text}
                        </Link>
                      )}
                      {row.members && (
                        <button
                          type="button"
                          className="pp-fold"
                          aria-expanded={open}
                          onClick={() =>
                            setUnfolded((old) => {
                              const next = new Set(old);
                              if (next.has(row.key)) next.delete(row.key);
                              else next.add(row.key);
                              return next;
                            })
                          }
                        >
                          {open ? 'Hide' : `Show all ${row.members.length}`}
                        </button>
                      )}
                    </span>
                  </li>
                );
                return [
                  line(r, k === 0),
                  ...(open ? (r.members ?? []).map((m) => line(m, false, true)) : []),
                ];
              })}
            </ol>
          )}
          {tab === 'family' && <FamilyTab world={world} person={person} />}
          {tab === 'magic' && magic && <MagicTab person={person} magic={magic} />}
          {tab === 'deeds' &&
            (deeds.length === 0 ? (
              <p className="pp-empty">No deeds on record.</p>
            ) : (
              deeds.map((g) => (
                <div key={g.id} className="pp-group">
                  <h2>{g.label}</h2>
                  <ul>
                    {g.events.map((e) => (
                      <DeedLine key={e.id} event={e} title={titleOf(e)} text={textOf(e)} />
                    ))}
                  </ul>
                </div>
              ))
            ))}
          {tab === 'rivals' &&
            (rivals.length === 0 ? (
              <p className="pp-empty">No rivals on record.</p>
            ) : (
              <ul className="pp-people">
                {rivals.map((r) => (
                  <PersonLine key={r.person.id} person={r.person} note={r.why} />
                ))}
              </ul>
            ))}
          {tab === 'all' && (
            <div className="pp-records">
              <AllEvents ids={events.map((e) => e.id)} />
            </div>
          )}
        </section>
        <aside className="pp-side" aria-label="At a glance">
          {(family.spouses.length > 0 ||
            family.children.length > 0 ||
            family.parents.length > 0) && (
            <>
              <h3>Family</h3>
              <ul className="pp-people">
                {[
                  ...family.parents.map((p) => ({ p, note: p.sex === 'f' ? 'Mother' : 'Father' })),
                  ...family.spouses.map((p) => ({
                    p,
                    note: person.sex === 'f' ? 'Husband' : 'Wife',
                  })),
                ].map(({ p, note }) => (
                  <PersonLine key={`${note}${p.id}`} person={p} note={note} />
                ))}
                {family.children.length > 0 && (
                  <li className="pp-kids">
                    {family.children.map((c, k) => (
                      <span key={c.id}>
                        {k > 0 && ', '}
                        <Link to={{ kind: 'person', id: c.id }} className="pp-ln">
                          {c.name}
                        </Link>
                      </span>
                    ))}
                    <small>
                      {family.children.length} {plural(family.children.length, 'child', 'children')}
                    </small>
                  </li>
                )}
              </ul>
            </>
          )}
          {rivals.length > 0 && (
            <>
              <h3>Rivals</h3>
              <ul className="pp-people">
                {rivals.slice(0, 4).map((r) => (
                  <PersonLine key={r.person.id} person={r.person} note={r.why} />
                ))}
              </ul>
            </>
          )}
          <LivesAt
            world={world}
            person={person}
            watch={watch}
            onWatch={(site) => siteActions.watchTown(site, person.id)}
          />
        </aside>
      </div>
    </div>
  );
}

function WatchButton({
  watch,
  onWatch,
  primary,
}: {
  watch: WatchState | undefined;
  onWatch: (id: Id) => void;
  primary?: boolean;
}) {
  if (!watch) return null;
  return (
    <>
      <button
        type="button"
        className={primary ? 'pp-btn dark' : 'pp-btn'}
        disabled={watch.reason !== undefined}
        onClick={() => onWatch(watch.siteId)}
      >
        Watch {watch.name}
      </button>
      {watch.reason && (
        <small className="pp-why">
          {watch.reason}
          {watch.fallen && (
            <>
              {' \u00b7 '}
              <Link to={{ kind: 'site', id: watch.siteId }} className="pp-ln">
                See {watch.name} in Legends
              </Link>
            </>
          )}
        </small>
      )}
    </>
  );
}

function PersonLine({ person, note }: { person: Person; note: string }) {
  return (
    <li>
      <Link to={{ kind: 'person', id: person.id }} className="pp-mini">
        <Disc name={person.name} civId={person.civId ?? null} legend={false} />
        <span className="who">
          <b>{person.name}</b>
          <small>
            {note}
            {person.died !== undefined ? ` · died Year ${yearText(person.died)}` : ''}
          </small>
        </span>
      </Link>
    </li>
  );
}

function FamilyTab({ world, person }: { world: WorldState; person: Person }) {
  const family = familyOf(world, person);
  const kin = (f: Person, m: string, w: string) => (f.sex === 'f' ? w : m);
  const groups: [string, Person[], (p: Person) => string][] = [
    ['Parents', family.parents, (p) => kin(p, 'Father', 'Mother')],
    ['Brothers and sisters', family.siblings, (p) => kin(p, 'Brother', 'Sister')],
    [
      person.family.spouses.length > 1 ? 'Spouses' : 'Spouse',
      family.spouses,
      (p) => kin(p, 'Husband', 'Wife'),
    ],
    ['Children', family.children, (p) => kin(p, 'Son', 'Daughter')],
    ['Grandchildren', family.grandchildren, (p) => kin(p, 'Grandson', 'Granddaughter')],
  ];
  const { line } = family;
  if (groups.every(([, list]) => list.length === 0) && !line) {
    return <p className="pp-empty">No family on record.</p>;
  }
  return (
    <>
      {line && (
        <div className="pp-group">
          <h2>House</h2>
          <p className="pp-house">
            <Link to={{ kind: 'dynasty', id: line.id }} className="pp-ln big">
              {line.name}
            </Link>
            <small>
              Founded in Year {yearText(line.founded)}
              {line.founder && line.founder.id !== person.id && (
                <>
                  {' by '}
                  <Link to={{ kind: 'person', id: line.founder.id }} className="pp-ln">
                    {line.founder.name}
                  </Link>
                </>
              )}
              {line.founder?.id === person.id && ` by ${person.sex === 'f' ? 'her' : 'him'}`}{' '}
              {'\u00b7'} {line.members} {plural(line.members, 'person', 'people')} on record
            </small>
            <Link to={{ kind: 'dynasty', id: line.id }} className="pp-ln">
              See the family tree {'\u203a'}
            </Link>
          </p>
        </div>
      )}
      {groups.map(
        ([label, list, note]) =>
          list.length > 0 && (
            <div key={label} className="pp-group">
              <h2>{label}</h2>
              <ul className="pp-people">
                {list.map((p) => (
                  <PersonLine key={p.id} person={p} note={note(p)} />
                ))}
              </ul>
            </div>
          ),
      )}
    </>
  );
}

/** How a mage learned, their line of teachers, apprentices, spells and books (M5.2). */
function MagicTab({ person, magic }: { person: Person; magic: MagicRecord }) {
  const own = person.sex === 'f' ? 'her' : 'his';
  return (
    <>
      <div className="pp-group">
        <h2>Learning</h2>
        <p className="pp-house">
          <span>
            {magic.how}
            {magic.howName &&
              (magic.howTo ? (
                <>
                  {' '}
                  <Link to={magic.howTo} className="pp-ln">
                    {magic.howName}
                  </Link>
                </>
              ) : (
                ` ${magic.howName}`
              ))}
          </span>
          {magic.how !== 'Learned before the records begin' && (
            <small>From Year {yearText(magic.since)}</small>
          )}
        </p>
      </div>
      {magic.teachers.length > 1 && (
        <div className="pp-group">
          <h2>Later teachers</h2>
          <ul className="pp-people">
            {magic.teachers.slice(1).map((t) => (
              <PersonLine
                key={t.id}
                person={t}
                note={`Took ${person.sex === 'f' ? 'her' : 'him'} on later`}
              />
            ))}
          </ul>
        </div>
      )}
      {magic.line.length > 0 && (
        <div className="pp-group">
          <h2>Line of teachers</h2>
          <ul className="pp-people">
            {magic.line.map((t, k) => (
              <PersonLine
                key={t.id}
                person={t}
                note={k === 0 ? `Taught ${own} teacher` : `${k + 1} teachers back`}
              />
            ))}
          </ul>
        </div>
      )}
      <div className="pp-group">
        <h2>Spells</h2>
        {magic.spells.length === 0 ? (
          <p className="pp-empty">No spells learned.</p>
        ) : (
          <ul>
            {magic.spells.map((s) => (
              <li key={s.id}>
                <span className="yr">Year {yearText(s.year)}</span>
                <span className="txt">
                  <b>{s.name}</b> · {s.school}, {s.tier}
                  {s.from &&
                    (s.from.to ? (
                      <>
                        {' · '}
                        <Link to={s.from.to} className="pp-ln">
                          {s.from.text}
                        </Link>
                      </>
                    ) : (
                      ` · ${s.from.text}`
                    ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {magic.apprentices.length > 0 && (
        <div className="pp-group">
          <h2>Apprentices</h2>
          <ul className="pp-people">
            {magic.apprentices.map((a) => (
              <PersonLine key={a.id} person={a} note="Apprentice" />
            ))}
          </ul>
        </div>
      )}
      {magic.books.length > 0 && (
        <div className="pp-group">
          <h2>Spellbooks</h2>
          <ul>
            {magic.books.map((b) => (
              <li key={b.id}>
                <span className="txt">
                  <Link to={{ kind: 'item', id: b.id }} className="pp-ln">
                    {b.name}
                  </Link>{' '}
                  <small>{b.note}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

const SCROLL_PAD = 24;

/** The section tabs. On a phone they scroll: a fade marks more to the right, and the active tab stays in view. */
function TabStrip({
  tabs,
  tab,
  onTab,
}: {
  tabs: { id: Tab; label: string }[];
  tab: Tab;
  onTab: (tab: Tab) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const measure = () => {
    const el = strip.current;
    if (el) setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  };
  useEffect(() => {
    const el = strip.current;
    const on = el?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (el && on) {
      const left = on.offsetLeft - SCROLL_PAD;
      const right = on.offsetLeft + on.offsetWidth + SCROLL_PAD - el.clientWidth;
      if (left < el.scrollLeft) el.scrollLeft = Math.max(0, left);
      else if (right > el.scrollLeft) el.scrollLeft = right;
    }
    measure();
  }, [tab]);
  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  return (
    <div className={`pp-tabwrap${more ? ' more' : ''}`}>
      <div className="pp-tabs" role="tablist" aria-label="Sections" ref={strip} onScroll={measure}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => onTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function DeedLine({ event, title, text }: { event: SimEvent; title: string; text: string }) {
  return (
    <li>
      <span className="yr">Year {yearText(eventYear(event))}</span>
      <Link to={{ kind: 'event', id: event.id }} className="pp-ln">
        {title}
      </Link>
      <span className="txt">{text}</span>
    </li>
  );
}

function LivesAt({
  world,
  person,
  watch,
  onWatch,
}: {
  world: WorldState;
  person: Person;
  watch: WatchState | undefined;
  onWatch: (id: Id) => void;
}) {
  const { content, raceName } = useLegends();
  const site = person.siteId == null ? undefined : world.sites.get(person.siteId);
  if (!site) return null;
  const pop = site.pop.reduce((n, b) => n + b.count, 0);
  const top = [...site.pop].sort((a, b) => b.count - a.count)[0];
  const race = top
    ? (content.races.find((r) => r.id === top.raceId)?.name ?? raceName(top.raceId))
    : '';
  return (
    <div className="pp-card">
      <h3>{person.died === undefined ? 'Lives at' : 'Lived at'}</h3>
      <Link to={{ kind: 'site', id: site.id }} className="pp-ln big">
        {site.name}
      </Link>
      <p>
        {site.ruinedYear !== undefined
          ? `Fell in Year ${site.ruinedYear}`
          : `${race ? `${race} ${site.kind} · ` : ''}${pop.toLocaleString('en-GB')} people`}
      </p>
      {watch && watch.siteId === site.id && watch.reason === undefined && (
        <button type="button" className="pp-linkbtn" onClick={() => onWatch(site.id)}>
          Watch the town ›
        </button>
      )}
    </div>
  );
}
