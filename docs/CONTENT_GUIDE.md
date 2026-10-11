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

A race lists attribute means, magic tier weights per 100,000 births, lifespan, maturity, fertility, food need, preferred biomes and dependencies. If its magic or physical baseline beats humans, it must pay for it: low fertility, slow maturity or a dependency. See `src/content/races.ts`. The two non-human races are placeholders until the Phase 2 sketches are approved.

## Weather

```ts
// src/content/world.ts → weather
{ id: 'harsh', name: 'Harsh', warmth: -30,
  seasonWeights: { spring: 0, summer: 0, autumn: 1, winter: 4 } }
```

Phase 1 replaces this global weather with per-cell climate.
