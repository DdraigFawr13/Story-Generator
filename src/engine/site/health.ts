// Health and death with a cause at the watched site (M3.5). Each day at block 0 `runHealthDay`
// tends the sick, runs the course of every condition, rolls new ones (hunger, cold, illness,
// age), lets illness pass between people in contact, then sums each person's health and buries
// those at zero. Accidents are rolled where the harm happens (`rollAccident` at work, in life.ts
// beside a fire). All numbers are content (content/health.ts); everything here is rules.
//
// Health = 100 minus severity x harm over a person's conditions. Illness passes only between people
// who share a household or (for most ailments) the job they were given. Randomness comes from the
// `site.health` stream, people in id order.

import { clamp } from '../core/math';
import type { EmitInput } from '../core/context';
import { dateOf, DAYS_PER_YEAR } from '../core/clock';
import type { AilmentDef, ConditionDef, DiseaseDef, JobDef } from '../core/content-types';
import { streamFor, type RngStream } from '../core/rng';
import type {
  ActiveSite,
  AttributeKey,
  Condition,
  DeathCause,
  Id,
  Person,
  PersonDetail,
  SimEvent,
  SiteHealth,
  WorldState,
} from '../core/types';
import type { SiteLabel } from './build';
import { ageBands, bandOfAge, type Band, type SiteContent } from './defs';
import { afterDeath, successorOf } from './family';
import { soothePass } from './lore';
import { addMemoryTo } from './memory';
import { takeItem } from './stock';
import { refreshWork, transferItem } from './work';

type Emit = (input: EmitInput) => SimEvent;

/** The herbs the healers use. */
const HERBS = 'herbs';
/** Most a person's health is ever cut to by a disease's peak (severity). */
const MAX_SEVERITY = 100;
/** Event types looked back for when a cause event was not kept (days). */
const LOOKBACK_DAYS = 90;

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

// ---- Lookups ----

interface Lookups {
  conditions: Map<string, ConditionDef>;
  ailments: Map<string, AilmentDef>;
  diseases: Map<string, DiseaseDef>;
  tiers: ConditionDef[];
  needs: ConditionDef[];
  chronic: ConditionDef[];
  races: Map<string, SiteContent['races'][number]>;
}
const lookups = new WeakMap<object, Lookups & { sources: unknown[] }>();
function lookupsOf(content: SiteContent): Lookups {
  const sources = [content.ailments, content.diseases, content.health, content.races];
  let l = lookups.get(content.conditions);
  if (!l || l.sources.some((x, i) => x !== sources[i])) {
    const conditions = new Map(content.conditions.map((c) => [c.id, c]));
    l = {
      conditions,
      ailments: new Map(content.ailments.map((a) => [a.id, a])),
      diseases: new Map(content.diseases.map((d) => [d.id, d])),
      tiers: content.health.woundTiers.map((id) => conditions.get(id)!),
      needs: content.conditions.filter((c) => c.need),
      chronic: content.health.chronic.conditions.map((id) => conditions.get(id)!),
      races: new Map(content.races.map((r) => [r.id, r])),
      sources,
    };
    lookups.set(content.conditions, l);
  }
  return l;
}

/** The running health state of a site, made on first use. */
export function healthOf(active: ActiveSite): SiteHealth {
  return (active.health ??= {
    lastCase: {},
    outbreak: {},
    stats: {
      healerDays: 0,
      herbsUsed: 0,
      abedPeak: 0,
      wounds: {},
      cases: {},
      deaths: {},
      lasting: 0,
    },
  });
}

/** A person's age in whole years at `day`, and the years since the site was entered. */
function yearsIn(world: WorldState, active: ActiveSite): number {
  return Math.floor((world.day - active.enteredDay) / DAYS_PER_YEAR);
}
const ageOf = (world: WorldState, active: ActiveSite, p: Person) =>
  world.params.historyYears + yearsIn(world, active) - p.born;

/** The latest event of a type in the last stretch of days, for cause links; undefined if none. */
function recentEvent(world: WorldState, type: string, since: number): Id | undefined {
  for (let i = world.events.length - 1; i >= 0; i -= 1) {
    const e = world.events[i]!;
    if (e.day < since) return undefined;
    if (e.type === type) return e.id;
  }
  return undefined;
}

const spanWord = (days: number) => (days === 1 ? 'a day of it' : `${days} days of it`);

// ---- Healers ----

/** Residents whose job is healing and who are on their feet. */
export function healersOf(world: WorldState, content: SiteContent, active: ActiveSite): Person[] {
  const role = content.steward.roles.heal;
  const out: Person[] = [];
  for (const id of active.residents) {
    const p = world.people.get(id);
    const d = p?.detail;
    if (p && d && d.jobId === role && !d.abed) out.push(p);
  }
  return out;
}

// ---- Wounds ----

/** Adds a wound of the tier and reports a serious one. Returns the condition. */
export function woundPerson(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  person: Person,
  tierId: string,
  doing: string,
  emit: Emit,
  label: SiteLabel,
  cause?: Id,
): Condition {
  const def = lookupsOf(content).conditions.get(tierId)!;
  const cond: Condition = {
    defId: def.id,
    severity: def.wound!.start,
    sinceDay: world.day,
    peak: def.wound!.start,
  };
  if (cause !== undefined) cond.cause = cause;
  if (!def.wound!.silent) {
    const event = emit({
      type: content.health.events.wounded,
      actors: [person.id],
      place: label.cell,
      causes: cause === undefined ? [] : [cause],
      data: { site: label.name, wound: def.words.onset, doing },
    });
    cond.eventId = event.id;
  }
  person.detail!.conditions.push(cond);
  const stats = healthOf(active).stats.wounds;
  stats[def.id] = (stats[def.id] ?? 0) + 1;
  return cond;
}

/** Picks the severity of a wound by the tiers' shares. */
function pickTier(rng: RngStream, tiers: readonly ConditionDef[]): string {
  return rng.weighted(tiers.map((t) => [t.id, t.wound!.share] as const));
}

/** Rolls a work accident for one worked block. */
export function rollAccident(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  person: Person,
  job: JobDef,
  emit: Emit,
  label: SiteLabel,
): void {
  if (!job.risk) return;
  const detail = person.detail;
  if (!detail) return;
  const rules = content.health;
  const skill = job.skill === undefined ? 0 : (person.skills[job.skill] ?? 0);
  let p = job.risk * (1 - clamp(skill / rules.skillDivisor, 0, 0.9));
  if (detail.conditions.some((c) => c.defId === rules.exhaustedCondition)) p *= rules.exhaustedMul;
  const rng = streamFor(world, 'site.health');
  if (!rng.chance(p)) return;
  const tier = pickTier(rng, lookupsOf(content).tiers);
  woundPerson(world, content, active, person, tier, `while ${job.name.toLowerCase()}`, emit, label);
}

/** Rolls the burns of a fighter beside the fire for one block. */
export function rollFireAccident(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  person: Person,
  emit: Emit,
  label: SiteLabel,
): void {
  if (!person.detail) return;
  const rng = streamFor(world, 'site.health');
  if (!rng.chance(content.health.fireRisk)) return;
  const tier = pickTier(rng, lookupsOf(content).tiers);
  woundPerson(
    world,
    content,
    active,
    person,
    tier,
    'while fighting the fire',
    emit,
    label,
    active.fire?.startedEvent,
  );
}

// ---- Illness ----

/** Starts an ailment or disease in a person; the chronicle hears of the first case in a while. */
function infect(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  rng: RngStream,
  person: Person,
  band: Band,
  kind: { ailment: AilmentDef } | { disease: DiseaseDef },
  cause: Id | undefined,
  emit: Emit,
  label: SiteLabel,
): Condition {
  const rules = content.health;
  const detail = person.detail!;
  const day = world.day;
  let id: string;
  let name: string;
  let defId: string;
  let incubation: number;
  let duration: number;
  let peak: number;
  let graveCap = rules.disease.severityCap;
  if ('ailment' in kind) {
    const a = kind.ailment;
    id = a.id;
    name = a.name;
    defId = a.conditionId;
    incubation = a.incubation;
    duration = rng.between(a.duration[0], a.duration[1]);
    peak = rng.between(a.peak[0], a.peak[1]) * a.ageRisk[band];
    if (a.grave && rng.chance(a.grave.chance)) {
      peak = Math.min(a.grave.cap, peak * a.grave.mul);
      graveCap = a.grave.cap;
    }
  } else {
    const d = kind.disease;
    id = d.id;
    name = lowerFirst(d.name);
    defId = rules.disease.condition;
    incubation = d.incubation;
    duration = d.duration;
    peak =
      rng.between(
        Math.round(d.severity[0] * rules.disease.severityScale),
        Math.round(d.severity[1] * rules.disease.severityScale),
      ) * d.ageRisk[band];
  }
  duration = Math.max(2, duration);
  const cond: Condition = {
    defId,
    ailment: id,
    severity: 0,
    sinceDay: day,
    stage: 'incubating',
    onsetDay: day + incubation,
    untilDay: day + incubation + duration,
    peak: Math.min(graveCap, Math.round(peak)),
  };
  if (cause !== undefined) cond.cause = cause;
  const health = healthOf(active);
  const isDisease = 'disease' in kind;
  const last = health.lastCase[id];
  if (isDisease || last === undefined || day - last >= rules.caseGapDays) {
    const event = emit({
      type: rules.events.fellIll,
      actors: [person.id],
      place: label.cell,
      causes: cause === undefined ? [] : [cause],
      importanceBonus: isDisease ? 1 : 0,
      data: { site: label.name, illness: name },
    });
    cond.eventId = event.id;
  }
  health.lastCase[id] = day;
  health.stats.cases[id] = (health.stats.cases[id] ?? 0) + 1;
  detail.conditions.push(cond);
  return cond;
}

/** The word a death names: a disease's own name, else the condition's. */
function deathWord(content: SiteContent, cond: Condition | undefined, def: ConditionDef): string {
  const l = lookupsOf(content);
  if (cond?.ailment !== undefined) {
    const name = l.ailments.get(cond.ailment)?.name ?? l.diseases.get(cond.ailment)?.name;
    if (name !== undefined) return lowerFirst(name);
  }
  return def.words.death;
}

// ---- Death ----

/**
 * Records a death: events, the household, held items, grief, and the site's residents. `how` names
 * a killing or an execution in the death line (and its causes) in place of the condition's.
 */
export function killPerson(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  person: Person,
  cause: DeathCause,
  cond: Condition | undefined,
  emit: Emit,
  label: SiteLabel,
  how?: { word: string; span: string; causes: Id[] },
): SimEvent {
  const l = lookupsOf(content);
  const def = cond ? l.conditions.get(cond.defId) : undefined;
  const word = how?.word ?? (def ? deathWord(content, cond, def) : 'old age');
  const causes = how
    ? how.causes
    : [cond?.eventId, cond?.cause].filter((x): x is Id => x !== undefined);
  const event = emit({
    type: content.health.events.died,
    actors: [person.id],
    place: label.cell,
    causes: [...new Set(causes)],
    data: {
      site: label.name,
      cause: word,
      // Old age has no onset day worth naming.
      span:
        how?.span ??
        (cond && def?.kind !== 'age' ? spanWord(world.day - cond.sinceDay) : 'a long life'),
    },
  });
  person.died = world.params.historyYears + yearsIn(world, active);
  person.diedDay = world.day;
  person.deathEvent = event.id;
  person.causeOfDeath = cause;
  person.health = 0;
  if (person.detail) person.detail.abed = false;
  active.residents = active.residents.filter((id) => id !== person.id);
  active.dead.push(person.id);
  const stats = healthOf(active).stats.deaths;
  stats[cause] = (stats[cause] ?? 0) + 1;

  // The household: a new head by the culture's inheritance rule (family.ts), or the household and
  // its home's owner go.
  const household = active.households.get(person.family.householdId ?? -1);
  const wasHead = household?.head === person.id;
  let heir: Id | null = null;
  const mourners = new Set<Id>();
  if (household) {
    household.members = household.members.filter((id) => id !== person.id);
    for (const id of household.members) mourners.add(id);
    if (household.members.length === 0) {
      active.households.delete(household.id);
      const home = household.home === null ? undefined : active.buildings.get(household.home);
      if (home && home.owner === person.id) home.owner = null;
    } else {
      heir = successorOf(world, content, active, household, person);
      if (household.head === person.id) household.head = heir;
      const home = household.home === null ? undefined : active.buildings.get(household.home);
      if (home && home.owner === person.id) home.owner = household.head;
    }
  }
  // What they held goes to the household's head, or is lost here.
  for (const item of world.items.values()) {
    if (item.holder !== person.id) continue;
    if (heir !== null) transferItem(content, active, item, household!.head, event.id);
    else {
      item.holder = null;
      item.lostAt = label.cell;
      refreshWork(content, active);
    }
  }

  // Grief: the household and kin still at the site.
  const living = new Set(active.residents);
  for (const id of [
    ...person.family.parents,
    ...person.family.children,
    ...person.family.spouses,
  ]) {
    if (living.has(id)) mourners.add(id);
  }
  const defs = new Map(content.memories.map((m) => [m.id, m]));
  for (const id of [...mourners].sort((a, b) => a - b)) {
    const detail = world.people.get(id)?.detail;
    if (!detail) continue;
    addMemoryTo(
      defs,
      content.life.memoryCap,
      detail,
      content.health.griefMemory,
      world.day,
      person.id,
      event.id,
    );
  }
  // Family (M3.6): graded grief, widowhood, the new head's line, orphans taken in.
  afterDeath(world, content, active, person.id, event.id, wasHead);
  // The funeral (M3.7) is held on the day set by the rites.
  active.society.funerals.push({
    dead: person.id,
    day: world.day + content.society.funeral.afterDays,
    deathEvent: event.id,
  });
  return event;
}

// ---- Childbirth (labour starts in family.ts) ----

/** True when a birth kills the mother. */
export function rollChildbirth(content: SiteContent, tended: boolean, rng: RngStream): boolean {
  const def = lookupsOf(content).conditions.get('childbirth')!;
  return rng.chance(tended ? def.birth!.tended : def.birth!.untended);
}

/** A mother goes into labour: she dies or is weak for some days. Returns whether she died. */
export function beginChildbirth(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  person: Person,
  emit: Emit,
  label: SiteLabel,
): boolean {
  const def = lookupsOf(content).conditions.get('childbirth')!;
  const tended = healersOf(world, content, active).length > 0;
  const cond: Condition = {
    defId: def.id,
    severity: def.birth!.start,
    sinceDay: world.day,
    tended,
    tendPower: tended ? 1 : 0,
  };
  if (rollChildbirth(content, tended, streamFor(world, 'site.health'))) {
    killPerson(world, content, active, person, def.deathCause, cond, emit, label);
    return true;
  }
  person.detail!.conditions.push(cond);
  return false;
}

// ---- The day ----

interface Subject {
  person: Person;
  detail: PersonDetail;
  band: Band;
  age: number;
}

/** Who has each illness, and the sick (symptoms showing) by household and by job, for contagion. */
interface Spread {
  cases: Condition[];
  byHousehold: Map<Id, Condition[]>;
  byJob: Map<string, Condition[]>;
}
function spreadOf(subjects: Subject[]): Map<string, Spread> {
  const out = new Map<string, Spread>();
  for (const s of subjects) {
    for (const c of s.detail.conditions) {
      if (c.ailment === undefined) continue;
      let sp = out.get(c.ailment);
      if (!sp) out.set(c.ailment, (sp = { cases: [], byHousehold: new Map(), byJob: new Map() }));
      sp.cases.push(c);
      if (c.stage !== 'sick') continue;
      const h = s.person.family.householdId;
      if (h !== undefined) {
        const list = sp.byHousehold.get(h);
        if (list) list.push(c);
        else sp.byHousehold.set(h, [c]);
      }
      const job = s.detail.jobId;
      if (job !== undefined) {
        const list = sp.byJob.get(job);
        if (list) list.push(c);
        else sp.byJob.set(job, [c]);
      }
    }
  }
  return out;
}

/**
 * The day's health pass: tending, the course of every condition, new conditions, contagion,
 * then each person's health, who stays in bed and who dies. Call once at block 0.
 */
export function runHealthDay(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  emit: Emit,
  label: SiteLabel,
): void {
  const rules = content.health;
  const l = lookupsOf(content);
  const rng = streamFor(world, 'site.health');
  const state = healthOf(active);
  const day = world.day;
  const month = dateOf(day).month;
  const subjects: Subject[] = [];
  for (const id of [...active.residents].sort((a, b) => a - b)) {
    const person = world.people.get(id);
    const detail = person?.detail;
    if (!person || !detail) continue;
    const race = l.races.get(person.raceId)!;
    const age = ageOf(world, active, person);
    subjects.push({ person, detail, band: bandOfAge(race, age), age });
  }
  const conditionOf = (s: Subject, defId: string) =>
    s.detail.conditions.find((c) => c.defId === defId);

  // 1. Tending: each healer looks after the worst-off, herbs permitting.
  for (const s of subjects) {
    for (const c of s.detail.conditions) {
      c.tended = false;
      c.tendPower = 0;
    }
  }
  const healers = healersOf(world, content, active);
  state.stats.healerDays += healers.length;
  if (healers.length > 0) {
    const healerIds = new Set(healers.map((h) => h.id));
    const patients = subjects
      .filter(
        (s) =>
          !healerIds.has(s.person.id) && s.detail.conditions.some((c) => tendable(l, rules, c)),
      )
      .sort((a, b) => a.person.health - b.person.health || a.person.id - b.person.id)
      .slice(0, healers.length * rules.patientsPerHealer);
    for (const s of patients) {
      const got = takeItem(active, HERBS, rules.herbsPerPatient);
      state.stats.herbsUsed += got;
      const power = got + 1e-9 >= rules.herbsPerPatient ? 1 : rules.noHerbsPower;
      for (const c of s.detail.conditions) {
        if (!tendable(l, rules, c)) continue;
        c.tended = true;
        c.tendPower = power;
        if (c.ailment !== undefined && !c.cutPeak && c.stage === 'sick') {
          // Tended before the peak, a disease peaks lower (once).
          const half = (c.onsetDay! + c.untilDay!) / 2;
          if (day < half && c.peak !== undefined) {
            c.peak = Math.round(c.peak * rules.tendedPeak);
            c.cutPeak = true;
          }
        }
      }
    }
  }

  // Soothers ease what no healer reached (M3.9).
  soothePass(world, content, active, (c) => {
    const kind = l.conditions.get(c.defId)?.kind;
    return (kind === 'wound' || kind === 'disease') && tendable(l, rules, c);
  });

  // 2. The course of what people already have. First, how long each need has sat at zero.
  const needNames = new Set(l.needs.map((c) => c.need!.need));
  for (const s of subjects) {
    const lows = (s.detail.lows ??= {});
    for (const need of needNames) {
      const value = s.detail.needs[need];
      lows[need] = value !== undefined && value < 1 ? (lows[need] ?? 0) + 1 : 0;
    }
  }
  for (const s of subjects) courseOf(world, content, active, rng, s, emit, label);

  // 3. New conditions: needs, chronic illness, age, then ailments and diseases.
  const wellLow = active.weather.wellLow;
  const coldHomes = new Set(active.firewood.coldHomes);
  const homeOf = (s: Subject): Id | null => {
    const h = active.households.get(s.person.family.householdId ?? -1);
    if (!h || h.home === null) return null;
    const own = active.buildings.get(h.home);
    return own?.burnt && h.lodgingHome != null ? h.lodgingHome : h.home;
  };
  for (const s of subjects) {
    const lows = (s.detail.lows ??= {});
    for (const def of l.needs) {
      const n = def.need!;
      if ((lows[n.need] ?? 0) < n.days || conditionOf(s, def.id)) continue;
      const cause =
        n.cause === 'stores'
          ? (active.storesEmptyEvent ?? active.shortMealsEvent ?? undefined)
          : n.cause === 'well'
            ? (active.weather.spellEvent ?? undefined)
            : n.cause === 'cold'
              ? recentEvent(world, content.environment.events.firewoodShort, day - LOOKBACK_DAYS)
              : undefined;
      const cond: Condition = { defId: def.id, severity: 0, sinceDay: day };
      if (cause !== undefined) cond.cause = cause;
      s.detail.conditions.push(cond);
      bumpNeed(def, cond, s.band, s.person.id);
    }
    // Chronic illness comes with years.
    if (
      s.age >= rules.chronic.fromAge &&
      !s.detail.conditions.some((c) => l.conditions.get(c.defId)?.chronic)
    ) {
      const yearly = s.band === 'elder' ? rules.chronic.elder : rules.chronic.adult;
      if (rng.chance(yearly / DAYS_PER_YEAR)) {
        const def = rng.pick(l.chronic);
        const cd = def.chronic!;
        s.detail.conditions.push({
          defId: def.id,
          severity: rng.between(cd.start[0], cd.start[1]),
          sinceDay: day,
          rate: rng.between(cd.growth[0], cd.growth[1]) / DAYS_PER_YEAR,
        });
      }
    }
    // Frailty follows old age.
    if (s.band === 'elder') {
      const race = l.races.get(s.person.raceId)!;
      const past = s.age - ageBands(race).elderFrom;
      const severity = clamp(
        (rules.frailty.severityAtElder * Math.max(0, past)) / elderYears(content, race),
        1,
        MAX_SEVERITY,
      );
      const existing = conditionOf(s, rules.frailty.condition);
      if (existing) existing.severity = severity;
      else s.detail.conditions.push({ defId: rules.frailty.condition, severity, sinceDay: day });
    }
  }

  // Ailments with their own sources.
  for (const a of content.ailments) {
    const fromConditions = Object.entries(a.sources.condition ?? {});
    const dry = a.sources.wellLow !== undefined && wellLow;
    const bg = a.sources.background;
    const background = bg && bg.months.includes(month) ? bg.chance : 0;
    if (
      fromConditions.length === 0 &&
      !dry &&
      background === 0 &&
      !(a.sources.coldHome !== undefined && coldHomes.size > 0)
    )
      continue;
    for (const s of subjects) {
      let p = 0;
      let matched: Condition | undefined;
      for (const [defId, chance] of fromConditions) {
        const c = conditionOf(s, defId);
        if (!c) continue;
        p += chance;
        matched ??= c;
      }
      const home = homeOf(s);
      const cold = a.sources.coldHome !== undefined && home !== null && coldHomes.has(home);
      if (cold) p += a.sources.coldHome!;
      if (dry) p += a.sources.wellLow!;
      p += background;
      if (p <= 0 || caught(s.detail, a.id, day)) continue;
      if (a.season && month >= a.season.months[0] && month <= a.season.months[1]) {
        p *= a.season.mul;
      }
      if (conditionOf(s, rules.exhaustedCondition)) p *= rules.exhaustedMul;
      if (!rng.chance(p)) continue;
      const coldEvent = () =>
        recentEvent(world, content.environment.events.firewoodShort, day - LOOKBACK_DAYS);
      const source = matched
        ? (matched.eventId ?? matched.cause)
        : dry
          ? (active.weather.spellEvent ?? undefined)
          : cold
            ? coldEvent()
            : undefined;
      infect(world, content, active, rng, s.person, s.band, { ailment: a }, source, emit, label);
    }
  }

  // The illnesses of history strike the site too.
  const followed = active.residents.length;
  const whole = followed / Math.max(0.01, active.share);
  for (const d of content.diseases) {
    if (whole < d.minPop) continue;
    if (d.season !== undefined && dateOf(day).season !== d.season) continue;
    const chance =
      (d.outbreak / DAYS_PER_YEAR) * Math.min(content.history.outbreakSizeCap, followed / d.minPop);
    if (!rng.chance(chance)) continue;
    const open = subjects.filter((s) => !caught(s.detail, d.id, day));
    if (open.length === 0) continue;
    const first = rng.pick(open);
    infect(
      world,
      content,
      active,
      rng,
      first.person,
      first.band,
      { disease: d },
      undefined,
      emit,
      label,
    );
  }

  // Contagion: only people who share a household or a job pass an illness on.
  const spreaders: {
    id: string;
    chance: number;
    householdOnly: boolean;
    kind: 'ailment' | 'disease';
  }[] = [
    ...content.ailments.map((a) => ({
      id: a.id,
      chance: a.infectivity,
      householdOnly: a.householdOnly === true,
      kind: 'ailment' as const,
    })),
    ...content.diseases.map((d) => ({
      id: d.id,
      chance: (d.infectivity / Math.max(1, d.duration)) * rules.disease.infectivityScale,
      householdOnly: false,
      kind: 'disease' as const,
    })),
  ];
  const spread = spreadOf(subjects);
  for (const sp of spreaders) {
    const groups = spread.get(sp.id);
    if (!groups || (groups.byHousehold.size === 0 && groups.byJob.size === 0)) continue;
    for (const s of subjects) {
      const household = groups.byHousehold.get(s.person.family.householdId ?? -1) ?? [];
      const job =
        sp.householdOnly || s.detail.jobId === undefined
          ? []
          : (groups.byJob.get(s.detail.jobId) ?? []);
      if (household.length === 0 && job.length === 0) continue;
      if (caught(s.detail, sp.id, day)) continue;
      const contacts = [...household, ...job.filter((c) => !household.includes(c))];
      let miss = 1;
      for (let i = 0; i < contacts.length; i += 1) miss *= 1 - sp.chance;
      let p = 1 - miss;
      if (conditionOf(s, rules.exhaustedCondition)) p *= rules.exhaustedMul;
      if (!rng.chance(p)) continue;
      const from = contacts[0]!;
      const kind =
        sp.kind === 'ailment'
          ? { ailment: l.ailments.get(sp.id)! }
          : { disease: l.diseases.get(sp.id)! };
      infect(
        world,
        content,
        active,
        rng,
        s.person,
        s.band,
        kind,
        from.eventId ?? from.cause,
        emit,
        label,
      );
    }
  }

  // Outbreaks: three or more with the same illness at once.
  const after = spreadOf(subjects);
  for (const sp of spreaders) {
    const cases = after.get(sp.id)?.cases ?? [];
    if (cases.length === 0) state.outbreak[sp.id] = false;
    else if (cases.length >= rules.outbreakAt && !state.outbreak[sp.id]) {
      state.outbreak[sp.id] = true;
      const first = cases.find((c) => c.eventId !== undefined) ?? cases[0]!;
      const name = l.ailments.get(sp.id)?.name ?? lowerFirst(l.diseases.get(sp.id)?.name ?? sp.id);
      emit({
        type: rules.events.outbreak,
        place: label.cell,
        causes: first.eventId === undefined ? [] : [first.eventId],
        data: { site: label.name, illness: name, count: cases.length },
      });
    }
  }

  // 4. Health, bed, and death.
  const dying: { s: Subject; cause: DeathCause; cond: Condition | undefined }[] = [];
  let abed = 0;
  for (const s of subjects) {
    let harm = 0;
    let worst: Condition | undefined;
    let worstHarm = 0;
    let symptomatic = false;
    for (const c of s.detail.conditions) {
      const def = l.conditions.get(c.defId);
      if (!def) continue;
      const h = c.severity * def.harm;
      harm += h;
      if (h > worstHarm) {
        worstHarm = h;
        worst = c;
      }
      if (def.abed && c.stage === 'sick' && c.severity > rules.abedSeverity) symptomatic = true;
    }
    const health = clamp(100 - harm, 0, 100);
    s.person.health = Math.round(health);
    s.detail.abed = health < rules.abedBelow || symptomatic;
    if (s.detail.abed) abed += 1;
    if (health <= 0 && worst) {
      dying.push({ s, cause: l.conditions.get(worst.defId)!.deathCause, cond: worst });
    } else if (s.band === 'elder') {
      // Old age takes elders at the rate history gives, quicker the weaker they are.
      const race = l.races.get(s.person.raceId)!;
      const p = (1 / elderYears(content, race) / DAYS_PER_YEAR) * (1 + (100 - health) / 50);
      if (rng.chance(p)) {
        dying.push({ s, cause: 'old-age', cond: conditionOf(s, rules.frailty.condition) });
      }
    }
  }
  state.stats.abedPeak = Math.max(state.stats.abedPeak, abed);
  for (const d of dying) {
    killPerson(world, content, active, d.s.person, d.cause, d.cond, emit, label);
  }
}

/** Years of old age before death in the history rules (the same formula as the yearly demography). */
function elderYears(content: SiteContent, race: { lifespanYears: number }): number {
  return Math.max(
    content.history.minElderYears,
    race.lifespanYears * content.history.elderLifeShare,
  );
}

/** A condition a healer can help: a wound, illness showing, chronic illness or birth, bad enough to matter. */
const tendable = (l: Lookups, rules: SiteContent['health'], c: Condition): boolean => {
  const def = l.conditions.get(c.defId);
  return (
    def !== undefined &&
    rules.tendable.includes(def.kind) &&
    c.severity >= rules.sufferAt &&
    (c.stage === undefined || c.stage === 'sick')
  );
};

/** Immune, or already has it. */
function caught(detail: PersonDetail, id: string, day: number): boolean {
  return (detail.immune?.[id] ?? -1) > day || detail.conditions.some((c) => c.ailment === id);
}

/** A person's own hardiness against want, 0.7-1.3, stable by id, so a famine does not take everyone on one day. */
function hardiness(id: Id): number {
  return 0.7 + (((Math.imul(id, 0x9e3779b1) >>> 0) % 1000) * 0.6) / 1000;
}

/** Adds a day's worth of a need condition's severity. */
function bumpNeed(def: ConditionDef, cond: Condition, band: Band, id: Id): void {
  const n = def.need!;
  cond.severity = Math.min(
    n.cap ?? MAX_SEVERITY,
    cond.severity + (n.gain * (n.vulnerable?.[band] ?? 1)) / hardiness(id),
  );
}

/** Moves one person's conditions on a day. */
function courseOf(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  rng: RngStream,
  s: Subject,
  emit: Emit,
  label: SiteLabel,
): void {
  const rules = content.health;
  const l = lookupsOf(content);
  const day = world.day;
  const kept: Condition[] = [];
  const added: Condition[] = [];
  const hasFester = s.detail.conditions.some((c) => c.defId === rules.festering.condition);
  let festered = hasFester;
  for (const c of s.detail.conditions) {
    const def = l.conditions.get(c.defId);
    if (!def) {
      kept.push(c);
      continue;
    }
    const boost = c.tended ? 1 + rules.tendedHeal * (c.tendPower ?? 1) : 1;
    let alive = true;
    if (def.need) {
      const driven = (s.detail.lows?.[def.need.need] ?? 0) >= def.need.days;
      if (driven) bumpNeed(def, c, s.band, s.person.id);
      else c.severity -= def.need.ease;
      alive = c.severity > 0;
    } else if (def.wound) {
      c.severity -= def.wound.heal * boost;
      const age = day - c.sinceDay;
      if (!festered && age < rules.festering.days && c.severity > 0) {
        const p = def.wound.fester[c.tended ? 1 : 0] / rules.festering.days;
        if (rng.chance(p)) {
          festered = true;
          const fester: Condition = {
            defId: rules.festering.condition,
            severity: rules.festering.start,
            sinceDay: day,
          };
          const cause = c.eventId ?? c.cause;
          if (cause !== undefined) fester.cause = cause;
          const event = emit({
            type: rules.events.fellIll,
            actors: [s.person.id],
            place: label.cell,
            causes: cause === undefined ? [] : [cause],
            data: { site: label.name, illness: l.conditions.get(fester.defId)!.words.onset },
          });
          fester.eventId = event.id;
          added.push(fester);
        }
      }
      alive = c.severity > 0;
      if (!alive && def.wound.lasting !== undefined && rng.chance(def.wound.lasting)) {
        added.push(lastingHarm(world, content, active, rng, s, c, emit, label));
      }
    } else if (def.id === rules.festering.condition) {
      const age = day - c.sinceDay;
      if (age < rules.festering.growDays && !c.tended) c.severity += rules.festering.grow;
      else c.severity -= rules.festering.ease * boost;
      alive = c.severity > 0;
    } else if (c.ailment !== undefined) {
      const onset = c.onsetDay!;
      if (day < onset) c.stage = 'incubating';
      else {
        c.stage = 'sick';
        const length = c.untilDay! - onset;
        const half = length / 2;
        const t = day - onset + 1;
        const peak = c.peak ?? 0;
        c.severity = Math.max(0, t <= half ? (peak * t) / half : (peak * (length - t)) / half);
      }
      if (day >= c.untilDay!) {
        alive = false;
        const days = l.ailments.get(c.ailment)?.immuneDays;
        const years = l.diseases.get(c.ailment)?.immunityYears;
        const until = days !== undefined ? days : (years ?? 0) * DAYS_PER_YEAR;
        (s.detail.immune ??= {})[c.ailment] = day + until;
      }
    } else if (def.chronic) {
      c.severity = Math.min(
        MAX_SEVERITY,
        c.severity + (c.rate ?? 0) * (c.tended ? rules.tendedChronic : 1),
      );
    } else if (def.birth) {
      c.severity -= def.birth.heal * boost;
      alive = c.severity > 0;
    } else if (def.kind === 'age') {
      // Recomputed with the years.
      alive = s.band === 'elder';
    }
    if (alive) kept.push(c);
  }
  s.detail.conditions = [...kept, ...added];
}

/** A critical wound that healed badly: a permanent loss of strength or agility. */
function lastingHarm(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  rng: RngStream,
  s: Subject,
  wound: Condition,
  emit: Emit,
  label: SiteLabel,
): Condition {
  const old = content.health.oldWound;
  const attribute = rng.pick(old.attributes) as AttributeKey;
  s.person.attributes[attribute] = Math.max(1, s.person.attributes[attribute] - old.amount);
  refreshWork(content, active);
  const cause = wound.eventId ?? wound.cause;
  const event = emit({
    type: content.health.events.lastingHarm,
    actors: [s.person.id],
    place: label.cell,
    causes: cause === undefined ? [] : [cause],
    data: { site: label.name, attribute },
  });
  healthOf(active).stats.lasting += 1;
  return {
    defId: old.condition,
    severity: 0,
    sinceDay: world.day,
    eventId: event.id,
    lasting: { attribute, amount: old.amount },
  };
}
