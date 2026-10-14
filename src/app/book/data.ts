// What the Book room shows, worked out from a finished world: one book per realm, its annal eras as
// chapters, a chapter's paragraphs, its one-line summary and the places it names. Pure functions
// over the world, the legend index and the engine's `annals()`; no DOM and no rules of their own.
// Every sentence comes from an event template or an engine field (the book invents nothing).

import {
  DAYS_PER_YEAR,
  annals,
  eventYear,
  linkSegments,
  yearText,
  type ContentBundle,
  type Era,
  type Id,
  type LegendIndex,
  type LegendRef,
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

/** Words in a line of displayed text. */
export const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A chronicle line without the year the paragraph's own label already shows: a leading "Year N: ",
 * "In Year N," or "In Year N ", a "(Year N)" and a " in Year N". Only the paragraph's own year is
 * cut, so a line that names another year keeps it.
 */
export function stripYear(line: string, year: number): string {
  const n = escapeRe(yearText(year));
  const out = line
    .replace(new RegExp(`^(?:In )?Year ${n}(?:[,:]\\s*|\\s+)`), '')
    .replace(new RegExp(`\\s*\\(Year ${n}\\)`, 'g'), '')
    .replace(new RegExp(`\\s+in Year ${n}(?![\\w\u2212-])`, 'g'), '');
  return out === '' ? out : out[0]!.toUpperCase() + out.slice(1);
}

/** A drop cap suits a first word of at least four letters ("The" and "At" would split). */
export function dropCapFits(text: string): boolean {
  const word = text.match(/^[\p{L}]+/u);
  return word !== null && word[0].length >= 4;
}

/** Fewest and most words a chapter's prose runs to (it stops adding at the fewest). */
export const BODY_WORDS = { min: 150, max: 250 };

export interface BodyOptions {
  /** The displayed text of an event (its year already stripped). */
  lineOf: (event: SimEvent) => string;
  /** True for a death worth printing: a legend, a ruler or another famous figure. */
  famous: (event: SimEvent) => boolean;
  min?: number;
  max?: number;
}

const WAR_TYPES = new Set(['war_declared', 'peace_made', 'battle']);
/** Events never printed as prose. */
const NOT_PROSE = new Set(['year_summary']);

/**
 * The events a chapter prints, from all the era's events: the highlighted one first, then by
 * priority (key events, rulers, wars and battles, famous deaths, the rest; the gravest first within
 * each) until the displayed text runs to `min` words, never past `max`. Oldest first. Key events
 * are all kept while they fit.
 */
export function bodyIds(
  index: LegendIndex,
  chapter: Chapter,
  events: readonly SimEvent[],
  extra: Id | null,
  options: BodyOptions,
): Id[] {
  const { lineOf, famous, min = BODY_WORDS.min, max = BODY_WORDS.max } = options;
  const key = new Set(chapter.keyEvents);
  const more = extra === null ? undefined : index.event(extra);
  const forced =
    more && eventYear(more) >= chapter.from && eventYear(more) <= chapter.to ? more : undefined;
  const tierOf = (e: SimEvent): number =>
    key.has(e.id)
      ? 0
      : e.type === 'ruler_succeeded'
        ? 1
        : WAR_TYPES.has(e.type)
          ? 2
          : e.type === 'notable_died' && famous(e)
            ? 3
            : 4;
  const keyEvents = chapter.keyEvents.flatMap((id) => index.event(id) ?? []);
  const pool = new Map<Id, SimEvent>();
  for (const e of [...keyEvents, ...events]) if (!NOT_PROSE.has(e.type)) pool.set(e.id, e);
  const ranked = [...pool.values()]
    .filter((e) => e.id !== forced?.id)
    .map((e) => ({ e, tier: tierOf(e) }))
    .sort((a, b) => a.tier - b.tier || b.e.importance - a.e.importance || a.e.id - b.e.id);
  const chosen: SimEvent[] = forced ? [forced] : [];
  let words = forced ? wordCount(lineOf(forced)) : 0;
  for (const { e, tier } of ranked) {
    if (tier > 0 && words >= min) break;
    const w = wordCount(lineOf(e));
    if (words + w > max) continue;
    chosen.push(e);
    words += w;
  }
  return chosen.sort((a, b) => a.day - b.day || a.id - b.id).map((e) => e.id);
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

/**
 * The sites the displayed text names, in order of first mention: a place an event only carries as
 * data, with no mention in its sentence, is not on the page and is left out.
 */
export function placesNamed(
  index: LegendIndex,
  events: readonly SimEvent[],
  lineOf: (event: SimEvent) => string,
  nameOf: (ref: LegendRef) => string,
): Id[] {
  const seen = new Set<Id>();
  for (const event of events) {
    const segments = linkSegments(
      lineOf(event),
      index.refs(event.id).map((ref) => ({ ref, name: nameOf(ref) })),
    );
    for (const s of segments) if (s.ref?.kind === 'site') seen.add(s.ref.id);
  }
  return [...seen];
}

/** The standing town nearest to a cell that is not in `skip`, or undefined for none. */
export function nearestOther(
  world: WorldState,
  cell: number,
  skip: ReadonlySet<Id>,
): Id | undefined {
  const w = world.params.width;
  let best: Id | undefined;
  let bestD = Infinity;
  for (const s of world.sites.values()) {
    if (skip.has(s.id) || s.ruinedYear !== undefined) continue;
    const d =
      ((s.cell % w) - (cell % w)) ** 2 + (Math.floor(s.cell / w) - Math.floor(cell / w)) ** 2;
    if (d < bestD) {
      bestD = d;
      best = s.id;
    }
  }
  return best;
}

/** A site's owner and size in one year, from the yearly record; undefined without it. */
export function siteInYear(
  world: WorldState,
  siteId: Id,
  year: number,
): { civ: Id | null; pop: number; ruined: boolean } | undefined {
  const years = world.playback?.years;
  const row = years?.[Math.max(0, Math.min(years.length - 1, year))]?.sites;
  if (!row) return undefined;
  for (let k = 0; k + 3 < row.length; k += 4) {
    if (row[k] === siteId)
      return {
        civ: row[k + 1] === 0 ? null : row[k + 1]!,
        pop: row[k + 2]!,
        ruined: row[k + 3] === 1,
      };
  }
  return undefined;
}

export interface Peril {
  siteId: Id;
  name: string;
  /** People its beasts killed there: raid dead plus the figures they slew. */
  deaths: number;
  /** The beasts that hold or haunt it, the deadliest first. */
  beasts: { name: string; status: 'alive' | 'slain' | 'dead' }[];
}

/**
 * Perilous places: the sites near which a dragon or great beast has its lair, or where one raided or
 * killed, most deaths first. Lairs are cells, so a lair is placed at the town its first sighting
 * names ("near X"); a beast with no town on record adds no row.
 */
export function perilsOf(world: WorldState, content: Pick<ContentBundle, 'creatures'>): Peril[] {
  const tiers = new Map(content.creatures.map((def) => [def.id, def.tier]));
  const byCell = new Map<number, Id>();
  const byName = new Map<string, Id>();
  for (const s of world.sites.values()) {
    byCell.set(s.cell, s.id);
    byName.set(s.name, s.id);
  }
  const events = new Map(world.events.map((e) => [e.id, e]));
  const rows = new Map<Id, Peril & { by: Map<string, number> }>();
  for (const c of world.creatures.values()) {
    if (c.dragon === undefined && (tiers.get(c.defId) ?? 'beast') === 'beast') continue;
    const dead = new Map<Id, number>();
    const add = (site: Id | undefined, n: number) => {
      if (site !== undefined) dead.set(site, (dead.get(site) ?? 0) + n);
    };
    for (const id of c.deeds) {
      const e = events.get(id);
      if (!e) continue;
      if (typeof e.data.near === 'string') add(byName.get(e.data.near), 0);
      if (e.type === 'beast_raid' && e.place !== null)
        add(byCell.get(e.place), Number(e.data.dead) || 0);
    }
    for (const victim of c.kills ?? []) {
      const home = world.people.get(victim)?.siteId;
      add(home == null ? undefined : home, 1);
    }
    const status: Peril['beasts'][number]['status'] =
      c.died === undefined ? 'alive' : c.slainBy !== undefined ? 'slain' : 'dead';
    for (const [site, n] of dead) {
      const s = world.sites.get(site);
      if (!s) continue;
      const row = rows.get(site) ?? {
        siteId: site,
        name: s.name,
        deaths: 0,
        beasts: [] as Peril['beasts'],
        by: new Map<string, number>(),
      };
      row.deaths += n;
      row.by.set(c.name, n);
      row.beasts.push({ name: c.name, status });
      rows.set(site, row);
    }
  }
  return [...rows.values()]
    .map(({ by, ...row }) => ({
      ...row,
      beasts: row.beasts.sort((a, b) => (by.get(b.name) ?? 0) - (by.get(a.name) ?? 0)),
    }))
    .sort((a, b) => b.deaths - a.deaths || a.siteId - b.siteId);
}

/** "Year 12–71" for a life, or "born Year 12" for a person still living (`years` is "12–71" or "12–"). */
export function lifeSpanText(years: string): string {
  return years.endsWith('\u2013') ? `born Year ${years.slice(0, -1)}` : `Year ${years}`;
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

/**
 * A crop box grown to an aspect ratio (width over height), kept inside the world and around the
 * same centre; it widens first and only grows taller when the crop is already as wide as the
 * world. A world too narrow for the shape (a 128-cell world and a 3.6 plate) gives up some of the
 * crop's height rather than stretch the picture.
 */
export function fitBox(
  box: { x0: number; y0: number; x1: number; y1: number },
  aspect: number,
  width: number,
  height: number,
): { x0: number; y0: number; x1: number; y1: number } {
  let w = box.x1 - box.x0;
  let h = box.y1 - box.y0;
  if (w / h < aspect) w = Math.min(width, h * aspect);
  if (w / h < aspect) h = w / aspect;
  else if (w / h > aspect) h = Math.min(height, w / aspect);
  if (w / h > aspect) w = h * aspect;
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const x0 = Math.max(0, Math.min(width - w, cx - w / 2));
  const y0 = Math.max(0, Math.min(height - h, cy - h / 2));
  return { x0, y0, x1: x0 + w, y1: y0 + h };
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
