import { afterEach, expect, it, vi } from 'vitest';
import { BOOKMARK_KEY, readBookmarks, writeBookmarks } from '../../src/adapters/reader-bookmarks';
import {
  bookmarkIdentity,
  bookmarkEntries,
  bookmarkWorldKey,
  loadBookmarks,
  saveBookmarks,
} from '../../src/controller/bookmarks';
import { createLivingSettlement } from '../../src/sim/living-initial';
import { advanceLivingSettlement } from '../../src/sim/living';
import { createSettlement } from '../../src/sim/settlement-initial';
import { canonicalJson } from '../../src/sim/canonical';

function storage() {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  return values;
}
afterEach(() => vi.unstubAllGlobals());

it('keeps passive resident and household bookmarks outside complete worlds and continuations', () => {
  const values = storage();
  const world = createLivingSettlement('RIVERSIDE');
  const before = canonicalJson(world);
  const resident = bookmarkIdentity(world, { kind: 'resident', id: 17 })!;
  const household = bookmarkIdentity(world, { kind: 'household', id: 11 })!;
  expect(saveBookmarks(world, [resident, household])).toBe(true);
  expect(loadBookmarks(world).subjects).toEqual([resident, household]);
  expect(bookmarkEntries(world, [resident, household]).map((item) => item.label)).toEqual([
    'Rian Hazel',
    'Hazel household',
  ]);
  expect(canonicalJson(world)).toBe(before);
  const continued = advanceLivingSettlement(world, 12).state;
  expect(canonicalJson(continued)).toBe(
    canonicalJson(advanceLivingSettlement(createLivingSettlement('RIVERSIDE'), 12).state),
  );
  expect(loadBookmarks(continued).subjects).toEqual([resident, household]);
  expect([...values.keys()]).toEqual([BOOKMARK_KEY]);
  expect(bookmarkIdentity(world, { kind: 'resident', id: 999 })).toBeNull();
  expect(bookmarkIdentity(createSettlement('RIVERSIDE'), { kind: 'resident', id: 17 })).toBeNull();
});

it('isolates versions and seeds and refuses to open missing or mismatched historic identities', () => {
  storage();
  const world = createLivingSettlement('RIVERSIDE');
  const resident = bookmarkIdentity(world, { kind: 'resident', id: 17 })!;
  saveBookmarks(world, [resident]);
  expect(loadBookmarks(createLivingSettlement('OTHER')).subjects).toEqual([]);
  expect(bookmarkWorldKey(world)).not.toBe(bookmarkWorldKey(createSettlement('RIVERSIDE')));
  const unknown = { ...resident, id: 999 };
  const changed = { ...resident, origin: 'a different founding identity' };
  expect(bookmarkEntries(world, [unknown, changed]).map((item) => item.available)).toEqual([
    false,
    false,
  ]);
  expect(bookmarkEntries(world, [unknown])[0]!.label).toBe('Resident #999');
});

it('rejects damaged or oversized preferences and can replace them without touching saves', () => {
  const values = storage();
  for (const value of [
    '{broken',
    'null',
    JSON.stringify({ schema: 2, worlds: [] }),
    JSON.stringify({
      schema: 1,
      worlds: [{ key: 'world', subjects: [{ kind: 'resident', id: 0, origin: '' }] }],
    }),
    'x'.repeat(262145),
  ]) {
    values.set(BOOKMARK_KEY, value);
    expect(readBookmarks('world')).toEqual({ subjects: [], available: true });
    expect(writeBookmarks('world', [{ kind: 'resident', id: 17, origin: 'recorded' }])).toBe(true);
    expect(readBookmarks('world').subjects).toHaveLength(1);
  }
});

it('bounds shortcuts and recent seed histories without allowing duplicate or malformed identities', () => {
  storage();
  const subjects = Array.from({ length: 32 }, (_, index) => ({
    kind: 'resident' as const,
    id: index + 1,
    origin: 'recorded',
  }));
  expect(writeBookmarks('first', subjects)).toBe(true);
  expect(
    writeBookmarks('first', [...subjects, { kind: 'household', id: 99, origin: 'recorded' }]),
  ).toBe(false);
  expect(readBookmarks('first').subjects).toEqual(subjects);
  expect(writeBookmarks('first', [subjects[0]!, subjects[0]!])).toBe(false);
  for (let index = 0; index < 16; index++)
    expect(writeBookmarks(`seed-${index}`, [subjects[0]!])).toBe(true);
  expect(readBookmarks('first').subjects).toEqual([]);
  expect(readBookmarks('seed-0').subjects).toHaveLength(1);
  expect(writeBookmarks('seed-0', [])).toBe(true);
  expect(readBookmarks('seed-0').subjects).toEqual([]);
});

it('reports denied reads and failed writes without throwing or claiming persistence', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('quota');
    },
  });
  expect(readBookmarks('world')).toEqual({ subjects: [], available: false });
  expect(writeBookmarks('world', [])).toBe(false);
  const values = storage();
  writeBookmarks('world', [{ kind: 'resident', id: 17, origin: 'recorded' }]);
  const old = values.get(BOOKMARK_KEY);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: () => {
      throw new Error('quota');
    },
  });
  expect(writeBookmarks('world', [])).toBe(false);
  expect(values.get(BOOKMARK_KEY)).toBe(old);
});
