// Opinions between residents (M3.6, REBOOT_PLAN §6): once an evening each grown resident starts
// a few interactions (chat, joke, help, argue, insult, flirt) with people they share a building,
// a job, a street or the green with. Opinion lives per pair, only for pairs that met, and gains
// friend, rival, enemy and lover labels with hysteresis. Enmity starts grudges; a grudge ends in
// revenge or, with time, forgiveness. Every number is content (`content/interactions.ts`).

import { DAYS_PER_MONTH } from '../core/clock';
import { clamp, manhattan } from '../core/math';
import type { EmitInput } from '../core/context';
import type { InteractionDef, MemoryDef } from '../core/content-types';
import { streamFor, type RngStream } from '../core/rng';
import type {
  ActiveSite,
  Household,
  Id,
  Person,
  Relationship,
  SimEvent,
  WorldState,
} from '../core/types';
import type { Band, SiteContent } from './defs';
import { flirt, freeToCourt, isKin, pairCanCourt } from './family';
import { voiceOf } from './environment';
import { addMemoryTo } from './memory';

/** What the social pass reads of a resident this block (life.ts profiles fit). */
export interface SocialView {
  id: Id;
  person: Person;
  traits: readonly { id: string }[];
  band: Band;
  age: number;
  placeId: Id | null;
  household?: Household | undefined;
}

/** What every social and family step needs. */
export interface SocialEnv {
  world: WorldState;
  content: SiteContent;
  active: ActiveSite;
  emit: (input: EmitInput) => SimEvent;
  label: { name: string; cell: number };
  day: number;
  /** In the evening pass only: who is free to court (`freeToCourt`), so pairs check cheaply. */
  free?: Set<Id>;
}

/** The env for steps run outside the evening pass (a death, a test). */
export function envOf(world: WorldState, content: SiteContent, active: ActiveSite): SocialEnv {
  const { emit, label } = voiceOf(world, content, active);
  return { world, content, active, emit, label, day: world.day };
}

/** Residents who may hold a grudge, so the evening visits only them (rebuilt by one scan after a load). */
const holders = new WeakMap<ActiveSite, Set<Id>>();
function holdersOf(env: SocialEnv): Set<Id> {
  let set = holders.get(env.active);
  if (!set) {
    set = new Set();
    for (const id of env.active.residents) {
      for (const rel of env.world.people.get(id)?.detail?.relationships.values() ?? []) {
        if (rel.grudge) set.add(id);
      }
    }
    holders.set(env.active, set);
  }
  return set;
}

const memoryDefs = new WeakMap<object, Map<string, MemoryDef>>();

/** Gives a resident a memory (the shared life.ts rules: one per type, weakest dropped past the cap). */
export function remember(
  env: SocialEnv,
  person: Person,
  type: string,
  about?: Id,
  eventId?: Id,
): void {
  const detail = person.detail;
  if (!detail) return;
  let defs = memoryDefs.get(env.content.memories);
  if (!defs) {
    defs = new Map(env.content.memories.map((m) => [m.id, m]));
    memoryDefs.set(env.content.memories, defs);
  }
  addMemoryTo(defs, env.content.life.memoryCap, detail, type, env.day, about, eventId);
}

export function relationOf(person: Person, otherId: Id): Relationship | undefined {
  return person.detail?.relationships.get(otherId);
}

export function opinionOf(person: Person, otherId: Id): number {
  return relationOf(person, otherId)?.opinion ?? 0;
}

export function hasLabel(person: Person, otherId: Id, label: string): boolean {
  return relationOf(person, otherId)?.labels.includes(label) ?? false;
}

function ensure(person: Person, otherId: Id): Relationship {
  const map = person.detail!.relationships;
  let rel = map.get(otherId);
  if (!rel) {
    // Every field up front, so all relationships share one shape.
    rel = {
      opinion: 0,
      labels: [],
      grudge: undefined,
      since: undefined,
      met: undefined,
      cause: undefined,
    };
    map.set(otherId, rel);
  }
  return rel;
}

/** Adds or drops a label, noting the day it changed. */
export function setLabel(env: SocialEnv, rel: Relationship, label: string, on: boolean): void {
  const i = rel.labels.indexOf(label);
  if (on && i < 0) rel.labels.push(label);
  else if (!on && i >= 0) rel.labels.splice(i, 1);
  else return;
  rel.since = env.day;
}

/** Recomputes friend, rival and enemy from the opinion (gain at one line, lose at another). */
function relabel(env: SocialEnv, from: Person, to: Person, rel: Relationship): void {
  const L = env.content.social.labels;
  const op = rel.opinion;
  // Most exchanges leave a plain acquaintance between the lines.
  if (rel.labels.length === 0 && op < L.friend.at && op > L.rival.at) return;
  const has = (l: string) => rel.labels.includes(l);
  setLabel(env, rel, 'friend', has('friend') ? op >= L.friend.drop : op >= L.friend.at);
  const wasEnemy = has('enemy');
  const enemy = wasEnemy ? op <= L.enemy.drop : op <= L.enemy.at;
  setLabel(env, rel, 'enemy', enemy);
  setLabel(env, rel, 'rival', !enemy && (has('rival') ? op <= L.rival.drop : op <= L.rival.at));
  if (enemy && !wasEnemy) {
    const event = env.emit({
      type: env.content.social.events.enmity,
      actors: [from.id, to.id],
      place: env.label.cell,
      causes: rel.cause === undefined ? [] : [rel.cause],
      data: { site: env.label.name },
    });
    if (!rel.grudge) {
      rel.grudge = { since: env.day, eventId: event.id };
      holdersOf(env).add(from.id);
    } else if (rel.grudge.eventId === undefined) rel.grudge.eventId = event.id;
  }
}

/**
 * Moves `from`'s opinion of `to` by `delta` (clamped to -100..100) and updates the labels.
 * `cause` is the event behind the change when there is one; `meet` marks that they met today.
 */
export function shiftOpinion(
  env: SocialEnv,
  from: Person,
  to: Person,
  delta: number,
  cause?: Id,
  meet = true,
): Relationship {
  const rel = ensure(from, to.id);
  // Feelings deepen more slowly the stronger they already are, so few pairs reach the ends.
  const same = (delta > 0 && rel.opinion > 0) || (delta < 0 && rel.opinion < 0);
  const step = same ? (delta * (100 - Math.abs(rel.opinion))) / 100 : delta;
  rel.opinion = clamp(rel.opinion + step, -100, 100);
  if (meet) rel.met = env.day;
  if (cause !== undefined) rel.cause = cause;
  relabel(env, from, to, rel);
  return rel;
}

/** A witness thinks less of someone they saw steal or rage (content `social.witnessed`, by memory id). */
export function witnessedWrong(
  env: SocialEnv,
  witness: Person,
  doer: Person,
  memoryType: string,
  eventId: Id,
): void {
  const delta = env.content.social.witnessed[memoryType];
  if (delta === undefined || !witness.detail) return;
  shiftOpinion(env, witness, doer, delta, eventId, false);
}

/** Starts a grudge in `holder` against `target` if none is held. */
function startGrudge(env: SocialEnv, holder: Person, target: Person): void {
  const rel = ensure(holder, target.id);
  if (rel.grudge) return;
  rel.grudge = { since: env.day };
  holdersOf(env).add(holder.id);
  if (rel.cause !== undefined) rel.grudge.eventId = rel.cause;
}

/** The first day of a month, when the slow changes happen. */
export const isMonthStart = (day: number): boolean => day % DAYS_PER_MONTH === 0;

/** Index of a weighted pick from the first `n` of `weights` (the same draw as `RngStream.weighted`). */
function pickIndex(rng: RngStream, weights: number[], n: number): number {
  let total = 0;
  for (let i = 0; i < n; i += 1) total += weights[i]!;
  let roll = rng.int(Math.ceil(total));
  for (let i = 0; i < n; i += 1) {
    roll -= weights[i]!;
    if (roll < 0) return i;
  }
  return n - 1;
}
const scratchDefs: InteractionDef[] = [];
const scratchWeights: number[] = [];
const scratchViews: SocialView[] = [];
const baseWeights: number[] = [];
const poolLists: SocialView[][] = [];
const poolWeights: number[] = [];
const scratchPartnerWeights: number[] = [];

/** Base weight of each interaction kind for this actor (their traits and mood), in content order. */
function kindWeights(env: SocialEnv, actor: SocialView, out: number[]): void {
  const mood = actor.person.detail!.mood;
  const defs = env.content.interactions;
  for (let i = 0; i < defs.length; i += 1) {
    const def = defs[i]!;
    let w = def.weight;
    if (def.traitWeights) for (const t of actor.traits) w *= def.traitWeights[t.id] ?? 1;
    if (mood < 0) w *= def.moodWeight ?? 1;
    out[i] = w;
  }
}

/** Weighted pick of an interaction for this pair, or undefined when none fits. */
function pickKind(
  env: SocialEnv,
  rng: RngStream,
  actor: SocialView,
  target: SocialView,
  base: number[],
): InteractionDef | undefined {
  const opinion = opinionOf(actor.person, target.id);
  const bad = actor.person.detail!.mood < 0;
  const defs = env.content.interactions;
  let n = 0;
  for (let i = 0; i < defs.length; i += 1) {
    const def = defs[i]!;
    if (def.adultsOnly && (actor.band === 'child' || target.band === 'child')) continue;
    if (def.needsOpinionAbove !== undefined && !(opinion >= def.needsOpinionAbove)) continue;
    if (def.needsOpinionBelow !== undefined) {
      if (!(opinion < def.needsOpinionBelow || (def.orBadMood === true && bad))) continue;
    }
    if (
      def.courtship &&
      (hasLabel(actor.person, target.id, 'lover') ||
        !pairCanCourt(env, actor.person, target.person))
    )
      continue;
    scratchDefs[n] = def;
    scratchWeights[n] = base[i]!;
    n += 1;
  }
  return n === 0 ? undefined : scratchDefs[pickIndex(rng, scratchWeights, n)];
}

/** Applies one interaction's effects. */
function interact(
  env: SocialEnv,
  rng: RngStream,
  def: InteractionDef,
  actor: SocialView,
  target: SocialView,
): void {
  const a = actor.person;
  const b = target.person;
  if (def.courtship) {
    flirt(env, rng, a, b);
    return;
  }
  // The target's view of the actor before this exchange decides whether an insult starts a grudge.
  const before = opinionOf(b, a.id);
  shiftOpinion(env, b, a, def.opinion[0]);
  shiftOpinion(env, a, b, def.opinion[1]);
  if (def.memory?.target) remember(env, b, def.memory.target, a.id);
  if (def.memory?.actor) remember(env, a, def.memory.actor, b.id);
  if (def.grudgeIfOpinionBelow !== undefined && before <= def.grudgeIfOpinionBelow) {
    startGrudge(env, b, a);
  }
}

/** Revenge by `avenger` on `target`: a spiteful act, no violence (crime is M3.7). */
function takeRevenge(env: SocialEnv, rng: RngStream, avenger: Person, target: Person): void {
  const rules = env.content.social.grudge;
  const rel = relationOf(avenger, target.id)!;
  const act = rng.weighted(rules.acts.map((s) => [s, s.weight] as const));
  const event = env.emit({
    type: env.content.social.events.revenge,
    actors: [avenger.id, target.id],
    place: env.label.cell,
    causes: rel.grudge?.eventId === undefined ? [] : [rel.grudge.eventId],
    data: { site: env.label.name, act: act.phrase },
  });
  delete rel.grudge;
  remember(env, target, rules.memoryOf.humiliated, avenger.id, event.id);
  remember(env, avenger, rules.memoryOf.vengeance, target.id, event.id);
  // Settling the score eases the avenger's feeling toward the target.
  shiftOpinion(env, avenger, target, rules.satisfaction, event.id);
  const back = shiftOpinion(env, target, avenger, rules.targetOpinion, event.id);
  // The wronged answer in kind: a feud.
  if (back.opinion <= env.content.social.labels.enemy.at && !back.grudge) {
    back.grudge = { since: env.day, eventId: event.id };
    holdersOf(env).add(target.id);
  }
}

const freeSets = new WeakMap<ActiveSite, { key: string; free: Set<Id> }>();

/** The evening's interactions for everyone grown enough to talk, and revenge on grudges met. */
export function runSocial(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  views: readonly SocialView[],
  emit: (input: EmitInput) => SimEvent,
  label: { name: string; cell: number },
  day: number,
): void {
  const env: SocialEnv = { world, content, active, emit, label, day };
  const rng = streamFor(world, 'site.social');
  const rules = content.social;
  const away = (v: SocialView) => {
    const kind = v.person.detail?.breakdown?.kind;
    return kind === 'wandering' || kind === 'despair';
  };
  const people = views.filter(
    (v) => v.age >= content.life.carriedUnder && v.person.detail && !away(v),
  );
  const byPlace = new Map<Id, SocialView[]>();
  const byJob = new Map<string, SocialView[]>();
  const kidsByHome = new Map<Id, SocialView[]>();
  for (const v of people) {
    if (v.placeId !== null) push(byPlace, v.placeId, v);
    const job = v.person.detail!.jobId;
    if (job !== undefined && v.band !== 'child') push(byJob, job, v);
    const home = v.band === 'child' ? v.household?.home : null;
    if (home != null) push(kidsByHome, home, v);
  }
  const nearOf = neighbourHomes(active, kidsByHome, rules.neighbourHomes, day);
  const nearKids = new Map<Id, SocialView[]>();
  const byId = new Map(people.map((v) => [v.id, v]));
  const grudging = holdersOf(env);
  // Who is free to court changes with a birth, death, marriage or move (peopleVersion), new lovers
  // (taken out as they pair) or the passing months (mourning ends, children grow up).
  const freeKey = `${active.peopleVersion}.${Math.floor(day / DAYS_PER_MONTH)}`;
  let kept = freeSets.get(active);
  if (!kept || kept.key !== freeKey) {
    kept = {
      key: freeKey,
      free: freeToCourt(
        env,
        views.map((v) => v.person),
      ),
    };
    freeSets.set(active, kept);
  }
  env.free = kept.free;
  const suitors = people.filter((v) => env.free!.has(v.id));

  // Each resident is in a few interactions this evening, as the one who starts them or the one
  // they are started with: a partner's turn spends one of their own.
  const lo = Math.max(0, rules.perDay[0]);
  const left = new Map<Id, number>();
  for (const v of people) {
    let n = rng.between(lo, Math.max(lo, rules.perDay[1]));
    for (const t of v.traits) n += rules.traitShift[t.id] ?? 0;
    left.set(v.id, Math.max(0, n));
  }
  // The day sets who starts first, so nobody always gets the first pick.
  const first = people.length > 0 ? day % people.length : 0;
  for (let at = 0; at < people.length; at += 1) {
    const v = people[(first + at) % people.length]!;
    // A resident starts talk only every few evenings (they can still be talked to on the others).
    const n = (v.id + day) % rules.startEvery === 0 ? left.get(v.id)! : 0;
    if (n === 0) {
      if (v.band !== 'child' && grudging.has(v.id)) revengeCheck(env, rng, v, byId);
      continue;
    }
    let np = 0;
    const building = v.placeId === null ? undefined : byPlace.get(v.placeId);
    if (building && building.length > 1) {
      poolLists[np] = building;
      poolWeights[np++] = rules.pools.building;
    }
    const job = v.band === 'child' ? undefined : byJob.get(v.person.detail!.jobId ?? '');
    if (job && job.length > 1) {
      poolLists[np] = job;
      poolWeights[np++] = rules.pools.job;
    }
    const home = v.band === 'child' ? v.household?.home : null;
    let kids: SocialView[] | undefined;
    if (home != null && kidsByHome.has(home)) {
      kids = nearKids.get(home);
      if (!kids) {
        kids = [...kidsByHome.get(home)!];
        for (const o of nearOf.get(home) ?? []) kids.push(...(kidsByHome.get(o) ?? []));
        nearKids.set(home, kids);
      }
    }
    if (kids && kids.length > 1) {
      poolLists[np] = kids;
      poolWeights[np++] = rules.pools.neighbour;
    }
    if (people.length > 1) {
      poolLists[np] = people;
      poolWeights[np++] = rules.pools.green;
    }
    const single = n > 0 && env.free.has(v.id);
    // The unwed seek each other out at gatherings: the others free to court are a pool of their own.
    if (single && suitors.length > 1) {
      poolLists[np] = suitors;
      poolWeights[np++] = rules.pools.suitor;
    }
    let weighted = false;
    for (let k = 0; k < n && np > 0; k += 1) {
      const pool = poolLists[pickIndex(rng, poolWeights, np)]!;
      let found = 0;
      for (let s = 0; s < rules.sample; s += 1) {
        const c = pool[rng.int(pool.length)]!;
        if (c === v) continue;
        const friend = hasLabel(v.person, c.id, 'friend');
        // Someone free to marry seeks out others who are.
        const suitor = single && pairCanCourt(env, v.person, c.person);
        scratchViews[found] = c;
        scratchPartnerWeights[found] =
          (friend ? rules.friendWeight : 1) * (suitor ? rules.suitorWeight : 1);
        found += 1;
      }
      if (found === 0) continue;
      const partner = scratchViews[pickIndex(rng, scratchPartnerWeights, found)]!;
      if (!weighted) {
        kindWeights(env, v, baseWeights);
        weighted = true;
      }
      const def = pickKind(env, rng, v, partner, baseWeights);
      if (!def) continue;
      active.interactions += 1;
      interact(env, rng, def, v, partner);
      left.set(partner.id, Math.max(0, left.get(partner.id)! - 1));
    }
    // A grudge against someone met this evening (same building or same job) may boil over.
    if (v.band !== 'child' && grudging.has(v.id)) revengeCheck(env, rng, v, byId);
  }
  if (isMonthStart(day)) monthlySocial(env, rng, views);
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** The few nearest other homes with children, per home with children; kept for a month at a time. */
const nearHomes = new WeakMap<ActiveSite, { key: string; homes: Map<Id, Id[]> }>();

function neighbourHomes(
  active: ActiveSite,
  kidsByHome: Map<Id, SocialView[]>,
  count: number,
  day: number,
): Map<Id, Id[]> {
  const key = `${active.layoutVersion}.${active.peopleVersion}.${Math.floor(day / DAYS_PER_MONTH)}`;
  const kept = nearHomes.get(active);
  if (kept && kept.key === key) return kept.homes;
  const homes = [...kidsByHome.keys()].sort((a, b) => a - b);
  const centre = (id: Id): [number, number] => {
    const b = active.buildings.get(id);
    return b ? [b.x + (b.w >> 1), b.y + (b.h >> 1)] : [0, 0];
  };
  const out = new Map<Id, Id[]>();
  for (const id of homes) {
    const [x, y] = centre(id);
    const others = homes
      .filter((o) => o !== id)
      .map((o) => {
        const [ox, oy] = centre(o);
        return { o, d: manhattan(ox, oy, x, y) };
      })
      .sort((a, b) => a.d - b.d || a.o - b.o)
      .slice(0, count);
    out.set(
      id,
      others.map((e) => e.o),
    );
  }
  nearHomes.set(active, { key, homes: out });
  return out;
}

function revengeCheck(
  env: SocialEnv,
  rng: RngStream,
  v: SocialView,
  byId: Map<Id, SocialView>,
): void {
  const rules = env.content.social.grudge;
  const rels = v.person.detail!.relationships;
  let culture: { values: { honour: number } } | undefined;
  for (const [id, rel] of rels) {
    if (!rel.grudge) continue;
    const other = byId.get(id);
    if (!other) continue;
    const together =
      (v.placeId !== null && v.placeId === other.placeId) ||
      (v.person.detail!.jobId !== undefined &&
        v.person.detail!.jobId === other.person.detail!.jobId);
    if (!together) continue;
    culture ??= env.content.cultures.find((c) => c.id === v.person.cultureId);
    let chance = rules.revengeChance * ((culture?.values.honour ?? 5) / 5);
    if (v.traits.some((t) => t.id === rules.hotTrait)) chance *= rules.hotMul;
    if (rng.chance(chance)) takeRevenge(env, rng, v.person, other.person);
  }
}

/** Monthly: opinions of pairs who did not meet drift toward 0, old grudges may be forgiven. */
function monthlySocial(env: SocialEnv, rng: RngStream, views: readonly SocialView[]): void {
  const { social } = env.content;
  const day = env.day;
  for (const v of views) {
    const rels = v.person.detail?.relationships;
    if (!rels) continue;
    for (const [id, rel] of [...rels]) {
      const other = env.world.people.get(id);
      if (!other) {
        rels.delete(id);
        continue;
      }
      if (rel.met === undefined || day - rel.met >= DAYS_PER_MONTH) {
        const by = social.drift.by;
        rel.opinion =
          rel.opinion > 0 ? Math.max(0, rel.opinion - by) : Math.min(0, rel.opinion + by);
        relabel(env, v.person, other, rel);
      }
      if (
        Math.abs(rel.opinion) < social.drift.forgetBelow &&
        rel.labels.length === 0 &&
        !rel.grudge
      )
        rels.delete(id);
    }
    forgiveGrudges(env, rng, v);
  }
}

function forgiveGrudges(env: SocialEnv, rng: RngStream, v: SocialView): void {
  const g = env.content.social.grudge;
  const culture = env.content.cultures.find((c) => c.id === v.person.cultureId);
  const base = 1 + ((culture?.values.kin ?? 0) + (culture?.values.faith ?? 0)) / 20;
  for (const [id, rel] of [...v.person.detail!.relationships]) {
    const grudge = rel.grudge;
    if (!grudge || env.day - grudge.since < g.forgiveAfterDays) continue;
    const other = env.world.people.get(id);
    if (!other) continue;
    let chance = g.forgiveBase * base;
    if (v.traits.some((t) => g.forgiveTraits.includes(t.id))) chance *= 2;
    if (isKin(env.world, v.person, other)) chance *= g.kinMul;
    if (env.day - grudge.since >= g.forgiveDoubleDays) chance *= 2;
    if (!rng.chance(chance)) continue;
    delete rel.grudge;
    rel.opinion = g.forgivenOpinion;
    setLabel(env, rel, 'enemy', false);
    env.emit({
      type: env.content.social.events.forgave,
      actors: [v.id, id],
      place: env.label.cell,
      causes: grudge.eventId === undefined ? [] : [grudge.eventId],
      data: { site: env.label.name },
    });
  }
}
