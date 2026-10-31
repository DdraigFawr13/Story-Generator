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
const WONDER: Rgb = [255, 228, 150];
const FIRE: Rgb = [255, 110, 40];

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

export const PLAYBACK_POOL = 400;

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
