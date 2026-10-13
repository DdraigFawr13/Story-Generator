// Shapes for content data ("raws", REBOOT_PLAN §7.5). Data modules live in
// src/content and import these types; the engine never imports content data
// directly. The app passes a ContentBundle in, so the engine stays generic.

import type { Cadence, Season } from './clock';
import type { SimContext } from './context';
import type {
  Attributes,
  DeathCause,
  GoodId,
  Goods,
  NotableRole,
  SiteFeature,
  SiteKind,
} from './types';
import type { BirthTierId } from '../people/tiers';

export interface RaceDef {
  id: string;
  name: string;
  /** Typical adult value per attribute (1–20). */
  attributeMeans: Attributes;
  /** Inclusive clamp for rolled values. */
  attributeRange: [number, number];
  /** Relative birth weights per magic tier (§5.4A). Legendary is never rolled at birth. */
  magicTierWeights: Record<BirthTierId, number>;
  /** Relative weights for a gifted person's primary affinity (school ids). */
  affinityWeights: Record<string, number>;
  lifespanYears: number;
  maturityYears: number;
  /** Relative to humans = 1. */
  fertility: number;
  /** Daily food need relative to humans = 1. */
  foodNeed: number;
  preferredBiomes: string[];
  /** Environmental or resource dependencies; a balancing downside (R-29). */
  dependencies: { id: string; description: string }[];
}

/** Value dimensions a culture weighs 0–10; later systems read them (feuds, raids, trade, temples, mages). */
export const CULTURE_VALUES = [
  'kin',
  'honour',
  'faith',
  'wealth',
  'learning',
  'war',
  'freedom',
  'order',
] as const;
export type CultureValue = (typeof CULTURE_VALUES)[number];
export type MarriageCustom = 'one-spouse' | 'leaders-many-spouses';
export type MarriageGift = 'none' | 'bride-price' | 'dowry';
/** Who inherits property. */
export type InheritanceRule =
  | 'all-children'
  | 'eldest-son'
  | 'eldest-child'
  | 'youngest-keeps-hearth'
  | 'sons-temple-tithe'
  | 'best-apprentice';
/** How a ruler is chosen. */
export type SuccessionRule =
  | 'kin-elected'
  | 'eldest-son-assembly'
  | 'brother-first-gathering'
  | 'eldest-son-temple'
  | 'elder-council'
  | 'eldest-child';
export type GovernmentKind =
  'chieftaincy' | 'jarldom' | 'khanate' | 'priest-kingdom' | 'elder-council' | 'thanedom';
export type MagicAttitude = 'sacred' | 'honoured' | 'respected' | 'wary' | 'licensed';
export type SitePreference =
  'river' | 'coast' | 'aura' | 'plains' | 'deposit' | 'forest' | 'heights';

export interface CultureNames {
  /** Given names are a start plus an end: "Cad" + "oc". */
  givenStarts: string[];
  givenEnds: string[];
  /** Whole given names by sex, drawn beside the made-up ones when the person's sex is known. */
  givenNames?: { f: string[]; m: string[] };
  /** Place names: start, optional middle, end. */
  placeStarts: string[];
  placeMiddles: string[];
  placeEnds: string[];
}

export interface CultureDef {
  id: string;
  name: string;
  raceId: string;
  /** One line shown in the legends browser. */
  summary: string;
  values: Record<CultureValue, number>;
  marriage: { custom: MarriageCustom; gift: MarriageGift; arranged: boolean };
  inheritance: InheritanceRule;
  government: GovernmentKind;
  succession: SuccessionRule;
  magic: MagicAttitude;
  religion: { id: string; name: string };
  preferredBiomes: string[];
  sitePreferences: SitePreference[];
  names: CultureNames;
}

export interface SchoolDef {
  id: string;
  name: string;
  /** Optional casting price (R-29 fork, Phase 5). Default: mild fatigue. */
  castingCost?: { fatigue: number; risk?: string };
}

export type AbilityFamily = 'craft' | 'labour' | 'combat' | 'social' | 'knowledge' | 'magic';
export type LearnSource = 'teacher' | 'book' | 'institution' | 'practice';

/**
 * One unified definition for skills, abilities and spells (R-25).
 * Requirements are hard gates; learnRate scales practice speed.
 */
export interface AbilityDef {
  id: string;
  name: string;
  family: AbilityFamily;
  /** Minimum attribute values, plus `power` and `affinity.<school>` for magic. */
  requirements: Partial<Record<keyof Attributes | 'power' | `affinity.${string}`, number>>;
  /** Attributes whose average speeds learning. */
  learnAttributes: (keyof Attributes)[];
  /** Magic may not use 'practice' (R-28: no self-discovery). */
  learnFrom: LearnSource[];
  school?: string;
  effect: AbilityEffect;
}

export interface AbilityEffect {
  kind: 'utility' | 'damage' | 'heal' | 'weather' | 'ward' | 'craft';
  /** Damage per use, measured in average-soldier weapon hits. */
  damage?: number;
  /** Radius in site tiles; 0 = single target. */
  areaRadius?: number;
  usesPerDay?: number;
  tag?: string;
}

export interface WeatherDef {
  id: string;
  name: string;
  /** Relative chance of this weather in each season. */
  seasonWeights: Record<Season, number>;
  /** Daily warmth-need modifier for Phase 3 (negative = colder). */
  warmth: number;
}

/** Every emitted event type needs an entry: no template, no event (§10). */
export interface EventTypeDef {
  id: string;
  baseImportance: number;
  category: 'nature' | 'social' | 'threat' | 'politics' | 'magic' | 'life' | 'world';
  /** At least one; three or more for common events (§2B). Use {name} placeholders. */
  templates: string[];
  /** `'year'`: history events carry no real day, so `{date}` prints as "Year N". */
  precision?: 'year';
  /** Which `data` keys name an entity, so biographies can index the event under it. */
  links?: Record<string, LinkKind>;
  /** The label in the yearly `year_summary` rollup, for types that are usually trivial. */
  rollup?: [singular: string, plural: string];
  /** Data keys that only some variants print (the first variant sets the key whitelist). */
  dataKeys?: string[];
  /** Short heading for lists and event pages; `{key}` placeholders are data keys (M2.7). */
  title?: string;
  /** The word a cause of this event carries in "why?" chains, e.g. "because of". Default "after". */
  causeWord?: string;
}

/** A named set of event types, for filters and colour keys in the Legends browser. */
export interface EventTypeGroup {
  id: string;
  label: string;
  types: string[];
}

/** The kind of entity a `links` data key names (by name; ids collide across kinds). */
export type LinkKind = 'civ' | 'site' | 'beast' | 'item' | 'dynasty';

/**
 * Data-driven event rule (§7.5). Today `subject` is only 'world'; Phase 2/3
 * add 'site' and 'person' iteration so `when`/`apply` receive the subject.
 */
export interface EventRuleDef {
  id: string;
  subject: 'world';
  cadence: Cadence;
  when(ctx: SimContext): boolean;
  /** Probability (0–1) per due check when `when` holds. Tune here, never script outcomes. */
  weight(ctx: SimContext): number;
  apply(ctx: SimContext): void;
}

export interface ContentBundle {
  biomes: BiomeDef[];
  biomeRules: BiomeRules;
  resources: ResourceDef[];
  names: NameTables;
  races: RaceDef[];
  cultures: CultureDef[];
  schools: SchoolDef[];
  abilities: AbilityDef[];
  weather: WeatherDef[];
  eventTypes: EventTypeDef[];
  /** Event type groups for Legends filters; optional so test bundles may omit them. */
  typeGroups?: EventTypeGroup[];
  rules: EventRuleDef[];
  settlement: SettlementRules;
  history: HistoryRules;
  creatures: CreatureDef[];
  diseases: DiseaseDef[];
  notables: NotableRules;
  biographies: BiographyRules;
  site: SiteRules;
  /** Daily life (M3.2): needs, traits, memories and the day's rhythm. */
  needs: NeedDef[];
  traits: TraitDef[];
  memories: MemoryDef[];
  life: LifeRules;
  /** Work, items and the steward (M3.3): what people make, from what, and who is sent where. */
  items: ItemDef[];
  jobs: JobDef[];
  steward: StewardRules;
  /** Weather, crops, stores, firewood, fire and wild land at the watched site (M3.4). */
  environment: EnvironmentRules;
  /** Health and death with a cause (M3.5): conditions, ailments and the rules that run them. */
  health: HealthRules;
  conditions: ConditionDef[];
  ailments: AilmentDef[];
  /** Family and relationships (M3.6): the day's interactions, opinions and grudges; courtship, births, inheritance. */
  interactions: InteractionDef[];
  social: SocialRules;
  family: FamilyRules;
  /** Society (M3.7): standing, crime and each culture's law, holy days and funerals. */
  society: SocietyRules;
  /** Threats (M3.8): wild prowlers, beasts and raiders coming to the watched site, and the answer. */
  threats: ThreatRules;
  /** Light magic and lore (M3.9): cantrips, lessons, books lent and lost, race dependencies. */
  lore: LoreRules;
  /** Awakenings (M3.9): what can raise a person one magic tier, once in a life. */
  awakenings: AwakeningDef[];
  /** Thin politics and trade (M3.10): the site's leader and succession, and caravans from trade partners. */
  politics: PoliticsRules;
  /** Chronicle, recaps and inspector (M3.11): rollups of small site lines and the historian's recaps. */
  chronicle: ChronicleRules;
}

/** What a condition is, for its harm and the words of its chronicle lines (M3.5). */
export interface ConditionDef {
  id: string;
  name: string;
  kind: 'need' | 'wound' | 'disease' | 'chronic' | 'age' | 'birth';
  /** Health lost per point of severity. */
  harm: number;
  /** What a person who dies of it died of. */
  deathCause: DeathCause;
  /** The sufferer stays home while severity is above this (disease: `HealthRules.abedSeverity`). */
  abed?: boolean;
  /** `onset`: said when it begins ("the chill"); `death`: "died of {death}". */
  words: { onset: string; death: string };
  /** Hunger, thirst, cold and weariness: grows while a need has sat at zero, eases once it is met. */
  need?: {
    need: string;
    /** Days in a row the need must sit at zero before it begins. */
    days: number;
    gain: number;
    ease: number;
    /** Severity it cannot grow past. */
    cap?: number;
    /** Gain multipliers by age band. */
    vulnerable?: Partial<Record<'child' | 'adult' | 'elder', number>>;
    /** Which open event to name as the cause. */
    cause?: 'stores' | 'well' | 'cold';
  };
  /** A wound's course. */
  wound?: {
    start: number;
    /** Severity healed per day. */
    heal: number;
    /** Share of accidents of this tier, in percent. */
    share: number;
    /** Chance of festering over the first week: untended, tended. */
    fester: [untended: number, tended: number];
    /** Chance of lasting harm on recovery. */
    lasting?: number;
    /** Silent in the chronicle (minor wounds). */
    silent?: boolean;
  };
  /** A chronic illness: starting severity range and yearly growth range. */
  chronic?: { start: [number, number]; growth: [number, number] };
  /** Childbirth: chance of death untended and tended. */
  birth?: { untended: number; tended: number; start: number; heal: number };
}

/** A contagious illness peculiar to the site's daily life (M3.5). */
export interface AilmentDef {
  id: string;
  name: string;
  conditionId: string;
  /** Days before symptoms, days sick (range) and the peak severity (range) before age risk. */
  incubation: number;
  duration: [number, number];
  peak: [number, number];
  /** Chance per sick contact per day. */
  infectivity: number;
  /** Only the household passes it on. */
  householdOnly?: boolean;
  ageRisk: { child: number; adult: number; elder: number };
  /** Days of immunity after recovering. */
  immuneDays: number;
  /** A share of cases turns grave: the peak is multiplied and may pass the usual cap, so it can kill alone. */
  grave?: { chance: number; mul: number; cap: number };
  /** Daily chance per person from each source. */
  sources: {
    /** Having this condition (def id). */
    condition?: Record<string, number>;
    /** Sleeping in a home with no firewood. */
    coldHome?: number;
    /** While the well is low. */
    wellLow?: number;
    /** Anyone, any day of these months (0-11): the ordinary run of illness. */
    background?: { chance: number; months: number[] };
  };
  /** Months (inclusive range) in which sources are multiplied. */
  season?: { months: [number, number]; mul: number };
}

/** Health rules (M3.5). Tunables live in content/health.ts. */
export interface HealthRules {
  /** Below this health a person stays home. */
  abedBelow: number;
  /** A sick person stays home while their illness is above this severity. */
  abedSeverity: number;
  /** A condition with harm and at least this severity counts as a sufferer for the steward. */
  sufferAt: number;
  patientsPerHealer: number;
  /** Herbs used per patient tended, and how good tending is without them. */
  herbsPerPatient: number;
  noHerbsPower: number;
  /** Condition kinds a healer can tend. */
  tendable: ConditionDef['kind'][];
  /** Wound healing is multiplied by this when tended (times the tending power). */
  tendedHeal: number;
  /** A disease tended before its peak peaks at this share. */
  tendedPeak: number;
  /** Chronic growth multiplier when tended. */
  tendedChronic: number;
  /** Weariness multiplies accident and catch chances. */
  exhaustedMul: number;
  exhaustedCondition: string;
  /** Skill (0-100) lowers a worker's accident chance by skill / this. */
  skillDivisor: number;
  /** Chance per fire-fighting block that a fighter is hurt. */
  fireRisk: number;
  /** Festering: days it can start in, severity it begins with, growth a day, days it grows, relief a day after. */
  festering: {
    condition: string;
    days: number;
    start: number;
    grow: number;
    growDays: number;
    ease: number;
  };
  /** The condition and daily growth of age. */
  frailty: { condition: string; severityAtElder: number };
  /** The scale of Phase 2 diseases (history `DiseaseDef`) at the site. */
  disease: {
    condition: string;
    /** Multiplies `infectivity / duration` into a per-contact-day chance. */
    infectivityScale: number;
    /** `severity` (share of people who die) times this is the peak severity, capped. */
    severityScale: number;
    severityCap: number;
  };
  /** Chronic illnesses: ages and yearly chances. */
  chronic: { fromAge: number; adult: number; elder: number; conditions: string[] };
  /** The permanent mark a critical wound can leave. */
  oldWound: { condition: string; attributes: string[]; amount: number };
  /** Days between ailment cases that each make the chronicle. */
  caseGapDays: number;
  /** People sick with the same illness that make an outbreak. */
  outbreakAt: number;
  /** Accidents: severity tiers in order, as condition ids. */
  woundTiers: string[];
  /** Memory a household and kin keep of a death. */
  griefMemory: string;
  events: {
    wounded: string;
    fellIll: string;
    outbreak: string;
    lastingHarm: string;
    died: string;
  };
}

/** The four blocks of a site day (M3.2), in the order they run. */
export const DAY_BLOCKS = ['night', 'morning', 'afternoon', 'evening'] as const;
export type DayBlock = (typeof DAY_BLOCKS)[number];

/** What a resident does in one block. Breakdowns override the schedule. */
export const ACTIVITIES = [
  'sleep',
  'work',
  'play',
  'eat',
  'socialise',
  'worship',
  'tantrum',
  'despair',
  'wander',
  'steal',
  'fight',
  // M3.8: set by a threat at the site (engine/site/threats.ts), never by the schedule.
  'defend',
  'shelter',
  'flee',
  // Village life: fetching water, going to market or helping a parent; restores purpose, no output.
  'errand',
] as const;
export type Activity = (typeof ACTIVITIES)[number];

export const BREAKDOWN_KINDS = ['tantrum', 'despair', 'wandering', 'theft'] as const;
export type BreakdownKind = (typeof BREAKDOWN_KINDS)[number];

/** One need (REBOOT_PLAN §6A), 0-100 with 100 satisfied. */
export interface NeedDef {
  id: string;
  name: string;
  /** Points lost per day, applied a quarter per block. Warmth instead uses `LifeRules.warmth`. */
  decayPerDay: number;
  /** Points restored per block spent in an activity. */
  restore: Partial<Record<Activity, number>>;
  /** Share of `restore` kept when the block is not spent in the person's own home (0 = home only). */
  awayShare: number;
  /** Restored only when someone else shares the place. */
  needsCompany?: boolean;
  /** Below this the need costs mood. */
  lowAt: number;
  /** Mood at 0; the cost grows linearly from 0 at `lowAt`. */
  moodAtZero: number;
  /** "why" word when low, e.g. "Hungry". */
  lowWord: string;
  /** What has been missing, for "why" lines: "Idle: no work for 3 days". */
  missing: string;
  /** Only people whose culture values faith at least this much have the need. */
  minCultureFaith?: number;
}

/** A personality trait (M3.2). People get one or two at promotion. */
export interface TraitDef {
  id: string;
  name: string;
  description: string;
  /** Roll weight at promotion. */
  weight: number;
  /** Trait ids that cannot be held with this one. */
  excludes: string[];
  /** Mood always added. */
  mood: number;
  /** Multiplies the stress at which a breakdown comes (below 1 breaks sooner). */
  breakdownAt: number;
  /** The kind of breakdown this trait causes; the first such trait a person has decides. */
  breakdown?: BreakdownKind;
  /** Multipliers on need decay, by need id. */
  needRates?: Record<string, number>;
}

/** A remembered happening (§6A); its mood fades linearly to 0 over `decayDays`. */
export interface MemoryDef {
  id: string;
  mood: number;
  decayDays: number;
  /** Inspector line; `{about}` is the person it concerns. */
  text: string;
  /** Most copies held at once (default 1: a repeat refreshes); a night's cold stacks up to 3. */
  stacks?: number;
}

/** The day's rhythm and the stress rules (M3.2). Every number is a tunable in content/life.ts. */
/** Where a free block may be spent (village life); `market` is set by the market day, not drawn. */
export const ROUTINE_PLACES = [
  'doorstep',
  'home',
  'visit',
  'alehouse',
  'green',
  'shrine',
  'nearHome',
  'well',
  'along',
] as const;
export type RoutinePlace = (typeof ROUTINE_PLACES)[number];
export type RoutineWeights = Partial<Record<RoutinePlace, number>>;

/** How free blocks are spent, who walks to market and when people set off (village life). */
export interface RoutineRules {
  /** Weighted places per table; a person's trait multipliers and favourite place scale them. */
  tables: Record<string, RoutineWeights>;
  /** Children under this age (years) use `childSmall`, older ones `childOlder`. */
  smallChildUnder: number;
  /** The table whose weights (with traits) decide a person's favourite place, by age band. */
  favouriteTable: Record<'child' | 'adult' | 'elder', string>;
  /** The favourite place's weight is multiplied by this. */
  favouriteMul: number;
  /** Weight multipliers by trait id. */
  traitMul: Record<string, RoutineWeights>;
  /** Children play within this many tiles of their own doorstep. */
  nearHomeRange: number;
  /** ...at one of this many tiles of their own, so that their routes repeat and are cached. */
  nearHomeSpots: number;
  /** Route search weight for strolls (looser and faster than `pathWeight`). */
  strollWeight: number;
  /** Jobs a child may go along to with a same-sex parent. */
  alongJobs: string[];
  /** Evenings at the alehouse: one in `peopleIn` people with the trait (or the favourite) go on one evening in `nightsIn`. */
  eveningAlehouse: { trait: string; peopleIn: number; nightsIn: number };
  market: {
    /** Market day is every this many days, at this offset from the day count (the rest day is the last of seven). */
    every: number;
    offset: number;
    /** These jobs set up a stall on the square instead of working at their workplace. */
    stallJobs: string[];
    /** One adult per household goes to market, preferring someone whose job is not one of these. */
    foodJobs: string[];
    /** Stalls stand on the square's ring this many tiles (Chebyshev) from the origin; shoppers one ring in. */
    stallRing: number;
    shopRing: number;
  };
  /** When people set off, as a share of the block: a base by job, then age and a random jitter. */
  leave: {
    jobBase: Record<string, number>;
    defaultBase: number;
    child: number;
    elder: number;
    jitter: number;
    max: number;
  };
  /** Not everyone starts work at once (village life). */
  shifts: {
    /** These trades start one day in `lateEvery` after a free morning (drawn from the `late` table). */
    lateJobs: string[];
    lateEvery: number;
    /** These trades go to work before dawn (the night block) one day in `earlyEvery`. */
    earlyJobs: string[];
    earlyEvery: number;
    /** In a household with a child under `childUnder`, the child's carer keeps house one morning in `houseEvery`. */
    childUnder: number;
    houseEvery: number;
  };
  /** Inspector phrases for `PersonDetail.where`; `{name}` is the person visited or helped. */
  where: Record<RoutinePlace | 'market' | 'house', string>;
}

export interface LifeRules {
  /** Village life: how free blocks are spent and when people set off. */
  routines: RoutineRules;
  /** Activity per age band and block. */
  schedule: Record<'child' | 'adult' | 'elder', Record<DayBlock, Activity>>;
  /** Children younger than this (years) go where a household adult goes, mother first. */
  carriedUnder: number;
  /** Every this many days is a rest day... */
  restDayEvery: number;
  /** ...whose afternoon is worship (for people with a faith need) or socialising. */
  restDayAfternoon: { faithful: Activity; others: Activity };
  /** Food eaten per meal, as a share of the race's yearly food need. */
  mealShare: number;
  /** Work output by age band: children 0, elders part of a day. */
  workOutput: Record<'child' | 'adult' | 'elder', number>;
  warmth: {
    /** Month (0-11) of the coldest day; the warmest is six months on. */
    coldestMonth: number;
    /** No warmth is lost at or above this temperature (°C). */
    comfortC: number;
    /** Warmth lost per day per degree below comfort... */
    perDegree: number;
    /** ...at most this much. */
    maxPerDay: number;
  };
  /** Stress builds while mood is below this... */
  stressBelow: number;
  /** ...by this much per day per point below. */
  stressRise: number;
  /** Stress falls by this much per day per point of mood above 0, and by `stressFloorFall` at least while mood is above 0. */
  stressFall: number;
  stressFloorFall: number;
  /** A breakdown comes at this stress, times the traits' `breakdownAt`. */
  breakdownAt: number;
  /** Stress left after a breakdown. */
  stressAfter: number;
  /** Kind for people with no breakdown trait, and for children. */
  defaultBreakdown: BreakdownKind;
  childBreakdown: BreakdownKind;
  /** Days a despair or wandering breakdown lasts (inclusive range). */
  despairDays: [number, number];
  wanderDays: [number, number];
  /** Meals a thief takes from the stores. */
  theftMeals: number;
  /** People within this many tiles (Chebyshev) see a breakdown. */
  witnessRange: number;
  /** Most memories a person keeps; the weakest go first. */
  memoryCap: number;
  /** Memory ids the engine gives, by happening. */
  memoryOf: {
    hungry: string;
    sleptRough: string;
    ateTogether: string;
    worshipped: string;
    vented: string;
    sawTantrum: string;
    sawDespair: string;
    kinWandered: string;
    sawTheft: string;
    /** M3.3: a cooked meal eaten, a cursed heirloom held, a neighbour's treasure envied. */
    ateWell: string;
    cursed: string;
    envied: string;
    /** M3.4: short meals (¾ and ⅔), a cold night in a home with no logs, a home seen burning, a harvest brought in. */
    shortMeals: string;
    shortMealsHard: string;
    coldNight: string;
    sawFire: string;
    harvested: string;
  };
  /** Walking cost a person spends in one block; a longer route ends part way. */
  walkPerBlock: number;
  /** A* node expansions allowed per block across everyone; past it, routes are straight lines. */
  pathBudget: number;
  /** Routes kept in the path cache. */
  pathCache: number;
  /** A* weights its distance estimate by this: above 1 trades a slightly longer route for far fewer tiles searched. */
  pathWeight: number;
  /** Walking cost per tile by terrain id; trees and minerals add theirs. Water and walls block. */
  walkCost: Record<string, number>;
  treeCost: number;
  /** Event type ids the engine emits. */
  events: {
    tantrum: string;
    despair: string;
    wandering: string;
    theft: string;
    returned: string;
    storesEmpty: string;
    /** Village life: a market morning on the square. */
    market: string;
  };
}

/** A building's footprint (tiles) and, where people raise it, what it takes (M3.3). */
export interface BuildingDef extends SiteGlyphDef {
  w: number;
  h: number;
  /** Builder-blocks at effectiveness 1 to raise it, or to restore it from nothing. */
  work?: number;
  /** Items consumed while it is raised, by item id. */
  cost?: Record<string, number>;
  /** The steward may order it. */
  buildable?: boolean;
  /** Village life: drawn with walls and a door, like a home. */
  walled?: boolean;
  /** Village life: the workplaces (job `workplace` ids) it houses, preferred over the fallbacks. */
  houses?: Workplace[];
  /** Village life: laid out at embark when the site's whole population reaches this. */
  minPop?: number;
}

export type ItemEffect =
  | { kind: 'attribute'; attribute: keyof Attributes; bonus: number }
  /** Known while held, only if its requirements are met on effective attributes and power. */
  | { kind: 'ability'; abilityId: string }
  /** Weapon hits; used from M3.8, shown now. */
  | { kind: 'combat'; value: number }
  /** Capped: see `effectivePower`. */
  | { kind: 'power'; bonus: number };
export type ItemDownside = 'envy' | 'theftDraw' | 'curse';

/** Something a site holds in stock or a notable carries (M3.3). */
export interface ItemDef {
  id: string;
  /** The display word: "grain", "tools". */
  name: string;
  /** Demotion sums count × per into this world good. */
  good: GoodId;
  /** World-good units per item. */
  per: number;
  kind: 'food' | 'material' | 'tool' | 'goods' | 'artifact' | 'book';
  /** Food eaten as a cooked meal (the ate-well memory). */
  cooked?: boolean;
  /** Share of the stock that spoils each month (spread over 28 days); food only. */
  spoilPerMonth?: number;
  /** Share that spoils each day, for food that keeps only days (cooked meals). */
  spoilPerDay?: number;
  /** Artifacts and books: the world `Item.form` values this entry covers. */
  forms?: string[];
  effects?: ItemEffect[];
  downsides?: ItemDownside[];
}

export type Workplace =
  | 'field'
  | 'trees'
  | 'water'
  | 'stone'
  | 'ore'
  | 'wild'
  | 'workshop'
  | 'forge'
  | 'kitchen'
  | 'construction'
  | 'herbs';

/** A kind of work the steward hands out (M3.3). */
export interface JobDef {
  id: string;
  name: string;
  /** The person's trade word: "farmer". */
  worker: string;
  /** Ability id; hauling has none. */
  skill?: string;
  /** Hard gate (R-25) on effective attributes. */
  requirements: Partial<Attributes>;
  workplace: Workplace;
  /** Items used per block at effectiveness 1. */
  inputs?: Record<string, number>;
  /** Items of `inputs` that stay in stock: the job stops rather than use them. */
  reserve?: Record<string, number>;
  /** Raw food items (grain first, then fish, game, berries) used per block at effectiveness 1. */
  rawFood?: number;
  /** Items made per block at effectiveness 1. */
  outputs?: Record<string, number>;
  /** Work at a building site: raise or repair a building, or carry materials to it; or sow, tend and cut a field. */
  action?: 'build' | 'haul' | 'farm';
  /** The wild pool the job draws on (output scales with it); `wood` fells trees tile by tile. */
  pool?: 'game' | 'berries' | 'fish' | 'wood';
  serves: 'food' | 'materials' | 'tools' | 'goods' | 'health' | 'shelter';
  /** Elders are never given it. */
  heavy?: boolean;
  /** Output is multiplied by `toolBonus` while tools are in stock, and wears them. */
  tools?: boolean;
  /** Most workers per field (farming). */
  perWorkplace?: number;
  /** Trait ids whose bearers prefer it. */
  likedBy?: string[];
  /** M3.5: chance per block worked that the worker is hurt (before skill and tiredness). */
  risk?: number;
}

/** How the steward sizes and fills the day's jobs, and how work teaches (M3.3). */
export interface StewardRules {
  /** Days of food the steward tries to keep in store. */
  foodTargetDays: number;
  /** Share of workers on food jobs at full stores and at empty stores. */
  foodShare: [full: number, empty: number];
  /** Eaters per cook. */
  cooksPer: number;
  /** Residents per healer. */
  healersPer: number;
  /** Tools wanted per tool-using worker. */
  toolsPerWorker: number;
  /** Output multiplier while tools are in stock. */
  toolBonus: number;
  /** Tools used up per tool-using block. */
  toolWear: number;
  /** Items the steward keeps in stock by felling and quarrying. */
  materialTargets: Record<string, number>;
  /** A building below this condition (0-100) is repaired. */
  repairBelow: number;
  /** A building loses 1 condition every this many days. */
  conditionLossDays: number;
  /** Condition restored per builder-block at effectiveness 1... */
  repairPerBlock: number;
  /** ...for these items. */
  repairCost: Record<string, number>;
  /** Added to a worker's score for keeping the job they had. */
  stickiness: number;
  /** Added for a job a trait of theirs prefers. */
  likedBonus: number;
  /** Extra purpose a worker with a liked job gains per work block. */
  likedPurpose: number;
  /** Skill gained per work block at attributes 10, before the slowdown near potential. */
  learnRate: number;
  /** Learning speed multiplier beside a teacher. */
  teacherBonus: number;
  /** A teacher's skill must lead the learner's by this much. */
  teacherGap: number;
  /** Below this mood people work slower, by `moodSlow`. */
  moodSlowBelow: number;
  moodSlow: number;
  /** Skill at which a level word is earned. */
  skillLevels: [skill: number, word: string][];
  /** Skill at embark: base plus per-year worked since maturity, farming and one trade. */
  startSkill: Record<'farming' | 'trade', { base: number; perYear: number }>;
  /** Material items a hauler carries to a building site per block. */
  haulPerBlock: number;
  /** A household with more members than this wants a new home. */
  crowdedHome: number;
  /** A worker is sent to one of this many workplace tiles nearest the origin. */
  workSpread: number;
  /** Wild and herb tiles are at least this far (tiles) from the origin. */
  wildFrom: number;
  /** Jobs are drawn up again at least this often even if nothing changed (days). */
  replanDays: number;
  /** Builders on an open construction or a repair. */
  builders: number;
  /** Crafters on tools, and fellers and quarriers each, while stocks are low. */
  crafters: number;
  /** Residents per craftsman making wares with spare hands. */
  waresPer: number;
  /** Spare hands gather food only below this many days of stores. */
  spareFoodDays: number;
  /** Share of the crew gathering fish, game and berries at full stores and at empty stores. */
  gatherShare: [full: number, empty: number];
  /** Most miners. */
  miners: number;
  /** The item each world good becomes when a site is entered (and counts back into on leaving). */
  startItems: Record<GoodId, string>;
  /** The first ring (tiles from the origin) and padding a new building may take. */
  buildRing: number;
  buildPad: number;
  /** The buildings the steward raises. */
  homeBuilding: string;
  workshopBuilding: string;
  /** The job ids that fill each role the steward plans for. */
  roles: Record<
    | 'farm'
    | 'cook'
    | 'forage'
    | 'fish'
    | 'hunt'
    | 'build'
    | 'haul'
    | 'mine'
    | 'craftTools'
    | 'craftWares'
    | 'heal',
    string
  >;
  /** Trait whose bearers envy a neighbour's treasure. */
  envyTrait: string;
  /** Event type ids the steward emits. */
  events: {
    buildBegun: string;
    built: string;
    skilled: string;
    foodShort: string;
    itemStolen: string;
  };
}

/** Weather, crops, stores, firewood, fire and wild land at the watched site (M3.4). Tunables live in content/weather.ts. */
export interface EnvironmentRules {
  weather: {
    /** The day's swing (°C) keeps this share of yesterday's, plus a new draw of this spread. */
    anomalyKeep: number;
    anomalySd: number;
    /** The night's low is the day's temperature minus this. */
    nightBelow: number;
    /** A hard winter: offset (°C) over these months of its year (inclusive), and over the first months of the next. */
    hardWinter: {
      months: [number, number];
      offsetC: number;
      carryMonths: [number, number];
      carryOffsetC: number;
    };
    /** A drought year is this much warmer over these months. */
    drought: { months: [number, number]; offsetC: number };
    /** Rain chance a day = rainfall (mm) × perMm, between min and max; droughtMul over the drought months. */
    rain: {
      perMm: number;
      min: number;
      max: number;
      droughtMonths: [number, number];
      droughtMul: number;
    };
    /** Wet days at or below this temperature (°C) bring snow. */
    snowAtC: number;
    /** Storm chance a day = the cell's storm risk (0-100) / 100 × this. */
    stormPerRisk: number;
    /** Snow or a storm adds this share to warmth lost outdoors. */
    outdoorExtraLoss: number;
    /** Daylight swings this many hours per degree of latitude from 12 h; outdoor work stops under `outdoorMinHours`. */
    daylight: { swingPerDegree: number; outdoorMinHours: number; indoor: Workplace[] };
    /** Dry days that mark a dry spell (only in these months), and that sink a well with no water near. */
    drySpell: { days: number; months: [number, number] };
    wellLowDays: number;
    /** A frost on the crops is reported at most this often (days). */
    frostEventGap: number;
    /** The day a snowfall counts as the winter's first, from this month. */
    winterFrom: number;
    /** Days of lying snow counted at most (the melt budget; 3 melt a day above 2 °C). */
    snowMeltCap: number;
  };
  crop: {
    /** Sowing months (inclusive) and the day temperature (°C) it needs. */
    sowMonths: [number, number];
    sowMinC: number;
    /** Harvest months (inclusive): farming goes first, meals are never cut. */
    harvestMonths: [number, number];
    /** Unripe crops wither from this month. */
    witherMonth: number;
    /** A normal year gives this many times the people's year of meals (a small surplus). */
    normalYearMargin: number;
    /** Share of a normal year's food that fish, game and berries are expected to give. */
    otherFoodShare: number;
    /** Meals a healthy field gives at full soil. */
    fieldYield: number;
    /** Soil factor on yield = this + (1 - this) × soil / 100. */
    soilFloor: number;
    /** Health the steward expects fields to have at the harvest. */
    expectedHealth: number;
    /** Farmers tending each growing field (one visit a block keeps it from going untended). */
    tendersPerField: number;
    /** Grain used as seed, as a share of the field's expected yield. */
    seedShare: number;
    /** M3.7: while a resident has this condition, the steward keeps no seed back and it is eaten. */
    seedOpenCondition: string;
    /** Work (effectiveness-blocks) to sow a field and to cut it. */
    sowWork: number;
    cutWork: number;
    /** Warm days to ripen; growth a day = temperature factor × water / this. */
    growthDays: number;
    /** No growth at this temperature (°C), full growth `growSpanC` above it, half above `heatAboveC`. */
    growBelowC: number;
    growSpanC: number;
    heatAboveC: number;
    /** Growth under this share of the way is still "sown". */
    sproutAt: number;
    /** Dry days after which water is short (in a normal year, and in a drought year). */
    dryDays: number;
    droughtDryDays: number;
    /** A field this close (tiles, from its edge) to a river, lake or sea is "near water". */
    nearWaterTiles: number;
    /** Growth share kept and health lost a day in a dry spell, by distance to water. */
    waterNear: { growth: number; healthLoss: number };
    waterFar: { growth: number; healthLoss: number };
    /** Frost thresholds shift by up to this many degrees by a field's height among the fields: low ground freezes first. */
    frostSpread: number;
    /** A night this cold (°C) hurts young grain by `frostHealth`; this cold ruins ripe grain still standing. */
    frostC: number;
    frostHealth: number;
    ruinC: number;
    /** Chance a storm day damages a field, and by how much health. */
    stormChance: number;
    stormHealth: number;
    /** A growing field with no work for this many days loses this health a day. */
    untendedDays: number;
    untendedLoss: number;
    /** Health lost a day by ripe grain left uncut. */
    ripeLoss: number;
    /** Soil lost by each harvest, and won back by a field left bare all year. */
    soilPerHarvest: number;
    soilRecover: number;
    /** A harvest at or over this share of a normal year is fair. */
    fairShare: number;
  };
  spoilage: {
    /** Spoilage runs faster above `warmAboveC` and slower below `coldBelowC`. */
    warmAboveC: number;
    warmMul: number;
    coldBelowC: number;
    coldMul: number;
    /** A month with more spoiled than this many meals (not counting cooked meals) is reported. */
    reportAbove: number;
    /** Cooks smoke or salt fish and game when salt is in store. */
    preserve: {
      salt: string;
      itemsPerSalt: number;
      perBlock: number;
      from: string[];
      to: string;
    };
  };
  meals: {
    /** The steward looks at the stores every this many days. */
    planEveryDays: number;
    /** The month the harvest begins. */
    harvestMonth: number;
    /** Smallest share of a meal. */
    floor: number;
    /** A projection above this share counts as full meals. */
    roundUpAbove: number;
    /** Under this share the short-meals memory is the harder one. */
    hardBelow: number;
  };
  firewood: {
    /** The item homes burn. */
    item: string;
    /** Homes burn logs on days colder than this (°C): (this - temperature) / this × logsPerHomeDay. */
    burnBelowC: number;
    logsPerHomeDay: number;
    /** A home with no logs loses warmth indoors this many times faster. */
    coldHomeMul: number;
    /** Logs a followed home is expected to burn in a winter, until one has been counted. */
    expectedWinterPerHome: number;
    /** Winter (Leaffall to Lastsnow) months, inclusive; the steward resets the count on the first. */
    winterMonths: [number, number];
    /** Logs kept for building on top of last winter's burn, and the felling headroom above that. */
    buildingLogs: number;
    headroom: number;
  };
  fire: {
    /** A home with a lit hearth on a day colder than this (°C) may catch fire, with this chance a home a day. */
    hearthBelowC: number;
    hearthFireChance: number;
    /** Chance a storm day lightning starts a fire. */
    lightningChance: number;
    /** Each block a burning tile lights a burnable neighbour with this chance, times dryness and fuel. */
    spreadBase: number;
    dry: { days: number; mul: number };
    rainMul: number;
    snowMul: number;
    /** A tile burns this many blocks (inclusive). */
    burnBlocks: [number, number];
    /** Most adults who fight a fire, the chance one puts out a tile a block (with and without water in reach), and the spread beside them. */
    fighters: number;
    putOutChance: number;
    noWaterChance: number;
    nearFighterMul: number;
    /** Tiles within which a well, river or sea counts as water to fight with. */
    waterReach: number;
    /** A building with this share of its tiles burnt is burnt down. */
    burntShare: number;
    /** Days open ground shows as burnt. */
    burntDays: number;
    /** Fuel by building id (floors and walls); 0 or missing does not burn. */
    buildingFuel: Record<string, number>;
    treeFuel: number;
    ripeFuel: number;
    growingFuel: number;
    scrubFuel: number;
    grassFuel: number;
    grassWinterFuel: number;
    /** Months (inclusive) when grass is dry enough to burn well. */
    grassMonths: [number, number];
  };
  wild: {
    /** Pool lost per work block of hunting, foraging and fishing. */
    drawPerBlock: { game: number; berries: number; fish: number };
    /** Monthly regrowth toward 1: rate × max(pool, floor) × (1 - pool). */
    regrow: { game: number; berries: number; fish: number };
    regrowFloor: number;
    /** Berries yield only in these months (inclusive); fish yield less in winter months. */
    berryMonths: [number, number];
    winterMonths: [number, number];
    fishWinter: number;
    /** Logs on a tree; a felled tree grows back in this many years (inclusive range). */
    woodPerTree: number;
    regrowYears: [number, number];
    /** Trees within this many tiles of the stockpile are "woods in reach"; the woods are thin under this share of their size at embark. */
    woodsReach: number;
    woodsThinBelow: number;
    animals: {
      kinds: { id: string; name: string; glyph: string }[];
      /** Kind ids by biome id; `fallback` where a biome is not listed. */
      byBiome: Record<string, string[]>;
      fallback: string[];
      /** Animals on the map = base + perPool × game pool (rounded). */
      base: number;
      perPool: number;
      /** Tiles an animal may move in a block (0 to this). */
      step: number;
    };
  };
  /** Event type ids the site emits. */
  events: {
    drySpell: string;
    wellLow: string;
    frostCrops: string;
    frostField: string;
    firstSnow: string;
    hardWinter: string;
    storm: string;
    fieldsSown: string;
    seedOpened: string;
    harvest: string;
    harvestPoor: string;
    spoiled: string;
    firewoodShort: string;
    mealsCut: string;
    mealsRestored: string;
    fire: string;
    fireWild: string;
    fireOut: string;
    takenIn: string;
    woodsThin: string;
  };
}

/** A named glyph entry; the array index is the value stored in a `LocalMap` layer. */
export interface SiteGlyphDef {
  id: string;
  name: string;
  glyph: string;
}

/** Live-site rules (M3.1): local map, layout, promotion and outposts. Tunables live in content/site.ts. */
export interface SiteRules {
  /** Tiles per side of the local map. */
  mapSize: number;
  /** Tiles per world cell; the map spans the site cell plus half of each neighbour. */
  tilesPerCell: number;
  /** Sites bigger than this follow about this many people; the rest stay counts. */
  followCap: number;
  /** Homes in the layout = ceil(pop / this). */
  peoplePerHome: number;
  /** Fields in the layout = ceil(pop / this). */
  peoplePerField: number;
  /** How far (0-1) a river in a neighbouring cell is pulled toward the site. */
  riverPull: number;
  /** Chance a married man in a leaders-many-spouses culture takes a second wife at promotion. */
  extraSpouseChance: number;
  /** Index = `LocalMap.terrain` value. */
  terrains: SiteGlyphDef[];
  /** Index = `LocalMap.water` value. */
  waters: SiteGlyphDef[];
  /** Index = `LocalMap.tree` value. */
  trees: SiteGlyphDef[];
  /** Index = `LocalMap.mineral` value. */
  minerals: SiteGlyphDef[];
  buildings: BuildingDef[];
  /** Glyph drawn where a path crosses a river. */
  bridgeGlyph: string;
  outpost: {
    /** Lowest cell fertility (0-100) that can be farmed. */
    minFertility: number;
    /** Fewest and most settlers a new outpost gets. */
    settlers: [number, number];
    /** Food (person-years) the origin gives each settler. */
    foodPerSettler: number;
    /** Share of the origin's children and adults that go, before the settlers range clamps it. */
    settlerShare: number;
  };
  /** Summed world travel cost walked per day on foot. */
  travelCostPerDay: number;
  /** Event type ids that pause play, per category. */
  autoPause: Record<'deaths' | 'breakdowns' | 'fires' | 'threats' | 'magic' | 'arrivals', string[]>;
  /** M3.12: "Next notable" runs until an event of at least this importance, or this many days. */
  notable: { minImportance: number; maxDays: number };
  /** M3.12: days of play between autosaves. */
  autosaveDays: number;
}

/** Biographies (M2.6): how many chronicle lines an entity keeps and the words of its summary. */
export interface BiographyRules {
  /** Most chronicle lines in one biography; the first and last events are always kept. */
  maxLines: number;
  /** Per `NotableRole`: the noun in "stood as {title} of the {civ}". */
  roles: Record<NotableRole, string>;
  /** Per `DeathCause`: the phrase after "died", with its preposition ("of old age", "in a raid"). */
  causes: Record<DeathCause, string>;
  /** Summary sentence variants by name, filled with `fillTemplate`; the variant is chosen by id hash. */
  sentences: Record<string, string[]>;
}

/** Notables, families, succession and items (M2.5). Every number is a tunable; see content/notables.ts. */
export interface NotableRules {
  /** Living notables at most; kin spouses and children stop here, deed notables never do. */
  notableCap: number;
  /** Per culture id: the dynasty name pattern, `{name}` being the founder's given name. */
  dynastyNames: Record<string, string>;
  /** Fame (0-100) each way of becoming known starts with. */
  fame: {
    ruler: number;
    founder: number;
    captain: number;
    raider: number;
    crafter: number;
    scholar: number;
    /** A hero's fame is base plus per-danger times the beast's danger, at most `heroMax`. */
    hero: number;
    heroPerDanger: number;
    heroMax: number;
    /** Gained by a captain who wins a battle. */
    victory: number;
    legend: number;
    /** Fame of a mage by birth tier id (tiers not listed get 0). */
    mage: Partial<Record<string, number>>;
    /** Fame the first actor of an event gains, by event type (types not listed give none). */
    deeds: Partial<Record<string, number>>;
  };
  /** An event's importance gains floor(best actor fame / this), at most `actorFameCap`. */
  famePerImportance: number;
  actorFameCap: number;
  /** Names for roles and death causes in event text. */
  roleNames: Record<NotableRole, string>;
  deathPhrases: Record<DeathCause, string>;
  /** Succession clause per rule, for `ruler_succeeded`. */
  successionPhrases: Record<SuccessionRule, string>;
  /** Clause on a death a spouse outlives ({names}); empty data when none does. */
  widowedPhrase: string;
  /** Succession clause when no kin or notable of the civ was left to take the seat. */
  noHeirPhrase: string;
  /** Succession clause after a dispute: `held` when the heir by custom won, `seized` when the rival did ({rule}, {rival}). */
  disputePhrases: { held: string; seized: string };
  /** Yearly death chance of an adult before elder age, and of a child. */
  adultDeath: number;
  childDeath: number;
  /** Extra yearly chance of dying in a famine or disease at the notable's site that year. */
  famineDeath: number;
  diseaseDeath: number;
  /** Chance a beast raid kills one notable at the site. */
  beastKill: number;
  /** Chance a civ raid kills one notable at the target, and takes one artifact held there. */
  raidKill: number;
  raidStealChance: number;
  /** Chance a raiding civ without a living raider gets one. */
  raiderChance: number;
  /** Share of a razed site's notables who die; the rest flee. */
  razeDeathShare: number;
  /** A ruler leads the army himself when the culture's war value is at least this. */
  rulerLeadsWar: number;
  /** Chance the losing and the winning captain of a battle die. */
  captainDeath: number;
  captainDeathWin: number;
  /** Yearly chance an unmarried adult marries. */
  marryChance: number;
  /** Years a widow or widower waits after the spouse's death before marrying again. */
  mourningYears: number;
  /** Chance a ruler's child in an arranged-marriage culture marries into a linked civ. */
  allianceChance: number;
  /** Share of the two civs' grievance against each other that an alliance marriage removes. */
  allianceGrievanceCut: number;
  /** Yearly chance a married ruler of a many-spouses culture takes another spouse. */
  extraSpouseChance: number;
  /** Yearly chance of a child for a fertile married woman, times race fertility and room under the cap. */
  childChance: number;
  /** Mage births among commoners: per adult per year, times race fertility and strong-or-better odds. */
  mageBirthRate: number;
  /** Share of those mages who become notable. */
  mageNotice: number;
  /** Each living strong-or-better mage adds their tier's soldier midpoint times this to civ strength. */
  mageStrength: number;
  /** Yearly chance a living adult of power 13 or more grows legendary, while a slot is open. */
  legendChance: number;
  /** Chance a contested succession becomes a dispute, the top two scores of an election count as contested within this margin, and the winner's roll is 0..disputeLuck. */
  disputeChance: number;
  disputeMargin: number;
  disputeLuck: number;
  /** Artifacts (each decade): a town or city with this much luxury stock makes one with this chance. */
  artifactMinLuxury: number;
  artifactChance: number;
  /** Chance per decade a notable of power 3 or more writes a book, and a temple without a scholar gets one. */
  bookChance: number;
  scholarChance: number;
  /** Chance an item with no heir goes to the ruler, and chance per decade a lost item is found. */
  itemToRulerChance: number;
  itemFindChance: number;
  /** Item names: `{epithet}`, `{form}`, `{maker}`. */
  artifactNames: string[];
  artifactForms: string[];
  artifactEpithets: string[];
  /** Book names: `{form}`, `{writer}`, `{site}`. */
  bookNames: string[];
  /** Book forms by school id; `mundane` is for scholars and for schools not listed. */
  bookForms: Record<string, string[]>;
  /** What powerful figures do with their power: answer beasts, fight as champions, avenge, found. */
  deeds: DeedRules;
}

/** Legend deeds: existing figures act, and their fame comes from what they did. */
export interface DeedRules {
  /** A hero, captain or Strong+ mage of the raided civ living within this many cells answers a beast raid. */
  slayerRange: number;
  /** Power at which a figure fights as their civ's named champion in battle. */
  championPower: number;
  /** Yearly chance an avenger leads a raid on their enemy's home, once in their life, within this many cells. */
  vengeanceChance: number;
  vengeanceRange: number;
  /** A legend with no deed for this many years hunts the nearest living beast within `huntRange` (0: never). */
  huntIdleYears: number;
  huntRange: number;
  /** After a failed hunt ({name}): coming home, or dying in the lair (`beastKill` odds). */
  huntPhrases: { survived: string; died: string };
  /** Chance a non-ruler legend at the mother site leads the settlers of a new site. */
  legendFounds: number;
  /** Fame a legend's founding adds. */
  foundingFame: number;
  /**
   * Champion clauses ({civ}, {enemy}, {name}): how they stand (first in a war, stepping up for a
   * fallen champion, again in the battle they fall in) and how it ends.
   */
  championPhrases: {
    first: string;
    replaced: string;
    again: string;
    won: string;
    lost: string;
    fellWon: string;
    fellLost: string;
  };
  /** Outcome clauses: `{enemy}` is the sworn enemy. */
  vengeancePhrases: { slain: string; escaped: string };
  /** `{names}`: the kin who rode with the avenger. */
  vengeanceKin: string;
}

/** A sickness (M2.4b). History uses the yearly fields; Phase 3 reads the per-day ones. */
export interface DiseaseDef {
  id: string;
  name: string;
  /** Event type emitted when it strikes a site. */
  event: string;
  /** History: chance per link per year of spreading from a sick site. Phase 3: per contact-day. */
  infectivity: number;
  /** Days before symptoms and days sick (used from Phase 3; a site is sick for one year in history). */
  incubation: number;
  duration: number;
  /** Share of a struck site's people who die, [min, max], before age risk. */
  severity: [number, number];
  /** Death multiplier per age band. */
  ageRisk: { child: number; adult: number; elder: number };
  season?: 'spring' | 'summer' | 'autumn' | 'winter';
  /** Yearly chance a site of at least minPop starts an outbreak, times min(outbreakSizeCap, pop / minPop). */
  outbreak: number;
  minPop: number;
  /** Years a struck site cannot catch it again. */
  immunityYears: number;
}

export type CreatureTier = 'beast' | 'great' | 'legendary';

/** A kind of beast (M2.4). Danger is in soldier equivalents (R-24). */
export interface CreatureDef {
  id: string;
  name: string;
  tier: CreatureTier;
  /** Biome ids a lair can sit in. */
  biomes: string[];
  /** The lair cell's wildness must reach this (0-100). */
  minWildness: number;
  /** Soldier equivalents, 1..1000 (R-24). */
  danger: number;
  /** Most that live in a world at once. */
  maxAlive: number;
  /** Chance per decade, per free slot, that a new one appears. */
  spawnChance: number;
  /** Years a beast lives (min, max). */
  lifespan: [number, number];
  /** Chance per year of a raid, when a live site is in range. */
  raidChance: number;
  /** Chebyshev cells from the lair to a site it can raid. */
  raidRange: number;
  /** Name templates; `{near}` is the nearest live site at the time it appears. */
  names: string[];
}

/** Hard cap on a creature's danger, in soldier equivalents (R-24). */
export const MAX_CREATURE_DANGER = 1000;

/** Syllable and pattern tables for naming regions (M1.5). */
export interface NameTables {
  /** A place name stem is a start, optionally a middle, and an end: "Brann" + "ock". */
  starts: string[];
  middles: string[];
  ends: string[];
  /** Short capitalised words for compounds such as "the {a}teeth" -> "the Greyteeth". */
  adjectives: string[];
  /** Templates per region kind; `{n}` is the stem and `{a}` an adjective. 'ocean' is a sea touching the map edge. */
  patterns: Record<string, string[]>;
}

/** [r, g, b], each 0–255. */
export type Rgb = [number, number, number];

export interface BiomeDef {
  id: string;
  name: string;
  color: Rgb;
  /** Base fertility (0–100) before rainfall, season and floodplain adjustments. */
  fertility: number;
  /** Base wildness contribution (0–100): old forest and swamp high, grassland low. */
  wildness: number;
  /** Cost to cross one cell on foot (land biomes at least 1; unused for water biomes). */
  travel: number;
  /** True for forests (timber, game, old-forest aura, wildness). */
  forest?: boolean;
  /** Water biomes are assigned by water class, never by the climate table. */
  water?: 'sea' | 'coast' | 'lake';
}

export interface BiomeRules {
  /** Ascending upper bounds (°C) on mean annual temperature = (summer + winter) / 2; last band is open. */
  temperatureBands: number[];
  /** Ascending upper bounds (mm/yr) on rainfall; last band is open. */
  rainfallBands: number[];
  /** table[t][r] = biome id, for temperature band t and rainfall band r. Must be complete. */
  table: string[][];
  /** Land at or above this elevation (m) is alpine regardless of climate. */
  alpineElevation: number;
  /** Floodplain or lakeside land with rainfall >= this (mm) and mean temp >= swampMinTemp becomes swamp. */
  swampRainfall: number;
  swampMinTemp: number;
  /** Frost-free biomes only occur where the winter low is high enough; elsewhere the fallback biome is used. */
  frostFree: { biomes: string[]; minWinter: number; fallback: Record<string, string> };
  /** Sea cells within this many cells (8-neighbour) of land are coast, deeper ones ocean. */
  coastReach: number;
}

export interface ResourceDef {
  id: string;
  name: string;
  category: 'metal' | 'stone' | 'mineral' | 'food' | 'material' | 'magic';
  /** The good a deposit of this resource feeds (M2.4); omit if it feeds none. */
  good?: GoodId;
  /** Biome ids the resource can sit in (omit = any land). */
  biomes?: string[];
  /** Elevation window in metres (omit = no limit). */
  minElevation?: number;
  maxElevation?: number;
  /** Extra placement needs, all optional, all must hold. */
  needs?: {
    floodplain?: boolean;
    river?: boolean;
    /** Within this many cells of a volcano. */
    nearVolcano?: number;
    minAura?: number;
  };
  /** Clusters per 10 000 land cells, and target cells per cluster. */
  clustersPer10k: number;
  clusterSize: number;
  /** Hard cap on the share of land (or water, for fish) cells holding it, e.g. 0.002 for gems. */
  maxCellShare: number;
  /** Fish only: placed on coast/lake/river cells instead of land. */
  aquatic?: boolean;
}

export interface MapLayerStop {
  at: number;
  color: Rgb;
}

export interface MapLayerCategory {
  value: number;
  label: string;
  color: Rgb;
}

/**
 * A colour scheme for one world-map layer (Phase 1). The renderer in
 * worldgen/render.ts reads the cell values named by `id` (for example
 * "risk.drought") and paints them with these colours.
 */
export interface MapLayer {
  id: string;
  label: string;
  unit: string;
  kind: 'ramp' | 'categories';
  /** Ramp: colours linearly interpolated between stops, sorted by `at`. */
  stops?: MapLayerStop[];
  /** Elevation only: ramp for cells at or below sea level (metres, negative). */
  seaStops?: MapLayerStop[];
  /** Ramp only: bucket the value first, so `stops` are keyed by bucket number (log-like scales). */
  thresholds?: number[];
  /** Categories: one colour per value. */
  categories?: MapLayerCategory[];
  /** Categories: values past the list reuse colours in order (plate ids). */
  cycle?: boolean;
  /** Swatches shown in the map legend. */
  legend: { label: string; color: Rgb }[];
}

/** Tunable numbers for the settle stage (M2.2): where peoples found sites and how many people live there. */
export interface SettlementRules {
  /** Founding civs = clamp(min, max, floor(landCells / landCellsPerCiv) + a seeded draw of +-jitter). */
  civs: { min: number; max: number; landCellsPerCiv: number; jitter: number };
  /** Chance a civ also founds a second site, and how far from its capital (cells, Chebyshev). */
  secondSiteChance: number;
  secondSiteRange: [number, number];
  /** Least Chebyshev distance between two civs' capitals (relaxed by halves, not below `minCapitalSpacing`). */
  capitalSpacing: number;
  minCapitalSpacing: number;
  /** No site is founded within this many cells of another. */
  siteSpacing: number;
  /** Radius (cells, Chebyshev) of the land a site's people can farm, fish and hunt. */
  reach: number;
  /** Radii (cells, Chebyshev) within which a map feature counts for a site. */
  featureRadius: {
    river: number;
    coast: number;
    harbour: number;
    ford: number;
    pass: number;
    deposit: number;
    aura: number;
    routeNode: number;
  };
  /** Aura at the cell itself that counts as an aura site, and elevation (m) that counts as heights. */
  auraMin: number;
  heightsMin: number;
  /** Plains: one of these biomes and travel cost at most `plainsMaxTravel`. */
  plainsBiomes: string[];
  plainsMaxTravel: number;
  /** Resource categories that make a mine site. */
  mineCategories: ResourceDef['category'][];
  /** Resource ids that feed a site beyond farming. */
  fishId: string;
  gameId: string;
  capacity: {
    /** People fed per fertility point per cell. */
    perFertility: number;
    fishPerAmount: number;
    gamePerAmount: number;
    /** Multipliers for trade access. */
    port: number;
    ford: number;
    road: number;
    /** Farming multiplier on cells outside the race's preferred biomes. */
    foreignBiome: number;
    /** Extra multipliers by race and site feature, e.g. ore traded for food. */
    raceFeature: Record<string, Partial<Record<SiteFeature, number>>>;
    /** Food multiplier clamp(meanAura / ref, min, max) for races bound to aura, by race id. */
    raceAura: Record<string, { ref: number; min: number; max: number }>;
    /** Food multiplier when the feature is absent, by race id. */
    raceWithout: Record<string, Partial<Record<SiteFeature, number>>>;
  };
  /** Suitability score weights (higher is better). */
  suitability: {
    fertility: number;
    preferredBiome: number;
    preference: number;
    routeNode: number;
    jitter: number;
  };
  /** Founding population ranges (uniform ints); capped at `popCapacityShare` of capacity, never below `minPop`. */
  capitalPop: [number, number];
  secondPop: [number, number];
  popCapacityShare: number;
  minPop: number;
  /** Starting stores in years of food. */
  storesYears: number;
  /** Child share = clamp(maturity / lifespan * childFactor, childMin, childMax). */
  ageBands: { childFactor: number; childMin: number; childMax: number; elderShare: number };
  /** Ordinary site kind: the first entry whose limit exceeds the population; larger is a city. */
  kindByPop: [number, SiteKind][];
  /** Culture id to the kind of its capital, instead of the size kind. */
  capitalKind: Record<string, SiteKind>;
  /** Civ name templates per government; `{n}` is the capital's name. */
  civNames: Record<GovernmentKind, string>;
  /** Cost cap (summed travel cost) of a site's territory. */
  territoryReach: number;
  /** Wildness at or above which history founds no site, and borders spread at `deepWildClaim` times the cost. */
  deepWild: number;
  deepWildClaim: number;
  /** Free cities at the start (playtest add-on). */
  freeCities: FreeCityRules;
}

/** Tunable numbers for the yearly history stage (M2.3); see engine/history/. Rates are per year. */
/** Climate epochs (M2.4b): slow regional dry or cold spells that raise drought and winter odds. */
export interface ClimateRules {
  /** Chance per year that a new epoch starts, while fewer than `maxActive` run. */
  startChance: number;
  maxActive: number;
  /** Length range in years. */
  years: [number, number];
  /** Radius range in cells; sets the share of the map an epoch covers. */
  radius: [number, number];
  /** Share of epochs that are dry (the rest are cold). */
  dryShare: number;
  /**
   * Inside a dry or cold epoch the drought or winter chance is max(chance * mul, floor), and every
   * harvest there is multiplied by `yield`, bad year or not.
   */
  dry: { mul: number; floor: number; yield: number };
  cold: { mul: number; floor: number; yield: number };
}

/** Event importance scoring and rollups (M2.4b). */
export interface ImportanceRules {
  /** Bonus for events at a live site of this kind, and at a civ's capital. */
  kindFame: Partial<Record<SiteKind, number>>;
  capitalFame: number;
  /** [threshold, bonus] pairs ascending: the largest threshold `dead` (or `count`) reaches gives its bonus. */
  scale: [number, number][];
  /** Bonus the first time a type is emitted in a run. */
  novelty: number;
  /** Same type at the same place within this many years loses `repeatPenalty`. */
  repeatYears: number;
  repeatPenalty: number;
  /** Events under this importance roll up into the yearly summary and are pruned unless cited. */
  rollupBelow: number;
}

export interface CultureValueRules {
  /** Mean value gap between two cultures that counts as ordinary (insult chance x1). */
  typicalStrangeness: number;
  /** Strangeness between two cultures of one race is multiplied by this. */
  sameRaceStrangeness: number;
  /** Yearly grievance decay rises by this per honour point above 5 (falls below 5). */
  honourMemory: number;
  /** Envy grievance is multiplied by the envious culture's wealth / this. */
  envyWealth: number;
  /** Alliance marriage chance is multiplied by kin / this. */
  kinNeutral: number;
  /** Dispute chance is multiplied by 1 + (freedom - order) x this. */
  disputeSlope: number;
  /** Insult grievance is multiplied by 1 + (slighted value - 5) x this. */
  slightSlope: number;
  /** The insult's reason, by the value the slighted people hold dearest. */
  slights: Record<'faith' | 'kin' | 'order' | 'freedom' | 'honour', string[]>;
}

export interface HistoryRules {
  /** Harvest yield is 1 plus or minus this much, uniform. */
  harvestVariance: number;
  /** Drought chance per site per year = risk.drought / 100 * droughtScale; yield multiplier when it hits. */
  droughtScale: number;
  droughtYield: number;
  /** Harsh winter chance = risk.snow / 100 * winterScale; yield multiplier when it hits. */
  winterScale: number;
  winterYield: number;
  /** Food (in people fed) each person can produce, up to the site's capacity. */
  workerOutput: number;
  /** Stores never exceed this many years of need. */
  storesCapYears: number;
  /** Births per adult per year, before race fertility and crowding. */
  birthRate: number;
  /** Births fall by this share at full crowding. */
  crowdingBirthCut: number;
  /** Crowding (pop / capacity) at which births start to fall; the cut grows linearly to full crowding. */
  crowdingFrom: number;
  /** Yearly death rates for a human child and adult at zero crowding. */
  childDeath: number;
  adultDeath: number;
  /** Child and adult deaths rise by (1 + crowding * crowdingDeathRise). */
  crowdingDeathRise: number;
  /** Lifespan (years) the child and adult death rates are set for; longer-lived races die proportionally less. */
  referenceLifespan: number;
  /** Elders are the last share of a lifespan; their death rate is 1 / (lifespan * elderLifeShare). */
  elderLifeShare: number;
  /** Floors on the years spent as an adult and as an elder (caps the ageing and death rates). */
  minAdultYears: number;
  minElderYears: number;
  /** Share of a starving site's people who die, times the shortfall (0-1). */
  famineDeathShare: number;
  /** A famine with no bad year of its own names the site's earlier trouble up to this many years back. */
  famineCauseYears: number;
  /** Outbreak chance scales with pop / minPop up to this many times. */
  outbreakSizeCap: number;
  /** Share of children and adults who leave a starving or overfull site. */
  migrantShare: number;
  /** Migrants shun a site that starved within this many years (word of hunger travels). */
  famineShunYears: number;
  /** A site above this share of capacity may found a new site. */
  expandAt: number;
  /** Years between expansions from one site. */
  expandCooldown: number;
  expandChance: number;
  /** Chebyshev distance range (cells) of a new site from its source. */
  expandRange: [number, number];
  /** Share of children and adults who found the new site. */
  expandShare: number;
  /** A new site starts with this many years of food. */
  newSiteStoresYears: number;
  /** No new site within this many cells (Chebyshev) of another, live or ruined. */
  newSiteSpacing: number;
  /** A new site's capacity (for its civ's race) must reach this, about a village. */
  minNewSiteCapacity: number;
  /** Years before a civ may found another site. */
  civFoundCooldown: number;
  /** A bad harvest is an event only when stores after it fall under this many years of need. */
  shortStoresYears: number;
  climate: ClimateRules;
  importance: ImportanceRules;
  /** A town or city only drops a kind when under its lower limit by this share. */
  kindHysteresis: number;
  /** Sites under this population are abandoned. */
  abandonBelow: number;
  /** Travel cost within which two sites are linked, and the range (cells) of sea lanes between harbours. */
  linkReach: number;
  seaLinkRange: number;

  // Beasts (M2.4).
  /** Random land cells tried per spawn to find a lair. */
  beastSpawnTries: number;
  /** A lair is more than this many cells (Chebyshev) from any live site. */
  lairSpacing: number;
  /** A beast raid kills at most this share of a site, and about `danger` times the per-danger rate, at 0.5-1.5. */
  raidKillCap: number;
  raidKillPerDanger: number;
  /** Share of a raided site's stores that is lost. */
  raidStoresLoss: number;
  /** Chance the raided site slays the beast = base * min(1, adults / (danger * adultsPerDanger)) * tier factor. */
  slayBase: number;
  slayAdultsPerDanger: number;
  slayTierFactor: Record<CreatureTier, number>;

  // Trade (M2.4), once a decade.
  /** Resource deposits within this many cells (Chebyshev) of a site are its goods. */
  tradeGoodsRange: number;
  /** A site keeps this many years of food before it has a surplus, and wants this many before it has a shortage. */
  tradeKeepYears: number;
  /** Wealth both sides gain per unit of a good moved in trade. */
  goodValue: Goods;
  /** Wealth lost per decade, as a share. */
  wealthDecay: number;
  /** Share of its luxury stock a site sends to a partner with less, each trade round (at most half the gap). */
  luxuryTradeShare: number;

  // Goods (M2.4), yearly. Food is in `workerOutput` and `storesCapYears`.
  /** Units of each non-food good one adult makes a year when deposits are plentiful. */
  goodsPerWorker: Goods;
  /** Deposits (cells within `tradeGoodsRange`) of a good that give full output; fewer give a proportion. */
  depositsForFull: number;
  /** A stock of a non-food good never exceeds this many years of full output. */
  goodsCapYears: number;
  /** Yearly need: ore and timber per adult, salt per person; luxury and food are not listed here. */
  need: Goods;
  /** Food stores cap multiplier while the salt stock is under a year's need (below 1). */
  saltShortStoresCap: number;
  /** Civ strength is multiplied by 1 + this * min(1, ore stock per adult). */
  oreStrength: number;
  /** Each year a site's wealth rises by luxury stock * goodValue.luxury * this. */
  luxuryWealthShare: number;
  /** Richer civ's wealth over this multiple of the poorer's, and at least `envyMinWealth`, breeds envy. */
  envyRatio: number;
  envyMinWealth: number;

  // Grievance (M2.4).
  /** A famished site of a culture with `values.war` at or above this may raid a neighbour. */
  raidWarValue: number;
  /** Chance per year = this * values.war / 10. */
  civRaidChance: number;
  /** Share of the target's food taken, at most one year of the raider's food; luxury is taken too when food falls short. */
  raidLootShare: number;
  /** Share of the target's people killed (min, max). */
  civRaidDeaths: [number, number];
  /** Grievance added by each kind of wrong; vengeance is added when a ruler's kin swear an oath against a foreign killer. */
  grievance: { raid: number; border: number; insult: number; envy: number; vengeance: number };
  /** Two civs with at least this many neighbouring territory cells may clash. */
  borderCells: number;
  /** Chance per decade = this * (warA + warB) / 20. */
  borderClashChance: number;
  /** Chance per decade that one of two linked civs insults the other. */
  insultChance: number;
  /** Grievance is multiplied by this each year and forgotten under 0.5. */
  grievanceDecay: number;
  /** How culture values shape quarrels, grudges, trade goodwill, marriages abroad and disputes. */
  cultureValues: CultureValueRules;

  // War (M2.4).
  /** Soldiers per adult = (strength + agility + endurance) / this * levyShare. */
  soldierBase: number;
  levyShare: number;
  /** Strength ratio of attacker to defender is capped here. */
  maxStrengthRatio: number;
  /** Opportunity multiplier when every defender site in reach holds a pass or ford. */
  crossingPenalty: number;
  /** A war starts when grievance * opportunity reaches this. */
  warThreshold: number;
  /** Share of a civ's strength in the field each year. */
  campaignShare: number;
  /** Defence multipliers by site feature (heights, pass, ford), kind (fortress) and 'capital'. */
  defence: Record<string, number>;
  /** Each side's strength is multiplied by 1 plus or minus this. */
  battleLuck: number;
  /** Share of the army lost by the loser and the winner. */
  loserLoss: number;
  winnerLoss: number;
  /** Chance a conquered site is razed instead (doubled when the races differ). */
  razeChance: number;
  /** Share of a razed site's people who die; the rest flee. */
  razeDeathShare: number;
  /** A war ends after this many years, or when a side's war dead pass this share of its starting adults. */
  maxWarYears: number;
  wearyShare: number;
  /** Years after peace before either side can declare again. */
  peaceYears: number;
  /** Colleges of magic (playtest add-on): founding, training, notice and spells. */
  colleges: CollegeRules;
  /** Free cities (playtest add-on): at the start, by breaking away, and their pacts. */
  cityStates: CityStateRules;
}

/** A spell a college master or legend can work on a site's trouble (colleges.ts). */
export interface SpellDef {
  id: string;
  /** The trouble it answers: a dry or cold spell over the site, a sickness there, or this year's famine. */
  target: 'dry' | 'cold' | 'disease' | 'famine';
  /** Primary schools that can work it. */
  schools: string[];
  /** What the caster did, after their name; `{site}` and `{disease}` are filled in. */
  deed: string;
}

export interface CollegeRules {
  /** A college opens only in a site of this many people or more. */
  minPop: number;
  /** Each decade, per civ without a college and with a Strong+ mage: chance times culture learning / 10. */
  foundChance: number;
  /** At most this many colleges stand at once in a world. */
  maxOpen: number;
  /** A civ with a college notices this many times the usual share of mage births among its commons. */
  noticeFactor: number;
  /** Yearly chance a Strong+ mage of a college's people gains one power (never past legendary - 1). */
  trainChance: number;
  /** A college's people are this many times as likely to see a mage grow into a legend. */
  legendFactor: number;
  /** Yearly chance a Strong+ mage of a people without a college sets out to study at one in reach. */
  travelChance: number;
  /** Cells a student will travel to a college. */
  travelRange: number;
  /** Years a student stays before going home. */
  studyYears: number;
  /** College names; `{site}` and `{school}` (capitalised) are filled in. */
  names: string[];
  /** Least power to work a spell (Exceptional). */
  spellPower: number;
  /** Yearly chance an able caster with a trouble in reach works a spell. */
  spellChance: number;
  /** Cells a caster travels to work a spell (about the hunt range). */
  spellRange: number;
  /** Years a caster rests between spells. */
  spellRest: number;
  /** Fame per spell. */
  spellFame: number;
  /** Food a bounty spell adds, in years of the site's need. */
  bountyYears: number;
  /** Years a warded site and its neighbours stay safe from the sickness. */
  wardYears: number;
  spells: SpellDef[];
}

/** Free cities at the start (settle): small realms of one town, set apart from the capitals. */
export interface FreeCityRules {
  /** One per `landCellsPerCity` land cells, clamped to min..max. */
  start: { min: number; max: number; landCellsPerCity: number };
  /** Least distance from a capital, and from any other site. */
  capitalSpacing: number;
  siteSpacing: number;
  /** Starting people. */
  pop: [number, number];
  /** Names, at the start and for towns that break away; `{n}` is the city's name. */
  names: string[];
}

export interface CityStateRules {
  /** Breaking away, checked each decade for sites of civs with at least `minSites` live sites. */
  secede: {
    minSites: number;
    minPop: number;
    /** Least distance from the capital. */
    minDistance: number;
    /** Chance per decade before the culture's freedom (/ 10) and the troubles below. */
    chance: number;
    /** Multipliers: a famine at the site in the last decade, the civ at war, a disputed succession in the decade. */
    famine: number;
    war: number;
    dispute: number;
    /** No more break away while this many free cities live. */
    maxFree: number;
    /** Grievance the old realm holds against the city that left. */
    grievance: number;
    /** Years before the old realm can march on the city. */
    graceYears: number;
  };
  /** Pacts of defence a free city swears with a neighbour, each decade. */
  pact: {
    chance: number;
    /** Neither side may hold more grievance than this against the other. */
    maxGrievance: number;
    /** Share of the ally's strength that comes to a defender's battles. */
    aidShare: number;
    /** Grievance the attacker gains against the ally who came. */
    grievance: number;
  };
}

/** One kind of evening interaction between two residents (M3.6). Numbers are tunables in content/interactions.ts. */
export interface InteractionDef {
  id: string;
  name: string;
  /** Base weight when picking a kind. */
  weight: number;
  /** Opinion change: [target's opinion of the actor, actor's opinion of the target]. */
  opinion: [toTarget: number, toActor: number];
  /** Only when the actor's opinion of the target is above / below this (no entry counts as 0). */
  needsOpinionAbove?: number;
  needsOpinionBelow?: number;
  /** With `needsOpinionBelow`: a bad mood (below 0) also allows it. */
  orBadMood?: boolean;
  /** Weight multiplier by actor trait id. */
  traitWeights?: Record<string, number>;
  /** Weight multiplier when the actor's mood is below 0. */
  moodWeight?: number;
  /** Memories given: to the target and to the actor, about the other. */
  memory?: { target?: string; actor?: string };
  /** Grown people only. */
  adultsOnly?: boolean;
  /** Courtship: run by the family rules between eligible pairs, not by the plain opinion deltas. */
  courtship?: boolean;
  /** Begins a grudge in a target who already thinks this ill of the actor (opinion at or below it). */
  grudgeIfOpinionBelow?: number;
}

/** A spiteful act taken in revenge; `phrase` fills the revenge event. */
export interface SpiteDef {
  id: string;
  weight: number;
  phrase: string;
}

/** Opinions, labels, grudges and the evening's partner pools (M3.6). */
export interface SocialRules {
  /** Interactions a resident starts each evening (min, max inclusive), and the shift by trait id. */
  perDay: [number, number];
  /** A resident starts interactions on one evening in this many (by id and day). */
  startEvery: number;
  traitShift: Record<string, number>;
  /** Weight of each partner pool: same building, same job today, nearby children, anyone (the green). */
  pools: { building: number; job: number; neighbour: number; green: number; suitor: number };
  /** Candidates sampled from a pool before the weighted pick. */
  sample: number;
  /** Nearest homes that share a child's company. */
  neighbourHomes: number;
  /** Weight multiplier for a partner the actor counts a friend. */
  friendWeight: number;
  /** Weight multiplier for a partner the actor is free to court. */
  suitorWeight: number;
  /** Label thresholds: gained at `at`, lost past `drop` (hysteresis). */
  labels: {
    friend: { at: number; drop: number };
    rival: { at: number; drop: number };
    enemy: { at: number; drop: number };
  };
  /** Opinion change in a witness by the memory they gain (theft, rage seen). */
  witnessed: Record<string, number>;
  /** A month without meeting moves an opinion this far toward 0; entries under `forgetBelow` with no label or grudge are dropped. */
  drift: { by: number; forgetBelow: number };
  grudge: {
    /** Chance per evening meeting of acting on a grudge, times honour / 5. */
    revengeChance: number;
    /** Multiplier for this trait. */
    hotTrait: string;
    hotMul: number;
    acts: SpiteDef[];
    /** Opinion change in the target of revenge, and the memories given: target, avenger. */
    targetOpinion: number;
    /** Opinion the avenger gains of the target on settling the score. */
    satisfaction: number;
    memoryOf: { humiliated: string; vengeance: string };
    /** Days before a grudge may be forgiven; yearly chance base; the age (days) after which the chance doubles. */
    forgiveAfterDays: number;
    forgiveBase: number;
    forgiveDoubleDays: number;
    /** Traits that double the chance, and the multiplier for kin. */
    forgiveTraits: string[];
    kinMul: number;
    /** Opinion left after forgiving. */
    forgivenOpinion: number;
  };
  /** Event ids. */
  events: { enmity: string; lovers: string; revenge: string; forgave: string };
}

/** Courtship, marriage, households, births and inheritance (M3.6). */
export interface FamilyRules {
  court: {
    /** Largest age gap (years) between a couple at the history rules' reference lifespan; scaled by lifespan. */
    ageGap: number;
    /** Chance a flirt succeeds: (target's opinion + shift) / 100 clamped to [min, max]. */
    successShift: number;
    successMin: number;
    successMax: number;
    /** Opinion change in both on success; in the flirting one on failure. */
    successOpinion: number;
    failOpinion: number;
    /** Both opinions at this make lovers. */
    loversAt: number;
    /** Days as lovers before marrying, and the monthly chance after. */
    courtDays: number;
    marryChance: number;
    /** Days a widowed person waits before courting again. */
    remarryAfterDays: number;
    rejectedMemory: string;
  };
  arranged: {
    /** Years past maturity before a household head arranges a match, and the monthly chance. */
    afterYears: number;
    chance: number;
    /** The pair's opinions of each other must sum to at least this. */
    minOpinionSum: number;
  };
  /** Most spouses a man may have where leaders take many. */
  maxSpouses: number;
  /** Who moves into whose household on marriage. */
  residence: 'groom';
  /** Text for the marriage event: the gift by culture custom, and how the match came about. */
  gifts: Record<MarriageGift, string>;
  how: { arranged: string; love: string };
  births: {
    /** A wife is fertile up to this share of her race's lifespan. */
    fertileUntil: number;
    pregnancyDays: number;
    /** Yearly chance a fertile wife conceives is at most this. */
    maxPerWife: number;
  };
  /** Text for the inheritance event, by rule. */
  inheritance: Record<InheritanceRule, string>;
  /** Memory ids the family rules give. */
  memoryOf: {
    married: string;
    childBorn: string;
    cameOfAge: string;
    lostSpouse: string;
    lostChild: string;
    lostParent: string;
    lostSibling: string;
    lostFriend: string;
    outlivedEnemy: string;
  };
  events: {
    married: string;
    birth: string;
    cameOfAge: string;
    householdFormed: string;
    inherited: string;
    orphanTakenIn: string;
  };
}

/** A punishment, mildest first: the order the escalation steps walk (M3.7). */
export const PUNISHMENTS = ['none', 'fine', 'labour', 'exile', 'execution'] as const;
export type Punishment = (typeof PUNISHMENTS)[number];

/** The crimes a site judges (M3.7). */
export const CRIMES = ['theft', 'brawl', 'murder'] as const;
export type Crime = (typeof CRIMES)[number];

/** A culture's law: the punishment for each crime and the harshest it ever goes to (M3.7). */
export interface JusticeDef {
  cultureId: string;
  punish: Record<Crime, Punishment>;
  max: Punishment;
  /** What the line says of the custom: "by the law of the Wells". */
  phrase: string;
}

/** A holy day of a religion: no work, a shared meal and talk on the green (M3.7). */
export interface FestivalDef {
  id: string;
  religionId: string;
  name: string;
  /** Month (0-11) and day of the month (1-28). */
  month: number;
  day: number;
  /** "lit the beacons", for the line. */
  rite: string;
}

/** How a religion lays its dead to rest, and what that costs from the stores (M3.7). */
export interface FuneralRiteDef {
  religionId: string;
  /** "buried by the well", "burnt on a pyre". */
  phrase: string;
  /** Item id → count taken from the stores; skipped (and said so) when the stores lack them. */
  cost?: Record<string, number>;
}

/** Status, crime and punishment, holy days and funerals at the watched site (M3.7). */
export interface SocietyRules {
  status: {
    /** Points by job id; no job counts 0. */
    jobs: Record<string, number>;
    /** By notable title; a promoted ordinary person has none. */
    titles: Record<string, number>;
    head: number;
    elder: number;
    /** Per world item held, up to `itemsMax`. */
    perItem: number;
    itemsMax: number;
    /** Fame / `fameDiv`, up to `fameMax`. */
    fameDiv: number;
    fameMax: number;
    /** A living notable parent, spouse or child. */
    notableKin: number;
    /** A person stands high when in the top `highShare` of the site and at or above `high`; low below `low`. */
    high: number;
    highShare: number;
    low: number;
    /** Lost for each punishment (by kind); regained by `recoverPerMonth`. */
    shame: Partial<Record<Punishment, number>>;
    recoverPerMonth: number;
  };
  crime: {
    /** Daily chance a hungry adult pilfers food or seed corn while meals are short or the stores bare. */
    pilferChance: number;
    /** Meals taken (times the race's daily need). */
    pilferMeals: number;
    /** The food need must be below this. */
    pilferHungerBelow: number;
    /** Trait id → multiplier. */
    pilferTraits: Record<string, number>;
    /** The culture's order value scales the chance by (1 - order / orderDiv). */
    orderDiv: number;
    /** Chance an unwitnessed crime comes to light anyway (and who did it is known). */
    foundOut: number;
    /** Share of revenges that turn into a brawl instead of spite; hot temper and a warlike culture raise it. */
    brawlShare: number;
    brawlHotMul: number;
    /** A culture with war at or above this brawls twice as often. */
    brawlWarAt: number;
    /** Wound tiers a brawl gives (by the condition ids' shares). */
    brawlWounds: string[];
    /** A grudge at least this old, against someone this hated, may end in murder: chance per revenge. */
    murderAfterDays: number;
    murderBelow: number;
    murderChance: number;
    /** Trait that makes murder possible at all (nobody else kills over a grudge). */
    murderTrait: string;
    /** Rivals and enemies both at a festival brawl with this chance. */
    festivalBrawl: number;
    /** Opinion a known victim loses of the offender. */
    wrongedOpinion: number;
  };
  justice: {
    /** A second offence within this many days steps the punishment up once. */
    repeatDays: number;
    /** A high-standing offender in a culture with order below this steps down once (never to none). */
    lenientOrderBelow: number;
    /** Days of work owed (fine) or served (labour), by crime. */
    fineDays: Record<Crime, number>;
    labourDays: Record<Crime, number>;
    /** The job a sentence is served at. */
    labourJob: string;
    /** Opinion the victim gains of the offender once amends are made. */
    amends: number;
    /** Children are never punished beyond this. */
    childMax: Punishment;
    /** "brawling", for lines. */
    crimeWords: Record<Crime, string>;
    /** "fine": "made amends to", for lines. */
    words: Record<Punishment, string>;
  };
  laws: JusticeDef[];
  festivals: FestivalDef[];
  funerals: FuneralRiteDef[];
  funeral: {
    /** Days after the death. */
    afterDays: number;
    /**
     * Meals eaten at the funeral feast per mourner (times the daily need), only when the stores hold
     * `feastDaysAbove` days. Everyone attends for someone of high standing; else household, kin and friends.
     */
    feastMeals: number;
    feastDaysAbove: number;
    /** How the dead are laid to rest when their religion's rite costs more than the stores hold. */
    plainRite: string;
  };
  /** What a killing or an execution is named in the death line: "died of {word}, after {span}". */
  deaths: Record<'murder' | 'execution', { word: string; span: string }>;
  festival: {
    /** Extra meals per person at the feast (times the daily need), only when the stores hold this many days. */
    feastMeals: number;
    feastDaysAbove: number;
    /** Interactions per person that evening are multiplied by this. */
    talkMul: number;
  };
  memoryOf: {
    sentenced: string;
    shamed: string;
    sawJustice: string;
    feasted: string;
    leanFeast: string;
    mourned: string;
    exiledKin: string;
    executedKin: string;
    wronged: string;
  };
  events: {
    pilfered: string;
    brawl: string;
    murder: string;
    unsolved: string;
    judged: string;
    amendsMade: string;
    exiled: string;
    executed: string;
    festival: string;
    funeral: string;
  };
}

/** A wild animal that takes a lone worker far from the village (M3.8). */
export interface ProwlerDef {
  id: string;
  name: string;
  glyph: string;
  /** Soldier equivalents. */
  danger: number;
  /** Biome ids of the site's cell where it roams. */
  biomes: string[];
  /** Items of game a worker who kills it brings home. */
  meat: number;
}

/** Wild prowlers, beasts, raiders and the answer to them at the watched site (M3.8). */
export interface ThreatRules {
  prowlers: {
    /** Attacks a year at wildness 100 for the site's cell. */
    perYear: number;
    /** A prowler takes only a worker at least this many tiles from the origin. */
    from: number;
    /** Share of won fights where the animal is killed rather than driven off. */
    killShare: number;
    /** Workplaces of the jobs done out in the wild, where a prowler finds someone alone. */
    workplaces: string[];
    kinds: ProwlerDef[];
  };
  beasts: {
    /** Days of warning for a great or legendary beast (a beast-tier one comes unannounced). */
    warnDays: [number, number];
    /** Signs by creature def id; `{dir}` is the compass word toward the lair, `{site}` the site. */
    signs: Record<string, string[]>;
    /** Glyph on the map by creature def id. */
    glyphs: Record<string, string>;
    /** Days before the same beast may attack again. */
    cooldownDays: number;
    /** Multiplies the world-tier yearly raid chance, since a watched year is played in full. */
    chanceMul: number;
    /** Creature def ids whose arrival sets a building alight. */
    fireBreath: string[];
    /** A beast eats at most this many days of the site's meals (one a resident a day). */
    mealCapDays: number;
    /** Where the lair lies when no named region holds it: `{dir}` is the compass word. */
    wild: string;
    /** The lair clause: `{place}` is the region's name or `wild`. */
    lair: string;
  };
  raids: {
    /** The raiders' civ holds at least this much grievance against the site's civ. */
    minGrievance: number;
    /** The raiders' home is that civ's nearest live site within this many cells. */
    reach: number;
    /** Chance a year at war value 10 and full grievance. */
    perYear: number;
    cooldownDays: number;
    /** Share of the home's adults that ride (times the followed share), clamped to `band`. */
    bandShare: number;
    band: [number, number];
    /** Most raiders against a site: this share of its adults (at least `band[0]`). */
    targetShare: number;
    /** Chance of a one-day warning. */
    warnChance: number;
    warning: string;
    /** The raiders turn back once this share of them is down. */
    retreatAt: number;
    /** Share of the stores carried off by a band that reaches them whole. */
    lootShare: number;
    /** Soldier equivalents per raider. */
    perHead: number;
    glyph: string;
  };
  combat: {
    /** Blows landed per soldier equivalent per block. */
    hitPerSoldier: number;
    /** Wound tiers (condition ids) by weight. */
    woundShares: Record<string, number>;
    /** Share of blows on defenders that kill outright. */
    slainShare: Record<CreatureTier | 'raid', number>;
    /** Most defenders hurt in one block (R-24). */
    roundCap: Record<CreatureTier | 'raid', number>;
    /** Strength is times `base + (1 - base) * rest / 100`. */
    fatigueBase: number;
    /** Strength is times this when standing wall segments face the attack. */
    wallBonus: number;
    /** Soldier equivalents added per point of a held weapon's combat value. */
    weaponMul: number;
    /**
     * The strongest able adults stand to arms until their strength reaches this many times the
     * attackers' (at least `militiaMin`, at most everyone able); the rest shelter at home.
     */
    militiaOdds: number;
    militiaMin: number;
    /** Walking cost the attackers cover in a block (people cover `LifeRules.walkPerBlock`). */
    advance: number;
    /** Defenders this many tiles (Chebyshev) from the attackers are in the fight. */
    engageRange: number;
    /** Rest lost per block spent defending. */
    defendRest: number;
    /** Blocks of fighting before either side withdraws. */
    maxRounds: number;
    /** A beast whose vigour falls below this goes back to its lair. */
    leavesAt: number;
  };
  flight: {
    /** The able adults' strength under this share of a beast's danger sends everyone fleeing. */
    fleeBelow: number;
    /** Days before the arrival the people judge whether to flee (so the sign is seen first). */
    judgeDaysAhead: number;
    /** Days after the attackers leave before the people come home. */
    returnAfterDays: number;
    /** Blocks a beast with no one in reach stays to take the stores. */
    ravageBlocks: number;
    /** People within this many tiles of a ravaging beast can be hurt. */
    strike: number;
  };
  walls: {
    /** Wall tiles planned after an assault. */
    segments: number;
    /** Tiles outside the outermost home on the side the attack came from. */
    ringPad: number;
    /** Homes farther than this (tiles from the origin) are outliers the arc does not chase. */
    maxRing: number;
    /** Building def raised. */
    building: string;
  };
  /** How a death in the fight reads: "died of {word}, after {span}". `{name}` is the attackers. */
  death: { word: string; span: string };
  /** Compass words, clockwise from north in eighths. */
  compass: string[];
  /** Days after a threat opens before another beast or raid may come to the site. */
  quietDays: number;
  /** Attackers are first seen this many tiles beyond the outermost home on their side. */
  approach: number;
  memoryOf: { foughtOff: string; fearRaid: string };
  events: {
    prowler: string;
    prowlerDriven: string;
    prowlerKilled: string;
    sign: string;
    flight: string;
    flightReturned: string;
    beastArrived: string;
    /** A beast comes to a town its people have fled. */
    beastCameEmpty: string;
    raidArrived: string;
    beastSlain: string;
    beastDrivenOff: string;
    beastRavaged: string;
    raidersRepelled: string;
    raidLooted: string;
    fell: string;
  };
}

/** Light magic and lore at the watched site (M3.9). Every number is a tunable in content/lore.ts. */
export interface LoreRules {
  /** Ability ids of the common cantrips taught at the site (all family 'magic'). */
  cantrips: string[];
  /** Chance an adult who meets a cantrip's requirements already knows it when watching begins. */
  knownAtEmbark: number;
  /** Evenings of lessons a pupil whose learning attributes average 10 needs for one cantrip. */
  lessons: number;
  /** Pupils younger than this many years take no lessons. */
  minAge: number;
  /** A parent or the hedge-witch teaches only pupils younger than the race's maturity age times this. */
  pupilUpTo: number;
  /** A book can be read only by someone with at least this intellect. */
  readMinIntellect: number;
  /** The hedge-witch: the adult of at least this power who knows the most cantrips. */
  hedgeWitchMinPower: number;
  books: {
    /** An owner who cannot use a school book may lend it every this many days. */
    lendEveryDays: number;
    /** The borrower gives it back when done, or after this many days. */
    maxLoanDays: number;
    /** Chance a day that a lent book is lost (left out in the rain, dropped in the river). */
    lossPerDay: number;
    /** The owner lends only to someone they think at least this well of (pairs that never met count 0). */
    minOpinion: number;
    /** Chance each book in a home that burns down is lost with it. */
    burnChance: number;
    /** Opinion the owner loses of a borrower who lost the book. */
    lostSting: number;
  };
  /** What the cantrips do, by effect tag. */
  effects: {
    /** A hearth kept by a kindler burns this share of the logs. */
    warmthShare: number;
    /** Condition points one use of mending restores to a building (100 is new). */
    mendPerUse: number;
    /** A soothed condition counts as tended with this power (a healer with herbs is 1). */
    soothePower: number;
    /** With a weather-reader at the site, frost does this share of its harm to the fields. */
    frostShare: number;
    /** Stress one use of calming takes off the most stressed member of the household. */
    calmStress: number;
  };
  /** Rest a person loses for each cantrip they cast (mild fatigue, R-29). */
  castRest: number;
  /** Race dependencies that act at the site (R-29). */
  dependencies: {
    /** Race ids that need high-aura land, the cell aura below which they fade, and the memory. */
    aura: { races: string[]; below: number; memory: string };
    /** Race ids that need ore work, the days without any before it tells, the jobs that count, the memory. */
    ore: { races: string[]; days: number; jobs: string[]; memory: string };
  };
  events: {
    learned: string;
    hedgeWitch: string;
    lent: string;
    returned: string;
    lost: string;
    burned: string;
    awakened: string;
    frostRead: string;
    /** A lost or burnt book was the site's last source of a cantrip (pauses play). */
    lastSource: string;
  };
  memoryOf: { learned: string; taught: string; bookLost: string; awakened: string };
}

/** One way a person can wake to more magic (REBOOT_PLAN §5.3): once in a life, one tier at most. */
export interface AwakeningDef {
  id: string;
  /** Long reading of a book of a magic school, or long holding of an item with a power effect. */
  source: 'book' | 'item';
  /** Evenings of reading or days of holding before it can happen. */
  afterDays: number;
  /** Chance at each later monthly check. */
  monthlyChance: number;
  /** Lifts only people at or below this tier, and never into Legendary. */
  maxFromTier: 'none' | 'faint' | 'gifted' | 'strong';
  /** Chronicle words for how it came about: `{item}` is the book or item. */
  how: string;
}

/** Thin politics and trade at the watched site (M3.10). */
export interface PoliticsRules {
  /** The local leader's title by culture `government`; a civ's ruler leads wherever they live. */
  leaderTitles: Record<string, string>;
  /** Fallback title when the culture's government has none. */
  leaderTitle: string;
  /** The ruler's title in chronicle lines. */
  rulerTitle: string;
  /** Standing points for leading the site (a title worth more counts instead). */
  standing: number;
  succession: {
    /** Two kin within this many points (fame + 2 × charisma) make a contested choice. */
    disputeMargin: number;
    /** Chance a contested choice becomes an open dispute. */
    disputeChance: number;
    /** Luck added to each claimant's fame + charisma in a dispute. */
    disputeLuck: number;
    /** Opinion the loser of a dispute loses of the winner (and holds a grudge). */
    loserOpinion: number;
    /** When no kin can take the seat by custom, the people choose (the rules' own phrases are history's). */
    peoplePhrase: string;
  };
  caravans: {
    /** Most trade partners that send a caravan, strongest first. */
    partners: number;
    /** History trade within this many years of the end makes a partner. */
    recentYears: number;
    /** Season indexes (0 spring … 3 winter) a caravan may travel in. */
    seasons: number[];
    /** Days a caravan stays before it goes home. */
    stayDays: number;
    /** Days a caravan waits while a threat is at the site. */
    waitDays: number;
    /** Share of each gap (surplus against shortage) one caravan carries. */
    share: number;
    /** Years of need each side keeps before it calls the rest surplus (history's `tradeKeepYears`). */
    keepYears: number;
    /** The item a caravan brings and takes first for each world good, then the others carrying it. */
    carry: Record<string, string[]>;
    /** Smallest number of items worth carrying. */
    minItems: number;
    /** News: history events at the partner of at least this importance, within this many years. */
    newsImportance: number;
    newsYears: number;
  };
  events: {
    leaderNamed: string;
    succeeded: string;
    disputed: string;
    caravanArrived: string;
    caravanQuiet: string;
    caravanTraded: string;
    /** Only the site gave goods, or only the caravan did. */
    caravanSold: string;
    caravanBought: string;
    caravanNothing: string;
    caravanWaits: string;
  };
}

/** One entry of a recap's tally (M3.11): events of these types counted, worded for one and for many. */
export interface RecapTally {
  types: string[];
  /** `{n}` is the count, spelled out up to ten. */
  one: string;
  many: string;
  /** Ranks the entry: the most telling counts are named first, and the rest dropped past the cap. */
  weight: number;
  /** Also counts the largest `key` of these events, such as the sick in an outbreak. */
  peak?: { type: string; key: string };
}

/** The watched site's chronicle (M3.11). */
export interface ChronicleRules {
  /** Site lines below this importance fold into one line a month in the live chronicle. */
  rollupBelow: number;
  recap: {
    seasonType: string;
    yearType: string;
    /** The period's most important events, cited as the recap's causes, so "why?" shows them. */
    causes: number;
    /** Events below this importance are never cited. */
    causeAtLeast: number;
    /** A zero count is left out; the rest are ranked by weight, and at most `maxTally` are named. */
    tally: RecapTally[];
    maxTally: { season: number; year: number };
    /** What a season was about, from its top event's type, else from that event's category. */
    themes: Record<string, string>;
    themeByCategory: Record<string, string>;
    /** The tally when nothing on the list happened. */
    quiet: string;
    /** The names of the seasons, spring first. */
    seasons: string[];
  };
}
