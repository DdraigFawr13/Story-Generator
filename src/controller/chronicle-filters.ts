import { isIndividualWorld, type WorldSnapshot } from '../sim/world';
import type { SettlementEvent } from './chronicle';

export interface ChronicleFilters {
  personId: number | null;
  householdId: number | null;
  category: SettlementEvent['type'] | 'all';
  importance: SettlementEvent['importance'] | 'all';
}
export const ALL_RECORDS: Readonly<ChronicleFilters> = Object.freeze({
  personId: null,
  householdId: null,
  category: 'all',
  importance: 'all',
});
export function categoryLabel(category: string) {
  return category.replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
}
/** Filters the actual retained archive. Direct lookup and causes remain outside this projection. */
export function filterChronicle(world: WorldSnapshot, filters: Readonly<ChronicleFilters>) {
  let householdMembers: Set<number> | null = null;
  if (filters.personId !== null || filters.householdId !== null) {
    if (!isIndividualWorld(world)) return [];
    if (
      filters.personId !== null &&
      !world.world.residents.some((person) => person.id === filters.personId)
    )
      return [];
    if (filters.householdId !== null) {
      if (!world.world.households.some((household) => household.id === filters.householdId))
        return [];
      householdMembers = new Set(
        world.world.residents
          .filter((person) => person.householdId === filters.householdId)
          .map((person) => person.id),
      );
    }
  }
  return world.events.filter(
    (event) =>
      (filters.category === 'all' || event.type === filters.category) &&
      (filters.importance === 'all' || event.importance === filters.importance) &&
      (filters.personId === null || event.entityIds.includes(filters.personId)) &&
      (householdMembers === null ||
        event.entityIds.some((id) => householdMembers.has(id)) ||
        event.entityIds.includes(filters.householdId!)),
  );
}
