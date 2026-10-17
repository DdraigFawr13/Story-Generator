// History playback content: which event types draw an effect on the map, which are big events with
// a banner, the story line under each banner and the slider ticks. A later milestone that adds an
// event adds a row here, not playback code.
import type { Rgb } from '../engine';

/** The drawing the playback app has for an event; see src/app/playback/player.ts. */
export type PlaybackFx =
  'wipe' | 'shock' | 'battle' | 'peace' | 'fire' | 'stain' | 'crown' | 'wonder';

export interface PlaybackEffect {
  fx: PlaybackFx;
  /** The effect colour; null takes the colour of the realm the event names. */
  colour: Rgb | null;
  /** The slider key and banner label ("war declared"). */
  label: string;
  /** Banner heading for a big event ("War"). */
  big?: string;
  /** A big event: banner, a dip in speed and a camera move at 8 years a second or slower. */
  beat?: boolean;
  /** A rare moment: two dips, a gold banner and a story line. */
  rare?: boolean;
  /** Draws at 15 years a second too, when the event is important enough. */
  fast?: boolean;
  /** The least importance that draws this type at all. */
  minImportance?: number;
}

const WAR: Rgb = [214, 58, 46];
const GOLD: Rgb = [236, 190, 80];
const SICK: Rgb = [130, 190, 70];
const FAMINE: Rgb = [214, 150, 60];
const COLD: Rgb = [150, 200, 245];
const DRY: Rgb = [222, 170, 90];
const WONDER: Rgb = [255, 228, 150];
const FIRE: Rgb = [255, 110, 40];

export const PLAYBACK_COLOURS = { war: WAR, gold: GOLD, cold: COLD, dry: DRY } as const;

/** One row per event type; a type with no row draws nothing. */
export const PLAYBACK_EFFECTS: Record<string, PlaybackEffect> = {
  civ_founded: {
    fx: 'wipe',
    colour: GOLD,
    label: 'realm founded',
    big: 'A realm rises',
    beat: true,
    fast: true,
  },
  war_declared: {
    fx: 'shock',
    colour: WAR,
    label: 'war declared',
    big: 'War',
    beat: true,
    fast: true,
  },
  civil_war_began: {
    fx: 'shock',
    colour: WAR,
    label: 'civil war',
    big: 'Civil war',
    beat: true,
    fast: true,
  },
  throne_seized: {
    fx: 'crown',
    colour: GOLD,
    label: 'throne seized',
    big: 'Throne seized',
    beat: true,
    fast: true,
  },
  seat_seized: {
    fx: 'crown',
    colour: GOLD,
    label: 'seat seized',
    big: 'Seat seized',
    beat: true,
    fast: true,
  },
  realm_split: {
    fx: 'wipe',
    colour: GOLD,
    label: 'realm split',
    big: 'A realm splits',
    beat: true,
    fast: true,
  },
  battle: { fx: 'battle', colour: WAR, label: 'battle', fast: true },
  peace_made: { fx: 'peace', colour: [240, 240, 230], label: 'peace', big: 'Peace', beat: true },
  site_razed: {
    fx: 'fire',
    colour: FIRE,
    label: 'razed',
    big: 'Razed',
    beat: true,
    fast: true,
  },
  site_conquered: {
    fx: 'wipe',
    colour: WAR,
    label: 'conquered',
    big: 'Conquest',
    beat: true,
    fast: true,
  },
  famine: { fx: 'stain', colour: FAMINE, label: 'famine', fast: true, minImportance: 7 },
  plague: { fx: 'stain', colour: SICK, label: 'plague', fast: true, minImportance: 7 },
  succession_disputed: {
    fx: 'crown',
    colour: GOLD,
    label: 'disputed succession',
    big: 'Disputed succession',
    beat: true,
    fast: true,
  },
  legend_risen: {
    fx: 'wonder',
    colour: WONDER,
    label: 'legend',
    big: 'A legend',
    beat: true,
    rare: true,
    fast: true,
  },
  artifact_made: {
    fx: 'wonder',
    colour: WONDER,
    label: 'artifact',
    big: 'A legendary work',
    beat: true,
    rare: true,
    fast: true,
    minImportance: 8,
  },
  item_stolen: {
    fx: 'wonder',
    colour: [200, 170, 255],
    label: 'item stolen',
    big: 'A famed item stolen',
    beat: true,
    rare: true,
    minImportance: 9,
  },
  beast_slain: {
    fx: 'wonder',
    colour: WONDER,
    label: 'beast slain',
    big: 'A great beast slain',
    beat: true,
    rare: true,
    fast: true,
    minImportance: 9,
  },
};

/** Event types whose banner is red: the realm is being hurt. */
export const PLAYBACK_RED_TYPES: readonly string[] = [
  'war_declared',
  'site_razed',
  'site_conquered',
];

/**
 * Sprite cost of each effect. At most `PLAYBACK_POOL` cost is live at once; the rest wait.
 */
export const PLAYBACK_COST: Record<PlaybackFx, number> = {
  shock: 4,
  battle: 10,
  wipe: 2,
  fire: 40,
  stain: 4,
  crown: 4,
  wonder: 16,
  peace: 3,
};
export const PLAYBACK_POOL = 400;
/** Most effects on the map at once; quieter ones are dropped. Big and rare ones always show. */
export const PLAYBACK_MAX_ON_MAP = 3;

/** A tag with data placeholders (as in the story lines); `plain` is used when data is missing. */
export interface PlaybackTag {
  text: string;
  plain?: string;
}
/** The few words drawn beside an effect while it plays, so every mark says what it is. */
export const PLAYBACK_TAGS: Record<string, PlaybackTag> = {
  civ_founded: { text: '{civ} rises' },
  war_declared: { text: 'War' },
  battle: { text: 'Battle at {site}', plain: 'Battle' },
  peace_made: { text: 'Peace' },
  site_razed: { text: '{site} burns' },
  site_conquered: { text: '{site} taken' },
  famine: { text: 'Famine at {site}' },
  plague: { text: 'Plague at {site}' },
  succession_disputed: { text: 'Throne disputed' },
  civil_war_began: { text: 'Civil war' },
  throne_seized: { text: 'Throne seized' },
  seat_seized: { text: 'Seat seized' },
  realm_split: { text: '{civ} stands apart', plain: 'Realm split' },
};

/**
 * One line in story voice under a banner title, chosen from the list by the event's year and
 * importance. `{key}` is the event's data value; `{key|word}` falls back to `word` when the event
 * has none. `{civ}` and `{enemy}` are the realm names without their title ("Kingdom of Ash" is
 * "Ash").
 */
export const PLAYBACK_STORY: Record<string, string[]> = {
  civ_founded: ['Under one banner, {site|a hall} gathers its people.'],
  war_declared: ['Spears are sharpened in {civ}.', '{civ} marches on {enemy}.'],
  peace_made: ['After {years|long} years and {dead|many} dead, the war is done.'],
  site_razed: ['Smoke over {site} for a week.', '{site} burns; {dead|many} do not see spring.'],
  site_conquered: ["{site} wakes under {civ}'s banner."],
  succession_disputed: ['Two claimants, one throne, and the hall divided.'],
  civil_war_began: ['{name|A claimant} will not kneel; {from} turns its spears on itself.'],
  throne_seized: ['{name|The claimant} sits the throne {prior|the old ruler} lost.'],
  seat_seized: ['{name|A legend} takes the seat {prior|the old ruler} held.'],
  alliance_betrayed: ['{civ|A realm} breaks its oath to {victim|an ally}.'],
  vassal_sworn: ['{civ|A beaten realm} kneels to {overlord|its conqueror}.'],
  vassal_revolt: ['{civ|The vassal} will pay {overlord|its master} no more.'],
  peace_by_marriage: ['{a|A bride} and {b|a groom} are wed, and the spears are lowered.'],
  realm_split: ['Neither half could win: {from} and {civ} go their own ways.'],
  legend_risen: ['Songs will carry the name {name}.'],
  artifact_made: ['{maker|A master} makes {item}, and it will outlive them.'],
  item_stolen: ['{item} vanishes from {site} in the night.'],
  beast_slain: ["{hero} returns with {beast}'s head."],
};

/** A slider tick type: its own colour, and other event types that share it. */
export interface PlaybackTick {
  type: string;
  colour: Rgb;
  /** Other event types drawn as this one. */
  also?: string[];
  /** The least importance that gets a tick. */
  minImportance?: number;
}

/** The slider ticks and the key under it, in key order. */
export const PLAYBACK_TICKS: PlaybackTick[] = [
  { type: 'war_declared', colour: WAR },
  { type: 'site_razed', colour: FIRE },
  { type: 'civ_founded', colour: GOLD },
  { type: 'legend_risen', colour: WONDER },
  { type: 'site_conquered', colour: [150, 40, 40] },
  { type: 'plague', colour: SICK, also: ['fever', 'pox'], minImportance: 8 },
  { type: 'famine', colour: FAMINE, minImportance: 8 },
];

/** Titles a realm's short name drops, as in "Kingdom of Ash" becoming "Ash" on the map and in story lines. */
export const REALM_TITLES: readonly string[] = [
  'Kingdom',
  'Thanedom',
  'Council',
  'Jarldom',
  'Realm',
  'Clans',
  'Clan',
  'Lordship',
  'Chiefdom',
  'Free City',
  'Commune',
];
