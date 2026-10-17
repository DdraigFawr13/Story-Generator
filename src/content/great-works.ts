// Great works and enchanted items (history/great-works.ts): a legend or a rich realm raises one
// tower, wall, bridge or warded grove; a strong mage binds a spell into an item made from a slain
// beast's remains or rare ore. Tune the numbers here; the engine reads only this table.

import type { GreatWorkRules } from '../engine';

export const GREAT_WORKS: GreatWorkRules = {
  kinds: [
    {
      id: 'wall',
      word: 'wall',
      names: ['the {builder} Wall', 'the Wall of {site}', "{builder}'s Wall"],
      siteKinds: ['town', 'city'],
      features: [],
      builder: { minPower: 0, schools: [], raceIds: [] },
      // Goods the site pays; villages have little ore and luxury, so timber carries most of the cost.
      cost: { ore: 5, timber: 10 },
    },
    {
      id: 'bridge',
      word: 'bridge',
      names: ['the {builder} Bridge', 'the Bridge of {site}', "{builder}'s Bridge"],
      siteKinds: [],
      features: ['river', 'ford'],
      builder: { minPower: 0, schools: [], raceIds: [] },
      cost: { timber: 10 },
    },
    {
      id: 'tower',
      word: 'tower',
      names: ['the Tower of {builder}', "{builder}'s Tower", 'the {epithet} Tower'],
      siteKinds: [],
      features: [],
      // A mage of Strong power or more.
      builder: { minPower: 8, schools: [], raceIds: [] },
      cost: { ore: 5, timber: 5 },
    },
    {
      id: 'grove',
      word: 'warded grove',
      names: ['the Warded Grove of {builder}', 'the {epithet} Grove'],
      siteKinds: [],
      features: ['forest'],
      // A mage of life or earth, or an elf.
      builder: { minPower: 8, schools: ['life', 'earth'], raceIds: ['tylwyth'] },
      cost: { timber: 5 },
    },
    {
      id: 'item',
      word: 'great item',
      thing: true,
      names: [],
      siteKinds: [],
      features: [],
      builder: { minPower: 0, schools: [], raceIds: [] },
      cost: { ore: 3 },
    },
  ],
  // A mage prefers a grove where the woods allow it, then a tower; a warrior a wall, then a bridge.
  // Every legend whose site fits none leaves a great item.
  legendOrder: { mage: ['grove', 'tower', 'item'], warrior: ['wall', 'bridge', 'item'] },
  realmOrder: ['wall', 'bridge'],
  // A living legend who has raised nothing raises a work with 12% a year (legends live 20 years or so).
  legendChance: 0.12,
  // A ruler at a rich capital raises one with 0.6% a year; the richest third of capitals hold 650 wealth.
  realmChance: 0.006,
  realmWealthMin: 650,
  realmGapYears: 60,
  // At most two standing works at a site, one of each kind.
  maxPerSite: 2,
  // A work takes 3 to 8 years.
  years: [3, 8],
  epithets: ['Grey', 'High', 'Silent', 'Watchful', 'Old', 'White', 'Bright', 'Green', 'Deep'],
  // A walled site counts half again its defence; a beast raid on it kills half as many.
  wallDefence: 1.5,
  wallRaidShare: 0.5,
  // A bridge's tolls add half a wealth a year (about a twentieth of a town's mean yearly gain of 8).
  bridgeWealth: 0.5,
  // A warded grove adds a tenth to the harvest and cuts plague deaths by 30%.
  groveHarvest: 1.1,
  grovePlague: 0.7,
  // A standing tower keeps its builder's spells of Strong power (8) or more from being lost.
  towerKeepPower: 8,
  fallPhrases: {
    ruined: 'when {site} was ruined',
    breached: 'when the {civ} took {site}',
  },
  fallCauses: ['site_razed', 'site_abandoned', 'dragon_burned'],
  enchant: {
    // An enchanter is a Strong mage (power 8) who knows a spell of power 8 or more in their school.
    minPower: 8,
    spellPower: 8,
    // 9% a decade for each such mage.
    chance: 0.09,
    // Remains serve for 40 years, within 60 cells of the mage's town.
    remainsYears: 40,
    remainsRange: 60,
    // Half of the items go to the realm's ruler, hero or captain.
    giftChance: 0.5,
    // A holder of an enchanted item fights a beast as if 40 more soldiers stood beside them.
    fightEdge: 40,
    schools: {
      fire: {
        form: 'sword',
        beastNames: ['the Flame-blade of {beast}', 'the {Beast}-fang {Form}'],
        oreNames: ['the {Epithet} {Form} of {maker}', 'the Ember-{Form} of {maker}'],
      },
      earth: {
        form: 'helm',
        beastNames: ['the {Beast}-scale {Form}', 'the {Form} of {beast}'],
        oreNames: ['the {Epithet} {Form} of {maker}', 'the Stone-{Form} of {maker}'],
      },
      air: {
        form: 'bow',
        beastNames: ['the {Beast}-wing {Form}', 'the Wind-{Form} of {beast}'],
        oreNames: ['the {Epithet} {Form} of {maker}', 'the Gale-{Form} of {maker}'],
      },
      water: {
        form: 'cup',
        beastNames: ['the {Beast}-horn {Form}', 'the Tide-{Form} of {beast}'],
        oreNames: ['the {Epithet} {Form} of {maker}', 'the Spring-{Form} of {maker}'],
      },
      life: {
        form: 'ring',
        beastNames: ['the {Beast}-claw {Form}', 'the Green {Form} of {beast}'],
        oreNames: ['the {Epithet} {Form} of {maker}', 'the Seed-{Form} of {maker}'],
      },
      mind: {
        form: 'crown',
        beastNames: ['the {Beast}-eye {Form}', 'the Thought-{Form} of {beast}'],
        oreNames: ['the {Epithet} {Form} of {maker}', 'the Silver {Form} of {maker}'],
      },
    },
    greatNames: ["{builder}'s {Epithet} {Form}", 'the {Epithet} {Form} of {builder}'],
    epithets: ['Grey', 'Bright', 'Sworn', 'Deep', 'Silent', 'Fell', 'Last', 'First', 'Winter'],
    materials: { beast: 'the remains of {beast}', ore: 'the ore of {site}' },
    fates: { kept: 'and kept it', gift: 'and gave it to {holder}' },
  },
};
