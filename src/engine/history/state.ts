// Per-run state of the history stage. It lives here, not on `WorldState`: disease immunity,
// cooldowns, links and the latest event per site only matter while the years run.

import { createEmitter, type EmitInput } from '../core/context';
import type { ContentBundle, EventTypeDef, HistoryRules, RaceDef } from '../core/content-types';
import { streamFor, type RngStream } from '../core/rng';
import type { Civ, Goods, Id, SimEvent, Site, WorldCells, WorldState } from '../core/types';
import type { SiteLinks, LinkSearch } from './links';
import { emitScored } from './importance';
import { nearestAuraSpot, type SettleContent, type SettleSearch } from './settle';

/** What the history stage reads from content. */
export type HistoryContent = SettleContent &
  Pick<
    ContentBundle,
    'history' | 'creatures' | 'dragons' | 'places' | 'diseases' | 'notables' | 'threats'
  >;

/** The latest events that touched one site, for linking causes. */
export interface SiteLog {
  /** The event that created the site (civ_founded or site_founded). */
  origin?: Id;
  badHarvest?: { year: number; event: Id };
  famine?: { year: number; event: Id };
  /** The latest disease to strike the site. */
  disease?: { year: number; event: Id };
  /** Bad years that stayed under the event threshold (stores held). */
  badYears?: number;
  /** The latest bad year inside a climate epoch, and the epoch's opening event. */
  epoch?: { year: number; event: Id };
  grew?: Id;
  /** The last migration event out of the site. */
  migration?: { year: number; event: Id };
  /** The last beast raid on the site. */
  raided?: { year: number; event: Id };
}

/** A dry or cold spell over part of the map (M2.4b). */
export interface Epoch {
  id: number;
  kind: 'dry' | 'cold';
  cell: number;
  radius: number;
  start: number;
  /** Last year the epoch is active. */
  end: number;
  /** The dry_years_began or cold_years_began event. */
  began: Id;
  /** Set once the ending event is emitted. */
  ended?: boolean;
}

/** One disease's spread through the run. */
export interface DiseaseState {
  /** Last year a site cannot still be infected. */
  immuneUntil: Map<Id, number>;
  /** Sites infected last year, with their event, to spread this year. */
  infected: Map<Id, Id>;
}

/** Importance scoring and rollup bookkeeping (importance.ts). */
export interface ImportanceState {
  /** The plain emitter; `emitScored` adds the importance bonus on top. */
  base: (input: EmitInput) => SimEvent;
  /** Content event types by id. */
  types: ReadonlyMap<string, EventTypeDef>;
  /** Event types emitted so far in the run (novelty). */
  seen: Set<string>;
  /** Year of the latest event per `${type}@${place}` (repeat penalty). */
  lastAt: Map<string, number>;
  /** Trivial history events by id, kept or pruned at the end. */
  trivial: Set<Id>;
  /** This year's trivial events per type, in first-seen order. */
  yearCounts: Map<string, number>;
  /** First event id emitted by the history stage; earlier events are settle's and always kept. */
  firstId: Id;
}

/** A war between two civs (M2.4); the events are the record, wars are not saved with the world. */
export interface War {
  id: number;
  attacker: Id;
  defender: Id;
  started: number;
  ended?: number;
  /** The war_declared event. */
  cause: Id;
  /** The latest event of the war, the cause of the next battle. */
  lastEvent: Id;
  /** Adults killed in all, and on each side. */
  dead: number;
  attackerDead: number;
  defenderDead: number;
  /** Adults at the start, for war weariness. */
  attackerAdults: number;
  defenderAdults: number;
  /** The commanders, chosen at the declaration and replaced if they die (notables). */
  attackerCaptain?: Id | undefined;
  defenderCaptain?: Id | undefined;
  /** Champions already named in this war: later battles add fame without another line. */
  champions?: Id[];
  /** A succession war: the attacker is the claimant's realm, risen from the defender. */
  civil?: boolean;
}

/** A beaten claimant from this year's successions, who may raise part of the realm (civil-war.ts). */
export interface Claim {
  civ: Id;
  claimant: Id;
  ruler: Id;
  /** The succession_disputed event. */
  dispute: Id;
}

/** A college of magic at a site (colleges.ts); the events are the record. */
export interface College {
  name: string;
  siteId: Id;
  /** The civ that holds the site now. */
  civId: Id;
  school: string;
  founded: number;
  /** The college_founded event. */
  event: Id;
  /** Set when the college burned or was abandoned. */
  closed?: number;
}

/** A mage of another people studying at a college (colleges.ts). */
export interface Student {
  siteId: Id;
  /** Where they came from and go back to. */
  home: Id;
  until: number;
  /** Power when they arrived. */
  power: number;
  /** The mage_went_to_study event. */
  event: Id;
}

/** A pact of defence between two civs (city-states.ts). */
export interface Pact {
  a: Id;
  b: Id;
  since: number;
  /** The pact_sworn event. */
  event: Id;
  /** Wars the ally already came to, so the aid line is written once per war. */
  aided: number[];
}

/** Per-run notable bookkeeping (notables.ts); the people themselves live in `world.people`. */
export interface NotableState {
  /** Living notables in id order. */
  living: Set<Id>;
  /** Living notables by site id, rebuilt once a year (ids in order, may hold a few who since died or moved). */
  bySite: Map<Id, Id[]>;
  /** The current raider of each civ. */
  raiders: Map<Id, Id>;
  /** Avengers who have led their one vengeance raid. */
  avenged: Set<Id>;
  /** Year of each figure's latest deed (rising, slaying, battle, founding, raid, hunt). */
  lastDeed: Map<Id, number>;
  /** Year each legend last spent their day of power (a broken host or a duel): once a year. */
  spent: Map<Id, number>;
  /** Pairs of legends (`pairKey`) who have duelled; such a pair never feuds again. */
  feuds: Set<string>;
  /** Cache of the odds a birth is strong or better, by `${raceId}:${highAura}`. */
  mageOdds: Map<string, number>;
}

export interface HistoryRun {
  world: WorldState;
  cells: WorldCells;
  content: HistoryContent;
  rules: HistoryRules;
  search: SettleSearch;
  linkSearch: LinkSearch;
  links: SiteLinks;
  races: Map<string, RaceDef>;
  emit: (input: EmitInput) => SimEvent;
  rng: {
    harvest: RngStream;
    demography: RngStream;
    disease: RngStream;
    climate: RngStream;
    migration: RngStream;
    expansion: RngStream;
    names: RngStream;
    beasts: RngStream;
    dragons: RngStream;
    places: RngStream;
    trade: RngStream;
    war: RngStream;
    notables: RngStream;
    magic: RngStream;
    cityStates: RngStream;
    civilWar: RngStream;
  };
  /** Current year, 1..historyYears. */
  year: number;
  logs: Map<Id, SiteLog>;
  /** Years of the last expansion from each site. */
  lastExpansion: Map<Id, number>;
  /** Per disease id: immunity and last year's cases. */
  diseases: Map<string, DiseaseState>;
  /** Climate epochs, running and ended, in id order. */
  epochs: Epoch[];
  /** Year each civ last founded a site (the founding cooldown). */
  civLastFounded: Map<Id, number>;
  /** `${civId}:${auraSpotCell}` for every temple already built. */
  templeSpots: Set<string>;
  importance: ImportanceState;
  /** Cell to site id for every site, live or ruined (spacing checks). */
  siteAtCell: Map<number, Id>;
  /** Owning civ per cell as of the last recompute. */
  territory: Uint16Array;
  /** Set when a site changed hands or fell, so territory is recomputed at the end of the year. */
  territoryDirty: boolean;
  /** Trades this run, as flat [year, siteA, siteB, value] rows for the playback. */
  tradeRows: number[];
  wars: War[];
  /** Latest wrongs per `${aggrieved}>${offender}` civ pair (most recent three event ids). */
  grievanceEvents: Map<string, Id[]>;
  /** Year before which a `${low}-${high}` civ pair cannot declare war on each other. */
  truce: Map<string, number>;
  /** The trade_opened event per `${low}-${high}` civ pair. */
  tradeOpened: Map<string, Id>;
  /** Cached deposit counts per good near each site. */
  deposits: Map<Id, Goods>;
  notables: NotableState;
  /** Colleges of magic, open and closed, in founding order. */
  colleges: College[];
  /** Mages studying abroad, by person id. */
  students: Map<Id, Student>;
  /** Mages who went to study at a college of another people (once each); they may work spells at home. */
  studied: Set<Id>;
  /** Pacts of defence, live ones only. */
  pacts: Pact[];
  /** Beaten claimants waiting to rise or yield, cleared each year. */
  claims: Claim[];
}

/** The civil war a civ is fighting, on either side. */
export function civilWarOf(run: HistoryRun, civId: Id): War | undefined {
  return run.wars.find(
    (w) => w.civil && w.ended === undefined && (w.attacker === civId || w.defender === civId),
  );
}

/** Key for an unordered pair of civs. */
export function pairKey(a: Id, b: Id): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/** The most recent wrong event ids `from` holds against `to`. */
export function grievanceEventsOf(run: HistoryRun, from: Id, to: Id): Id[] {
  return run.grievanceEvents.get(`${from}>${to}`) ?? [];
}

/** Adds to `from`'s grievance against `to` and remembers the event behind it (keeps the latest three). */
export function addGrievance(run: HistoryRun, from: Id, to: Id, amount: number, event: Id): void {
  const civ = run.world.civs.get(from);
  if (!civ) return;
  civ.grievances.set(to, (civ.grievances.get(to) ?? 0) + amount);
  const key = `${from}>${to}`;
  run.grievanceEvents.set(key, [...(run.grievanceEvents.get(key) ?? []), event].slice(-3));
}

/** Forgets all grievance between two civs, both ways. */
export function clearGrievance(run: HistoryRun, a: Id, b: Id): void {
  run.world.civs.get(a)?.grievances.delete(b);
  run.world.civs.get(b)?.grievances.delete(a);
  run.grievanceEvents.delete(`${a}>${b}`);
  run.grievanceEvents.delete(`${b}>${a}`);
}

/** True when the two civs have an unended war. */
export function atWar(run: HistoryRun, a: Id | null, b: Id | null): boolean {
  if (a === null || b === null) return false;
  return run.wars.some(
    (w) =>
      w.ended === undefined &&
      ((w.attacker === a && w.defender === b) || (w.attacker === b && w.defender === a)),
  );
}

/** The civ's culture definition. */
export function cultureOf(run: HistoryRun, civ: Civ) {
  return run.content.cultures.find((c) => c.id === civ.cultureId);
}

export function isLive(site: Site): boolean {
  return site.ruinedYear === undefined;
}

export function logOf(run: HistoryRun, siteId: Id): SiteLog {
  let log = run.logs.get(siteId);
  if (!log) {
    log = {};
    run.logs.set(siteId, log);
  }
  return log;
}

/** Live sites in id order (a fresh array, so callers may found sites while iterating). */
export function liveSites(run: HistoryRun): Site[] {
  const out: Site[] = [];
  for (const site of run.world.sites.values()) if (isLive(site)) out.push(site);
  return out;
}

export function civOf(run: HistoryRun, site: Site): Civ | undefined {
  return site.civId === null ? undefined : run.world.civs.get(site.civId);
}

export function civName(run: HistoryRun, site: Site): string {
  return civOf(run, site)?.name ?? '';
}

/** Event ids that exist, in order, without duplicates. */
export function causesOf(...ids: (Id | undefined)[]): Id[] {
  const out: Id[] = [];
  for (const id of ids) if (id !== undefined && !out.includes(id)) out.push(id);
  return out;
}

export function createRun(
  world: WorldState,
  content: HistoryContent,
  search: SettleSearch,
  linkSearch: LinkSearch,
  links: SiteLinks,
): HistoryRun {
  const cells = world.cells;
  if (!cells) throw new Error('History needs generated cells.');
  const run: HistoryRun = {
    world,
    cells,
    content,
    rules: content.history,
    search,
    linkSearch,
    links,
    races: new Map(content.races.map((r) => [r.id, r])),
    emit: (input) => emitScored(run, input),
    rng: {
      harvest: streamFor(world, 'history.harvest'),
      demography: streamFor(world, 'history.demography'),
      disease: streamFor(world, 'history.disease'),
      climate: streamFor(world, 'history.climate'),
      migration: streamFor(world, 'history.migration'),
      expansion: streamFor(world, 'history.expansion'),
      names: streamFor(world, 'history.names'),
      beasts: streamFor(world, 'history.beasts'),
      dragons: streamFor(world, 'history.dragons'),
      places: streamFor(world, 'history.places'),
      trade: streamFor(world, 'history.trade'),
      war: streamFor(world, 'history.war'),
      notables: streamFor(world, 'history.notables'),
      magic: streamFor(world, 'history.magic'),
      cityStates: streamFor(world, 'history.cityStates'),
      civilWar: streamFor(world, 'history.civilWar'),
    },
    year: 0,
    logs: new Map(),
    lastExpansion: new Map(),
    diseases: new Map(),
    epochs: [],
    civLastFounded: new Map(),
    templeSpots: new Set(),
    importance: {
      base: createEmitter(world, content.eventTypes),
      types: new Map(content.eventTypes.map((t) => [t.id, t])),
      seen: new Set(),
      lastAt: new Map(),
      trivial: new Set(),
      yearCounts: new Map(),
      firstId: world.nextId.event,
    },
    siteAtCell: new Map(),
    territory: cells.territory,
    territoryDirty: false,
    tradeRows: [],
    wars: [],
    grievanceEvents: new Map(),
    truce: new Map(),
    tradeOpened: new Map(),
    deposits: new Map(),
    notables: {
      living: new Set(),
      bySite: new Map(),
      raiders: new Map(),
      avenged: new Set(),
      lastDeed: new Map(),
      spent: new Map(),
      feuds: new Set(),
      mageOdds: new Map(),
    },
    colleges: [],
    students: new Map(),
    studied: new Set(),
    pacts: [],
    claims: [],
  };
  for (const site of world.sites.values()) {
    run.siteAtCell.set(site.cell, site.id);
    if (site.kind === 'temple' && site.civId !== null) {
      const spot = nearestAuraSpot(cells, site.cell, content.settlement.featureRadius.aura);
      if (spot >= 0) run.templeSpots.add(`${site.civId}:${spot}`);
    }
  }
  // Settle's founding events are the origin every later cause chain can fall back on.
  for (const event of world.events) {
    if (event.type !== 'civ_founded' && event.type !== 'site_founded') continue;
    const id = event.place === null ? undefined : run.siteAtCell.get(event.place);
    if (id !== undefined) logOf(run, id).origin = event.id;
  }
  return run;
}
