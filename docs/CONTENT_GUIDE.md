# Content guide

Content ("raws") is typed data in `src/content/`. Add a race, spell, weather or event without touching engine code. `validateContent()` runs in tests and at startup and rejects bad references, effects above a tier's caps (R-24), self-taught magic (R-28) and races with advantages but no downside (R-29).

Each new content type gets one worked example here when it lands.

## Event type and template

Every emitted event needs a type with at least one template, and common events need three or more variants. Placeholders must come from the event record: `{date}`, `{actor}`, `{actor2}`… and keys in `data`.

```ts
// src/content/world.ts → eventTypes
{
  id: 'cold_snap',
  baseImportance: 4,
  category: 'nature',
  templates: [
    'On {date} a killing cold settled over the land, the worst of a harsh winter.',
    'The harsh winter tightened its grip on {date}; frost split stones and froze the wells.',
    '{date} brought a bitter cold snap that no hearth could fully hold back.',
  ],
}
```

## Event rule

A rule has a precondition (`when`), a tunable probability per due check (`weight`), and an effect that changes state and emits an event with cause links (`apply`). Tune with weights; never guarantee an outcome.

```ts
// src/content/world.ts → rules
{
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
}
```

## Ability or spell

Skills, abilities and spells share one shape. Requirements are hard gates. Magic must name a school and learn only from `teacher`, `book` or `institution`.

```ts
// src/content/abilities.ts → abilities
{
  id: 'kindle',
  name: 'Kindle',
  family: 'magic',
  school: 'fire',
  requirements: { power: 1, 'affinity.fire': 1 },
  learnAttributes: ['willpower'],
  learnFrom: ['teacher', 'book'],
  effect: { kind: 'utility', tag: 'light-fire' },
}
```

## Race

A race lists attribute means, magic tier weights per 100,000 births, lifespan, maturity, fertility, food need, preferred biomes and dependencies. If its magic or physical baseline beats humans, it must pay for it: low fertility, slow maturity or a dependency. See `src/content/races.ts`. Tylwyth live long and are magical but have few children and fade away from high-aura land; Dvergar are strong and enduring but hungry, slow to mature, weak at magic and tied to ore deposits.

Tuning change (M2.4b): fertility is back at the approved sketches (Tylwyth 0.3, Dvergar 0.5). The M2.3 raise to 0.6 and 0.75 is replaced by mechanisms: a Tylwyth site's capacity scales with mean aura in reach (`settlement.capacity.raceAura`), and a Dvergar site with no ore or stone in reach loses most of its food (`raceWithout`).

## Culture

A culture ties a race to customs: values, marriage, inheritance, government, succession, attitude to magic, religion, preferred biomes, site preferences and name tables. Each set of customs is chosen to make a particular kind of story. See `src/content/cultures.ts`; name tables live in `src/content/names.ts`.

```ts
// src/content/cultures.ts (abbreviated)
const gwerin: CultureDef = {
  id: 'gwerin',
  name: 'Gwerin',
  raceId: 'human',
  summary: 'Valley farmers and bards.',
  values: { kin: 9, honour: 5, faith: 6, wealth: 4, learning: 7, war: 3, freedom: 6, order: 4 },
  marriage: { custom: 'one-spouse', gift: 'none', arranged: true },
  inheritance: 'all-children', // split property makes cousin feuds
  government: 'chieftaincy',
  succession: 'kin-elected',
  magic: 'honoured',
  religion: { id: 'wells', name: 'The Wells' },
  preferredBiomes: ['temperate-forest', 'grassland'],
  sitePreferences: ['river', 'aura'],
  names: GWERIN_NAMES,
};
```

`validateContent` checks that culture ids are unique, the race and biome ids exist, every value is an integer from 0 to 10, no name list is empty, and every race has at least one culture.

## Weather

```ts
// src/content/world.ts → weather
{ id: 'harsh', name: 'Harsh', warmth: -30,
  seasonWeights: { spring: 0, summer: 0, autumn: 1, winter: 4 } }
```

Phase 1 replaces this global weather with per-cell climate.

## Phase 3 content (the watched site)

Each type below is one table the site engine reads. Add an entry; no engine change. Every entry here is copied from `src/content`.

### Need

A need drains each day, is restored by actions, and hurts mood when it hits zero.

```ts
// src/content/life.ts → NEEDS
{
  id: 'food',
  name: 'Food',
  decayPerDay: 35,
  restore: { eat: 60, steal: 30 },
  awayShare: 1,
  lowAt: 30,
  moodAtZero: -30,
  lowWord: 'Hungry',
  missing: 'no meal',
}
```

### Trait

A trait weights personality, can exclude another, and can set the breakdown a person has under stress.

```ts
// src/content/life.ts → TRAITS
{
  id: 'hot-tempered',
  name: 'hot-tempered',
  description: 'Quick to anger; breaks down in a rage.',
  weight: 10,
  excludes: ['steady'],
  mood: 0,
  breakdownAt: 0.85,
  breakdown: 'tantrum',
}
```

### Memory

A memory is a mood shift that fades. `{about}` names the person it concerns.

```ts
// src/content/life.ts → MEMORIES
{ id: 'went-hungry', mood: -8, decayDays: 4, text: 'Went to bed hungry' },
{ id: 'saw-tantrum', mood: -6, decayDays: 10, text: 'Saw {about} fly into a rage' },
```

### Job

A job names its worker, skill, workplace building and the need or good it serves.

```ts
// src/content/jobs.ts → JOBS
{
  id: 'farm',
  name: 'Farming',
  worker: 'farmer',
  skill: 'farming',
  requirements: {},
  workplace: 'field',
  action: 'farm',
  serves: 'food',
  tools: true,
  perWorkplace: 4,
  likedBy: ['steady'],
}
```

### Item, with effects

An artifact has forms, effects and downsides. Magic and might must cost something (R-29).

```ts
// src/content/items.ts → ITEMS
{
  id: 'blade',
  name: 'blade',
  good: 'luxury',
  per: 1,
  kind: 'artifact',
  forms: ['sword', 'axe'],
  effects: [{ kind: 'combat', value: 2 }],
  downsides: ['envy', 'theftDraw'],
}
```

### Building

A building has a size, a map glyph and, if people raise it, a work and a cost.

```ts
// src/content/buildings.ts → BUILDINGS
{
  id: 'home',
  name: 'home',
  glyph: 'h',
  w: 5,
  h: 4,
  walled: true,
  work: 30,
  cost: { logs: 250 },
  buildable: true,
}
```

### Interaction

Interactions are what two people do together. `opinion` is the shift for the actor and the target.

```ts
// src/content/interactions.ts → INTERACTIONS
{
  id: 'argue',
  name: 'argue',
  weight: 3,
  opinion: [-4, -4],
  traitWeights: { 'hot-tempered': 2 },
  moodWeight: 2,
}
```

### Condition

A condition has a severity that grows when its trigger holds. At 100 the person dies of `deathCause`.

```ts
// src/content/health.ts → CONDITIONS
{
  id: 'starving',
  name: 'Starving',
  kind: 'need',
  harm: 1,
  deathCause: 'famine',
  words: { onset: 'hunger', death: 'hunger' },
  need: {
    need: 'food',
    days: 2,
    gain: 3,
    ease: 10,
    cause: 'stores',
    vulnerable: { child: 1.5, elder: 1.5 },
  },
}
```

### Ailment

An ailment is a catching illness that sets a condition going.

```ts
// src/content/health.ts → AILMENTS
{
  id: 'chill',
  name: 'the chill',
  conditionId: 'chill',
  incubation: 1,
  duration: [5, 10],
  peak: [10, 35],
  infectivity: 0.015,
  ageRisk: { child: 2, adult: 1, elder: 3 },
  immuneDays: 56,
  grave: { chance: 0.05, mul: 3, cap: 150 },
}
```

### Creature

A creature lists where it lives, how dangerous it is and how it is named. `{near}` is the nearest place.

```ts
// src/content/creatures.ts → creatures
{
  id: 'cave-bear',
  name: 'cave bear',
  tier: 'beast',
  biomes: ['temperate-forest', 'taiga', 'alpine'],
  minWildness: 45,
  danger: 4,
  maxAlive: 4,
  spawnChance: 0.25,
  lifespan: [20, 45],
  raidChance: 0.12,
  raidRange: 10,
  names: ['the bear of {near}', 'Arth of {near}', 'the cave bear of {near}'],
}
```

### Awakening

An awakening is a way a person finds magic late in life, after enough days with a book or an item.

```ts
// src/content/awakenings.ts → AWAKENINGS
{
  id: 'long-study',
  source: 'book',
  afterDays: 168,
  monthlyChance: 0.08,
  maxFromTier: 'faint',
  how: 'after long study of {item}',
}
```

### Routine table

Free blocks of the day are drawn from a weighted table of places, so people differ and habits repeat.

```ts
// src/content/life.ts → LIFE.routines.tables
elder: { doorstep: 5, visit: 2, alehouse: 1.5, shrine: 1.5, green: 1.5, home: 1 },
holy: { green: 8, shrine: 5, alehouse: 1.5, visit: 1, doorstep: 0.5, home: 0.5 },
```

### Festival

A festival belongs to a religion and falls on a fixed day.

```ts
// src/content/society.ts → SOCIETY.festivals
{
  id: 'wells-may',
  religionId: 'wells',
  name: 'May Eve',
  month: 1,
  day: 28,
  rite: 'dressed the wells with flowers',
}
```

### Law and punishment

Each culture's law names a punishment per crime and the harshest it will use.

```ts
// src/content/society.ts → SOCIETY.laws
{
  cultureId: 'skarn',
  punish: { theft: 'labour', brawl: 'none', murder: 'exile' },
  max: 'execution',
  phrase: 'by the judgement of the Skarn assembly',
}
```

### Politics (succession and caravans)

Politics rules set how a leader is chosen, when a choice is disputed and how caravans run.

```ts
// src/content/politics.ts → POLITICS
succession: {
  disputeMargin: 15,
  disputeChance: 0.5,
  disputeLuck: 20,
  loserOpinion: -55,
  peoplePhrase: 'by the choice of the people, with no kin to take the seat by custom',
},
caravans: { partners: 2, recentYears: 50, seasons: [0, 1, 2], stayDays: 3, waitDays: 7 },
```
