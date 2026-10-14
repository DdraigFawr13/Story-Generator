// The People room: an index of the world's notable figures and a personal page for each. It sits
// inside the Legends context, so every name, town and event links to the same pages Legends uses,
// and the chronicle is the one Legends shows. It only reads what the history logged.

import { useMemo, useState } from 'react';
import { civColor } from '../../content';
import {
  eventYear,
  yearText,
  type Id,
  type Person,
  type SimEvent,
  type WorldState,
} from '../../engine';
import { AllEvents } from '../LegendPages';
import { RoomShell, type RoomId } from '../rooms/Rooms';
import { Link, plural, useLegends } from '../legends-ctx';
import {
  PERSON_FILTERS,
  rolesOf,
  chipsOf,
  deedsOf,
  familyOf,
  filterRows,
  indexRows,
  lifeRows,
  rivalsOf,
  watchOf,
  type IndexRow,
  type PersonFilter,
  type WatchState,
} from './data';
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
}

/** Index rows shown at a time; a button reveals the next window. */
const WINDOW = 80;

export function PeopleRoom({ person, onRoom, onFollow, onIndex }: Props) {
  const { world } = useLegends();
  const found = person === null ? undefined : world.people.get(person);
  return (
    <RoomShell current="people" onRoom={onRoom} className="pp-root" data-testid="people">
      <main className="pp-main">
        {found ? (
          <PersonPage key={found.id} person={found} onFollow={onFollow} onIndex={onIndex} />
        ) : (
          <PeopleIndex />
        )}
      </main>
    </RoomShell>
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
  const [limit, setLimit] = useState(WINDOW);
  const shown = useMemo(() => filterRows(rows, chips, q), [rows, chips, q]);
  const toggle = (id: PersonFilter) => {
    setLimit(WINDOW);
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
        <p>
          {shown.length.toLocaleString('en-GB')} of {rows.length.toLocaleString('en-GB')} notable
          figures, the most famous first
        </p>
        <input
          type="search"
          className="pp-search"
          placeholder="Search names, realms and roles"
          aria-label="Search people"
          autoComplete="off"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setLimit(WINDOW);
          }}
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
        </ul>
      )}
      {shown.length > limit && (
        <button type="button" className="pp-more" onClick={() => setLimit(limit + WINDOW)}>
          Show {WINDOW} more ({limit} of {shown.length})
        </button>
      )}
    </div>
  );
}

function Row({ row }: { row: IndexRow }) {
  return (
    <li>
      <Link to={{ kind: 'person', id: row.id }} className="pp-row">
        <Disc name={row.name} civId={row.civId} legend={row.legend} />
        <span className="who">
          <b>{row.name}</b>
          <span className="role">{row.role}</span>
        </span>
        <span className="when">
          {row.years}
          <small>{row.realm}</small>
        </span>
      </Link>
    </li>
  );
}

type Tab = 'life' | 'family' | 'deeds' | 'rivals' | 'all';

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
    () => lifeRows(world, person, events, textOf),
    [world, person, events, textOf],
  );
  const deeds = useMemo(() => deedsOf(events), [events]);
  const family = familyOf(world, person);
  const rivals = rivalsOf(world, person);
  const watch = watchOf(world, person, siteActions.enabled);
  const tabs: { id: Tab; label: string }[] = [
    { id: 'life', label: 'Life' },
    { id: 'family', label: 'Family' },
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
          <WatchButton watch={watch} onWatch={siteActions.watch} primary />
          <button
            type="button"
            className="pp-btn"
            onClick={() => onFollow({ id: person.id, name: person.name })}
          >
            Follow {person.sex === 'f' ? 'her' : 'his'} story
          </button>
        </div>
      </header>
      <div className="pp-tabs" role="tablist" aria-label="Sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="pp-body">
        <section
          className="pp-panel"
          role="tabpanel"
          aria-label={tabs.find((t) => t.id === tab)!.label}
        >
          {tab === 'life' && (
            <ol className="pp-life">
              {life.map((r, k) => (
                <li key={r.key} className={r.gold ? 'gold' : undefined}>
                  <span className="age">
                    <b>{k === 0 ? `Age ${r.age}` : r.age}</b>
                    <small>Year {yearText(r.year)}</small>
                  </span>
                  <i aria-hidden="true" />
                  <span className="txt">
                    {r.eventId === undefined ? (
                      r.text
                    ) : (
                      <Link to={{ kind: 'event', id: r.eventId }} className="pp-ln plain">
                        {r.text}
                      </Link>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {tab === 'family' && <FamilyTab world={world} person={person} />}
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
          <LivesAt world={world} person={person} watch={watch} onWatch={siteActions.watch} />
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
      {watch.reason && <small className="pp-why">{watch.reason}</small>}
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
  const groups: [string, Person[]][] = [
    ['Parents', family.parents],
    [person.family.spouses.length > 1 ? 'Spouses' : 'Spouse', family.spouses],
    ['Children', family.children],
  ];
  if (groups.every(([, list]) => list.length === 0)) {
    return <p className="pp-empty">No family on record.</p>;
  }
  return (
    <>
      {groups.map(
        ([label, list]) =>
          list.length > 0 && (
            <div key={label} className="pp-group">
              <h2>{label}</h2>
              <ul className="pp-people">
                {list.map((p) => (
                  <PersonLine
                    key={p.id}
                    person={p}
                    note={
                      label === 'Children'
                        ? p.sex === 'f'
                          ? 'Daughter'
                          : 'Son'
                        : label === 'Parents'
                          ? p.sex === 'f'
                            ? 'Mother'
                            : 'Father'
                          : p.sex === 'f'
                            ? 'Wife'
                            : 'Husband'
                    }
                  />
                ))}
              </ul>
            </div>
          ),
      )}
    </>
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
