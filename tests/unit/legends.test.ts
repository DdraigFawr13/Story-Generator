import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import {
  buildLegendIndex,
  cellsDigest,
  decodeTerritory,
  eventTitle,
  generateWorld,
  importanceStars,
  historyAt,
  linkSegments,
  liveSites,
  locate,
  yearText,
  type LegendRef,
  type SimEvent,
  validateContent,
  type WorldState,
} from '../../src/engine';
import smoke from '../fixtures/smoke-cells-digest.json';

let shared: WorldState | undefined;
/** One 64x64, 60-year world shared by the cases. */
const base = () =>
  (shared ??= generateWorld(
    'LEGENDS',
    { width: 64, height: 64, historyYears: 60 },
    DEFAULT_CONTENT,
  ));

const civ = (id: number): LegendRef => ({ kind: 'civ', id });
const site = (id: number): LegendRef => ({ kind: 'site', id });

describe('linkSegments', () => {
  it('splits the line around linked names and round-trips the text', () => {
    const text = 'Ashabum razed Karn, and Karn fell.';
    const parts = linkSegments(text, [
      { ref: civ(1), name: 'Ashabum' },
      { ref: site(2), name: 'Karn' },
    ]);
    expect(parts.map((p) => p.text).join('')).toBe(text);
    expect(parts.filter((p) => p.ref).map((p) => [p.text, p.ref!.id])).toEqual([
      ['Ashabum', 1],
      ['Karn', 2],
    ]);
  });

  it('prefers the longest name and never overlaps marks', () => {
    const text = 'The Kingdom of Ash beat Ash.';
    const parts = linkSegments(text, [
      { ref: site(1), name: 'Ash' },
      { ref: civ(2), name: 'Kingdom of Ash' },
    ]);
    expect(parts.map((p) => p.text).join('')).toBe(text);
    expect(parts.filter((p) => p.ref).map((p) => [p.text, p.ref!.id])).toEqual([
      ['Kingdom of Ash', 2],
      ['Ash', 1],
    ]);
  });

  it('skips names that do not occur', () => {
    const parts = linkSegments('Nothing here.', [{ ref: civ(1), name: 'Zed' }]);
    expect(parts).toEqual([{ text: 'Nothing here.' }]);
  });
});

describe('historyAt', () => {
  it('shows sites only once founded and ruins only once ruined', () => {
    const world = base();
    const late = [...world.sites.values()].find((s) => s.founded > 5)!;
    expect(late).toBeDefined();
    expect(historyAt(world, late.founded - 1).sites.has(late.id)).toBe(false);
    expect(historyAt(world, late.founded).sites.has(late.id)).toBe(true);
    const ruin = [...world.sites.values()].find((s) => s.ruinedYear !== undefined);
    if (ruin) {
      const r = ruin.ruinedYear!;
      expect(historyAt(world, r).sites.get(ruin.id)).toMatchObject({ ruined: true, pop: 0 });
      expect(historyAt(world, r - 1).sites.get(ruin.id)?.ruined).toBe(false);
    }
  });

  it('decodes the territory of the latest snapshot at or before the year', () => {
    const world = base();
    const at = historyAt(world, 37);
    expect(at.snapshotYear).toBe(30);
    const snap = world.snapshots.find((s) => s.year === 30)!;
    expect(at.territory).toEqual(decodeTerritory(snap.territory, 64 * 64));
  });

  it('falls back to the current world when there are no snapshots', () => {
    const world = { ...base(), snapshots: [] };
    const at = historyAt(world, 10);
    expect(at.territory).toBe(world.cells!.territory);
    expect(at.sites.size).toBeGreaterThan(0);
  });
});

describe('legend index links', () => {
  it('lists effects that agree with causes, and refs for every indexed entity', () => {
    const world = base();
    const index = buildLegendIndex(world, DEFAULT_CONTENT);
    let effects = 0;
    for (const event of world.events) {
      for (const id of index.effects(event.id)) {
        effects += 1;
        expect(index.event(id)!.causes).toContain(event.id);
      }
      for (const ref of index.refs(event.id)) expect(index.events(ref)).toContain(event.id);
      const actors = event.actors.map((id) => id);
      expect(
        index
          .refs(event.id)
          .slice(0, actors.length)
          .map((r) => r.id),
      ).toEqual(actors);
    }
    expect(effects).toBeGreaterThan(0);
  });
});

describe('locate', () => {
  it("puts a civ at its capital's cell and an item nowhere without a holder", () => {
    const world = base();
    const first = [...world.civs.values()][0]!;
    expect(locate(world, civ(first.id))).toBe(world.sites.get(first.capital)!.cell);
    expect(locate(world, { kind: 'item', id: 999999 })).toBeNull();
  });
});

describe('cellsDigest', () => {
  it('is stable for a world and sensitive to a changed cell', () => {
    const cells = base().cells!;
    const before = cellsDigest(cells);
    expect(cellsDigest(cells)).toBe(before);
    cells.elevation[0] = (cells.elevation[0]! + 1) as number;
    expect(cellsDigest(cells)).not.toBe(before);
    cells.elevation[0] = (cells.elevation[0]! - 1) as number;
    expect(cellsDigest(cells)).toBe(before);
  });

  it('matches the committed digest of seed SMOKE at 128 (the browser smoke compares the same)', () => {
    const world = generateWorld(
      smoke.seed,
      { width: smoke.size, height: smoke.size },
      DEFAULT_CONTENT,
    );
    expect(cellsDigest(world.cells!)).toBe(smoke.digest);
  });
});

const ev = (type: string, data: SimEvent['data'], day = 336 * 12): SimEvent => ({
  id: 1,
  day,
  type,
  importance: 5,
  actors: [],
  place: null,
  causes: [],
  data,
});

describe('eventTitle', () => {
  const migration = { title: 'Migration from {from} to {to}' };

  it('fills every placeholder from the event data', () => {
    expect(eventTitle(ev('migration', { from: 'Karn', to: 'Ash' }), migration)).toBe(
      'Migration from Karn to Ash',
    );
  });

  it('drops a missing or empty placeholder with the word before it', () => {
    expect(eventTitle(ev('migration', { from: 'Karn' }), migration)).toBe('Migration from Karn');
    expect(eventTitle(ev('migration', { from: 'Karn', to: '' }), migration)).toBe(
      'Migration from Karn',
    );
  });

  it('uses the history year for {year} and falls back to the type label when nothing is left', () => {
    expect(eventTitle(ev('year_summary', {}), { title: 'Year {year} in brief' })).toBe(
      'Year 12 in brief',
    );
    expect(eventTitle(ev('migration', {}), { title: '{from}' })).toBe('Migration');
    expect(eventTitle(ev('site_razed', {}), {})).toBe('Site razed');
  });

  it('has a title that validates for every event type', () => {
    for (const def of DEFAULT_CONTENT.eventTypes) expect(def.title, def.id).toBeTruthy();
  });
});

describe('small formatters', () => {
  it('writes negative years with a real minus sign', () => {
    expect(yearText(-30)).toBe('\u221230');
    expect(yearText(28)).toBe('28');
  });

  it('puts importance in star bands and nothing below 3', () => {
    expect([2, 3, 5, 6, 8, 9, 12].map(importanceStars)).toEqual([
      '',
      '\u2605',
      '\u2605',
      '\u2605\u2605',
      '\u2605\u2605',
      '\u2605\u2605\u2605',
      '\u2605\u2605\u2605',
    ]);
  });

  it('shares decoded territory through a cache and matches the live sites in the final year', () => {
    const world = base();
    const cache = new Map<number, Uint16Array>();
    const a = historyAt(world, 37, cache);
    expect(historyAt(world, 39, cache).territory).toBe(a.territory);
    expect(cache.size).toBe(1);
    expect(liveSites(world).size).toBe(world.sites.size);
  });
});

describe('legend content rules', () => {
  it('rejects a title placeholder the type has no data for, and a group naming an unknown type', () => {
    const eventTypes = DEFAULT_CONTENT.eventTypes.map((t) =>
      t.id === 'famine' ? { ...t, title: 'Famine in {nowhere}' } : t,
    );
    const typeGroups = [
      ...(DEFAULT_CONTENT.typeGroups ?? []),
      { id: 'x', label: 'X', types: ['nope'] },
    ];
    const problems = validateContent({ ...DEFAULT_CONTENT, eventTypes, typeGroups }).join('\n');
    expect(problems).toMatch(/famine title uses unknown key \{nowhere\}/);
    expect(problems).toMatch(/group x names unknown event type "nope"/);
    expect(validateContent(DEFAULT_CONTENT)).toEqual([]);
  });

  it('puts every event type in at most one group', () => {
    const seen = new Set<string>();
    for (const group of DEFAULT_CONTENT.typeGroups ?? []) {
      for (const type of group.types) {
        expect(seen.has(type), type).toBe(false);
        seen.add(type);
      }
    }
  });
});
