// The hosts of a war and the bands of settlers, as timed walks on the road map. No DOM. A war has
// one host a side that lasts the whole war: it marches to each battle, stands on the field after
// it (the winner) or falls back to its seat (the loser), and walks home when the war ends.

import { pointAlong, roadPath, type RoadGrid } from './march';

/** Years a host walks before a battle at the longest. */
export const MARCH_YEARS = 0.7;
/** Years the hosts stand together at the field after a battle. */
export const STAY_YEARS = 0.3;
/** Years the loser takes to fall back to its seat. */
export const RETREAT_YEARS = 0.4;
/** Cells a host walks in a year when it falls back after its last battle or walks home. */
export const WALK_CELLS_PER_YEAR = 40;
/** Shortest and longest of those walks, in years. */
export const WALK_MIN_YEARS = 0.3;
export const WALK_MAX_YEARS = 1.5;
/** Wars drawn at once; a later war waits for a free slot. */
export const WAR_SLOTS = 2;
/** Years a host or a band fades in or out. */
export const FADE_YEARS = 0.15;
/** Years settlers walk; they arrive at the start of the founding's year, when the town is drawn. */
export const SETTLE_YEARS = 1;
/** A war whose last battle is this close to the end of history is still going. */
const OPEN_WAR_YEARS = 3;

/** The parts of a playback event the walks need. */
export interface WalkEvent {
  t: number;
  y: number;
  type: string;
  place: number | null;
  data: Record<string, string | number | boolean>;
}

export interface Leg {
  from: number;
  to: number;
  start: number;
  end: number;
  /** The road path, found when first needed. */
  path: () => number[];
}
export interface Host {
  key: string;
  war: number;
  /** The realm's name. */
  civ: string;
  /** Time it begins to fade in, and the time it is fully gone (Infinity while the war goes on). */
  appear: number;
  vanish: number;
  legs: Leg[];
}
export interface WarBattle {
  t: number;
  cell: number;
  site: string;
  winner: string;
  /** Years both hosts stand at the field after it. */
  stay: number;
}
export interface WarHosts {
  war: number;
  key: string;
  /** The first battle's marching realm first. */
  hosts: Host[];
  battles: WarBattle[];
  appear: number;
  vanish: number;
  /** When the war gets a slot on the map (its appear, or later when two wars already hold one). */
  shownFrom: number;
}
export interface Settlers {
  key: string;
  from: number;
  to: number;
  fromName: string;
  /** The new town's name. */
  site: string;
  start: number;
  end: number;
  year: number;
  path: () => number[];
}

const lazyPath = (grid: RoadGrid, from: number, to: number): (() => number[]) => {
  let cache: number[] | null = null;
  return () => (cache ??= roadPath(grid, from, to));
};

/** Years to walk a path at a steady pace, within the shortest and longest walk. */
function walkYears(path: readonly number[], width: number): number {
  let cells = 0;
  for (let k = 1; k < path.length; k += 1) {
    const a = path[k - 1]!;
    const b = path[k]!;
    cells += Math.hypot((a % width) - (b % width), Math.floor(a / width) - Math.floor(b / width));
  }
  return Math.min(WALK_MAX_YEARS, Math.max(WALK_MIN_YEARS, cells / WALK_CELLS_PER_YEAR));
}

/** One host a side per war, from the war's battles in time order. */
export function buildWarHosts(
  events: readonly WalkEvent[],
  seatCell: (civName: string, year: number) => number | undefined,
  grid: RoadGrid,
  last = Infinity,
): WarHosts[] {
  const battles = new Map<number, WalkEvent[]>();
  const peace = new Map<number, number>();
  for (const e of events) {
    const war = Number(e.data.war);
    if (e.data.war === undefined || Number.isNaN(war)) continue;
    if (e.type === 'battle' && e.place !== null) {
      const list = battles.get(war) ?? [];
      list.push(e);
      battles.set(war, list);
    } else if (e.type === 'peace_made' || e.type === 'peace_by_marriage') {
      peace.set(war, Math.min(peace.get(war) ?? Infinity, e.t));
    }
  }
  const out: WarHosts[] = [];
  for (const [war, list] of [...battles].sort((a, b) => a[0] - b[0])) {
    list.sort((a, b) => a.t - b.t);
    const lastBattle = list[list.length - 1]!;
    const names: string[] = [];
    for (const b of list) {
      for (const n of [String(b.data.civ), String(b.data.enemy)])
        if (!names.includes(n)) names.push(n);
    }
    const peaceT = peace.get(war);
    const open = peaceT === undefined && last - lastBattle.t < OPEN_WAR_YEARS;
    // Hosts leave the field together as soon as the swords have faded.
    const end = Math.max(peaceT ?? 0, lastBattle.t + STAY_YEARS);
    const hosts = names.map((name) => buildHost(war, name, list, seatCell, grid, end, open, last));
    const warBattles = list.map((b, i): WarBattle => {
      const next = list[i + 1];
      return {
        t: b.t,
        cell: b.place!,
        site: String(b.data.site ?? ''),
        winner: String(b.data.winner ?? ''),
        stay: next ? Math.min(STAY_YEARS, (next.t - b.t) * 0.3) : STAY_YEARS,
      };
    });
    out.push({
      war,
      key: `war:${war}`,
      hosts,
      battles: warBattles,
      appear: Math.min(...hosts.map((h) => h.appear)),
      vanish: Math.max(...hosts.map((h) => h.vanish)),
      shownFrom: Infinity,
    });
  }
  // Slots in order of appearance: a war waits until a slot's last host has faded out.
  const free = Array.from({ length: WAR_SLOTS }, () => -Infinity);
  for (const w of [...out].sort((a, b) => a.appear - b.appear || a.war - b.war)) {
    const k = free.indexOf(Math.min(...free));
    const from = Math.max(w.appear, free[k]!);
    if (from >= w.vanish) continue;
    w.shownFrom = from;
    free[k] = w.vanish;
  }
  return out;
}

function buildHost(
  war: number,
  name: string,
  list: readonly WalkEvent[],
  seatCell: (civName: string, year: number) => number | undefined,
  grid: RoadGrid,
  endAt: number,
  open: boolean,
  last: number,
): Host {
  const legs: Leg[] = [];
  const leg = (from: number, to: number, start: number, end: number) =>
    legs.push({ from, to, start, end, path: lazyPath(grid, from, to) });
  const fromOf = (b: WalkEvent) =>
    Number(String(b.data.civ) === name ? b.data.hostFrom : b.data.enemyHostFrom);
  const first = list[0]!;
  const startAt = fromOf(first);
  leg(startAt, first.place!, first.t - MARCH_YEARS, first.t);
  for (let i = 1; i < list.length; i += 1) {
    const prev = list[i - 1]!;
    const b = list[i]!;
    const g = b.t - prev.t;
    const stay = Math.min(STAY_YEARS, g * 0.3);
    const from = fromOf(b);
    let marchLen = Math.min(MARCH_YEARS, g - stay);
    if (from !== prev.place) {
      const retreat = Math.min(RETREAT_YEARS, (g - stay) * 0.4);
      leg(prev.place!, from, prev.t + stay, prev.t + stay + retreat);
      marchLen = Math.min(MARCH_YEARS, (g - stay) * 0.6);
    }
    leg(from, b.place!, b.t - marchLen, b.t);
  }
  const lastB = list[list.length - 1]!;
  const at = lastB.place!;
  const free = lastB.t + STAY_YEARS;
  // A war still going when history stops fades out by the last year.
  let vanish = last;
  if (!open) {
    // The loser falls back and the winner walks home, both at a steady pace; each fades on arrival.
    const end = Math.max(endAt, free);
    const seat = seatCell(name, Math.floor(end)) ?? seatCell(name, lastB.y);
    let gone = end;
    if (seat !== undefined && seat !== at) {
      const path = roadPath(grid, at, seat);
      gone = end + walkYears(path, grid.width);
      legs.push({ from: at, to: seat, start: end, end: gone, path: () => path });
    }
    vanish = Math.min(last, gone + FADE_YEARS);
  }
  return {
    key: `host:${war}:${name}`,
    war,
    civ: name,
    appear: first.t - MARCH_YEARS - FADE_YEARS,
    vanish,
    legs,
  };
}

/** A band of settlers for every founding that names the town it set out from. */
export function buildSettlers(
  events: readonly WalkEvent[],
  siteCell: (name: string) => number | undefined,
  grid: RoadGrid,
  last = Infinity,
): Settlers[] {
  const out: Settlers[] = [];
  for (const e of events) {
    if (e.type !== 'site_founded' || e.place === null || !e.data.from) continue;
    // A band arriving at the very end would stand still under the closing card.
    if (e.y >= last) continue;
    const fromName = String(e.data.from);
    const from = siteCell(fromName);
    if (from === undefined || from === e.place) continue;
    out.push({
      key: `settlers:${e.y}:${e.place}`,
      from,
      to: e.place,
      fromName,
      site: String(e.data.site ?? ''),
      start: e.y - SETTLE_YEARS,
      end: e.y,
      year: e.y,
      path: lazyPath(grid, from, e.place),
    });
  }
  return out;
}

export interface HostPose {
  x: number;
  y: number;
  opacity: number;
  moving: boolean;
  /** The walked part of the current leg, in cell centres; empty while standing. */
  trail: { x: number; y: number }[];
}

/** Where a host is at `t` (cell centres) and how visible; null before it appears or after it is gone. */
export function hostAt(host: Host, t: number, width: number): HostPose | null {
  if (t < host.appear || t >= host.vanish) return null;
  const opacity = Math.max(
    0,
    Math.min(1, (t - host.appear) / FADE_YEARS, (host.vanish - t) / FADE_YEARS),
  );
  const first = host.legs[0]!;
  let cell = first.from;
  for (const leg of host.legs) {
    if (t < leg.start) break;
    if (t < leg.end && leg.from !== leg.to) {
      const p = (t - leg.start) / (leg.end - leg.start);
      const here = pointAlong(leg.path(), width, p);
      return {
        x: here.x,
        y: here.y,
        opacity,
        moving: true,
        trail: here.upTo.map(([x, y]) => ({ x, y })),
      };
    }
    cell = leg.to;
  }
  return {
    x: (cell % width) + 0.5,
    y: Math.floor(cell / width) + 0.5,
    opacity,
    moving: false,
    trail: [],
  };
}

/** Where a band is at `t` and how visible, or null when it is not on the map. */
export function settlersAt(s: Settlers, t: number, width: number): HostPose | null {
  if (t < s.start || t >= s.end + FADE_YEARS) return null;
  const opacity = Math.max(
    0,
    Math.min(1, (t - s.start) / FADE_YEARS, (s.end + FADE_YEARS - t) / FADE_YEARS),
  );
  const walking = t < s.end;
  const here = pointAlong(s.path(), width, walking ? (t - s.start) / (s.end - s.start) : 1);
  return {
    x: here.x,
    y: here.y,
    opacity,
    moving: walking,
    trail: here.upTo.map(([x, y]) => ({ x, y })),
  };
}

/** Moving parties drawn at once: wars first (earliest kept), then at most one settler band. */
export function pickGroups(
  wars: readonly WarHosts[],
  settlers: readonly Settlers[],
  t: number,
  maxWars = 2,
  max = 3,
): { wars: WarHosts[]; settlers: Settlers[] } {
  const live = wars
    .filter((w) => w.shownFrom <= t && t < w.vanish)
    .sort((a, b) => a.shownFrom - b.shownFrom || a.war - b.war)
    .slice(0, Math.min(maxWars, max));
  const room = Math.min(1, max - live.length);
  const bands = settlers
    .filter((s) => s.start <= t && t < s.end + FADE_YEARS)
    .sort((a, b) => a.start - b.start)
    .slice(0, Math.max(0, room));
  return { wars: live, settlers: bands };
}
