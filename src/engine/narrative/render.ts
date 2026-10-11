// Narrator seam (R-16). Templates add flair, never facts: every placeholder
// must come from the event record. An optional LLM narrator can implement the
// same interface later.

import { formatDate } from '../core/clock';
import type { ContentBundle } from '../core/content-types';
import { hashString } from '../core/rng';
import type { Id, SimEvent } from '../core/types';

export interface Narrator {
  renderEvent(event: SimEvent): string;
}

/** Replaces {key} placeholders. Throws on a missing value so bugs surface early. */
export function fillTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = vars[key];
    if (value === undefined) throw new Error(`Template value "${key}" missing: ${template}`);
    return String(value);
  });
}

/**
 * Local template narrator. The variant is chosen from the event id, so prose
 * is stable across reloads without consuming simulation RNG.
 */
export function templateNarrator(content: ContentBundle, nameOf: (id: Id) => string): Narrator {
  const types = new Map(content.eventTypes.map((def) => [def.id, def]));
  return {
    renderEvent(event) {
      const def = types.get(event.type);
      if (!def || def.templates.length === 0) return `[${event.type}]`;
      const template = def.templates[hashString(`${event.id}`) % def.templates.length]!;
      const vars: Record<string, string | number> = { date: formatDate(event.day) };
      for (const [key, value] of Object.entries(event.data)) vars[key] = String(value);
      event.actors.forEach((id, index) => {
        vars[index === 0 ? 'actor' : `actor${index + 1}`] = nameOf(id);
      });
      return fillTemplate(template, vars);
    },
  };
}
