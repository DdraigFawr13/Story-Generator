import type { WorldSnapshot } from '../sim/world';
import { isIndividualWorld } from '../sim/world';
import type { Immutable } from '../sim/immutable';
import type { LivingResident } from '../sim/living-state';
import type { SettlementEvent } from '../sim/state';

type Person = Immutable<LivingResident>;
export type LineageDirection = 'ancestors' | 'descendants';
export interface LineageEntry {
  person: Person;
  generation: number;
  parent: Person;
  child: Person;
  birth: Immutable<SettlementEvent>;
}
export const LINEAGE_PAGE_SIZE = 32;

export function lineageLabel(direction: LineageDirection, generation: number) {
  if (generation === 1) return direction === 'ancestors' ? 'Known parent' : 'Known child';
  if (generation === 2) return direction === 'ancestors' ? 'Known grandparent' : 'Known grandchild';
  return `${direction === 'ancestors' ? 'Ancestor' : 'Descendant'} · ${generation} generations ${direction === 'ancestors' ? 'earlier' : 'later'}`;
}

/** Only retained parent IDs establish a path; names and household membership do not. */
export function residentLineage(world: WorldSnapshot, id: number) {
  if (!isIndividualWorld(world)) return null;
  const people = new Map(world.world.residents.map((person) => [person.id, person]));
  const subject = people.get(id);
  if (!subject) return null;
  const children = new Map<number, Person[]>();
  for (const person of world.world.residents) {
    for (const parentId of person.parentIds) {
      const rows = children.get(parentId) ?? [];
      rows.push(person);
      children.set(parentId, rows);
    }
  }
  function collect(direction: LineageDirection) {
    const queue = [{ person: subject!, generation: 0 }];
    const seen = new Set([id]);
    const entries: LineageEntry[] = [];
    for (let index = 0; index < queue.length; index++) {
      const current = queue[index]!;
      const relatives =
        direction === 'ancestors'
          ? current.person.parentIds.map((parentId) => people.get(parentId)!)
          : (children.get(current.person.id) ?? []);
      for (const person of relatives) {
        if (seen.has(person.id)) continue;
        seen.add(person.id);
        const child = direction === 'ancestors' ? current.person : person;
        const parent = direction === 'ancestors' ? person : current.person;
        const generation = current.generation + 1;
        entries.push({
          person,
          generation,
          parent,
          child,
          birth: world.events[child.birthEventId! - 1]!,
        });
        queue.push({ person, generation });
      }
    }
    return entries.sort((a, b) => a.generation - b.generation || a.person.id - b.person.id);
  }
  return { subject, ancestors: collect('ancestors'), descendants: collect('descendants') };
}
