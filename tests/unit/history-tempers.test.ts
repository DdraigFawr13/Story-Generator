import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import { generateWorld, templateNarrator, type WorldState } from '../../src/engine';
import { findWorld } from './helpers/find-world';

// The tests search this fixed list for a world with the event they check (first match wins).
const SEEDS = ['TM-1', 'TM-2', 'TM-3', 'TM-4', 'TM-5', 'TM-6', 'TM-7', 'TM-8'];
const make = (seed: string) =>
  generateWorld(seed, { width: 96, height: 96, historyYears: 250 }, DEFAULT_CONTENT);
const find = (what: string, has: (w: WorldState) => boolean) =>
  findWorld(what, 'tempers', SEEDS, make, has).world;
const narratorOf = (w: WorldState) =>
  templateNarrator(
    DEFAULT_CONTENT,
    (id) => w.people.get(id)?.name ?? `#${id}`,
    (id) => w.people.get(id),
  );
const TEMPERS = new Set(DEFAULT_CONTENT.history.tempers.tempers.map((t) => t.id));

describe('rulers with character (H2)', () => {
  const world = find('a byname worn in a later event and a war begun by temper', (w) => {
    const later = w.events.some((e) =>
      e.actors.some((id) => {
        const p = w.people.get(id);
        return p?.byname !== undefined && p.byname.event < e.id;
      }),
    );
    return later && w.events.some((e) => e.type === 'war_declared' && e.data.temper);
  });
  const narrator = narratorOf(world);

  it('gives every ruler a temper from the table', () => {
    const rulers = [...world.people.values()].filter((p) => p.title === 'ruler');
    expect(rulers.length).toBeGreaterThan(0);
    for (const ruler of rulers) expect(TEMPERS.has(ruler.temper ?? '')).toBe(true);
  });

  it('names a byname once earned, and only in lines after it', () => {
    for (const person of world.people.values()) {
      if (!person.byname) continue;
      const earned = world.events.find((e) => e.id === person.byname!.event)!;
      expect(earned.type).toBe('byname_earned');
      expect(earned.data.byname).toBe(person.byname.text);
      expect(earned.causes).toHaveLength(1);
      for (const e of world.events) {
        if (!e.actors.includes(person.id) || e.type === 'byname_earned') continue;
        const styled = narrator.renderEvent(e).includes(`${person.name} ${person.byname.text}`);
        // A line before the byname never wears it.
        if (e.id < earned.id) expect(styled).toBe(false);
      }
    }
    const shown = world.events.some((e) =>
      e.actors.some((id) => {
        const p = world.people.get(id);
        return (
          p?.byname !== undefined &&
          p.byname.event < e.id &&
          narrator.renderEvent(e).includes(`${p.name} ${p.byname.text}`)
        );
      }),
    );
    expect(shown).toBe(true);
  });

  it('never repeats a byname among the living of one realm', () => {
    const seen = new Set<string>();
    for (const p of world.people.values()) {
      if (!p.byname || p.died !== undefined) continue;
      const key = `${p.civId}:${p.byname.text}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('says why when a temper pushed a war', () => {
    const war = world.events.find((e) => e.type === 'war_declared' && e.data.temper)!;
    expect(TEMPERS.has(String(war.data.temper))).toBe(true);
    expect(narrator.renderEvent(war)).toContain(String(war.data.why));
  });
});
