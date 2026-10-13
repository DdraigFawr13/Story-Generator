// The watched site's chronicle (M3.11): which small lines fold into a monthly rollup, and the
// historian's season and year recaps. A recap only counts events that happened; the words for
// each count live here.

import type { ChronicleRules, EventTypeDef } from '../engine';

export const CHRONICLE: ChronicleRules = {
  // Importance 1 (market days, skills, spoilage, weather, sowing) folds into one line a month.
  rollupBelow: 2,
  recap: {
    seasonType: 'site_season_recap',
    yearType: 'site_year_recap',
    // The three most important events of the period, as the recap's "why?".
    causes: 3,
    causeAtLeast: 3,
    tally: [
      { types: ['site_birth'], one: 'one birth', many: '{n} births' },
      { types: ['site_died'], one: 'one death', many: '{n} deaths' },
      { types: ['site_married'], one: 'one wedding', many: '{n} weddings' },
      { types: ['site_came_of_age'], one: 'one came of age', many: '{n} came of age' },
      { types: ['site_fell_ill'], one: 'one fell ill', many: '{n} fell ill' },
      { types: ['site_brawl'], one: 'one brawl', many: '{n} brawls' },
      { types: ['site_judged'], one: 'one wrongdoer judged', many: '{n} wrongdoers judged' },
      { types: ['site_fire', 'site_wildfire'], one: 'one fire', many: '{n} fires' },
      {
        types: ['site_prowler', 'site_beast_arrived', 'site_raid_arrived'],
        one: 'one attack',
        many: '{n} attacks',
      },
      {
        types: ['site_caravan_arrived', 'site_caravan_quiet'],
        one: 'one caravan',
        many: '{n} caravans',
      },
      { types: ['site_festival'], one: 'one festival', many: '{n} festivals' },
      { types: ['site_built'], one: 'one building finished', many: '{n} buildings finished' },
      { types: ['site_cantrip_learned'], one: 'one cantrip learned', many: '{n} cantrips learned' },
    ],
    maxTally: 6,
    quiet: 'nothing of note',
    seasons: ['spring', 'summer', 'autumn', 'winter'],
  },
};

export const CHRONICLE_EVENTS: EventTypeDef[] = [
  {
    id: 'site_season_recap',
    baseImportance: 3,
    title: 'The {season} at {site}',
    causeWord: 'remembered for',
    category: 'life',
    links: { site: 'site' },
    templates: [
      'The {season} at {site} closed with {tally}. {pop} people live there now, with food for {stores} days.',
      'So passed the {season} at {site}: {tally}. The village numbers {pop}, with {stores} days of food in store.',
      'The historian of {site} wrote of the {season}: {tally}. {pop} remain, and the stores hold {stores} days.',
    ],
  },
  {
    id: 'site_year_recap',
    baseImportance: 5,
    title: 'Year {year} at {site}',
    causeWord: 'remembered for',
    category: 'life',
    links: { site: 'site' },
    templates: [
      'Year {year} at {site} is done: {tally}. It began with {popStart} people and ends with {pop}.',
      'The historian closed the book on Year {year} at {site}: {tally}. {popStart} people at its start, {pop} at its end.',
      'So ended Year {year} at {site}, a year of {tally}. From {popStart} people the village came to {pop}.',
    ],
  },
];
