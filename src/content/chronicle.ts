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
    // Up to three of the period's most important events, as the recap's "why?".
    causes: 3,
    causeAtLeast: 3,
    // Ranked by weight; the season names five, the year eight. `{n}` is spelled out up to ten.
    tally: [
      { types: ['site_died'], one: 'a death', many: '{n} deaths', weight: 9 },
      {
        types: ['site_prowler', 'site_beast_arrived', 'site_raid_arrived'],
        one: 'an attack',
        many: '{n} attacks',
        weight: 9,
      },
      { types: ['site_fire', 'site_wildfire'], one: 'a fire', many: '{n} fires', weight: 8 },
      { types: ['site_birth'], one: 'a birth', many: '{n} births', weight: 7 },
      { types: ['site_married'], one: 'a wedding', many: '{n} weddings', weight: 7 },
      {
        types: ['site_fell_ill'],
        peak: { type: 'site_outbreak', key: 'count' },
        one: 'one laid low by sickness',
        many: 'sickness that laid {n} low',
        weight: 6,
      },
      {
        types: ['site_judged'],
        one: 'one brought to judgement',
        many: '{n} brought to judgement',
        weight: 6,
      },
      {
        types: ['site_caravan_arrived', 'site_caravan_quiet'],
        one: 'a caravan',
        many: '{n} caravans',
        weight: 5,
      },
      { types: ['site_festival'], one: 'a festival', many: '{n} festivals', weight: 5 },
      {
        types: ['site_came_of_age'],
        one: 'a child grown to adulthood',
        many: '{n} children grown to adulthood',
        weight: 4,
      },
      {
        types: ['site_cantrip_learned'],
        one: 'a cantrip learned',
        many: '{n} cantrips learned',
        weight: 4,
      },
      { types: ['site_brawl'], one: 'a brawl', many: '{n} brawls', weight: 3 },
      {
        types: ['site_built'],
        one: 'a building finished',
        many: '{n} buildings finished',
        weight: 3,
      },
    ],
    maxTally: { season: 5, year: 8 },
    quiet: 'little else of note',
    // "Autumn at Svalathorp was a season of old scores": what the top cited event was about.
    themes: {
      site_revenge: 'old scores',
      site_enmity: 'old scores',
      site_forgave: 'mending',
      site_brawl: 'quarrels',
      site_murder: 'blood',
      site_judged: 'judgement',
      site_exiled: 'judgement',
      site_executed: 'judgement',
      site_outbreak: 'sickness',
      site_fell_ill: 'sickness',
      site_died: 'mourning',
      site_funeral: 'mourning',
      site_married: 'weddings',
      site_lovers: 'courting',
      site_birth: 'new life',
      site_festival: 'feasting',
      site_fire: 'fire',
      site_wildfire: 'fire',
      site_harvest: 'harvest',
      site_harvest_poor: 'want',
      site_food_short: 'want',
      site_stores_empty: 'hunger',
      site_meals_cut: 'hunger',
      site_hard_winter: 'cold',
      site_leader_named: 'new rule',
      site_leader_succeeded: 'new rule',
      site_succession_disputed: 'rivalry',
    },
    themeByCategory: {
      life: 'daily toil',
      social: 'neighbours',
      nature: 'weather',
      threat: 'danger',
      politics: 'politics',
      magic: 'wonders',
      world: 'news',
    },
    seasons: ['spring', 'summer', 'autumn', 'winter'],
  },
};

export const CHRONICLE_EVENTS: EventTypeDef[] = [
  {
    id: 'site_season_recap',
    baseImportance: 3,
    title: 'The {season} at {site}',
    dataKeys: ['site', 'season', 'story', 'tally', 'pop', 'stores'],
    causeWord: 'remembered for',
    category: 'life',
    links: { site: 'site' },
    // {story} opens with what the season was about, from its cited events (recap.ts).
    templates: [
      '{story} The season also saw {tally}. {pop} people live there now, with food for {stores} days.',
      '{story} Besides that, {tally}. The village numbers {pop}, with {stores} days of food in store.',
      '{story} The historian also counted {tally}. {pop} remain, and the stores hold {stores} days.',
    ],
  },
  {
    id: 'site_year_recap',
    baseImportance: 5,
    title: 'Year {year} at {site}',
    dataKeys: ['site', 'story', 'tally', 'popStart', 'pop', 'stores'],
    causeWord: 'remembered for',
    category: 'life',
    links: { site: 'site' },
    // The year's last evening has no winter recap of its own: the year's recap covers winter too.
    templates: [
      '{story} The year also saw {tally}. It began with {popStart} people and ends with {pop}, with food for {stores} days.',
      '{story} Besides that, {tally}. {popStart} people at its start, {pop} at its end, and {stores} days of food in store.',
      '{story} The historian also counted {tally}. From {popStart} people the village came to {pop}; the stores hold {stores} days.',
    ],
  },
];
