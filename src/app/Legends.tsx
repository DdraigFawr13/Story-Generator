// The Legends pane (M2.7): search and lists of civs, sites, races, figures, families, beasts,
// artifacts and events; a page per entity with its M2.6 biography, facts and chronicle. Every name
// and year is a link, and every chronicle line can unfold the causes behind it, one level a click.

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  DAYS_PER_YEAR,
  biography,
  linkSegments,
  locate,
  type ContentBundle,
  type Id,
  type LegendIndex,
  type LegendRef,
  type Narrator,
  type SimEvent,
  type WorldState,
} from '../engine';

/** A page in the pane: any legend entity, a race (content only) or a single event. */
export type PageRef = LegendRef | { kind: 'race'; id: string } | { kind: 'event'; id: Id };

interface Props {
  world: WorldState;
  index: LegendIndex;
  narrator: Narrator;
  content: ContentBundle;
  /** The year slider's year: chronicle lines after it fade. */
  year: number;
  /** A page was opened: `cell` is where it is on the map, `eventYear` is set for event pages. */
  onOpen: (ref: PageRef, cell: number | null, eventYear?: number) => void;
  /** "Show on map" was pressed. */
  onShow: (cell: number) => void;
}

type CategoryId = 'civ' | 'site' | 'race' | 'person' | 'dynasty' | 'beast' | 'item' | 'event';
const CATEGORIES: { id: CategoryId; label: string; blurb: string }[] = [
  { id: 'civ', label: 'Civs', blurb: 'Peoples who ruled, oldest first' },
  { id: 'site', label: 'Sites', blurb: 'By peak population' },
  { id: 'race', label: 'Races', blurb: 'The peoples of this world' },
  { id: 'person', label: 'Figures', blurb: 'Most famous first' },
  { id: 'dynasty', label: 'Families', blurb: 'Founded lines' },
  { id: 'beast', label: 'Beasts', blurb: 'Lairs and monsters' },
  { id: 'item', label: 'Artifacts', blurb: 'Artifacts and books' },
  { id: 'event', label: 'Events', blurb: 'Importance 6 or more, greatest first' },
];
/** Events at or above this importance fill the Events list. */
const EVENT_LIST_MIN_IMPORTANCE = 6;
/** Most rows rendered in one list, and search hits shown per kind. */
const MAX_ROWS = 200;
const SEARCH_HITS = 12;
/** Famous figures shown on a race page. */
const RACE_FIGURES = 6;
/** Dynasty members named on its page before "and n more". */
const MEMBERS_SHOWN = 12;

interface Row {
  ref: PageRef;
  name: string;
  /** Plain (not bold) name, for event rows. */
  plain?: boolean;
  years: string;
  meta: string;
}

const yearOf = (event: SimEvent) => Math.floor(event.day / DAYS_PER_YEAR);
const sameRef = (a: PageRef, b: PageRef) => a.kind === b.kind && a.id === b.id;
const typeLabel = (type: string) => type.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const span = (from: number, to?: number) => (to === undefined ? `${from}–` : `${from}–${to}`);
const lived = (born: number, died?: number) =>
  died === undefined ? `b. ${born}` : `${born}–${died}`;
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function Legends({ world, index, narrator, content, year, onOpen, onShow }: Props) {
  const [category, setCategory] = useState<CategoryId>('civ');
  const [query, setQuery] = useState('');
  const [stack, setStack] = useState<PageRef[]>([]);
  const [showAll, setShowAll] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const page = stack.length > 0 ? stack[stack.length - 1]! : null;

  // Everything below depends on the world only through `index`, which is rebuilt per revision.
  const texts = useMemo(() => new Map<Id, string>(), [index, narrator]);
  const textOf = (event: SimEvent) => {
    let text = texts.get(event.id);
    if (text === undefined) {
      text = narrator.renderEvent(event);
      texts.set(event.id, text);
    }
    return text;
  };
  const raceName = (id: string) => content.races.find((race) => race.id === id)?.name ?? id;
  const nameOf = (ref: PageRef): string => {
    switch (ref.kind) {
      case 'civ':
        return world.civs.get(ref.id)?.name ?? '?';
      case 'site':
        return world.sites.get(ref.id)?.name ?? '?';
      case 'person':
        return world.people.get(ref.id)?.name ?? '?';
      case 'beast':
        return world.creatures.get(ref.id)?.name ?? '?';
      case 'item':
        return world.items.get(ref.id)?.name ?? '?';
      case 'dynasty':
        return world.dynasties.get(ref.id)?.name ?? '?';
      case 'race':
        return raceName(ref.id);
      case 'event':
        return `Year ${yearOf(index.event(ref.id)!)}`;
    }
  };

  const lists = useMemo(() => {
    const livePlaces = new Map<Id, number>();
    for (const site of world.sites.values()) {
      if (site.civId !== null) livePlaces.set(site.civId, (livePlaces.get(site.civId) ?? 0) + 1);
    }
    const civName = (id: Id | null | undefined) =>
      id == null ? undefined : world.civs.get(id)?.name;
    const civs: Row[] = [...world.civs.values()].map((civ) => ({
      ref: { kind: 'civ', id: civ.id },
      name: civ.name,
      years: span(civ.founded, civ.fell),
      meta: `${raceName(civ.raceId)} · ${livePlaces.get(civ.id) ?? 0} places`,
    }));
    const sites: Row[] = [...world.sites.values()]
      .sort((a, b) => b.peakPop - a.peakPop || a.id - b.id)
      .map((site) => ({
        ref: { kind: 'site', id: site.id },
        name: site.name,
        years: span(site.founded, site.ruinedYear),
        meta: `${site.kind} · ${civName(site.civId) ?? 'no people'}${
          site.ruinedYear === undefined ? '' : ' · ruin'
        } · peak ${site.peakPop}`,
      }));
    const races: Row[] = content.races.map((race) => ({
      ref: { kind: 'race', id: race.id },
      name: race.name,
      years: '',
      meta: `${[...world.civs.values()].filter((c) => c.raceId === race.id).length} civs · ${
        [...world.people.values()].filter((p) => p.raceId === race.id).length
      } figures`,
    }));
    const people: Row[] = [...world.people.values()]
      .sort((a, b) => b.fame - a.fame || a.id - b.id)
      .map((person) => {
        const civ = civName(person.civId);
        return {
          ref: { kind: 'person', id: person.id },
          name: person.name,
          years: lived(person.born, person.died),
          meta: `${person.title ?? 'notable'} · ${raceName(person.raceId)}${
            civ ? ` · ${civ}` : ''
          } · fame ${person.fame}`,
        };
      });
    const dynasties: Row[] = [...world.dynasties.values()].map((dynasty) => ({
      ref: { kind: 'dynasty', id: dynasty.id },
      name: dynasty.name,
      years: span(dynasty.founded),
      meta: `founded by ${world.people.get(dynasty.founderId)?.name ?? 'an unknown founder'}${
        civName(dynasty.civId) ? ` · ${civName(dynasty.civId)}` : ''
      }`,
    }));
    const beasts: Row[] = [...world.creatures.values()].map((beast) => ({
      ref: { kind: 'beast', id: beast.id },
      name: beast.name,
      years: lived(beast.born, beast.died),
      meta: content.creatures.find((def) => def.id === beast.defId)?.name ?? beast.defId,
    }));
    const items: Row[] = [...world.items.values()].map((item) => ({
      ref: { kind: 'item', id: item.id },
      name: item.name,
      years: `${item.made}`,
      meta: item.kind === 'book' ? `book · ${item.form}` : `artifact · ${item.form}`,
    }));
    return {
      civ: civs,
      site: sites,
      race: races,
      person: people,
      dynasty: dynasties,
      beast: beasts,
      item: items,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, content]);

  const ranked = useMemo(
    () =>
      world.events
        .filter((event) => event.type !== 'year_summary')
        .sort((a, b) => b.importance - a.importance || a.id - b.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index],
  );
  const eventRow = (event: SimEvent): Row => ({
    ref: { kind: 'event', id: event.id },
    name: textOf(event),
    plain: true,
    years: `${yearOf(event)}`,
    meta: `${typeLabel(event.type)} · importance ${event.importance}`,
  });
  const bigEvents = useMemo(
    () => ranked.filter((event) => event.importance >= EVENT_LIST_MIN_IMPORTANCE),
    [ranked],
  );
  const counts: Record<CategoryId, number> = {
    civ: lists.civ.length,
    site: lists.site.length,
    race: lists.race.length,
    person: lists.person.length,
    dynasty: lists.dynasty.length,
    beast: lists.beast.length,
    item: lists.item.length,
    event: bigEvents.length,
  };

  const open = (ref: PageRef) => {
    setStack((s) => (s.length > 0 && sameRef(s[s.length - 1]!, ref) ? s : [...s, ref]));
    setShowAll(false);
    if (ref.kind === 'event') {
      const event = index.event(ref.id);
      if (event) onOpen(ref, event.place, yearOf(event));
    } else {
      onOpen(ref, ref.kind === 'race' ? null : locate(world, ref));
    }
  };
  const pick = (id: CategoryId) => {
    setCategory(id);
    setQuery('');
    setStack([]);
  };

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [page?.kind, page?.id]);

  const needle = query.trim().toLowerCase();
  let crumbs: React.ReactNode;
  let content_: React.ReactNode;
  if (page) {
    const label = CATEGORIES.find(
      (c) => c.id === (page.kind === 'dynasty' ? 'dynasty' : page.kind),
    )?.label;
    crumbs = (
      <>
        <button type="button" onClick={() => setStack((s) => s.slice(0, -1))}>
          ← Back
        </button>
        <span>{label ?? 'Events'}</span>
        {stack.length > 1 && <span>· {stack.length - 1} back</span>}
      </>
    );
    content_ = (
      <div className="lg-page">
        <PageView
          page={page}
          world={world}
          index={index}
          content={content}
          narrator={narrator}
          year={year}
          showAll={showAll}
          onShowAll={setShowAll}
          textOf={textOf}
          nameOf={nameOf}
          raceName={raceName}
          open={open}
          onShow={onShow}
        />
      </div>
    );
  } else if (needle) {
    let total = 0;
    const groups = CATEGORIES.map(({ id, label }) => {
      const hits =
        id === 'event'
          ? ranked
              .filter((event) => textOf(event).toLowerCase().includes(needle))
              .slice(0, SEARCH_HITS)
              .map(eventRow)
          : lists[id]
              .filter((row) => row.name.toLowerCase().includes(needle))
              .slice(0, SEARCH_HITS);
      total += hits.length;
      return { id, label, hits };
    }).filter((group) => group.hits.length > 0);
    crumbs = `Search: ${total} matches`;
    content_ =
      groups.length > 0 ? (
        groups.map((group) => (
          <Fragment key={group.id}>
            <div className="lg-sect lg-group">{group.label}</div>
            <RowList rows={group.hits} open={open} />
          </Fragment>
        ))
      ) : (
        <p className="lg-empty">
          Nothing by that name. Try part of a name, a place or a word like “famine”.
        </p>
      );
  } else {
    crumbs = CATEGORIES.find((c) => c.id === category)!.blurb;
    const rows =
      category === 'event'
        ? bigEvents.slice(0, MAX_ROWS).map(eventRow)
        : lists[category].slice(0, MAX_ROWS);
    content_ = <RowList rows={rows} open={open} />;
  }

  return (
    <section className="lg-pane" aria-label="Legends">
      <header>
        <h2>Legends</h2>
        <input
          className="lg-search"
          type="search"
          placeholder="Search names and events"
          aria-label="Search legends"
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setStack([]);
          }}
        />
        <div className="lg-cats">
          {CATEGORIES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={!page && !needle && category === id}
              onClick={() => pick(id)}
            >
              {label}
              <span className="n">{counts[id]}</span>
            </button>
          ))}
        </div>
      </header>
      <div className="lg-crumbs">{crumbs}</div>
      <div className="lg-body" ref={bodyRef}>
        {content_}
      </div>
    </section>
  );
}

function RowList({ rows, open }: { rows: Row[]; open: (ref: PageRef) => void }) {
  return (
    <ul className="lg-list">
      {rows.map((row) => (
        <li key={`${row.ref.kind}:${row.ref.id}`}>
          <button type="button" onClick={() => open(row.ref)}>
            <span className={row.plain ? 'nm plain' : 'nm'}>{row.name}</span>
            <span className="yrs">{row.years}</span>
            <span className="meta">{row.meta}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Link({
  to,
  open,
  children,
  chip,
}: {
  to: PageRef;
  open: (ref: PageRef) => void;
  children: React.ReactNode;
  chip?: boolean;
}) {
  return (
    <button type="button" className={chip ? 'lg-ln lg-chip' : 'lg-ln'} onClick={() => open(to)}>
      {children}
    </button>
  );
}

interface PageProps {
  page: PageRef;
  world: WorldState;
  index: LegendIndex;
  content: ContentBundle;
  narrator: Narrator;
  year: number;
  showAll: boolean;
  onShowAll: (all: boolean) => void;
  textOf: (event: SimEvent) => string;
  nameOf: (ref: PageRef) => string;
  raceName: (id: string) => string;
  open: (ref: PageRef) => void;
  onShow: (cell: number) => void;
}

function PageView(props: PageProps) {
  const { page, world, index, content, year, open, onShow } = props;
  if (page.kind === 'event') return <EventPage {...props} page={page} />;
  if (page.kind === 'race') return <RacePage {...props} page={page} />;

  const ref: LegendRef = page;
  const bio = biography(world, content, props.narrator, index, ref);
  const cell = locate(world, ref);
  const facts: [string, React.ReactNode][] = [];
  const link = (to: PageRef, label: string) => (
    <Link to={to} open={open}>
      {label}
    </Link>
  );
  if (ref.kind === 'civ') {
    const civ = world.civs.get(ref.id)!;
    facts.push(
      ['Race', link({ kind: 'race', id: civ.raceId }, props.raceName(civ.raceId))],
      [
        'Capital',
        link({ kind: 'site', id: civ.capital }, world.sites.get(civ.capital)?.name ?? '?'),
      ],
      ['Years', civ.fell === undefined ? `${civ.founded} to now` : `${civ.founded}–${civ.fell}`],
    );
  } else if (ref.kind === 'site') {
    const site = world.sites.get(ref.id)!;
    const owner = site.civId === null ? undefined : world.civs.get(site.civId);
    facts.push(
      ['Kind', site.kind],
      ['Held by', owner ? link({ kind: 'civ', id: owner.id }, owner.name) : 'no people'],
      ['Founded', site.founded],
      ['Ruined', site.ruinedYear ?? '—'],
      ['Peak', site.peakPop],
    );
  } else if (ref.kind === 'person') {
    const person = world.people.get(ref.id)!;
    facts.push(
      ['Role', person.title ?? 'notable'],
      ['Race', link({ kind: 'race', id: person.raceId }, props.raceName(person.raceId))],
      [
        'Lived',
        person.died === undefined ? `born ${person.born}, alive` : lived(person.born, person.died),
      ],
    );
    const civ = person.civId == null ? undefined : world.civs.get(person.civId);
    if (civ) facts.push(['Serves', link({ kind: 'civ', id: civ.id }, civ.name)]);
    const house =
      person.dynastyId === undefined ? undefined : world.dynasties.get(person.dynastyId);
    if (house) facts.push(['Family', link({ kind: 'dynasty', id: house.id }, house.name)]);
    facts.push(['Fame', person.fame]);
  } else if (ref.kind === 'dynasty') {
    const dynasty = world.dynasties.get(ref.id)!;
    const members = [...world.people.values()].filter((p) => p.dynastyId === dynasty.id);
    facts.push(
      [
        'Founder',
        link(
          { kind: 'person', id: dynasty.founderId },
          world.people.get(dynasty.founderId)?.name ?? '?',
        ),
      ],
      ['Founded', dynasty.founded],
      [
        'Members',
        <>
          {members.slice(0, MEMBERS_SHOWN).map((p, k) => (
            <Fragment key={p.id}>
              {k > 0 && ', '}
              {link({ kind: 'person', id: p.id }, p.name)}
            </Fragment>
          ))}
          {members.length > MEMBERS_SHOWN && ` and ${members.length - MEMBERS_SHOWN} more`}
        </>,
      ],
    );
  } else if (ref.kind === 'beast') {
    const beast = world.creatures.get(ref.id)!;
    facts.push(
      ['Kind', content.creatures.find((def) => def.id === beast.defId)?.name ?? beast.defId],
      ['Lived', lived(beast.born, beast.died)],
    );
  } else {
    const item = world.items.get(ref.id)!;
    facts.push(['Kind', `${item.kind} · ${item.form}`], ['Made', item.made]);
    const holder = item.holder === null ? undefined : world.people.get(item.holder);
    if (holder) facts.push(['Held by', link({ kind: 'person', id: holder.id }, holder.name)]);
  }

  const all = index.events(ref);
  const label =
    ref.kind === 'item'
      ? 'Artifact'
      : ref.kind === 'person'
        ? 'Figure'
        : ref.kind === 'dynasty'
          ? 'Family'
          : typeLabel(ref.kind);
  const lines = props.showAll ? all : bio.lines.map((line) => line.eventId);
  return (
    <>
      <div>
        <div className="lg-kind">{label}</div>
        <h3>{bio.name}</h3>
      </div>
      {bio.summary.length > 0 && <p className="lg-summary">{bio.summary.join(' ')}</p>}
      <dl className="lg-facts">
        {facts.map(([term, value]) => (
          <Fragment key={term}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </Fragment>
        ))}
      </dl>
      {cell !== null && (
        <div className="lg-actions">
          <button type="button" onClick={() => onShow(cell)}>
            Show on map
          </button>
        </div>
      )}
      <div className="lg-sect">
        <span>
          {props.showAll ? 'Every event' : 'Highlights'} · {lines.length} of {all.length}
        </span>
        <label>
          <input
            type="checkbox"
            checked={props.showAll}
            onChange={(event) => props.onShowAll(event.target.checked)}
          />{' '}
          every event
        </label>
      </div>
      <Chronicle ids={lines} {...props} year={year} empty="No chronicle lines of note." />
    </>
  );
}

function Chronicle({
  ids,
  empty,
  nested,
  ...props
}: PageProps & { ids: readonly Id[]; empty: string; nested?: boolean }) {
  if (ids.length === 0) return <p className="lg-empty flush">{empty}</p>;
  return (
    <ul className={nested ? 'lg-tree' : 'lg-chron'}>
      {ids.map((id) => (
        <EventLine key={id} id={id} {...props} />
      ))}
    </ul>
  );
}

/** One chronicle line: year button, linked names, and a "why?" that unfolds its causes. */
function EventLine({ id, ...props }: PageProps & { id: Id }) {
  const { index, year, open, textOf } = props;
  const [unfolded, setUnfolded] = useState(false);
  const event = index.event(id);
  if (!event) return null;
  const when = yearOf(event);
  const segments = linkSegments(
    textOf(event),
    index.refs(id).map((ref) => ({ ref, name: props.nameOf(ref) })),
  );
  const causes = event.causes.filter((cause) => index.event(cause) !== undefined);
  return (
    <li className={when > year ? 'lg-ev future' : 'lg-ev'}>
      <span className="y">
        <button type="button" title="Open this event" onClick={() => open({ kind: 'event', id })}>
          {when}
        </button>
      </span>
      <span className="txt">
        {segments.map((segment, k) =>
          segment.ref ? (
            <Link key={k} to={segment.ref} open={open}>
              {segment.text}
            </Link>
          ) : (
            <Fragment key={k}>{segment.text}</Fragment>
          ),
        )}
        {causes.length > 0 && (
          <button
            type="button"
            className="lg-why"
            aria-expanded={unfolded}
            onClick={() => setUnfolded(!unfolded)}
          >
            why?{causes.length > 1 ? ` (${causes.length})` : ''}
          </button>
        )}
        {unfolded && <Chronicle {...props} ids={causes} empty="" nested />}
      </span>
    </li>
  );
}

function EventPage(props: PageProps & { page: { kind: 'event'; id: Id } }) {
  const { page, world, index, open, onShow, textOf } = props;
  const event = index.event(page.id);
  if (!event) return <p className="lg-empty">That event is not in the record.</p>;
  const site = [...world.sites.values()].find(
    (s) => event.place !== null && s.cell === event.place,
  );
  const led = index.effects(event.id);
  const causes = event.causes.filter((id) => index.event(id) !== undefined);
  const segments = linkSegments(
    textOf(event),
    index.refs(event.id).map((ref) => ({ ref, name: props.nameOf(ref) })),
  );
  return (
    <>
      <div>
        <div className="lg-kind">Event · {typeLabel(event.type)}</div>
        <h3>Year {yearOf(event)}</h3>
      </div>
      <p className="lg-summary">
        {segments.map((segment, k) =>
          segment.ref ? (
            <Link key={k} to={segment.ref} open={open}>
              {segment.text}
            </Link>
          ) : (
            <Fragment key={k}>{segment.text}</Fragment>
          ),
        )}
      </p>
      <dl className="lg-facts">
        <dt>Importance</dt>
        <dd>{event.importance}</dd>
        {site && (
          <>
            <dt>Place</dt>
            <dd>
              <Link to={{ kind: 'site', id: site.id }} open={open}>
                {site.name}
              </Link>
            </dd>
          </>
        )}
      </dl>
      {event.place !== null && (
        <div className="lg-actions">
          <button type="button" onClick={() => onShow(event.place!)}>
            Show on map
          </button>
        </div>
      )}
      <div className="lg-sect">
        Why it happened · {causes.length} {plural(causes.length, 'cause', 'causes')}
      </div>
      <Chronicle {...props} ids={causes} empty="Nothing earlier caused this; it began here." />
      <div className="lg-sect">What it led to · {led.length}</div>
      <Chronicle {...props} ids={led} empty="Nothing recorded followed from it." />
    </>
  );
}

function RacePage(props: PageProps & { page: { kind: 'race'; id: string } }) {
  const { page, world, content, open } = props;
  const race = content.races.find((r) => r.id === page.id);
  if (!race) return <p className="lg-empty">Unknown race.</p>;
  const biomes = race.preferredBiomes
    .map((id) => content.biomes.find((b) => b.id === id)?.name ?? id)
    .join(', ');
  const civs = [...world.civs.values()].filter((civ) => civ.raceId === race.id);
  const famous = [...world.people.values()]
    .filter((p) => p.raceId === race.id)
    .sort((a, b) => b.fame - a.fame || a.id - b.id)
    .slice(0, RACE_FIGURES);
  return (
    <>
      <div>
        <div className="lg-kind">Race</div>
        <h3>{race.name}</h3>
      </div>
      <dl className="lg-facts">
        <dt>Lifespan</dt>
        <dd>about {race.lifespanYears} years</dd>
        <dt>Fertility</dt>
        <dd>{race.fertility}</dd>
        <dt>Favours</dt>
        <dd>{biomes || 'no biome in particular'}</dd>
      </dl>
      <div className="lg-sect">Civs · {civs.length}</div>
      <div className="lg-chips">
        {civs.length > 0 ? (
          civs.map((civ) => (
            <Link key={civ.id} chip to={{ kind: 'civ', id: civ.id }} open={open}>
              {civ.name}
            </Link>
          ))
        ) : (
          <span className="lg-empty flush">None in this world.</span>
        )}
      </div>
      <div className="lg-sect">Most famous</div>
      <ul className="lg-list">
        {famous.map((person) => (
          <li key={person.id}>
            <button type="button" onClick={() => open({ kind: 'person', id: person.id })}>
              <span className="nm">{person.name}</span>
              <span className="yrs">{lived(person.born, person.died)}</span>
              <span className="meta">
                {person.title ?? 'notable'} · fame {person.fame}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
