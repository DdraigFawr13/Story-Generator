// Demo system for the scaffold: draws seasonal weather and records it.
// It shows the pattern every system follows: read content, use a named
// stream, mutate state, emit an event with causes. Phase 1 replaces this with
// per-cell climate; Phase 3 reads weather for warmth, crops and work.

import { dateOf } from '../core/clock';
import type { System } from '../core/scheduler';

export const seasonalWeatherSystem: System = {
  id: 'weather.seasonal',
  cadence: 'seasonal',
  run(ctx) {
    const { season } = dateOf(ctx.state.day);
    const entries = ctx.content.weather.map((w): [string, number] => [
      w.id,
      w.seasonWeights[season],
    ]);
    const weatherId = ctx.rng('weather').weighted(entries);
    const def = ctx.content.weather.find((w) => w.id === weatherId)!;
    const event = ctx.emit({
      type: 'season_turned',
      data: { season, weather: def.name.toLowerCase() },
    });
    ctx.state.weather = { current: weatherId, sinceDay: ctx.state.day, causeEvent: event.id };
  },
};
