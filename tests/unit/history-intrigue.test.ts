import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import { INTRIGUE } from '../../src/content/intrigue';
import { DAYS_PER_YEAR, generateWorld, type SimEvent } from '../../src/engine';

// Intrigue is rare in a small world, so the chances are raised: every rule still runs, just more
// often. The first seed of a short fixed list with a killing plot, a seat seized and a bribe is used.
const content = {
  ...DEFAULT_CONTENT,
  history: {
    ...DEFAULT_CONTENT.history,
    intrigue: {
      ...INTRIGUE,
      seizeChance: 1,
      honourChance: 0,
      bribeChance: 1,
      bountyHarms: 1,
      ownFearChance: 0.3,
      coupChance: 1,
      rivalPlotChance: 0.5,
      fearPlotChance: 0.5,
      betrayChance: 1,
      soloHuntChance: 1,
    },
  },
};
const yearOf = (e: SimEvent) => Math.floor(e.day / DAYS_PER_YEAR);

function find() {
  for (let i = 1; i <= 8; i += 1) {
    const world = generateWorld(`IN-${i}`, { width: 64, height: 64, historyYears: 250 }, content);
    const of = (type: string) => world.events.filter((e) => e.type === type);
    if (
      of('plot_struck').length > 0 &&
      of('seat_seized').length > 0 &&
      of('legend_bribed').length > 0
    )
      return { world, of };
  }
  throw new Error('No seed of IN-1 to IN-8 has a plot, a seat seized and a bribe.');
}
const { world, of } = find();

describe('court intrigue', () => {
  it('follows every killing plot with an assassination that cites it', () => {
    for (const plot of of('plot_struck')) {
      const [plotter, target] = plot.actors;
      const death = world.events.find(
        (e) => e.type === 'notable_died' && e.causes.includes(plot.id) && e.actors[0] === target,
      );
      expect(death, `plot ${plot.id}`).toBeDefined();
      expect(death!.actors[1]).toBe(plotter);
      expect(world.people.get(target!)!.causeOfDeath).toBe('assassination');
    }
  });

  it('makes a legend who seizes a seat the ruler in that year', () => {
    for (const seized of of('seat_seized')) {
      const legend = world.people.get(seized.actors[0]!)!;
      expect(legend.magic.power, legend.name).toBeGreaterThanOrEqual(17);
      const crowned = of('ruler_succeeded').find(
        (e) => yearOf(e) === yearOf(seized) && e.actors[0] === legend.id,
      );
      expect(crowned, `seat ${seized.id}`).toBeDefined();
      expect(crowned!.data.civ).toBe(seized.data.civ);
    }
  });

  it('keeps a bribed legend off the field, and sets bounties only for harm done', () => {
    for (const bribe of of('legend_bribed')) {
      const legend = bribe.actors[1]!;
      const peace = of('peace_made').find(
        (e) => e.data.war === bribe.data.war && yearOf(e) >= yearOf(bribe),
      );
      const until = peace ? yearOf(peace) : yearOf(bribe);
      const fought = world.events.filter(
        (e) =>
          (e.type === 'champion_fought' || e.type === 'legend_duel') &&
          e.actors.includes(legend) &&
          // In the bribed war: against the people who paid (in the year it ends, the legend may
          // already fight another war).
          Object.values(e.data).includes(bribe.data.enemyCiv!) &&
          yearOf(e) >= yearOf(bribe) &&
          yearOf(e) <= until,
      );
      expect(
        fought.map((e) => e.id),
        `legend ${legend}`,
      ).toEqual([]);
    }
    for (const bounty of of('bounty_set')) {
      const legend = bounty.actors[1]!;
      const harm = world.events.find((e) => e.id === bounty.causes[0]);
      expect(harm, `bounty ${bounty.id}`).toBeDefined();
      const hurt =
        (harm!.type === 'notable_died' &&
          harm!.actors[1] === legend &&
          world.people.get(harm!.actors[0]!)!.killerId === legend) ||
        (harm!.type === 'champion_fought' &&
          harm!.actors[0] === legend &&
          harm!.data.enemy === bounty.data.civ) ||
        harm!.type === 'battle';
      expect(hurt, `bounty ${bounty.id} cites ${harm!.type}`).toBe(true);
    }
  });
});
