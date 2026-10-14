// What the Book room shows, worked out from a finished world: one book per realm, its annal eras as
// chapters, a chapter's paragraphs, its one-line summary and the places it names. Pure functions
// over the world, the legend index and the engine's `annals()`; no DOM and no rules of their own.
// Every sentence comes from an event template or an engine field (the book invents nothing).

import {
  DAYS_PER_YEAR,
  annals,
  eventYear,
  yearText,
  type ContentBundle,
  type Era,
  type Id,
  type LegendIndex,
  type SimEvent,
  type WorldState,
} from '../../engine';

type BookContent = Pick<ContentBundle, 'annals' | 'eventTypes' | 'cultures'>;

/** One realm's book, as listed in the contents. */
export interface BookInfo {
  civId: Id;
  title: string;
  from: number;
  to: number;
  /** People living in the realm's towns at the end of history (fallen realms hold none). */
  size: number;
}

/** The last year of history on record. */
export const lastYear = (world: WorldState): number =>
  Math.min(Math.floor(world.day / DAYS_PER_YEAR), world.params.historyYears);

const sitePop = (world: WorldState, siteId: Id): number =>
  (world.sites.get(siteId)?.pop ?? []).reduce((sum, band) => sum + band.count, 0);

/** Every realm's book, the largest first (people in its towns now, then its record, then id). */
export function booksOf(world: WorldState, index: LegendIndex): BookInfo[] {
  const final = lastYear(world);
  const size = new Map<Id, number>();
  for (const site of world.sites.values()) {
    if (site.civId === null || site.ruinedYear !== undefined) continue;
    size.set(site.civId, (size.get(site.civId) ?? 0) + sitePop(world, site.id));
  }
  const books = [...world.civs.values()].map((civ) => ({
    civId: civ.id,
    title: civ.name,
    from: civ.founded,
    to: Math.max(civ.founded, civ.fell ?? final),
    size: Math.round(size.get(civ.id) ?? 0),
    record: index.events({ kind: 'civ', id: civ.id }).length,
  }));
  books.sort((a, b) => b.size - a.size || b.record - a.record || a.civId - b.civId);
  return books.map(({ record: _record, ...book }) => book);
}

export interface Chapter {
  /** 1-based. */
  n: number;
  /** The engine's era name. */
  name: string;
  from: number;
  to: number;
  /** The era's key events, oldest first. */
  keyEvents: readonly Id[];
}

const ROMAN: readonly [number, string][] = [
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];
/** 4 -> "IV" (chapters never run past a few dozen). */
export function roman(n: number): string {
  let left = n;
  let out = '';
  for (const [value, symbol] of ROMAN) {
    while (left >= value) {
      out += symbol;
      left -= value;
    }
  }
  return out;
}

/** A realm's chapters: its annal eras, with the engine's names and years. */
export function chaptersOf(
  world: WorldState,
  index: LegendIndex,
  content: BookContent,
  civId: Id,
): Chapter[] {
  const book = annals(world, index, content, civId);
  if (!book) return [];
  return book.eras.map((era: Era, k) => ({
    n: k + 1,
    name: era.name,
    from: era.from,
    to: era.to,
    keyEvents: era.keyEvents,
  }));
}

/** The chapter holding a year, or -1 when the year lies outside the book. */
export function chapterAt(chapters: readonly Chapter[], year: number): number {
  return chapters.findIndex((c) => year >= c.from && year <= c.to);
}

/** The first realm whose book holds an event, with the chapter's index; undefined for none. */
export function chapterOfEvent(
  world: WorldState,
  index: LegendIndex,
  content: BookContent,
  event: SimEvent,
  books: readonly BookInfo[],
): { civId: Id; ch: number } | undefined {
  const year = eventYear(event);
  const named = new Set(
    index
      .refs(event.id)
      .filter((r) => r.kind === 'civ')
      .map((r) => r.id),
  );
  // The realms the event names come first, then the largest realm standing in that year.
  const order = [
    ...books.filter((b) => named.has(b.civId)),
    ...books.filter((b) => !named.has(b.civId)),
  ].filter((b) => year >= b.from && year <= b.to);
  for (const book of order.slice(0, named.size > 0 ? named.size : 1)) {
    const ch = chapterAt(chaptersOf(world, index, content, book.civId), year);
    if (ch >= 0) return { civId: book.civId, ch };
  }
  return undefined;
}

/** A realm's events in a span of years, oldest first. */
export function eraEvents(index: LegendIndex, civId: Id, from: number, to: number): SimEvent[] {
  return index
    .events({ kind: 'civ', id: civId })
    .flatMap((id) => index.event(id) ?? [])
    .filter((e) => eventYear(e) >= from && eventYear(e) <= to);
}

/** The events a chapter prints: its key events, plus the one the reader came for. */
export function bodyIds(index: LegendIndex, chapter: Chapter, extra: Id | null): Id[] {
  const ids = new Set(chapter.keyEvents);
  const more = extra === null ? undefined : index.event(extra);
  if (more && eventYear(more) >= chapter.from && eventYear(more) <= chapter.to) ids.add(more.id);
  return [...ids]
    .flatMap((id) => index.event(id) ?? [])
    .sort((a, b) => a.day - b.day || a.id - b.id)
    .map((e) => e.id);
}

export interface Paragraph {
  year: number;
  ids: Id[];
}

/** Events of the same year form one paragraph, in the order given. */
export function paragraphsOf(events: readonly SimEvent[]): Paragraph[] {
  const out: Paragraph[] = [];
  for (const event of events) {
    const year = eventYear(event);
    const tail = out[out.length - 1];
    if (tail && tail.year === year) tail.ids.push(event.id);
    else out.push({ year, ids: [event.id] });
  }
  return out;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The one-line chapter summary, counted from the era's own events: wars declared, rulers who took
 * the seat and notables who died. Years come first; a quiet era says only its years.
 */
export function summaryOf(from: number, to: number, events: readonly SimEvent[]): string {
  const count = (type: string) => events.filter((e) => e.type === type).length;
  const wars = count('war_declared');
  const rulers = count('ruler_succeeded');
  const deaths = count('notable_died');
  const parts = [
    ...(wars > 0 ? [plural(wars, 'war', 'wars')] : []),
    ...(rulers > 0 ? [plural(rulers, 'ruler', 'rulers') + ' on the seat'] : []),
    ...(deaths > 0 ? [plural(deaths, 'notable', 'notables') + ' dead'] : []),
  ];
  const years = `Years ${yearText(from)} to ${yearText(to)}`;
  if (parts.length === 0) return `${years}. No war, no new ruler and no notable death is recorded.`;
  const last = parts.pop()!;
  return `${years}. ${parts.length > 0 ? `${parts.join(', ')} and ${last}` : last} on record.`;
}

/** The sites a set of events names, in order of first mention. */
export function placesOf(index: LegendIndex, ids: readonly Id[]): Id[] {
  const seen = new Set<Id>();
  for (const id of ids) for (const ref of index.refs(id)) if (ref.kind === 'site') seen.add(ref.id);
  return [...seen];
}

/** The book a bare "Book" press opens: the last one read if it still exists, else the largest. */
export function pickBook(books: readonly BookInfo[], last: Id | null): Id | undefined {
  return books.find((b) => b.civId === last)?.civId ?? books[0]?.civId;
}

/** A box around some cells, at least `min.w` by `min.h` cells, kept inside the world. */
export function cropBox(
  cells: readonly number[],
  width: number,
  height: number,
  min: { w: number; h: number },
  pad: number,
): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = width;
  let y0 = height;
  let x1 = 0;
  let y1 = 0;
  for (const c of cells) {
    const x = c % width;
    const y = Math.floor(c / width);
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  if (cells.length === 0) return { x0: 0, y0: 0, x1: width, y1: height };
  x0 -= pad;
  y0 -= pad;
  x1 += pad + 1;
  y1 += pad + 1;
  const grow = (lo: number, hi: number, limit: number, least: number): [number, number] => {
    const need = Math.max(0, least - (hi - lo));
    let a = lo - Math.floor(need / 2);
    let b = hi + Math.ceil(need / 2);
    if (a < 0) {
      b -= a;
      a = 0;
    }
    if (b > limit) {
      a -= b - limit;
      b = limit;
    }
    return [Math.max(0, a), Math.min(limit, b)];
  };
  [x0, x1] = grow(x0, x1, width, min.w);
  [y0, y1] = grow(y0, y1, height, min.h);
  return { x0, y0, x1, y1 };
}

export interface Hit {
  kind: 'book' | 'chapter' | 'person' | 'place' | 'year';
  /** Book (civ), person or site id; for a chapter or year, the chapter index in `ch`. */
  id: Id;
  ch?: number;
  label: string;
  hint: string;
}

/** Contents search: names, places and years, at most `limit` of each kind. */
export function searchBook(
  query: string,
  world: WorldState,
  books: readonly BookInfo[],
  chapters: readonly Chapter[],
  people: readonly { id: Id; name: string; hint: string }[],
  limit = 5,
): Hit[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [];
  const hits: Hit[] = [];
  if (/^-?\d{1,4}$/.test(needle)) {
    const year = Number(needle);
    const ch = chapterAt(chapters, year);
    if (ch >= 0)
      hits.push({
        kind: 'year',
        id: year,
        ch,
        label: `Year ${yearText(year)}`,
        hint: `Chapter ${roman(chapters[ch]!.n)}`,
      });
  }
  for (const b of books.filter((x) => x.title.toLowerCase().includes(needle)).slice(0, limit))
    hits.push({ kind: 'book', id: b.civId, label: b.title, hint: `${b.from}–${b.to}` });
  for (const c of chapters.filter((x) => x.name.toLowerCase().includes(needle)).slice(0, limit))
    hits.push({
      kind: 'chapter',
      id: c.n,
      ch: c.n - 1,
      label: c.name,
      hint: `Chapter ${roman(c.n)}`,
    });
  for (const p of people.filter((x) => x.name.toLowerCase().includes(needle)).slice(0, limit))
    hits.push({ kind: 'person', id: p.id, label: p.name, hint: p.hint });
  let places = 0;
  for (const s of world.sites.values()) {
    if (places >= limit) break;
    if (!s.name.toLowerCase().includes(needle)) continue;
    places += 1;
    hits.push({ kind: 'place', id: s.id, label: s.name, hint: s.kind });
  }
  return hits;
}
