// Light magic and lore at the watched site (M3.9, REBOOT_PLAN §5.3, R-28, R-29). Cantrips are
// learned only from a parent, the site's hedge-witch or a book of the school; books are lent,
// lost and burnt; a few people wake to more power; races keep their dependencies. Every number is
// content (content/lore.ts, awakenings.ts); this file holds only the rules. Randomness comes from
// the `site.lore` stream, people in id order.

import { DAYS_PER_YEAR, dateOf } from '../core/clock';
import type { EmitInput } from '../core/context';
import type { AbilityDef, LoreRules } from '../core/content-types';
import { streamFor } from '../core/rng';
import type {
  ActiveSite,
  Building,
  Condition,
  Id,
  Item,
  Person,
  PersonDetail,
  PersonLore,
  SimEvent,
  SiteLore,
  WorldState,
} from '../core/types';
import { meetsRequirements } from '../people/aptitude';
import { TIERS, TIER_IDS, tierOfPower } from '../people/tiers';
import type { SiteLabel } from './build';
import { bandOfAge, type SiteContent } from './defs';
import { opinionOf, remember, shiftOpinion, type SocialEnv } from './social';
import {
  effectiveAttributes,
  effectivePower,
  heldItems,
  refreshWork,
  residentItems,
  type HeldItem,
} from './work';

type Emit = (input: EmitInput) => SimEvent;

// ---- State ----

/** The site's lore record at embark: no hedge-witch, no loans, the ore last worked today. */
export function blankLore(day = 0): SiteLore {
  return {
    hedgeWitch: null,
    loans: [],
    lastOreWorkDay: day,
    stats: {
      learned: 0,
      lent: 0,
      lost: 0,
      awakenings: 0,
      logsSaved: 0,
      mended: 0,
      soothed: 0,
      frostsRead: 0,
      calmed: 0,
      soothedAtHome: 0,
      herbsSpared: 0,
    },
  };
}

const emptyLore = (): PersonLore => ({
  learned: {},
  castsDay: -1,
  casts: {},
  castTotal: {},
  readDays: 0,
  heldDays: 0,
});

/** A resident's lore record, made on first use (newborns have none until then). */
export function ensureLore(detail: PersonDetail): PersonLore {
  return (detail.lore ??= emptyLore());
}

// ---- Lookups ----

interface Lookups {
  /** The site's cantrips in content order. */
  cantrips: AbilityDef[];
  abilities: Map<string, AbilityDef>;
  /** Book form → magic school (mundane forms have none). */
  formSchool: Map<string, string>;
}

const lookupCache = new WeakMap<object, Lookups>();
function lookupsOf(content: SiteContent): Lookups {
  let l = lookupCache.get(content.lore);
  if (!l) {
    const abilities = new Map(content.abilities.map((a) => [a.id, a]));
    const formSchool = new Map<string, string>();
    for (const [school, forms] of Object.entries(content.notables.bookForms)) {
      if (school === 'mundane') continue;
      for (const form of forms) formSchool.set(form, school);
    }
    l = {
      cantrips: content.lore.cantrips.map((id) => abilities.get(id)!).filter((a) => a),
      abilities,
      formSchool,
    };
    lookupCache.set(content.lore, l);
  }
  return l;
}

/** The magic school a book form teaches; undefined for the mundane forms (they teach nothing). */
export function bookSchool(
  content: Pick<SiteContent, 'notables'>,
  form: string,
): string | undefined {
  for (const [school, forms] of Object.entries(content.notables.bookForms)) {
    if (school !== 'mundane' && forms.includes(form)) return school;
  }
  return undefined;
}

/** The cantrips whose requirements the person meets, known or not. */
export function learnableCantrips(content: SiteContent, person: Person): AbilityDef[] {
  return lookupsOf(content).cantrips.filter((a) => meetsRequirements(person, a));
}

const ageOf = (world: WorldState, active: ActiveSite, p: Person): number =>
  world.params.historyYears + Math.floor((world.day - active.enteredDay) / DAYS_PER_YEAR) - p.born;

const knows = (p: Person, id: string): boolean => p.knownAbilities.includes(id);
const isLive = (p: Person | undefined): p is Person & { detail: PersonDetail } =>
  p !== undefined && p.died === undefined && p.detail !== undefined;

// ---- Sources: a parent, the hedge-witch or a book ----

interface Ctx {
  world: WorldState;
  content: SiteContent;
  active: ActiveSite;
  rules: LoreRules;
  look: Lookups;
  residents: Set<Id>;
  heldOf: (id: Id) => readonly HeldItem[];
}

function ctxOf(world: WorldState, content: SiteContent, active: ActiveSite): Ctx {
  return {
    world,
    content,
    active,
    rules: content.lore,
    look: lookupsOf(content),
    residents: new Set(active.residents),
    heldOf: (id) => heldItems(world, content, id),
  };
}

/** The book (and school) is held or borrowed by this person, so they can read it. */
function hasBook(ctx: Ctx, personId: Id, item: Item): boolean {
  return (
    item.holder !== null &&
    (item.holder === personId ||
      ctx.active.lore.loans.some((l) => l.item === item.id && l.borrower === personId))
  );
}

/** School books the person holds or has borrowed, in item id order. */
function booksOf(ctx: Ctx, personId: Id): { item: Item; school: string }[] {
  const out: { item: Item; school: string }[] = [];
  for (const { item } of ctx.heldOf(personId)) {
    const school = ctx.look.formSchool.get(item.form);
    if (item.kind === 'book' && item.holder === personId && school) out.push({ item, school });
  }
  for (const loan of ctx.active.lore.loans) {
    if (loan.borrower !== personId) continue;
    const item = ctx.world.items.get(loan.item);
    const school = item && ctx.look.formSchool.get(item.form);
    if (item && item.holder !== null && school) out.push({ item, school });
  }
  return out.sort((a, b) => a.item.id - b.item.id);
}

const canRead = (ctx: Ctx, p: Person): boolean =>
  effectiveAttributes(p, ctx.heldOf(p.id)).intellect >= ctx.rules.readMinIntellect;

/** A living resident who knows the cantrip (a teacher need not be on their feet to be valid). */
function teacherValid(ctx: Ctx, id: Id, abilityId: string): boolean {
  const t = ctx.world.people.get(id);
  return isLive(t) && ctx.residents.has(id) && knows(t, abilityId);
}

/** Where `p` could learn the cantrip today: a parent here, the hedge-witch, or a book of the school. */
function sourceOf(
  ctx: Ctx,
  p: Person,
  ability: AbilityDef,
): { teacher: Id | null; book: Id | null } | null {
  const teaches = (id: Id) =>
    teacherValid(ctx, id, ability.id) && !ctx.world.people.get(id)!.detail!.abed;
  // Teachers take apprentices, not grown folk: past that age only a book can teach.
  const race = ctx.content.races.find((r) => r.id === p.raceId);
  const young = !race || ageOf(ctx.world, ctx.active, p) < race.maturityYears * ctx.rules.pupilUpTo;
  const parent = young ? p.family.parents.find(teaches) : undefined;
  if (parent !== undefined) return { teacher: parent, book: null };
  const witch = ctx.active.lore.hedgeWitch;
  if (young && witch !== null && witch !== p.id && teaches(witch))
    return { teacher: witch, book: null };
  if (ability.learnFrom.includes('book') && ability.school && canRead(ctx, p)) {
    const book = booksOf(ctx, p.id).find((b) => b.school === ability.school);
    if (book) return { teacher: null, book: book.item.id };
  }
  return null;
}

/** The source the evening lessons would use for this cantrip today, or null when there is none. */
export function cantripSource(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  person: Person,
  abilityId: string,
): { teacher: Id | null; book: Id | null } | null {
  const ability = lookupsOf(content).abilities.get(abilityId);
  if (!ability) return null;
  return sourceOf(ctxOf(world, content, active), person, ability);
}

/** Old enough, on their feet and not in a breakdown: free to read or take a lesson this evening. */
function free(ctx: Ctx, p: Person, age: number): boolean {
  return age >= ctx.rules.minAge && !p.detail!.abed && !p.detail!.breakdown;
}

// ---- Embark ----

/** Gives every resident a lore record and the grown, sparked ones the cantrips they were taught before. */
export function seedLore(world: WorldState, content: SiteContent, active: ActiveSite): void {
  const rng = streamFor(world, 'site.lore');
  const look = lookupsOf(content);
  const races = new Map(content.races.map((r) => [r.id, r]));
  for (const id of active.residents) {
    const p = world.people.get(id);
    if (!p?.detail) continue;
    ensureLore(p.detail);
    const race = races.get(p.raceId);
    if (!race || p.magic.power < 1) continue;
    if (bandOfAge(race, ageOf(world, active, p)) === 'child') continue;
    for (const a of look.cantrips) {
      if (!meetsRequirements(p, a) || knows(p, a.id)) continue;
      if (rng.chance(content.lore.knownAtEmbark)) p.knownAbilities.push(a.id);
    }
  }
  active.lore.hedgeWitch = hedgeWitchOf(ctxOf(world, content, active));
  casterCache.delete(active);
}

// ---- Hedge-witch ----

/** The adult of enough power who knows the most cantrips (then more power, then lower id). */
function hedgeWitchOf(ctx: Ctx): Id | null {
  let best: Person | null = null;
  let bestKnown = 0;
  for (const id of ctx.active.residents) {
    const p = ctx.world.people.get(id);
    if (!isLive(p) || p.magic.power < ctx.rules.hedgeWitchMinPower) continue;
    const race = ctx.content.races.find((r) => r.id === p.raceId);
    if (!race || bandOfAge(race, ageOf(ctx.world, ctx.active, p)) === 'child') continue;
    const n = ctx.rules.cantrips.filter((c) => knows(p, c)).length;
    if (n === 0) continue;
    if (n > bestKnown || (n === bestKnown && best !== null && p.magic.power > best.magic.power)) {
      best = p;
      bestKnown = n;
    }
  }
  return best?.id ?? null;
}

// ---- Casting ----

/** Residents who know a cantrip with the effect tag, per tag, for one day (rebuilt each day). */
const casterCache = new WeakMap<ActiveSite, { day: number; byTag: Map<string, Id[]> }>();

function castersOf(world: WorldState, content: SiteContent, active: ActiveSite, tag: string): Id[] {
  let entry = casterCache.get(active);
  if (!entry || entry.day !== world.day) {
    entry = { day: world.day, byTag: new Map() };
    casterCache.set(active, entry);
  }
  let list = entry.byTag.get(tag);
  if (!list) {
    const abilities = content.abilities.filter((a) => a.effect.tag === tag).map((a) => a.id);
    list = [];
    for (const id of active.residents) {
      const p = world.people.get(id);
      if (p && p.knownAbilities.some((k) => abilities.includes(k))) list.push(id);
    }
    entry.byTag.set(tag, list);
  }
  return list;
}

/** True when some resident knows a cantrip with this effect tag (a cheap check before the work). */
export function hasCasters(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  tag: string,
): boolean {
  return castersOf(world, content, active, tag).length > 0;
}

/** Records one use of the person's cantrip with the tag if they have one left today. */
function tryCast(
  world: WorldState,
  content: SiteContent,
  p: Person,
  tag: string,
): AbilityDef | null {
  const d = p.detail;
  if (!d || p.died !== undefined || d.abed) return null;
  const abilities = lookupsOf(content).abilities;
  const lore = ensureLore(d);
  if (lore.castsDay !== world.day) {
    lore.castsDay = world.day;
    lore.casts = {};
  }
  for (const id of p.knownAbilities) {
    const a = abilities.get(id);
    if (!a || a.effect.tag !== tag) continue;
    const cap = Math.min(
      a.effect.usesPerDay ?? 1,
      TIERS[tierOfPower(effectivePower(p, heldItems(world, content, p.id)))].caps.maxUsesPerDay,
    );
    if ((lore.casts[id] ?? 0) >= cap) continue;
    lore.casts[id] = (lore.casts[id] ?? 0) + 1;
    lore.castTotal[id] = (lore.castTotal[id] ?? 0) + 1;
    if (d.needs.rest !== undefined)
      d.needs.rest = Math.max(0, d.needs.rest - content.lore.castRest);
    return a;
  }
  return null;
}

/**
 * Finds a living, on-their-feet resident who knows a cantrip with the effect tag and has a use
 * left today, and records the cast (the use, and the rest it costs). Null when no one can.
 */
export function castCantrip(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  tag: string,
  filter?: (p: Person) => boolean,
): { person: Person; ability: AbilityDef } | null {
  for (const id of castersOf(world, content, active, tag)) {
    const p = world.people.get(id);
    if (!p || (filter && !filter(p))) continue;
    const ability = tryCast(world, content, p, tag);
    if (ability) return { person: p, ability };
  }
  return null;
}

/** A hearth is kept by a kindler of the household (one cast): the share of logs it burns, else 1. */
export function kindleHome(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  members: readonly Id[],
): boolean {
  return castCantrip(world, content, active, 'warmth', (p) => members.includes(p.id)) !== null;
}

/**
 * The share of the night's frost harm the fields take: the content's frost share when a
 * weather-reader casts, else 1. Says so in the chronicle once per frost spell.
 */
export function frostHarmShare(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  emit: Emit,
  label: SiteLabel,
): number {
  const lore = active.lore;
  const consecutive = lore.frostDay === world.day - 1;
  lore.frostDay = world.day;
  const cast = castCantrip(world, content, active, 'weather_read');
  if (!cast) return 1;
  if (!consecutive) {
    emit({
      type: content.lore.events.frostRead,
      actors: [cast.person.id],
      place: label.cell,
      data: { site: label.name, sign: cast.ability.school === 'water' ? 'rain' : 'sky' },
    });
    lore.stats.frostsRead += 1;
  }
  return content.lore.effects.frostShare;
}

/**
 * Soothers ease one untended hurt or illness per use: a household member first, then anyone.
 * `homeOnly` (before the healers' round) eases only the soother's own household.
 */
export function soothePass(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  tendable: (c: Condition) => boolean,
  homeOnly = false,
): void {
  const ids = castersOf(world, content, active, 'soothe');
  if (ids.length === 0) return;
  // Every untended hurt or illness, in resident order; each use of a cantrip takes one off the list.
  const open: { p: Person; c: Condition }[] = [];
  for (const rid of active.residents) {
    const p = world.people.get(rid);
    if (!p || p.died !== undefined) continue;
    for (const c of p.detail?.conditions ?? [])
      if (c.tended !== true && tendable(c)) open.push({ p, c });
  }
  for (const id of ids) {
    if (open.length === 0) return;
    const caster = world.people.get(id);
    if (!caster) continue;
    const kin = new Set(active.households.get(caster.family.householdId ?? -1)?.members ?? []);
    while (open.length > 0) {
      let at = open.findIndex((t) => kin.has(t.p.id));
      if (at < 0 && homeOnly) break;
      if (at < 0) at = 0;
      if (!tryCast(world, content, caster, 'soothe')) break;
      const [target] = open.splice(at, 1);
      target!.c.tended = true;
      target!.c.tendPower = content.lore.effects.soothePower;
      active.lore.stats.soothed += 1;
      if (homeOnly) active.lore.stats.soothedAtHome += 1;
    }
  }
}

/** Each mender makes good part of a day's wear on their own home (one use a day), else on the most worn. */
function mendPass(world: WorldState, content: SiteContent, active: ActiveSite): void {
  const per = content.lore.effects.mendPerUse;
  const standing = (b: Building | undefined): b is Building =>
    b !== undefined &&
    b.progress === undefined &&
    b.defId !== 'field' &&
    !b.burnt &&
    b.condition < 100;
  for (const id of castersOf(world, content, active, 'mending')) {
    const p = world.people.get(id);
    if (!p) continue;
    const home = active.households.get(p.family.householdId ?? -1)?.home;
    let target = home == null ? undefined : active.buildings.get(home);
    if (!standing(target)) {
      target = undefined;
      for (const b of active.buildings.values()) {
        if (!standing(b)) continue;
        if (
          !target ||
          b.condition < target.condition ||
          (b.condition === target.condition && b.id < target.id)
        )
          target = b;
      }
    }
    if (!target || !tryCast(world, content, p, 'mending')) continue;
    const to = Math.min(100, target.condition + per);
    active.lore.stats.mended += to - target.condition;
    target.condition = to;
  }
}

/** Each calmer steadies the most stressed member of their household (one use a day). */
function calmPass(world: WorldState, content: SiteContent, active: ActiveSite): void {
  for (const id of castersOf(world, content, active, 'calm')) {
    const p = world.people.get(id);
    if (!p) continue;
    let target: PersonDetail | undefined;
    for (const mid of active.households.get(p.family.householdId ?? -1)?.members ?? [id]) {
      const d = world.people.get(mid)?.detail;
      if (d && d.stress > 0 && (!target || d.stress > target.stress)) target = d;
    }
    if (!target || !tryCast(world, content, p, 'calm')) continue;
    const eased = Math.min(target.stress, content.lore.effects.calmStress);
    target.stress -= eased;
    active.lore.stats.calmed += eased;
  }
}

// ---- Daily (block 0): mending, calming, dependencies, awakenings ----

/** The day's lore at block 0. */
export function runLoreDay(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  emit: Emit,
  label: SiteLabel,
): void {
  mendPass(world, content, active);
  calmPass(world, content, active);
  const env: SocialEnv = { world, content, active, emit, label, day: world.day };
  runDependencies(env);
  if (dateOf(world.day).dayOfMonth === 1) runAwakenings(env);
}

/** Races that need the old places or ore work feel it while it is missing (R-29). */
function runDependencies(env: SocialEnv): void {
  const { world, content, active } = env;
  const dep = content.lore.dependencies;
  const site = world.sites.get(active.siteId);
  const aura = (site && world.cells?.aura[site.cell]) ?? Infinity;
  const thin = aura < dep.aura.below;
  const noOre = world.day - active.lore.lastOreWorkDay >= dep.ore.days;
  if (!thin && !noOre) return;
  for (const id of active.residents) {
    const p = world.people.get(id);
    if (!isLive(p)) continue;
    if (thin && dep.aura.races.includes(p.raceId)) remember(env, p, dep.aura.memory);
    if (noOre && dep.ore.races.includes(p.raceId)) {
      const race = content.races.find((r) => r.id === p.raceId);
      if (race && bandOfAge(race, ageOf(world, active, p)) !== 'child')
        remember(env, p, dep.ore.memory);
    }
  }
}

/** Monthly: long study of a book or long keeping of an item lifts a person one tier, once (§5.3). */
function runAwakenings(env: SocialEnv): void {
  const { world, content, active, emit, label } = env;
  const rng = streamFor(world, 'site.lore');
  const rules = content.lore;
  const look = lookupsOf(content);
  for (const id of active.residents) {
    const p = world.people.get(id);
    if (!isLive(p) || p.awakening) continue;
    const lore = ensureLore(p.detail);
    const tier = TIER_IDS.indexOf(tierOfPower(p.magic.power));
    const next = TIER_IDS[tier + 1];
    if (!next || next === 'legendary') continue;
    for (const def of content.awakenings) {
      if (tier > TIER_IDS.indexOf(def.maxFromTier)) continue;
      const itemId = def.source === 'book' ? lore.readBook : lore.heldItem;
      const days = def.source === 'book' ? lore.readDays : lore.heldDays;
      const item = itemId === undefined ? undefined : world.items.get(itemId);
      if (!item || item.holder === null || days < def.afterDays) continue;
      if (def.source === 'item' && item.holder !== p.id) continue;
      const school = look.formSchool.get(item.form);
      if (def.source === 'book' && !school) continue;
      if (!rng.chance(def.monthlyChance)) continue;
      const power = TIERS[next].minPower;
      let affinity = school;
      if (def.source === 'item') {
        const have = Object.entries(p.magic.affinities).sort((a, b) => b[1] - a[1])[0];
        const race = content.races.find((r) => r.id === p.raceId);
        affinity =
          have?.[0] ??
          rng.weighted(
            Object.entries(race?.affinityWeights ?? {}).map(([k, w]) => [k, w] as const),
          );
      }
      p.magic.power = power;
      if (affinity)
        p.magic.affinities[affinity] = Math.max(p.magic.affinities[affinity] ?? 0, power);
      const event = emit({
        type: rules.events.awakened,
        actors: [p.id],
        place: label.cell,
        causes: item.deeds.length > 0 ? [item.deeds[item.deeds.length - 1]!] : [],
        data: {
          site: label.name,
          item: item.name,
          how: def.how.replace('{item}', item.name),
          tier: next,
        },
      });
      item.deeds.push(event.id);
      p.awakening = { id: def.id, day: world.day, eventId: event.id };
      remember(env, p, rules.memoryOf.awakened, undefined, event.id);
      active.lore.stats.awakenings += 1;
      refreshWork(content, active);
      break;
    }
  }
}

// ---- Evening: hedge-witch, books, lessons, counters ----

/** The evening's lore: the hedge-witch, books lent and lost, lessons, reading and keeping. */
export function runLore(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  emit: Emit,
  label: SiteLabel,
  day: number,
): void {
  const ctx = ctxOf(world, content, active);
  const held = new Map<Id, HeldItem[]>();
  for (const h of residentItems(world, content, active)) {
    const list = held.get(h.holder);
    if (list) list.push(h);
    else held.set(h.holder, [h]);
  }
  ctx.heldOf = (id) => held.get(id) ?? [];
  const env: SocialEnv = { world, content, active, emit, label, day };
  const rng = streamFor(world, 'site.lore');

  // The hedge-witch: set quietly on the first evening, announced when it changes after that.
  const witch = hedgeWitchOf(ctx);
  if (witch !== active.lore.hedgeWitch) {
    if (witch !== null && day !== active.enteredDay) {
      emit({
        type: content.lore.events.hedgeWitch,
        actors: [witch],
        place: label.cell,
        data: { site: label.name },
      });
    }
    active.lore.hedgeWitch = witch;
  }

  runLoans(ctx, env, rng);
  runLessons(ctx, env);
  countStudy(ctx, held);
}

type Rng = ReturnType<typeof streamFor>;

/** The cantrips of a school the person qualifies for and does not yet know. */
const unknownOf = (ctx: Ctx, p: Person, school: string): AbilityDef[] =>
  ctx.look.cantrips.filter(
    (a) =>
      a.school === school &&
      a.learnFrom.includes('book') &&
      !knows(p, a.id) &&
      meetsRequirements(p, a),
  );

function lastDeed(item: Item): Id[] {
  return item.deeds.length > 0 ? [item.deeds[item.deeds.length - 1]!] : [];
}

/**
 * The item's last deed that is not one of `routine` (a loan or a return): lending a book again is
 * not caused by its last return, so a book lent week after week makes no chain of causes.
 */
function lastStoryDeed(world: WorldState, item: Item, routine: readonly string[]): Id[] {
  const events = world.events;
  for (let i = item.deeds.length - 1; i >= 0; i -= 1) {
    const id = item.deeds[i]!;
    // Events are kept in id order: find this one by halving.
    let lo = 0;
    let hi = events.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (events[mid]!.id < id) lo = mid + 1;
      else hi = mid;
    }
    const event = events[lo];
    if (event?.id !== id) return [id];
    if (!routine.includes(event.type)) return [id];
  }
  return [];
}

/** Loses a book held by its owner: the item has no holder, and the lessons from it end. */
function loseBook(ctx: Ctx, item: Item): void {
  item.holder = null;
  const cell = ctx.world.sites.get(ctx.active.siteId)?.cell;
  if (cell !== undefined) item.lostAt = cell;
  const lore = ctx.active.lore;
  lore.loans = lore.loans.filter((l) => l.item !== item.id);
  lore.stats.lost += 1;
  refreshWork(ctx.content, ctx.active);
}

/**
 * After a book is lost or burnt: the cantrips of its school that no one here knows and no other
 * book here teaches now have no source at the site. Says so once (this line pauses play).
 */
function lastSourceGone(ctx: Ctx, env: SocialEnv, item: Item, actor: Id, cause: Id): void {
  const { world, content, active } = ctx;
  const school = ctx.look.formSchool.get(item.form);
  if (!school) return;
  for (const { item: other } of residentItems(world, content, active)) {
    if (
      other.id !== item.id &&
      other.holder !== null &&
      ctx.look.formSchool.get(other.form) === school
    )
      return;
  }
  const orphaned = ctx.look.cantrips.filter(
    (a) =>
      a.school === school &&
      a.learnFrom.includes('book') &&
      !active.residents.some((id) => {
        const p = world.people.get(id);
        return isLive(p) && knows(p, a.id);
      }),
  );
  if (orphaned.length === 0) return;
  const event = env.emit({
    type: ctx.rules.events.lastSource,
    actors: [actor],
    place: env.label.cell,
    causes: [cause],
    data: {
      site: env.label.name,
      item: item.name,
      cantrips: orphaned.map((a) => a.name).join(' and '),
    },
  });
  item.deeds.push(event.id);
}

function runLoans(ctx: Ctx, env: SocialEnv, rng: Rng): void {
  const { world, content, active, rules } = ctx;
  const { emit, label, day } = env;
  const books = rules.books;
  const lore = active.lore;
  for (const loan of [...lore.loans]) {
    const item = world.items.get(loan.item);
    if (!item || item.holder === null) {
      lore.loans = lore.loans.filter((l) => l !== loan);
      continue;
    }
    loan.owner = item.holder;
    const owner = world.people.get(loan.owner);
    const borrower = world.people.get(loan.borrower);
    if (!isLive(borrower) || !ctx.residents.has(loan.borrower)) {
      // The borrower has gone: the book is the owner's again.
      lore.loans = lore.loans.filter((l) => l !== loan);
      if (borrower && borrower.died === undefined && owner) giveBack(ctx, env, loan, item);
      continue;
    }
    if (rng.chance(books.lossPerDay)) {
      const event = emit({
        type: rules.events.lost,
        actors: [loan.owner, loan.borrower],
        place: label.cell,
        causes: [loan.eventId],
        data: { site: label.name, item: item.name },
      });
      item.deeds.push(event.id);
      loseBook(ctx, item);
      lastSourceGone(ctx, env, item, loan.borrower, event.id);
      if (isLive(owner)) {
        shiftOpinion(env, owner, borrower, books.lostSting, event.id);
        remember(env, owner, rules.memoryOf.bookLost, borrower.id, event.id);
      }
      continue;
    }
    const school = ctx.look.formSchool.get(item.form);
    const done = !school || unknownOf(ctx, borrower, school).length === 0;
    if (done || day - loan.since >= books.maxLoanDays) {
      lore.loans = lore.loans.filter((l) => l !== loan);
      giveBack(ctx, env, loan, item);
    }
  }
  // Owners who can learn nothing from a school book lend it to someone who can, each on their
  // own day of the week (staggered by owner), so the lending is not all on one day.
  for (const { item, def } of residentItems(world, content, active)) {
    if (item.kind !== 'book' || def.kind !== 'book' || item.holder === null) continue;
    if ((day + item.holder) % books.lendEveryDays !== 0) continue;
    const school = ctx.look.formSchool.get(item.form);
    if (!school || lore.loans.some((l) => l.item === item.id)) continue;
    const owner = world.people.get(item.holder);
    if (!isLive(owner)) continue;
    const useful = (p: Person) =>
      p.magic.power >= 1 && canRead(ctx, p) && unknownOf(ctx, p, school).length > 0;
    if (useful(owner)) continue;
    let pick: Person | undefined;
    let best = -Infinity;
    for (const id of active.residents) {
      const q = world.people.get(id);
      if (!isLive(q) || q.id === owner.id || !useful(q)) continue;
      const age = ageOf(world, active, q);
      if (age < rules.minAge) continue;
      // They need the book: no parent or hedge-witch to teach it, and no book of the school yet.
      if (!unknownOf(ctx, q, school).some((a) => sourceOf(ctx, q, a) === null)) continue;
      const opinion = opinionOf(owner, q.id);
      if (opinion < books.minOpinion || opinion <= best) continue;
      best = opinion;
      pick = q;
    }
    if (!pick) continue;
    const event = emit({
      type: rules.events.lent,
      actors: [owner.id, pick.id],
      place: label.cell,
      causes: lastStoryDeed(world, item, [rules.events.lent, rules.events.returned]),
      data: { site: label.name, item: item.name },
    });
    item.deeds.push(event.id);
    lore.loans.push({
      item: item.id,
      owner: owner.id,
      borrower: pick.id,
      since: day,
      eventId: event.id,
    });
    lore.stats.lent += 1;
  }
}

function giveBack(ctx: Ctx, env: SocialEnv, loan: SiteLore['loans'][number], item: Item): void {
  const event = env.emit({
    type: ctx.rules.events.returned,
    actors: [loan.owner, loan.borrower],
    place: env.label.cell,
    causes: [loan.eventId],
    data: { site: env.label.name, item: item.name },
  });
  item.deeds.push(event.id);
}

/** Fire: books of the households whose home burnt may burn with it. */
export function burnBooks(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  homeId: Id,
  fireEventId: Id,
  emit: Emit,
  label: SiteLabel,
): void {
  const members = new Set<Id>();
  for (const h of active.households.values()) {
    if (h.home === homeId) for (const id of h.members) members.add(id);
  }
  if (members.size === 0) return;
  const lore = active.lore;
  const rng = streamFor(world, 'site.lore');
  const ctx = ctxOf(world, content, active);
  for (const item of world.items.values()) {
    if (item.kind !== 'book' || item.holder === null) continue;
    const borrowed = lore.loans.some((l) => l.item === item.id && members.has(l.borrower));
    if (!members.has(item.holder) && !borrowed) continue;
    if (!rng.chance(content.lore.books.burnChance)) continue;
    const holder = item.holder;
    const event = emit({
      type: content.lore.events.burned,
      actors: [holder],
      place: label.cell,
      causes: [fireEventId],
      data: { site: label.name, item: item.name },
    });
    item.deeds.push(event.id);
    loseBook(ctx, item);
    lastSourceGone(
      ctx,
      { world, content, active, emit, label, day: world.day },
      item,
      holder,
      event.id,
    );
  }
}

// ---- Lessons ----

function sourceWords(
  pupil: Person,
  teacher: Person | undefined,
  witch: boolean,
  item: Item | undefined,
): string {
  if (item) return `from ${item.name}`;
  if (!teacher) return '';
  if (witch) return `from ${teacher.name} the hedge-witch`;
  const own = pupil.sex === 'f' ? 'her' : 'his';
  return `from ${own} ${teacher.sex === 'f' ? 'mother' : 'father'} ${teacher.name}`;
}

function runLessons(ctx: Ctx, env: SocialEnv): void {
  const { world, active, rules } = ctx;
  for (const id of active.residents) {
    const p = world.people.get(id);
    if (!isLive(p)) continue;
    if (p.magic.power < 1 || !free(ctx, p, ageOf(world, active, p))) continue;
    const lore = ensureLore(p.detail);
    let learning = lore.learning;
    if (learning && knows(p, learning.abilityId)) learning = lore.learning = undefined;
    if (learning) {
      // The source must still be there: a teacher gone, or a book lost or returned, ends it.
      let ok: boolean;
      let skip = false;
      if (learning.teacher !== null) {
        ok = teacherValid(ctx, learning.teacher, learning.abilityId);
        skip = ok && world.people.get(learning.teacher)!.detail!.abed === true;
      } else {
        const book = world.items.get(learning.book ?? -1);
        ok = !!book && hasBook(ctx, p.id, book) && canRead(ctx, p);
      }
      if (!ok) {
        lore.learning = undefined;
        continue;
      }
      if (skip) continue;
    } else {
      for (const a of ctx.look.cantrips) {
        if (knows(p, a.id) || !meetsRequirements(p, a)) continue;
        const src = sourceOf(ctx, p, a);
        if (!src) continue;
        learning = lore.learning = { abilityId: a.id, ...src, lessons: 0 };
        break;
      }
      if (!learning) continue;
    }
    const ability = ctx.look.abilities.get(learning.abilityId)!;
    const eff = effectiveAttributes(p, ctx.heldOf(p.id));
    const attrs = ability.learnAttributes;
    const mean = attrs.reduce((s, k) => s + eff[k], 0) / Math.max(1, attrs.length);
    learning.lessons += mean / 10;
    if (learning.lessons < rules.lessons) continue;
    complete(ctx, env, p, ability, learning);
  }
}

function complete(
  ctx: Ctx,
  env: SocialEnv,
  p: Person,
  ability: AbilityDef,
  learning: NonNullable<PersonLore['learning']>,
): void {
  const { world, active, rules } = ctx;
  const lore = ensureLore(p.detail!);
  const teacher = learning.teacher === null ? undefined : world.people.get(learning.teacher);
  const item = learning.book === null ? undefined : world.items.get(learning.book);
  const causes: Id[] = [];
  if (teacher?.detail) {
    const own = ensureLore(teacher.detail).learned[ability.id];
    if (own) causes.push(own.eventId);
  }
  if (item) causes.push(...lastDeed(item));
  const event = env.emit({
    type: rules.events.learned,
    actors: teacher ? [p.id, teacher.id] : [p.id],
    place: env.label.cell,
    causes,
    data: {
      site: env.label.name,
      ability: ability.name,
      source: sourceWords(
        p,
        teacher,
        teacher !== undefined && !p.family.parents.includes(teacher.id),
        item,
      ),
    },
  });
  p.knownAbilities.push(ability.id);
  const record: PersonLore['learned'][string] = { day: env.day, eventId: event.id };
  if (teacher) record.teacher = teacher.id;
  if (item) record.book = item.id;
  lore.learned[ability.id] = record;
  lore.learning = undefined;
  active.lore.stats.learned += 1;
  casterCache.delete(active);
  remember(env, p, rules.memoryOf.learned, undefined, event.id);
  if (teacher) remember(env, teacher, rules.memoryOf.taught, p.id, event.id);
}

/** Reading and keeping, counted each evening for the awakenings. */
function countStudy(ctx: Ctx, held: Map<Id, HeldItem[]>): void {
  const { world, active } = ctx;
  for (const id of active.residents) {
    const p = world.people.get(id);
    if (!isLive(p)) continue;
    const lore = ensureLore(p.detail);
    // Keeping: an item with a power effect.
    const power = (held.get(id) ?? []).find((h) => h.def.effects?.some((e) => e.kind === 'power'));
    if (power) {
      lore.heldDays = lore.heldItem === power.item.id ? lore.heldDays + 1 : 1;
      lore.heldItem = power.item.id;
    } else {
      lore.heldDays = 0;
      lore.heldItem = undefined;
    }
    // Reading: a book of a school in hand, by someone who can read it.
    const mine = held.get(id);
    if (
      !mine?.some((h) => h.item.kind === 'book') &&
      !active.lore.loans.some((l) => l.borrower === id)
    )
      continue;
    if (!free(ctx, p, ageOf(world, active, p)) || !canRead(ctx, p)) continue;
    const learning = lore.learning;
    const book =
      (learning?.book != null
        ? booksOf(ctx, id).find((b) => b.item.id === learning.book)
        : undefined) ?? booksOf(ctx, id)[0];
    if (book) {
      lore.readDays += 1;
      lore.readBook = book.item.id;
    }
  }
}
