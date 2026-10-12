import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import {
  DAYS_PER_YEAR,
  biography,
  buildLegendIndex,
  eventVars,
  generateWorld,
  templateNarrator,
  validateContent,
  type LegendKind,
  type SimEvent,
  type WorldState,
} from '../../src/engine';

let shared: WorldState | undefined;
/** One 64x64, 250-year world shared by the cases. */
const base = () =>
  (shared ??= generateWorld(
    'NOT-A',
    { width: 64, height: 64, historyYears: 250 },
    DEFAULT_CONTENT,
  ));

const narratorOf = (world: WorldState) =>
  templateNarrator(DEFAULT_CONTENT, (id) => world.people.get(id)?.name ?? `#${id}`);

describe('event templates', () => {
  it('render every variant of every event', () => {
    const world = base();
    const narrator = narratorOf(world);
    for (const event of world.events) {
      const count = DEFAULT_CONTENT.eventTypes.find((t) => t.id === event.type)!.templates.length;
      for (let i = 0; i < count; i += 1) {
        expect(() => narrator.renderVariant(event, i), `${event.type} #${i}`).not.toThrow();
      }
    }
  });

  it('print year-precision dates as the history year', () => {
    const world = base();
    const def = DEFAULT_CONTENT.eventTypes.find((t) => t.id === 'civ_founded')!;
    const event = world.events.find((e) => e.type === 'civ_founded')!;
    const vars = eventVars(event, () => '', def);
    expect(vars.date).toBe(`Year ${Math.floor(event.day / DAYS_PER_YEAR)}`);
    expect(vars.year).toBe(Math.floor(event.day / DAYS_PER_YEAR));
  });

  it('name existing entities in every linked data field', () => {
    const world = base();
    const maps: Record<string, Set<string>> = {
      civ: new Set([...world.civs.values()].map((c) => c.name)),
      site: new Set([...world.sites.values()].map((s) => s.name)),
      beast: new Set([...world.creatures.values()].map((c) => c.name)),
      item: new Set([...world.items.values()].map((i) => i.name)),
      dynasty: new Set([...world.dynasties.values()].map((d) => d.name)),
    };
    const links = new Map(DEFAULT_CONTENT.eventTypes.map((t) => [t.id, t.links ?? {}]));
    for (const event of world.events) {
      for (const [field, kind] of Object.entries(links.get(event.type) ?? {})) {
        const value = event.data[field];
        // "" and "the wilds" mean none.
        if (value === undefined || value === '' || value === 'the wilds' || value === 'no people')
          continue;
        expect(maps[kind]!.has(String(value)), `${event.type}.${field}="${value}"`).toBe(true);
      }
    }
  });

  it('give every war, famine and migration a cause', () => {
    const uncaused = base().events.filter(
      (e) => ['war_declared', 'famine', 'migration'].includes(e.type) && e.causes.length === 0,
    );
    expect(uncaused.map((e) => e.type)).toEqual([]);
  });

  it('are rejected when a variant uses an unknown key', () => {
    const eventTypes = DEFAULT_CONTENT.eventTypes.map((t) =>
      t.id === 'civ_founded' ? { ...t, templates: [...t.templates.slice(0, 2), '{nonsense}'] } : t,
    );
    const problems = validateContent({ ...DEFAULT_CONTENT, eventTypes });
    expect(problems.join('\n')).toMatch(/civ_founded template 3 uses unknown key \{nonsense\}/);
    expect(validateContent(DEFAULT_CONTENT)).toEqual([]);
  });

  it('say plurals in the yearly summary', () => {
    const summary = base().events.find(
      (e) => e.type === 'year_summary' && Number(e.data.n_marriage) >= 2,
    );
    expect(summary, 'a year with two marriages').toBeDefined();
    expect(String(summary!.data.summary)).toMatch(/\d+ marriages/);
  });
});

describe('biographies', () => {
  const maxLines = DEFAULT_CONTENT.biographies.maxLines;

  it('tell a dead notable from the record, in order, from events they acted in', () => {
    const world = base();
    const index = buildLegendIndex(world, DEFAULT_CONTENT);
    const narrator = narratorOf(world);
    const dead = [...world.people.values()]
      .filter((p) => p.died !== undefined)
      .sort((a, b) => b.fame - a.fame || a.id - b.id)[0]!;
    const bio = biography(world, DEFAULT_CONTENT, narrator, index, { kind: 'person', id: dead.id });
    const text = bio.summary.join(' ');
    expect(text).toContain(`born in Year ${dead.born}`);
    expect(text).toMatch(new RegExp(`died in Year ${dead.died}`));
    expect(bio.lines.length).toBeLessThanOrEqual(maxLines);
    for (let i = 0; i < bio.lines.length; i += 1) {
      const line = bio.lines[i]!;
      const event = world.events.find((e) => e.id === line.eventId)!;
      expect(event.actors).toContain(dead.id);
      if (i > 0) expect(line.year).toBeGreaterThanOrEqual(bio.lines[i - 1]!.year);
    }
  });

  it('write a summary for every civ, site and notable without throwing', () => {
    const world = base();
    const index = buildLegendIndex(world, DEFAULT_CONTENT);
    const narrator = narratorOf(world);
    const refs: [LegendKind, Iterable<number>][] = [
      ['civ', world.civs.keys()],
      ['site', world.sites.keys()],
      ['person', world.people.keys()],
      ['beast', world.creatures.keys()],
      ['item', world.items.keys()],
      ['dynasty', world.dynasties.keys()],
    ];
    for (const [kind, ids] of refs) {
      for (const id of ids) {
        const bio = biography(world, DEFAULT_CONTENT, narrator, index, { kind, id });
        expect(bio.summary.length, `${kind} ${id}`).toBeGreaterThan(0);
        expect(bio.lines.length).toBeLessThanOrEqual(maxLines);
      }
    }
  });

  it("include a site's founding and a ruin's year", () => {
    const world = base();
    const index = buildLegendIndex(world, DEFAULT_CONTENT);
    const narrator = narratorOf(world);
    const eventsOf = (siteName: string): SimEvent[] =>
      world.events.filter(
        (e) => (e.type === 'civ_founded' || e.type === 'site_founded') && e.data.site === siteName,
      );
    const founded = [...world.sites.values()].find((s) => eventsOf(s.name).length > 0)!;
    const bio = biography(world, DEFAULT_CONTENT, narrator, index, {
      kind: 'site',
      id: founded.id,
    });
    expect(bio.lines.map((l) => l.eventId)).toContain(eventsOf(founded.name)[0]!.id);
    const ruined = [...world.sites.values()].find((s) => s.ruinedYear !== undefined);
    if (!ruined) return;
    const ruin = biography(world, DEFAULT_CONTENT, narrator, index, {
      kind: 'site',
      id: ruined.id,
    });
    expect(ruin.summary.join(' ')).toContain(`ruined in Year ${ruined.ruinedYear}`);
  });
});
