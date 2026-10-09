import { SETTLEMENT_CONFIG } from './settlement-config';
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
export function weatherKind(draw: number): WeatherKind {
  return draw < E.droughtCutoff ? 'drought' : draw < E.wetCutoff ? 'normal' : 'wet';
}
export function fieldYield(
  field: Pick<HarvestField, 'fertility' | 'tendedWeeks'>,
  weatherMultiplier: number,
  seasonIndex: number,
): number {
  return Math.floor(
    (E.harvestBase *
      field.fertility *
      weatherMultiplier *
      E.seasonMultipliers[seasonIndex]! *
      field.tendedWeeks) /
      (E.fertilityScale * E.multiplierScale * E.multiplierScale * SETTLEMENT_CONFIG.weeksPerSeason),
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
