// The threat block by block (M3.8): who defends, shelters or flees before the walk, then the
// attackers fight the militia in reach, or walk on to the stores and loot or ravage them.

import type { Activity, CreatureTier, ThreatRules } from '../core/content-types';
import { streamFor, type RngStream } from '../core/rng';
import type { ActiveSite, Id, Person, SiteThreat, WorldState } from '../core/types';
import { stochasticRound } from '../history/pop';
import { soldierEquivalent } from '../people/combat-scale';
import { type SiteLabel } from './build';
import { type SiteContent } from './defs';
import { igniteTile } from './fire';
import { killPerson, woundPerson } from './health';
import { findRoute, straightLine, tileCost, walkAlong } from './path';
import { foodMeals, takeFood } from './stock';

import {
  alive,
  attackOf,
  dist,
  histYear,
  remember,
  strengthOf,
  tierOf,
  tileOfPos,
  wallsFacing,
  weaponsOf,
  type Emit,
} from './threat-common';

/** What a resident does this block because of the threat; `tile` is -1 where life.ts picks it (home). */
export interface ThreatOrder {
  activity: Extract<Activity, 'defend' | 'shelter' | 'flee'>;
  tile: number;
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
  const attack = attackOf(content, t);
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

/** The attackers turn away; they stand one more block (the outcome shows) and are gone, with no walk back. */
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
  const most = t.residentsAtArrival * rules.beasts.mealCapDays;
  const taken = takeFood(
    active,
    content,
    Math.min(most, Math.floor(meals * content.history.raidStoresLoss)),
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
    t.tile = -1;
    t.leftDay = world.day;
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
      startLeaving(t);
      t.tile = -1;
      t.leftDay = world.day;
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
