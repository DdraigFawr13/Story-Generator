// The four tabs of the site pane (M3.1): Inspect, Site, People and Chronicle. Every person is shown
// by display name (`residentNames`), every household by `householdLabel`. Chronicle lines reuse the
// Legends helpers (biography, linkSegments, importanceStars, eventTitle).

import { Fragment, useState, type ReactNode } from 'react';
import {
  ATTRIBUTE_KEYS,
  DAY_BLOCKS,
  biography,
  dateOf,
  eventTitle,
  eventYear,
  fillTemplate,
  foodDaysLeft,
  householdLabel,
  importanceStars,
  linkSegments,
  MONTH_NAMES,
  residentNames,
  siteTemperature,
  sitePopulation,
  tierOfPower,
  yearText,
  type Activity,
  type ActiveSite,
  type BreakdownKind,
  type Building,
  type Civ,
  type ContentBundle,
  type CultureDef,
  type EventTypeDef,
  type Household,
  type Id,
  type LegendIndex,
  type LegendRef,
  type Narrator,
  type Person,
  type Site,
  type TierId,
  type WorldState,
} from '../engine';
import { plainClick, refName, type PageRef } from './legends-ctx';
import {
  buildScene,
  buildingLabel,
  relation,
  rulerWord,
  tileName,
  type PersonMark,
  type Scene,
  type Selection,
} from './site-render';

// ---- model ----

/** Everything the pane reads about the watched site, rebuilt when the world or its events change. */
export interface SiteModel {
  world: WorldState;
  content: ContentBundle;
  active: ActiveSite;
  scene: Scene;
  site: Site;
  civ: Civ | undefined;
  culture: CultureDef | undefined;
  names: ReadonlyMap<Id, string>;
  labels: ReadonlyMap<Id, string>;
  index: LegendIndex;
  narrator: Narrator;
  /** Everyone at the site, followed or counted. */
  total: number;
  ruler: Person | undefined;
  ruleWord: string;
  /** Day watching began. */
  startDay: number;
  typeDefs: ReadonlyMap<string, EventTypeDef>;
}

export function createSiteModel(
  world: WorldState,
  content: ContentBundle,
  index: LegendIndex,
  narrator: Narrator,
): SiteModel {
  const active = world.activeSite;
  if (!active) throw new Error('No site is being watched.');
  const site = world.sites.get(active.siteId)!;
  const civ = site.civId === null ? undefined : world.civs.get(site.civId);
  const culture = content.cultures.find((c) => c.id === civ?.cultureId);
  const names = residentNames(world, active.residents);
  const labels = new Map<Id, string>();
  for (const h of active.households.values()) labels.set(h.id, householdLabel(world, h, names));
  const ruleWord = rulerWord(culture?.government);
  const scene = buildScene(world, content.site, names, content.races, ruleWord === 'jarl');
  return {
    world,
    content,
    active,
    scene,
    site,
    civ,
    culture,
    names,
    labels,
    index,
    narrator,
    total: sitePopulation(site),
    ruler: civ?.rulerId === undefined ? undefined : world.people.get(civ.rulerId),
    ruleWord,
    startDay: active.enteredDay,
    typeDefs: new Map(content.eventTypes.map((d) => [d.id, d])),
  };
}

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "a", "a and b", "a, b and c". */
export function joinList(items: readonly string[]): string {
  return items.length < 2
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** "the jarl's household, every living notable, then the homes nearest the hall: the hall quarter". */
export function followedWording(ruleWord: string): string {
  const lead = ruleWord === 'jarl' ? "the jarl's household" : "the ruler's household";
  return `${lead}, every living notable, then the homes nearest the hall: the hall quarter`;
}

/** "5 Thawmonth, Year 250" for a day. */
export function dayText(day: number): string {
  const date = dateOf(day);
  return `${date.dayOfMonth} ${MONTH_NAMES[date.month]}, Year ${date.year - 1}`;
}
function shortDay(day: number): string {
  const date = dateOf(day);
  return `${date.dayOfMonth} ${MONTH_NAMES[date.month]!.slice(0, 4)} ${date.year - 1}`;
}

function householdName(m: SiteModel, h: Household): string {
  const label = m.labels.get(h.id) ?? 'A household';
  const hall = h.home !== null && m.active.buildings.get(h.home)?.defId === 'hall';
  return hall ? `${cap(m.ruleWord)}'s hall: ${label}` : label;
}

/** Name of what a selection points at, for the breadcrumb and the live line. */
export function selectionName(m: SiteModel, sel: Selection): string {
  if (sel.kind === 'person') return m.scene.marks.get(sel.id)?.name ?? 'Someone';
  if (sel.kind === 'household') {
    const h = m.active.households.get(sel.id);
    return h ? (m.labels.get(h.id) ?? 'Household') : 'Household';
  }
  if (sel.kind === 'building') {
    const b = m.active.buildings.get(sel.id);
    if (!b) return 'Building';
    if (b.defId === 'home') return homeLabel(m, b);
    return buildingLabel(m.content.site, b.defId, m.scene.jarl);
  }
  return `Tile ${sel.id % m.scene.size}, ${Math.floor(sel.id / m.scene.size)}`;
}

function homeLabel(m: SiteModel, b: Building): string {
  const h = homeHousehold(m, b);
  return h ? (m.labels.get(h.id) ?? 'Home') : 'Counted home';
}
function homeHousehold(m: SiteModel, b: Building): Household | undefined {
  for (const h of m.active.households.values()) if (h.home === b.id) return h;
  return undefined;
}

const ROLE_NOTE: Record<string, string> = {
  jarl: '',
  notable: 'notable',
  elder: 'elder',
  child: 'child',
  adult: '',
};
/** The aria-live line for a selection: "Ulla, elder". */
export function selectionAnnouncement(m: SiteModel, sel: Selection | null): string {
  if (!sel) return 'Selected: nothing';
  if (sel.kind === 'person') {
    const mark = m.scene.marks.get(sel.id);
    if (!mark) return 'Selected: someone';
    const note = mark.role === 'jarl' ? m.ruleWord : (ROLE_NOTE[mark.role] ?? '');
    return `Selected: ${mark.name}${note ? `, ${note}` : ''}`;
  }
  return `Selected: ${selectionName(m, sel)}`;
}

/** The line a tooltip shows for a tile. */
export function tipText(m: SiteModel, k: number): string {
  const ids = m.scene.at.get(k);
  if (ids) {
    return ids
      .map((id) => {
        const mark = m.scene.marks.get(id)!;
        return `${mark.name}, ${mark.age}`;
      })
      .join(' · ');
  }
  const b = m.scene.look.map.building[k]
    ? m.active.buildings.get(m.scene.look.map.building[k]!)
    : undefined;
  if (b?.defId === 'home') {
    const h = homeHousehold(m, b);
    return h ? `Home: ${m.labels.get(h.id) ?? ''}` : 'Home of a counted household';
  }
  return tileName(m.scene.look, k, 'the river', 'the sea');
}

// ---- pane state (kept while tabs change) ----

export interface PaneUi {
  q: string;
  setQ(q: string): void;
  sort: 'household' | 'name' | 'age';
  setSort(sort: PaneUi['sort']): void;
  filters: ReadonlySet<string>;
  toggleFilter(key: string): void;
  mode: 'highlights' | 'all';
  setMode(mode: PaneUi['mode']): void;
  floor: number;
  setFloor(n: number): void;
  hidden: ReadonlySet<string>;
  toggleGroup(id: string): void;
  why: ReadonlySet<string>;
  toggleWhy(key: string): void;
  limit: number;
  more(): void;
}

function toggled<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (!next.delete(value)) next.add(value);
  return next;
}

/** Items shown in a chronicle list before "Show more". */
const CHRONICLE_WINDOW = 200;

export function usePaneUi(): PaneUi {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<PaneUi['sort']>('household');
  const [filters, setFilters] = useState<ReadonlySet<string>>(new Set());
  const [mode, setMode] = useState<PaneUi['mode']>('highlights');
  const [floor, setFloor] = useState(0);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [why, setWhy] = useState<ReadonlySet<string>>(new Set());
  const [limit, setLimit] = useState(CHRONICLE_WINDOW);
  return {
    q,
    setQ,
    sort,
    setSort,
    filters,
    toggleFilter: (key) => setFilters((f) => toggled(f, key)),
    mode,
    setMode: (next) => {
      setMode(next);
      setLimit(CHRONICLE_WINDOW);
    },
    floor,
    setFloor,
    hidden,
    toggleGroup: (id) => setHidden((h) => toggled(h, id)),
    why,
    toggleWhy: (key) => setWhy((w) => toggled(w, key)),
    limit,
    more: () => setLimit((n) => n + CHRONICLE_WINDOW),
  };
}

export interface PanelActions {
  /** Select and centre on the map. */
  select(sel: Selection): void;
  /** "Show on map": centre without leaving the pane's tab. */
  showOnMap(sel: Selection): void;
  /** Leave the site and open a Legends page. */
  openLegends(ref: PageRef): void;
  hrefOf(ref: PageRef): string;
}

interface PanelProps {
  m: SiteModel;
  sel: Selection | null;
  a: PanelActions;
  ui: PaneUi;
}

// ---- small pieces ----

/** A link to a resident: selects them on the map. */
function PersonLink({
  m,
  a,
  sel,
  id,
  extra,
}: {
  m: SiteModel;
  a: PanelActions;
  sel: Selection | null;
  id: Id;
  extra?: ReactNode;
}) {
  const mark = m.scene.marks.get(id);
  if (!mark) return <span className="empty">someone not at the site</span>;
  const person = m.world.people.get(id);
  const notable = mark.role === 'notable' || mark.role === 'jarl';
  const selected = sel?.kind === 'person' && sel.id === id;
  const go = () => a.select({ kind: 'person', id });
  return (
    <a
      className={`pp${notable ? ' notable' : ''}${selected ? ' sel' : ''}`}
      role="link"
      tabIndex={0}
      data-name={mark.name}
      aria-current={selected ? 'true' : undefined}
      onClick={go}
      onKeyDown={(event) => {
        if (event.key === 'Enter') go();
      }}
    >
      {mark.name}
      {mark.gifted && person && (
        <span className="gift" title="gifted or stronger in magic">
          ✦
        </span>
      )}
      {extra}
    </a>
  );
}

/** A link to a Legends page (leaves the site); a real anchor so copy-link works. */
function LegendsLink({ a, to, children }: { a: PanelActions; to: PageRef; children: ReactNode }) {
  return (
    <a
      className="ln"
      href={a.hrefOf(to)}
      title="Opens in Legends"
      onClick={(event) => plainClick(event, () => a.openLegends(to))}
    >
      {children}
    </a>
  );
}

function SelectLink({ a, to, children }: { a: PanelActions; to: Selection; children: ReactNode }) {
  const go = () => a.select(to);
  return (
    <a
      className="ln"
      role="link"
      tabIndex={0}
      onClick={go}
      onKeyDown={(event) => {
        if (event.key === 'Enter') go();
      }}
    >
      {children}
    </a>
  );
}

function Facts({ children }: { children: ReactNode }) {
  return <dl className="facts">{children}</dl>;
}
function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt>{term}</dt>
      <dd>{children}</dd>
    </>
  );
}

/** How a notable's role reads in the Known-as row. */
const TITLE_TEXT: Record<string, string> = {
  kin: 'kin of the ruling house',
  crafter: 'master crafter',
};

const TIER_TEXT: Record<TierId, string> = {
  none: 'none',
  faint: 'faint: a knack, no spells without teaching',
  gifted: 'gifted: could learn cantrips from a teacher',
  strong: 'strong: rare, one in a few hundred',
  exceptional: 'exceptional',
  legendary: 'legendary',
};

// ---- Chronicle lines ----

function EventItem({
  m,
  a,
  ui,
  id,
  path,
  label,
}: {
  m: SiteModel;
  a: PanelActions;
  ui: PaneUi;
  id: Id;
  /** Identity of this line in the unfolded set. */
  path: string;
  /** Replaces the year column (watched days). */
  label?: string;
}) {
  const event = m.index.event(id);
  if (!event) return null;
  const text = m.narrator.renderEvent(event);
  const segments = linkSegments(
    text,
    m.index.refs(id).map((ref) => ({ ref, name: refName(m.world, ref) })),
  );
  const causes = event.causes.filter((c) => m.index.event(c) !== undefined);
  const open = ui.why.has(path);
  const stars = importanceStars(event.importance);
  const causeWord = m.typeDefs.get(event.type)?.causeWord ?? 'because of';
  return (
    <li className="ev">
      <span className="y">{label ?? `Year ${yearText(eventYear(event))}`}</span>
      <span className="txt">
        <b>{eventTitle(event, m.typeDefs.get(event.type))}</b>
        {stars && (
          <>
            {' '}
            <span
              className="stars"
              role="img"
              title={`importance ${event.importance}`}
              aria-label={`importance ${event.importance}`}
            >
              {stars}
            </span>
          </>
        )}
        <br />
        {segments.map((segment, k) => {
          const ref = segment.ref;
          if (!ref) return <Fragment key={k}>{segment.text}</Fragment>;
          if (ref.kind === 'person' && m.scene.marks.has(ref.id)) {
            return (
              <a
                key={k}
                className="ln"
                role="link"
                tabIndex={0}
                onClick={() => a.select({ kind: 'person', id: ref.id })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') a.select({ kind: 'person', id: ref.id });
                }}
              >
                {segment.text}
              </a>
            );
          }
          return (
            <LegendsLink key={k} a={a} to={ref}>
              {segment.text}
            </LegendsLink>
          );
        })}
        {causes.length > 0 && (
          <>
            {' '}
            <button
              type="button"
              className="why"
              aria-expanded={open}
              onClick={() => ui.toggleWhy(path)}
            >
              {open ? 'hide why' : 'why?'}
            </button>
          </>
        )}
        {open && (
          <div className="causes">
            <div className="cw">{causeWord}</div>
            <ul className="chron">
              {causes.map((c) => (
                <EventItem key={c} m={m} a={a} ui={ui} id={c} path={`${path}>${c}`} />
              ))}
            </ul>
          </div>
        )}
      </span>
    </li>
  );
}

function LegendLines({
  m,
  a,
  ui,
  ids,
  prefix,
}: {
  m: SiteModel;
  a: PanelActions;
  ui: PaneUi;
  ids: readonly Id[];
  prefix: string;
}) {
  return (
    <ul className="chron">
      {ids.map((id) => (
        <EventItem key={id} m={m} a={a} ui={ui} id={id} path={`${prefix}${id}`} />
      ))}
    </ul>
  );
}

// ---- Inspect ----

// Presentation words for the engine's activities; the activity itself is the engine's result.
const ACTIVITY_VERB: Record<Activity, string> = {
  sleep: 'Sleeping',
  work: 'Working',
  play: 'Playing',
  eat: 'Eating',
  socialise: 'Socialising',
  worship: 'Worshipping',
  tantrum: 'In a tantrum',
  despair: 'In despair',
  wander: 'Wandered off',
  steal: 'Stealing',
};
/** One word for the People list. */
const ACTIVITY_SHORT: Record<Activity, string> = {
  sleep: 'asleep',
  work: 'working',
  play: 'playing',
  eat: 'eating',
  socialise: 'chatting',
  worship: 'worshipping',
  tantrum: 'raging',
  despair: 'in despair',
  wander: 'wandering',
  steal: 'stealing',
};
const BREAKDOWN_TEXT: Record<BreakdownKind, string> = {
  tantrum: 'A tantrum',
  despair: 'In despair',
  wandering: 'Wandering off',
  theft: 'Stealing',
};
const signed = (n: number) => `${n < 0 ? '−' : '+'}${Math.abs(Math.round(n))}`;

/** "Working in a field", "Sleeping at home": the activity and the place of the last block. */
function doingText(m: SiteModel, p: Person, homeId: Id | null): string {
  const detail = p.detail;
  if (!detail?.activity) return 'Not yet known';
  const verb = ACTIVITY_VERB[detail.activity];
  if (detail.activity === 'wander') return verb;
  const building = detail.placeId == null ? undefined : m.active.buildings.get(detail.placeId);
  if (!building) return `${verb} outdoors`;
  if (building.defId === 'home')
    return `${verb} ${building.id === homeId ? 'at home' : 'at a neighbour’s home'}`;
  if (building.defId === 'field') return `${verb} in a field`;
  if (building.defId === 'hall')
    return `${verb} in the ${m.ruleWord === 'jarl' ? "jarl's " : ''}hall`;
  return `${verb} at the ${building.defId}`;
}

/** Needs, mood, stress and traits (M3.2): what the engine stored, with its "why" parts. */
function LifePage({ m, p }: { m: SiteModel; p: Person }) {
  const detail = p.detail;
  if (!detail) return null;
  const { content, world } = m;
  const traits = p.traits.flatMap((id) => content.traits.find((t) => t.id === id) ?? []);
  const needs = content.needs.filter((n) => detail.needs[n.id] !== undefined);
  // The display of a content value: the stress at which this person's breakdown comes.
  const threshold = Math.round(
    traits.reduce((x, t) => x * t.breakdownAt, content.life.breakdownAt),
  );
  const nameOf = (id: Id | undefined) =>
    (id === undefined ? undefined : (m.names.get(id) ?? world.people.get(id)?.name)) ?? 'someone';
  const parts = [...(detail.moodParts ?? [])]
    .sort((x, y) => Math.abs(y.value) - Math.abs(x.value))
    .flatMap((part) => {
      if (Math.round(part.value) === 0) return [];
      let text: string | undefined;
      if (part.kind === 'need') {
        text = content.needs.find((n) => n.id === part.id)?.lowWord;
      } else if (part.kind === 'trait') {
        text = content.traits.find((t) => t.id === part.id)?.name.toLowerCase();
      } else {
        const memory = content.memories.find((d) => d.id === part.id);
        text = memory && fillTemplate(memory.text, { about: nameOf(part.about) });
      }
      return [
        {
          key: `${part.kind}:${part.id}:${part.about ?? ''}`,
          text: text ?? part.id,
          value: part.value,
        },
      ];
    });
  const ago = detail.lastAte === undefined ? undefined : world.day - detail.lastAte;
  const foodWhy =
    ago === undefined
      ? null
      : ago >= 2
        ? `Hungry: no meal for ${ago} days`
        : ago === 1
          ? 'Ate yesterday'
          : 'Ate today';
  const breakdown = detail.breakdown;
  return (
    <>
      <div className="sect">Needs</div>
      <div className="attrs" data-testid="needs">
        {needs.map((n) => {
          const value = Math.round(detail.needs[n.id]!);
          return (
            <Fragment key={n.id}>
              <span>
                {n.name}
                {value < n.lowAt && <span className="empty"> · {n.lowWord.toLowerCase()}</span>}
              </span>
              <span className="b">
                <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
              </span>
              <span className="v">{value}</span>
            </Fragment>
          );
        })}
      </div>
      {foodWhy && <p className="quiet">{foodWhy}</p>}
      <div className="sect">
        Mood <span className="r">{signed(detail.mood)}</span>
      </div>
      {parts.length > 0 ? (
        <ul className="quiet" style={{ margin: 0, paddingLeft: 18 }}>
          {parts.map((part) => (
            <li key={part.key}>
              {part.text} {signed(part.value)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="quiet">Nothing weighs on the mood.</p>
      )}
      <div className="sect">
        Stress{' '}
        <span className="r">
          {Math.round(detail.stress)} of {threshold}
        </span>
      </div>
      {breakdown && (
        <p className="quiet">
          {BREAKDOWN_TEXT[breakdown.kind]} until {dayText(breakdown.untilDay)}.
        </p>
      )}
      {traits.length > 0 && (
        <>
          <div className="sect">Traits</div>
          <p className="quiet">
            {traits.map((t, k) => (
              <Fragment key={t.id}>
                {k > 0 && ', '}
                <span title={t.description}>{t.name}</span>
              </Fragment>
            ))}
          </p>
        </>
      )}
    </>
  );
}

function PersonPage({ m, a, sel, ui, id }: PanelProps & { id: Id }) {
  const p = m.world.people.get(id);
  const mark = m.scene.marks.get(id);
  if (!p || !mark) return <p className="quiet">That person is no longer at the site.</p>;
  const h = m.active.households.get(p.family.householdId ?? -1);
  const home = h?.home == null ? undefined : m.active.buildings.get(h.home);
  const race = m.content.races.find((r) => r.id === p.raceId);
  const culture = m.content.cultures.find((c) => c.id === p.cultureId);
  const here = (ids: readonly Id[]) => ids.filter((x) => m.scene.marks.has(x));
  const spouses = here(p.family.spouses);
  const away = p.family.spouses.length - spouses.length;
  const notable = mark.role === 'notable' || mark.role === 'jarl';
  const bio = notable
    ? biography(m.world, m.content, m.narrator, m.index, { kind: 'person', id })
    : null;
  const she = p.sex === 'f';
  const kindWord = mark.band === 'child' ? 'child' : mark.band === 'elder' ? 'elder' : 'adult';
  const tier = tierOfPower(p.magic.power);
  const hallHome = home?.defId === 'hall';
  const summary =
    bio && bio.summary.length > 0
      ? cap(bio.summary.join(' '))
      : `${p.name} is a ${mark.age}-year-old ${race?.name ?? ''} ${
          mark.band === 'child' ? (she ? 'girl' : 'boy') : she ? 'woman' : 'man'
        } of ${m.site.name}. ${she ? 'She' : 'He'} joined the record when you began watching; history counted ${
          she ? 'her' : 'him'
        } but never named ${she ? 'her' : 'him'}.`;
  return (
    <div className="page">
      <div>
        <div className="kind">
          Person · {kindWord}
          {notable && (
            <>
              {' · '}
              <span style={{ color: 'var(--legend)' }}>
                {mark.role === 'jarl' ? m.ruleWord : 'notable'}
              </span>
            </>
          )}
        </div>
        <h3>{mark.name}</h3>
      </div>
      <p className="summary">{summary}</p>
      <Facts>
        <Fact term="Age">
          {mark.age} · {she ? 'female' : 'male'} · {race?.name}
          {culture ? `, ${culture.name}` : ''}
        </Fact>
        {notable && p.title && (
          <Fact term="Known as">
            {p.title === 'ruler' ? m.ruleWord : (TITLE_TEXT[p.title] ?? p.title)}
            {p.fame ? ` · fame ${p.fame}` : ''}
          </Fact>
        )}
        {h && (
          <Fact term="Household">
            <SelectLink a={a} to={{ kind: 'household', id: h.id }}>
              {householdName(m, h)}
            </SelectLink>{' '}
            · {h.members.length === 1 ? 'lives alone' : `${h.members.length} people`} ·{' '}
            {hallHome ? `the ${m.ruleWord}'s hall` : home ? `home ${home.id}` : 'no home'}
          </Fact>
        )}
        {(spouses.length > 0 || away > 0) && (
          <Fact term="Spouse">
            {spouses.map((s, k) => (
              <Fragment key={s}>
                {k > 0 && ', '}
                <PersonLink m={m} a={a} sel={sel} id={s} />
              </Fragment>
            ))}
            {away > 0 && (
              <span className="empty">
                {spouses.length > 0 ? '; ' : ''}
                {away} not living here
              </span>
            )}
          </Fact>
        )}
        {here(p.family.parents).length > 0 && (
          <Fact term="Parents">
            {here(p.family.parents).map((s, k) => (
              <Fragment key={s}>
                {k > 0 && ', '}
                <PersonLink m={m} a={a} sel={sel} id={s} />
              </Fragment>
            ))}
          </Fact>
        )}
        {here(p.family.children).length > 0 && (
          <Fact term="Children">
            {here(p.family.children).map((s, k) => (
              <Fragment key={s}>
                {k > 0 && ', '}
                <PersonLink m={m} a={a} sel={sel} id={s} />
              </Fragment>
            ))}
          </Fact>
        )}
        <Fact term="Magic">
          {p.magic.power > 0 ? (
            <>
              {TIER_TEXT[tier]} <span className="empty">(power {p.magic.power})</span>
            </>
          ) : (
            <span className="empty">none</span>
          )}
        </Fact>
        <Fact term="Doing">{doingText(m, p, h?.home ?? null)}</Fact>
      </Facts>
      <LifePage m={m} p={p} />
      <div className="actions">
        <button type="button" onClick={() => a.showOnMap({ kind: 'person', id })}>
          Show on map
        </button>
        {notable && (
          <button type="button" onClick={() => a.openLegends({ kind: 'person', id })}>
            Open in Legends
          </button>
        )}
      </div>
      {notable && (
        <>
          <div className="sect">From the legends</div>
          {bio && bio.lines.length > 0 ? (
            <LegendLines
              m={m}
              a={a}
              ui={ui}
              ids={bio.lines.map((line) => line.eventId)}
              prefix={`p${id}>`}
            />
          ) : (
            <p className="quiet">No recorded deeds yet.</p>
          )}
        </>
      )}
      <details>
        <summary>Attributes</summary>
        <div className="attrs" style={{ marginTop: 8 }}>
          {ATTRIBUTE_KEYS.map((key) => (
            <Fragment key={key}>
              <span>{cap(key)}</span>
              <span className="b">
                <i style={{ width: `${p.attributes[key] * 5}%` }} />
              </span>
              <span className="v">{p.attributes[key]}</span>
            </Fragment>
          ))}
        </div>
        <p className="quiet" style={{ marginTop: 6 }}>
          1–20, rolled from the race at promotion
          {notable ? ' (kept from history for notables)' : ''}.
        </p>
      </details>
    </div>
  );
}

function HouseholdPage({ m, a, sel, h }: Omit<PanelProps, 'ui'> & { h: Household }) {
  const head = m.world.people.get(h.head);
  const b = h.home === null ? undefined : m.active.buildings.get(h.home);
  const dynasties = [
    ...new Set(
      h.members.flatMap((id) => {
        const d = m.world.people.get(id)?.dynastyId;
        return d === undefined ? [] : [d];
      }),
    ),
  ];
  const parentsOf = (id: Id) => m.world.people.get(id)?.family.parents ?? [];
  const alone = h.members.length === 1;
  const inHall = b?.defId === 'hall';
  return (
    <div className="page">
      <div>
        <div className="kind">
          Household{inHall ? ` · the ${m.ruleWord}'s hall` : ''}
          {alone ? ' · lives alone' : ''}
        </div>
        <h3>{m.labels.get(h.id)}</h3>
      </div>
      <Facts>
        <Fact term="Home">
          {b ? (
            <>
              {inHall ? `The ${m.ruleWord}'s hall` : `Home ${b.id}`} · {b.w}×{b.h} tiles
            </>
          ) : (
            'none'
          )}
        </Fact>
        <Fact term="Members">
          {alone ? `1: ${m.names.get(h.head) ?? ''} lives alone` : h.members.length}
        </Fact>
        {m.culture && <Fact term="Custom">{m.culture.name}</Fact>}
      </Facts>
      <ul className="list">
        {h.members.map((id) => {
          const p = m.world.people.get(id);
          return (
            <li key={id} className="hh" style={{ padding: '4px 0' }}>
              <div className="ppl">
                <PersonLink
                  m={m}
                  a={a}
                  sel={sel}
                  id={id}
                  extra={<small> {m.scene.marks.get(id)?.age}</small>}
                />{' '}
                <span className="rel">
                  {head && p
                    ? relation(
                        {
                          id: head.id,
                          spouses: head.family.spouses,
                          children: head.family.children,
                          parents: head.family.parents,
                        },
                        {
                          id: p.id,
                          sex: p.sex,
                          spouses: p.family.spouses,
                          parents: p.family.parents,
                        },
                        parentsOf,
                      )
                    : ''}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="actions">
        <button type="button" onClick={() => a.showOnMap({ kind: 'household', id: h.id })}>
          Show on map
        </button>
        {dynasties.length > 0 && (
          <button
            type="button"
            onClick={() => a.openLegends({ kind: 'dynasty', id: dynasties[0]! })}
          >
            Family in Legends
          </button>
        )}
      </div>
    </div>
  );
}

const BUILDING_BLURB: Record<string, string> = {
  well: 'Fresh water for the whole village. Wells are the first thing the steward repairs (M3.3).',
  stockpile: "Holds the followed share of the village's goods. See the Site tab for counts.",
  shrine: 'The shrine of the faith. Festivals and funerals happen here from M3.7.',
  dock: 'Boats tie up here on the coast. Fishing and caravans by sea arrive with M3.3 and M3.10.',
  hall: 'Where the ruler lives and the village gathers.',
};

function BuildingPage({ m, a, sel, ui, b }: PanelProps & { b: Building }) {
  if (b.defId === 'home' || b.defId === 'hall') {
    const h = homeHousehold(m, b);
    if (h) return <HouseholdPage m={m} a={a} sel={sel} h={h} />;
    if (!b.followed || b.defId === 'home') return <CountedHomePage m={m} />;
  }
  void ui;
  return (
    <div className="page">
      <div>
        <div className="kind">Building</div>
        <h3>{buildingLabel(m.content.site, b.defId, m.scene.jarl)}</h3>
      </div>
      <p className="summary">{BUILDING_BLURB[b.defId] ?? ''}</p>
      <Facts>
        <Fact term="Size">
          {b.w}×{b.h} tiles
        </Fact>
        <Fact term="Condition">{b.condition} of 100</Fact>
      </Facts>
    </div>
  );
}

function CountedHomePage({ m }: { m: SiteModel }) {
  const { scene } = m;
  const per = scene.counted.length > 0 ? Math.round(scene.countedPeople / scene.counted.length) : 0;
  const followed = m.active.residents.length;
  return (
    <div className="page">
      <div>
        <div className="kind">
          Home <span className="badge counted">counted</span>
        </div>
        <h3>A counted household</h3>
      </div>
      <p className="summary">
        About {per} people live here as part of {m.site.name}&apos;s counts. They eat from the
        stores and are part of the population, but nobody is followed one by one.
      </p>
      <p className="quiet">
        You follow {followed} of {m.site.name}&apos;s {m.total} people:{' '}
        {followedWording(m.ruleWord)}. {scene.counted.length} homes like this hold the other{' '}
        {scene.countedPeople}. Phase 4 lets you switch which quarter you follow.
      </p>
    </div>
  );
}

function TilePage({ m, k }: { m: SiteModel; k: number }) {
  const { scene } = m;
  const map = scene.look.map;
  const x = k % scene.size;
  const y = Math.floor(k / scene.size);
  const code = scene.look.code;
  const wet =
    map.water[k]! === code.sea || map.water[k]! === code.river || map.water[k]! === code.lake;
  const cells = m.world.cells;
  const cellX =
    map.cellX + Math.floor((x - m.content.site.tilesPerCell / 2) / m.content.site.tilesPerCell);
  const cellY =
    map.cellY + Math.floor((y - m.content.site.tilesPerCell / 2) / m.content.site.tilesPerCell);
  const worldCell = cells
    ? Math.max(0, Math.min(cells.height - 1, cellY)) * cells.width +
      Math.max(0, Math.min(cells.width - 1, cellX))
    : 0;
  const soil = cells ? cells.fertility[worldCell] : undefined;
  const treeName = map.tree[k] ? m.content.site.trees[map.tree[k]!]?.name : undefined;
  return (
    <div className="page">
      <div>
        <div className="kind">
          Tile {x}, {y}
        </div>
        <h3>{tipText(m, k)}</h3>
      </div>
      <Facts>
        <Fact term="Elevation">{map.elevation[k]} m</Fact>
        {!wet && soil !== undefined && <Fact term="Soil">{soil} of 100</Fact>}
        {treeName && <Fact term="Timber">one tree ({treeName.replace(/ trees$/, '')})</Fact>}
        {map.mineral[k]! > 0 && (
          <Fact term="Stone">
            {map.mineral[k] === code.ore
              ? 'iron ore in the rock'
              : map.mineral[k] === code.clay
                ? 'clay'
                : 'stone'}
          </Fact>
        )}
        <Fact term="World cell">
          {cellX}, {cellY}
        </Fact>
      </Facts>
      <p className="quiet">
        Every tile comes from the world cell under it: height and soil from the cell&apos;s
        elevation and fertility, trees from its biome, the river and coast from its neighbours.
      </p>
    </div>
  );
}

export function InspectPane(props: PanelProps) {
  const { m, a, sel } = props;
  if (!sel) {
    return (
      <div className="page">
        <p className="quiet">
          Click or tap a tile, a building or a person on the map. People are discs showing the first
          letters of their name; the ring shows the role (open the Key under the map). With the
          keyboard, focus the map, move the cursor with the arrow keys and press Enter.
        </p>
        <div className="actions">
          {m.ruler && m.scene.marks.has(m.ruler.id) && (
            <button type="button" onClick={() => a.select({ kind: 'person', id: m.ruler!.id })}>
              Inspect the {m.ruleWord}, {m.scene.marks.get(m.ruler.id)!.name}
            </button>
          )}
          {[...m.active.buildings.values()]
            .filter((b) => b.defId === 'hall')
            .map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => a.select({ kind: 'building', id: b.id })}
              >
                The {m.ruleWord}&apos;s hall
              </button>
            ))}
        </div>
      </div>
    );
  }
  if (sel.kind === 'person') return <PersonPage {...props} id={sel.id} />;
  if (sel.kind === 'household') {
    const h = m.active.households.get(sel.id);
    return h ? <HouseholdPage m={m} a={a} sel={sel} h={h} /> : null;
  }
  if (sel.kind === 'building') {
    const b = m.active.buildings.get(sel.id);
    return b ? <BuildingPage {...props} b={b} /> : null;
  }
  return <TilePage m={m} k={sel.id} />;
}

// ---- Site ----

const GOOD_CARDS: [good: string, name: string, unit: string][] = [
  ['food', 'Food', 'grain, fish, stores'],
  ['timber', 'Timber', 'logs'],
  ['ore', 'Ore', 'iron ore'],
  ['salt', 'Salt', 'none made here'],
  ['luxury', 'Luxuries', 'none made here'],
];

export function SitePane({ m, a }: Omit<PanelProps, 'ui' | 'sel'>) {
  const { site, active, scene, world, content } = m;
  const followed = active.residents.length;
  const share = m.total > 0 ? followed / m.total : 1;
  const bio = biography(world, content, m.narrator, m.index, { kind: 'site', id: site.id });
  const bandAll = (band: string) =>
    site.pop.filter((p) => p.band === band).reduce((n, p) => n + p.count, 0);
  const bandFollowed = (band: string) =>
    [...scene.marks.values()].filter((mark) => mark.band === band).length;
  const mix = { faint: 0, gifted: 0, strong: 0, none: 0 };
  for (const id of active.residents) {
    const tier = tierOfPower(world.people.get(id)?.magic.power ?? 0);
    if (tier === 'faint' || tier === 'gifted') mix[tier] += 1;
    else if (tier === 'none') mix.none += 1;
    else mix.strong += 1;
  }
  const cards = GOOD_CARDS.map(([good, name, unit]) => ({
    good,
    name,
    unit,
    count: Math.round(active.stock.get(good) ?? 0),
  }));
  const have = cards.filter((c) => c.count > 0);
  const none = cards.filter((c) => c.count <= 0).map((c) => c.name.toLowerCase());
  const cells = world.cells;
  const biome = cells ? content.biomes[cells.biome[site.cell]!]?.name : undefined;
  const homes = [...active.buildings.values()].filter((b) => b.defId === 'home');
  const fields = [...active.buildings.values()].filter((b) => b.defId === 'field').length;
  const other = [...active.buildings.values()].filter(
    (b) => !['home', 'field', 'hall'].includes(b.defId),
  );
  const foodDays = Math.round(foodDaysLeft(world, content));
  const today = Math.round(siteTemperature(world, content, world.day));
  const rulerName = m.ruler ? m.scene.marks.get(m.ruler.id)?.name : undefined;
  return (
    <div className="page">
      <div>
        <div className="kind">Site · {site.kind}</div>
        <h3>{site.name}</h3>
      </div>
      {bio.summary.length > 0 && <p className="summary">{cap(bio.summary.join(' '))}</p>}
      <div className="split">
        <div className="sect">
          People <span className="r">{m.total}</span>
        </div>
        <div className="splitbar" aria-hidden="true">
          <i className="sim" style={{ width: `${share * 100}%` }} />
          <i className="cnt" style={{ width: `${(1 - share) * 100}%` }} />
        </div>
        <p className="quiet">
          <b style={{ color: 'var(--ink)' }}>{followed} followed</b>: {followedWording(m.ruleWord)}{' '}
          ({active.households.size} households,{' '}
          {
            [...scene.marks.values()].filter((x) => x.role === 'notable' || x.role === 'jarl')
              .length
          }{' '}
          notables).{' '}
          {scene.countedPeople > 0
            ? `${scene.countedPeople} are counted in ${scene.counted.length} other homes.`
            : 'Everyone is followed.'}
        </p>
      </div>
      <Facts>
        <Fact term="Children">
          {bandFollowed('child')} followed · {bandAll('child')} in all
        </Fact>
        <Fact term="Adults">
          {bandFollowed('adult')} followed · {bandAll('adult')} in all
        </Fact>
        <Fact term="Elders">
          {bandFollowed('elder')} followed · {bandAll('elder')} in all
        </Fact>
        <Fact term="Magic">
          {mix.faint} faint, {mix.gifted} gifted, {mix.strong} strong · {mix.none} with none
        </Fact>
        {m.civ && (
          <Fact term="Held by">
            <LegendsLink a={a} to={{ kind: 'civ', id: m.civ.id }}>
              {m.civ.name}
            </LegendsLink>
            {m.ruler && rulerName && (
              <>
                {' '}
                · {m.ruleWord}{' '}
                <a
                  className="pp"
                  role="link"
                  tabIndex={0}
                  data-name={rulerName}
                  onClick={() => a.select({ kind: 'person', id: m.ruler!.id })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') a.select({ kind: 'person', id: m.ruler!.id });
                  }}
                >
                  {rulerName}
                </a>
              </>
            )}
          </Fact>
        )}
        {cells && (
          <Fact term="Land">
            {biome ?? 'land'}
            {site.features.length > 0 ? `, ${joinList(site.features)}` : ''}; summer{' '}
            {cells.tempSummer[site.cell]} °C, winter {cells.tempWinter[site.cell]} °C,{' '}
            {cells.rainfall[site.cell]} mm of rain
          </Fact>
        )}
        <Fact term="Today">
          {today} °C · {cap(DAY_BLOCKS[active.block] ?? 'morning')}
        </Fact>
      </Facts>
      <div className="sect">
        Stockpile{' '}
        <span className="r">
          {Math.round(share * 100)}% of the village&apos;s goods: the followed share
        </span>
      </div>
      <div className="stock">
        {have.map((c) => (
          <div key={c.good}>
            <b>{c.count}</b>
            <span>
              {c.name} · {c.unit}
            </span>
            {c.good === 'food' && (
              <span>
                ≈ {foodDays} days for {followed} people
              </span>
            )}
          </div>
        ))}
      </div>
      {none.length > 0 && <p className="quiet">No {none.join(' or ')} in store.</p>}
      <p className="quiet">
        From the village&apos;s goods when you began watching, split by the share of people
        followed. When you leave, the stock folds back into the world&apos;s goods.
      </p>
      <div className="sect">Buildings</div>
      <Facts>
        <Fact term="Homes">
          {homes.filter((b) => b.followed).length} followed, {scene.counted.length} counted
          {active.buildings.size > 0 &&
          [...active.buildings.values()].some((b) => b.defId === 'hall')
            ? `, plus the ${m.ruleWord}'s hall`
            : ''}
        </Fact>
        <Fact term="Fields">{fields} plots</Fact>
        {other.length > 0 && (
          <Fact term="Other">
            {other.map((b, k) => (
              <Fragment key={b.id}>
                {k > 0 && ', '}
                <SelectLink a={a} to={{ kind: 'building', id: b.id }}>
                  {buildingLabel(content.site, b.defId, false).toLowerCase()}
                </SelectLink>
              </Fragment>
            ))}
          </Fact>
        )}
      </Facts>
      <div className="actions">
        <button type="button" onClick={() => a.openLegends({ kind: 'site', id: site.id })}>
          Open in Legends
        </button>
      </div>
    </div>
  );
}

// ---- People ----

const FILTERS: [key: string, label: string, test: (mark: PersonMark, m: SiteModel) => boolean][] = [
  ['notable', 'notables', (mark) => mark.role === 'notable' || mark.role === 'jarl'],
  ['child', 'children', (mark) => mark.band === 'child'],
  ['elder', 'elders', (mark) => mark.band === 'elder'],
  [
    'alone',
    'lives alone',
    (mark, m) => {
      const h = m.active.households.get(m.world.people.get(mark.id)?.family.householdId ?? -1);
      return h?.members.length === 1;
    },
  ],
  ['magic', '✦ gifted+', (mark) => mark.gifted],
];

export function PeoplePane({ m, a, sel, ui }: PanelProps) {
  const { scene, active } = m;
  const needle = ui.q.trim().toLowerCase();
  const match = (id: Id) => {
    const mark = scene.marks.get(id);
    if (!mark) return false;
    if (needle && !mark.name.toLowerCase().includes(needle)) return false;
    return FILTERS.every(([key, , test]) => !ui.filters.has(key) || test(mark, m));
  };
  const followed = active.residents.length;
  const activityOf = (id: Id) => {
    const activity = m.world.people.get(id)?.detail?.activity;
    return activity ? ` · ${ACTIVITY_SHORT[activity]}` : '';
  };
  const matches = active.residents.filter(match);
  const link = (id: Id) => (
    <PersonLink
      key={id}
      m={m}
      a={a}
      sel={sel}
      id={id}
      extra={
        <small>
          {' '}
          {scene.marks.get(id)?.age}
          {activityOf(id)}
        </small>
      }
    />
  );
  let list: ReactNode;
  if (ui.sort === 'household') {
    const households = [...active.households.values()]
      .sort((x, y) => {
        const hallX = x.home !== null && active.buildings.get(x.home)?.defId === 'hall' ? 1 : 0;
        const hallY = y.home !== null && active.buildings.get(y.home)?.defId === 'hall' ? 1 : 0;
        return hallY - hallX || y.members.length - x.members.length || x.id - y.id;
      })
      .filter((h) => h.members.some(match));
    list = households.map((h) => (
      <li key={h.id} className="hh">
        <div className="hd">
          <SelectLink a={a} to={{ kind: 'household', id: h.id }}>
            {householdName(m, h)}
          </SelectLink>
          <span>{h.members.length === 1 ? 'lives alone' : h.members.length}</span>
        </div>
        <div className="ppl">{h.members.filter(match).map(link)}</div>
      </li>
    ));
  } else {
    const ids = [...matches].sort((x, y) => {
      const mx = scene.marks.get(x)!;
      const my = scene.marks.get(y)!;
      return ui.sort === 'name'
        ? mx.name.localeCompare(my.name)
        : my.age - mx.age || mx.name.localeCompare(my.name);
    });
    list =
      ids.length > 0 ? (
        <li className="hh">
          <div className="ppl">{ids.map(link)}</div>
        </li>
      ) : null;
  }
  return (
    <div className="page">
      <input
        className="search"
        placeholder={`Search ${followed} residents`}
        aria-label="Search residents"
        value={ui.q}
        onChange={(event) => ui.setQ(event.target.value)}
      />
      <div className="toolrow">
        <span>
          <b style={{ color: 'var(--ink)' }}>{followed} followed</b> · {matches.length} match
        </span>
        <label>
          Sort{' '}
          <select
            className="sort"
            aria-label="Sort people"
            value={ui.sort}
            onChange={(event) => ui.setSort(event.target.value as PaneUi['sort'])}
          >
            <option value="household">household</option>
            <option value="name">name</option>
            <option value="age">age (oldest first)</option>
          </select>
        </label>
      </div>
      <div className="chips" role="group" aria-label="Filters">
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className="chip tg"
            aria-pressed={ui.filters.has(key)}
            onClick={() => ui.toggleFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="quiet">
        You follow {followed} of {m.total}: {followedWording(m.ruleWord)}.{' '}
        <span style={{ color: 'var(--legend)' }}>◆</span> marks the notables who came from the
        legends; the rest were promoted from counts when you arrived.{' '}
        <span className="gift">✦</span> marks people gifted or stronger in magic.
      </p>
      <ul className="list">
        {list ?? <li className="empty">Nobody matches.</li>}
        {scene.counted.length > 0 && (
          <li className="hh cntrow">
            <div className="hd">
              <SelectLink a={a} to={{ kind: 'building', id: scene.counted[0]!.id }}>
                {scene.countedPeople} counted in {scene.counted.length} homes
              </SelectLink>
              <span>not followed</span>
            </div>
            <p className="quiet">
              They are part of the village&apos;s population and eat from its stores, but nobody is
              followed one by one.
            </p>
          </li>
        )}
      </ul>
    </div>
  );
}

// ---- Chronicle ----

/** A line from the watched days: the opening note, or an event the site emitted. */
export interface LiveLine {
  day: number;
  /** An event id; absent for the opening note. */
  eventId?: Id;
  text?: string;
}

const FLOORS: [number, string][] = [
  [0, 'All'],
  [3, '★'],
  [6, '★★'],
  [9, '★★★'],
];

export function ChroniclePane({
  m,
  a,
  ui,
  live,
}: Omit<PanelProps, 'sel'> & { live: readonly LiveLine[] }) {
  const ref: LegendRef = { kind: 'site', id: m.site.id };
  const every = m.index.events(ref);
  const bio = biography(m.world, m.content, m.narrator, m.index, ref);
  // Days watched have their own "At the site" list, so this one stops at arrival.
  const arrived = m.active.enteredDay;
  const ids = (ui.mode === 'highlights' ? bio.lines.map((l) => l.eventId) : [...every]).filter(
    (id) => {
      const event = m.index.event(id);
      return event !== undefined && event.day <= arrived;
    },
  );
  const groups = m.content.typeGroups ?? [];
  const groupOf = new Map<string, string>();
  for (const g of groups) for (const type of g.types) groupOf.set(type, g.id);
  const present = groups.filter((g) =>
    ids.some((id) => groupOf.get(m.index.event(id)!.type) === g.id),
  );
  const shown = ids
    .filter((id) => {
      const event = m.index.event(id)!;
      return !ui.hidden.has(groupOf.get(event.type) ?? '') && event.importance >= ui.floor;
    })
    .reverse();
  return (
    <div className="page">
      <div className="sect">
        At the site <span className="r">newest first</span>
      </div>
      <ul className="chron">
        {[...live].reverse().map((line, k) =>
          line.eventId !== undefined ? (
            <EventItem
              key={`${line.eventId}:${k}`}
              m={m}
              a={a}
              ui={ui}
              id={line.eventId}
              path={`l${line.eventId}`}
              label={shortDay(line.day)}
            />
          ) : (
            <li key={`n${k}`} className="ev now">
              <span className="y">{shortDay(line.day)}</span>
              <span className="txt">{line.text}</span>
            </li>
          ),
        )}
      </ul>
      <div className="sect">
        Before you arrived <span className="r">from the legends</span>
      </div>
      <div className="toolrow">
        <div className="seg" role="group" aria-label="Which events">
          {(
            [
              ['highlights', 'Highlights'],
              ['all', 'Every event'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={ui.mode === value}
              onClick={() => ui.setMode(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Importance at least">
          {FLOORS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={ui.floor === value}
              title={`Importance ${label}`}
              onClick={() => ui.setFloor(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="chips" role="group" aria-label="Kinds of event">
        {present.map((g) => (
          <button
            key={g.id}
            type="button"
            className="chip tg"
            aria-pressed={!ui.hidden.has(g.id)}
            onClick={() => ui.toggleGroup(g.id)}
          >
            {g.label.toLowerCase()}
          </button>
        ))}
      </div>
      <p className="quiet">
        {shown.length} of {ids.length} events shown, newest first. &quot;why?&quot; unfolds the
        causes one step at a time.
      </p>
      {shown.length === 0 ? (
        <ul className="chron">
          <li className="empty">No events match.</li>
        </ul>
      ) : (
        <LegendLines m={m} a={a} ui={ui} ids={shown.slice(0, ui.limit)} prefix="c" />
      )}
      {shown.length > ui.limit && (
        <button type="button" onClick={ui.more}>
          Show {CHRONICLE_WINDOW} more ({ui.limit} of {shown.length})
        </button>
      )}
    </div>
  );
}
