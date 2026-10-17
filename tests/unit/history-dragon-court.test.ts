import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import { DAYS_PER_YEAR, generateWorld, type SimEvent } from '../../src/engine';

// Realms near a dragon rarely get that far in a small world, so the chances are raised: every rule
// still runs, just more often. The worlds of a short fixed seed list are checked together.
const content = {
  ...DEFAULT_CONTENT,
  dragons: {
    ...DEFAULT_CONTENT.dragons,
    court: {
      ...DEFAULT_CONTENT.dragons.court,
      fearHarms: 1,
      answerChance: 1,
      courtChance: 0.5,
    },
    tempers: DEFAULT_CONTENT.dragons.tempers.map((t) => ({ ...t, courtAccept: 1 })),
  },
};
const yearOf = (e: SimEvent) => Math.floor(e.day / DAYS_PER_YEAR);
const worlds = Array.from({ length: 8 }, (_, i) =>
  generateWorld(`DC-${i + 1}`, { width: 128, height: 128, historyYears: 250 }, content),
);
const all = (type: string) =>
  worlds.flatMap((world) =>
    world.events.filter((e) => e.type === type).map((event) => ({ world, event })),
  );

describe('dragon at court', () => {
  it('has a taker for each bounty, cited, who hunts the same year', () => {
    const taken = all('dragon_bounty_taken');
    expect(taken.length).toBeGreaterThan(0);
    for (const { world, event } of taken) {
      expect(world.events.find((e) => e.id === event.causes[0])?.type).toBe('dragon_bounty_set');
      const hunt = world.events.find(
        (e) =>
          (e.type === 'beast_slain' || e.type === 'beast_hunt_failed') &&
          e.causes.includes(event.id) &&
          e.actors[0] === event.actors[0] &&
          yearOf(e) === yearOf(event),
      );
      expect(hunt, `bounty taken ${event.id}`).toBeDefined();
    }
  });

  it('spares the towns of a realm in pact with the dragon', () => {
    const pacts = all('dragon_pact');
    expect(pacts.length).toBeGreaterThan(0);
    for (const { world, event: pact } of pacts) {
      const fell = [...world.civs.values()].find((c) => c.name === pact.data.civ)?.fell;
      for (const e of world.events) {
        if (e.type !== 'dragon_tribute' && e.type !== 'beast_raid') continue;
        if (e.data.beast !== pact.data.beast || e.data.civ !== pact.data.civ) continue;
        if (yearOf(e) <= yearOf(pact)) continue;
        expect(fell !== undefined && yearOf(e) >= fell, `${e.type} ${e.id} after pact`).toBe(true);
      }
    }
  });

  it('looses a courted dragon only on a realm at war with the courter', () => {
    const unleashed = all('dragon_unleashed');
    expect(unleashed.length).toBeGreaterThan(0);
    for (const { world, event } of unleashed) {
      const courting = world.events.find((e) => e.id === event.causes[0]);
      expect(courting?.type).toBe('dragon_courted');
      expect(courting?.data.civ).toBe(event.data.civ);
      // A war is declared, or a civil war begins between the parent realm and the rebel's.
      const war = world.events.find(
        (e) =>
          (e.type === 'war_declared' &&
            ((e.data.civ === event.data.civ && e.data.enemy === event.data.struck) ||
              (e.data.civ === event.data.struck && e.data.enemy === event.data.civ))) ||
          (e.type === 'civil_war_began' &&
            ((e.data.civ === event.data.civ && e.data.from === event.data.struck) ||
              (e.data.civ === event.data.struck && e.data.from === event.data.civ))),
      );
      expect(war, `unleashed ${event.id}`).toBeDefined();
      const raid = world.events.find((e) => e.type === 'beast_raid' && e.causes.includes(event.id));
      expect(raid?.data.site).toBe(event.data.site);
    }
  });
});
