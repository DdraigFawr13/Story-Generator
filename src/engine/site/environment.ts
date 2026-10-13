// The watched site's day outside the blocks (M3.4): at block 0 the weather is rolled, the crops
// grow, stores spoil, homes burn firewood, a fire may start, the wild land changes and the steward
// weighs the stores against the next harvest. Each piece lives in its own file (weather, crops,
// stock, fire, wild); this one only runs them in order and sets the state up.

import type { EmitInput } from '../core/context';
import { createEmitter } from '../core/context';
import { dateOf } from '../core/clock';
import type {
  ActiveSite,
  Building,
  Id,
  SimEvent,
  SiteFirewood,
  SiteHarvest,
  SiteWeather,
  WorldState,
} from '../core/types';
import type { SiteLabel } from './build';
import type { SiteContent } from './defs';
import { dailyCrops, initCrops, newHarvest } from './crops';
import { fadeBurnt, igniteDaily, type FireStart } from './fire';
import { planMeals, reportSpoilage, spoilStock, takeItem } from './stock';
import { initWeather, rollWeather, siteYear } from './weather';
import { dailyWild, initWild, initWoods } from './wild';

type Emit = (input: EmitInput) => SimEvent;

/** The emitter and label for events of the watched site, made once per site. */
export interface SiteVoice {
  emit: Emit;
  label: SiteLabel;
}
const voices = new WeakMap<ActiveSite, SiteVoice>();
export function voiceOf(world: WorldState, content: SiteContent, active: ActiveSite): SiteVoice {
  let voice = voices.get(active);
  if (!voice) {
    const site = world.sites.get(active.siteId);
    voice = {
      emit: createEmitter(world, content.eventTypes),
      label: { name: site?.name ?? '', cell: site?.cell ?? -1 },
    };
    voices.set(active, voice);
  }
  return voice;
}

/** The environment fields of a site before its first day (promote.ts fills them in with `initEnvironment`). */
export function blankEnvironment(year: number): {
  weather: SiteWeather;
  harvest: SiteHarvest;
  firewood: SiteFirewood;
  mealShare: number;
  shortMealsEvent: Id | null;
  shortMealsSince: number;
  spoiled: ActiveSite['spoiled'];
  wild: ActiveSite['wild'];
  animals: ActiveSite['animals'];
  woods: ActiveSite['woods'];
  fire: null;
  burnt: ActiveSite['burnt'];
} {
  return {
    weather: initWeather(),
    harvest: newHarvest(year),
    firewood: {
      reserve: 0,
      target: 0,
      lastWinter: null,
      winterBurn: 0,
      counting: false,
      coldHomes: [],
      lit: [],
      shortEventYear: -1,
    },
    mealShare: 1,
    shortMealsEvent: null,
    shortMealsSince: -1,
    spoiled: { month: 0, year: 0, total: 0 },
    wild: { game: 1, berries: 1, fish: 1 },
    animals: [],
    woods: { atEmbark: 0, now: 0, thinEvent: null, dirty: false, wood: new Map(), felled: [] },
    fire: null,
    burnt: [],
  };
}

/** The homes a hearth burns in: each household's living home (lodging while its own is burnt), by id. */
function occupiedHomes(active: ActiveSite): Building[] {
  const ids = new Set<Id>();
  for (const h of active.households.values()) {
    if (h.members.length === 0 || h.home === null) continue;
    const own = active.buildings.get(h.home);
    const living = own?.burnt && h.lodgingHome != null ? h.lodgingHome : h.home;
    const b = active.buildings.get(living);
    if (b && !b.burnt && b.progress === undefined) ids.add(b.id);
  }
  return [...ids].sort((a, b) => a - b).map((id) => active.buildings.get(id)!);
}

/** The steward's firewood reserve: last winter's burn (or an estimate) plus logs for building. */
function setReserve(content: SiteContent, active: ActiveSite): void {
  const rules = content.environment.firewood;
  const homes = occupiedHomes(active).length;
  const burn = active.firewood.lastWinter ?? homes * rules.expectedWinterPerHome;
  active.firewood.reserve = Math.round(burn + rules.buildingLogs);
  active.firewood.target = active.firewood.reserve + rules.headroom;
}

/** Sets up the weather, crops, stores, firewood and wild land of a site that has just been entered. */
export function initEnvironment(world: WorldState, content: SiteContent, active: ActiveSite): void {
  Object.assign(active, blankEnvironment(siteYear(world, active)));
  initCrops(world, content, active);
  initWild(world, content, active);
  active.woods = initWoods(active, content);
  setReserve(content, active);
}

/** Homes burn logs on cold days; a home without logs goes cold. Counts the winter's burn. */
function burnFirewood(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  emit: Emit,
  label: SiteLabel,
): void {
  const rules = content.environment.firewood;
  const fw = active.firewood;
  const date = dateOf(world.day);
  const [winterFrom, winterTo] = rules.winterMonths;
  if (date.month === winterFrom && date.dayOfMonth === 1) {
    if (fw.counting) fw.lastWinter = Math.round(fw.winterBurn);
    fw.winterBurn = 0;
    fw.counting = true;
    setReserve(content, active);
  }
  fw.coldHomes = [];
  fw.lit = [];
  const temp = active.weather.tempC;
  if (temp >= rules.burnBelowC) return;
  const need = ((rules.burnBelowC - temp) / rules.burnBelowC) * rules.logsPerHomeDay;
  let burned = 0;
  for (const b of occupiedHomes(active)) {
    const got = takeItem(active, rules.item, need);
    burned += got;
    if (got + 1e-9 < need) fw.coldHomes.push(b.id);
    else fw.lit.push(b.id);
  }
  if (fw.counting && date.month >= winterFrom && date.month <= winterTo) fw.winterBurn += burned;
  const year = siteYear(world, active);
  if (fw.coldHomes.length > 0 && fw.shortEventYear !== year) {
    fw.shortEventYear = year;
    emit({
      type: content.environment.events.firewoodShort,
      place: label.cell,
      data: { site: label.name, count: fw.coldHomes.length },
    });
  }
}

/** What the day's environment step produced that the blocks need to act on. */
export interface DayResult {
  /** A fire that began today: witnesses remember it. */
  fire: FireStart | null;
  /** A harvest was brought in today. */
  harvested: boolean;
}

/**
 * Runs the day's environment in order: weather, crops, spoilage, firewood, fire, wild land, meals.
 * Call once at block 0 before the steward and before the block's profiles are looked up.
 */
export function runEnvironmentDay(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
): DayResult {
  const { emit, label } = voiceOf(world, content, active);
  rollWeather(world, content, active, emit, label);
  const harvested = dailyCrops(world, content, active, emit, label);
  spoilStock(active, content, active.weather.tempC);
  reportSpoilage(content, active, emit, label, world.day);
  burnFirewood(world, content, active, emit, label);
  const fire = igniteDaily(world, content, active, emit, label);
  dailyWild(world, content, active, emit, label);
  planMeals(world, content, active, emit, label);
  fadeBurnt(content, active, world.day);
  return { fire, harvested };
}
