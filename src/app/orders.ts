// Knightly orders and magic academies (#135) as the screens show them: founder, seat, heads in
// order, every member with the best deed they did while they served, the spells an academy keeps
// or has lost, and the hunts its knights rode. Read only from the record: order events name an
// order by its name, which is unique in a world. The order page, the Legends list, person chips and
// realm and town pages all use it. Pure: no DOM.

import {
  eventYear,
  type ContentBundle,
  type Id,
  type Order,
  type Person,
  type SimEvent,
  type WorldState,
} from '../engine';
import { DEED_GROUPS } from './people/data';

/** Event types that name an order in `data.order`; its chronicle is every one of these. */
export const ORDER_EVENT_TYPES = [
  'order_founded',
  'academy_founded',
  'order_joined',
  'order_head',
  'order_moved',
  'order_passed',
  'order_ended',
  'academy_lore_lost',
] as const;
const ORDER_TYPES = new Set<string>(ORDER_EVENT_TYPES);
const HUNT_TYPES = new Set(['beast_slain', 'beast_hunt_failed']);
/** What counts as a member's deed: the person page's deed groups, and a hunt that failed. */
const DEED_TYPES = new Set<string>([...DEED_GROUPS.flatMap((g) => g.types), 'beast_hunt_failed']);

export interface OrderHead {
  personId: Id;
  /** The year they took the mastery (the founding year for the founder). */
  from: number;
  /** The year the mastery passed on or the order ended; absent while they lead it. */
  to?: number;
  event: Id;
}

export interface OrderMember {
  personId: Id;
  /** The joining year and event, while the record keeps them (minor joinings are pruned). */
  joined?: number;
  event?: Id;
  /** Alive, of the order's people, and the order still stands. */
  serving: boolean;
  /** The member's most important deed since they joined (or since the founding when that is not
   * on record): spells, battles, plots, works and the like, as the person page groups them. */
  best?: Id;
}

export interface OrderSpell {
  id: string;
  name: string;
  lost?: number;
  lostEvent?: Id;
}

export interface OrderInfo {
  id: Id;
  kind: Order['kind'];
  name: string;
  founded: number;
  ended?: number;
  endEvent?: Id;
  founderId: Id;
  siteId: Id | null;
  civId: Id | null;
  school?: string;
  heads: OrderHead[];
  /** Everyone who ever joined, in the order they joined (founder first). */
  members: OrderMember[];
  serving: number;
  /** Academy: the founder's spells, kept or lost. */
  lore: OrderSpell[];
  /** Beasts its knights rode out against for a raid on their people. */
  hunts: Id[];
  /** Witch hunts its knights rode in. */
  witchHunts: Id[];
  /** Its own events and the witch hunts its knights rode in, oldest first. */
  deeds: Id[];
}

/** "knight" or "scholar", and their plural. */
export const memberWord = (kind: Order['kind'], n = 1) =>
  kind === 'order' ? (n === 1 ? 'knight' : 'knights') : n === 1 ? 'scholar' : 'scholars';

const cache = new WeakMap<WorldState, OrderInfo[]>();

/** Every order and academy, oldest first. Cached per world. */
export function allOrders(
  world: WorldState,
  content: Pick<ContentBundle, 'abilities'>,
): OrderInfo[] {
  const hit = cache.get(world);
  if (hit) return hit;
  const byId = new Map<Id, SimEvent>();
  const own = new Map<string, SimEvent[]>();
  const witch: SimEvent[] = [];
  for (const e of world.events) {
    byId.set(e.id, e);
    if (ORDER_TYPES.has(e.type)) {
      const name = String(e.data.order ?? '');
      const list = own.get(name) ?? [];
      list.push(e);
      own.set(name, list);
    } else if (e.type === 'mage_hunted' && e.data.knights) witch.push(e);
  }
  const final = world.params.historyYears;
  const spellName = new Map(content.abilities.map((a) => [a.id, a.name]));
  const out = [...world.orders.values()]
    .sort((a, b) => a.founded - b.founded || a.id - b.id)
    .map((order) =>
      describe(world, order, own.get(order.name) ?? [], witch, byId, final, spellName),
    );
  cache.set(world, out);
  return out;
}

function describe(
  world: WorldState,
  order: Order,
  events: SimEvent[],
  witch: SimEvent[],
  byId: ReadonlyMap<Id, SimEvent>,
  final: number,
  spellName: ReadonlyMap<string, string>,
): OrderInfo {
  const standing = order.ended === undefined;
  // Heads: the founder from the founding, then each order_head event in turn.
  const headEvents = events.filter((e) => e.type === 'order_head');
  const heads: OrderHead[] = order.heads.map((personId, k) => {
    const event = k === 0 ? undefined : headEvents.find((e) => e.actors[0] === personId);
    return {
      personId,
      from: event ? eventYear(event) : order.founded,
      event: event?.id ?? order.event,
    };
  });
  heads.forEach((head, k) => {
    const next = heads[k + 1];
    if (next) head.to = next.from;
    else if (order.ended !== undefined) head.to = order.ended;
  });

  const joinedBy = new Map<Id, SimEvent>();
  for (const e of events)
    if (e.type === 'order_joined' && !joinedBy.has(e.actors[0]!)) joinedBy.set(e.actors[0]!, e);
  const members: OrderMember[] = [];
  const windows = new Map<Id, [number, number]>();
  for (const personId of order.members) {
    const person = world.people.get(personId);
    const founder = personId === order.founderId;
    const join = joinedBy.get(personId);
    const joined = founder ? order.founded : join ? eventYear(join) : undefined;
    const from = joined ?? order.founded;
    const until = Math.min(person?.died ?? final, order.ended ?? final);
    windows.set(personId, [from, until]);
    const best = person ? bestDeed(person, byId, from, until) : undefined;
    const event = founder ? order.event : join?.id;
    members.push({
      personId,
      ...(joined !== undefined ? { joined } : {}),
      ...(event !== undefined ? { event } : {}),
      serving:
        standing &&
        person !== undefined &&
        person.died === undefined &&
        person.civId === order.civId,
      ...(best !== undefined ? { best } : {}),
    });
  }

  const lostAt = new Map<string, SimEvent>();
  for (const e of events) {
    if (e.type !== 'academy_lore_lost') continue;
    const text = String(e.data.spells ?? '');
    for (const id of order.lost) {
      const name = spellName.get(id) ?? id;
      if (!lostAt.has(id) && text.includes(name)) lostAt.set(id, e);
    }
  }
  const lore: OrderSpell[] = order.lore.map((id) => {
    const lost = order.lost.includes(id) ? lostAt.get(id) : undefined;
    return {
      id,
      name: spellName.get(id) ?? id,
      ...(lost ? { lost: eventYear(lost), lostEvent: lost.id } : {}),
    };
  });

  // Only the knights' own hunts set out from a raid on their people (orders.ts knightHunts).
  const hunts: Id[] = [];
  if (order.kind === 'order') {
    for (const personId of order.members) {
      const person = world.people.get(personId);
      const window = windows.get(personId);
      if (!person || !window) continue;
      for (const id of person.deeds) {
        const e = byId.get(id);
        if (!e || !HUNT_TYPES.has(e.type) || e.actors[0] !== personId) continue;
        const year = eventYear(e);
        if (year < window[0] || year > window[1]) continue;
        if (byId.get(e.causes[0] ?? -1)?.type === 'beast_raid') hunts.push(e.id);
      }
    }
    hunts.sort((a, b) => a - b);
  }
  const knights = `knights of ${order.name} `;
  const witchHunts = witch.filter((e) => String(e.data.knights).includes(knights)).map((e) => e.id);
  const deeds = [...events.map((e) => e.id), ...witchHunts].sort((a, b) => a - b);

  return {
    id: order.id,
    kind: order.kind,
    name: order.name,
    founded: order.founded,
    ...(order.ended !== undefined ? { ended: order.ended } : {}),
    ...(order.endEvent !== undefined ? { endEvent: order.endEvent } : {}),
    founderId: order.founderId,
    siteId: order.siteId,
    civId: order.civId,
    ...(order.school !== undefined ? { school: order.school } : {}),
    heads,
    members,
    serving: members.filter((m) => m.serving).length,
    lore,
    hunts,
    witchHunts,
    deeds,
  };
}

/** The person's most important deed within the years. */
function bestDeed(
  person: Person,
  byId: ReadonlyMap<Id, SimEvent>,
  from: number,
  to: number,
): Id | undefined {
  let best: SimEvent | undefined;
  for (const id of person.deeds) {
    const e = byId.get(id);
    if (!e || !DEED_TYPES.has(e.type)) continue;
    const year = eventYear(e);
    if (year < from || year > to) continue;
    if (!best || e.importance > best.importance) best = e;
  }
  return best?.id;
}

/** A Legends row's line: "Knightly order · Iron Folk · 6 knights", or "Academy of fire · ended". */
export function orderLine(info: OrderInfo, world: WorldState): string {
  const what = info.kind === 'order' ? 'Knightly order' : `Academy of ${info.school ?? 'magic'}`;
  if (info.ended !== undefined) return `${what} · ended`;
  const civ = info.civId === null ? undefined : world.civs.get(info.civId);
  const members = `${info.serving} ${memberWord(info.kind, info.serving)}`;
  return [what, civ?.name, members].filter((part) => part).join(' · ');
}

/** What a person is to the orders, the most senior first: founder, master, then knight or scholar. */
export function personOrder(
  orders: readonly OrderInfo[],
  personId: Id,
): { title: string; order: OrderInfo } | undefined {
  const founded = orders.find((o) => o.founderId === personId);
  if (founded) return { title: 'Founder of', order: founded };
  const headed = orders.findLast((o) => o.heads.some((h) => h.personId === personId));
  if (headed) return { title: 'Master of', order: headed };
  const joined = orders.findLast((o) => o.members.some((m) => m.personId === personId));
  if (joined) return { title: joined.kind === 'order' ? 'Knight of' : 'Scholar of', order: joined };
  return undefined;
}
