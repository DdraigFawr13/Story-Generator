// Ties between realms: alliances, free cities' pacts of defence and vassalage, rebuilt from the
// diplomacy events the history logged (the pacts themselves live only while history runs). Each tie
// keeps its start and end events, the calls to arms it saw and why it ended. It only reads events.

import { eventYear, type Civ, type Id, type SimEvent, type WorldState } from '../engine';

export type TieKind = 'alliance' | 'defence' | 'vassal';

/** Why a tie ended. */
export type TieEnd =
  /** `by` refused a call to arms. */
  | 'refused'
  /** `by` broke the oath. */
  | 'betrayed'
  /** The two went to war with each other. */
  | 'war'
  /** `by` became someone's vassal, and its alliances lapsed. */
  | 'knelt'
  /** The vassal rose against its overlord. */
  | 'revolt'
  /** The overlord fell and the vassal went free. */
  | 'freed'
  /** `by` fell. */
  | 'fell';

export interface TieCall {
  event: Id;
  year: number;
  /** The ally who was called, and whether it came. */
  ally: Id;
  answered: boolean;
  enemy: string;
  enemyId: Id | undefined;
}

export interface Tie {
  kind: TieKind;
  /** The two realms; for a vassal tie `a` is the overlord and `b` the vassal. */
  a: Id;
  b: Id;
  from: number;
  /** The year it ended; absent while it still holds at the end of history. */
  to?: number;
  start: Id;
  end?: Id;
  ended?: TieEnd;
  /** The realm the end turns on (the one who refused, broke faith, knelt or fell). */
  by?: Id;
  /** Why an alliance was sworn: "for the trade that ran between them". */
  why?: string;
  /** Places a vassal lost in the war before it knelt. */
  sites?: number;
  calls: TieCall[];
}

const TYPES = new Set([
  'alliance_sworn',
  'pact_sworn',
  'ally_answered',
  'call_refused',
  'alliance_betrayed',
  'pact_broken',
  'vassal_sworn',
  'vassal_revolt',
  'vassal_freed',
  'civ_fell',
]);

const memo = new WeakMap<WorldState, { events: number; ties: Tie[] }>();

/** Every tie in the world's history, in the order they were made. */
export function allTies(world: WorldState): Tie[] {
  const hit = memo.get(world);
  if (hit && hit.events === world.events.length) return hit.ties;
  const ties = buildTies(world);
  memo.set(world, { events: world.events.length, ties });
  return ties;
}

function buildTies(world: WorldState): Tie[] {
  // Two realms can share a name (a free city refounded); the one alive in the event's year wins.
  const byName = new Map<string, Civ[]>();
  for (const civ of world.civs.values()) {
    const list = byName.get(civ.name) ?? [];
    list.push(civ);
    byName.set(civ.name, list);
  }
  const civAt = (name: unknown, year: number): Id | undefined => {
    if (typeof name !== 'string') return undefined;
    const list = byName.get(name);
    if (!list) return undefined;
    const alive = list.find((c) => c.founded <= year && (c.fell === undefined || c.fell >= year));
    return (alive ?? list[0])?.id;
  };

  const ties: Tie[] = [];
  const open: Tie[] = [];
  const find = (kind: TieKind, x: Id | undefined, y: Id | undefined): Tie | undefined =>
    x === undefined || y === undefined
      ? undefined
      : open.find(
          (t) =>
            t.kind === kind &&
            ((t.a === x && t.b === y) || (kind !== 'vassal' && t.a === y && t.b === x)),
        );
  const close = (tie: Tie, event: SimEvent, ended: TieEnd, by: Id | undefined): void => {
    tie.to = eventYear(event);
    tie.end = event.id;
    tie.ended = ended;
    if (by !== undefined) tie.by = by;
    open.splice(open.indexOf(tie), 1);
  };
  const begin = (tie: Tie): void => {
    ties.push(tie);
    open.push(tie);
  };

  for (const event of world.events) {
    if (!TYPES.has(event.type)) continue;
    const year = eventYear(event);
    const d = event.data;
    switch (event.type) {
      case 'alliance_sworn':
      case 'pact_sworn': {
        const [a, b] = [civAt(d.civ, year), civAt(d.other, year)];
        if (a === undefined || b === undefined) break;
        const kind = event.type === 'alliance_sworn' ? 'alliance' : 'defence';
        const tie: Tie = { kind, a, b, from: year, start: event.id, calls: [] };
        if (typeof d.why === 'string') tie.why = d.why;
        begin(tie);
        break;
      }
      case 'ally_answered':
      case 'call_refused': {
        const ally = civAt(d.civ, year);
        const tie = find('alliance', ally, civAt(d.friend, year));
        if (!tie || ally === undefined) break;
        const enemy = typeof d.enemy === 'string' ? d.enemy : '';
        const answered = event.type === 'ally_answered';
        tie.calls.push({
          event: event.id,
          year,
          ally,
          answered,
          enemy,
          enemyId: civAt(enemy, year),
        });
        if (!answered) close(tie, event, 'refused', ally);
        break;
      }
      case 'alliance_betrayed': {
        const by = civAt(d.civ, year);
        const tie = find('alliance', by, civAt(d.victim, year));
        if (tie) close(tie, event, 'betrayed', by);
        break;
      }
      case 'pact_broken': {
        const [a, b] = [civAt(d.civ, year), civAt(d.other, year)];
        const tie = find('alliance', a, b) ?? find('defence', a, b);
        if (tie) close(tie, event, 'war', undefined);
        break;
      }
      case 'vassal_sworn': {
        const [vassal, overlord] = [civAt(d.civ, year), civAt(d.overlord, year)];
        if (vassal === undefined || overlord === undefined) break;
        // A vassal's friends are its overlord's: its alliances lapse (diplomacy.ts).
        for (const tie of open.filter(
          (t) => t.kind === 'alliance' && (t.a === vassal || t.b === vassal),
        ))
          close(tie, event, 'knelt', vassal);
        const tie: Tie = {
          kind: 'vassal',
          a: overlord,
          b: vassal,
          from: year,
          start: event.id,
          calls: [],
        };
        if (typeof d.sites === 'number') tie.sites = d.sites;
        begin(tie);
        break;
      }
      case 'vassal_revolt': {
        const vassal = civAt(d.civ, year);
        const tie = find('vassal', civAt(d.overlord, year), vassal);
        if (tie) close(tie, event, 'revolt', vassal);
        break;
      }
      case 'vassal_freed': {
        const [vassal, overlord] = [civAt(d.civ, year), civAt(d.overlord, year)];
        // The overlord's fall may already have closed the tie; the freeing line is its better end.
        const tie =
          find('vassal', overlord, vassal) ??
          ties.findLast(
            (t) => t.kind === 'vassal' && t.a === overlord && t.b === vassal && t.ended === 'fell',
          );
        if (!tie) break;
        if (tie.ended === undefined) close(tie, event, 'freed', overlord);
        else Object.assign(tie, { to: year, end: event.id, ended: 'freed', by: overlord });
        break;
      }
      case 'civ_fell': {
        const civ = civAt(d.civ, year);
        if (civ === undefined) break;
        for (const tie of open.filter((t) => t.a === civ || t.b === civ))
          close(tie, event, 'fell', civ);
        break;
      }
    }
  }
  // A realm that fell with no line of its own still ends its ties in that year.
  for (const tie of [...open]) {
    const gone = [tie.a, tie.b].find((id) => world.civs.get(id)?.fell !== undefined);
    if (gone === undefined) continue;
    tie.to = world.civs.get(gone)!.fell!;
    tie.ended = 'fell';
    tie.by = gone;
    open.splice(open.indexOf(tie), 1);
  }
  return ties;
}

/** The ties of one realm, oldest first. */
export function tiesOf(world: WorldState, civId: Id): Tie[] {
  return allTies(world).filter((t) => t.a === civId || t.b === civId);
}

/** Whether a tie holds in year `y`: made by then and not yet ended. */
export function holdsAt(tie: Tie, y: number): boolean {
  return tie.from <= y && (tie.to === undefined || tie.to > y);
}

/** The other realm of a tie, seen from `civId`. */
export function otherOf(tie: Tie, civId: Id): Id {
  return tie.a === civId ? tie.b : tie.a;
}

export interface Standing {
  overlord: Id | undefined;
  /** The year the realm knelt to its overlord. */
  since: number | undefined;
  vassals: Id[];
  allies: Id[];
}

/** A realm's overlord, vassals and allies in year `y`. */
export function standingAt(world: WorldState, civId: Id, y: number): Standing {
  const out: Standing = { overlord: undefined, since: undefined, vassals: [], allies: [] };
  for (const tie of tiesOf(world, civId)) {
    if (!holdsAt(tie, y)) continue;
    if (tie.kind === 'vassal') {
      if (tie.b === civId) {
        out.overlord = tie.a;
        out.since = tie.from;
      } else out.vassals.push(tie.b);
    } else if (tie.kind === 'alliance') out.allies.push(otherOf(tie, civId));
  }
  return out;
}

/** Each vassal's overlord in year `y` (for the map). */
export function overlordsAt(world: WorldState, y: number): Map<Id, Id> {
  const out = new Map<Id, Id>();
  for (const tie of allTies(world))
    if (tie.kind === 'vassal' && holdsAt(tie, y)) out.set(tie.b, tie.a);
  return out;
}
