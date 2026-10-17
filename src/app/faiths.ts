// Faiths (#109) as the screens show them: each faith's gods, holy city, high priests in order, its
// prophets and schisms, the holy wars fought in its name and the realms and towns that keep it.
// Read only from the record: faith events name a faith by its name, which is unique in a world.
// The faith page, the Legends list and the Book's list all use it. Pure: no DOM.

import {
  eventYear,
  sitePopulation,
  type Faith,
  type Id,
  type SimEvent,
  type WorldState,
} from '../engine';

/** Faith event types; a faith's chronicle is every one of these that names it. */
export const FAITH_EVENT_TYPES = [
  'high_priest_named',
  'heresy_denounced',
  'site_converted',
  'ruler_converted',
  'prophet_rose',
  'holy_war_preached',
  'faith_schism',
  'faith_spread',
  'faith_forgotten',
  'holy_war_proclaimed',
  'temple_desecrated',
  'holy_city_taken',
] as const;

/** Event data keys that may hold a faith's name. */
const NAME_KEYS = ['faith', 'otherFaith', 'parent', 'from'] as const;

export interface HighPriest {
  personId: Id;
  name: string;
  /** The title the faith gives its high priest ("Archdruid"). */
  rank: string;
  year: number;
  /** Where they were named. */
  site: string;
  event: Id;
}

export interface HolyWar {
  event: Id;
  year: number;
  /** The realm that went to war, and the realm it went to war on. */
  civ: string;
  enemy: string;
  /** Preached by a prophet, not proclaimed by a realm. */
  preached: boolean;
  /** Who proclaimed or preached it: the prophet's name, or the priest phrase ("the Gothi Hrolna of The Hall"). */
  by: string;
  byId?: Id;
}

export interface FaithInfo {
  id: Id;
  name: string;
  gods: string[];
  sacred: string[];
  abhors: string;
  founded: number;
  parentId?: Id;
  founderId?: Id;
  /** Faiths that split from this one, oldest first. */
  children: Id[];
  /** The holy city while it keeps the faith. */
  seatSiteId?: Id;
  /** The live realm holding the holy city when it is not one of the realms keeping the faith. */
  seatHolder?: Id;
  /** The last time the holy city was taken, if the faith has none now. */
  seatLost?: { year: number; site: string; by: string; event: Id };
  highPriestId?: Id;
  forgotten?: number;
  /** The god the chroniclers named when it was forgotten. */
  forgottenGod?: string;
  /** Live realms whose rulers keep it at the end of history, largest first. */
  realms: Id[];
  /** Live towns that keep it at the end of history. */
  towns: number;
  /** Live towns keeping it that lie outside those realms. */
  otherTowns: Id[];
  highPriests: HighPriest[];
  /** Prophets who rose in it (prophet_rose events). */
  prophets: Id[];
  holyWars: HolyWar[];
  /** Every faith event naming it, oldest first. */
  deeds: Id[];
}

const isFaithEvent = (e: SimEvent) => (FAITH_EVENT_TYPES as readonly string[]).includes(e.type);

/** Every faith in the world, by id. */
export function allFaiths(world: WorldState): FaithInfo[] {
  const byName = new Map<string, Faith>();
  for (const f of [...world.faiths.values()].sort((a, b) => a.id - b.id))
    if (!byName.has(f.name)) byName.set(f.name, f);
  const deeds = new Map<Id, SimEvent[]>();
  for (const e of world.events) {
    if (!isFaithEvent(e)) continue;
    const named = new Set<Id>();
    for (const key of NAME_KEYS) {
      const f = typeof e.data[key] === 'string' ? byName.get(e.data[key]) : undefined;
      if (f) named.add(f.id);
    }
    for (const id of named) {
      const list = deeds.get(id) ?? [];
      list.push(e);
      deeds.set(id, list);
    }
  }
  const pop = new Map<Id, number>();
  for (const s of world.sites.values())
    if (s.civId !== null && s.ruinedYear === undefined)
      pop.set(s.civId, (pop.get(s.civId) ?? 0) + sitePopulation(s));

  const out: FaithInfo[] = [];
  for (const faith of [...world.faiths.values()].sort((a, b) => a.id - b.id)) {
    const mine = deeds.get(faith.id) ?? [];
    const own = mine.filter((e) => e.data.faith === faith.name);
    const highPriests: HighPriest[] = own
      .filter((e) => e.type === 'high_priest_named' && e.actors[0] !== undefined)
      .map((e) => ({
        personId: e.actors[0]!,
        name: String(e.data.name ?? world.people.get(e.actors[0]!)?.name ?? '?'),
        rank: String(e.data.rank ?? 'high priest'),
        year: eventYear(e),
        site: String(e.data.site ?? ''),
        event: e.id,
      }));
    const holyWars: HolyWar[] = own
      .filter((e) => e.type === 'holy_war_proclaimed' || e.type === 'holy_war_preached')
      .map((e) => ({
        event: e.id,
        year: eventYear(e),
        civ: String(e.data.civ ?? ''),
        enemy: String(e.data.enemy ?? e.data.other ?? ''),
        preached: e.type === 'holy_war_preached',
        by: String(e.type === 'holy_war_preached' ? (e.data.name ?? '') : (e.data.priest ?? '')),
        ...(e.actors[0] !== undefined ? { byId: e.actors[0] } : {}),
      }));
    const prophets = own
      .filter((e) => e.type === 'prophet_rose' && e.actors[0] !== undefined)
      .map((e) => e.actors[0]!);
    const seat = faith.seatSiteId === undefined ? undefined : world.sites.get(faith.seatSiteId);
    const taken = own.filter((e) => e.type === 'holy_city_taken').at(-1);
    const live = faith.forgotten === undefined;
    const realms = live
      ? [...world.civs.values()]
          .filter((c) => c.fell === undefined && c.faithId === faith.id)
          .sort((a, b) => (pop.get(b.id) ?? 0) - (pop.get(a.id) ?? 0) || a.id - b.id)
          .map((c) => c.id)
      : [];
    const keeping = live
      ? [...world.sites.values()]
          .filter((s) => s.ruinedYear === undefined && s.faithId === faith.id)
          .sort((a, b) => a.id - b.id)
      : [];
    const otherTowns = keeping
      .filter((s) => s.civId === null || !realms.includes(s.civId))
      .map((s) => s.id);
    const holder = seat && live && seat.civId !== null ? world.civs.get(seat.civId) : undefined;
    const forgottenEvent = own.find((e) => e.type === 'faith_forgotten');
    out.push({
      id: faith.id,
      name: faith.name,
      gods: faith.gods,
      sacred: faith.sacred,
      abhors: faith.abhors,
      founded: faith.founded,
      ...(faith.parentId !== undefined ? { parentId: faith.parentId } : {}),
      ...(faith.founderId !== undefined ? { founderId: faith.founderId } : {}),
      children: [...world.faiths.values()]
        .filter((f) => f.parentId === faith.id)
        .sort((a, b) => a.founded - b.founded || a.id - b.id)
        .map((f) => f.id),
      ...(seat && live ? { seatSiteId: seat.id } : {}),
      ...(holder && holder.fell === undefined && !realms.includes(holder.id)
        ? { seatHolder: holder.id }
        : {}),
      ...(!seat && taken
        ? {
            seatLost: {
              year: eventYear(taken),
              site: String(taken.data.site ?? ''),
              by: String(taken.data.civ ?? ''),
              event: taken.id,
            },
          }
        : {}),
      ...(faith.highPriestId !== undefined && live ? { highPriestId: faith.highPriestId } : {}),
      ...(faith.forgotten !== undefined ? { forgotten: faith.forgotten } : {}),
      ...(typeof forgottenEvent?.data.god === 'string'
        ? { forgottenGod: forgottenEvent.data.god }
        : {}),
      realms,
      towns: keeping.length,
      otherTowns,
      highPriests,
      prophets,
      holyWars,
      deeds: mine.map((e) => e.id),
    });
  }
  return out;
}

/** "one god, Cernun" or "four gods: Wodar, Thrunn, Freyna and Hald". */
export function godsText(gods: readonly string[]): string {
  if (gods.length === 1) return `one god, ${gods[0]}`;
  const words = ['', 'one', 'two', 'three', 'four', 'five', 'six'];
  return `${words[gods.length] ?? gods.length} gods: ${andList(gods)}`;
}

/** "a, b and c". */
export function andList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** One line for a list row: "3 realms, 19 towns · 6 high priests", or "forgotten Year 100". */
export function faithLine(f: FaithInfo): string {
  const parts: string[] = [];
  if (f.forgotten !== undefined) parts.push(`forgotten Year ${f.forgotten}`);
  else {
    const kept: string[] = [];
    if (f.realms.length > 0)
      kept.push(`${f.realms.length} ${f.realms.length === 1 ? 'realm' : 'realms'}`);
    kept.push(`${f.towns} ${f.towns === 1 ? 'town' : 'towns'}`);
    parts.push(kept.join(', '));
  }
  const wars = f.holyWars.filter((w) => !w.preached).length;
  if (wars > 0) parts.push(`${wars} holy ${wars === 1 ? 'war' : 'wars'}`);
  if (f.children.length > 0)
    parts.push(`${f.children.length} ${f.children.length === 1 ? 'schism' : 'schisms'}`);
  return parts.join(' · ');
}

/** Living faiths first, most towns first; then the forgotten, latest first. */
export const byFollowing = (a: FaithInfo, b: FaithInfo) =>
  (a.forgotten === undefined ? 0 : 1) - (b.forgotten === undefined ? 0 : 1) ||
  b.towns - a.towns ||
  (b.forgotten ?? 0) - (a.forgotten ?? 0) ||
  a.id - b.id;
