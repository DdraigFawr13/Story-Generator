import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import {
  fillTemplate,
  eventVars,
  generateWorld,
  type SimEvent,
  type WorldState,
} from '../../src/engine';
import { cached, findWorld } from './helpers/find-world';

/** Works and enchanting on a small world: the chances are raised so a short history shows them. */
const FREQUENT = {
  ...DEFAULT_CONTENT,
  greatWorks: {
    ...DEFAULT_CONTENT.greatWorks,
    legendChance: 0.5,
    realmChance: 0.1,
    realmWealthMin: 0,
    enchant: { ...DEFAULT_CONTENT.greatWorks.enchant, chance: 0.6 },
  },
};

// The tests search this fixed list for a world with the event they check (first match wins).
const SEEDS = ['GW-1', 'GW-2', 'GW-3', 'GW-4', 'GW-5', 'GW-6', 'GW-7', 'GW-8'];
const make = (seed: string) =>
  generateWorld(seed, { width: 96, height: 96, historyYears: 250 }, FREQUENT);
const find = (what: string, has: (w: WorldState) => boolean) =>
  findWorld(what, 'frequent96', SEEDS, make, has).world;
const ofType = (w: WorldState, type: string) => w.events.filter((e) => e.type === type);
const hasType = (type: string) => (w: WorldState) => ofType(w, type).length > 0;

describe('great works', () => {
  const world = find('a great work raised and an item enchanted', (w) =>
    ['great_work_raised', 'item_enchanted'].every((t) => hasType(t)(w)),
  );
  const works = [...world.sites.values()].flatMap((site) =>
    (site.works ?? []).map((work) => ({ site, work })),
  );

  it('records each raise on its site, with a living-time builder and a unique name', () => {
    const raised = ofType(world, 'great_work_raised');
    expect(works.length).toBe(raised.length);
    const names = new Set<string>();
    for (const { site, work } of works) {
      const event = world.events.find((e) => e.id === work.eventId);
      expect(event?.type).toBe('great_work_raised');
      expect(event?.data.work).toBe(work.name);
      expect(event?.data.site).toBe(site.name);
      expect(world.people.has(work.builderId!)).toBe(true);
      expect(names.has(work.name), `duplicate name ${work.name}`).toBe(false);
      names.add(work.name);
    }
  });

  it('lets a person raise one work in a life', () => {
    const builders = [...works.map((w) => w.work.builderId)];
    const items = [...world.items.values()].filter((i) => i.great).map((i) => i.makerId);
    const all = [...builders, ...items];
    expect(new Set(all).size).toBe(all.length);
  });

  it('keeps no work standing on a ruined site, and at most two on a live one', () => {
    for (const site of world.sites.values()) {
      const standing = (site.works ?? []).filter((w) => w.fell === undefined);
      if (site.ruinedYear !== undefined) expect(standing, site.name).toHaveLength(0);
      else expect(standing.length).toBeLessThanOrEqual(2);
      for (const work of site.works ?? [])
        if (work.fell !== undefined) {
          expect(work.fell).toBeGreaterThanOrEqual(work.raised);
        }
    }
    const fell = ofType(world, 'great_work_fell');
    const fallen = works.filter((w) => w.work.fell !== undefined);
    expect(fell.length).toBe(fallen.length);
  });

  it('binds a known spell into an item of a real form', () => {
    const item = [...world.items.values()].find((i) => i.enchanted);
    expect(item).toBeDefined();
    const { school, spell } = item!.enchanted!;
    const ability = DEFAULT_CONTENT.abilities.find((a) => a.id === spell);
    expect(ability?.school).toBe(school);
    const forms = DEFAULT_CONTENT.items.flatMap((i) => i.forms ?? []);
    expect(forms).toContain(item!.form);
    const made = world.events.find((e) => e.id === item!.deeds[0]);
    expect(made?.type).toBe('item_enchanted');
  });

  it('renders every new event type through its templates', () => {
    const types = new Map(DEFAULT_CONTENT.eventTypes.map((d) => [d.id, d]));
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      const w = cached('frequent96', seed, make);
      for (const event of w.events) {
        if (!/^(great_work_|item_enchanted|great_item_made)/.test(event.type)) continue;
        seen.add(event.type);
        const def = types.get(event.type)!;
        for (const template of def.templates)
          expect(() =>
            fillTemplate(
              template,
              eventVars(event as SimEvent, () => 'Someone', def),
            ),
          ).not.toThrow();
      }
    }
    expect(seen.has('great_work_raised')).toBe(true);
    expect(seen.has('item_enchanted')).toBe(true);
    // Eight small worlds are generated once, so this test is given room.
  }, 60_000);
});
