// The family tree of a house, worked out from a finished world: who is shown by default, what each
// card says, and where each card sits. Pure functions over the world and its event log; no DOM and
// no rules of their own (the history already decided who ruled, who wed and who fell).

import { eventYear, yearText, type ContentBundle, type Id, type WorldState } from '../../engine';
import { legendIds, rolesOf } from './data';

type TreeContent = Pick<ContentBundle, 'races' | 'schools' | 'biographies'>;

/** People shown by default when the house has many notable members. */
export const TREE_CAP = 60;
/** A house with fewer shown people than this adds its most famous members. */
export const TREE_MIN = 12;

/** Violent ends only; a quiet death says nothing. */
const DEATH_PHRASE: Record<string, string> = {
  battle: 'fell in battle',
  murder: 'murdered',
  assassination: 'assassinated',
  overthrow: 'overthrown',
  duel: 'slain in a duel',
  beast: 'killed by a beast',
  execution: 'executed',
};

export interface TreeSpouse {
  id: Id;
  name: string;
  /** The spouse's house, when it is another one. */
  house?: string;
  /** Wed to end a war; the enemy realm's name. */
  peace?: string;
}

export interface TreeRow {
  id: Id;
  name: string;
  years: string;
  /** Founder = 0. */
  generation: number;
  /** The in-house parent the tree hangs this person from; null for the founder. */
  parentId: Id | null;
  /** That parent's name, to tell apart relatives who share a name. */
  parentName?: string;
  civId: Id | null;
  /** The realm they served, for the card's caption. */
  realm: string;
  /** Held a seat: the realm and, when an event says so, the year they took it. */
  ruled?: { realm: string; year?: number };
  legend: boolean;
  /** Lost a disputed succession or began a civil war. */
  claimed: boolean;
  focus: boolean;
  /** The plain role (hero, smith...) for a card that is not a ruler. */
  role: string;
  death?: string;
  spouses: TreeSpouse[];
  /** In-house children, in id order. */
  children: Id[];
  /** Shown before anyone is expanded. */
  shown: boolean;
  /** In-house children not shown by default. */
  hidden: number;
  /** The edge from the parent lies on a path to someone who held a seat. */
  edgeOnLine: boolean;
}

export interface HouseHeader {
  id: Id;
  name: string;
  /** "Ruling house of the Kingdom of X" or "A house of the X". */
  role: string;
  founderId: Id;
  founderName: string;
  founded: number;
  members: number;
  seats: number;
  realms: string[];
  end?: { year: number; civ: string; house: string; houseId?: Id; byId: Id; byName: string };
}

export interface HouseTree {
  header: HouseHeader;
  /** Every member reachable from the founder, founder first, then by generation and id. */
  rows: TreeRow[];
}

interface Seat {
  realm: string;
  year: number;
}

/** The house's tree, or undefined when the house or its founder is not on record. */
export function houseTree(
  world: WorldState,
  dynastyId: Id,
  content: TreeContent,
  focus?: Id,
): HouseTree | undefined {
  const dynasty = world.dynasties.get(dynastyId);
  const founder = dynasty && world.people.get(dynasty.founderId);
  if (!dynasty || !founder) return undefined;
  const house = (id: Id) => world.people.get(id)?.dynastyId === dynastyId;

  // One pass over the log: seats taken, claims, peace weddings and the house's end.
  const seats = new Map<Id, Seat>();
  const claimants = new Set<Id>();
  const peace = new Map<string, string>();
  let end: HouseHeader['end'];
  for (const e of world.events) {
    const first = e.actors[0];
    if (first === undefined) continue;
    const year = eventYear(e);
    switch (e.type) {
      case 'ruler_succeeded':
      case 'city_freed':
      case 'seat_seized':
        if (house(first) && !seats.has(first)) {
          seats.set(first, { realm: String(e.data.civ ?? ''), year });
        }
        break;
      case 'civil_war_began':
        claimants.add(first);
        break;
      case 'succession_disputed':
        if (e.actors[1] !== undefined) claimants.add(e.actors[1]);
        break;
      case 'peace_by_marriage': {
        const groom = e.actors[1];
        if (groom !== undefined) peace.set(pairKey(first, groom), String(e.data.enemy ?? ''));
        break;
      }
      case 'dynasty_ended': {
        const by = e.actors[1];
        if (world.people.get(first)?.dynastyId === dynastyId && by !== undefined) {
          end = {
            year,
            civ: String(e.data.civ ?? ''),
            house: String(e.data.house ?? ''),
            ...(world.people.get(by)?.dynastyId !== undefined
              ? { houseId: world.people.get(by)!.dynastyId! }
              : {}),
            byId: by,
            byName: world.people.get(by)?.name ?? String(e.data.ruler ?? ''),
          };
        }
        break;
      }
    }
  }

  // The members, hung from the founder by their first in-house parent.
  const legends = legendIds(world);
  const members = [...world.people.values()]
    .filter((p) => p.dynastyId === dynastyId)
    .sort((a, b) => a.id - b.id);
  const parentOf = new Map<Id, Id>();
  const kids = new Map<Id, Id[]>();
  for (const p of members) {
    if (p.id === founder.id) continue;
    const up = p.family.parents.find((id) => id !== p.id && house(id));
    if (up === undefined) continue;
    parentOf.set(p.id, up);
    const list = kids.get(up);
    if (list) list.push(p.id);
    else kids.set(up, [p.id]);
  }
  const generation = new Map<Id, number>([[founder.id, 0]]);
  const order: Id[] = [founder.id];
  for (let i = 0; i < order.length; i++) {
    const id = order[i]!;
    for (const c of kids.get(id) ?? []) {
      if (generation.has(c)) continue;
      generation.set(c, generation.get(id)! + 1);
      order.push(c);
    }
  }
  const reached = order.filter((id) => world.people.has(id));

  const rulerIds = new Set<Id>();
  for (const id of reached) {
    const p = world.people.get(id)!;
    if (seats.has(id) || rolesOf(world, p, content).ruler) rulerIds.add(id);
  }
  const fameOf = (id: Id) => world.people.get(id)!.fame;
  const byFame = (a: Id, b: Id) => fameOf(b) - fameOf(a) || a - b;
  const rulers = [...rulerIds].sort(byFame);
  const focusId = focus !== undefined && generation.has(focus) ? focus : undefined;
  const notable = (id: Id) => {
    const p = world.people.get(id)!;
    return (p.title !== undefined && p.title !== 'kin') || legends.has(id);
  };
  const others = reached.filter((id) => !rulerIds.has(id) && notable(id)).sort(byFame);
  const rest = reached.filter((id) => !rulerIds.has(id) && !notable(id)).sort(byFame);

  // Shown people: the founder, then each seed with its path back, until the cap.
  const shown = new Set<Id>([founder.id]);
  const withPath = (id: Id) => {
    const path: Id[] = [];
    for (let at: Id | undefined = id; at !== undefined && !shown.has(at); at = parentOf.get(at)) {
      path.push(at);
    }
    if (shown.size + path.length > TREE_CAP) return;
    for (const p of path) shown.add(p);
  };
  for (const id of rulers) withPath(id);
  if (focusId !== undefined) withPath(focusId);
  for (const id of others) withPath(id);
  for (const id of rest) {
    if (shown.size >= TREE_MIN) break;
    withPath(id);
  }

  // Edges on the line of the seat: into anyone who is, or leads to, a ruler.
  const onLine = new Set<Id>();
  for (const id of rulers) {
    for (let at: Id | undefined = id; at !== undefined && !onLine.has(at); at = parentOf.get(at)) {
      onLine.add(at);
    }
  }

  const rows: TreeRow[] = reached.map((id) => {
    const p = world.people.get(id)!;
    const civ = p.civId == null ? undefined : world.civs.get(p.civId);
    const seat = seats.get(id);
    const ruled = rulerIds.has(id)
      ? { realm: seat?.realm || civ?.name || '', ...(seat ? { year: seat.year } : {}) }
      : undefined;
    const own = p.title === undefined ? '' : (content.biographies.roles[p.title] ?? '');
    const children = (kids.get(id) ?? []).filter((c) => generation.has(c));
    const spouses: TreeSpouse[] = [];
    for (const sid of p.family.spouses) {
      const s = world.people.get(sid);
      if (!s) continue;
      const home = s.dynastyId === undefined ? undefined : world.dynasties.get(s.dynastyId);
      const enemy = peace.get(pairKey(id, sid));
      spouses.push({
        id: sid,
        name: s.name,
        ...(home && home.id !== dynastyId ? { house: home.name } : {}),
        ...(enemy !== undefined ? { peace: enemy } : {}),
      });
    }
    const death = p.causeOfDeath === undefined ? undefined : DEATH_PHRASE[p.causeOfDeath];
    return {
      id,
      name: p.name,
      years:
        p.died === undefined
          ? `born Year ${yearText(p.born)}`
          : `Years ${yearText(p.born)} to ${yearText(p.died)}`,
      generation: generation.get(id)!,
      parentId: parentOf.get(id) ?? null,
      ...(parentOf.has(id) ? { parentName: world.people.get(parentOf.get(id)!)!.name } : {}),
      civId: p.civId ?? null,
      realm: civ?.name ?? '',
      ...(ruled ? { ruled } : {}),
      legend: legends.has(id),
      claimed: claimants.has(id),
      focus: id === focusId,
      role: own && own !== 'kinsman' && own !== 'ruler' ? own : '',
      ...(death ? { death } : {}),
      spouses,
      children,
      shown: shown.has(id),
      hidden: children.filter((c) => !shown.has(c)).length,
      edgeOnLine: onLine.has(id) && id !== founder.id,
    };
  });
  rows.sort((a, b) => a.generation - b.generation || a.id - b.id);

  // Realms ruled, by generation; a ruler with no event keeps their own realm.
  const realms = new Set<string>();
  for (const r of rows) if (r.ruled?.realm) realms.add(r.ruled.realm);

  const civ = dynasty.civId === null ? undefined : world.civs.get(dynasty.civId);
  const reigning = civ?.rulerId !== undefined && house(civ.rulerId);
  return {
    header: {
      id: dynasty.id,
      name: dynasty.name,
      role: civ
        ? `${reigning ? 'Ruling house of' : rulerIds.size > 0 ? 'Once the ruling house of' : 'A house of'} the ${civ.name}`
        : 'A house',
      founderId: founder.id,
      founderName: founder.name,
      founded: dynasty.founded,
      members: members.length,
      seats: rulerIds.size,
      realms: [...realms],
      ...(end ? { end } : {}),
    },
    rows,
  };
}

const pairKey = (a: Id, b: Id) => (a < b ? `${a}:${b}` : `${b}:${a}`);

export const CARD_W = 184;
export const CARD_H = 76;
const GAP_X = 14;
/** Room under a card for its pill and the connector bus. */
const GAP_Y = 52;
const PAD = 16;
/** The register (phone): indent per generation, capped so deep lines keep a readable card. */
const INDENT = 14;
const INDENT_MAX = 10;
const GAP_LIST = 10;
const PAD_LIST = 4;

export interface LaidCard {
  row: TreeRow;
  x: number;
  y: number;
  /** Card width: fixed in the tree, the rest of the row in the register. */
  w: number;
  /** Children not shown right now. */
  hidden: number;
  expanded: boolean;
  /** Has a "+N children" / "Hide children" pill. */
  pill: boolean;
}

export interface LaidEdge {
  from: Id;
  to: Id;
  line: boolean;
  /** Top-left corners of the two cards. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TreeLayout {
  cards: LaidCard[];
  edges: LaidEdge[];
  width: number;
  height: number;
}

/**
 * A tidy top-down layout: one row per generation, visible leaves on consecutive slots, each parent
 * centred over its visible children. A person in `expanded` shows every in-house child.
 */
export function layoutTree(
  rows: readonly TreeRow[],
  expanded: ReadonlySet<Id>,
  register?: { width: number },
): TreeLayout {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const root = rows.find((r) => r.parentId === null);
  if (!root) return { cards: [], edges: [], width: 0, height: 0 };
  const cards: LaidCard[] = [];
  const at = new Map<Id, LaidCard>();
  let slot = 0;
  const visibleKids = (row: TreeRow) => {
    const open = expanded.has(row.id);
    return row.children
      .map((c) => byId.get(c)!)
      .filter((c) => open || c.shown)
      .sort((a, b) => a.id - b.id);
  };
  if (register) {
    // The phone's register: one card a row in descent order, indented by generation.
    const list = (row: TreeRow) => {
      const kin = visibleKids(row);
      const x = PAD_LIST + Math.min(row.generation, INDENT_MAX) * INDENT;
      const card: LaidCard = {
        row,
        x,
        y: PAD_LIST + slot++ * (CARD_H + GAP_LIST),
        w: Math.max(CARD_W, register.width - x - PAD_LIST),
        hidden: row.children.length - kin.length,
        expanded: expanded.has(row.id) && row.hidden > 0,
        pill: row.hidden > 0,
      };
      cards.push(card);
      at.set(row.id, card);
      kin.forEach(list);
    };
    list(root);
  }
  const place = (row: TreeRow): number => {
    const open = expanded.has(row.id);
    const kin = visibleKids(row);
    const xs = kin.map(place);
    const x = xs.length > 0 ? (xs[0]! + xs[xs.length - 1]!) / 2 : slot++ * (CARD_W + GAP_X);
    const card: LaidCard = {
      row,
      x: x + PAD,
      y: PAD + row.generation * (CARD_H + GAP_Y),
      w: CARD_W,
      hidden: row.children.length - kin.length,
      expanded: open && row.hidden > 0,
      pill: row.hidden > 0,
    };
    cards.push(card);
    at.set(row.id, card);
    return x;
  };
  if (!register) place(root);
  if (!register) cards.sort((a, b) => a.row.generation - b.row.generation || a.x - b.x);
  const edges: LaidEdge[] = [];
  for (const c of cards) {
    const up = c.row.parentId === null ? undefined : at.get(c.row.parentId);
    if (!up) continue;
    edges.push({
      from: up.row.id,
      to: c.row.id,
      line: c.row.edgeOnLine,
      x1: up.x,
      y1: up.y,
      x2: c.x,
      y2: c.y,
    });
  }
  return {
    cards,
    edges,
    width: register ? register.width : Math.max(...cards.map((c) => c.x)) + CARD_W + PAD,
    height: register
      ? Math.max(...cards.map((c) => c.y)) + CARD_H + PAD_LIST
      : Math.max(...cards.map((c) => c.y)) + CARD_H + GAP_Y / 2 + PAD,
  };
}
