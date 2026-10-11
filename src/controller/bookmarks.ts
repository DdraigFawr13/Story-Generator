import {
  readBookmarks,
  writeBookmarks,
  BOOKMARK_LIMIT,
  type ReadingBookmark,
} from '../adapters/reader-bookmarks';
export { watchBookmarks } from '../adapters/reader-bookmarks';
import { isIndividualWorld, type WorldSnapshot } from '../sim/world';
import { residentName } from './residents';

export type BookmarkSubject = { kind: 'resident' | 'household'; id: number };
export function bookmarkWorldKey(world: WorldSnapshot): string {
  return JSON.stringify([world.simulationVersion, world.seed]);
}
export function bookmarkIdentity(
  world: WorldSnapshot,
  subject: BookmarkSubject,
): ReadingBookmark | null {
  if (!isIndividualWorld(world)) return null;
  if (subject.kind === 'resident') {
    const person = world.world.residents.find((item) => item.id === subject.id);
    return person
      ? {
          ...subject,
          origin: JSON.stringify([
            person.creationEventId,
            person.entryTick,
            person.ageWeeksAtEntry,
            person.givenName,
            person.householdName,
          ]),
        }
      : null;
  }
  const household = world.world.households.find((item) => item.id === subject.id);
  return household
    ? { ...subject, origin: JSON.stringify([household.creationEventId, household.name]) }
    : null;
}
export function bookmarkEntries(world: WorldSnapshot, subjects: readonly ReadingBookmark[]) {
  return subjects.map((subject) => {
    const current = bookmarkIdentity(world, subject);
    const available = current?.origin === subject.origin;
    const label =
      available && isIndividualWorld(world)
        ? subject.kind === 'resident'
          ? residentName(world.world.residents.find((person) => person.id === subject.id)!)
          : `${world.world.households.find((household) => household.id === subject.id)!.name} household`
        : `${subject.kind === 'resident' ? 'Resident' : 'Household'} #${subject.id}`;
    return { ...subject, available, label };
  });
}
export function loadBookmarks(world: WorldSnapshot) {
  return readBookmarks(bookmarkWorldKey(world));
}
export function saveBookmarks(world: WorldSnapshot, subjects: ReadingBookmark[]) {
  return writeBookmarks(bookmarkWorldKey(world), subjects);
}
export { BOOKMARK_LIMIT };
export type { ReadingBookmark };
