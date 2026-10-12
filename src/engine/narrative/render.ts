// Narrator seam (R-16). Templates add flair, never facts: every placeholder
// must come from the event record. An optional LLM narrator can implement the
// same interface later.

import { DAYS_PER_YEAR, formatDate } from '../core/clock';
import type { ContentBundle, EventTypeDef } from '../core/content-types';
import { hashString } from '../core/rng';
import type { Id, SimEvent } from '../core/types';

export interface Narrator {
  renderEvent(event: SimEvent): string;
  /** Renders one specific template variant (tests render every variant). */
  renderVariant(event: SimEvent, index: number): string;
}

/** Replaces {key} placeholders. Throws on a missing value so bugs surface early. */
export function fillTemplate(template: string, vars: Record<string, string | number>): string {
  const filled = template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = vars[key];
    if (value === undefined) throw new Error(`Template value "${key}" missing: ${template}`);
    return String(value);
  });
  // "a axe" -> "an axe" once values are in.
  return filled.replace(/\b([Aa]) (?=[AEIOUaeiou])/g, '$1n ');
}

/**
 * The placeholder values for an event: `date`, `year` (history year), its data, and its actors
 * as `actor`, `actor2`, ... History events carry no real day, so `precision: 'year'` types print "Year N".
 */
export function eventVars(
  event: SimEvent,
  nameOf: (id: Id) => string,
  def?: EventTypeDef,
): Record<string, string | number> {
  const year = Math.floor(event.day / DAYS_PER_YEAR);
  const vars: Record<string, string | number> = {
    date: def?.precision === 'year' ? `Year ${year}` : formatDate(event.day),
    year,
  };
  for (const [key, value] of Object.entries(event.data)) vars[key] = String(value);
  event.actors.forEach((id, index) => {
    vars[index === 0 ? 'actor' : `actor${index + 1}`] = nameOf(id);
  });
  return vars;
}

/**
 * Local template narrator. The variant is chosen from the event id, so prose
 * is stable across reloads without consuming simulation RNG.
 */
export function templateNarrator(content: ContentBundle, nameOf: (id: Id) => string): Narrator {
  const types = new Map(content.eventTypes.map((def) => [def.id, def]));
  const render = (event: SimEvent, pick: (count: number) => number): string => {
    const def = types.get(event.type);
    if (!def || def.templates.length === 0) return `[${event.type}]`;
    const template = def.templates[pick(def.templates.length)]!;
    return fillTemplate(template, eventVars(event, nameOf, def));
  };
  return {
    renderEvent: (event) => render(event, (count) => hashString(`${event.id}`) % count),
    renderVariant: (event, index) => render(event, () => index),
  };
}
