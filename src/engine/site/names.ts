// Display names for residents (M3.1): given names are unique among non-notables, but a notable
// or a chance repeat can share one, so sharers get a patronym or "the elder / the younger".

import type { Household, Id, WorldState } from '../core/types';

/** Cultures whose patronym is a suffix ("Hrolf Gunnarsson"); others use "of {father}". */
const SUFFIX_PATRONYMS: Record<string, [son: string, daughter: string]> = {
  skarn: ['sson', 'sdottir'],
};
const ORDINALS = ['second', 'third', 'fourth', 'fifth', 'sixth'];

export function residentNames(world: WorldState, ids: readonly Id[]): Map<Id, string> {
  const sorted = [...ids].sort((a, b) => a - b);
  const byName = new Map<string, Id[]>();
  for (const id of sorted) {
    const person = world.people.get(id);
    if (!person) continue;
    byName.set(person.name, [...(byName.get(person.name) ?? []), id]);
  }
  const out = new Map<Id, string>();
  for (const [name, list] of byName) {
    if (list.length === 1) {
      out.set(list[0]!, name);
      continue;
    }
    const left: Id[] = [];
    for (const id of list) {
      const person = world.people.get(id)!;
      const father = person.family.parents
        .map((p) => world.people.get(p))
        .find((p) => p && p.sex === 'm');
      if (!father) {
        left.push(id);
        continue;
      }
      const suffix = SUFFIX_PATRONYMS[person.cultureId ?? ''];
      out.set(
        id,
        suffix
          ? `${name} ${father.name}${person.sex === 'f' ? suffix[1] : suffix[0]}`
          : `${name} of ${father.name}`,
      );
    }
    // The rest are told apart by age, eldest first.
    left.sort((a, b) => world.people.get(a)!.born - world.people.get(b)!.born || a - b);
    left.forEach((id, i) => {
      const label =
        left.length === 1
          ? name
          : `${name} the ${i === 0 ? 'elder' : i === left.length - 1 ? 'younger' : (ORDINALS[i - 1] ?? `no. ${i + 1}`)}`;
      out.set(id, label);
    });
    // Anything still repeated (two children of one father) gets a number.
    const seen = new Map<string, number>();
    for (const id of list) {
      const label = out.get(id)!;
      const n = (seen.get(label) ?? 0) + 1;
      seen.set(label, n);
      if (n > 1) out.set(id, `${label} (${n})`);
    }
  }
  return out;
}

/** "A and B's household", "A, who lives alone" or "A's household". */
export function householdLabel(
  world: WorldState,
  household: Household,
  names: ReadonlyMap<Id, string>,
): string {
  const nameOf = (id: Id) => names.get(id) ?? world.people.get(id)?.name ?? `#${id}`;
  const head = world.people.get(household.head);
  if (household.members.length === 1) return `${nameOf(household.head)}, who lives alone`;
  const spouse = household.members.find(
    (id) => id !== household.head && head?.family.spouses.includes(id),
  );
  return spouse !== undefined
    ? `${nameOf(household.head)} and ${nameOf(spouse)}'s household`
    : `${nameOf(household.head)}'s household`;
}
