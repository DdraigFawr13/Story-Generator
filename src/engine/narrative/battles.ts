// Named battles (M4.8): every battle takes the name of its place and some are great. Derived from
// the recorded events only; it draws no random numbers and changes no history.

import { DAYS_PER_YEAR } from '../core/clock';
import type { BattleRules } from '../core/content-types';
import type { Id, SimEvent, WorldState } from '../core/types';

export interface BattleRecord {
  eventId: Id;
  year: number;
  cell: number | null;
  /** "the Battle of Carrow Ford"; starts in lower case, so capitalise at a sentence start. */
  name: string;
  /** Soldiers lost on both sides. */
  lost: number;
  winner: string;
  /** Notables who died in the battle or in a champion's fight at it. */
  fallen: Id[];
  great: boolean;
}

/** Fills {key} slots without the capitalising and article fixes of the chronicle narrator. */
function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => vars[key] ?? '');
}

type BattleContent = { battles: BattleRules };

const memo = new WeakMap<
  WorldState,
  { events: number; records: BattleRecord[]; byId: Map<Id, BattleRecord> }
>();

/** "11th", "12th", "21st": the ordinal for numbers past the written words. */
function numberedOrdinal(n: number): string {
  const tens = n % 100;
  const suffix =
    tens >= 11 && tens <= 13
      ? 'th'
      : n % 10 === 1
        ? 'st'
        : n % 10 === 2
          ? 'nd'
          : n % 10 === 3
            ? 'rd'
            : 'th';
  return `${n}${suffix}`;
}

/** Cell index -> the pass or ford region it belongs to (the lowest id wins a shared cell). */
function crossings(world: WorldState): Map<number, { id: Id; name: string }> {
  const map = new Map<number, { id: Id; name: string }>();
  for (const region of [...world.regions.values()].sort((a, b) => a.id - b.id)) {
    if (region.kind !== 'pass' && region.kind !== 'ford') continue;
    for (const cell of region.cells) if (!map.has(cell)) map.set(cell, region);
  }
  return map;
}

/** The pass or ford nearest the cell within `radius` cells (square distance), or undefined. */
function crossingNear(
  world: WorldState,
  map: Map<number, { id: Id; name: string }>,
  cell: number,
  radius: number,
): string | undefined {
  const { width, height } = world.params;
  const cx = cell % width;
  const cy = Math.floor(cell / width);
  let best: { dist: number; id: Id; name: string } | undefined;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const hit = map.get(y * width + x);
      if (!hit) continue;
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      if (!best || dist < best.dist || (dist === best.dist && hit.id < best.id))
        best = { dist, id: hit.id, name: hit.name };
    }
  }
  return best?.name;
}

/** Every battle of the world in event order, named and marked great. Cached per world. */
export function battleRecords(world: WorldState, content: BattleContent): BattleRecord[] {
  return battleTable(world, content).records;
}

function battleTable(world: WorldState, content: BattleContent) {
  const cached = memo.get(world);
  if (cached && cached.events === world.events.length) return cached;
  const rules = content.battles;
  const led = new Map<Id, SimEvent[]>();
  for (const event of world.events)
    for (const cause of event.causes) {
      const list = led.get(cause);
      if (list) list.push(event);
      else led.set(cause, [event]);
    }
  const map = crossings(world);
  const seen = new Map<string, number>();
  const records: BattleRecord[] = [];
  for (const event of world.events) {
    if (event.type !== 'battle') continue;
    const site = typeof event.data.site === 'string' ? event.data.site : '';
    const place =
      (event.place === null
        ? undefined
        : crossingNear(world, map, event.place, rules.placeRadius)) ?? site;
    const nth = (seen.get(place) ?? 0) + 1;
    seen.set(place, nth);
    const name =
      nth === 1
        ? fill(rules.name, { place })
        : fill(rules.repeatName, {
            ordinal: rules.ordinals[nth - 1] ?? numberedOrdinal(nth),
            place,
          });
    // Deaths the battle caused itself or through a champion's fight at it.
    const direct = led.get(event.id) ?? [];
    const reached = [
      ...direct,
      ...direct.filter((e) => e.type === 'champion_fought').flatMap((e) => led.get(e.id) ?? []),
    ];
    const fallen: Id[] = [];
    for (const e of reached) {
      const who = e.actors[0];
      if (e.type === 'notable_died' && who !== undefined && !fallen.includes(who)) fallen.push(who);
    }
    records.push({
      eventId: event.id,
      year: Math.floor(event.day / DAYS_PER_YEAR),
      cell: event.place,
      name,
      lost: typeof event.data.lost === 'number' ? event.data.lost : 0,
      winner: typeof event.data.winner === 'string' ? event.data.winner : '',
      fallen,
      great: false,
    });
  }
  const deadliest = [...records]
    .sort((a, b) => b.lost - a.lost || a.eventId - b.eventId)
    .slice(0, rules.greatCount);
  const top = new Set(deadliest.map((r) => r.eventId));
  // A battle that killed a legend is great however few soldiers fell.
  const legends = new Set(
    world.events.flatMap((e) => (e.type === 'legend_risen' ? e.actors.slice(0, 1) : [])),
  );
  for (const record of records)
    record.great = top.has(record.eventId) || record.fallen.some((id) => legends.has(id));
  const table = {
    events: world.events.length,
    records,
    byId: new Map(records.map((r) => [r.eventId, r])),
  };
  memo.set(world, table);
  return table;
}

/** The record of one battle event, if it is a battle. */
export function battleOf(
  world: WorldState,
  content: BattleContent,
  eventId: Id,
): BattleRecord | undefined {
  return battleTable(world, content).byId.get(eventId);
}
