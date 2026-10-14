// Which events the Tales playback shows and which stop it to ask. Pure: event kinds, the event
// filter (shown and paused kinds) and the Follow filter. A kind is a group of event types the
// reader switches on and off together.

export type PauseKind =
  'legend' | 'war' | 'realm' | 'battle' | 'ruler' | 'town' | 'hardship' | 'treasure' | 'faith';

export interface PauseKindInfo {
  id: PauseKind;
  /** Words in the event filter, the "Pauses on" chip and the key under the ribbon. */
  label: string;
  /** Ribbon dot colour. */
  colour: string;
  /** Pauses the playback until the reader changes it. */
  on: boolean;
  /** Shown on the map and the ribbon until the reader changes it. */
  shown: boolean;
}

export const PAUSE_KINDS: readonly PauseKindInfo[] = [
  { id: 'legend', label: 'legends', colour: '#c99a18', on: true, shown: true },
  { id: 'war', label: 'wars', colour: '#a0442c', on: true, shown: true },
  { id: 'realm', label: 'new realms', colour: '#6d675c', on: true, shown: true },
  { id: 'battle', label: 'battles', colour: '#d9826b', on: false, shown: false },
  { id: 'ruler', label: 'new rulers', colour: '#7a58a8', on: false, shown: false },
  { id: 'town', label: 'towns taken', colour: '#2e8b8b', on: false, shown: false },
  { id: 'hardship', label: 'famine and plague', colour: '#8f8a3a', on: false, shown: false },
  { id: 'treasure', label: 'treasure', colour: '#2f8a5c', on: false, shown: false },
  { id: 'faith', label: 'faith', colour: '#3e7ca6', on: false, shown: false },
];

export const DEFAULT_PAUSES: ReadonlySet<PauseKind> = new Set(
  PAUSE_KINDS.filter((k) => k.on).map((k) => k.id),
);
export const DEFAULT_SHOWN: ReadonlySet<PauseKind> = new Set(
  PAUSE_KINDS.filter((k) => k.shown).map((k) => k.id),
);

/** Event types by kind, with the least importance that counts; `show` types never pause. */
const KIND_OF: Record<string, { kind: PauseKind; min?: number; show?: true }> = {
  legend_risen: { kind: 'legend' },
  beast_slain: { kind: 'legend', min: 9 },
  legend_duel: { kind: 'legend', min: 6 },
  war_declared: { kind: 'war' },
  civil_war_began: { kind: 'war' },
  peace_made: { kind: 'war', show: true },
  civ_founded: { kind: 'realm' },
  realm_split: { kind: 'realm' },
  civ_fell: { kind: 'realm' },
  city_freed: { kind: 'realm' },
  battle: { kind: 'battle' },
  throne_seized: { kind: 'ruler' },
  succession_disputed: { kind: 'ruler' },
  ruler_succeeded: { kind: 'ruler', min: 7 },
  site_razed: { kind: 'town' },
  site_conquered: { kind: 'town' },
  famine: { kind: 'hardship', min: 7 },
  plague: { kind: 'hardship', min: 7 },
  artifact_made: { kind: 'treasure', min: 8 },
  item_stolen: { kind: 'treasure', min: 9 },
  expedition_treasure: { kind: 'treasure' },
  dragon_hoard_claimed: { kind: 'treasure' },
  prophet_rose: { kind: 'faith' },
  holy_war_preached: { kind: 'faith' },
  holy_war_proclaimed: { kind: 'faith' },
  faith_schism: { kind: 'faith' },
  holy_city_taken: { kind: 'faith' },
};

/** The few words above a pause card's title, by event type. */
const KICKER: Record<string, string> = {
  legend_risen: 'A legend rises',
  beast_slain: 'A great beast slain',
  legend_duel: 'A duel of legends',
  war_declared: 'War',
  civil_war_began: 'Civil war',
  civ_founded: 'A new realm',
  realm_split: 'A realm splits',
  civ_fell: 'A realm falls',
  city_freed: 'A city goes free',
  battle: 'Battle',
  throne_seized: 'A throne seized',
  succession_disputed: 'A disputed throne',
  ruler_succeeded: 'A new ruler',
  artifact_made: 'A great work',
  item_stolen: 'A treasure stolen',
  expedition_treasure: 'Treasure found',
  dragon_hoard_claimed: 'A hoard claimed',
  prophet_rose: 'A prophet',
  holy_war_preached: 'A holy war preached',
  holy_war_proclaimed: 'Holy war',
  faith_schism: 'A schism',
  holy_city_taken: 'A holy city taken',
  peace_made: 'Peace',
  site_razed: 'A town burns',
  site_conquered: 'A town taken',
  famine: 'Famine',
  plague: 'Plague',
};

/** Words above a pause card: the type's own, else the effect's label, else plain words for the id. */
export function kickerOf(type: string, label?: string): string {
  return KICKER[type] ?? label ?? type.replace(/_/g, ' ');
}

/** Events of a followed person that stop the playback: anything they did that mattered. */
export const FOLLOW_MIN_IMPORTANCE = 5;

/** The kind an event belongs to, or null when no kind covers it. */
export function pauseKindOf(type: string, importance: number): PauseKind | null {
  const row = KIND_OF[type];
  if (!row || importance < (row.min ?? 0)) return null;
  return row.kind;
}

export interface PausableEvent {
  type: string;
  importance: number;
  /** Person ids. */
  actors: readonly number[];
}

/**
 * Does the event stop the playback? Following a person overrides the kinds: only events they
 * took part in count. Otherwise the event's kind must be switched on.
 */
export function shouldPause(
  event: PausableEvent,
  kinds: ReadonlySet<PauseKind>,
  follow: number | null,
): boolean {
  if (follow !== null) {
    return event.actors.includes(follow) && event.importance >= FOLLOW_MIN_IMPORTANCE;
  }
  const kind = pauseKindOf(event.type, event.importance);
  return kind !== null && kinds.has(kind) && !KIND_OF[event.type]?.show;
}

/** The most important event of a list that stops the playback, or null (the first wins ties). */
export function pickPause<T extends PausableEvent>(
  events: readonly T[],
  kinds: ReadonlySet<PauseKind>,
  follow: number | null,
): T | null {
  let best: T | null = null;
  for (const event of events) {
    if (!shouldPause(event, kinds, follow)) continue;
    if (!best || event.importance > best.importance) best = event;
  }
  return best;
}

/** Words for the "Pauses on" chip: "legends, wars, new realms". */
export function pausesLabel(kinds: ReadonlySet<PauseKind>): string {
  const names = PAUSE_KINDS.filter((k) => kinds.has(k.id)).map((k) => k.label);
  return names.length ? names.join(', ') : 'nothing';
}

/** A pause-card heading kind for an event type: "A legend's deed", "War". */
export function dotColour(type: string, importance: number): string | null {
  const kind = pauseKindOf(type, importance);
  return kind ? PAUSE_KINDS.find((k) => k.id === kind)!.colour : null;
}

/** History years between two cards at the least (a followed person's story: just a short gap). */
export const PAUSE_GAP_YEARS = 20;
export const FOLLOW_GAP_YEARS = 2;
/** Real time between a card closing and the next one opening, so the map is never left alone for less. */
export const PAUSE_GAP_MS = 4000;

/**
 * May a card open at `year`? Not within the year gap of the last card, and not within the real-time
 * gap of the last card closing (`closedAt`, a clock reading in ms; null before the first card).
 */
export function pauseAllowed(
  year: number,
  lastYear: number,
  nowMs: number,
  closedAt: number | null,
  following: boolean,
): boolean {
  if (year - lastYear < (following ? FOLLOW_GAP_YEARS : PAUSE_GAP_YEARS)) return false;
  return closedAt === null || nowMs - closedAt >= PAUSE_GAP_MS;
}
