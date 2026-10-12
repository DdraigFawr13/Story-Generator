// Legends browser content (M2.7): which event types belong to which filter group.
import type { EventTypeGroup } from '../engine';

/** Filter groups and the year-gutter colour key for "every event" lists; every type in one group. */
export const TYPE_GROUPS: EventTypeGroup[] = [
  {
    id: 'wars',
    label: 'Wars',
    types: [
      'war_declared',
      'battle',
      'site_razed',
      'site_conquered',
      'peace_made',
      'border_clash',
      'insult',
      'civ_raid',
      'oath_sworn',
    ],
  },
  {
    id: 'rulers',
    label: 'Rulers',
    types: [
      'ruler_succeeded',
      'succession_disputed',
      'dynasty_founded',
      'civ_founded',
      'civ_fell',
      'legend_risen',
    ],
  },
  {
    id: 'lives',
    label: 'Lives',
    types: ['notable_born', 'mage_born', 'marriage', 'notable_died'],
  },
  {
    id: 'calamities',
    label: 'Calamities',
    types: [
      'bad_harvest',
      'famine',
      'plague',
      'fever',
      'pox',
      'dry_years_began',
      'dry_years_ended',
      'cold_years_began',
      'cold_years_ended',
      'beast_appeared',
      'beast_raid',
      'beast_slain',
    ],
  },
  {
    id: 'places',
    label: 'Places',
    types: [
      'site_founded',
      'outpost_founded',
      'site_grew',
      'site_abandoned',
      'migration',
      'grain_relief',
      'trade_opened',
    ],
  },
  {
    id: 'things',
    label: 'Things',
    types: [
      'artifact_made',
      'book_written',
      'item_inherited',
      'item_lost',
      'item_stolen',
      'item_found',
    ],
  },
];
