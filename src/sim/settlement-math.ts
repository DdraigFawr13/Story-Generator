import { SETTLEMENT_CONFIG, type SettlementEconomy } from './settlement-config';
import type { Building, HarvestField, SettlementSnapshot, WeatherKind } from './state';
import type { Immutable } from './immutable';

const E = SETTLEMENT_CONFIG.economy;
export function shelter(buildings: readonly Immutable<Building>[]): number {
  return buildings.filter((b) => b.kind === 'hut').length * SETTLEMENT_CONFIG.hutCapacity;
}
export function foodCapacity(buildings: readonly Immutable<Building>[]): number {
  return (
    SETTLEMENT_CONFIG.baseFoodCapacity +
    buildings.filter((b) => b.kind === 'store').length * SETTLEMENT_CONFIG.storeCapacity
  );
}
export function inWorkRadius(tile: number, center: number): boolean {
  const width = SETTLEMENT_CONFIG.terrain.width;
  return (
    Math.abs((tile % width) - (center % width)) +
      Math.abs(Math.floor(tile / width) - Math.floor(center / width)) <=
    SETTLEMENT_CONFIG.workRadius
  );
}
export function weatherKind(draw: number, economy: SettlementEconomy = E): WeatherKind {
  return draw < economy.droughtCutoff ? 'drought' : draw < economy.wetCutoff ? 'normal' : 'wet';
}
export function fieldYield(
  field: Pick<HarvestField, 'fertility' | 'tendedWeeks'>,
  weatherMultiplier: number,
  seasonIndex: number,
  economy: SettlementEconomy = E,
): number {
  return Math.floor(
    (economy.harvestBase *
      field.fertility *
      weatherMultiplier *
      economy.seasonMultipliers[seasonIndex]! *
      field.tendedWeeks) /
      (economy.fertilityScale *
        economy.multiplierScale *
        economy.multiplierScale *
        SETTLEMENT_CONFIG.weeksPerSeason),
  );
}
export function rationHealth(
  population: number,
  health: number,
  deficit: number,
  housing: number,
): number {
  if (population === 0) return 0;
  const unhoused = Math.max(0, population - housing);
  const change =
    deficit === 0 && unhoused === 0
      ? E.healthRecovery
      : -Math.ceil((E.deficitHealthPenalty * deficit) / population) -
        Math.ceil((E.housingHealthPenalty * unhoused) / population);
  return Math.max(0, Math.min(100, health + change));
}
export function settlementTotals(state: SettlementSnapshot) {
  const settlement = state.world.settlement;
  return {
    population: settlement.population,
    food: settlement.food,
    timber: settlement.timber,
    health: settlement.health,
    shelter: shelter(state.world.buildings),
    capacity: foodCapacity(state.world.buildings),
    escrow: state.world.project?.escrow ?? 0,
  };
}

export function workforce(population: number, economy: SettlementEconomy): number {
  const usual = Math.floor(population / economy.workerDivisor);
  return 'recovery' in economy
    ? Math.min(population, Math.max(economy.recovery.minimumWorkforce, usual))
    : usual;
}
export function protectedForagers(
  population: number,
  food: number,
  economy: SettlementEconomy,
): number {
  return 'recovery' in economy && population > 0 && food < population * economy.recovery.foodWeeks
    ? Math.min(workforce(population, economy), economy.recovery.protectedForagers)
    : 0;
}
