// Cultures (M2.1). Each culture's customs are chosen to make a different kind of
// story; the comment above each says which. Names live in names.ts.

import type { CultureDef } from '../engine';
import {
  BRENNIG_NAMES,
  CEWRI_NAMES,
  DVERGAR_NAMES,
  FOMORI_NAMES,
  GWERIN_NAMES,
  GWYLLION_NAMES,
  GHOR_NAMES,
  HOLLIN_NAMES,
  LISSARI_NAMES,
  REDCAP_NAMES,
  SKARN_NAMES,
  TARQAI_NAMES,
  TYLWYTH_NAMES,
  USHANI_NAMES,
} from './names';

// Split inheritance makes cousin feuds.
const gwerin: CultureDef = {
  id: 'gwerin',
  name: 'Gwerin',
  raceId: 'human',
  summary: 'Valley farmers and bards.',
  values: { kin: 9, honour: 5, faith: 6, wealth: 4, learning: 7, war: 3, freedom: 6, order: 4 },
  marriage: { custom: 'one-spouse', gift: 'none', arranged: true },
  inheritance: 'all-children',
  government: 'chieftaincy',
  succession: 'kin-elected',
  magic: 'honoured',
  religion: { id: 'wells', name: 'The Wells' },
  preferredBiomes: ['temperate-forest', 'grassland'],
  sitePreferences: ['river', 'aura'],
  names: GWERIN_NAMES,
};

// The eldest son takes the hall, so younger sons raid and found villages.
const skarn: CultureDef = {
  id: 'skarn',
  name: 'Skarn',
  raceId: 'human',
  summary: 'Sea raiders and settlers.',
  values: { kin: 6, honour: 9, faith: 4, wealth: 7, learning: 3, war: 7, freedom: 6, order: 3 },
  marriage: { custom: 'one-spouse', gift: 'bride-price', arranged: false },
  inheritance: 'eldest-son',
  government: 'jarldom',
  succession: 'eldest-son-assembly',
  magic: 'wary',
  religion: { id: 'hall', name: 'The Hall' },
  preferredBiomes: ['taiga', 'temperate-forest', 'tundra'],
  sitePreferences: ['coast'],
  names: SKARN_NAMES,
};

// Brother-first succession makes disputed thrones.
const tarqai: CultureDef = {
  id: 'tarqai',
  name: 'Tarqai',
  raceId: 'human',
  summary: 'Steppe horse clans.',
  values: { kin: 7, honour: 6, faith: 5, wealth: 4, learning: 2, war: 8, freedom: 9, order: 3 },
  marriage: { custom: 'leaders-many-spouses', gift: 'bride-price', arranged: true },
  inheritance: 'youngest-keeps-hearth',
  government: 'khanate',
  succession: 'brother-first-gathering',
  magic: 'respected',
  religion: { id: 'eternal-sky', name: 'The Eternal Sky' },
  preferredBiomes: ['steppe', 'grassland', 'savanna'],
  sitePreferences: ['plains'],
  names: TARQAI_NAMES,
};

// Mages need a temple licence, so rogue mages are hunted.
const ushani: CultureDef = {
  id: 'ushani',
  name: 'Ushani',
  raceId: 'human',
  summary: 'River-city builders.',
  values: { kin: 5, honour: 4, faith: 8, wealth: 7, learning: 7, war: 4, freedom: 2, order: 9 },
  marriage: { custom: 'one-spouse', gift: 'dowry', arranged: true },
  inheritance: 'sons-temple-tithe',
  government: 'priest-kingdom',
  succession: 'eldest-son-temple',
  magic: 'licensed',
  religion: { id: 'river-mothers', name: 'The River Mothers' },
  preferredBiomes: ['desert', 'savanna', 'grassland'],
  sitePreferences: ['river'],
  names: USHANI_NAMES,
};

// The best apprentice inherits, so heirlooms start quarrels.
const tylwythCulture: CultureDef = {
  id: 'tylwyth',
  name: 'Tylwyth',
  raceId: 'tylwyth',
  summary: 'Forest people of the old groves.',
  values: { kin: 8, honour: 5, faith: 7, wealth: 2, learning: 9, war: 2, freedom: 6, order: 5 },
  marriage: { custom: 'one-spouse', gift: 'none', arranged: false },
  inheritance: 'best-apprentice',
  government: 'elder-council',
  succession: 'elder-council',
  magic: 'sacred',
  religion: { id: 'the-grove', name: 'The Grove' },
  preferredBiomes: ['temperate-forest', 'taiga', 'jungle'],
  sitePreferences: ['aura', 'forest'],
  names: TYLWYTH_NAMES,
};

// The eldest child holds the hold, so clans feud over holds.
const dvergarCulture: CultureDef = {
  id: 'dvergar',
  name: 'Dvergar',
  raceId: 'dvergar',
  summary: 'Mountain clans of the deep holds.',
  values: { kin: 9, honour: 8, faith: 6, wealth: 7, learning: 4, war: 6, freedom: 4, order: 7 },
  marriage: { custom: 'one-spouse', gift: 'dowry', arranged: true },
  inheritance: 'eldest-child',
  government: 'thanedom',
  succession: 'eldest-child',
  magic: 'wary',
  religion: { id: 'ancestor-stones', name: 'The Ancestor Stones' },
  preferredBiomes: ['alpine', 'tundra', 'taiga'],
  sitePreferences: ['deposit', 'heights', 'pass'],
  names: DVERGAR_NAMES,
};

// Wealth breeds envy, and alliances are bought.
const lissari: CultureDef = {
  id: 'lissari',
  name: 'Lissari',
  raceId: 'human',
  summary: 'Merchant houses of the harbour cities.',
  values: { kin: 4, honour: 4, faith: 4, wealth: 9, learning: 6, war: 3, freedom: 7, order: 6 },
  marriage: { custom: 'one-spouse', gift: 'dowry', arranged: true },
  inheritance: 'all-children',
  government: 'merchant-republic',
  succession: 'elder-council',
  magic: 'licensed',
  religion: { id: 'the-scales', name: 'The Scales' },
  preferredBiomes: ['grassland', 'temperate-forest', 'savanna'],
  sitePreferences: ['coast', 'river'],
  names: LISSARI_NAMES,
};

// Daughters inherit, so grooms marry in and sons leave to raid.
const brennig: CultureDef = {
  id: 'brennig',
  name: 'Brennig',
  raceId: 'human',
  summary: 'Hill clans where mothers rule.',
  values: { kin: 8, honour: 7, faith: 7, wealth: 3, learning: 4, war: 6, freedom: 7, order: 4 },
  marriage: { custom: 'one-spouse', gift: 'bride-price', arranged: false },
  inheritance: 'eldest-daughter',
  government: 'queendom',
  succession: 'eldest-daughter',
  magic: 'honoured',
  religion: { id: 'mother-hills', name: 'The Mother Hills' },
  preferredBiomes: ['temperate-forest', 'grassland', 'taiga'],
  sitePreferences: ['heights', 'river'],
  names: BRENNIG_NAMES,
};

// A free people with no fixed law, so feuds run long.
const gwyllion: CultureDef = {
  id: 'gwyllion',
  name: 'Gwyllion',
  raceId: 'tylwyth',
  summary: 'Wild Tylwyth of the deep jungle and fen.',
  values: { kin: 6, honour: 6, faith: 5, wealth: 3, learning: 7, war: 4, freedom: 9, order: 2 },
  marriage: { custom: 'one-spouse', gift: 'none', arranged: false },
  inheritance: 'all-children',
  government: 'circle',
  succession: 'elder-council',
  magic: 'sacred',
  religion: { id: 'the-wild-hunt', name: 'The Wild Hunt' },
  preferredBiomes: ['jungle', 'swamp', 'temperate-forest'],
  sitePreferences: ['aura', 'forest'],
  names: GWYLLION_NAMES,
};

// The strongest takes the seat, so every death starts a fight.
const fomoriCulture: CultureDef = {
  id: 'fomori',
  name: 'Fomori',
  raceId: 'fomori',
  summary: 'Sea-wolf warbands of the hard coasts.',
  values: { kin: 6, honour: 8, faith: 4, wealth: 6, learning: 1, war: 9, freedom: 8, order: 2 },
  marriage: { custom: 'leaders-many-spouses', gift: 'bride-price', arranged: true },
  inheritance: 'all-children',
  government: 'warhost',
  succession: 'trial-of-strength',
  magic: 'wary',
  religion: { id: 'drowned-kings', name: 'The Drowned Kings' },
  preferredBiomes: ['tundra', 'taiga', 'steppe'],
  sitePreferences: ['coast'],
  names: FOMORI_NAMES,
};

// Honour and war run high and the land is lean, so a hungry horde raids its neighbours.
const ghor: CultureDef = {
  id: 'ghor',
  name: 'Ghor',
  raceId: 'orc',
  summary: 'Orc hordes of the open steppe, led by warlords and blood-shamans.',
  values: { kin: 7, honour: 9, faith: 7, wealth: 3, learning: 2, war: 8, freedom: 4, order: 6 },
  marriage: { custom: 'one-spouse', gift: 'bride-price', arranged: true },
  inheritance: 'eldest-son',
  government: 'horde',
  succession: 'shaman-blessed',
  magic: 'honoured',
  religion: { id: 'blood-moon', name: 'The Blood Moon' },
  preferredBiomes: ['steppe', 'savanna', 'grassland'],
  sitePreferences: ['plains', 'deposit'],
  names: GHOR_NAMES,
};

// Few, long-lived and slow to forget.
const cewriCulture: CultureDef = {
  id: 'cewri',
  name: 'Cewri',
  raceId: 'cewri',
  summary: 'Giant kin-steadings of the high moors.',
  values: { kin: 10, honour: 7, faith: 8, wealth: 2, learning: 6, war: 4, freedom: 8, order: 3 },
  marriage: { custom: 'one-spouse', gift: 'none', arranged: true },
  inheritance: 'youngest-keeps-hearth',
  government: 'steading',
  succession: 'elder-council',
  magic: 'respected',
  religion: { id: 'the-sleepers', name: 'The Sleepers' },
  preferredBiomes: ['alpine', 'tundra', 'taiga'],
  sitePreferences: ['heights'],
  names: CEWRI_NAMES,
};

// Comfort-loving farmers are slow to war and long to remember a slight.
const hollin: CultureDef = {
  id: 'hollin',
  name: 'Hollin',
  raceId: 'halfling',
  summary: 'Halfling shire-folk of the green hills.',
  values: { kin: 9, honour: 4, faith: 5, wealth: 6, learning: 5, war: 1, freedom: 7, order: 6 },
  marriage: { custom: 'one-spouse', gift: 'none', arranged: false },
  inheritance: 'all-children',
  government: 'shire',
  succession: 'kin-elected',
  magic: 'wary',
  religion: { id: 'the-hearth', name: 'The Hearth' },
  preferredBiomes: ['grassland', 'temperate-forest'],
  sitePreferences: ['river', 'plains'],
  names: HOLLIN_NAMES,
};

// Many, greedy and quick to raid, so the warrens breed trouble for their neighbours.
const redcap: CultureDef = {
  id: 'redcap',
  name: 'Redcaps',
  raceId: 'goblin',
  summary: 'Goblin warrens of the fens and crags.',
  values: { kin: 5, honour: 2, faith: 3, wealth: 8, learning: 3, war: 7, freedom: 6, order: 3 },
  marriage: { custom: 'leaders-many-spouses', gift: 'none', arranged: false },
  inheritance: 'youngest-keeps-hearth',
  government: 'warren',
  succession: 'brother-first-gathering',
  magic: 'respected',
  religion: { id: 'the-moon-hag', name: 'The Moon Hag' },
  preferredBiomes: ['swamp', 'jungle', 'alpine'],
  sitePreferences: ['deposit', 'forest'],
  names: REDCAP_NAMES,
};

export const cultures: CultureDef[] = [
  gwerin,
  skarn,
  tarqai,
  ushani,
  tylwythCulture,
  dvergarCulture,
  lissari,
  brennig,
  gwyllion,
  fomoriCulture,
  ghor,
  cewriCulture,
  hollin,
  redcap,
];
