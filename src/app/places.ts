// Perilous places (M4.7) as the screens show them: each ruin, old mine, barrow, empty lair and aura
// place with what lies there, the companies that went in and the dead it kept. Read only from the
// record; the Tales map marks, the place page and the Book's list all use it. Pure: no DOM.

import { eventYear, type Id, type SimEvent, type WorldState } from '../engine';

export type PlaceKind = 'ruin' | 'old-mine' | 'barrow' | 'lair' | 'aura';

export const PLACE_KINDS: readonly {
  id: PlaceKind;
  label: string;
  what: string;
  /** Said of one there since the world began. */
  ancient: string;
}[] = [
  { id: 'ruin', label: 'ruin', what: 'a ruin', ancient: 'an ancient ruin' },
  { id: 'old-mine', label: 'old mine', what: 'an old mine', ancient: 'a mine of the elder days' },
  { id: 'barrow', label: 'barrow', what: 'a barrow', ancient: 'an ancient barrow' },
  { id: 'lair', label: 'empty lair', what: 'an empty lair', ancient: 'an ancient lair' },
  { id: 'aura', label: 'place of power', what: 'a place of power', ancient: 'a place of power' },
];

const isKind = (k: string): k is PlaceKind => PLACE_KINDS.some((p) => p.id === k);
export const placeKindLabel = (k: PlaceKind) => PLACE_KINDS.find((p) => p.id === k)!.label;

/** How an expedition ended. */
export type Outcome = 'treasure' | 'lore' | 'glory' | 'driven' | 'lost';

export interface Expedition {
  /** The setting-out event; its year is the expedition's. */
  id: Id;
  year: number;
  /** The leader, or null for a band of commoners. */
  leaderId: Id | null;
  who: string;
  /** The town it set out from. */
  from: string;
  party: number;
  outcome: Outcome | null;
  /** The event that ended it. */
  endId: Id | null;
  /** Companions who did not come back. */
  dead: number;
  /** What it brought out (an item's name), if anything. */
  found: string;
}

export interface PlaceInfo {
  id: Id;
  kind: PlaceKind;
  name: string;
  cell: number;
  /** History year it became a place (0 for the ancient ones). */
  since: number;
  /** Year nothing was left to find. */
  emptied?: number;
  danger: number;
  /** Treasures or lore still to be found besides the items lying there. */
  finds: number;
  /** The ruined town, for ruins and old mines. */
  siteId?: Id;
  /** The beast whose lair it was. */
  creatureId?: Id;
  /** The ruler buried in a barrow, and the realm that raised it. */
  buriedId?: Id;
  civId?: Id;
  /** The dead that walked out of it once robbed, and the year they woke. */
  woke?: { year: number; creatureId?: Id; name: string };
  expeditions: Expedition[];
  /** Everyone who died there: companions lost plus named figures. */
  deaths: number;
  /** Named figures who died there, oldest first. */
  fallen: Id[];
  /** Items lying there at the end of history. */
  lying: Id[];
  /** Event ids, oldest first. */
  deeds: Id[];
}

const OUTCOMES: Record<string, Outcome> = {
  expedition_treasure: 'treasure',
  expedition_lore: 'lore',
  expedition_glory: 'glory',
};

/** Every perilous place in the world, by id. */
export function allPlaces(world: WorldState): PlaceInfo[] {
  const events = new Map(world.events.map((e) => [e.id, e]));
  // Named figures who died in a place: their death event stands at its cell, caused by its failure.
  const deathsByCause = new Map<Id, Id[]>();
  for (const e of world.events) {
    if (e.type !== 'notable_died') continue;
    for (const c of e.causes) {
      const list = deathsByCause.get(c) ?? [];
      if (e.actors[0] !== undefined) list.push(e.actors[0]);
      deathsByCause.set(c, list);
    }
  }
  const lyingAt = new Map<number, Id[]>();
  for (const item of world.items.values()) {
    if (item.holder !== null || item.lostAt === undefined || item.burned !== undefined) continue;
    const list = lyingAt.get(item.lostAt) ?? [];
    list.push(item.id);
    lyingAt.set(item.lostAt, list);
  }
  const wokeBy = new Map<Id, Id>();
  for (const c of world.creatures.values()) if (c.dead) wokeBy.set(c.dead.placeId, c.id);

  const out: PlaceInfo[] = [];
  for (const place of [...world.places.values()].sort((a, b) => a.id - b.id)) {
    if (!isKind(place.kind)) continue;
    const deeds = place.deeds.map((id) => events.get(id)).filter((e): e is SimEvent => !!e);
    const expeditions: Expedition[] = [];
    const fallen: Id[] = [];
    let woke: PlaceInfo['woke'];
    for (const e of deeds) {
      if (e.type === 'expedition_set_out') {
        expeditions.push({
          id: e.id,
          year: eventYear(e),
          leaderId: e.actors[0] ?? null,
          who: String(e.data.who ?? ''),
          from: String(e.data.site ?? ''),
          party: Number(e.data.party) || 0,
          outcome: null,
          endId: null,
          dead: 0,
          found: '',
        });
        continue;
      }
      if (e.type === 'barrow_woke') {
        const creatureId = wokeBy.get(place.id);
        woke = {
          year: eventYear(e),
          ...(creatureId !== undefined ? { creatureId } : {}),
          name: String(e.data.beast ?? ''),
        };
        continue;
      }
      const ex = expeditions.find((x) => e.causes.includes(x.id));
      if (!ex) continue;
      const lost = deathsByCause.get(e.id) ?? [];
      fallen.push(...lost);
      ex.endId = e.id;
      ex.dead = Number(e.data.dead) || 0;
      ex.found = String(e.data.item ?? '');
      ex.outcome =
        e.type === 'expedition_failed' ? (lost.length > 0 ? 'lost' : 'driven') : OUTCOMES[e.type]!;
    }
    out.push({
      id: place.id,
      kind: place.kind,
      name: place.name,
      cell: place.cell,
      since: place.since,
      ...(place.emptied !== undefined ? { emptied: place.emptied } : {}),
      danger: place.danger,
      finds: place.finds,
      ...(place.siteId !== undefined ? { siteId: place.siteId } : {}),
      ...(place.creatureId !== undefined ? { creatureId: place.creatureId } : {}),
      ...(place.personId !== undefined ? { buriedId: place.personId } : {}),
      ...(place.civId !== undefined ? { civId: place.civId } : {}),
      ...(woke ? { woke } : {}),
      expeditions,
      deaths: expeditions.reduce((n, x) => n + x.dead, 0) + fallen.length,
      fallen,
      lying: lyingAt.get(place.cell) ?? [],
      deeds: place.deeds,
    });
  }
  return out;
}

/** The places there were by `year`. */
export const placesAt = (places: readonly PlaceInfo[], year: number): PlaceInfo[] =>
  places.filter((p) => p.since <= year);

/** Emptied by `year`: nothing left to find. */
export const emptiedBy = (p: PlaceInfo, year: number) =>
  p.emptied !== undefined && p.emptied <= year;

/** A word for how dangerous a place is, from its danger in soldier equivalents. */
export function dangerWord(danger: number): string {
  if (danger <= 3) return 'uneasy';
  if (danger <= 7) return 'perilous';
  if (danger <= 14) return 'deadly';
  return 'dreadful';
}

/** "an ancient ruin", "a barrow raised in year 132", "an empty lair since year 88". */
export function placeWhat(p: PlaceInfo): string {
  const def = PLACE_KINDS.find((k) => k.id === p.kind)!;
  const what = def.what;
  if (p.since === 0) return def.ancient;
  if (p.kind === 'barrow') return `${what} raised in year ${p.since}`;
  return `${what} since year ${p.since}`;
}

/** The expeditions set out by `year`, and the dead from those that had ended by then. */
export function storyBy(p: PlaceInfo, year: number): { expeditions: number; deaths: number } {
  const went = p.expeditions.filter((x) => x.year <= year);
  const dead = went.reduce((n, x) => n + x.dead + (x.outcome === 'lost' ? 1 : 0), 0);
  return { expeditions: went.length, deaths: dead };
}

/** One line for a mark's tooltip: "The Barrow of Ana, a barrow raised in year 132; 3 expeditions, 4 dead". */
export function placeLine(p: PlaceInfo, year: number): string {
  const name = p.name.charAt(0).toUpperCase() + p.name.slice(1);
  const { expeditions, deaths } = storyBy(p, year);
  const parts = [`${name}, ${placeWhat(p)}`];
  const told: string[] = [];
  if (expeditions > 0)
    told.push(`${expeditions} ${expeditions === 1 ? 'expedition' : 'expeditions'}`);
  if (deaths > 0) told.push(`${deaths} dead`);
  if (told.length > 0) parts.push(told.join(', '));
  if (p.woke && p.woke.year <= year) parts.push('its dead woke');
  else if (emptiedBy(p, year)) parts.push('emptied');
  return parts.join('; ');
}

/** How an expedition ended, in a few words: "came back with the Grey Harp", "was lost". */
export function outcomeText(x: Expedition): string {
  switch (x.outcome) {
    case 'treasure':
    case 'lore':
      return x.found ? `came back with ${x.found}` : 'came back with a find';
    case 'glory':
      return 'came back with glory and nothing else';
    case 'driven':
      return 'was driven back';
    case 'lost':
      return x.leaderId === null ? 'was lost' : 'was lost, the leader with them';
    case null:
      return 'set out';
  }
}

/** The most storied places first: deaths, then expeditions, then the oldest. */
export const byStory = (a: PlaceInfo, b: PlaceInfo) =>
  b.deaths - a.deaths || b.expeditions.length - a.expeditions.length || a.id - b.id;
