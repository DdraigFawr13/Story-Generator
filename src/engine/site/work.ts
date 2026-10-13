// Work at the watched site (M3.3): who can do which job, how well, and the steward who hands the
// day's jobs out. Jobs, items and the steward's numbers are content (content/jobs.ts, items.ts);
// this file holds only the rules. Effective numbers are exported for the inspector to show.
//
// Each day at block 0 `runSteward` plans a building if one is needed, sizes each kind of work
// from the stores and the building site, and fills the slots with the best able worker. Each work
// block `runWork` turns the crew standing at their workplaces into items, progress and skill.

import type { EmitInput } from '../core/context';
import type { AbilityDef, ItemDef, JobDef, Workplace } from '../core/content-types';
import { streamFor } from '../core/rng';
import type {
  ActiveSite,
  Attributes,
  AttributeKey,
  Building,
  Id,
  Item,
  Person,
  SimEvent,
  WorldState,
} from '../core/types';
import { meetsRequirements } from '../people/aptitude';
import { TIERS, TIER_IDS, tierOfPower } from '../people/tiers';
import {
  beginBuilding,
  finishBuilding,
  openConstruction,
  repairTarget,
  wearBuildings,
  type SiteLabel,
} from './build';
import { bandOfAge, buildingDef, siteCodes, type Band, type SiteContent } from './defs';
import { findSpot } from './layout';
import { pathCosts } from './path';
import { addItem, foodDaysLeft, itemCount, rawFood, takeItem, takeRawFood } from './stock';

type Emit = (input: EmitInput) => SimEvent;

/** A person the steward may employ: their band and traits are those of this block. */
export interface WorkerRef {
  id: Id;
  person: Person;
  band: Band;
  traits: readonly { id: string }[];
}

/** A worker standing at their workplace this block. */
export interface CrewMember extends WorkerRef {
  job: JobDef;
}

/** A world item with its definition. */
export interface HeldItem {
  item: Item;
  def: ItemDef;
}

/** Workplaces that exist on the map itself; a trade needing one is not learned where it is missing. */
const MAP_BOUND: readonly Workplace[] = ['trees', 'water', 'stone', 'ore', 'wild', 'herbs'];
/** Fallback learning attributes for a job with no skill (hauling). */
const LABOUR_ATTRIBUTES: AttributeKey[] = ['strength', 'endurance'];
const ORTHO: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
/** A stable pseudo-random number from an id and a salt, so a spot needs no storage. */
const mix = (id: number, salt: number) => Math.imul(id * 31 + salt, 0x9e3779b1) >>> 7;

// ---- Lookups ----

const formIndexes = new WeakMap<readonly ItemDef[], Map<string, ItemDef>>();
function defByForm(items: readonly ItemDef[]): Map<string, ItemDef> {
  let index = formIndexes.get(items);
  if (!index) {
    index = new Map();
    for (const def of items) for (const form of def.forms ?? []) index.set(form, def);
    formIndexes.set(items, index);
  }
  return index;
}

const entryLists = new WeakMap<object, [string, number][]>();
/** `Object.entries` of a content record, kept so the hot loops allocate nothing. */
function entries(record: object | undefined): [string, number][] {
  if (!record) return [];
  let list = entryLists.get(record);
  if (!list) {
    list = Object.entries(record).filter((e): e is [string, number] => e[1] !== undefined);
    entryLists.set(record, list);
  }
  return list;
}

const abilityIndexes = new WeakMap<readonly AbilityDef[], Map<string, AbilityDef>>();
function abilityOf(abilities: readonly AbilityDef[], id: string): AbilityDef | undefined {
  let index = abilityIndexes.get(abilities);
  if (!index) {
    index = new Map(abilities.map((a) => [a.id, a]));
    abilityIndexes.set(abilities, index);
  }
  return index.get(id);
}

/** World items held by a person, with their definitions (items with no definition are ignored). */
export function heldItems(
  world: WorldState,
  content: Pick<SiteContent, 'items'>,
  personId: Id,
): HeldItem[] {
  const byForm = defByForm(content.items);
  const held: HeldItem[] = [];
  for (const item of world.items.values()) {
    if (item.holder !== personId) continue;
    const def = byForm.get(item.form);
    if (def) held.push({ item, def });
  }
  return held;
}

// ---- Effective numbers ----

/** Attributes plus what held items add, each capped at 20. */
export function effectiveAttributes(
  person: Pick<Person, 'attributes'>,
  held: readonly HeldItem[],
): Attributes {
  const out = { ...person.attributes };
  for (const { def } of held) {
    for (const effect of def.effects ?? []) {
      if (effect.kind === 'attribute') {
        out[effect.attribute] = Math.min(20, out[effect.attribute] + effect.bonus);
      }
    }
  }
  return out;
}

/**
 * Power plus what held items add, never above the top of the tier one above the person's own
 * (so a person with no power reaches faint at most) and never above 20.
 */
export function effectivePower(person: Pick<Person, 'magic'>, held: readonly HeldItem[]): number {
  const base = person.magic.power;
  let bonus = 0;
  for (const { def } of held) {
    for (const effect of def.effects ?? []) if (effect.kind === 'power') bonus += effect.bonus;
  }
  const above = TIER_IDS[Math.min(TIER_IDS.indexOf(tierOfPower(base)) + 1, TIER_IDS.length - 1)]!;
  const cap = Math.min(20, TIERS[above].maxPower);
  return Math.max(base, Math.min(base + bonus, cap));
}

/** Abilities a held item lets its holder use, when they meet the ability's requirements. */
export function knownWhileHeld(
  person: Pick<Person, 'attributes' | 'magic'>,
  held: readonly HeldItem[],
  content: Pick<SiteContent, 'abilities'>,
): AbilityDef[] {
  const effective = {
    attributes: effectiveAttributes(person, held),
    magic: { power: effectivePower(person, held), affinities: person.magic.affinities },
  };
  const known: AbilityDef[] = [];
  for (const { def } of held) {
    for (const effect of def.effects ?? []) {
      if (effect.kind !== 'ability') continue;
      const ability = abilityOf(content.abilities, effect.abilityId);
      if (ability && !known.includes(ability) && meetsRequirements(effective, ability)) {
        known.push(ability);
      }
    }
  }
  return known;
}

/** The skill ceiling: the mean potential over the ability's learning attributes (1-20). */
export function skillCap(person: Pick<Person, 'potential'>, ability: AbilityDef): number {
  const keys = ability.learnAttributes.length > 0 ? ability.learnAttributes : LABOUR_ATTRIBUTES;
  let sum = 0;
  for (const key of keys) sum += person.potential[key];
  return clamp(sum / keys.length, 1, 20);
}

export interface EffectCtx {
  content: Pick<SiteContent, 'abilities' | 'steward' | 'life'>;
  /** Effective attributes (items included). */
  attributes: Attributes;
  band: Band;
  mood: number;
  /** Tools are in stock. */
  tools: boolean;
}

/** Work done per block as a multiple of the job's listed output (1 = an attribute-10, skill-10 hand). */
export function effectiveness(person: Pick<Person, 'skills'>, job: JobDef, ctx: EffectCtx): number {
  const ability = job.skill === undefined ? undefined : abilityOf(ctx.content.abilities, job.skill);
  const keys = ability?.learnAttributes.length ? ability.learnAttributes : LABOUR_ATTRIBUTES;
  let sum = 0;
  for (const key of keys) sum += ctx.attributes[key];
  return scaled(sum / keys.length / 10, person, job, ctx.tools, ctx.mood, ctx.band, ctx.content);
}

/** `fit` (mean learning attribute / 10) turned into work per block by skill, tools, mood and age. */
function scaled(
  fit: number,
  person: Pick<Person, 'skills'>,
  job: JobDef,
  tools: boolean,
  mood: number,
  band: Band,
  content: Pick<SiteContent, 'steward' | 'life'>,
): number {
  const { steward, life } = content;
  const skill = job.skill === undefined ? 0 : (person.skills[job.skill] ?? 0);
  return (
    fit *
    (0.5 + skill / 20) *
    (job.tools && tools ? steward.toolBonus : 1) *
    (mood < steward.moodSlowBelow ? steward.moodSlow : 1) *
    life.workOutput[band]
  );
}

export interface CanDoOptions {
  /** Items held: effective attributes are used instead of the person's own. */
  held?: readonly HeldItem[];
  /** Effective attributes already worked out. */
  attributes?: Attributes;
  /** Workplaces that exist; when given, the job's must be among them. */
  workplaces?: ReadonlySet<string>;
}

/** The hard gate (R-25): grown enough, strong enough for heavy work, requirements met, a place to do it. */
export function canDo(
  person: Pick<Person, 'attributes'>,
  job: JobDef,
  band: Band,
  options: CanDoOptions = {},
): boolean {
  if (band === 'child' || (band === 'elder' && job.heavy)) return false;
  if (options.workplaces && !options.workplaces.has(job.workplace)) return false;
  const attributes =
    options.attributes ?? effectiveAttributes(person, options.held ?? ([] as HeldItem[]));
  for (const [key, min] of entries(job.requirements)) {
    if (attributes[key as AttributeKey] < min) return false;
  }
  return true;
}

// ---- Per-site derived state (never saved) ----

/** What the work code looks up about a job again and again. */
interface JobInfo {
  index: number;
  keys: AttributeKey[];
  ability: AbilityDef | undefined;
  /** Jobs sharing a skill share a teacher pool: the index of the skill among the jobs' skills. */
  skill: number;
}

interface WorkSite {
  jobsSrc: readonly JobDef[];
  jobs: Map<string, JobDef>;
  /** The `layoutVersion` the lists below were built for; -1 before the first build. */
  version: number;
  trees: number[];
  water: number[];
  stone: number[];
  ore: number[];
  wild: number[];
  workplaces: Set<Workplace>;
  /** The finished workshop and the kitchen (hall, else stockpile) at this version. */
  workshop: number[];
  kitchen: number[];
  /** Items by holder, and each holder's effective attributes; null/empty until needed. */
  held: Map<Id, HeldItem[]> | null;
  eff: Map<Id, Attributes>;
  /** Person → per job (by index): mean learning attribute / 10, negative when a requirement is unmet; then per job the skill cap; NaN until worked out. */
  fit: Map<Id, Float64Array>;
  /** Job → its position in `jobsSrc` (the fit key) and learning attributes. */
  info: Map<JobDef, JobInfo>;
  /** Scratch for one work block, by job and by skill index (see `runWork`). */
  madeEff: Float64Array;
  madeHands: Int32Array;
  leadBest: Float64Array;
  leadSecond: Float64Array;
  leadId: Int32Array;
  /** The last day plan's fingerprint (see `runSteward`). */
  signature: string;
  /** Items held by residents, in item id order; null until needed. */
  resident: (HeldItem & { holder: Id })[] | null;
}

const sites = new WeakMap<ActiveSite, WorkSite>();

/** Reachable walkable tiles beside (or on) each feature tile, nearest the origin first. */
function nearFeature(
  active: ActiveSite,
  reach: Uint8Array,
  feature: (k: number) => boolean,
): number[] {
  const { map, origin } = active;
  const w = map.width;
  const found = new Set<number>();
  for (let k = 0; k < reach.length; k += 1) {
    if (!feature(k)) continue;
    const x = k % w;
    const y = (k - x) / w;
    if (reach[k]) found.add(k);
    for (const [dx, dy] of ORTHO) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= map.height) continue;
      if (reach[ny * w + nx]) found.add(ny * w + nx);
    }
  }
  const dist = (k: number) =>
    Math.abs((k % w) - origin[0]) + Math.abs(Math.floor(k / w) - origin[1]);
  return [...found].sort((a, b) => dist(a) - dist(b) || a - b);
}

function rebuildLists(ws: WorkSite, content: SiteContent, active: ActiveSite): void {
  const { map, origin } = active;
  const { site: rules, life, steward } = content;
  const code = siteCodes(rules);
  const w = map.width;
  const n = w * map.height;
  // Tiles a person can walk to from the green.
  const cost = pathCosts(active, rules, life);
  const reach = new Uint8Array(n);
  const queue = [origin[1] * w + origin[0]];
  reach[queue[0]!] = 1;
  for (let head = 0; head < queue.length; head += 1) {
    const k = queue[head]!;
    const x = k % w;
    const y = (k - x) / w;
    for (const [dx, dy] of ORTHO) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= map.height) continue;
      const next = ny * w + nx;
      if (reach[next] || !cost[next]) continue;
      reach[next] = 1;
      queue.push(next);
    }
  }
  ws.trees = nearFeature(active, reach, (k) => map.tree[k] !== 0);
  ws.water = nearFeature(active, reach, (k) => map.water[k] !== 0);
  ws.stone = nearFeature(active, reach, (k) => map.mineral[k] === code.stone);
  ws.ore = nearFeature(active, reach, (k) => map.mineral[k] === code.ore);
  const wild: number[] = [];
  for (let k = 0; k < n; k += 1) {
    if (!reach[k] || map.building[k] !== 0 || map.water[k] !== 0) continue;
    if (map.terrain[k] !== code.grass && map.terrain[k] !== code.scrub) continue;
    const x = k % w;
    const y = (k - x) / w;
    if (Math.max(Math.abs(x - origin[0]), Math.abs(y - origin[1])) < steward.wildFrom) continue;
    wild.push(k);
  }
  const dist = (k: number) =>
    Math.abs((k % w) - origin[0]) + Math.abs(Math.floor(k / w) - origin[1]);
  ws.wild = wild.sort((a, b) => dist(a) - dist(b) || a - b);
  const has = new Set<Workplace>(['construction']);
  const built = [...active.buildings.values()];
  if (built.some((b) => b.defId === 'field' && b.followed)) has.add('field');
  if (ws.trees.length > 0) has.add('trees');
  if (ws.water.length > 0) has.add('water');
  if (ws.stone.length > 0) has.add('stone');
  if (ws.ore.length > 0) has.add('ore');
  if (ws.wild.length > 0) {
    has.add('wild');
    has.add('herbs');
  }
  built.sort((a, b) => a.id - b.id);
  const workshop = built.find(
    (b) => b.defId === steward.workshopBuilding && b.progress === undefined,
  );
  const kitchen =
    built.find((b) => b.defId === 'hall') ?? built.find((b) => b.defId === 'stockpile');
  // A site with no room left for a workshop (a crowded town) crafts in the stockpile yard.
  const planned = built.some((b) => b.defId === steward.workshopBuilding);
  const yard =
    !workshop &&
    !planned &&
    !findSpot(map, rules, steward.workshopBuilding, origin, steward.buildRing, steward.buildPad)
      ? built.find((b) => b.defId === 'stockpile')
      : undefined;
  ws.workshop = workshop ? interiorCells(workshop) : yard ? interiorCells(yard) : [];
  ws.kitchen = kitchen ? interiorCells(kitchen) : [];
  if (workshop || yard) has.add('workshop');
  if (kitchen) has.add('kitchen');
  ws.workplaces = has;
  ws.version = active.layoutVersion;
}

let lastActive: ActiveSite | undefined;
let lastSite: WorkSite | undefined;

function workSite(content: SiteContent, active: ActiveSite): WorkSite {
  if (
    active === lastActive &&
    lastSite &&
    lastSite.jobsSrc === content.jobs &&
    lastSite.version === active.layoutVersion
  ) {
    return lastSite;
  }
  const ws = workSiteSlow(content, active);
  lastActive = active;
  lastSite = ws;
  return ws;
}

function workSiteSlow(content: SiteContent, active: ActiveSite): WorkSite {
  let ws = sites.get(active);
  if (!ws) {
    ws = {
      jobsSrc: [],
      jobs: new Map(),
      version: -1,
      trees: [],
      water: [],
      stone: [],
      ore: [],
      wild: [],
      workplaces: new Set(),
      workshop: [],
      kitchen: [],
      held: null,
      eff: new Map(),
      fit: new Map(),
      info: new Map(),
      madeEff: new Float64Array(0),
      madeHands: new Int32Array(0),
      leadBest: new Float64Array(0),
      leadSecond: new Float64Array(0),
      leadId: new Int32Array(0),
      signature: '',
      resident: null,
    };
    sites.set(active, ws);
  }
  if (ws.jobsSrc !== content.jobs) {
    ws.jobsSrc = content.jobs;
    ws.jobs = new Map(content.jobs.map((j) => [j.id, j]));
    ws.fit.clear();
    const skills = [
      ...new Set(content.jobs.flatMap((j) => (j.skill === undefined ? [] : [j.skill]))),
    ];
    ws.info = new Map(
      content.jobs.map((j, index) => {
        const ability = j.skill === undefined ? undefined : abilityOf(content.abilities, j.skill);
        const keys = ability?.learnAttributes.length ? ability.learnAttributes : LABOUR_ATTRIBUTES;
        return [
          j,
          { index, keys, ability, skill: j.skill === undefined ? -1 : skills.indexOf(j.skill) },
        ];
      }),
    );
    ws.madeEff = new Float64Array(content.jobs.length);
    ws.madeHands = new Int32Array(content.jobs.length);
    ws.leadBest = new Float64Array(skills.length);
    ws.leadSecond = new Float64Array(skills.length);
    ws.leadId = new Int32Array(skills.length);
  }
  if (ws.version !== active.layoutVersion) rebuildLists(ws, content, active);
  return ws;
}

function heldMap(ws: WorkSite, world: WorldState, content: SiteContent): Map<Id, HeldItem[]> {
  if (!ws.held) {
    const byForm = defByForm(content.items);
    const held = new Map<Id, HeldItem[]>();
    for (const item of world.items.values()) {
      if (item.holder === null) continue;
      const def = byForm.get(item.form);
      if (!def) continue;
      const list = held.get(item.holder);
      if (list) list.push({ item, def });
      else held.set(item.holder, [{ item, def }]);
    }
    ws.held = held;
  }
  return ws.held;
}

function attributesOf(
  ws: WorkSite,
  world: WorldState,
  content: SiteContent,
  person: Person,
): Attributes {
  let attributes = ws.eff.get(person.id);
  if (!attributes) {
    attributes = effectiveAttributes(person, heldMap(ws, world, content).get(person.id) ?? []);
    ws.eff.set(person.id, attributes);
  }
  return attributes;
}

/** How well a person's attributes suit a job (see `WorkSite.fit`), worked out once. */
function fitOf(
  ws: WorkSite,
  world: WorldState,
  content: SiteContent,
  person: Person,
  job: JobDef,
): number {
  return fitAt(ws, world, content, person, ws.info.get(job)!.index, job);
}

/** `fitOf` with the job's index already known. */
function fitAt(
  ws: WorkSite,
  world: WorldState,
  content: SiteContent,
  person: Person,
  index: number,
  job: JobDef,
): number {
  let row = ws.fit.get(person.id);
  if (!row) {
    row = new Float64Array(2 * content.jobs.length).fill(NaN);
    ws.fit.set(person.id, row);
  }
  let fit = row[index]!;
  if (Number.isNaN(fit)) {
    const attributes = attributesOf(ws, world, content, person);
    const keys = ws.info.get(job)!.keys;
    let sum = 0;
    for (const k of keys) sum += attributes[k];
    fit = sum / keys.length / 10;
    for (const [attribute, min] of entries(job.requirements)) {
      // Negative marks a failed requirement; two failures must not flip it back.
      if (attributes[attribute as AttributeKey] < min) fit = -Math.abs(fit);
    }
    row[index] = fit;
  }
  return fit;
}

/** The skill cap for a job's skill, worked out once per person (see `WorkSite.fit`). */
function capAt(ws: WorkSite, person: Person, job: JobDef): number {
  const info = ws.info.get(job)!;
  const row = ws.fit.get(person.id)!;
  const slot = row.length / 2 + info.index;
  let cap = row[slot]!;
  if (Number.isNaN(cap)) {
    cap = skillCap(person, info.ability!);
    row[slot] = cap;
  }
  return cap;
}

/** Workplaces that exist at the site now. */
export function siteWorkplaces(content: SiteContent, active: ActiveSite): ReadonlySet<Workplace> {
  return workSite(content, active).workplaces;
}

/** Interior tiles of a building (all of its tiles when it has no interior). */
function interiorCells(b: Building): number[] {
  if (b.w < 3 || b.h < 3) return b.cells;
  return b.cells.filter((_, i) => {
    const x = i % b.w;
    const y = Math.floor(i / b.w);
    return x > 0 && y > 0 && x < b.w - 1 && y < b.h - 1;
  });
}

/** The tile a person works at for a job, or -1 where the site has no such workplace. */
export function workTile(
  content: SiteContent,
  active: ActiveSite,
  who: { id: Id; field: number },
  job: JobDef,
): number {
  const ws = workSite(content, active);
  if (job.workplace === 'field') return who.field;
  if (!ws.workplaces.has(job.workplace)) return -1;
  const fromList = (list: number[]) =>
    list.length === 0
      ? -1
      : list[mix(who.id, 11) % Math.min(list.length, content.steward.workSpread)]!;
  const inside = (cells: number[]) =>
    cells.length === 0 ? -1 : cells[mix(who.id, 12) % cells.length]!;
  switch (job.workplace) {
    case 'trees':
      return fromList(ws.trees);
    case 'water':
      return fromList(ws.water);
    case 'stone':
      return fromList(ws.stone);
    case 'ore':
      return fromList(ws.ore);
    case 'wild':
    case 'herbs':
      return fromList(ws.wild);
    case 'workshop':
      return inside(ws.workshop);
    case 'kitchen':
      return inside(ws.kitchen);
    case 'construction': {
      const b = openConstruction(active) ?? repairTarget(active, content.steward);
      return b ? inside(interiorCells(b)) : -1;
    }
    default:
      return -1;
  }
}

// ---- Starting skills ----

/**
 * Gives every resident of working age who has no skills farming and one trade, better the more
 * years they have been grown. Notables with skills of their own keep them.
 */
export function seedSkills(world: WorldState, content: SiteContent, active: ActiveSite): void {
  const ws = workSite(content, active);
  const st = content.steward;
  const rng = streamFor(world, 'site.skills');
  const farm = ws.jobs.get(st.roles.farm);
  const races = new Map(content.races.map((r) => [r.id, r]));
  const year = world.params.historyYears;
  for (const id of active.residents) {
    const person = world.people.get(id);
    const race = person && races.get(person.raceId);
    if (!person || !race || Object.keys(person.skills).length > 0) continue;
    const age = year - person.born;
    if (age < race.maturityYears) continue;
    const worked = age - race.maturityYears;
    const band = bandOfAge(race, age);
    const set = (abilityId: string, start: { base: number; perYear: number }) => {
      const ability = abilityOf(content.abilities, abilityId);
      if (!ability) return;
      person.skills[abilityId] = Math.min(
        skillCap(person, ability),
        start.base + start.perYear * worked,
      );
    };
    if (farm?.skill) set(farm.skill, st.startSkill.farming);
    const options: [JobDef, number][] = [];
    for (const job of content.jobs) {
      if (!job.skill || job.skill === farm?.skill || job.action) continue;
      if (MAP_BOUND.includes(job.workplace) && !ws.workplaces.has(job.workplace)) continue;
      if (!canDo(person, job, band)) continue;
      const ability = abilityOf(content.abilities, job.skill);
      if (!ability) continue;
      let sum = 0;
      for (const key of ability.learnAttributes) sum += person.attributes[key];
      const mean = sum / Math.max(1, ability.learnAttributes.length);
      options.push([job, (mean * mean) / 10]);
    }
    if (options.length > 0) set(rng.weighted(options).skill!, st.startSkill.trade);
  }
}

// ---- The steward ----

function intersects(list: readonly string[], other: readonly { id: string }[]): boolean {
  return other.some((x) => list.includes(x.id));
}

/**
 * Plans the day: starts a building if one is needed, sizes each kind of work and gives every
 * able worker at most one job (`detail.jobId`). Call once a day at block 0.
 */
export function runSteward(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  workers: readonly WorkerRef[],
  emit: Emit,
  label: SiteLabel,
): void {
  const ws = workSite(content, active);
  const st = content.steward;
  const rules = content.site;
  wearBuildings(active, st);
  const prev = new Map<Id, string>();
  const crew = workers.filter((w) => {
    const kind = w.person.detail?.breakdown?.kind;
    return w.band !== 'child' && kind !== 'despair' && kind !== 'wandering';
  });
  const job = (role: keyof typeof st.roles) => ws.jobs.get(st.roles[role]);
  const toolItem = content.items.find((i) => i.kind === 'tool')?.id;
  const tools = toolItem === undefined ? 0 : itemCount(active, toolItem);
  const able = (w: WorkerRef, j: JobDef) =>
    w.band !== 'child' &&
    !(w.band === 'elder' && j.heavy) &&
    ws.workplaces.has(j.workplace) &&
    fitOf(ws, world, content, w.person, j) > 0;
  const score = (w: WorkerRef, j: JobDef) =>
    scaled(
      fitOf(ws, world, content, w.person, j),
      w.person,
      j,
      tools > 0,
      w.person.detail?.mood ?? 0,
      w.band,
      content,
    ) +
    (prev.get(w.id) === j.id ? st.stickiness : 0) +
    (j.likedBy && intersects(j.likedBy, w.traits) ? st.likedBonus : 0);

  // 1. What to build, if anything.
  const producible = (item: string) =>
    content.jobs.some((j) => j.outputs?.[item] !== undefined && ws.workplaces.has(j.workplace));
  const affordable = (defId: string) => {
    const def = buildingDef(rules, defId);
    return (
      def.buildable === true &&
      entries(def.cost).every(([item, n]) => itemCount(active, item) >= n || producible(item))
    );
  };
  if (!openConstruction(active)) {
    const households = [...active.households.values()].sort((a, b) => a.id - b.id);
    const homeless = households.find((h) => h.home === null && h.members.length > 0);
    const hasWorkshop = [...active.buildings.values()].some((b) => b.defId === st.workshopBuilding);
    // A home the steward raised already was the answer to a crowded household.
    const crowded = households.find((h) => {
      const home = h.home === null ? undefined : active.buildings.get(h.home);
      return (
        h.members.length > st.crowdedHome && home !== undefined && home.begunEvent === undefined
      );
    });
    if (homeless && affordable(st.homeBuilding)) {
      beginBuilding(content, active, st.homeBuilding, homeless.head, emit, label);
    } else if (!hasWorkshop && affordable(st.workshopBuilding)) {
      beginBuilding(content, active, st.workshopBuilding, null, emit, label);
    } else if (crowded && affordable(st.homeBuilding)) {
      beginBuilding(content, active, st.homeBuilding, crowded.head, emit, label);
    }
  }
  const construction = openConstruction(active);
  const worn = repairTarget(active, st);

  // 2. How many of each job.
  const eaters = workers.length;
  const daysLeft = foodDaysLeft(world, content);
  const foodFirst = daysLeft < st.foodTargetDays / 2;
  const shortage = clamp((st.foodTargetDays - daysLeft) / st.foodTargetDays, 0, 1);
  const foodWorkers = Math.round(
    crew.length * (st.foodShare[0] + (st.foodShare[1] - st.foodShare[0]) * shortage),
  );
  const slots = new Map<string, JobDef[]>();
  const want = (label: string, j: JobDef | undefined, n: number) => {
    if (!j || n <= 0 || !ws.workplaces.has(j.workplace)) return;
    const list = slots.get(label) ?? [];
    for (let i = 0; i < n; i += 1) list.push(j);
    slots.set(label, list);
  };
  const cook = job('cook');
  const farm = job('farm');
  const cooks =
    cook && rawFood(active, content) > 0
      ? Math.min(foodWorkers, Math.ceil(eaters / st.cooksPer))
      : 0;
  const fieldCount = [...active.buildings.values()].filter(
    (b) => b.defId === 'field' && b.followed,
  ).length;
  const farmers = Math.min(
    Math.max(0, foodWorkers - cooks),
    fieldCount * (farm?.perWorkplace ?? 0),
  );
  const gatherers = (['fish', 'forage', 'hunt'] as const)
    .map(job)
    .filter((j): j is JobDef => j !== undefined && ws.workplaces.has(j.workplace));
  const rest = Math.max(0, foodWorkers - cooks - farmers);
  want('food', cook, cooks);
  want('food', farm, farmers);
  gatherers.forEach((j, i) => {
    want('food', j, Math.floor(rest / gatherers.length) + (i < rest % gatherers.length ? 1 : 0));
  });
  // Building site: builders need some of each material; haulers carry what stands in the stores.
  const build = job('build');
  const haul = job('haul');
  const def = construction ? buildingDef(rules, construction.defId) : undefined;
  const cost = def?.cost ?? {};
  const delivered = construction?.delivered ?? {};
  const short = (item: string) =>
    (cost[item] ?? 0) - (delivered[item] ?? 0) > itemCount(active, item);
  const ready = Object.keys(cost).every((i) => (delivered[i] ?? 0) + itemCount(active, i) > 0);
  const carryable = entries(cost).some(
    ([item, n]) => (delivered[item] ?? 0) < n && itemCount(active, item) > 0,
  );
  if (construction) {
    if (ready) want('shelter', build, st.builders);
    if (carryable) want('shelter', haul, Math.floor(st.builders / 2));
  } else if (worn && entries(st.repairCost).every(([item, n]) => itemCount(active, item) >= n)) {
    want('repair', build, st.builders);
  }
  // Materials and tools.
  const mine = job('mine');
  let toolUsers = farmers;
  for (const j of content.jobs) {
    if (j.serves !== 'materials' || j === mine) continue;
    const item = Object.keys(j.outputs ?? {})[0];
    const target = item === undefined ? undefined : st.materialTargets[item];
    if (item === undefined || target === undefined) continue;
    const n = itemCount(active, item) < target || short(item) ? st.crafters : 0;
    want('materials', j, n);
    if (j.tools && ws.workplaces.has(j.workplace)) toolUsers += n;
  }
  const toolsWanted =
    st.toolsPerWorker * (toolUsers + (mine && ws.workplaces.has(mine.workplace) ? st.miners : 0));
  const toolsShort = toolItem !== undefined && tools < toolsWanted;
  const craftTools = job('craftTools');
  const ore = craftTools ? Object.keys(craftTools.inputs ?? {})[0] : undefined;
  if (toolsShort && craftTools && ore !== undefined) {
    const deficit = toolsWanted - tools;
    const haveInputs = entries(craftTools.inputs).every(([i, n]) => itemCount(active, i) >= n);
    if (haveInputs) want('tools', craftTools, st.crafters);
    else if (mine) want('tools', mine, deficit > 20 ? st.miners : 1);
  }
  const healers = Math.floor(eaters / st.healersPer);
  const heal = job('heal');
  if (heal && crew.some((w) => able(w, heal))) want('health', heal, healers);

  // 3. Fill the slots, most urgent first.
  const order = foodFirst
    ? ['food', 'shelter', 'repair', 'tools', 'materials', 'health']
    : ['shelter', 'repair', 'food', 'tools', 'materials', 'health'];
  // Spare hands: wares (up to one craftsman per `waresPer` residents), else materials, else
  // farming and foraging while the stores are below `spareFoodDays`.
  const wares = job('craftWares');
  const spare = content.jobs.filter((j) => {
    const item = Object.keys(j.outputs ?? {})[0];
    const target = item === undefined ? undefined : st.materialTargets[item];
    return j.serves === 'materials' && target !== undefined && itemCount(active, item!) < target;
  });
  const farmRoom = farm ? fieldCount * (farm.perWorkplace ?? 0) : 0;
  const lowStores = daysLeft < st.spareFoodDays;
  // The same plan for the same crew gives the same jobs, so it is only drawn up again when
  // something it depends on changes, and at least every `replanDays` days.
  const signature = [
    Math.floor(world.day / st.replanDays),
    active.layoutVersion,
    crew.map((w) => w.id).join(','),
    order.map((l) => `${l}:${(slots.get(l) ?? []).map((j) => j.id).join('|')}`).join(';'),
    spare.map((j) => j.id).join('|'),
    lowStores ? farmRoom : -1,
  ].join('#');
  if (signature !== ws.signature) {
    ws.signature = signature;
    for (const w of workers) {
      const detail = w.person.detail;
      if (detail?.jobId !== undefined) prev.set(w.id, detail.jobId);
      if (detail) detail.jobId = undefined;
    }
    assignJobs();
  }

  function assignJobs() {
    const assigned = new Set<Id>();
    const give = (w: WorkerRef, j: JobDef) => {
      w.person.detail!.jobId = j.id;
      assigned.add(w.id);
    };
    // Each job ranks the able workers once; its slots take them in turn, skipping the taken.
    const rankings = new Map<JobDef, { list: WorkerRef[]; at: number }>();
    const best = (j: JobDef): WorkerRef | undefined => {
      let ranking = rankings.get(j);
      if (!ranking) {
        const ranked: { w: WorkerRef; s: number }[] = [];
        if (ws.workplaces.has(j.workplace)) {
          const index = ws.info.get(j)!.index;
          for (const w of crew) {
            if (w.band === 'elder' && j.heavy) continue;
            const fit = fitAt(ws, world, content, w.person, index, j);
            if (fit <= 0) continue;
            ranked.push({
              w,
              s:
                scaled(fit, w.person, j, tools > 0, w.person.detail?.mood ?? 0, w.band, content) +
                (prev.get(w.id) === j.id ? st.stickiness : 0) +
                (j.likedBy && intersects(j.likedBy, w.traits) ? st.likedBonus : 0),
            });
          }
        }
        ranked.sort((a, b) => b.s - a.s);
        ranking = { list: ranked.map((r) => r.w), at: 0 };
        rankings.set(j, ranking);
      }
      while (ranking.at < ranking.list.length && assigned.has(ranking.list[ranking.at]!.id)) {
        ranking.at += 1;
      }
      return ranking.list[ranking.at];
    };
    for (const label of order) {
      for (const j of slots.get(label) ?? []) {
        const w = best(j);
        if (w) give(w, j);
      }
    }
    // Everyone left has no job unless there is work for spare hands.
    let farming = crew.filter((w) => farm && w.person.detail?.jobId === farm.id).length;
    const forage = job('forage');
    let crafting = 0;
    const craftCap = Math.ceil(workers.length / st.waresPer);
    for (const w of crew) {
      if (assigned.has(w.id)) continue;
      const options: JobDef[] = [];
      if (wares && crafting < craftCap && able(w, wares)) options.push(wares);
      else {
        for (const j of spare) if (ws.workplaces.has(j.workplace) && able(w, j)) options.push(j);
      }
      if (options.length === 0 && lowStores) {
        if (farm && farming < farmRoom && able(w, farm)) options.push(farm);
        if (forage && able(w, forage)) options.push(forage);
      }
      let pick: JobDef | undefined;
      let pickScore = -Infinity;
      for (const j of options) {
        const s = score(w, j);
        if (s > pickScore) {
          pick = j;
          pickScore = s;
        }
      }
      if (!pick) continue;
      give(w, pick);
      if (pick === farm) farming += 1;
      if (pick === wares) crafting += 1;
    }
  }

  // 4. Say so when food becomes the top concern.
  const focus = foodFirst ? 'food' : 'steady';
  if (focus === 'food' && active.stewardFocus !== 'food') {
    emit({
      type: st.events.foodShort,
      place: label.cell,
      causes: active.storesEmptyEvent === null ? [] : [active.storesEmptyEvent],
      data: { site: label.name, count: foodWorkers },
    });
  }
  active.stewardFocus = focus;
}

// ---- Work ----

/** Raises or repairs a building with a builder's block; returns nothing, mutates the site. */
function buildBlock(
  content: SiteContent,
  active: ActiveSite,
  eff: number,
  emit: Emit,
  label: SiteLabel,
): void {
  const st = content.steward;
  const target = openConstruction(active);
  if (target) {
    const def = buildingDef(content.site, target.defId);
    const work = def.work ?? 1;
    const cost = def.cost ?? {};
    const delivered = (target.delivered ??= {});
    const delta = Math.min(eff, work - (target.progress ?? 0));
    // Hauled materials are used in full; a builder who fetches their own works at half pace.
    let factor = 1;
    for (const [item, per] of entries(cost)) {
      const need = (per * delta) / work;
      if (need <= 0) continue;
      const hauled = Math.min(1, (delivered[item] ?? 0) / need);
      const fetched = Math.min(1 - hauled, itemCount(active, item) / need);
      factor = Math.min(factor, hauled + fetched / 2);
    }
    if (factor <= 0) return;
    for (const [item, per] of entries(cost)) {
      const used = ((per * delta) / work) * factor;
      const fromHaul = Math.min(delivered[item] ?? 0, used);
      delivered[item] = (delivered[item] ?? 0) - fromHaul;
      takeItem(active, item, used - fromHaul);
    }
    target.progress = (target.progress ?? 0) + delta * factor;
    if (target.progress >= work - 1e-9) finishBuilding(content, active, target, emit, label);
    return;
  }
  const worn = repairTarget(active, st);
  if (!worn) return;
  let share = 1;
  for (const [item, n] of entries(st.repairCost)) {
    share = Math.min(share, n * eff > 0 ? itemCount(active, item) / (n * eff) : 1);
  }
  share = Math.min(1, share);
  if (share <= 0) return;
  for (const [item, n] of entries(st.repairCost)) takeItem(active, item, n * eff * share);
  worn.condition = Math.min(100, worn.condition + st.repairPerBlock * eff * share);
}

/** Carries materials from the stores to the open building site. */
function haulBlock(content: SiteContent, active: ActiveSite, eff: number): void {
  const target = openConstruction(active);
  if (!target) return;
  const cost = buildingDef(content.site, target.defId).cost ?? {};
  const delivered = (target.delivered ??= {});
  let room = content.steward.haulPerBlock * eff;
  for (const [item, per] of entries(cost)) {
    const move = takeItem(active, item, Math.min(per - (delivered[item] ?? 0), room));
    delivered[item] = (delivered[item] ?? 0) + move;
    room -= move;
  }
}

/** Uses inputs and makes outputs for one block, scaled to the inputs found. */
function produceBlock(content: SiteContent, active: ActiveSite, job: JobDef, eff: number): void {
  let share = 1;
  for (const [item, n] of entries(job.inputs)) {
    const spare = itemCount(active, item) - (job.reserve?.[item] ?? 0);
    share = Math.min(share, spare / (n * eff));
  }
  if (job.rawFood) share = Math.min(share, rawFood(active, content) / (job.rawFood * eff));
  if (!(share > 0)) return;
  share = Math.min(1, share);
  for (const [item, n] of entries(job.inputs)) takeItem(active, item, n * eff * share);
  if (job.rawFood) takeRawFood(active, content, job.rawFood * eff * share);
  for (const [item, n] of entries(job.outputs)) addItem(active, item, n * eff * share);
}

/**
 * Runs one work block for the crew standing at their workplaces, in id order: builds, hauls or
 * makes items, wears tools and teaches the trade. Returns the ids of those working a job a trait
 * of theirs prefers (they find it more purposeful).
 */
export function runWork(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  crew: readonly CrewMember[],
  emit: Emit,
  label: SiteLabel,
): Set<Id> {
  const liked = new Set<Id>();
  if (crew.length === 0) return liked;
  const ws = workSite(content, active);
  const st = content.steward;
  const toolItem = content.items.find((i) => i.kind === 'tool')?.id;
  const toolsInStock = toolItem !== undefined && itemCount(active, toolItem) > 0;
  // The best two skills on each skill this block: a lead of `teacherGap` makes a teacher.
  ws.leadBest.fill(-Infinity);
  ws.leadSecond.fill(-Infinity);
  for (const c of crew) {
    const k = ws.info.get(c.job)!;
    if (k.skill < 0) continue;
    const level = c.person.skills[c.job.skill!] ?? 0;
    if (level > ws.leadBest[k.skill]!) {
      ws.leadSecond[k.skill] = ws.leadBest[k.skill]!;
      ws.leadBest[k.skill] = level;
      ws.leadId[k.skill] = c.id;
    } else if (level > ws.leadSecond[k.skill]!) ws.leadSecond[k.skill] = level;
  }
  // Output is summed per job and made once: the same totals with far fewer stock updates.
  ws.madeEff.fill(0);
  ws.madeHands.fill(0);
  const lowest = st.skillLevels[0]?.[0] ?? Infinity;
  const highest = st.skillLevels[st.skillLevels.length - 1]?.[0] ?? -Infinity;
  for (const c of crew) {
    const { job, person } = c;
    const info = ws.info.get(job)!;
    const fit = Math.abs(fitAt(ws, world, content, person, info.index, job));
    const eff = scaled(
      fit,
      person,
      job,
      job.tools === true && toolsInStock,
      person.detail?.mood ?? 0,
      c.band,
      content,
    );
    if (!(eff > 0)) continue;
    ws.madeEff[info.index]! += eff;
    ws.madeHands[info.index]! += 1;
    if (job.likedBy && intersects(job.likedBy, c.traits)) liked.add(c.id);
    if (info.skill < 0 || !info.ability) continue;
    // Learning by doing, faster beside someone clearly better, slower near potential.
    const cap = capAt(ws, person, job);
    const skill = person.skills[job.skill!] ?? 0;
    if (skill >= cap) continue;
    const teacher =
      ws.leadId[info.skill] === c.id ? ws.leadSecond[info.skill]! : ws.leadBest[info.skill]!;
    const taught = teacher >= skill + st.teacherGap;
    const next = Math.min(
      cap,
      skill + st.learnRate * fit * (taught ? st.teacherBonus : 1) * (1 - skill / cap),
    );
    person.skills[job.skill!] = next;
    if (next < lowest || skill >= highest) continue;
    let level: string | undefined;
    for (const [at, word] of st.skillLevels) if (skill < at && next >= at) level = word;
    if (level !== undefined) {
      emit({
        type: st.events.skilled,
        actors: [c.id],
        place: label.cell,
        data: { site: label.name, level, worker: job.worker },
      });
    }
  }
  for (const job of content.jobs) {
    const index = ws.info.get(job)!.index;
    const hands = ws.madeHands[index]!;
    if (hands === 0) continue;
    const eff = ws.madeEff[index]!;
    if (job.action === 'build') buildBlock(content, active, eff, emit, label);
    else if (job.action === 'haul') haulBlock(content, active, eff);
    else produceBlock(content, active, job, eff);
    if (job.tools && toolItem !== undefined) takeItem(active, toolItem, st.toolWear * hands);
  }
  return liked;
}

// ---- Items and their downsides ----

/** Every world item held by a resident, with its holder, in item id order. */
export function residentItems(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
): readonly (HeldItem & { holder: Id })[] {
  const ws = workSite(content, active);
  if (!ws.resident) {
    const residents = new Set(active.residents);
    const out: (HeldItem & { holder: Id })[] = [];
    for (const [holder, list] of heldMap(ws, world, content)) {
      if (!residents.has(holder)) continue;
      for (const h of list) out.push({ ...h, holder });
    }
    ws.resident = out.sort((a, b) => a.item.id - b.item.id);
  }
  return ws.resident;
}

/** The lowest-id `theftDraw` item held by a resident other than the thief. */
export function theftTarget(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  thief: Id,
): (HeldItem & { holder: Id }) | undefined {
  return residentItems(world, content, active).find(
    (h) => h.holder !== thief && h.def.downsides?.includes('theftDraw'),
  );
}

/** Hands an item to a new holder and notes the event in its deeds. */
export function transferItem(
  content: SiteContent,
  active: ActiveSite,
  item: Item,
  to: Id,
  eventId: Id,
): void {
  item.holder = to;
  item.deeds.push(eventId);
  const ws = workSite(content, active);
  ws.held = null;
  ws.eff.clear();
  ws.fit.clear();
  ws.resident = null;
}
