// Faiths: the gods, priests and clashes of each culture's religion, and every tunable of the
// faith engine (history/faith.ts). One def per `religion.id` in cultures.ts. A faith clashes with
// another when it abhors what the other holds sacred, so the pairs below are chosen to quarrel:
// war is abhorred by the Wells, Scales and Hearth but sacred to five others; order, freedom,
// wealth, learning and honour each have a faith against them and a faith for them.

import type { EventTypeDef, FaithRules } from '../engine';

export const FAITHS: FaithRules = {
  defs: [
    {
      id: 'wells',
      gods: ['Nodens'],
      priestTitle: 'Wellkeeper',
      sacred: ['kin', 'learning'],
      abhors: 'war',
      schismNames: ['The Deep Wells', 'The Seven Springs', 'The Still Pool'],
    },
    {
      id: 'hall',
      gods: ['Wodar', 'Thrunn', 'Freyna', 'Hald'],
      priestTitle: 'Gothi',
      sacred: ['honour', 'war'],
      abhors: 'order',
      schismNames: ['The Ash Hall', 'The Mead Benches', 'The Oar Oath'],
    },
    {
      id: 'eternal-sky',
      gods: ['Tengre'],
      priestTitle: 'Great Kam',
      sacred: ['freedom', 'war'],
      abhors: 'order',
      schismNames: ['The Blue Wolf', 'The Silent Steppe', 'The Grey Banner'],
    },
    {
      id: 'river-mothers',
      gods: ['Isheret', 'Nuum', 'Sabbet'],
      priestTitle: 'Tidewarden',
      sacred: ['order', 'learning'],
      abhors: 'freedom',
      schismNames: ['The Silt Mothers', 'The Flood Rite', 'The Dry Canal'],
    },
    {
      id: 'the-grove',
      gods: ['Cernun'],
      priestTitle: 'Archdruid',
      sacred: ['learning', 'kin'],
      abhors: 'wealth',
      schismNames: ['The Oak Circle', 'The Yew Covenant', 'The Hollow Grove'],
    },
    {
      id: 'ancestor-stones',
      gods: ['Gundar', 'Modrek', 'Brannlin'],
      priestTitle: 'Stone-Reader',
      sacred: ['kin', 'order'],
      abhors: 'freedom',
      schismNames: ['The Hollow Stones', 'The Deep Forge', 'The Rune Heirs'],
    },
    {
      id: 'the-scales',
      gods: ['Mercato', 'Aurelis'],
      priestTitle: 'Weighmaster',
      sacred: ['wealth', 'freedom'],
      abhors: 'war',
      schismNames: ['The Open Ledger', 'The Gilded Scale', 'The Harbour Pact'],
    },
    {
      id: 'mother-hills',
      gods: ['Brigha'],
      priestTitle: 'Hill-Mother',
      sacred: ['kin', 'honour'],
      abhors: 'wealth',
      schismNames: ['The Cairn Daughters', 'The Red Heather', 'The High Pastures'],
    },
    {
      id: 'the-wild-hunt',
      gods: ['Gwynn'],
      priestTitle: 'Huntmaster',
      sacred: ['freedom', 'learning'],
      abhors: 'order',
      schismNames: ['The Pale Riders', 'The Hollow Horn', 'The Fen Lights'],
    },
    {
      id: 'drowned-kings',
      gods: ['Balor', 'Tethra', 'Elatha'],
      priestTitle: 'Tidecaller',
      sacred: ['war', 'freedom'],
      abhors: 'learning',
      schismNames: ['The Sunken Throne', 'The Black Tide', 'The Salt Crown'],
    },
    {
      id: 'blood-moon',
      gods: ['Urgash', 'Moka'],
      priestTitle: 'Blood-Shaman',
      sacred: ['honour', 'war'],
      abhors: 'wealth',
      schismNames: ['The Red Tusk', 'The Waning Moon', 'The Bone Drum'],
    },
    {
      id: 'the-sleepers',
      gods: ['Mawr'],
      priestTitle: 'Dreamkeeper',
      sacred: ['kin', 'freedom'],
      abhors: 'order',
      schismNames: ['The Waking', 'The Moor Stones', 'The Last Dream'],
    },
    {
      id: 'the-hearth',
      gods: ['Embra', 'Old Tallow'],
      priestTitle: 'Hearthwarden',
      sacred: ['kin', 'freedom'],
      abhors: 'war',
      schismNames: ['The Cold Hearth', 'The Open Door', 'The Long Table'],
    },
    {
      id: 'the-moon-hag',
      gods: ['Hagwen'],
      priestTitle: 'Moon-Crone',
      sacred: ['wealth', 'war'],
      abhors: 'honour',
      schismNames: ['The Waning Crone', 'The Fen Candle', 'The Black Sack'],
    },
  ],
  // Culture faith value (0-10) at or above which a realm's faith acts: heresy, prophets.
  minZeal: 5,
  // A war between clashing faiths is holy when the attacker's faith value is at least this, or a
  // preached war or defiled temple stands among its causes.
  holyZeal: 5,
  // Per decade per linked pair of clashing faiths, times zeal/10, a side denounces the other.
  heresyChance: 0.2,
  // Grievance a denunciation adds, times the clash (1 when one faith abhors the other, 2 both ways).
  heresyGrievance: 1,
  // Grievance every co-religionist realm holds against one that razes or takes a holy place.
  desecrationGrievance: 3,
  // A site taken in a holy war takes the conqueror's faith at once in one case of two.
  holyConvert: 0.5,
  // Holy wars end only after 1.5 times the losses of an ordinary war.
  holyWeary: 1.5,
  // Per decade, times zeal/10: a site keeping another faith takes its realm's.
  convertChance: 0.15,
  // When 60% of a realm's adults keep one other faith, its ruler adopts it 3 decades in 10.
  rulerConvertShare: 0.6,
  rulerConvertChance: 0.3,
  // A town of another faith than its realm breaks away twice as readily.
  minorityBreakaway: 2,
  // Realms of one faith make war on each other at 70% of the usual score.
  sameFaithWar: 0.7,
  // A free city weighs a co-religionist neighbour's adults double when it picks a pact partner.
  sameFaithPact: 2,
  // Per decade per live realm, times zeal/10: about one prophet in 25 decades of a zealous realm.
  prophetChance: 0.04,
  maxProphets: 3,
  // Fame (0-100): a high priest is known across the realm, a prophet across the world.
  fame: { priest: 30, prophet: 45 },
  // What a prophet does at once on rising, among the acts that are possible.
  prophetActs: { preach: 1, schism: 1, mission: 1 },
  // Grievance a preached holy war adds against the faith's enemy.
  preachGrievance: 4,
};

/**
 * Event types of the faith engine. `{priest}` is a ready phrase: the high priest by name and title,
 * or "the priests of {faith}" when none lives, so it always sits mid-sentence. Faith names carry
 * their own "The", so they print bare.
 */
export const FAITH_EVENTS: EventTypeDef[] = [
  {
    id: 'high_priest_named',
    baseImportance: 2,
    title: '{name} named {rank} of {faith}',
    category: 'social',
    precision: 'year',
    links: { site: 'site', civ: 'civ' },
    dataKeys: ['god', 'rank'],
    rollup: ['high priest named', 'high priests named'],
    templates: [
      'In {date} {name} became {rank} of {faith} at {site}, among the {civ}.',
      '{date}: {name} took up the staff of {rank} of {faith} at {site}, in the service of {god}.',
      '{site} of the {civ} saw {name} named {rank} of {faith} in {date}.',
    ],
  },
  {
    id: 'heresy_denounced',
    baseImportance: 2,
    title: '{civ} denounced {otherFaith}',
    category: 'social',
    precision: 'year',
    links: { civ: 'civ', other: 'civ' },
    dataKeys: ['god', 'faith'],
    rollup: ['denunciation of heresy', 'denunciations of heresy'],
    templates: [
      'In {date}, {priest} swore before {god} that {otherFaith}, the faith of the {other}, was a lie, and the {civ} took up the quarrel.',
      '{date}: the {civ} denounced {otherFaith} as heresy, and the {other} who keep it.',
      '{date}: speaking for the {civ}, {priest} cursed {otherFaith}, and the {other} were named enemies of {god}.',
    ],
  },
  {
    id: 'site_converted',
    baseImportance: 2,
    title: '{site} took up {faith}',
    category: 'social',
    precision: 'year',
    links: { site: 'site', civ: 'civ' },
    rollup: ['conversion', 'conversions'],
    templates: [
      'In {date} {site} of the {civ} turned from {from} to {faith}.',
      '{date}: the people of {site} took up {faith}, leaving {from}.',
      '{site} forsook {from} for {faith} in {date}.',
    ],
  },
  {
    id: 'ruler_converted',
    baseImportance: 6,
    title: '{name} of {civ} took up {faith}',
    category: 'social',
    precision: 'year',
    links: { civ: 'civ' },
    dataKeys: ['god'],
    templates: [
      'In {date} {name}, ruler of the {civ}, turned from {from} to {faith} and gave thanks to {god}.',
      '{date}: {name} of the {civ} took up {faith}, and the realm with them.',
      'The ruler of the {civ}, {name}, forsook {from} for {faith} in {date}.',
    ],
  },
  {
    id: 'prophet_rose',
    baseImportance: 6,
    title: 'The prophet {name} rose',
    category: 'social',
    precision: 'year',
    links: { site: 'site', civ: 'civ' },
    dataKeys: ['god'],
    templates: [
      'In {date} {name}, a prophet of {faith}, rose at {site} among the {civ}, speaking for {god}.',
      '{date}: at {site}, {name} of the {civ} began to preach the word of {god} as a prophet of {faith}.',
      'A prophet of {faith}, {name}, rose at {site} in {date}.',
    ],
  },
  {
    id: 'holy_war_preached',
    baseImportance: 7,
    title: '{name} preached holy war on {other}',
    category: 'politics',
    precision: 'year',
    links: { civ: 'civ', other: 'civ' },
    dataKeys: ['faith', 'god'],
    templates: [
      'In {date} the prophet {name} of the {civ} preached holy war against the {other} and {otherFaith}, in the name of {god}.',
      '{date}: {name} called the {civ} to drive {otherFaith} from the {other}, before {god}.',
      'The prophet {name} cried holy war on the {other} in {date}, and the {civ} heard it.',
    ],
  },
  {
    id: 'faith_schism',
    baseImportance: 8,
    title: '{faith} split from {parent}',
    category: 'social',
    precision: 'year',
    links: { site: 'site', civ: 'civ' },
    dataKeys: ['god', 'civ'],
    templates: [
      'In {date} the prophet {name} broke from {parent} at {site} and founded {faith}, serving {god}.',
      '{date}: at {site}, {name} split {faith} off from {parent}.',
      'The {civ} saw {parent} divide in {date}: {name} named a new faith, {faith}, for {god}.',
    ],
  },
  {
    id: 'faith_spread',
    baseImportance: 5,
    title: '{faith} won {site}',
    category: 'social',
    precision: 'year',
    links: { site: 'site', civ: 'civ' },
    templates: [
      'In {date} the prophet {name} carried {faith} to {site} of the {civ}, turning it from {from}.',
      '{date}: {site} took up {faith} at the word of the prophet {name}, leaving {from}.',
      'Missionaries of {faith} won {site} from {from} in {date}, led by the prophet {name}.',
    ],
  },
  {
    id: 'faith_forgotten',
    baseImportance: 5,
    title: '{faith} forgotten',
    category: 'social',
    precision: 'year',
    dataKeys: ['god'],
    templates: [
      'In {date} {faith} died out; no town still prayed to {god}.',
      '{date}: no town kept {faith} any longer, and {god} was left without worshippers.',
      '{faith} was forgotten by {date}.',
    ],
  },
  {
    id: 'holy_war_proclaimed',
    baseImportance: 7,
    title: 'Holy war: {civ} on {enemy}',
    category: 'politics',
    precision: 'year',
    links: { civ: 'civ', enemy: 'civ' },
    dataKeys: ['faith', 'god'],
    templates: [
      'In {date}, {priest} proclaimed a holy war on the {enemy} in the name of {god}, and the {civ} took up arms.',
      '{date}: the {civ} went to war on the {enemy} as a holy war; {priest} named it the will of {god}.',
      'A holy war: in {date} {priest} blessed the arms of the {civ} against the {enemy}, before {god}.',
    ],
  },
  {
    id: 'temple_desecrated',
    baseImportance: 7,
    title: '{site} desecrated by {civ}',
    category: 'politics',
    precision: 'year',
    links: { site: 'site', civ: 'civ', loser: 'civ' },
    dataKeys: ['loser', 'god'],
    templates: [
      'In {date} the {civ} desecrated {site}, a holy place of {faith}, and its followers held it against them.',
      '{date}: {site} was defiled by the {civ}; {faith} lost a sacred place.',
      'The {civ} laid hands on {site}, holy to {god}, in {date}.',
    ],
  },
  {
    id: 'holy_city_taken',
    baseImportance: 8,
    title: 'Holy city {site} taken by {civ}',
    category: 'politics',
    precision: 'year',
    links: { site: 'site', civ: 'civ', loser: 'civ' },
    dataKeys: ['god'],
    templates: [
      'In {date} the {civ} took {site}, holy city of {faith}, from the {loser}.',
      '{date}: {site}, where {god} was worshipped, fell to the {civ}, and {faith} lost its holy city.',
      'The holy city of {faith}, {site}, passed to the {civ} in {date}.',
    ],
  },
];
