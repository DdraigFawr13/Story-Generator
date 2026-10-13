// The four tabs of the site pane (M3.1): Inspect, Site, People and Chronicle. Every person is shown
// by display name (`residentNames`), every household by `householdLabel`. Chronicle lines reuse the
// Legends helpers (biography, linkSegments, importanceStars, eventTitle).

import { Fragment, useState, type ReactNode } from 'react';
import {
  ATTRIBUTE_KEYS,
  DAYS_PER_YEAR,
  DAY_BLOCKS,
  buildingDef,
  biography,
  dateOf,
  eventTitle,
  eventYear,
  fillTemplate,
  foodDaysLeft,
  foodMeals,
  heldItems,
  effectivePower,
  bookSchool,
  cantripSource,
  learnableCantrips,
  itemCount,
  openConstruction,
  repairsDue,
  skillCap,
  householdLabel,
  importanceStars,
  linkSegments,
  MONTH_NAMES,
  residentNames,
  sitePopulation,
  tierOfPower,
  yearText,
  type Activity,
  type NeedDef,
  type ActiveSite,
  type BreakdownKind,
  type Building,
  type BlockSpent,
  type Condition,
  type Civ,
  type HeldItem,
  type ItemDef,
  type JobDef,
  type ContentBundle,
  type CultureDef,
  type EventTypeDef,
  type Household,
  type Id,
  type LegendIndex,
  type Narrator,
  type Person,
  type Relationship,
  type SimEvent,
  type Site,
  type TierId,
  type WorldState,
} from '../engine';
import { cap, roundedCount as count } from './format';
import { plainClick, refName, type PageRef } from './legends-ctx';
import { briefDate, fieldFacts, seasonRows, stewardLine, threatLine } from './site-season';
import {
  buildPercent,
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
  /** Day of the last applied people snapshot (the UI's clock can run ahead of it); the view updates it. */
  clock: { day: number };
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
  const scene = buildScene(
    world,
    content.site,
    names,
    content.races,
    ruleWord === 'jarl',
    content.environment.wild.animals.kinds,
  );
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
    clock: { day: world.day },
  };
}

/** The block whose state is on screen and its day: the one just run, not the next. */
export function shownBlock(m: SiteModel): { day: number; block: number; restDay: boolean } {
  const { active, clock, content } = m;
  const blocks = DAY_BLOCKS.length;
  // Before anything has run (right after embarking) show the entry day itself, at night.
  const fresh = clock.day === active.enteredDay && active.block === 0;
  const block = fresh ? 0 : (active.block + blocks - 1) % blocks;
  const day = fresh || active.block !== 0 ? clock.day : clock.day - 1;
  const every = content.life.restDayEvery;
  return { day, block, restDay: day % every === every - 1 };
}

/** "Idle: no work for 3 days": the why of a low need, counted from the shown snapshot's day. */
function needWhy(need: NeedDef, since: number | undefined, now: number): string {
  const head = `${need.lowWord}: ${need.missing}`;
  if (since === undefined) return head;
  const days = Math.max(0, now - since);
  return days === 0 ? `${head} today` : `${head} for ${days} ${days === 1 ? 'day' : 'days'}`;
}

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
  return `${date.dayOfMonth} ${monthName(day)}, Year ${date.year - 1}`;
}
/** "Thawmonth" for a day. */
export function monthName(day: number): string {
  return MONTH_NAMES[dateOf(day).month]!;
}
export function shortDay(day: number): string {
  const date = dateOf(day);
  return `${date.dayOfMonth} ${MONTH_NAMES[date.month]!.slice(0, 4)} ${date.year - 1}`;
}

export function householdName(m: SiteModel, h: Household): string {
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
    if (b.progress !== undefined) {
      return `${buildingLabel(m.content.site, b.defId, false)} (being built)`;
    }
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
  if (b?.defId === 'home' && b.progress === undefined) {
    const h = homeHousehold(m, b);
    return h ? `Home: ${m.labels.get(h.id) ?? ''}` : 'Home of a counted household';
  }
  const animal = m.active.animals.find((x) => x.y * m.scene.size + x.x === k);
  if (animal) {
    const kind = m.content.environment.wild.animals.kinds.find((d) => d.id === animal.kind);
    return cap(kind?.name ?? animal.kind);
  }
  if (m.active.fire?.tiles.has(k)) return 'Burning';
  if (b?.defId === 'field' && b.crop && b.crop.stage !== 'bare') {
    return `Field · ${fieldFacts(b)!.stage}`;
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
  /** "At the site" shows only this event category (from a link such as "9 learned"), or all. */
  liveOnly: string | null;
  setLiveOnly(category: string | null): void;
  /** M3.11 (R-14): numbers in the inspector; off shows words. Remembered in this browser. */
  numbers: boolean;
  setNumbers(on: boolean): void;
  /** M3.11: the person inspector's section. */
  personTab: PersonTab;
  setPersonTab(tab: PersonTab): void;
  /** M3.11: "At the site" event categories switched off, and the importance floor. */
  liveHidden: ReadonlySet<string>;
  toggleLiveKind(category: string): void;
  liveFloor: number;
  setLiveFloor(n: number): void;
  /** M3.11: unfolded rollup lines and other open toggles, by key. */
  unfolded: ReadonlySet<string>;
  toggleUnfold(key: string): void;
}

export type PersonTab = 'now' | 'ties' | 'story' | 'skills';

const NUMBERS_KEY = 'sg.inspector.numbers';
function readNumbers(): boolean {
  try {
    return window.localStorage.getItem(NUMBERS_KEY) === '1';
  } catch {
    return false;
  }
}
function writeNumbers(on: boolean): void {
  try {
    window.localStorage.setItem(NUMBERS_KEY, on ? '1' : '0');
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
}

function toggled<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (!next.delete(value)) next.add(value);
  return next;
}

/** Items shown in a chronicle list before "Show more". */
export const CHRONICLE_WINDOW = 200;

export function usePaneUi(): PaneUi {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<PaneUi['sort']>('household');
  const [filters, setFilters] = useState<ReadonlySet<string>>(new Set());
  const [mode, setMode] = useState<PaneUi['mode']>('highlights');
  const [floor, setFloor] = useState(0);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [why, setWhy] = useState<ReadonlySet<string>>(new Set());
  const [limit, setLimit] = useState(CHRONICLE_WINDOW);
  const [liveOnly, setLiveOnly] = useState<string | null>(null);
  const [numbers, setNumbers] = useState(readNumbers);
  const [personTab, setPersonTab] = useState<PersonTab>('now');
  const [liveHidden, setLiveHidden] = useState<ReadonlySet<string>>(new Set());
  const [liveFloor, setLiveFloor] = useState(0);
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(new Set());
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
    liveOnly,
    setLiveOnly,
    numbers,
    setNumbers: (on) => {
      writeNumbers(on);
      setNumbers(on);
    },
    personTab,
    setPersonTab,
    liveHidden,
    toggleLiveKind: (category) => setLiveHidden((h) => toggled(h, category)),
    liveFloor,
    setLiveFloor,
    unfolded,
    toggleUnfold: (key) => setUnfolded((u) => toggled(u, key)),
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
  /** Open the chronicle tab showing only one category of the days watched. */
  showChronicle(category: string): void;
}

export interface PanelProps {
  m: SiteModel;
  sel: Selection | null;
  a: PanelActions;
  ui: PaneUi;
}

// ---- small pieces ----

/** A link to a resident: selects them on the map. */
export function PersonLink({
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
export function LegendsLink({
  a,
  to,
  children,
}: {
  a: PanelActions;
  to: PageRef;
  children: ReactNode;
}) {
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

export function SelectLink({
  a,
  to,
  children,
}: {
  a: PanelActions;
  to: Selection;
  children: ReactNode;
}) {
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

/** A link to the event a line follows from. */
export function EventLink({ a, id, children }: { a: PanelActions; id: Id; children: ReactNode }) {
  return (
    <LegendsLink a={a} to={{ kind: 'event', id }}>
      {children}
    </LegendsLink>
  );
}

/** The event as the pane has it (the index trails live events by half a second). */
export function eventOf(m: SiteModel, id: Id) {
  return m.index.event(id) ?? m.world.events.find((e) => e.id === id);
}

/** An event's title in lower case, for "because of ...". */
export function causeTitle(m: SiteModel, id: Id): string {
  const event = eventOf(m, id);
  if (!event) return 'earlier events';
  const title = eventTitle(event, m.typeDefs.get(event.type));
  return title.charAt(0).toLowerCase() + title.slice(1);
}

/** "Lodging with Stenna and Orm's household since the fire", while a household's own home is burnt. */
function lodgingText(m: SiteModel, h: Household): string | null {
  if (h.lodgingHome == null) return null;
  const host = m.active.buildings.get(h.lodgingHome);
  const hostHold = host ? homeHousehold(m, host) : undefined;
  const where =
    host?.defId === 'hall'
      ? `the ${m.ruleWord}'s hall`
      : hostHold
        ? (m.labels.get(hostHold.id) ?? 'a neighbour')
        : 'a neighbour';
  return `Lodging with ${where} since the fire`;
}

/** "Burnt in the fire of 4 Deepwinter; being rebuilt, 35%". */
function burntText(m: SiteModel, b: Building): string | null {
  if (!b.burnt) return null;
  const when = b.burntDay === undefined ? 'the fire' : `the fire of ${briefDate(b.burntDay)}`;
  const state =
    b.progress === undefined
      ? 'waiting to be rebuilt'
      : `being rebuilt, ${buildPercent(m.content.site, b)}%`;
  return `Burnt in ${when}; ${state}`;
}

export function Facts({ children }: { children: ReactNode }) {
  return <dl className="facts">{children}</dl>;
}
export function Fact({ term, children }: { term: string; children: ReactNode }) {
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

/** "fire 2, life 1 · ": the schools a person leans to, strongest first. */
function affinityWords(m: SiteModel, p: Person): string {
  const rows = Object.entries(p.magic.affinities)
    .filter(([, v]) => v > 0)
    .sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1));
  if (rows.length === 0) return '';
  const school = (id: string) =>
    m.content.schools.find((x) => x.id === id)?.name.toLowerCase() ?? id;
  return `${rows.map(([id, v]) => `${school(id)} ${v}`).join(', ')} · `;
}

const TIER_TEXT: Record<TierId, string> = {
  none: 'none',
  faint: 'faint: a spark, enough for cantrips if someone teaches them',
  gifted: "gifted: a hedge-witch's gift; can teach any gifted pupil",
  strong: 'strong: rare, one in a few hundred',
  exceptional: 'exceptional',
  legendary: 'legendary',
};

// ---- Chronicle lines ----

export function EventItem({
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

/** The historian's recap: its own words, then the period's top events it is remembered for. */
export function RecapCard({
  m,
  a,
  ui,
  id,
  path,
}: {
  m: SiteModel;
  a: PanelActions;
  ui: PaneUi;
  id: Id;
  path: string;
}) {
  const event = m.index.event(id);
  if (!event) return null;
  const rules = m.content.chronicle.recap;
  const causes = event.causes.filter((c) => m.index.event(c) !== undefined);
  return (
    <li className={event.type === rules.yearType ? 'recap year' : 'recap'}>
      <b>{eventTitle(event, m.typeDefs.get(event.type))}</b>
      <p>{m.narrator.renderEvent(event)}</p>
      {causes.length > 0 && (
        <>
          <div className="cw">Remembered for</div>
          <ul className="chron">
            {causes.map((c) => (
              <EventItem
                key={c}
                m={m}
                a={a}
                ui={ui}
                id={c}
                path={`${path}>${c}`}
                label={shortDay(m.index.event(c)!.day)}
              />
            ))}
          </ul>
        </>
      )}
    </li>
  );
}

export function LegendLines({
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
  fight: 'Fighting the fire',
  defend: 'Standing to arms',
  shelter: 'Sheltering at home',
  flee: 'Fled the town',
  errand: 'On an errand',
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
  fight: 'fighting fire',
  defend: 'under arms',
  shelter: 'sheltering',
  flee: 'fled',
  errand: 'on an errand',
};
const BREAKDOWN_TEXT: Record<BreakdownKind, string> = {
  tantrum: 'A tantrum',
  despair: 'In despair',
  wandering: 'Wandering off',
  theft: 'Stealing',
};
const signed = (n: number) => `${n < 0 ? '−' : '+'}${Math.abs(Math.round(n))}`;

/** Where a block was spent, as a phrase: "in a field", "at home", "outdoors". */
function placeText(m: SiteModel, spent: BlockSpent, homeId: Id | null): string {
  const building = spent.placeId == null ? undefined : m.active.buildings.get(spent.placeId);
  if (!building) return 'outdoors';
  if (building.defId === 'home')
    return building.id === homeId ? 'at home' : 'at a neighbour’s home';
  if (building.defId === 'field') return 'in a field';
  if (building.defId === 'hall') return `in the ${m.ruleWord === 'jarl' ? "jarl's " : ''}hall`;
  return `at the ${building.defId}`;
}

/** The job a person was given today, if any. */
function jobOf(m: SiteModel, p: Person): JobDef | undefined {
  return jobById(m, p.detail?.jobId);
}
function jobById(m: SiteModel, id: string | undefined): JobDef | undefined {
  return id === undefined ? undefined : m.content.jobs.find((j) => j.id === id);
}

// Presentation: what a job reads as while it is being done. Jobs not listed here read as their
// name with the place ("Cooking in the hall"). Add a line when content adds a job.
const JOB_DOING: Record<string, string> = {
  forage: 'Foraging in the wild',
  fish: 'Fishing',
  hunt: 'Hunting in the wild',
  fell: 'Felling trees',
  quarry: 'Quarrying stone',
  mine: 'Mining ore',
  heal: 'Gathering herbs',
  'craft-tools': 'Making tools',
  'craft-wares': 'Crafting wares',
};

/** "the workshop": the building being raised, else the village (repairs). */
function workSiteName(m: SiteModel): string {
  const open = openConstruction(m.active);
  return open
    ? `the ${buildingLabel(m.content.site, open.defId, false).toLowerCase()}`
    : 'the village';
}

/** "Building the workshop", "Hauling to the workshop": the construction (or repair) in hand. */
function siteWorkText(m: SiteModel, job: JobDef): string {
  const open = openConstruction(m.active);
  const name = (defId: string) => buildingLabel(m.content.site, defId, false).toLowerCase();
  if (job.action === 'build')
    return open ? `Building the ${name(open.defId)}` : 'Repairing buildings';
  return open ? `Hauling to the ${name(open.defId)}` : 'Hauling';
}

/** The last block run, as the current detail holds it. */
function lastSpent(p: Person): BlockSpent {
  const d = p.detail;
  return {
    activity: d?.activity,
    placeId: d?.placeId ?? null,
    where: d?.where,
    with: d?.with,
    jobId: d?.jobId,
  };
}

/** "Working in a field", "Sleeping at home": the activity and the place of one block. */
function doingText(m: SiteModel, spent: BlockSpent, homeId: Id | null): string {
  if (spent.with !== undefined) return `With ${m.names.get(spent.with) ?? 'a carer'}`;
  if (!spent.activity) return 'Not yet known';
  const verb = ACTIVITY_VERB[spent.activity];
  if (spent.activity === 'wander') return verb;
  // Village life: where a free block is spent ("At the alehouse", "Visiting Asa").
  if (spent.where && spent.activity !== 'worship')
    return spent.where.charAt(0).toUpperCase() + spent.where.slice(1);
  const job = spent.activity === 'work' ? jobById(m, spent.jobId) : undefined;
  if (job) {
    if (job.action) return siteWorkText(m, job);
    const listed = JOB_DOING[job.id];
    if (listed) return listed;
    return `${job.name} ${placeText(m, spent, homeId)}`;
  }
  const place = placeText(m, spent, homeId);
  // The schedule sends an adult with no job to the fields, where they have nothing set to do.
  if (spent.activity === 'work') return `Idle ${place}, no work set`;
  return `${verb} ${place}`;
}

/** Where a job is done, for the Work fact: "field 3", "the woods", "the workshop". */
const WORKPLACE_TEXT: Record<string, string> = {
  field: 'the fields',
  trees: 'the woods',
  water: 'the water',
  stone: 'the quarry',
  ore: 'the mine',
  wild: 'the wild',
  workshop: 'the workshop',
  kitchen: 'the kitchen',
  construction: 'the building site',
  herbs: 'the herb ground',
};

/** The Work fact and its why line (the steward's data: focus, liked work). */
function workInfo(m: SiteModel, p: Person, band: string): { text: string; why: string | null } {
  const job = jobOf(m, p);
  if (band === 'child') return { text: 'No work (child)', why: null };
  if (!job) {
    const kind = p.detail?.breakdown?.kind;
    const reason = kind === 'despair' || kind === 'wandering' ? 'not themselves' : 'no work set';
    return {
      text: band === 'elder' ? `No work (${reason}; light work only)` : `No work (${reason})`,
      why: null,
    };
  }
  const here =
    p.detail?.activity === 'work' && p.detail.placeId != null
      ? m.active.buildings.get(p.detail.placeId)
      : undefined;
  const place =
    here?.defId === 'field'
      ? `field ${here.id}`
      : job.action
        ? workSiteName(m)
        : (WORKPLACE_TEXT[job.workplace] ?? job.workplace);
  const text = `${cap(job.worker)} · ${place}${band === 'elder' ? ' · light work only' : ''}`;
  let why: string | null = null;
  if (job.serves === 'food' && m.active.stewardFocus === 'food') {
    why =
      job.workplace === 'field'
        ? 'Sent to the fields: food is short.'
        : 'Put to food work: food is short.';
  } else {
    const liked = p.traits.flatMap((id) =>
      job.likedBy?.includes(id) ? (m.content.traits.find((t) => t.id === id) ?? []) : [],
    );
    if (liked.length > 0)
      why = `Likes this work (${liked.map((t) => t.name.toLowerCase()).join(', ')}).`;
  }
  return { text, why };
}

/** "+2 charisma", "a fine weapon: worth 2 blows in a fight": what a carried item does. */
function effectWords(m: SiteModel, p: Person, held: HeldItem): string[] {
  const out: string[] = [];
  for (const effect of held.def.effects ?? []) {
    if (effect.kind === 'attribute') out.push(`${signed(effect.bonus)} ${effect.attribute}`);
    else if (effect.kind === 'combat') {
      out.push(
        `a fine weapon: worth ${effect.value} ${effect.value === 1 ? 'blow' : 'blows'} in a fight`,
      );
    } else if (effect.kind === 'power') {
      const reached = effectPower(p, held);
      const tier = tierOfPower(reached);
      out.push(
        `magic power ${signed(effect.bonus)}${reached - p.magic.power < effect.bonus ? `, held to ${tier}` : ''}`,
      );
    } else {
      const ability = m.content.abilities.find((x) => x.id === effect.abilityId);
      out.push(`lets the holder use ${ability?.name ?? effect.abilityId}`);
    }
  }
  return out;
}
const effectPower = (p: Person, held: HeldItem) => effectivePower(p, [held]);

const DOWNSIDE_TEXT: Record<NonNullable<ItemDef['downsides']>[number], string> = {
  envy: 'draws envy',
  theftDraw: 'draws thieves',
  curse: 'cursed: it troubles the holder',
};

/** Skills above 0, best first, each a bar to 20 with the person's ceiling marked. */
function SkillsSection({ m, p, numbers }: { m: SiteModel; p: Person; numbers: boolean }) {
  const { abilities, steward } = m.content;
  const rows = Object.entries(p.skills)
    .filter(([, value]) => value > 0)
    .sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1));
  if (rows.length === 0) return null;
  return (
    <>
      <div className="sect">Skills</div>
      <div className="attrs" data-testid="skills">
        {rows.map(([id, value]) => {
          const ability = abilities.find((a) => a.id === id);
          const cap20 = ability ? skillCap(p, ability) : 20;
          let level = '';
          for (const [at, word] of steward.skillLevels) if (value >= at) level = word;
          return (
            <Fragment key={id}>
              <span>
                {cap(ability?.name ?? id)}
                {level && <span className="empty"> · {level}</span>}
              </span>
              <span className="b" title={`Can reach about ${Math.round(cap20)} of 20`}>
                <i style={{ width: `${Math.min(100, value * 5)}%` }} />
                <u style={{ left: `${Math.min(100, cap20 * 5)}%` }} />
              </span>
              <span className="v">{numbers ? value.toFixed(1) : ''}</span>
            </Fragment>
          );
        })}
      </div>
      <p className="quiet">Bars run to 20; the tick marks the most this person can reach.</p>
    </>
  );
}

/** " · teaches Kindle": what a book of a magic school can teach here (mundane books teach nothing yet). */
function bookLine(m: SiteModel, itemId: Id, form: string): string {
  if (m.world.items.get(itemId)?.kind !== 'book') return '';
  const school = bookSchool(m.content, form);
  if (school === undefined) return '';
  const taught = m.content.lore.cantrips
    .map((id) => m.content.abilities.find((x) => x.id === id))
    .filter((ab) => ab?.school === school)
    .map((ab) => ab!.name);
  return taught.length > 0 ? ` · teaches ${joinList(taught)}` : '';
}

/** World items the person holds: name, what they do, what they cost. */
function CarriesSection({ m, a, p }: { m: SiteModel; a: PanelActions; p: Person }) {
  const held = heldItems(m.world, m.content, p.id);
  // M3.9: books lent to this person stay their owner's, so they are listed apart.
  const loans = m.active.lore.loans;
  const borrowed = loans.filter((l) => l.borrower === p.id);
  if (held.length === 0 && borrowed.length === 0) return null;
  const loanOf = (item: Id) => loans.find((l) => l.item === item);
  return (
    <>
      <div className="sect">Carries</div>
      <ul className="quiet" data-testid="carries" style={{ margin: 0, paddingLeft: 18 }}>
        {held.map((h) => {
          const effects = effectWords(m, p, h);
          const downsides = (h.def.downsides ?? []).map((d) => DOWNSIDE_TEXT[d]);
          return (
            <li key={h.item.id}>
              <LegendsLink a={a} to={{ kind: 'item', id: h.item.id }}>
                {h.item.name}
              </LegendsLink>
              {effects.length > 0 && ` · ${effects.join(', ')}`}
              {downsides.length > 0 && ` · ${downsides.join(', ')}`}
              {bookLine(m, h.item.id, h.item.form)}
              {loanOf(h.item.id) && (
                <>
                  {' · lent to '}
                  <PersonLink m={m} a={a} sel={null} id={loanOf(h.item.id)!.borrower} />
                </>
              )}
            </li>
          );
        })}
        {borrowed.map((l) => {
          const item = m.world.items.get(l.item);
          if (!item) return null;
          return (
            <li key={`b${l.item}`}>
              <LegendsLink a={a} to={{ kind: 'item', id: item.id }}>
                {item.name}
              </LegendsLink>
              {bookLine(m, item.id, item.form)}
              {' · borrowed from '}
              <PersonLink m={m} a={a} sel={null} id={l.owner} />
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** "from her mother Aelith", "from Gwen, the hedge-witch", "from the book of growth". */
function sourceWords(
  m: SiteModel,
  p: Person,
  from: { teacher?: Id | null; book?: Id | null },
): string {
  if (from.book != null) return `from ${m.world.items.get(from.book)?.name ?? 'a book'}`;
  if (from.teacher == null) return '';
  const name = m.names.get(from.teacher) ?? m.world.people.get(from.teacher)?.name ?? 'someone';
  if (p.family.parents.includes(from.teacher)) {
    const parent = m.world.people.get(from.teacher);
    const her = p.sex === 'f' ? 'her' : 'his';
    return `from ${her} ${parent?.sex === 'f' ? 'mother' : 'father'} ${name}`;
  }
  return from.teacher === m.active.lore.hedgeWitch
    ? `from ${name} the hedge-witch`
    : `from ${name}`;
}

/** M3.9: cantrips known and how, lessons under way, what cannot be learned here, books and awakening. */
function LoreSection({ m, a, p }: { m: SiteModel; a: PanelActions; p: Person }) {
  const lore = p.detail?.lore;
  const { abilities } = m.content;
  const cantrips = new Set(m.content.lore.cantrips);
  const known = p.knownAbilities.filter((id) => cantrips.has(id));
  const learning = lore?.learning;
  const learnable = learnableCantrips(m.content, p).filter(
    (ab) => !p.knownAbilities.includes(ab.id) && ab.id !== learning?.abilityId,
  );
  const blocked = learnable.filter(
    (ab) => cantripSource(m.world, m.content, m.active, p, ab.id) === null,
  );
  const pupils = m.active.residents.filter(
    (id) => m.world.people.get(id)?.detail?.lore?.learning?.teacher === p.id,
  );
  const reading = lore?.readBook === undefined ? undefined : m.world.items.get(lore.readBook);
  const awakening = p.awakening;
  // A spark with no common cantrip of its school (mind, for now) has nothing to learn here.
  const noCantrip =
    p.magic.power > 0 && learnableCantrips(m.content, p).length === 0 && known.length === 0;
  if (
    !noCantrip &&
    known.length === 0 &&
    !learning &&
    learnable.length === 0 &&
    pupils.length === 0 &&
    !awakening &&
    !(reading && (lore?.readDays ?? 0) > 0)
  )
    return null;
  const name = (id: string) => abilities.find((x) => x.id === id)?.name ?? id;
  const witch = m.active.lore.hedgeWitch === p.id;
  return (
    <>
      <div className="sect" data-testid="lore">
        Cantrips
        {witch && <span className="r">the hedge-witch of {m.site.name}</span>}
      </div>
      <Facts>
        {known.length > 0 && (
          <Fact term="Knows">
            {known.map((id) => {
              const how = lore?.learned[id];
              const uses = lore?.castTotal[id] ?? 0;
              return (
                <div key={id}>
                  {name(id)}
                  <span className="empty">
                    {' · '}
                    {how ? (
                      <EventLink a={a} id={how.eventId}>
                        {sourceWords(m, p, how)}, {briefDate(how.day)}
                      </EventLink>
                    ) : (
                      'known before you began watching'
                    )}
                    {uses > 0 && ` · cast ${count(uses)} ${uses === 1 ? 'time' : 'times'}`}
                  </span>
                </div>
              );
            })}
          </Fact>
        )}
        {learning && (
          <Fact term="Learning">
            {name(learning.abilityId)}{' '}
            <span className="empty">
              · {sourceWords(m, p, learning)} · {Math.floor(learning.lessons)} of{' '}
              {m.content.lore.lessons} lessons
            </span>
            <span className="lessons" aria-hidden="true">
              <i
                style={{
                  width: `${Math.min(100, (learning.lessons / m.content.lore.lessons) * 100)}%`,
                }}
              />
            </span>
          </Fact>
        )}
        {blocked.length > 0 && (
          <Fact term="No teacher">
            <span className="warnw">{joinList(blocked.map((ab) => ab.name))}</span>
            <span className="empty">
              : {p.sex === 'f' ? 'she has' : 'he has'} the spark, but no parent or hedge-witch here
              knows {blocked.length === 1 ? 'it' : 'them'} and no book teaches{' '}
              {blocked.length === 1 ? 'it' : 'them'}
            </span>
          </Fact>
        )}
        {noCantrip && (
          <Fact term="Cantrips">
            <span className="empty">
              none to learn: no common cantrip draws on{' '}
              {affinityWords(m, p).replace(/ \d+/g, '').replace(' · ', '')}
            </span>
          </Fact>
        )}
        {pupils.length > 0 && (
          <Fact term="Teaching">
            {pupils.map((id, k) => (
              <Fragment key={id}>
                {k > 0 && ', '}
                <PersonLink m={m} a={a} sel={null} id={id} />
              </Fragment>
            ))}
          </Fact>
        )}
        {reading && lore && lore.readDays > 0 && learning?.book !== reading.id && (
          <Fact term="Reading">
            <LegendsLink a={a} to={{ kind: 'item', id: reading.id }}>
              {reading.name}
            </LegendsLink>
            <span className="empty"> · {count(lore.readDays)} evenings in all</span>
          </Fact>
        )}
        {awakening && (
          <Fact term="Awakened">
            <EventLink a={a} id={awakening.eventId}>
              {briefDate(awakening.day)}
              {eventOf(m, awakening.eventId)
                ? `, ${String(eventOf(m, awakening.eventId)!.data.how)}`
                : ''}
            </EventLink>
          </Fact>
        )}
      </Facts>
    </>
  );
}

// Presentation: mood and stress as words when numbers are off. The numbers stay the engine's.
function moodWord(mood: number): string {
  if (mood >= 40) return 'happy';
  if (mood >= 10) return 'content';
  if (mood > -10) return 'even';
  if (mood > -30) return 'unhappy';
  return 'miserable';
}
function stressWord(stress: number, threshold: number): string {
  if (stress < threshold * 0.5) return 'calm';
  if (stress < threshold * 0.8) return 'strained';
  return 'near breaking';
}

/** Needs, mood, stress and traits (M3.2): what the engine stored, with its "why" parts. */
function LifePage({
  m,
  a,
  p,
  numbers,
}: {
  m: SiteModel;
  a: PanelActions;
  p: Person;
  numbers: boolean;
}) {
  const detail = p.detail;
  if (!detail) return null;
  const { content, world } = m;
  const now = m.clock.day;
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
        const need = content.needs.find((n) => n.id === part.id);
        text = need && needWhy(need, detail.lastMet?.[need.id], now);
      } else if (part.kind === 'trait') {
        const trait = content.traits.find((t) => t.id === part.id);
        text = trait && cap(trait.name);
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
  const foodNeed = content.needs.find((n) => n.id === 'food');
  const lastMeal = detail.lastMet?.food ?? detail.lastAte;
  const ago = lastMeal === undefined ? undefined : now - lastMeal;
  const foodWhy =
    ago === undefined || !foodNeed
      ? null
      : ago >= 2
        ? needWhy(foodNeed, lastMeal, now)
        : ago === 1
          ? 'Ate yesterday'
          : 'Ate today';
  const breakdown = detail.breakdown;
  // M3.4: why a need is held down, from what the engine decided (short meals, a low well, a cold home).
  const needValue = (id: string) => Math.round(detail.needs[id] ?? 0);
  const needOf = (id: string) => content.needs.find((n) => n.id === id);
  const active = m.active;
  const steward = stewardLine({ world, active, content }, (id) => eventOf(m, id));
  const foodHigh = (foodNeed ? needValue('food') >= foodNeed.lowAt : true) as boolean;
  const shortMeals = active.mealShare < 1 && foodHigh && steward !== null;
  const notes: { key: string; need: string; value: number; text: ReactNode }[] = [];
  if (shortMeals && steward) {
    notes.push({
      key: 'food',
      need: foodNeed?.name ?? 'Food',
      value: needValue('food'),
      text: (
        <>
          On short meals since {briefDate(active.shortMealsSince)}
          {steward.because && (
            <>
              {', after '}
              <EventLink a={a} id={steward.because.id}>
                {steward.because.phrase ?? 'what came before'}
              </EventLink>
            </>
          )}
        </>
      ),
    });
  }
  const water = needOf('water');
  if (water && active.weather.wellLow && detail.needs.water !== undefined) {
    notes.push({
      key: 'water',
      need: water.name,
      value: needValue('water'),
      text: `${needValue('water') < water.lowAt ? `${water.lowWord}: the` : 'The'} well is low after ${active.weather.dryDays} dry days`,
    });
  }
  const warmth = needOf('warmth');
  if (warmth && detail.placeId != null && active.firewood.coldHomes.includes(detail.placeId)) {
    const own = m.active.households.get(p.family.householdId ?? -1);
    const home = detail.placeId === own?.home || detail.placeId === own?.lodgingHome;
    notes.push({
      key: 'warmth',
      need: warmth.name,
      value: needValue('warmth'),
      text: `${warmth.lowWord}: no firewood ${home ? 'at home' : 'in this home'}`,
    });
  }
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
              <span className="v">{numbers ? value : ''}</span>
            </Fragment>
          );
        })}
      </div>
      {!numbers &&
        needs.flatMap((n) =>
          Math.round(detail.needs[n.id]!) < n.lowAt
            ? [
                <p key={n.id} className="quiet">
                  {needWhy(n, detail.lastMet?.[n.id], now)}
                </p>,
              ]
            : [],
        )}
      {foodWhy && !shortMeals && <p className="quiet">{foodWhy}</p>}
      {notes.map((note) => (
        <p key={note.key} className="quiet">
          <b className="warnw">
            {note.need}
            {numbers ? ` ${note.value}` : ''}
          </b>
          {' · '}
          {note.text}
        </p>
      ))}
      <div className="sect">
        Mood <span className="r">{numbers ? signed(detail.mood) : moodWord(detail.mood)}</span>
      </div>
      {parts.length > 0 ? (
        <ul className="quiet" style={{ margin: 0, paddingLeft: 18 }}>
          {(numbers ? parts : parts.slice(0, 4)).map((part) => (
            <li key={part.key}>
              {part.text}
              {numbers ? ` ${signed(part.value)}` : ''}
            </li>
          ))}
          {!numbers && parts.length > 4 && <li>and {parts.length - 4} more</li>}
        </ul>
      ) : (
        <p className="quiet">Nothing weighs on the mood.</p>
      )}
      <div className="sect">
        Stress{' '}
        <span className="r">
          {numbers
            ? `${Math.round(detail.stress)} of ${threshold}`
            : stressWord(detail.stress, threshold)}
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

/** M3.5: one condition as the inspector words it, with the health it costs. */
function conditionText(m: SiteModel, c: Condition, age: number): string {
  const def = m.content.conditions.find((d) => d.id === c.defId);
  const ailment = c.ailment
    ? (m.content.ailments.find((x) => x.id === c.ailment)?.name ??
      m.content.diseases.find((x) => x.id === c.ailment)?.name)
    : undefined;
  let name = ailment ? cap(ailment) : (def?.name ?? c.defId);
  if (c.lasting) return `${name}: ${c.lasting.attribute} −${c.lasting.amount}`;
  if (def?.kind === 'age') name += ` (age ${age})`;
  const bits: string[] = [];
  if (c.stage === 'incubating') bits.push('not yet showing');
  else if (def?.kind === 'disease' || def?.kind === 'wound' || def?.kind === 'need') {
    bits.push(`day ${Math.max(1, m.world.day - (c.onsetDay ?? c.sinceDay) + 1)}`);
  }
  if (c.tended) bits.push('tended');
  const harm = Math.round(c.severity * (def?.harm ?? 1));
  return `${name}${bits.length ? `, ${bits.join(', ')}` : ''}${harm > 0 ? ` −${harm}` : ''}`;
}

/** A person as a link when at the site, else their name with where they are (dead or elsewhere). */
function PersonRef({
  m,
  a,
  sel,
  id,
}: {
  m: SiteModel;
  a: PanelActions;
  sel: Selection | null;
  id: Id;
}) {
  if (m.scene.marks.has(id)) return <PersonLink m={m} a={a} sel={sel} id={id} />;
  const other = m.world.people.get(id);
  const gone = other?.died !== undefined || other?.diedDay !== undefined;
  return (
    <>
      {other?.name ?? 'someone'}
      <span className="empty">{gone ? ' (dead)' : ' (elsewhere)'}</span>
    </>
  );
}

function RefList({
  m,
  a,
  sel,
  ids,
}: {
  m: SiteModel;
  a: PanelActions;
  sel: Selection | null;
  ids: readonly Id[];
}) {
  return (
    <>
      {ids.map((id, k) => (
        <Fragment key={id}>
          {k > 0 && ', '}
          <PersonRef m={m} a={a} sel={sel} id={id} />
        </Fragment>
      ))}
    </>
  );
}

/** Grandparents, parents, siblings, spouse, children and grandchildren; empty rows are left out. */
function FamilyBlock({
  m,
  a,
  sel,
  p,
  children,
}: {
  m: SiteModel;
  a: PanelActions;
  sel: Selection | null;
  p: Person;
  /** Facts shown first in the same list (the household). */
  children?: ReactNode;
}) {
  const kin = (id: Id) => m.world.people.get(id)?.family;
  const unique = (ids: readonly Id[]) => [...new Set(ids)];
  const rows: [string, Id[]][] = [
    ['Grandparents', unique(p.family.parents.flatMap((x) => kin(x)?.parents ?? []))],
    ['Parents', unique(p.family.parents)],
    [
      'Siblings',
      unique(p.family.parents.flatMap((x) => kin(x)?.children ?? [])).filter((x) => x !== p.id),
    ],
    ['Spouse', unique(p.family.spouses)],
    ['Children', unique(p.family.children)],
    ['Grandchildren', unique(p.family.children.flatMap((x) => kin(x)?.children ?? []))],
  ];
  const shown = rows.filter(([, ids]) => ids.length > 0);
  if (shown.length === 0 && !children) return null;
  return (
    <div data-testid="family">
      <Facts>
        {children}
        {shown.map(([term, ids]) => (
          <Fact key={term} term={term}>
            <RefList m={m} a={a} sel={sel} ids={ids} />
          </Fact>
        ))}
      </Facts>
    </div>
  );
}

/** "spouse", "parent", "child" or "sibling" when `other` is that to `p`. */
function kinWord(m: SiteModel, p: Person, other: Id): string | null {
  if (p.family.spouses.includes(other)) return 'spouse';
  if (p.family.parents.includes(other)) return 'parent';
  if (p.family.children.includes(other)) return 'child';
  const theirs = m.world.people.get(other)?.family.parents ?? [];
  return theirs.some((x) => p.family.parents.includes(x)) ? 'sibling' : null;
}

/** Why one person holds another as they do; only what the data records. */
function TieReason({
  m,
  a,
  p,
  other,
  rel,
}: {
  m: SiteModel;
  a: PanelActions;
  p: Person;
  other: Id;
  rel: Relationship;
}) {
  const eventId = rel.grudge?.eventId;
  if (rel.grudge && eventId !== undefined) {
    return (
      <>
        grudge since {briefDate(rel.grudge.since)} (
        <EventLink a={a} id={eventId}>
          {cap(causeTitle(m, eventId))}
        </EventLink>
        )
      </>
    );
  }
  if (rel.cause !== undefined) {
    return (
      <>
        since{' '}
        <EventLink a={a} id={rel.cause}>
          {causeTitle(m, rel.cause)}
        </EventLink>
      </>
    );
  }
  const kin = kinWord(m, p, other);
  if (kin) return <>{kin}</>;
  if (rel.met !== undefined) return <>last spoke {briefDate(rel.met)}</>;
  return null;
}

const TIE_RANK = ['lover', 'enemy', 'friend', 'rival'];
const TIE_SHOWN = 8;
const tieLabel = (rel: Relationship) => TIE_RANK.find((l) => rel.labels.includes(l));

/** "People they know" (M3.11): labelled or strongly felt pairs, from the engine's relationships. */
function KnownPeople({
  m,
  a,
  ui,
  sel,
  p,
}: {
  m: SiteModel;
  a: PanelActions;
  ui: PaneUi;
  sel: Selection | null;
  p: Person;
}) {
  const rows = [...(p.detail?.relationships ?? [])]
    .filter(([, rel]) => tieLabel(rel) !== undefined || Math.abs(rel.opinion) >= 20)
    .sort(([ia, ra], [ib, rb]) => {
      const rank = (r: Relationship) => {
        const l = tieLabel(r);
        return l === undefined ? TIE_RANK.length : TIE_RANK.indexOf(l);
      };
      return rank(ra) - rank(rb) || Math.abs(rb.opinion) - Math.abs(ra.opinion) || ia - ib;
    });
  const met = p.detail?.relationships.size ?? 0;
  const key = `ties:${p.id}`;
  const all = ui.unfolded.has(key);
  const shown = all ? rows : rows.slice(0, TIE_SHOWN);
  return (
    <>
      <div className="sect">People they know</div>
      {rows.length === 0 ? (
        <p className="quiet">No strong feelings either way yet.</p>
      ) : (
        <ul className="list">
          {shown.map(([other, rel]) => {
            const label = tieLabel(rel);
            const word = label ?? (rel.opinion > 0 ? 'thinks well of' : 'dislikes');
            return (
              <li key={other} className="ppl" style={{ padding: '3px 0' }}>
                <PersonRef m={m} a={a} sel={sel} id={other} />{' '}
                <span className="rel">
                  {word}
                  {ui.numbers ? ` · opinion ${signed(rel.opinion)}` : ''}
                </span>
                <div className="empty reason">
                  <TieReason m={m} a={a} p={p} other={other} rel={rel} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > TIE_SHOWN && (
        <button type="button" className="chip tg" onClick={() => ui.toggleUnfold(key)}>
          {all ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
      {met > rows.length && (
        <p className="quiet">
          Has met {met - rows.length} {met - rows.length === 1 ? 'other' : 'others'} with no strong
          feeling either way.
        </p>
      )}
    </>
  );
}

const STORY_SHOWN = 12;

/** "At the site", Memories and the legends: what has happened to this person (M3.11). */
function StorySection({
  m,
  a,
  ui,
  p,
  bio,
  notable,
}: {
  m: SiteModel;
  a: PanelActions;
  ui: PaneUi;
  p: Person;
  bio: ReturnType<typeof biography> | null;
  notable: boolean;
}) {
  const id = p.id;
  // Deeds since watching began are in "At the site" above.
  const legendIds = (bio?.lines ?? [])
    .map((line) => line.eventId)
    .filter((e) => (m.index.event(e)?.day ?? 0) < m.active.enteredDay);
  const events = m.index
    .events({ kind: 'person', id })
    .flatMap((eid) => {
      const e = m.index.event(eid);
      return e && e.day >= m.active.enteredDay ? [e] : [];
    })
    .reverse();
  const key = `story:${id}`;
  const all = ui.unfolded.has(key);
  const memories = [...(p.detail?.memories ?? [])].sort((x, y) => y.createdDay - x.createdDay);
  return (
    <>
      <div className="sect">At the site</div>
      {events.length === 0 ? (
        <p className="quiet">Nothing yet since you began watching.</p>
      ) : (
        <ul className="list">
          {(all ? events : events.slice(0, STORY_SHOWN)).map((e) => (
            <EventItem
              key={e.id}
              m={m}
              a={a}
              ui={ui}
              id={e.id}
              path={`s${id}>${e.id}`}
              label={shortDay(e.day)}
            />
          ))}
        </ul>
      )}
      {events.length > STORY_SHOWN && (
        <button type="button" className="chip tg" onClick={() => ui.toggleUnfold(key)}>
          {all ? 'Show fewer' : `Show all ${events.length}`}
        </button>
      )}
      <div className="sect">Memories</div>
      {memories.length === 0 ? (
        <p className="quiet">Nothing weighs on their mind.</p>
      ) : (
        <ul className="quiet" style={{ margin: 0, paddingLeft: 18 }}>
          {memories.map((mem, k) => {
            const def = m.content.memories.find((d) => d.id === mem.type);
            const about = mem.about === undefined ? undefined : m.world.people.get(mem.about)?.name;
            return (
              <li key={k}>
                {def ? fillTemplate(def.text, { about: about ?? 'someone' }) : mem.type}
                <span className="empty"> · {briefDate(mem.createdDay)}</span>
                {mem.eventId !== undefined && (
                  <>
                    {' · '}
                    <EventLink a={a} id={mem.eventId}>
                      what happened
                    </EventLink>
                  </>
                )}
                {ui.numbers ? ` ${signed(mem.moodDelta)}` : ''}
              </li>
            );
          })}
        </ul>
      )}
      {notable && (
        <>
          <div className="sect">
            From the legends <span className="r">before you arrived</span>
          </div>
          {legendIds.length > 0 ? (
            <LegendLines m={m} a={a} ui={ui} ids={legendIds} prefix={`p${id}>`} />
          ) : (
            <p className="quiet">No recorded deeds yet.</p>
          )}
        </>
      )}
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
    </>
  );
}

const PERSON_TABS: [PersonTab, string][] = [
  ['now', 'Now'],
  ['ties', 'Ties'],
  ['story', 'Story'],
  ['skills', 'Skills'],
];

/** M3.5: someone who died while the site was watched. */
function DeadPage({
  m,
  a,
  sel,
  p,
}: {
  m: SiteModel;
  a: PanelActions;
  sel: Selection | null;
  p: Person;
}) {
  const event = p.deathEvent === undefined ? undefined : eventOf(m, p.deathEvent);
  return (
    <div className="page">
      <div>
        <div className="kind">Person · dead</div>
        <h3>{p.name}</h3>
      </div>
      <Facts>
        <Fact term="Died">
          {p.diedDay !== undefined ? `${dayText(p.diedDay)}. ` : ''}
          {event ? (
            <EventLink a={a} id={event.id}>
              {m.narrator.renderEvent(event)}
            </EventLink>
          ) : (
            (p.causeOfDeath ?? '')
          )}
        </Fact>
      </Facts>
      <FamilyBlock m={m} a={a} sel={sel} p={p} />
    </div>
  );
}

function PersonPage({ m, a, sel, ui, id }: PanelProps & { id: Id }) {
  const p = m.world.people.get(id);
  const mark = m.scene.marks.get(id);
  if (p && p.diedDay !== undefined) return <DeadPage m={m} a={a} sel={sel} p={p} />;
  if (!p || !mark) return <p className="quiet">That person is no longer at the site.</p>;
  const h = m.active.households.get(p.family.householdId ?? -1);
  const home = h?.home == null ? undefined : m.active.buildings.get(h.home);
  const race = m.content.races.find((r) => r.id === p.raceId);
  const culture = m.content.cultures.find((c) => c.id === p.cultureId);
  const notable = mark.role === 'notable' || mark.role === 'jarl';
  const bio = notable
    ? biography(m.world, m.content, m.narrator, m.index, { kind: 'person', id })
    : null;
  const she = p.sex === 'f';
  const kindWord = mark.band === 'child' ? 'child' : mark.band === 'elder' ? 'elder' : 'adult';
  const tier = tierOfPower(p.magic.power);
  const carried = heldItems(m.world, m.content, id);
  const powerNow = effectivePower(p, carried);
  const powerItems = carried.filter((c) => c.def.effects?.some((e) => e.kind === 'power'));
  const work = workInfo(m, p, mark.band);
  const hallHome = home?.defId === 'hall';
  const homeId = h?.home ?? null;
  const today = (p.detail?.today ?? []).flatMap((spent, block) =>
    spent.activity || spent.with !== undefined
      ? [`${cap(DAY_BLOCKS[block] ?? '')}: ${doingText(m, spent, homeId)}`]
      : [],
  );
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
      <div className="toolrow">
        <div className="seg" role="group" aria-label="Sections" data-testid="person-sections">
          {PERSON_TABS.map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              aria-pressed={ui.personTab === tab}
              onClick={() => ui.setPersonTab(tab)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="chip tg"
          aria-pressed={ui.numbers}
          onClick={() => ui.setNumbers(!ui.numbers)}
        >
          Numbers
        </button>
      </div>
      {ui.personTab === 'now' && (
        <>
          <Facts>
            <Fact term="Age">
              {mark.age} · {she ? 'female' : 'male'} · {race?.name}
              {culture ? `, ${culture.name}` : ''}
            </Fact>
            {p.detail && (
              <Fact term="Health">
                {p.health}
                {p.detail.abed ? ' · abed' : ''}
                {(p.detail.conditions ?? []).map((c, k) => (
                  <div key={k} className="empty">
                    {conditionText(m, c, mark.age)}
                  </div>
                ))}
              </Fact>
            )}
            {notable && p.title && (
              <Fact term="Known as">
                {p.title === 'ruler' ? m.ruleWord : (TITLE_TEXT[p.title] ?? p.title)}
                {p.fame ? ` · fame ${p.fame}` : ''}
              </Fact>
            )}
            <Fact term="Work">
              {work.text}
              {work.why && <span className="empty"> · {work.why}</span>}
            </Fact>
            <Fact term="Doing">{doingText(m, lastSpent(p), homeId)}</Fact>
            {today.length > 0 && (
              <Fact term="Today">
                <div data-testid="today">
                  {today.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              </Fact>
            )}
          </Facts>
          <LifePage m={m} a={a} p={p} numbers={ui.numbers} />
        </>
      )}
      {ui.personTab === 'ties' && (
        <div className="stack" data-testid="ties">
          <FamilyBlock m={m} a={a} sel={sel} p={p}>
            {h && (
              <Fact term="Household">
                <SelectLink a={a} to={{ kind: 'household', id: h.id }}>
                  {householdName(m, h)}
                </SelectLink>{' '}
                · {h.members.length === 1 ? 'lives alone' : `${h.members.length} people`} ·{' '}
                {hallHome ? `the ${m.ruleWord}'s hall` : home ? `home ${home.id}` : 'no home'}
                {lodgingText(m, h) && <span className="empty"> · {lodgingText(m, h)}</span>}
              </Fact>
            )}
          </FamilyBlock>
          <KnownPeople m={m} a={a} ui={ui} sel={sel} p={p} />
        </div>
      )}
      {ui.personTab === 'story' && (
        <StorySection m={m} a={a} ui={ui} p={p} bio={bio} notable={notable} />
      )}
      {ui.personTab === 'skills' && (
        <>
          <Facts>
            <Fact term="Magic">
              {p.magic.power > 0 || powerNow > 0 ? (
                <>
                  {TIER_TEXT[tier]}{' '}
                  <span className="empty">
                    ({affinityWords(m, p)}power {p.magic.power}
                    {powerNow !== p.magic.power
                      ? `, ${powerNow} with the ${powerItems.map((c) => c.def.name).join(' and the ')}`
                      : ''}
                    )
                  </span>
                </>
              ) : (
                <span className="empty">none</span>
              )}
            </Fact>
          </Facts>
          <SkillsSection m={m} p={p} numbers={ui.numbers} />
          <LoreSection m={m} a={a} p={p} />
          <CarriesSection m={m} a={a} p={p} />
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
        </>
      )}
    </div>
  );
}

function HouseholdPage({ m, a, sel, ui, h }: PanelProps & { h: Household }) {
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
  // Pairs inside the household where one holds the other as enemy or rival, or has a grudge.
  const tensions = h.members.flatMap((from) => {
    const holder = m.world.people.get(from);
    return h.members.flatMap((to) => {
      const rel = holder?.detail?.relationships.get(to);
      if (!holder || !rel || from === to) return [];
      const word = rel.labels.includes('enemy')
        ? 'is an enemy of'
        : rel.labels.includes('rival')
          ? 'is a rival of'
          : rel.grudge
            ? 'holds a grudge against'
            : null;
      return word ? [{ from, to, word, holder, rel }] : [];
    });
  });
  // The last six site events that name a member, newest first (events are in time order).
  const lately: SimEvent[] = [];
  for (let k = m.world.events.length - 1; k >= 0 && lately.length < 6; k--) {
    const e = m.world.events[k]!;
    if (e.day < m.active.enteredDay) break;
    if (e.actors.some((x) => h.members.includes(x)) && m.index.event(e.id)) lately.push(e);
  }
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
        {lodgingText(m, h) && <Fact term="Lodging">{lodgingText(m, h)}</Fact>}
        {b && burntText(m, b) && <Fact term="Fire">{burntText(m, b)}</Fact>}
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
                {p?.detail?.activity && (
                  <span className="empty">
                    {' · '}
                    {ACTIVITY_SHORT[p.detail.activity]}
                    {!ui.numbers && ` · ${moodWord(p.detail.mood)}`}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {tensions.length > 0 && (
        <>
          <div className="sect">Tensions</div>
          <ul className="list">
            {tensions.map((t) => (
              <li key={`${t.from}:${t.to}`} className="ppl" style={{ padding: '3px 0' }}>
                <PersonLink m={m} a={a} sel={sel} id={t.from} /> {t.word}{' '}
                <PersonLink m={m} a={a} sel={sel} id={t.to} />
                <div className="empty reason">
                  <TieReason m={m} a={a} p={t.holder} other={t.to} rel={t.rel} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {lately.length > 0 && (
        <>
          <div className="sect">Lately</div>
          <ul className="list">
            {lately.map((e) => (
              <EventItem
                key={e.id}
                m={m}
                a={a}
                ui={ui}
                id={e.id}
                path={`h${h.id}>${e.id}`}
                label={shortDay(e.day)}
              />
            ))}
          </ul>
        </>
      )}
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
  well: 'Fresh water for the whole village. Like every building it wears, and the steward has builders repair it.',
  stockpile: "Holds the followed share of the village's goods. See the Site tab for counts.",
  shrine: 'The shrine of the faith. Festivals and funerals happen here from M3.7.',
  dock: 'Boats tie up here on the coast. Fishing and caravans by sea arrive with M3.3 and M3.10.',
  hall: 'Where the ruler lives and the village gathers.',
  workshop:
    'Toolmakers and craftsmen turn logs and ore into tools and wares here. Tools make farming and heavy work faster.',
  field:
    'Farmland. Farmers sow it in Seedmonth and cut it in Goldmonth and Harvestmonth; each harvest wears the soil a little, and a field left bare for a year recovers.',
  wall: 'A wall segment. The steward does not order one yet.',
};

/** Residents whose last work block was at this building, with the job they were given. */
function workersAt(m: SiteModel, b: Building, test: (job: JobDef) => boolean): Id[] {
  return m.active.residents.filter((id) => {
    const detail = m.world.people.get(id)?.detail;
    if (detail?.activity !== 'work' || detail.placeId !== b.id) return false;
    const job =
      detail.jobId === undefined ? undefined : m.content.jobs.find((j) => j.id === detail.jobId);
    return job !== undefined && test(job);
  });
}

function PeopleLinks({
  m,
  a,
  sel,
  ids,
}: {
  m: SiteModel;
  a: PanelActions;
  sel: Selection | null;
  ids: Id[];
}) {
  return (
    <>
      {ids.map((id, k) => (
        <Fragment key={id}>
          {k > 0 && ', '}
          <PersonLink m={m} a={a} sel={sel} id={id} />
        </Fragment>
      ))}
    </>
  );
}

/** Hauled-and-waiting materials against what the building takes in all, in words. */
function materialsText(m: SiteModel, b: Building): string[] {
  const def = buildingDef(m.content.site, b.defId);
  return Object.entries(def.cost ?? {}).map(([item, need]) => {
    const name = m.content.items.find((i) => i.id === item)?.name ?? item;
    return `${Math.round(b.delivered?.[item] ?? 0)} of ${need} ${name} at the site`;
  });
}

function BuildingPage({ m, a, sel, ui, b }: PanelProps & { b: Building }) {
  const unfinished = b.progress !== undefined;
  if (!unfinished && (b.defId === 'home' || b.defId === 'hall')) {
    const h = homeHousehold(m, b);
    if (h) return <HouseholdPage m={m} a={a} sel={sel} ui={ui} h={h} />;
    if (!b.followed || b.defId === 'home') return <CountedHomePage m={m} />;
  }
  void ui;
  const steward = m.content.steward;
  const name = buildingLabel(m.content.site, b.defId, m.scene.jarl);
  const builders = unfinished ? workersAt(m, b, (j) => j.action === 'build') : [];
  const haulers = unfinished ? workersAt(m, b, (j) => j.action === 'haul') : [];
  const farmers = b.defId === 'field' ? workersAt(m, b, (j) => j.workplace === 'field') : [];
  const owner = b.owner;
  const worn = !unfinished && b.defId !== 'field' && b.condition < steward.repairBelow;
  const blurb = unfinished
    ? `A ${name.toLowerCase()} is being raised. Haulers carry logs and stone from the stockpile; builders put them in place.${
        b.defId === steward.homeBuilding ? ' A household moves in when it is done.' : ''
      }`
    : (BUILDING_BLURB[b.defId] ?? '');
  return (
    <div className="page">
      <div>
        <div className="kind">Building{unfinished ? ' · being built' : ''}</div>
        <h3>{name}</h3>
      </div>
      <p className="summary">{blurb}</p>
      <Facts>
        <Fact term="Size">
          {b.w}×{b.h} tiles
        </Fact>
        {burntText(m, b) && <Fact term="Fire">{burntText(m, b)}</Fact>}
        {unfinished ? (
          <>
            <Fact term="Progress">{buildPercent(m.content.site, b)}% built</Fact>
            {materialsText(m, b).length > 0 && (
              <Fact term="Materials">{materialsText(m, b).join('; ')}</Fact>
            )}
            {owner !== null && (
              <Fact term="For">
                <PersonLink m={m} a={a} sel={sel} id={owner} />
              </Fact>
            )}
            <Fact term="Builders">
              {builders.length > 0 ? (
                <PeopleLinks m={m} a={a} sel={sel} ids={builders} />
              ) : (
                <span className="empty">none at work just now</span>
              )}
            </Fact>
            <Fact term="Haulers">
              {haulers.length > 0 ? (
                <PeopleLinks m={m} a={a} sel={sel} ids={haulers} />
              ) : (
                <span className="empty">none at work just now</span>
              )}
            </Fact>
          </>
        ) : (
          b.defId !== 'field' && (
            <Fact term="Condition">
              {Math.round(b.condition)} of 100
              {worn && <span className="empty"> · needs repair (below {steward.repairBelow})</span>}
            </Fact>
          )
        )}
        {b.defId === 'field' && (
          <Fact term="Farmers">
            {farmers.length > 0 ? (
              <PeopleLinks m={m} a={a} sel={sel} ids={farmers} />
            ) : (
              <span className="empty">nobody in the field just now</span>
            )}
          </Fact>
        )}
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
  // M3.4: a field's crop, fire and burnt ground, and the woods being felled and grown back.
  const { active, content, world } = m;
  const building = map.building[k] ? active.buildings.get(map.building[k]!) : undefined;
  const field = building?.defId === 'field' ? fieldFacts(building) : null;
  const burning = active.fire?.tiles.get(k);
  const burnt = active.burnt.find((t) => t.tile === k);
  const burntHome = building && !field ? burntText(m, building) : null;
  const felled = active.woods.felled.find((f) => f.tile === k);
  const wild = content.environment.wild;
  const logsLeft = map.tree[k] ? Math.round(active.woods.wood.get(k) ?? wild.woodPerTree) : 0;
  const yearsBack = felled
    ? Math.max(1, Math.round((felled.regrow - world.day) / DAYS_PER_YEAR))
    : 0;
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
        {field ? (
          <Fact term="Field">
            {[field.stage, field.growth, field.health].filter(Boolean).join(' · ')}
          </Fact>
        ) : (
          !wet && soil !== undefined && <Fact term="Soil">{soil} of 100</Fact>
        )}
        {field && (
          <Fact term="Soil">
            {field.soil} · {field.water}
          </Fact>
        )}
        {burning !== undefined && (
          <Fact term="Fire">
            <span className="warnw">Burning</span> · about {Math.max(1, burning)}{' '}
            {burning === 1 ? 'block' : 'blocks'} of fuel left
          </Fact>
        )}
        {burntHome && <Fact term="Fire">{burntHome}</Fact>}
        {burnt && !building && (
          <Fact term="Fire">Burnt on {briefDate(burnt.day)}; the ground is dark for a month</Fact>
        )}
        {treeName && (
          <Fact term="Timber">
            one tree ({treeName.replace(/ trees$/, '')}) · {logsLeft} logs of wood left
          </Fact>
        )}
        {felled && (
          <Fact term="Felled">
            young trees grow back in about {yearsBack} {yearsBack === 1 ? 'year' : 'years'}
          </Fact>
        )}
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
    return h ? <HouseholdPage m={m} a={a} sel={sel} ui={props.ui} h={h} /> : null;
  }
  if (sel.kind === 'building') {
    const b = m.active.buildings.get(sel.id);
    return b ? <BuildingPage {...props} b={b} /> : null;
  }
  return <TilePage m={m} k={sel.id} />;
}

// ---- Site ----

// The stockpile's cards: a title and which stocked items it gathers. Tools sit with goods.
const STOCK_CARDS: [name: string, test: (item: ItemDef) => boolean][] = [
  ['Food', (i) => i.good === 'food'],
  ['Timber', (i) => i.good === 'timber'],
  ['Ore and stone', (i) => i.good === 'ore' && i.kind !== 'tool'],
  ['Salt', (i) => i.good === 'salt'],
  ['Goods', (i) => i.good === 'luxury' || i.kind === 'tool'],
];

/** M3.9: the site's hedge-witch, cantrips known and lost, books and what the cantrips did. */
/** A cantrip known by this many or fewer, with no book here, is marked as at risk of dying out. */
const AT_RISK_KNOWERS = 2;
/** Stress a bad day adds (life.stressRise at the mood floor, roughly): calmed stress in days. */
const CALM_PER_BAD_DAY = 15;

function LoreFacts({ m, a }: { m: SiteModel; a: PanelActions }) {
  const { world, active, content } = m;
  const lore = active.lore;
  const knownBy = new Map<string, number>();
  const wanted = new Set<string>();
  for (const id of active.residents) {
    const p = world.people.get(id);
    if (!p) continue;
    for (const ab of p.knownAbilities) knownBy.set(ab, (knownBy.get(ab) ?? 0) + 1);
    if (p.magic.power > 0) for (const ab of learnableCantrips(content, p)) wanted.add(ab.id);
  }
  const name = (id: string) => content.abilities.find((x) => x.id === id)?.name ?? id;
  // Most known first, as the table of knowers reads; ties in content order.
  const known = content.lore.cantrips
    .filter((id) => (knownBy.get(id) ?? 0) > 0)
    .sort((x, y) => knownBy.get(y)! - knownBy.get(x)!);
  const lost = content.lore.cantrips.filter((id) => wanted.has(id) && !knownBy.has(id));
  const books = [...world.items.values()].filter(
    (it) => it.kind === 'book' && it.holder !== null && active.residents.includes(it.holder),
  );
  // At risk of dying out: two knowers or fewer and no book here that teaches it.
  const schools = new Set(books.map((it) => bookSchool(content, it.form)));
  const atRisk = (id: string) => {
    const ab = content.abilities.find((x) => x.id === id);
    return knownBy.get(id)! <= AT_RISK_KNOWERS && !(ab?.school && schools.has(ab.school));
  };
  const st = lore.stats;
  const done = [
    st.logsSaved >= 1 && `${count(st.logsSaved)} logs saved by kindled hearths`,
    st.frostsRead > 0 &&
      `${st.frostsRead} ${st.frostsRead === 1 ? 'frost' : 'frosts'} read in time`,
    st.soothed > 0 &&
      `${count(st.soothed)} ${st.soothed === 1 ? 'hurt' : 'hurts'} soothed` +
        (st.herbsSpared > 0 ? ` (about ${count(st.herbsSpared)} herbs spared)` : ''),
    st.calmed >= 1 && `about ${count(st.calmed / CALM_PER_BAD_DAY)} bad days calmed`,
    st.mended >= 1 &&
      `about ${count(st.mended * content.steward.conditionLossDays)} days of wear mended`,
  ].filter((x): x is string => Boolean(x));
  const witch = lore.hedgeWitch;
  return (
    <>
      <div className="sect" data-testid="lore-site">
        Lore{' '}
        <span className="r">
          <button type="button" className="lk" onClick={() => a.showChronicle('magic')}>
            {st.learned} learned
          </button>{' '}
          · {st.awakenings} {st.awakenings === 1 ? 'awakening' : 'awakenings'}
        </span>
      </div>
      <Facts>
        <Fact term="Hedge-witch">
          {witch !== null && m.scene.marks.has(witch) ? (
            <PersonLink m={m} a={a} sel={null} id={witch} />
          ) : (
            <span className="empty">none: no gifted person here knows a cantrip</span>
          )}
        </Fact>
        <Fact term="Cantrips">
          {known.length > 0
            ? known.map((id, k) => (
                <span key={id}>
                  {k > 0 && ', '}
                  {atRisk(id) ? (
                    <span className="warnw" title="Few know it and no book here teaches it">
                      {name(id)} {knownBy.get(id)} · no book
                    </span>
                  ) : (
                    `${name(id)} ${knownBy.get(id)}`
                  )}
                </span>
              ))
            : 'none known'}
          {lost.length > 0 && (
            <span className="warnw">
              {' · '}
              {joinList(lost.map(name))}: wanted, but no one here knows{' '}
              {lost.length === 1 ? 'it' : 'them'}
            </span>
          )}
        </Fact>
        <Fact term="Books">
          {books.length === 0 ? (
            <span className="empty">none here</span>
          ) : (
            books.map((it) => {
              const loan = lore.loans.find((l) => l.item === it.id);
              return (
                <div key={it.id}>
                  <LegendsLink a={a} to={{ kind: 'item', id: it.id }}>
                    {cap(it.name)}
                  </LegendsLink>
                  <span className="empty">
                    {bookLine(m, it.id, it.form)}
                    {' · '}
                  </span>
                  <PersonLink m={m} a={a} sel={null} id={it.holder!} />
                  {loan && (
                    <>
                      <span className="empty">{', lent to '}</span>
                      <PersonLink m={m} a={a} sel={null} id={loan.borrower} />
                    </>
                  )}
                </div>
              );
            })
          )}
          {st.lost > 0 && (
            <div className="warnw">
              {st.lost} {st.lost === 1 ? 'book' : 'books'} lost since you began watching
            </div>
          )}
        </Fact>
        {done.length > 0 && <Fact term="Cantrips did">{done.join(' · ')}</Fact>}
      </Facts>
    </>
  );
}

export function SitePane({ m, a, ui }: Omit<PanelProps, 'sel'>) {
  const { site, active, scene, world, content } = m;
  // M3.11: the newest season or year recap of the days watched.
  const recapTypes = [content.chronicle.recap.seasonType, content.chronicle.recap.yearType];
  let lastRecap: SimEvent | undefined;
  for (let i = world.events.length - 1; i >= 0; i -= 1) {
    const event = world.events[i]!;
    if (event.day < active.enteredDay) break;
    if (recapTypes.includes(event.type) && m.index.event(event.id)) {
      lastRecap = event;
      break;
    }
  }
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
  const cards = STOCK_CARDS.map(([name, test]) => {
    const items = content.items
      .filter((i) => i.kind !== 'artifact' && i.kind !== 'book' && test(i))
      .map((i) => ({ item: i, n: itemCount(active, i.id) }));
    return {
      name,
      items: items.filter((x) => x.n >= 0.5 && x.item.kind !== 'tool'),
      hasTools: items.some((x) => x.n >= 0.5 && x.item.kind === 'tool'),
      total: items.reduce((t, x) => t + (x.item.kind === 'tool' ? 0 : x.n), 0),
    };
  });
  const have = cards.filter((c) => c.items.length > 0 || c.hasTools);
  const none = cards
    .filter((c) => c.items.length === 0 && !c.hasTools)
    .map((c) => c.name.toLowerCase());
  const cells = world.cells;
  const biome = cells ? content.biomes[cells.biome[site.cell]!]?.name : undefined;
  const foodDays = Math.round(foodDaysLeft(world, content));
  const built = [...active.buildings.values()].filter((b) => b.progress === undefined);
  const raising = [...active.buildings.values()].filter((b) => b.progress !== undefined);
  const homes = built.filter((b) => b.defId === 'home');
  const fields = built.filter((b) => b.defId === 'field').length;
  const other = built.filter((b) => !['home', 'field', 'hall'].includes(b.defId));
  const toolItem = content.items.find((i) => i.kind === 'tool');
  const tools = toolItem ? Math.floor(itemCount(active, toolItem.id)) : 0;
  const perWorker = content.steward.toolsPerWorker;
  // Workers per job, from what the steward gave each person today.
  const perJob = new Map<string, number>();
  let unemployed = 0;
  for (const id of active.residents) {
    const person = world.people.get(id);
    const jobId = person?.detail?.jobId;
    if (jobId !== undefined) perJob.set(jobId, (perJob.get(jobId) ?? 0) + 1);
    else if (scene.marks.get(id)?.band !== 'child') unemployed += 1;
  }
  const open = openConstruction(active);
  const repairs = repairsDue(active, content.steward);
  const concern =
    active.stewardFocus === 'food'
      ? `Food first: ${foodDays} days left`
      : open
        ? `Raising a ${buildingLabel(content.site, open.defId, false).toLowerCase()}`
        : repairs > 0
          ? `Repairs: ${repairs} ${repairs === 1 ? 'building' : 'buildings'} below ${content.steward.repairBelow}`
          : 'Nothing pressing';
  const weather = active.weather;
  const dryLimit = weather.year.drought
    ? content.environment.crop.droughtDryDays
    : content.environment.crop.dryDays;
  const skyText =
    weather.dryDays > dryLimit
      ? `dry, ${weather.dryDays} days without rain`
      : weather.sky === 'snow' || weather.snowCover > 0
        ? weather.sky === 'snow'
          ? 'snow falling'
          : 'snow lying'
        : weather.sky;
  const today = `${weather.tempC < 0 ? '−' : ''}${Math.abs(Math.round(weather.tempC))} °C`;
  // M3.8: a threat coming or at the gates, named with its arrival (or first sign) and the live count.
  const threat = m.active.threat;
  const danger = threatLine({ world: m.world, active: m.active, content: m.content });
  const dangerEvent = threat ? (threat.arriveEvent ?? threat.signEvent) : undefined;
  // M3.8: walls the steward planned after an attack: standing, rising and still planned.
  const wallsAfter = m.active.threats.wallsAfter;
  const wallsEvent = wallsAfter === undefined ? undefined : eventOf(m, wallsAfter);
  const wallId = m.content.threats.walls.building;
  let wallsUp = 0;
  let wallsRising = 0;
  for (const b of m.active.buildings.values()) {
    if (b.defId !== wallId) continue;
    if (b.progress === undefined) wallsUp += 1;
    else wallsRising += 1;
  }
  const wallsWaiting = m.active.threats.wallPlan.length;
  const season = seasonRows({ world, active, content });
  const steward = stewardLine({ world, active, content }, (id) => eventOf(m, id));
  const rulerName = m.ruler ? m.scene.marks.get(m.ruler.id)?.name : undefined;
  return (
    <div className="page">
      <div>
        <div className="kind">Site · {site.kind}</div>
        <h3>{site.name}</h3>
      </div>
      {bio.summary.length > 0 && <p className="summary">{cap(bio.summary.join(' '))}</p>}
      {lastRecap && (
        <>
          <div className="sect">
            The historian&apos;s last word{' '}
            <button type="button" className="why" onClick={() => a.showChronicle('recap')}>
              all recaps
            </button>
          </div>
          <ul className="chron">
            <RecapCard m={m} a={a} ui={ui} id={lastRecap.id} path={`sr${lastRecap.id}`} />
          </ul>
        </>
      )}
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
      </Facts>
      <LoreFacts m={m} a={a} />
      <Facts>
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
          {today} · {skyText} · daylight {weather.daylightH} h
          {weather.wellLow && <span className="warnw"> · the well is low</span>}
          {weather.outdoorDark && <span className="empty"> · too dark for outdoor work</span>}
        </Fact>
        {threat && danger && (
          <Fact term="Danger">
            {dangerEvent === undefined ? (
              <span className="warnw">{threat.name}</span>
            ) : (
              <EventLink a={a} id={dangerEvent}>
                {threat.name}
              </EventLink>
            )}
            <span className="warnw">: {danger}</span>
          </Fact>
        )}
        {wallsEvent && (
          <Fact term="Walls">
            {[
              wallsUp > 0 && `${wallsUp} standing`,
              wallsRising > 0 && `${wallsRising} rising`,
              wallsWaiting > 0 && `${wallsWaiting} planned`,
            ]
              .filter(Boolean)
              .join(', ') || 'none yet'}
            , begun after{' '}
            <EventLink a={a} id={wallsEvent.id}>
              the attack of {briefDate(wallsEvent.day)}
            </EventLink>
          </Fact>
        )}
      </Facts>
      <div className="sect" data-testid="season">
        Season{' '}
        <span className="r">
          {dateOf(shownBlock(m).day).season} · {MONTH_NAMES[dateOf(shownBlock(m).day).month]}
        </span>
      </div>
      <Facts>
        {season.map((row) => (
          <Fact key={row.term} term={row.term}>
            <span className={row.warn ? 'warnw' : undefined}>{row.text}</span>
            {row.cause && (
              <>
                {' · '}
                <span className="empty">{row.cause.word} </span>
                <EventLink a={a} id={row.cause.id}>
                  {causeTitle(m, row.cause.id)}
                </EventLink>
              </>
            )}
          </Fact>
        ))}
        {steward && (
          <Fact term="Steward">
            <span className="warnw">
              {steward.cut === null ? (
                steward.text
              ) : (
                <EventLink a={a} id={steward.cut}>
                  {steward.text}
                </EventLink>
              )}
            </span>
            {steward.because && (
              <>
                {', after '}
                <EventLink a={a} id={steward.because.id}>
                  {steward.because.phrase ?? 'what came before'}
                </EventLink>
              </>
            )}
          </Fact>
        )}
      </Facts>
      <div className="sect">
        Stockpile{' '}
        <span className="r">
          {Math.round(share * 100)}% of the village&apos;s goods: the followed share
        </span>
      </div>
      <div className="stock">
        {have.map((c) => (
          <div key={c.name} data-testid={`stock-${c.name.toLowerCase().replace(/ /g, '-')}`}>
            <b>
              {count(c.name === 'Food' ? foodMeals(active, content) : c.total)}
              {c.name === 'Food' ? ' meals' : ''}
            </b>
            <span>
              {c.name}
              {c.items.length > 0
                ? ` · ${c.items.map((x) => `${count(x.n)} ${x.item.cooked ? 'cooked' : x.item.name}`).join(', ')}`
                : ''}
            </span>
            {c.name === 'Food' && (
              <span>
                ≈ {foodDays} days for {followed} people
              </span>
            )}
            {c.hasTools && (
              <span>
                {count(tools)} tools, enough for {count(Math.floor(tools / perWorker))} workers
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
      <div className="sect">Work</div>
      <p className="quiet" data-testid="steward-concern">
        {concern}
      </p>
      <Facts>
        {content.jobs
          .filter((j) => (perJob.get(j.id) ?? 0) > 0)
          .map((j) => (
            <Fact key={j.id} term={j.name}>
              {perJob.get(j.id)} {perJob.get(j.id) === 1 ? 'person' : 'people'}
            </Fact>
          ))}
        {unemployed > 0 && <Fact term="No work set">{unemployed} grown people</Fact>}
      </Facts>
      <div className="sect">Buildings</div>
      <Facts>
        {raising.map((b) => {
          const mats = materialsText(m, b);
          return (
            <Fact key={b.id} term="Being built">
              <SelectLink a={a} to={{ kind: 'building', id: b.id }}>
                {buildingLabel(content.site, b.defId, false).toLowerCase()}
              </SelectLink>{' '}
              · {buildPercent(content.site, b)}%{mats.length > 0 ? ` · ${mats.join('; ')}` : ''}
            </Fact>
          );
        })}
        <Fact term="Homes">
          {homes.filter((b) => b.followed).length} followed, {scene.counted.length} counted
          {built.length > 0 && built.some((b) => b.defId === 'hall')
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
  ['working', 'at work', (mark, m) => m.world.people.get(mark.id)?.detail?.activity === 'work'],
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
    const detail = m.world.people.get(id)?.detail;
    if (detail?.with !== undefined) return ` · With ${m.names.get(detail.with) ?? 'a carer'}`;
    const activity = detail?.activity;
    if (activity === 'work') {
      const job =
        detail?.jobId === undefined ? undefined : m.content.jobs.find((j) => j.id === detail.jobId);
      if (job) return ` · ${job.name.toLowerCase()}`;
    }
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
