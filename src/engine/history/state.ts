// Per-run state of the history stage. It lives here, not on `WorldState`: plague immunity,
// cooldowns, links and the latest event per site only matter while the years run.

import { createEmitter, type EmitInput } from '../core/context';
import type { ContentBundle, HistoryRules, RaceDef } from '../core/content-types';
import { streamFor, type RngStream } from '../core/rng';
import type { Civ, Id, SimEvent, Site, WorldCells, WorldState } from '../core/types';
import type { SiteLinks, LinkSearch } from './links';
import type { SettleContent, SettleSearch } from './settle';

/** What the history stage reads from content. */
export type HistoryContent = SettleContent & Pick<ContentBundle, 'history' | 'creatures'>;

/** The latest events that touched one site, for linking causes. */
export interface SiteLog {
  /** The event that created the site (civ_founded or site_founded). */
  origin?: Id;
  badHarvest?: { year: number; event: Id };
  famine?: { year: number; event: Id };
  plague?: { year: number; event: Id };
  grew?: Id;
  /** The last migration event out of the site. */
  migration?: { year: number; event: Id };
  /** The last beast raid on the site. */
  raided?: { year: number; event: Id };
  /** The site has salt (its own or traded for) until the next trade. */
  salt?: boolean;
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
    plague: RngStream;
    migration: RngStream;
    expansion: RngStream;
    names: RngStream;
    beasts: RngStream;
    trade: RngStream;
    war: RngStream;
  };
  /** Current year, 1..historyYears. */
  year: number;
  logs: Map<Id, SiteLog>;
  /** Years of the last expansion from each site. */
  lastExpansion: Map<Id, number>;
  /** Last year a site can still not be infected. */
  immuneUntil: Map<Id, number>;
  /** Sites infected this year, with their plague event, to spread next year. */
  infected: Map<Id, Id>;
  /** Sites infected so far in this year's plague step. */
  nextInfected: Map<Id, Id>;
  /** Cell to site id for every site, live or ruined (spacing checks). */
  siteAtCell: Map<number, Id>;
  /** Owning civ per cell as of the last recompute. */
  territory: Uint16Array;
  /** Set when a site changed hands or fell, so territory is recomputed at the end of the year. */
  territoryDirty: boolean;
  wars: War[];
  /** Latest wrongs per `${aggrieved}>${offender}` civ pair (most recent three event ids). */
  grievanceEvents: Map<string, Id[]>;
  /** Year before which a `${low}-${high}` civ pair cannot declare war on each other. */
  truce: Map<string, number>;
  /** The trade_opened event per `${low}-${high}` civ pair. */
  tradeOpened: Map<string, Id>;
  /** Cached goods (resource ids) near each site. */
  goods: Map<Id, string[]>;
  /** Civs with iron (their own or traded for) as of the last trade. */
  ironCivs: Set<Id>;
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
    emit: createEmitter(world, content.eventTypes),
    rng: {
      harvest: streamFor(world, 'history.harvest'),
      demography: streamFor(world, 'history.demography'),
      plague: streamFor(world, 'history.plague'),
      migration: streamFor(world, 'history.migration'),
      expansion: streamFor(world, 'history.expansion'),
      names: streamFor(world, 'history.names'),
      beasts: streamFor(world, 'history.beasts'),
      trade: streamFor(world, 'history.trade'),
      war: streamFor(world, 'history.war'),
    },
    year: 0,
    logs: new Map(),
    lastExpansion: new Map(),
    immuneUntil: new Map(),
    infected: new Map(),
    nextInfected: new Map(),
    siteAtCell: new Map(),
    territory: cells.territory,
    territoryDirty: false,
    wars: [],
    grievanceEvents: new Map(),
    truce: new Map(),
    tradeOpened: new Map(),
    goods: new Map(),
    ironCivs: new Set(),
  };
  for (const site of world.sites.values()) run.siteAtCell.set(site.cell, site.id);
  // Settle's founding events are the origin every later cause chain can fall back on.
  for (const event of world.events) {
    if (event.type !== 'civ_founded' && event.type !== 'site_founded') continue;
    const id = event.place === null ? undefined : run.siteAtCell.get(event.place);
    if (id !== undefined) logOf(run, id).origin = event.id;
  }
  return run;
}
