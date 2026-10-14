// The data the history playback draws, built once from a finished world: sites, realms, events by
// year, trade by decade, and the yearly borders, sites and seats. No DOM and no rules here; it only
// reads what the history logged.

import {
  DEFAULT_CONTENT,
  MAP_LAYERS,
  PLAYBACK_EFFECTS,
  REALM_TITLES,
  civColor,
} from '../../content';
import {
  DAYS_PER_YEAR,
  battleOf,
  decodeTerritory,
  renderLayer,
  type Id,
  type Rgb,
  type SimEvent,
  type WorldState,
} from '../../engine';
import { cap } from '../format';
import { finalHistoryYear } from '../YearSlider';

export interface PlaybackSite {
  id: Id;
  name: string;
  cell: number;
  kind: string;
}
export interface PlaybackCiv {
  id: Id;
  name: string;
  colour: Rgb;
  /** The capital when the history ended; the fallback where a year's seats do not name one. */
  capital: Id;
}
export interface PlaybackEvent {
  id: Id;
  /** History year. */
  y: number;
  type: string;
  importance: number;
  /** Map cell, or null. */
  place: number | null;
  title: string;
  /** The name of a great battle, shown beside its effect instead of the generic word (M4.8). */
  battleName?: string;
  data: SimEvent['data'];
}
/** A site in one year. */
export interface SiteInYear {
  civ: number;
  pop: number;
  ruined: boolean;
}
/** One trade of a decade: two sites and a thread weight from 0 to 1. */
export interface PlaybackTrade {
  a: Id;
  b: Id;
  w: number;
}

export interface PlaybackData {
  width: number;
  height: number;
  /** The last history year. */
  last: number;
  /** The biome map with hillshade and water, RGBA, `width * height` pixels. */
  basePixels: Uint8ClampedArray;
  sites: Map<Id, PlaybackSite>;
  siteByName: Map<string, PlaybackSite>;
  civs: PlaybackCiv[];
  civById: Map<Id, PlaybackCiv>;
  civByName: Map<string, PlaybackCiv>;
  /** Beast lair cells by lower-case beast name. */
  lairs: Map<string, number>;
  /** Every event with a place or actors, oldest first. */
  events: PlaybackEvent[];
  eventsByYear: Map<number, PlaybackEvent[]>;
  /** Trades by the year of the decade round. */
  trade: Map<number, PlaybackTrade[]>;
  /** Borders as of `year`: the latest year at or before it that stored them. */
  bordersAt: (year: number) => Uint16Array;
  /** The year whose stored borders `bordersAt(year)` is; equal values mean equal borders. */
  borderYear: (year: number) => number;
  sitesAt: (year: number) => Map<Id, SiteInYear>;
  /** Capital site of each standing civ. */
  seatsAt: (year: number) => Map<Id, Id>;
}

const TITLE_RE = new RegExp(`^(${REALM_TITLES.join('|')}) of `);
/** "Kingdom of Ash" is "Ash". */
export const shortRealm = (name: string): string => name.replace(TITLE_RE, '');
/** "Kingdom of Ash" is "Kingdom of"; a name with no title gives "". */
export const realmTitle = (name: string): string =>
  name.slice(0, name.length - shortRealm(name).length).trim();

/** Decoded borders kept at once; scrubbing back and forth decodes each only once. */
const BORDER_CACHE = 14;
/** Trade of this many units or more draws the thickest thread. */
const TRADE_FULL = 120;

/** A big event: banner, dip and camera at the slower speeds. */
export function isBig(event: Pick<PlaybackEvent, 'type' | 'importance'>): boolean {
  const row = PLAYBACK_EFFECTS[event.type];
  return row?.beat === true && event.importance >= (row.minImportance ?? 0);
}
/** A rare moment: a legend rising, a legendary work, a great beast slain. */
export function isRare(event: Pick<PlaybackEvent, 'type' | 'importance'>): boolean {
  const row = PLAYBACK_EFFECTS[event.type];
  return row?.rare === true && event.importance >= (row.minImportance ?? 0);
}

/** Builds the playback of a finished world; null when it has no playback log or cells. */
export function buildPlayback(
  world: WorldState,
  titleOf: (event: SimEvent) => string,
): PlaybackData | null {
  const log = world.playback;
  const cells = world.cells;
  if (!log || !cells || log.years.length === 0) return null;
  const { width, height } = cells;
  const last = Math.min(finalHistoryYear(world), log.years.length - 1);

  const biome = MAP_LAYERS.find((layer) => layer.id === 'biome')!;
  const basePixels = renderLayer(cells, biome, { hillshade: true, water: true });

  const sites = new Map<Id, PlaybackSite>();
  for (const site of world.sites.values()) {
    sites.set(site.id, { id: site.id, name: site.name, cell: site.cell, kind: site.kind });
  }
  const siteByName = new Map([...sites.values()].map((site) => [site.name, site]));
  const civs: PlaybackCiv[] = [...world.civs.values()].map((civ) => ({
    id: civ.id,
    name: civ.name,
    colour: civColor(civ.id),
    capital: civ.capital,
  }));
  const civById = new Map(civs.map((civ) => [civ.id, civ]));
  const civByName = new Map(civs.map((civ) => [civ.name, civ]));
  const lairs = new Map<string, number>();
  for (const creature of world.creatures.values()) {
    lairs.set(creature.name.toLowerCase(), creature.lair);
  }

  const events: PlaybackEvent[] = [];
  const eventsByYear = new Map<number, PlaybackEvent[]>();
  for (const event of world.events) {
    if (event.place === null && event.actors.length === 0) continue;
    const y = Math.floor(event.day / DAYS_PER_YEAR);
    if (y > last) continue;
    const battle = event.type === 'battle' ? battleOf(world, DEFAULT_CONTENT, event.id) : undefined;
    const row: PlaybackEvent = {
      id: event.id,
      y,
      type: event.type,
      importance: event.importance,
      place: event.place,
      title: titleOf(event),
      ...(battle?.great ? { battleName: cap(battle.name) } : {}),
      data: event.data,
    };
    events.push(row);
    const list = eventsByYear.get(y);
    if (list) list.push(row);
    else eventsByYear.set(y, [row]);
  }

  const trade = new Map<number, PlaybackTrade[]>();
  for (let k = 0; k + 3 < log.trade.length; k += 4) {
    const value = log.trade[k + 3]!;
    if (value < 1) continue;
    const year = log.trade[k]!;
    const row = {
      a: log.trade[k + 1]!,
      b: log.trade[k + 2]!,
      w: Math.min(1, Math.log1p(value) / Math.log1p(TRADE_FULL)),
    };
    const list = trade.get(year);
    if (list) list.push(row);
    else trade.set(year, [row]);
  }

  // Borders are stored only in the years they moved: each year points at the latest one that did.
  const source: number[] = [];
  let latest = 0;
  for (const entry of log.years) {
    if (entry.territory) latest = entry.year;
    source.push(latest);
  }
  const clamp = (year: number) => Math.max(0, Math.min(last, Math.floor(year)));
  const decoded = new Map<number, Uint16Array>();
  const borderYear = (year: number) => source[clamp(year)]!;
  const bordersAt = (year: number): Uint16Array => {
    const from = borderYear(year);
    let out = decoded.get(from);
    if (out) {
      // Refresh its place in the cache.
      decoded.delete(from);
    } else {
      out = decodeTerritory(log.years[from]!.territory ?? new Uint16Array(0), width * height);
    }
    decoded.set(from, out);
    while (decoded.size > BORDER_CACHE) decoded.delete(decoded.keys().next().value!);
    return out;
  };

  const siteRows = new Map<number, Map<Id, SiteInYear>>();
  const sitesAt = (year: number) => {
    const y = clamp(year);
    let out = siteRows.get(y);
    if (!out) {
      out = new Map();
      const rows = log.years[y]!.sites;
      for (let k = 0; k + 3 < rows.length; k += 4) {
        out.set(rows[k]!, { civ: rows[k + 1]!, pop: rows[k + 2]!, ruined: rows[k + 3] === 1 });
      }
      siteRows.set(y, out);
    }
    return out;
  };
  const seatRows = new Map<number, Map<Id, Id>>();
  const seatsAt = (year: number) => {
    const y = clamp(year);
    let out = seatRows.get(y);
    if (!out) {
      out = new Map();
      const rows = log.years[y]!.seats;
      for (let k = 0; k + 1 < rows.length; k += 2) out.set(rows[k]!, rows[k + 1]!);
      seatRows.set(y, out);
    }
    return out;
  };

  return {
    width,
    height,
    last,
    basePixels,
    sites,
    siteByName,
    civs,
    civById,
    civByName,
    lairs,
    events,
    eventsByYear,
    trade,
    bordersAt,
    borderYear,
    sitesAt,
    seatsAt,
  };
}

/** What stands in a year: realms, live settlements and people. */
export function census(data: PlaybackData, year: number) {
  let people = 0;
  let settlements = 0;
  const realms = new Set<number>();
  for (const site of data.sitesAt(year).values()) {
    if (site.ruined) continue;
    settlements += 1;
    people += site.pop;
    if (site.civ) realms.add(site.civ);
  }
  return { realms: realms.size, settlements, people };
}

/** Years with a big event after year 0, for the playback time estimate. */
export function beatYears(data: PlaybackData): number[] {
  const years = new Set<number>();
  for (const event of data.events) if (event.y > 0 && isBig(event)) years.add(event.y);
  return [...years].sort((a, b) => a - b);
}
