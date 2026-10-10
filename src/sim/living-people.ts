import type { Immutable } from './immutable';
import { LIVING_CONFIG } from './living-config';
import type { LivingResident, LivingSettlementSnapshot, PersonLedger } from './living-state';
import { worldResidentAgeWeeks } from './resident-world';
import { workforce } from './settlement-math';

const R = LIVING_CONFIG.residents.life;

export function livingPeople(state: LivingSettlementSnapshot): Immutable<LivingResident>[] {
  return state.world.residents.filter((resident) => resident.deathEventId === null);
}

export function eligibleWorker(
  resident: Immutable<LivingResident>,
  tick: number,
  health = resident.health,
) {
  const age = worldResidentAgeWeeks(resident, tick);
  return age >= R.adultAgeWeeks && age < R.seniorAgeWeeks && health >= R.workerHealth;
}

export function planPersonWeek(state: LivingSettlementSnapshot): PersonLedger {
  const people = livingPeople(state);
  const candidates = people.filter((resident) => eligibleWorker(resident, state.tick + 1));
  const caretakers: PersonLedger['caretakers'] = [];
  for (const household of state.world.households) {
    const children = people.filter(
      (resident) =>
        resident.householdId === household.id &&
        worldResidentAgeWeeks(resident, state.tick + 1) < R.dependentAgeWeeks,
    );
    if (!children.length) continue;
    const adults = candidates.filter((resident) => resident.householdId === household.id);
    const caregiver =
      adults.find((adult) => children.some((child) => child.parentIds.includes(adult.id))) ??
      adults[0];
    if (caregiver)
      caretakers.push({ id: caregiver.id, childIds: children.map((child) => child.id) });
  }
  const caregiving = new Set(caretakers.map((caregiver) => caregiver.id));
  const workers = candidates
    .filter((resident) => !caregiving.has(resident.id))
    .slice(0, workforce(people.length, state.config.settlement.economy))
    .map((resident) => resident.id);
  return {
    openingIds: people.map((resident) => resident.id),
    caretakers,
    workers,
    health: [],
    deathTrials: [],
    birthTrials: [],
  };
}

export function individualHealth(
  before: number,
  ration: boolean,
  housed: boolean,
  unattended: boolean,
): number {
  const change = ration && housed ? 2 : (ration ? 0 : -20) + (housed ? 0 : -5);
  return Math.max(0, Math.min(100, before + change - (unattended ? R.careHealthPenalty : 0)));
}

export function meanHealth(people: readonly Immutable<LivingResident>[]): number {
  return people.length
    ? Math.floor(people.reduce((total, resident) => total + resident.health, 0) / people.length)
    : 0;
}

export function individualDeathThreshold(ageWeeks: number, health: number): number {
  const E = LIVING_CONFIG.settlement.economy;
  return ageWeeks >= R.maximumAgeWeeks
    ? E.demographicRange
    : Math.min(
        E.demographicRange,
        E.baseDeathThreshold +
          Math.floor((100 - health) / E.deathHealthDivisor) +
          R.ageDeathThresholdPerYear * Math.max(0, Math.floor(ageWeeks / 48) - 60),
      );
}

export function eligibleParent(resident: Immutable<LivingResident>, tick: number): boolean {
  const age = worldResidentAgeWeeks(resident, tick);
  return (
    resident.deathEventId === null &&
    age >= R.adultAgeWeeks &&
    age < R.birthMaxAgeWeeks &&
    resident.health >= LIVING_CONFIG.settlement.economy.birthHealth &&
    (resident.lastBirthTick === null || tick - resident.lastBirthTick >= R.birthIntervalWeeks)
  );
}
