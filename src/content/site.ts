// Live-site rules (M3.1): the local map, the starting layout, how many people we follow and how
// outposts are founded. The engine in engine/site/ reads only this table.

import type { SiteRules } from '../engine';
import { BUILDINGS } from './buildings';

export const SITE: SiteRules = {
  // 96 tiles a side keeps the whole map on one phone screen at 6 px a tile.
  mapSize: 96,
  // The map spans the site cell plus half of each neighbour: 2 cells over 96 tiles.
  tilesPerCell: 48,
  // Bigger sites follow about this many people; the rest stay counts (the 150-resident budget).
  followCap: 150,
  // One home for every 5 people of the whole site, followed or counted.
  peoplePerHome: 5,
  // One 7x5 field for every 14 people.
  peoplePerField: 14,
  // A river in a neighbouring cell bends 35% of the way toward the site so a river site sits on its bank.
  riverPull: 0.35,
  // 15% of married men in a leaders-many-spouses culture take a second wife.
  extraSpouseChance: 0.15,
  // Index = LocalMap.terrain value.
  terrains: [
    { id: 'grass', name: 'grass', glyph: '.' },
    { id: 'scrub', name: 'scrub', glyph: ',' },
    { id: 'marsh', name: 'marsh', glyph: ';' },
    { id: 'shore', name: 'shore', glyph: ':' },
    { id: 'rock', name: 'bare rock', glyph: '^' },
    { id: 'field', name: 'field', glyph: '"' },
    { id: 'path', name: 'path', glyph: '=' },
    { id: 'floor', name: 'floor', glyph: '_' },
    { id: 'wall', name: 'wall', glyph: '#' },
  ],
  // Index = LocalMap.water value.
  waters: [
    { id: 'none', name: 'dry land', glyph: ' ' },
    { id: 'river', name: 'river', glyph: '~' },
    { id: 'sea', name: 'sea', glyph: '≈' },
    { id: 'lake', name: 'lake', glyph: '≈' },
  ],
  // Index = LocalMap.tree value.
  trees: [
    { id: 'none', name: 'no trees', glyph: ' ' },
    { id: 'broadleaf', name: 'broadleaf trees', glyph: '♣' },
    { id: 'conifer', name: 'conifers', glyph: '♠' },
  ],
  // Index = LocalMap.mineral value.
  minerals: [
    { id: 'none', name: 'no minerals', glyph: ' ' },
    { id: 'stone', name: 'stone', glyph: '^' },
    { id: 'ore', name: 'ore', glyph: '*' },
    { id: 'clay', name: 'clay', glyph: '%' },
  ],
  // Footprints and building costs: content/buildings.ts.
  buildings: BUILDINGS,
  bridgeGlyph: '‖',
  outpost: {
    // Land below this fertility (0-100) cannot feed a hamlet.
    minFertility: 40,
    // A new outpost gets 8 to 14 settlers.
    settlers: [8, 14],
    // The party takes this many person-years of food each, as a new history site's half-year stores do.
    foodPerSettler: 0.5,
    // The origin sends about a tenth of its children and adults, within the settlers range.
    settlerShare: 0.1,
  },
  // Walking cost summed over the cells crossed, per day: a cost-1 cell takes 1/20 day.
  travelCostPerDay: 20,
  // Event types that pause play; later milestones fill the empty categories.
  autoPause: {
    deaths: ['site_died'],
    breakdowns: ['site_tantrum', 'site_despair', 'site_wandered', 'site_theft', 'site_item_stolen'],
    fires: ['site_fire', 'site_wildfire'],
    raids: [
      'site_threat_sign',
      'site_beast_arrived',
      'site_raid_arrived',
      'site_flight',
      'site_fell',
    ],
    arrivals: ['outpost_founded'],
  },
};
