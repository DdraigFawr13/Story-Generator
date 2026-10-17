import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import {
  buildLegendIndex,
  eventYear,
  generateWorld,
  templateNarrator,
  type SimEvent,
  type WorldState,
} from '../../src/engine';
import {
  bodyIds,
  booksOf,
  chapterAt,
  chapterOfEvent,
  chaptersOf,
  BODY_WORDS,
  cropBox,
  dropCapFits,
  eraEvents,
  fitBox,
  lifeSpanText,
  paragraphsOf,
  perilsOf,
  pickBook,
  roman,
  siteInYear,
  stripYear,
  summaryOf,
  wordCount,
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

  const narrator = (world: WorldState) =>
    templateNarrator(
      DEFAULT_CONTENT,
      (id) => world.people.get(id)?.name ?? world.sites.get(id)?.name ?? `#${id}`,
    );

  it('prints the highlighted event and groups events by year', () => {
    const world = base();
    const index = buildLegendIndex(world, DEFAULT_CONTENT);
    const say = narrator(world);
    const lineOf = (e: SimEvent) => stripYear(say.renderEvent(e), eventYear(e));
    const book = booksOf(world, index)[0]!;
    const chapter = chaptersOf(world, index, DEFAULT_CONTENT, book.civId)[0]!;
    const events = eraEvents(index, book.civId, chapter.from, chapter.to);
    const inside = events.find((e) => !chapter.keyEvents.includes(e.id));
    const options = { lineOf, famous: () => false };
    const plain = bodyIds(index, chapter, events, null, options);
    if (inside) expect(bodyIds(index, chapter, events, inside.id, options)).toContain(inside.id);
    const paragraphs = paragraphsOf(plain.flatMap((id) => index.event(id) ?? []));
    expect(paragraphs.flatMap((p) => p.ids)).toEqual(plain);
    for (const p of paragraphs) {
      for (const id of p.ids) expect(eventYear(index.event(id)!)).toBe(p.year);
    }
    for (let k = 1; k < paragraphs.length; k += 1) {
      expect(paragraphs[k]!.year).toBeGreaterThan(paragraphs[k - 1]!.year);
    }
  });

  it('draws a long era from all its events, within the word budget, never short of its key events', () => {
    const world = base();
    const index = buildLegendIndex(world, DEFAULT_CONTENT);
    const say = narrator(world);
    const lineOf = (e: SimEvent) => stripYear(say.renderEvent(e), eventYear(e));
    const options = { lineOf, famous: () => false };
    let fuller = 0;
    for (const book of booksOf(world, index)) {
      for (const chapter of chaptersOf(world, index, DEFAULT_CONTENT, book.civId)) {
        const events = eraEvents(index, book.civId, chapter.from, chapter.to);
        const ids = bodyIds(index, chapter, events, null, options);
        const words = ids.reduce((sum, id) => sum + wordCount(lineOf(index.event(id)!)), 0);
        expect(words).toBeLessThanOrEqual(BODY_WORDS.max);
        // Every key event that fits stays; the page runs to at least the least, if the era has it.
        const keyOnly = paragraphsOf(chapter.keyEvents.flatMap((id) => index.event(id) ?? []));
        const all = paragraphsOf(ids.flatMap((id) => index.event(id) ?? []));
        expect(all.length).toBeGreaterThanOrEqual(Math.min(keyOnly.length, 1));
        if (all.length > keyOnly.length) fuller += 1;
        const pool = events.reduce((sum, e) => sum + wordCount(lineOf(e)), 0);
        if (pool >= BODY_WORDS.min) expect(words).toBeGreaterThanOrEqual(BODY_WORDS.min - 40);
        expect(ids).toEqual(
          [...ids].sort((a, b) => index.event(a)!.day - index.event(b)!.day || a - b),
        );
      }
    }
    expect(fuller).toBeGreaterThan(0);
  });

  it('takes rulers, then wars, then famous deaths, then the rest, as the budget allows', () => {
    const world = base();
    const index = buildLegendIndex(world, DEFAULT_CONTENT);
    const book = booksOf(world, index)[0]!;
    const chapter = { ...chaptersOf(world, index, DEFAULT_CONTENT, book.civId)[0]!, keyEvents: [] };
    const events = eraEvents(index, book.civId, 0, 250);
    // Each line is 40 words, so 150 words stops after four events.
    const lineOf = () => 'word '.repeat(40).trim();
    const rank = (type: string) =>
      type === 'ruler_succeeded'
        ? 1
        : ['war_declared', 'peace_made', 'battle'].includes(type)
          ? 2
          : 4;
    const ids = bodyIds(index, { ...chapter, from: 0, to: 250 }, events, null, {
      lineOf,
      famous: () => false,
    });
    expect(ids.length).toBe(4);
    const kept = ids.map((id) => rank(index.event(id)!.type));
    const pool = events.filter((e) => e.type !== 'year_summary').map((e) => rank(e.type));
    const best = [...pool].sort((a, b) => a - b).slice(0, 4);
    expect(kept.sort((a, b) => a - b)).toEqual(best);
  });
});

describe('book text', () => {
  it("strips only the paragraph's own year, in its leading, bracketed and trailing forms", () => {
    expect(stripYear('In Year 5 Gwened died.', 5)).toBe('Gwened died.');
    expect(stripYear('In Year 5, Gwened died.', 5)).toBe('Gwened died.');
    expect(stripYear('Year 5: the harvest failed.', 5)).toBe('The harvest failed.');
    expect(stripYear('Nantgad became their village (Year 34).', 34)).toBe(
      'Nantgad became their village.',
    );
    expect(stripYear('Gwened died at Nantgad in Year 5.', 5)).toBe('Gwened died at Nantgad.');
    expect(stripYear('Gwened died in Year 5, aged 40.', 5)).toBe('Gwened died, aged 40.');
    // Another year, a longer year and a mid-sentence "in Year" that is not the label's stay.
    expect(stripYear('In Year 6 Gwened died.', 5)).toBe('In Year 6 Gwened died.');
    expect(stripYear('Gwened died in Year 50.', 5)).toBe('Gwened died in Year 50.');
    expect(stripYear('Peace came (Year 12).', 5)).toBe('Peace came (Year 12).');
    expect(stripYear('In Year \u22123 a star fell.', -3)).toBe('A star fell.');
  });
  it('uses a drop cap only when the first word has four letters or more', () => {
    expect(dropCapFits('Gwened died.')).toBe(true);
    expect(dropCapFits('The Chieftaincy rose.')).toBe(false);
    expect(dropCapFits('At Khazazthar the gates fell.')).toBe(false);
    expect(dropCapFits('Nantgad grew.')).toBe(true);
    expect(dropCapFits('')).toBe(false);
  });
  it('writes a life as years, or a birth for the living', () => {
    expect(lifeSpanText('12\u201371')).toBe('Year 12\u201371');
    expect(lifeSpanText('12\u2013')).toBe('born Year 12');
  });
});

describe('book places', () => {
  it('lists perilous places by deaths, each with its beast, from the record', () => {
    const world = base();
    const perils = perilsOf(world, DEFAULT_CONTENT);
    for (const p of perils) {
      expect(world.sites.get(p.siteId)?.name).toBe(p.name);
      expect(p.beasts.length).toBeGreaterThan(0);
    }
    for (let k = 1; k < perils.length; k += 1) {
      expect(perils[k]!.deaths).toBeLessThanOrEqual(perils[k - 1]!.deaths);
    }
    const names = new Set(perils.flatMap((p) => p.beasts.map((b) => b.name)));
    for (const name of names) {
      expect([...world.creatures.values()].some((c) => c.name === name)).toBe(true);
    }
  });
  it("reads a town's owner and size in a given year from the yearly record", () => {
    const world = base();
    const site = [...world.sites.values()].find((s) => s.ruinedYear === undefined)!;
    const last = world.playback!.years.length - 1;
    const row = siteInYear(world, site.id, last);
    expect(row).toBeDefined();
    expect(row!.ruined).toBe(false);
    expect(row!.pop).toBeGreaterThan(0);
    expect(siteInYear(world, -1, last)).toBeUndefined();
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
      // (A quiet era's line says "No war", so look for a count.)
      expect(/\d+ wars?/.test(line)).toBe(wars > 0);
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
  it("grows a crop to the plate's shape, around the same centre and inside the world", () => {
    const base = cropBox([30 * 256 + 100], 256, 256, { w: 64, h: 40 }, 6);
    const fit = fitBox(base, 3.6, 256, 256);
    expect((fit.x1 - fit.x0) / (fit.y1 - fit.y0)).toBeCloseTo(3.6, 5);
    expect(fit.x1 - fit.x0).toBeGreaterThanOrEqual(64);
    expect(fit.y1 - fit.y0).toBeGreaterThanOrEqual(40);
    expect(fit.x0).toBeGreaterThanOrEqual(0);
    expect(fit.x1).toBeLessThanOrEqual(256);
    // A narrow phone plate grows taller instead.
    const tall = fitBox(base, 1, 256, 256);
    expect((tall.x1 - tall.x0) / (tall.y1 - tall.y0)).toBeCloseTo(1, 5);
    // A world narrower than the plate's shape keeps its own bounds.
    const small = fitBox(cropBox([5 * 64 + 5], 64, 64, { w: 64, h: 40 }, 6), 3.6, 64, 64);
    expect(small.x0).toBeGreaterThanOrEqual(0);
    expect(small.x1).toBeLessThanOrEqual(64);
    expect(small.y1).toBeLessThanOrEqual(64);
  });
});
