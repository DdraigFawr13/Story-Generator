// Threats at the watched site (M3.8). Wild prowlers take a lone worker far from the village; a
// beast out of its lair or a band of raiders from a civ with a grievance comes in from the map edge
// toward the stores. A great or legendary beast and a raid may be seen a few days ahead; if the
// able adults are too weak against a beast, everyone walks to a camp toward the nearest other site
// and comes home when it has gone. Otherwise the militia (the strongest able adults) goes out to
// meet the attackers, everyone else shelters at home, and blows are traded each block.
//
// A day (block 0) `runThreatsDay` rolls prowlers and new threats, turns a warning into an arrival
// and settles a threat that has left. A block `planThreat` says who defends, shelters or flees
// (before the profiles are built), and `resolveThreat` (after everyone has walked) moves the
// attackers, trades blows and loots. Every number and phrase is content (content/threats.ts);
// randomness is the `site.threats` stream, people and civs in id order.

import { DAYS_PER_YEAR } from '../core/clock';
import type { EmitInput } from '../core/context';
import type {
  Activity,
  CreatureDef,
  CreatureTier,
  MemoryDef,
  ThreatRules,
} from '../core/content-types';
import { clamp, sortedById } from '../core/math';
import { streamFor, type RngStream } from '../core/rng';
import type {
  ActiveSite,
  Civ,
  Creature,
  Id,
  Person,
  SimEvent,
  Site,
  SiteThreat,
  SiteThreats,
  WorldState,
} from '../core/types';
import { bandCount, stochasticRound } from '../history/pop';
import { cellDistance } from '../history/settle';
import { soldierEquivalent } from '../people/combat-scale';
import { beginBuildingAt, buildableTile, type SiteLabel } from './build';
import { bandOfAge, type Band, type SiteContent } from './defs';
import { igniteTile } from './fire';
import { killPerson, woundPerson } from './health';
import { addMemoryTo } from './memory';
import { findRoute, straightLine, tileCost, walkAlong } from './path';
import { envOf } from './social';
import { refuge, relocate } from './society';
import { addItem, foodMeals, itemCount, takeFood } from './stock';
import { residentItems, workTile } from './work';

type Emit = (input: EmitInput) => SimEvent;

export function blankThreats(): SiteThreats {
  return {
    lastBeast: [],
    lastRaid: [],
    wallPlan: [],
    stats: {
      prowlers: 0,
      beasts: 0,
      raids: 0,
      flights: 0,
      slain: 0,
      repelled: 0,
      deaths: 0,
      wounds: 0,
      looted: 0,
      walls: 0,
    },
  };
}

/** What a resident does this block because of the threat; `tile` is -1 where life.ts picks it (home). */
export interface ThreatOrder {
  activity: Extract<Activity, 'defend' | 'shelter' | 'flee'>;
  tile: number;
}

const histYear = (world: WorldState, active: ActiveSite) =>
  world.params.historyYears + Math.floor((world.day - active.enteredDay) / DAYS_PER_YEAR);

const alive = (p: Person | undefined): p is Person =>
  p !== undefined && p.died === undefined && p.detail !== undefined;

const tierOf = (t: Pick<SiteThreat, 'kind' | 'tier'>): CreatureTier | 'raid' =>
  t.kind === 'raid' ? 'raid' : t.tier!;

function setLast(list: [Id, number][], id: Id, day: number): void {
  const found = list.find(([key]) => key === id);
  if (found) found[1] = day;
  else list.push([id, day]);
}
const lastOf = (list: readonly [Id, number][], id: Id): number =>
  list.find(([key]) => key === id)?.[1] ?? -Infinity;

// ---- Geometry ----

/** The compass word for the direction of (dx, dy), y growing southward. */
function compassWord(rules: ThreatRules, dx: number, dy: number): string {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  let at: number;
  if (ay * 2 <= ax) at = dx > 0 ? 2 : 6;
  else if (ax * 2 <= ay) at = dy > 0 ? 4 : 0;
  else if (dx > 0) at = dy < 0 ? 1 : 3;
  else at = dy > 0 ? 5 : 7;
  return rules.compass[at]!;
}

/** Tile on the map's edge for step `p` of a walk around the perimeter. */
function perimeterTile(size: number, p: number): number {
  const ring = 4 * (size - 1);
  const q = ((p % ring) + ring) % ring;
  const side = Math.floor(q / (size - 1));
  const off = q % (size - 1);
  const x = side === 0 ? off : side === 1 ? size - 1 : side === 2 ? size - 1 - off : 0;
  const y = side === 0 ? 0 : side === 1 ? off : side === 2 ? size - 1 : size - 1 - off;
  return y * size + x;
}

function perimeterIndex(size: number, x: number, y: number): number {
  const n = size - 1;
  if (y === 0 && x < n) return x;
  if (x === n && y < n) return n + y;
  if (y === n && x > 0) return 2 * n + (n - x);
  return 3 * n + (n - y);
}

/** Tiles in from the map's edge where attackers are first seen, so they stand clear of its border. */
const EDGE_INSET = 8;

/** Steps an edge tile up to `EDGE_INSET` tiles in toward the origin, onto walkable ground. */
function inset(content: SiteContent, active: ActiveSite, tile: number): number {
  const { map, origin } = active;
  const w = map.width;
  const ex = tile % w;
  const ey = Math.floor(tile / w);
  const sx = Math.sign(origin[0] - ex);
  const sy = Math.sign(origin[1] - ey);
  for (let i = EDGE_INSET; i > 0; i -= 1) {
    const k = (ey + sy * i) * w + ex + sx * i;
    if (tileCost(active, content.site, content.life, k) > 0) return k;
  }
  return tile;
}

/** The walkable map-edge tile nearest the ray from the origin along (dx, dy). */
function edgeToward(content: SiteContent, active: ActiveSite, dx: number, dy: number): number {
  const { map, origin } = active;
  const size = map.width;
  // A lair in the site's own cell is taken to lie to the north.
  const [ux, uy] = dx === 0 && dy === 0 ? [0, -1] : [dx, dy];
  const um = Math.max(Math.abs(ux), Math.abs(uy));
  const x = clamp(origin[0] + Math.round((ux * size) / um), 0, size - 1);
  const y = clamp(origin[1] + Math.round((uy * size) / um), 0, size - 1);
  const at = perimeterIndex(size, x, y);
  const ring = 4 * (size - 1);
  for (let k = 0; k <= ring / 2; k += 1) {
    for (const s of k === 0 ? [0] : [k, -k]) {
      const tile = perimeterTile(size, at + s);
      if (tileCost(active, content.site, content.life, tile) > 0)
        return inset(content, active, tile);
    }
  }
  return origin[1] * size + origin[0];
}

/** What attackers make for: the stockpile, else the green. */
function targetOf(active: ActiveSite): number {
  let best: { id: number; tile: number } | undefined;
  for (const b of active.buildings.values()) {
    if (b.defId === 'stockpile' && (!best || b.id < best.id))
      best = { id: b.id, tile: b.cells[0]! };
  }
  return best ? best.tile : active.origin[1] * active.map.width + active.origin[0];
}

const dist = (width: number, a: number, b: number) =>
  Math.max(
    Math.abs((a % width) - (b % width)),
    Math.abs(Math.floor(a / width) - Math.floor(b / width)),
  );

const tileOfPos = (p: Person, width: number): number => {
  const [x, y] = p.detail!.pos!;
  return y * width + x;
};

// ---- People ----

function bandOf(world: WorldState, content: SiteContent, active: ActiveSite, p: Person): Band {
  const race = content.races.find((r) => r.id === p.raceId)!;
  return bandOfAge(race, histYear(world, active) - p.born);
}

/** Adults on their feet who could take up arms: not in bed, not in despair or wandering. */
function ableAdults(world: WorldState, content: SiteContent, active: ActiveSite): Person[] {
  const out: Person[] = [];
  for (const id of active.residents) {
    const p = world.people.get(id);
    if (!alive(p) || p.detail!.abed) continue;
    const kind = p.detail!.breakdown?.kind;
    if (kind === 'despair' || kind === 'wandering') continue;
    if (bandOf(world, content, active, p) === 'adult') out.push(p);
  }
  return out;
}

/** Combat value of what each resident holds. */
function weaponsOf(world: WorldState, content: SiteContent, active: ActiveSite): Map<Id, number> {
  const out = new Map<Id, number>();
  for (const held of residentItems(world, content, active)) {
    for (const e of held.def.effects ?? []) {
      if (e.kind === 'combat') out.set(held.holder, (out.get(held.holder) ?? 0) + e.value);
    }
  }
  return out;
}

/** Wall segments stand on the side the attackers come from. */
function wallsFacing(content: SiteContent, active: ActiveSite, edge: number): boolean {
  const w = active.map.width;
  const ex = (edge % w) - active.origin[0];
  const ey = Math.floor(edge / w) - active.origin[1];
  for (const b of active.buildings.values()) {
    if (b.defId !== content.threats.walls.building || b.progress !== undefined) continue;
    const wx = (b.cells[0]! % w) - active.origin[0];
    const wy = Math.floor(b.cells[0]! / w) - active.origin[1];
    if (wx * ex + wy * ey > 0) return true;
  }
  return false;
}

/** One person's worth in soldier equivalents against the threat now: weapon, tiredness, wall. */
function strengthOf(content: SiteContent, p: Person, weapon: number, walls: boolean): number {
  const c = content.threats.combat;
  const rest = p.detail?.needs['rest'] ?? 100;
  const tired = c.fatigueBase + ((1 - c.fatigueBase) * rest) / 100;
  return (soldierEquivalent(p) + c.weaponMul * weapon) * tired * (walls ? c.wallBonus : 1);
}

const memoryDefs = new WeakMap<object, Map<string, MemoryDef>>();
function remember(
  content: SiteContent,
  world: WorldState,
  p: Person,
  type: string,
  eventId?: Id,
): void {
  if (!p.detail) return;
  let defs = memoryDefs.get(content.memories);
  if (!defs)
    memoryDefs.set(content.memories, (defs = new Map(content.memories.map((m) => [m.id, m]))));
  addMemoryTo(defs, content.life.memoryCap, p.detail, type, world.day, undefined, eventId);
}

// ---- Prowlers ----

/** The kind of wild animal that roams the site's cell, if any, and how wild the cell is. */
function wildFor(world: WorldState, content: SiteContent, site: Site) {
  const cells = world.cells;
  if (!cells) return { kinds: [], wildness: 0 };
  const biome = content.biomes[cells.biome[site.cell]!]?.id ?? '';
  return {
    kinds: content.threats.prowlers.kinds.filter((k) => k.biomes.includes(biome)),
    wildness: cells.wildness[site.cell]!,
  };
}

/** One roll a day: a wild animal takes someone working far out; nothing happens if no one is. */
function prowl(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  rng: RngStream,
  emit: Emit,
  label: SiteLabel,
): void {
  const rules = content.threats.prowlers;
  const site = world.sites.get(active.siteId);
  if (!site) return;
  const { kinds, wildness } = wildFor(world, content, site);
  if (kinds.length === 0 || !rng.chance((rules.perYear * wildness) / 100 / DAYS_PER_YEAR)) return;
  const kind = rng.pick(kinds);
  const width = active.map.width;
  const origin = active.origin[1] * width + active.origin[0];
  const jobs = new Map(content.jobs.map((j) => [j.id, j]));
  const out: Person[] = [];
  for (const id of active.residents) {
    const p = world.people.get(id);
    const job = alive(p) && p.detail!.jobId !== undefined ? jobs.get(p.detail!.jobId) : undefined;
    if (!alive(p) || !job || p.detail!.abed || !rules.workplaces.includes(job.workplace)) continue;
    if (bandOf(world, content, active, p) !== 'adult') continue;
    const tile = workTile(content, active, { id, field: -1 }, job);
    if (tile >= 0 && dist(width, tile, origin) >= rules.from) out.push(p);
  }
  if (out.length === 0) return;
  const victim = rng.pick(out);
  const weapon = weaponsOf(world, content, active).get(victim.id) ?? 0;
  const s = soldierEquivalent(victim) + content.threats.combat.weaponMul * weapon;
  const stats = active.threats.stats;
  stats.prowlers += 1;
  const data = { site: label.name, animal: kind.name };
  const ev = content.threats.events;
  if (rng.chance(s / (s + kind.danger))) {
    if (rng.chance(rules.killShare)) {
      const hunt = content.jobs.find((j) => j.id === content.steward.roles.hunt);
      const meat = Object.keys(hunt?.outputs ?? {})[0];
      if (meat !== undefined) addItem(active, meat, kind.meat);
      emit({ type: ev.prowlerKilled, actors: [victim.id], place: label.cell, data });
    } else emit({ type: ev.prowlerDriven, actors: [victim.id], place: label.cell, data });
    return;
  }
  const event = emit({ type: ev.prowler, actors: [victim.id], place: label.cell, data });
  const tier = rng.weighted(Object.entries(content.threats.combat.woundShares));
  woundPerson(
    world,
    content,
    active,
    victim,
    tier,
    `while fighting a ${kind.name}`,
    emit,
    label,
    event.id,
  );
  stats.wounds += 1;
}

// ---- Opening a threat ----

/** The latest history event behind `from`'s grievance against `to` (its civ), if any. */
function grievanceEvent(world: WorldState, from: Civ, to: Civ): Id | undefined {
  for (let i = world.events.length - 1; i >= 0; i -= 1) {
    const e = world.events[i]!;
    const d = e.data;
    if (
      ((e.type === 'civ_raid' || e.type === 'vengeance_raid' || e.type === 'insult') &&
        d['civ'] === to.name &&
        d['victim'] === from.name) ||
      (e.type === 'border_clash' &&
        ((d['civ'] === to.name && d['other'] === from.name) ||
          (d['civ'] === from.name && d['other'] === to.name)))
    ) {
      return e.id;
    }
  }
  return undefined;
}

/** The size of a band that rides from a home with `adults` grown people, `share` of whom are followed. */
export function raidBand(rules: ThreatRules, adults: number, share: number): number {
  return clamp(
    Math.round(adults * rules.raids.bandShare * share),
    rules.raids.band[0],
    rules.raids.band[1],
  );
}

/** Creatures whose nearest live site in range is this one, in id order (kept until the site changes). */
const nearby = new WeakMap<ActiveSite, Id[]>();
function lairsNear(world: WorldState, content: SiteContent, active: ActiveSite, site: Site): Id[] {
  let found = nearby.get(active);
  if (!found) {
    found = [];
    const width = world.params.width;
    const defs = new Map(content.creatures.map((d) => [d.id, d]));
    const live = sortedById(world.sites.values()).filter((s) => s.ruinedYear === undefined);
    for (const c of sortedById(world.creatures.values())) {
      const def = defs.get(c.defId);
      if (!def || cellDistance(width, c.lair, site.cell) > def.raidRange) continue;
      let best: Site | undefined;
      let bestDistance = Infinity;
      for (const s of live) {
        const d = cellDistance(width, c.lair, s.cell);
        if (d <= def.raidRange && d < bestDistance) {
          best = s;
          bestDistance = d;
        }
      }
      if (best?.id === site.id) found.push(c.id);
    }
    nearby.set(active, found);
  }
  return found;
}

interface BeastSource {
  creature: Creature;
  def: CreatureDef;
}
interface RaidSource {
  civ: Civ;
  home: Site;
}

/** The day's roll for a beast: any living creature near enough whose nearest site this is. */
function rollBeast(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  site: Site,
  rng: RngStream,
): BeastSource | null {
  const rules = content.threats.beasts;
  const defs = new Map(content.creatures.map((d) => [d.id, d]));
  for (const id of lairsNear(world, content, active, site)) {
    const creature = world.creatures.get(id);
    const def = creature && defs.get(creature.defId);
    if (!creature || !def || creature.died !== undefined) continue;
    if (world.day - lastOf(active.threats.lastBeast, id) < rules.cooldownDays) continue;
    if (rng.chance((def.raidChance * rules.chanceMul) / DAYS_PER_YEAR)) return { creature, def };
  }
  return null;
}

/** The day's roll for a raid: each civ with a grievance (or at war, once wars are on the world). */
function rollRaid(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  site: Site,
  rng: RngStream,
): RaidSource | null {
  const rules = content.threats.raids;
  const mine = site.civId === null ? undefined : world.civs.get(site.civId);
  if (!mine) return null;
  const width = world.params.width;
  for (const civ of sortedById(world.civs.values())) {
    if (civ.id === mine.id || civ.fell !== undefined) continue;
    const grievance = civ.grievances.get(mine.id) ?? 0;
    if (grievance < rules.minGrievance) continue;
    if (world.day - lastOf(active.threats.lastRaid, civ.id) < rules.cooldownDays) continue;
    let home: Site | undefined;
    let best = Infinity;
    for (const s of sortedById(world.sites.values())) {
      if (s.civId !== civ.id || s.ruinedYear !== undefined || bandCount(s, 'adult') === 0) continue;
      const d = cellDistance(width, s.cell, site.cell);
      if (d <= rules.reach && d < best) {
        home = s;
        best = d;
      }
    }
    if (!home) continue;
    const war = content.cultures.find((c) => c.id === civ.cultureId)?.values['war'] ?? 0;
    const chance = (rules.perYear * (war / 10) * Math.min(1, grievance)) / DAYS_PER_YEAR;
    if (rng.chance(chance)) return { civ, home };
  }
  return null;
}

/** Everyone on their feet walks to the camp when the able adults cannot stand against the beast. */
function judgeFlight(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  site: Site,
  t: SiteThreat,
  danger: number,
  emit: Emit,
  label: SiteLabel,
): void {
  const walls = wallsFacing(content, active, t.edge);
  const weapons = weaponsOf(world, content, active);
  let strength = 0;
  for (const p of ableAdults(world, content, active)) {
    strength += strengthOf(content, p, weapons.get(p.id) ?? 0, walls);
  }
  if (strength >= content.threats.flight.fleeBelow * danger) return;
  const dest = refuge(world, active);
  if (!dest) return;
  const width = world.params.width;
  t.fled = true;
  t.refugeId = dest.id;
  t.camp = edgeToward(
    content,
    active,
    (dest.cell % width) - (site.cell % width),
    Math.floor(dest.cell / width) - Math.floor(site.cell / width),
  );
  const event = emit({
    type: content.threats.events.flight,
    place: label.cell,
    causes: t.signEvent === undefined ? [] : [t.signEvent],
    data: { site: label.name, refuge: dest.name, threat: t.name },
  });
  t.fleeEvent = event.id;
  active.threats.stats.flights += 1;
}

/** Opens a beast or raid threat: a sign now and the arrival in a few days, or the arrival today. */
function openThreat(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  site: Site,
  rng: RngStream,
  emit: Emit,
  label: SiteLabel,
  source: BeastSource | RaidSource,
): void {
  const rules = content.threats;
  const width = world.params.width;
  const to = 'creature' in source ? source.creature.lair : source.home.cell;
  const dx = (to % width) - (site.cell % width);
  const dy = Math.floor(to / width) - Math.floor(site.cell / width);
  const edge = edgeToward(content, active, dx, dy);
  const base = {
    stage: 'warned' as const,
    count: 1,
    came: 1,
    vigour: 1,
    tile: -1,
    edge,
    target: targetOf(active),
    arriveDay: world.day,
    rounds: 0,
    ravaged: 0,
    fled: false,
    wounded: 0,
    killed: 0,
    attackersDown: 0,
    loot: 0,
    militia: [],
    residentsAtArrival: active.residents.length,
  };
  let warn: boolean;
  let sign = '';
  let danger = 0;
  let t: SiteThreat;
  if ('creature' in source) {
    const { creature, def } = source;
    setLast(active.threats.lastBeast, creature.id, world.day);
    t = {
      ...base,
      kind: 'beast',
      name: creature.name,
      glyph: rules.beasts.glyphs[def.id] ?? 'B',
      creatureId: creature.id,
      defId: def.id,
      tier: def.tier,
    };
    danger = def.danger;
    warn = def.tier !== 'beast';
    const signs = rules.beasts.signs[def.id] ?? [];
    if (warn && signs.length > 0) {
      sign = rng
        .pick(signs)
        .replace('{dir}', compassWord(rules, dx, dy))
        .replace('{site}', label.name);
    } else warn = false;
    if (warn)
      t.arriveDay = world.day + rng.between(rules.beasts.warnDays[0], rules.beasts.warnDays[1]);
  } else {
    const { civ, home } = source;
    setLast(active.threats.lastRaid, civ.id, world.day);
    const count = raidBand(rules, bandCount(home, 'adult'), active.share);
    t = {
      ...base,
      kind: 'raid',
      name: `raiders from ${home.name}`,
      glyph: rules.raids.glyph,
      civId: civ.id,
      fromSiteId: home.id,
      count,
      came: count,
    };
    warn = rng.chance(rules.raids.warnChance);
    if (warn) {
      sign = rules.raids.warning.replace('{from}', home.name);
      t.arriveDay = world.day + 1;
    }
  }
  active.threat = t;
  // Only a great or legendary beast can send everyone running.
  const flees = t.kind === 'beast' && t.tier !== 'beast';
  if (!warn) {
    arrive(world, content, active, emit, label, t);
    if (flees) judgeFlight(world, content, active, site, t, danger, emit, label);
    if (t.fled) t.militia = [];
    return;
  }
  const event = emit({
    type: rules.events.sign,
    place: label.cell,
    data: { site: label.name, sign, threat: t.name },
  });
  t.signEvent = event.id;
  if (flees) judgeFlight(world, content, active, site, t, danger, emit, label);
}

/** The attackers come onto the map: the arrival line, the militia, and the fear of everyone. */
function arrive(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  emit: Emit,
  label: SiteLabel,
  t: SiteThreat,
): void {
  const rules = content.threats;
  const causes: Id[] = t.signEvent === undefined ? [] : [t.signEvent];
  let event: SimEvent;
  if (t.kind === 'beast') {
    event = emit({
      type: rules.events.beastArrived,
      place: label.cell,
      causes,
      data: { site: label.name, beast: t.name },
    });
    active.threats.stats.beasts += 1;
  } else {
    const site = world.sites.get(active.siteId);
    const mine = site?.civId == null ? undefined : world.civs.get(site.civId);
    const civ = t.civId === undefined ? undefined : world.civs.get(t.civId);
    const why = mine && civ ? grievanceEvent(world, civ, mine) : undefined;
    if (why !== undefined) causes.push(why);
    event = emit({
      type: rules.events.raidArrived,
      place: label.cell,
      causes,
      data: {
        site: label.name,
        from: world.sites.get(t.fromSiteId ?? -1)?.name ?? '',
        civ: civ?.name ?? '',
        count: t.came,
      },
    });
    active.threats.stats.raids += 1;
  }
  t.stage = 'coming';
  t.tile = t.edge;
  t.held = true;
  t.arriveEvent = event.id;
  t.residentsAtArrival = active.residents.length;
  for (const id of active.residents) {
    const p = world.people.get(id);
    if (p) remember(content, world, p, rules.memoryOf.fearRaid, event.id);
  }
  // The strongest able adults stand to arms; against a great or legendary beast, all of them.
  const weapons = weaponsOf(world, content, active);
  const able = ableAdults(world, content, active).sort(
    (a, b) =>
      soldierEquivalent(b) +
        rules.combat.weaponMul * (weapons.get(b.id) ?? 0) -
        (soldierEquivalent(a) + rules.combat.weaponMul * (weapons.get(a.id) ?? 0)) || a.id - b.id,
  );
  const all = t.kind === 'beast' && t.tier !== 'beast';
  const n = all
    ? able.length
    : Math.min(
        able.length,
        Math.max(rules.combat.militiaMin, Math.ceil(able.length * rules.combat.militiaShare)),
      );
  t.militia = able.slice(0, n).map((p) => p.id);
}

// ---- The day ----

/** Everyone gone from the site: it falls (and any survivors who fled settle at the refuge). */
function fall(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  emit: Emit,
  label: SiteLabel,
  causes: Id[],
): void {
  const site = world.sites.get(active.siteId);
  const survivors = active.residents.map((id) => world.people.get(id)).filter(alive);
  emit({
    type: content.threats.events.fell,
    place: label.cell,
    causes,
    data: { site: label.name },
  });
  active.threats.fellDay = world.day;
  if (site) site.ruinedYear = histYear(world, active);
  const dest = survivors.length > 0 ? refuge(world, active) : null;
  if (dest) relocate(envOf(world, content, active), survivors, dest);
  active.threat = null;
}

/** The standing homes: finished and not burnt. */
const homesStanding = (content: SiteContent, active: ActiveSite): number =>
  [...active.buildings.values()].filter(
    (b) => b.defId === content.steward.homeBuilding && b.progress === undefined && !b.burnt,
  ).length;

/** Plans wall tiles in an arc on the side the attack came from, outside the outermost home there. */
function planWalls(content: SiteContent, active: ActiveSite, edge: number): void {
  const rules = content.threats.walls;
  const w = active.map.width;
  const [ox, oy] = active.origin;
  const ex = (edge % w) - ox;
  const ey = Math.floor(edge / w) - oy;
  let reach = 0;
  for (const b of active.buildings.values()) {
    if (b.defId !== content.steward.homeBuilding) continue;
    for (const k of b.cells) {
      const x = (k % w) - ox;
      const y = Math.floor(k / w) - oy;
      const far = Math.max(Math.abs(x), Math.abs(y));
      if (x * ex + y * ey > 0 && far <= rules.maxRing) reach = Math.max(reach, far);
    }
  }
  // Walls already waiting are raised first.
  if (active.threats.wallPlan.length >= rules.segments) return;
  const radius = reach + rules.ringPad;
  const planned = new Set(active.threats.wallPlan);
  const ring: { tile: number; off: number }[] = [];
  for (let y = oy - radius; y <= oy + radius; y += 1) {
    for (let x = ox - radius; x <= ox + radius; x += 1) {
      if (Math.max(Math.abs(x - ox), Math.abs(y - oy)) !== radius) continue;
      if (x < 1 || y < 1 || x >= w - 1 || y >= active.map.height - 1) continue;
      const dx = x - ox;
      const dy = y - oy;
      if (dx * ex + dy * ey <= 0) continue;
      const tile = y * w + x;
      if (planned.has(tile) || !buildableTile(content, active, tile)) continue;
      ring.push({ tile, off: Math.abs(dx * ey - dy * ex) });
    }
  }
  ring.sort((a, b) => a.off - b.off || a.tile - b.tile);
  for (const r of ring.slice(0, rules.segments)) active.threats.wallPlan.push(r.tile);
}

/**
 * The steward raises the next planned wall segment through the normal building queue, once the
 * stone for it stands in the stores. Returns true if one was begun.
 */
export function beginWall(
  content: SiteContent,
  active: ActiveSite,
  emit: Emit,
  label: SiteLabel,
): boolean {
  const def = content.site.buildings.find((b) => b.id === content.threats.walls.building);
  const plan = active.threats.wallPlan;
  if (!def || plan.length === 0) return false;
  for (const [item, n] of Object.entries(def.cost ?? {}))
    if (itemCount(active, item) < n) return false;
  while (plan.length > 0) {
    const tile = plan.shift()!;
    if (beginBuildingAt(content, active, def.id, tile, emit, label)) {
      active.threats.stats.walls += 1;
      return true;
    }
  }
  return false;
}

/** The attackers have gone and the people are home (or the place is lost): the threat is settled. */
function finish(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  emit: Emit,
  label: SiteLabel,
  t: SiteThreat,
): void {
  const refugeSite = world.sites.get(t.refugeId ?? -1);
  if (t.fled && foodMeals(active, content) === 0 && homesStanding(content, active) === 0) {
    fall(world, content, active, emit, label, t.arriveEvent === undefined ? [] : [t.arriveEvent]);
    return;
  }
  if (t.fled) {
    emit({
      type: content.threats.events.flightReturned,
      place: label.cell,
      causes: t.fleeEvent === undefined ? [] : [t.fleeEvent],
      data: { site: label.name, refuge: refugeSite?.name ?? '' },
    });
  }
  if (t.arriveEvent !== undefined) {
    planWalls(content, active, t.edge);
    // A raid sours both civs: the site's against the raiders, and theirs too if they lost men.
    const site = world.sites.get(active.siteId);
    const mine = site?.civId == null ? undefined : world.civs.get(site.civId);
    const theirs = t.civId === undefined ? undefined : world.civs.get(t.civId);
    if (t.kind === 'raid' && mine && theirs) {
      mine.grievances.set(theirs.id, (mine.grievances.get(theirs.id) ?? 0) + 1);
      if (t.attackersDown > 0) {
        theirs.grievances.set(mine.id, (theirs.grievances.get(mine.id) ?? 0) + 0.5);
      }
    }
  }
  active.threat = null;
}

/**
 * Block 0: rolls a wild prowler and, when nothing is open, a beast or a raid; turns a warning into
 * an arrival; and settles a threat that has left. A site with no one left falls.
 */
export function runThreatsDay(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  emit: Emit,
  label: SiteLabel,
): void {
  if (active.threats.fellDay !== undefined) return;
  if (active.residents.length === 0) {
    fall(
      world,
      content,
      active,
      emit,
      label,
      active.threat?.arriveEvent === undefined ? [] : [active.threat.arriveEvent],
    );
    return;
  }
  const site = world.sites.get(active.siteId);
  if (!site) return;
  const t = active.threat;
  if (t) {
    if (t.stage === 'warned' && world.day >= t.arriveDay) {
      arrive(world, content, active, emit, label, t);
      if (t.fled) t.militia = [];
    } else if (
      t.stage === 'leaving' &&
      t.tile < 0 &&
      world.day >= (t.leftDay ?? world.day) + (t.fled ? content.threats.flight.returnAfterDays : 0)
    ) {
      finish(world, content, active, emit, label, t);
    }
    return;
  }
  const rng = streamFor(world, 'site.threats');
  prowl(world, content, active, rng, emit, label);
  const beast = rollBeast(world, content, active, site, rng);
  if (beast) return openThreat(world, content, active, site, rng, emit, label, beast);
  const raid = rollRaid(world, content, active, site, rng);
  if (raid) openThreat(world, content, active, site, rng, emit, label, raid);
}

// ---- The block ----

const onMap = (t: SiteThreat) => t.tile >= 0 && t.stage !== 'warned';

/** Militia still able to fight: alive, on their feet. */
function militiaOf(world: WorldState, t: SiteThreat): Person[] {
  const out: Person[] = [];
  for (const id of t.militia) {
    const p = world.people.get(id);
    if (alive(p) && !p.detail!.abed) out.push(p);
  }
  return out;
}

/** Open ground two tiles from the attackers, nearest the town first, for the militia to stand on. */
function defendSpots(content: SiteContent, active: ActiveSite, t: SiteThreat): number[] {
  const w = active.map.width;
  const x0 = t.tile % w;
  const y0 = Math.floor(t.tile / w);
  const at = active.origin[1] * w + active.origin[0];
  const spots: number[] = [];
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== 2) continue;
      const x = x0 + dx;
      const y = y0 + dy;
      if (x < 0 || y < 0 || x >= w || y >= active.map.height) continue;
      if (tileCost(active, content.site, content.life, y * w + x) > 0) spots.push(y * w + x);
    }
  }
  const away = (k: number) =>
    Math.abs((k % w) - (at % w)) + Math.abs(Math.floor(k / w) - Math.floor(at / w));
  spots.sort((a, b) => away(a) - away(b) || a - b);
  return spots.length > 0 ? spots : [t.tile];
}

/**
 * Before the block's walking: who defends (and where), who shelters at home and who flees to the
 * camp. Residents not in the map are left to their own schedule. Empty when nothing threatens.
 */
export function planThreat(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
): Map<Id, ThreatOrder> {
  const plan = new Map<Id, ThreatOrder>();
  const t = active.threat;
  if (!t || (!t.fled && !onMap(t))) return plan;
  const militia = new Set(t.fled ? [] : militiaOf(world, t).map((p) => p.id));
  const spots = militia.size > 0 ? defendSpots(content, active, t) : [];
  let i = 0;
  for (const id of active.residents) {
    const p = world.people.get(id);
    if (!alive(p)) continue;
    if (p.detail!.abed) plan.set(id, { activity: 'shelter', tile: -1 });
    else if (t.fled) plan.set(id, { activity: 'flee', tile: t.camp ?? -1 });
    else if (militia.has(id)) {
      plan.set(id, { activity: 'defend', tile: spots[i % spots.length]! });
      i += 1;
    } else plan.set(id, { activity: 'shelter', tile: -1 });
  }
  return plan;
}

export interface CombatInput {
  tier: CreatureTier | 'raid';
  /** The attackers' strength in soldier equivalents. */
  attack: number;
  /** The defenders' strength in soldier equivalents. */
  defence: number;
  /** People who can be hurt. */
  defenders: number;
  /** Most deaths this round may add (the assault's cap less those already dead). */
  killCap: number;
}

export interface CombatResult {
  /** Blows landed on the attackers. */
  landed: number;
  /** Distinct defenders (indices) hurt, and whether each was killed outright. */
  struck: { who: number; killed: boolean }[];
}

/**
 * One block's exchange of blows. The defenders hurt never pass the tier's round cap (R-24) and the
 * deaths never pass `killCap`; each blow lands on a different defender.
 */
export function combatRound(
  rules: ThreatRules['combat'],
  rng: RngStream,
  input: CombatInput,
): CombatResult {
  const landed = stochasticRound(rng, input.defence * rules.hitPerSoldier);
  const wanted = Math.min(
    rules.roundCap[input.tier],
    input.defenders,
    stochasticRound(rng, input.attack * rules.hitPerSoldier),
  );
  const order = Array.from({ length: input.defenders }, (_, i) => i);
  const struck: CombatResult['struck'] = [];
  let killed = 0;
  for (let i = 0; i < wanted; i += 1) {
    const j = i + rng.int(order.length - i);
    [order[i], order[j]] = [order[j]!, order[i]!];
    const dies = killed < input.killCap && rng.chance(rules.slainShare[input.tier]);
    if (dies) killed += 1;
    struck.push({ who: order[i]!, killed: dies });
  }
  return { landed, struck };
}

/** Trades blows with `defenders` and applies them; unarmed ones (stragglers) strike nothing back. */
function fight(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  rng: RngStream,
  emit: Emit,
  label: SiteLabel,
  t: SiteThreat,
  defenders: Person[],
  armed: boolean,
): void {
  const rules = content.threats;
  const def = t.defId === undefined ? undefined : content.creatures.find((d) => d.id === t.defId);
  const weapons = weaponsOf(world, content, active);
  const walls = wallsFacing(content, active, t.edge);
  let defence = 0;
  if (armed)
    for (const p of defenders) defence += strengthOf(content, p, weapons.get(p.id) ?? 0, walls);
  const attack = t.kind === 'raid' ? t.count * rules.raids.perHead : (def?.danger ?? 1) * t.vigour;
  const cap = Math.floor(content.history.raidKillCap * t.residentsAtArrival) - t.killed;
  const { landed, struck } = combatRound(rules.combat, rng, {
    tier: tierOf(t),
    attack,
    defence,
    defenders: defenders.length,
    killCap: Math.max(0, cap),
  });
  if (t.kind === 'raid') {
    const down = Math.min(landed, t.count);
    t.count -= down;
    t.attackersDown += down;
  } else t.vigour = Math.max(0, t.vigour - landed / (def?.danger ?? 1));
  const how = {
    word: rules.death.word.replace('{name}', t.name),
    span: rules.death.span,
    causes: t.arriveEvent === undefined ? [] : [t.arriveEvent],
  };
  const stats = active.threats.stats;
  for (const s of struck) {
    const p = defenders[s.who]!;
    if (s.killed) {
      killPerson(world, content, active, p, t.kind, undefined, emit, label, how);
      t.killed += 1;
      stats.deaths += 1;
    } else {
      const tier = rng.weighted(Object.entries(rules.combat.woundShares));
      woundPerson(
        world,
        content,
        active,
        p,
        tier,
        `while fighting ${t.name}`,
        emit,
        label,
        t.arriveEvent,
      );
      t.wounded += 1;
      stats.wounds += 1;
    }
  }
}

/** The attackers turn for the edge; the stores are not theirs to take any more. */
function startLeaving(t: SiteThreat): void {
  t.stage = 'leaving';
  t.rounds = 0;
}

/** The people who stood against the attackers are proud of it. */
function crowned(world: WorldState, content: SiteContent, t: SiteThreat): void {
  for (const p of militiaOf(world, t)) {
    remember(content, world, p, content.threats.memoryOf.foughtOff, t.arriveEvent);
  }
}

/** A beast's slaying: the best fighter at the line is named, and the creature's record closes. */
function slay(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  emit: Emit,
  label: SiteLabel,
  t: SiteThreat,
  fighters: Person[],
): void {
  const creature = world.creatures.get(t.creatureId ?? -1);
  const slayer = [...fighters].sort(
    (a, b) => soldierEquivalent(b) - soldierEquivalent(a) || a.id - b.id,
  )[0];
  const event = emit({
    type: content.threats.events.beastSlain,
    actors: slayer ? [slayer.id] : [],
    place: label.cell,
    causes: t.arriveEvent === undefined ? [] : [t.arriveEvent],
    data: { site: label.name, beast: t.name },
  });
  if (creature) {
    creature.died = histYear(world, active);
    if (slayer) creature.slainBy = slayer.name;
    // A promoted resident is tidied away on leaving; only a notable can be named in the record.
    if (slayer && !active.promoted.includes(slayer.id)) creature.slayerId = slayer.id;
    creature.deeds.push(event.id);
  }
  active.threats.stats.slain += 1;
}

/** Moves the attackers one block's walk along the way to `to`. */
function advance(content: SiteContent, active: ActiveSite, t: SiteThreat, to: number): void {
  if (t.tile === to) return;
  const { site, life } = content;
  const route =
    findRoute(active, site, life, t.tile, to, { left: life.pathBudget }) ??
    straightLine(active.map.width, t.tile, to);
  const reached = walkAlong(active, site, life, route, content.threats.combat.advance);
  if (reached >= 0) t.tile = reached;
}

/** A raid reaches the stores, or a beast the town: stores are carried off, a dragon's fire may start. */
function plunder(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  emit: Emit,
  label: SiteLabel,
  t: SiteThreat,
): void {
  const rules = content.threats;
  const causes = t.arriveEvent === undefined ? [] : [t.arriveEvent];
  const meals = foodMeals(active, content);
  if (t.kind === 'raid') {
    const want = Math.floor(meals * rules.raids.lootShare * (t.count / t.came));
    const taken = takeFood(active, content, want, false).taken;
    t.loot += taken;
    active.threats.stats.looted += taken;
    emit({
      type: rules.events.raidLooted,
      place: label.cell,
      causes,
      data: {
        site: label.name,
        from: world.sites.get(t.fromSiteId ?? -1)?.name ?? '',
        meals: taken,
      },
    });
    return;
  }
  const taken = takeFood(
    active,
    content,
    Math.floor(meals * content.history.raidStoresLoss),
    false,
  ).taken;
  t.loot += taken;
  active.threats.stats.looted += taken;
  const event = emit({
    type: rules.events.beastRavaged,
    place: label.cell,
    causes,
    data: { site: label.name, beast: t.name, meals: taken },
  });
  if (t.defId !== undefined && rules.beasts.fireBreath.includes(t.defId)) {
    // The breath takes the home nearest the beast.
    const w = active.map.width;
    let best: { tile: number; d: number } | undefined;
    for (const b of active.buildings.values()) {
      if (b.defId !== content.steward.homeBuilding || b.burnt || b.progress !== undefined) continue;
      const d = dist(w, b.cells[0]!, t.tile);
      if (!best || d < best.d) best = { tile: b.cells[0]!, d };
    }
    const voiceCause = `the fire-breath of ${t.name}`;
    if (best) igniteTile(world, content, active, best.tile, voiceCause, event.id, emit, label);
  }
}

/**
 * After the block's walking: the attackers fight the militia that has come within reach, else
 * walk on toward the stores; arriving unopposed they loot (raiders) or ravage (a beast) and then
 * leave. Whoever is within reach of them at the stores, militia or not, can be hurt.
 */
export function resolveThreat(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  emit: Emit,
  label: SiteLabel,
): void {
  const t = active.threat;
  if (!t || !onMap(t)) return;
  // The block they are first seen they stand at the edge, so the alarm and the gathering show.
  if (t.held) {
    delete t.held;
    return;
  }
  const rules = content.threats;
  const rng = streamFor(world, 'site.threats');
  const width = active.map.width;
  if (t.stage === 'leaving') {
    advance(content, active, t, t.edge);
    if (t.tile === t.edge) {
      t.tile = -1;
      t.leftDay = world.day;
    }
    return;
  }
  const near = militiaOf(world, t).filter(
    (p) => dist(width, tileOfPos(p, width), t.tile) <= rules.combat.engageRange,
  );
  if (near.length > 0 && t.rounds < rules.combat.maxRounds) {
    t.stage = 'fighting';
    t.rounds += 1;
    fight(world, content, active, rng, emit, label, t, near, true);
    const down = t.kind === 'raid' ? t.attackersDown / t.came : 0;
    const causes = t.arriveEvent === undefined ? [] : [t.arriveEvent];
    if (t.kind === 'raid' && (t.count <= 0 || down >= rules.raids.retreatAt)) {
      emit({
        type: rules.events.raidersRepelled,
        place: label.cell,
        causes,
        data: {
          site: label.name,
          from: world.sites.get(t.fromSiteId ?? -1)?.name ?? '',
          down: t.attackersDown,
        },
      });
      active.threats.stats.repelled += 1;
      crowned(world, content, t);
      startLeaving(t);
    } else if (t.kind === 'beast' && t.vigour <= 0) {
      slay(
        world,
        content,
        active,
        emit,
        label,
        t,
        near.filter((p) => alive(p)),
      );
      crowned(world, content, t);
      t.tile = -1;
      t.leftDay = world.day;
      startLeaving(t);
    } else if (t.kind === 'beast' && t.vigour < rules.combat.leavesAt) {
      emit({
        type: rules.events.beastDrivenOff,
        place: label.cell,
        causes,
        data: { site: label.name, beast: t.name },
      });
      active.threats.stats.repelled += 1;
      crowned(world, content, t);
      startLeaving(t);
    }
    return;
  }
  // Out of rounds the line breaks: the militia falls back and nothing stands between them and the stores.
  if (near.length > 0) t.militia = [];
  if (t.tile !== t.target) {
    t.stage = 'coming';
    advance(content, active, t, t.target);
    if (t.tile !== t.target) return;
  }
  t.stage = 'fighting';
  // At the stores: those in reach cannot fight back.
  const strike = rules.flight.strike;
  const stragglers = active.residents
    .map((id) => world.people.get(id))
    .filter(alive)
    .filter((p) => dist(width, tileOfPos(p, width), t.tile) <= strike);
  if (t.kind === 'raid' || t.ravaged === 0) plunder(world, content, active, emit, label, t);
  fight(world, content, active, rng, emit, label, t, stragglers, false);
  t.ravaged += 1;
  if (t.kind === 'raid' || t.ravaged >= rules.flight.ravageBlocks) startLeaving(t);
}
