// Weather, event types and event rules for the scaffold. Each event type has
// several template variants in the historian voice (§2B). Rules are tuned with
// weights only; they never guarantee outcomes (R-20).

import type { EventRuleDef, EventTypeDef, WeatherDef } from '../engine';

export const weather: WeatherDef[] = [
  {
    id: 'mild',
    name: 'Mild',
    warmth: 0,
    seasonWeights: { spring: 5, summer: 4, autumn: 5, winter: 1 },
  },
  {
    id: 'wet',
    name: 'Wet',
    warmth: -5,
    seasonWeights: { spring: 3, summer: 1, autumn: 3, winter: 2 },
  },
  {
    id: 'dry',
    name: 'Dry',
    warmth: 5,
    seasonWeights: { spring: 1, summer: 3, autumn: 1, winter: 0 },
  },
  {
    id: 'harsh',
    name: 'Harsh',
    warmth: -30,
    seasonWeights: { spring: 0, summer: 0, autumn: 1, winter: 4 },
  },
];

export const eventTypes: EventTypeDef[] = [
  {
    id: 'season_turned',
    baseImportance: 1,
    category: 'nature',
    templates: [
      'The {season} of {date} came in {weather}.',
      '{date}: the {season} arrived, and the weather turned {weather}.',
      'So began the {season}, {weather} from its first days ({date}).',
    ],
  },
  {
    id: 'cold_snap',
    baseImportance: 4,
    category: 'nature',
    templates: [
      'On {date} a killing cold settled over the land, the worst of a harsh winter.',
      'The harsh winter tightened its grip on {date}; frost split stones and froze the wells.',
      '{date} brought a bitter cold snap that no hearth could fully hold back.',
    ],
  },
  {
    id: 'civ_founded',
    baseImportance: 6,
    category: 'world',
    templates: [
      'In {date} the {culture} raised {site} and the {civ} began.',
      '{date}: the {civ} was founded when the {culture} settled at {site}.',
      'At {site}, in {date}, the {culture} made their first hearth, and so the {civ} was born.',
    ],
  },
  {
    id: 'site_founded',
    baseImportance: 3,
    category: 'world',
    templates: [
      'In {date} the {civ} founded {site}, a {kind}.',
      '{date}: settlers of the {civ} built the {kind} of {site}.',
      'The {civ} spread to a new place, and {site} became their {kind} ({date}).',
    ],
  },
  {
    id: 'bad_harvest',
    baseImportance: 2,
    category: 'nature',
    templates: [
      'In {date} {cause} cut the harvest at {site}, and the {civ} counted its grain.',
      '{date}: a poor harvest at {site}, laid to {cause}; the {civ} tightened its belts.',
      'The fields of {site} gave little in {date}, for {cause} had come upon the {civ}.',
    ],
  },
  {
    id: 'famine',
    baseImportance: 5,
    category: 'threat',
    templates: [
      'In {date} famine took {dead} at {site}, when the stores of the {civ} ran dry.',
      '{date}: hunger gripped {site}, and {dead} of the {civ} died before the next harvest.',
      'The granaries of {site} stood empty in {date}; {dead} perished among the {civ}.',
    ],
  },
  {
    id: 'plague',
    baseImportance: 6,
    category: 'threat',
    templates: [
      'In {date} plague struck {site}, and {dead} of the {civ} were buried.',
      '{date}: a sickness came to {site}; {dead} died, and the {civ} shut their doors.',
      'Fever swept {site} in {date}, taking {dead} of the {civ}.',
    ],
  },
  {
    id: 'migration',
    baseImportance: 3,
    category: 'social',
    templates: [
      'In {date} {count} of the {civ} left {from} for {to}.',
      '{date}: {count} people of the {civ} took the road from {from} and settled at {to}.',
      'Driven by want or crowding, {count} left {from} for {to} in {date}.',
    ],
  },
  {
    id: 'site_grew',
    baseImportance: 2,
    category: 'world',
    templates: [
      'By {date} {site} had grown into a {kind}, and the {civ} took pride in it.',
      '{date}: {site} of the {civ} became a {kind}.',
      'The people of {site} prospered, and in {date} it was counted a {kind}.',
    ],
  },
  {
    id: 'site_abandoned',
    baseImportance: 5,
    category: 'world',
    templates: [
      'In {date} {site} was abandoned by the {civ} and left to fall to ruin.',
      '{date}: the last of the {civ} left {site}, and its hearths went cold.',
      '{site} stood empty by {date}; the {civ} had gone, and the ruin began.',
    ],
  },
  {
    id: 'civ_fell',
    baseImportance: 8,
    category: 'politics',
    templates: [
      'In {date} the {civ} came to its end, with no hearth left to its name.',
      '{date}: the {civ} fell, and its people were scattered or gone.',
      'So ended the {civ} in {date}; none remained to keep its name.',
    ],
  },
];

export const rules: EventRuleDef[] = [
  {
    // Example rule: shows `when` (state precondition), `weight` (tunable
    // probability) and `apply` (state change + event with a cause link).
    id: 'cold_snap_in_harsh_winter',
    subject: 'world',
    cadence: 'weekly',
    when: (ctx) => ctx.state.weather.current === 'harsh',
    weight: () => 0.15,
    apply: (ctx) => {
      const cause = ctx.state.weather.causeEvent;
      const event = ctx.emit({ type: 'cold_snap', causes: cause === null ? [] : [cause] });
      ctx.state.weather = { current: 'harsh', sinceDay: ctx.state.day, causeEvent: event.id };
    },
  },
];
