// What the site view says about weather, harvest, stores, firewood, fire and short meals (M3.4).
// Words and counts only: every number is read from the engine's state; nothing here decides a rule.

import {
  MONTH_NAMES,
  daysToHarvest,
  dateOf,
  foodDaysLeft,
  harvestSoFar,
  itemCount,
  type ActiveSite,
  type Building,
  type ContentBundle,
  type Id,
  type SiteRules,
  type WorldState,
} from '../engine';
import { roundedCount as count } from './format';

/** Under this width the time bar uses the short date and the short weather chip. */
export const NARROW_PX = 480;
/** A night under this (°C) is "cold" on the weather chip (a display threshold, not a rule). */
export const COLD_NIGHT_C = -5;

interface Ctx {
  world: WorldState;
  active: ActiveSite;
  content: ContentBundle;
}

const signedDegrees = (t: number) => `${t < 0 ? '−' : ''}${Math.abs(Math.round(t))} °C`;

/** "14 Frostmonth 250": the date without "Year", for the phone's time bar. */
export function shortDate(day: number): string {
  const date = dateOf(day);
  return `${date.dayOfMonth} ${MONTH_NAMES[date.month]} ${date.year - 1}`;
}

/** "3 Leaf 250" for a day, as the chronicle shortens it. */
export function briefDate(day: number): string {
  const date = dateOf(day);
  return `${date.dayOfMonth} ${MONTH_NAMES[date.month]}`;
}

/** ¾, ⅔ or a percentage: a share of a meal. */
export function mealWord(share: number): string {
  if (Math.abs(share - 0.75) < 0.02) return '¾';
  if (Math.abs(share - 2 / 3) < 0.02) return '⅔';
  return `${Math.round(share * 100)}%`;
}

export interface WeatherChip {
  text: string;
  /** Takes the warning colour: the chip carries frost, dry, storm or cold. */
  warn: boolean;
  /** The warning words, in order. */
  words: string[];
}

/** The standing crop that a frost would bite: sown, growing or ripe. */
function cropAtRisk(active: ActiveSite): boolean {
  for (const b of active.buildings.values()) {
    const stage = b.crop?.stage;
    if (stage === 'sown' || stage === 'growing' || stage === 'ripe') return true;
  }
  return false;
}

/** "−7 °C · snow · cold": temperature, sky and warning words; shorter under 480 px. */
export function weatherChip({ active, content }: Ctx, narrow: boolean): WeatherChip {
  const w = active.weather;
  const crop = content.environment.crop;
  const words: string[] = [];
  if (w.lowC <= crop.frostC && cropAtRisk(active)) words.push('frost');
  const dryLimit = w.year.drought ? crop.droughtDryDays : crop.dryDays;
  const dry = w.dryDays > dryLimit;
  if (dry) words.push('dry');
  if (w.sky === 'storm') words.push('storm');
  if (w.lowC < COLD_NIGHT_C) words.push('cold');
  // A frost or a cold night is a night's reading; the chip says so.
  const night = words.includes('frost') || words.includes('cold');
  const temp = signedDegrees(night ? w.lowC : w.tempC);
  const parts = [narrow ? temp : night ? `${temp} at night` : temp];
  const sky = w.sky === 'storm' ? null : w.sky;
  if (narrow) {
    if (sky === 'snow' || sky === 'rain') parts.push(sky);
  } else if (sky && !(dry && sky === 'clear')) parts.push(sky);
  for (const word of words) {
    parts.push(word);
    if (word === 'dry' && !narrow) parts.push(`${w.dryDays} days without rain`);
  }
  return { text: parts.join(' · '), warn: words.length > 0, words };
}

// ---- the Season section ----

export interface SeasonRow {
  term: string;
  text: string;
  /** The row carries a warning (drought, hard winter, withered fields, cold homes). */
  warn?: boolean;
  /** An event the row follows from, shown as "because of ...". */
  cause?: { id: Id; word: string };
}

const plural = (n: number, one: string, many: string) => `${count(n)} ${n === 1 ? one : many}`;

/** The followed fields that withered this year, and whether all of them lie far from water. */
function witheredFields(active: ActiveSite): { n: number; allFar: boolean } {
  let n = 0;
  let far = 0;
  for (const b of active.buildings.values()) {
    const crop = b.crop;
    if (!crop?.sownThisYear || crop.stage !== 'ruined') continue;
    n += 1;
    if (!crop.nearWater) far += 1;
  }
  return { n, allFar: n > 0 && far === n };
}

/** The year's kind, the harvest so far, stores against the next harvest, firewood and the wild land. */
export function seasonRows({ world, active, content }: Ctx): SeasonRow[] {
  const env = content.environment;
  const w = active.weather;
  const rows: SeasonRow[] = [];

  // The kind of year.
  const kinds: string[] = [];
  if (w.year.drought) kinds.push('A drought year');
  if (w.year.hardWinter) kinds.push('A hard winter this year');
  const rain = `${plural(w.rainDaysThisYear, 'rain day', 'rain days')} since ${MONTH_NAMES[0]}`;
  const cause = w.year.droughtCause ?? w.year.winterCause;
  rows.push({
    term: 'This year',
    text: `${kinds.length > 0 ? kinds.join(' and ') : 'An ordinary year'}. ${rain}.`,
    warn: kinds.length > 0,
    ...(cause === undefined ? {} : { cause: { id: cause, word: 'because of' } }),
  });

  // The harvest.
  const h = harvestSoFar(active);
  const month = dateOf(world.day).month;
  let harvest: string;
  if (h.sown === 0) {
    harvest =
      month <= env.crop.sowMonths[1]
        ? `Fields bare until sowing in ${MONTH_NAMES[env.crop.sowMonths[0]]}`
        : 'Nothing was sown this year';
  } else {
    const share = active.harvest.done && active.harvest.share > 0 ? active.harvest.share : h.share;
    const lead = `About ${Math.round(share * 100)}% of a normal year`;
    const parts: string[] = [];
    if (h.cut > 0 || h.standing === 0) parts.push(`${h.cut} of ${h.sown} cut`);
    const lost = witheredFields(active);
    if (h.withered > 0) {
      const why = w.year.drought && lost.allFar ? ' (far from the river)' : '';
      parts.push(`${h.withered} withered${why}`);
    }
    if (h.standing > 0) parts.push(`${h.standing} standing`);
    harvest = `${lead}: ${parts.join(', ')}`;
  }
  rows.push({ term: 'Harvest', text: harvest, warn: h.withered > 0 });

  // Stores against the next harvest.
  const days = daysToHarvest(content, world.day);
  const foodDays = Math.round(foodDaysLeft(world, content));
  let stores: string;
  if (days === 0) stores = `≈ ${count(foodDays)} days at full meals; the harvest is being cut`;
  else if (active.mealShare < 1) {
    stores = `≈ ${count(foodDays)} days at full meals against ${count(days)} to the next harvest; meals are cut to ${mealWord(active.mealShare)}`;
  } else {
    stores = `≈ ${count(foodDays)} days at full meals against ${count(days)} to the next harvest${
      foodDays >= days ? ', so meals stay whole' : ''
    }`;
  }
  rows.push({ term: 'Stores', text: stores, warn: active.mealShare < 1 });

  // Firewood: logs against the reserve, in winters of last winter's burn.
  const fw = active.firewood;
  const logs = itemCount(active, env.firewood.item);
  let wood = `${count(logs)} logs; ${count(fw.reserve)} kept back for winter and building`;
  if (fw.lastWinter !== null && fw.lastWinter > 0) {
    const winters = logs / fw.lastWinter;
    wood += `; ${winters < 1 ? 'less than a winter' : `about ${Math.round(winters)} ${Math.round(winters) === 1 ? 'winter' : 'winters'}`} at last winter's burn`;
  }
  if (fw.coldHomes.length > 0) {
    wood += `; ${plural(fw.coldHomes.length, 'home has', 'homes have')} no logs`;
  }
  rows.push({ term: 'Firewood', text: wood, warn: fw.coldHomes.length > 0 });

  // Wild land and the woods.
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const woods = active.woods.atEmbark > 0 ? active.woods.now / active.woods.atEmbark : 1;
  rows.push({
    term: 'Wild land',
    text: `Woods in reach ${pct(woods)} of when you came · game ${pct(active.wild.game)} · berries ${pct(active.wild.berries)} · fish ${pct(active.wild.fish)}`,
    warn: active.woods.thinEvent !== null,
  });

  // Spoilage.
  const s = active.spoiled;
  rows.push({
    term: 'Spoiled',
    text: `${count(s.month)} meals this month · ${count(s.year)} this year`,
  });
  return rows;
}

/** What the cause of a cut reads as: "a poor harvest", "empty stores"; anything else by its title. */
export const CAUSE_PHRASE: Record<string, string> = {
  site_harvest_poor: 'a poor harvest',
  site_stores_empty: 'empty stores',
};

/** "Meals cut to ¾ since 1 Leaffall", with the event that cut them and the one that caused the cut. */
export function stewardLine(
  { active }: Ctx,
  eventOf: (id: Id) => { type: string; causes: readonly Id[] } | undefined,
): { text: string; cut: Id | null; because: { id: Id; phrase: string | null } | null } | null {
  if (active.mealShare >= 1 || active.shortMealsSince < 0) return null;
  const text = `Meals cut to ${mealWord(active.mealShare)} since ${briefDate(active.shortMealsSince)}`;
  const cut = active.shortMealsEvent;
  const causeId = cut === null ? undefined : eventOf(cut)?.causes[0];
  const cause = causeId === undefined ? undefined : eventOf(causeId);
  return {
    text,
    cut,
    because:
      causeId === undefined || !cause
        ? null
        : { id: causeId, phrase: CAUSE_PHRASE[cause.type] ?? null },
  };
}

// ---- person and tile lines ----

/** The water the neighbours draw from: the nearest river, lake or sea within reach of the fire, or null. */
export function fireWater(
  active: ActiveSite,
  rules: Pick<SiteRules, 'waters'>,
  reach: number,
): string | null {
  const fire = active.fire;
  if (!fire) return null;
  const { map } = active;
  const sx = fire.start % map.width;
  const sy = Math.floor(fire.start / map.width);
  let best: { d: number; name: string } | null = null;
  for (let dy = -reach; dy <= reach; dy += 1) {
    for (let dx = -reach; dx <= reach; dx += 1) {
      const x = sx + dx;
      const y = sy + dy;
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
      const kind = map.water[y * map.width + x]!;
      const d = Math.abs(dx) + Math.abs(dy);
      if (kind !== 0 && (!best || d < best.d)) {
        best = { d, name: rules.waters[kind]?.name ?? 'water' };
      }
    }
  }
  return best?.name ?? null;
}

/** The banner's line under a fire: who is fighting it and with what water. */
export function fireLine(ctx: Ctx): string | null {
  const { world, active, content } = ctx;
  const fire = active.fire;
  if (!fire) return null;
  let fighters = 0;
  for (const id of active.residents) {
    if (world.people.get(id)?.detail?.activity === 'fight') fighters += 1;
  }
  const water = fireWater(active, content.site, content.environment.fire.waterReach);
  const who =
    fighters > 0
      ? `${fighters} ${fighters === 1 ? 'neighbour is' : 'neighbours are'} fighting it`
      : 'Neighbours are running for buckets';
  return water ? `${who} with buckets from the ${water}.` : `${who}, with no water near.`;
}

/** The field's stage in words, for the tile page. */
const STAGE_WORD: Record<string, string> = {
  bare: 'bare, not sown',
  sown: 'sown, sprouting',
  growing: 'growing',
  ripe: 'ripe, ready to cut',
  cut: 'cut, stubble',
  ruined: 'withered',
};

export interface FieldFacts {
  stage: string;
  growth: string | null;
  health: string | null;
  soil: string;
  water: string;
}

/** The facts of a followed field for the tile inspector. */
export function fieldFacts(b: Building): FieldFacts | null {
  const crop = b.crop;
  if (!crop) return null;
  const sown = crop.stage === 'sown' || crop.stage === 'growing';
  const standing = sown || crop.stage === 'ripe';
  const stage =
    crop.frostBitten && sown ? `${STAGE_WORD[crop.stage]}, frost-bitten` : STAGE_WORD[crop.stage]!;
  return {
    stage,
    growth: sown ? `${Math.round(crop.growth * 100)}% grown` : null,
    health: standing ? `${Math.round(crop.health * 100)}% healthy` : null,
    soil: `${Math.round(crop.soil)} of 100`,
    water: crop.nearWater ? 'near water' : 'far from water',
  };
}

/** "badly hurt" and the like: how a beast's vigour (0-1) reads on the banner. */
function vigourWord(vigour: number): string {
  return vigour >= 0.95 ? 'unhurt' : vigour >= 0.7 ? 'wounded' : 'badly hurt';
}

/** The banner's and the site pane's line under a threat (M3.8): who stands, who is hurt, read from the live state. */
export function threatLine(ctx: Ctx): string | null {
  const { world, active } = ctx;
  const threat = active.threat;
  if (!threat) return null;
  let defending = 0;
  let sheltering = 0;
  let fleeing = 0;
  for (const id of active.residents) {
    const activity = world.people.get(id)?.detail?.activity;
    if (activity === 'defend') defending += 1;
    else if (activity === 'shelter') sheltering += 1;
    else if (activity === 'flee') fleeing += 1;
  }
  const hurt =
    threat.wounded + threat.killed > 0
      ? `${count(threat.wounded)} hurt and ${count(threat.killed)} killed so far`
      : 'no one hurt yet';
  if (threat.fled) {
    const refuge = threat.refugeId === undefined ? null : world.sites.get(threat.refugeId);
    const stayed = active.residents.length - fleeing;
    const where = refuge ? `toward ${refuge.name}` : 'away from the town';
    return `${count(fleeing)} fled ${where}${stayed > 0 ? `; ${count(stayed)} could not leave` : ''}.`;
  }
  if (threat.stage === 'warned') {
    return 'Not here yet. Work goes on while the steward keeps watch.';
  }
  const foe =
    threat.kind === 'raid'
      ? `${count(threat.count)} of ${count(threat.came)} raiders still standing`
      : `the beast is ${vigourWord(threat.vigour)}`;
  const guard = defending > 0 ? `${count(defending)} standing to arms` : 'no one standing to arms';
  const homes = sheltering > 0 ? ` · ${count(sheltering)} sheltering at home` : '';
  // Everyone is counted: those on the road or out of reach of the order are "elsewhere".
  const rest = active.residents.length - defending - sheltering - fleeing;
  const away = rest > 0 ? ` · ${count(rest)} elsewhere` : '';
  return `${guard}${homes}${away} · ${foe} · ${hurt}.`;
}
