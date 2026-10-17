import { describe, expect, it } from 'vitest';
import {
  FADE_YEARS,
  SETTLE_YEARS,
  buildSettlers,
  buildWarHosts,
  hostAt,
  pickGroups,
  settlersAt,
  type WalkEvent,
  type WarHosts,
} from '../../src/app/tales/hosts';

const W = 100;
const grid = { width: W, height: 10, roads: new Uint8Array(W * 10) };
const centre = (cell: number) => ({ x: (cell % W) + 0.5, y: Math.floor(cell / W) + 0.5 });
const SEATS: Record<string, number> = { Alder: 10, Birch: 80 };
const seatCell = (name: string) => SEATS[name];

const battle = (
  t: number,
  place: number,
  civ: string,
  hostFrom: number,
  enemyHostFrom: number,
  winner: string,
): WalkEvent => ({
  t,
  y: Math.floor(t),
  type: 'battle',
  place,
  data: {
    war: 1,
    civ,
    enemy: civ === 'Alder' ? 'Birch' : 'Alder',
    site: 'Ash',
    winner,
    hostFrom,
    enemyHostFrom,
  },
});
const peace = (t: number): WalkEvent => ({
  t,
  y: Math.floor(t),
  type: 'peace_made',
  place: null,
  data: { war: 1 },
});

describe('war hosts', () => {
  it('retreat to the seat then march to the next battle, never overlapping', () => {
    const events = [
      battle(10.5, 50, 'Alder', 10, 80, 'Birch'),
      battle(12.5, 60, 'Alder', 10, 50, 'Birch'),
    ];
    const [war] = buildWarHosts(events, seatCell, grid, 100);
    const alder = war!.hosts.find((h) => h.civ === 'Alder')!;
    const birch = war!.hosts.find((h) => h.civ === 'Birch')!;
    expect(alder.legs.map((l) => [l.from, l.to])).toEqual([
      [10, 50],
      [50, 10],
      [10, 60],
      [60, 10],
    ]);
    for (const host of [alder, birch]) {
      for (let i = 1; i < host.legs.length; i += 1) {
        expect(host.legs[i]!.start).toBeGreaterThanOrEqual(host.legs[i - 1]!.end - 1e-9);
      }
    }
    for (const host of [alder, birch]) {
      const pose = hostAt(host, 10.5, W)!;
      expect(pose.moving).toBe(false);
      expect({ x: pose.x, y: pose.y }).toEqual(centre(50));
    }
    // Alder falls back to its seat after the first battle.
    expect(hostAt(alder, 11.5, W)!.x).toBeCloseTo(centre(10).x);
    expect(war!.battles[0]!.stay).toBeCloseTo(0.3);
  });

  it('walk home when the war ends; one that is still going stays', () => {
    const ended = buildWarHosts(
      [battle(20.2, 30, 'Alder', 10, 80, 'Alder'), peace(22)],
      seatCell,
      grid,
      100,
    )[0]!;
    expect(Number.isFinite(ended.vanish)).toBe(true);
    const alder = ended.hosts.find((h) => h.civ === 'Alder')!;
    expect(alder.legs[alder.legs.length - 1]).toMatchObject({ from: 30, to: 10 });
    expect(hostAt(alder, ended.vanish, W)).toBeNull();
    expect(hostAt(alder, ended.vanish - FADE_YEARS / 2, W)!.opacity).toBeCloseTo(0.5);

    const open = buildWarHosts([battle(98, 30, 'Alder', 10, 80, 'Alder')], seatCell, grid, 100)[0]!;
    expect(open.vanish).toBe(Infinity);
    expect(hostAt(open.hosts[0]!, 99.9, W)).not.toBeNull();
  });
});

describe('settlers', () => {
  it('arrive at the start of the founding year', () => {
    const events: WalkEvent[] = [
      { t: 50.3, y: 50, type: 'site_founded', place: 30, data: { site: 'New', from: 'Old' } },
      { t: 60.3, y: 60, type: 'site_founded', place: 5, data: { site: 'Start' } },
    ];
    const bands = buildSettlers(events, (n) => (n === 'Old' ? 10 : undefined), grid);
    expect(bands).toHaveLength(1);
    const band = bands[0]!;
    expect(band.end).toBe(50);
    expect(band.start).toBeCloseTo(50 - SETTLE_YEARS);
    expect(settlersAt(band, band.start - 0.01, W)).toBeNull();
    expect(settlersAt(band, band.start + 0.01, W)!.moving).toBe(true);
    const there = settlersAt(band, 50, W)!;
    expect(there.moving).toBe(false);
    expect({ x: there.x, y: there.y }).toEqual(centre(30));
    expect(settlersAt(band, 50 + FADE_YEARS, W)).toBeNull();
  });
});

describe('pickGroups', () => {
  const war = (id: number, appear: number): WarHosts => ({
    war: id,
    key: `war:${id}`,
    hosts: [],
    battles: [],
    appear,
    vanish: appear + 10,
  });
  const band = (n: number, start: number) => ({
    key: `s${n}`,
    from: 1,
    to: 2,
    fromName: 'X',
    site: 'Y',
    start,
    end: start + 0.8,
    year: Math.ceil(start + 0.8),
    path: () => [1, 2],
  });

  it('draws at most three groups and two wars, keeping the earlier wars', () => {
    const wars = [war(3, 3), war(1, 1), war(2, 2)];
    const bands = [band(1, 4), band(2, 4.1)];
    const picked = pickGroups(wars, bands, 4.2);
    expect(picked.wars.map((w) => w.war)).toEqual([1, 2]);
    expect(picked.settlers).toHaveLength(1);
    expect(picked.wars.length + picked.settlers.length).toBeLessThanOrEqual(3);
    // Once the first war is gone the waiting one takes its slot.
    expect(pickGroups(wars, [], 11.5).wars.map((w) => w.war)).toEqual([2, 3]);
  });
});
