import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import {
  buildLegendIndex,
  eventYear,
  generateWorld,
  type SimEvent,
  type WorldState,
} from '../../src/engine';
import {
  bodyIds,
  booksOf,
  chapterAt,
  chapterOfEvent,
  chaptersOf,
  cropBox,
  eraEvents,
  paragraphsOf,
  pickBook,
  roman,
  summaryOf,
} from '../../src/app/book/data';

let shared: WorldState | undefined;
/** One 64x64, 250-year world (S2: several peoples, wars). */
const base = () =>
  (shared ??= generateWorld('S2', { width: 64, height: 64, historyYears: 250 }, DEFAULT_CONTENT));

describe('book chapters', () => {
  it('lists every realm, largest first, and covers its years without gaps', () => {
    const world = base();
    const index = buildLegendIndex(world, DEFAULT_CONTENT);
    const books = booksOf(world, index);
    expect(books.length).toBe(world.civs.size);
    for (let k = 1; k < books.length; k += 1) {
      expect(books[k]!.size).toBeLessThanOrEqual(books[k - 1]!.size);
    }
    for (const book of books) {
      const chapters = chaptersOf(world, index, DEFAULT_CONTENT, book.civId);
      expect(chapters.length).toBeGreaterThan(0);
      expect(chapters[0]!.from).toBe(book.from);
      expect(chapters[chapters.length - 1]!.to).toBe(book.to);
      chapters.forEach((c, k) => {
        expect(c.n).toBe(k + 1);
        if (k > 0) expect(c.from).toBe(chapters[k - 1]!.to + 1);
      });
      // Every year of the book falls in exactly one chapter.
      for (let y = book.from; y <= book.to; y += 1) {
        expect(chapterAt(chapters, y)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('finds the chapter of every key event, and of an event the Tales card names', () => {
    const world = base();
    const index = buildLegendIndex(world, DEFAULT_CONTENT);
    const books = booksOf(world, index);
    for (const book of books) {
      const chapters = chaptersOf(world, index, DEFAULT_CONTENT, book.civId);
      chapters.forEach((c, k) => {
        for (const id of c.keyEvents) {
          const event = index.event(id)!;
          expect(chapterAt(chapters, eventYear(event))).toBe(k);
          const found = chapterOfEvent(world, index, DEFAULT_CONTENT, event, books);
          expect(found).toBeDefined();
          expect(found!.ch).toBe(
            chapterAt(chaptersOf(world, index, DEFAULT_CONTENT, found!.civId), eventYear(event)),
          );
        }
      });
    }
  });

  it('prints key events plus the one asked for, grouped by year', () => {
    const world = base();
    const index = buildLegendIndex(world, DEFAULT_CONTENT);
    const book = booksOf(world, index)[0]!;
    const chapter = chaptersOf(world, index, DEFAULT_CONTENT, book.civId)[0]!;
    const inside = eraEvents(index, book.civId, chapter.from, chapter.to).find(
      (e) => !chapter.keyEvents.includes(e.id),
    );
    const plain = bodyIds(index, chapter, null);
    expect(plain).toEqual([...chapter.keyEvents].sort((a, b) => a - b));
    if (inside) expect(bodyIds(index, chapter, inside.id)).toContain(inside.id);
    const paragraphs = paragraphsOf(plain.flatMap((id) => index.event(id) ?? []));
    expect(paragraphs.flatMap((p) => p.ids)).toEqual(plain);
    for (const p of paragraphs) {
      for (const id of p.ids) expect(eventYear(index.event(id)!)).toBe(p.year);
    }
    for (let k = 1; k < paragraphs.length; k += 1) {
      expect(paragraphs[k]!.year).not.toBe(paragraphs[k - 1]!.year);
    }
  });
});

describe('book summary', () => {
  const ev = (type: string, year: number): SimEvent =>
    ({
      id: year,
      day: year * 336,
      type,
      importance: 5,
      actors: [],
      place: null,
      causes: [],
      data: {},
    }) as SimEvent;

  it('counts wars, rulers and notable deaths of the events it is given, and nothing else', () => {
    const line = summaryOf(10, 40, [
      ev('war_declared', 11),
      ev('war_declared', 20),
      ev('ruler_succeeded', 12),
      ev('notable_died', 13),
      ev('battle', 14),
      ev('site_founded', 15),
    ]);
    expect(line).toBe('Years 10 to 40. 2 wars, 1 ruler on the seat and 1 notable dead on record.');
    expect(summaryOf(1, 2, [ev('battle', 1)])).toBe(
      'Years 1 to 2. No war, no new ruler and no notable death is recorded.',
    );
  });

  it('matches the record of each real era', () => {
    const world = base();
    const index = buildLegendIndex(world, DEFAULT_CONTENT);
    const book = booksOf(world, index)[0]!;
    for (const c of chaptersOf(world, index, DEFAULT_CONTENT, book.civId)) {
      const events = eraEvents(index, book.civId, c.from, c.to);
      for (const e of events) {
        expect(eventYear(e)).toBeGreaterThanOrEqual(c.from);
        expect(eventYear(e)).toBeLessThanOrEqual(c.to);
      }
      const wars = events.filter((e) => e.type === 'war_declared').length;
      const line = summaryOf(c.from, c.to, events);
      expect(line.includes('war')).toBe(wars > 0);
      if (wars > 0) expect(line).toContain(`${wars} war`);
    }
  });
});

describe('book helpers', () => {
  it('writes chapter numbers in roman numerals', () => {
    expect([1, 4, 9, 14, 20].map(roman)).toEqual(['I', 'IV', 'IX', 'XIV', 'XX']);
  });
  it('opens the last book read if it exists, else the largest', () => {
    const books = [
      { civId: 3, title: 'a', from: 0, to: 9, size: 5 },
      { civId: 7, title: 'b', from: 0, to: 9, size: 1 },
    ];
    expect(pickBook(books, 7)).toBe(7);
    expect(pickBook(books, 99)).toBe(3);
    expect(pickBook(books, null)).toBe(3);
    expect(pickBook([], null)).toBeUndefined();
  });
  it('crops around places, at least the minimum size and inside the world', () => {
    const box = cropBox([5 * 64 + 5], 64, 64, { w: 30, h: 20 }, 4);
    expect(box.x1 - box.x0).toBe(30);
    expect(box.y1 - box.y0).toBe(20);
    expect(box.x0).toBeGreaterThanOrEqual(0);
    expect(box.y0).toBeGreaterThanOrEqual(0);
    const far = cropBox([60 * 64 + 60, 10 * 64 + 12], 64, 64, { w: 30, h: 20 }, 4);
    expect(far.x1).toBeLessThanOrEqual(64);
    expect(far.y1).toBeLessThanOrEqual(64);
    expect(far.x0).toBeLessThanOrEqual(12);
    expect(far.y1).toBeGreaterThanOrEqual(61);
  });
});
