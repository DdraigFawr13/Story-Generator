// The handle every system and event rule receives. Systems mutate `state`
// directly and report what happened through `emit`, so the chronicle always
// renders real events.

import type { ContentBundle, EventTypeDef } from './content-types';
import { streamFor, type RngStream } from './rng';
import type { EntityKind, Id, SimEvent, WorldState } from './types';

export interface EmitInput {
  type: string;
  actors?: Id[];
  place?: number | null;
  causes?: Id[];
  data?: SimEvent['data'];
  /** Added to the content base importance: fame, deaths, scale, novelty (§10). */
  importanceBonus?: number;
}

export interface SimContext {
  readonly state: WorldState;
  readonly content: ContentBundle;
  rng(stream: string): RngStream;
  nextId(kind: EntityKind): Id;
  emit(input: EmitInput): SimEvent;
  eventType(id: string): EventTypeDef;
  /** Most recent event of a type, for linking causes. */
  lastEvent(type: string): SimEvent | undefined;
}

export function createContext(state: WorldState, content: ContentBundle): SimContext {
  const types = new Map(content.eventTypes.map((def) => [def.id, def]));
  const ctx: SimContext = {
    state,
    content,
    rng: (stream) => streamFor(state, stream),
    nextId(kind) {
      const id = state.nextId[kind];
      state.nextId[kind] = id + 1;
      return id;
    },
    eventType(id) {
      const def = types.get(id);
      if (!def) throw new Error(`Event type "${id}" has no content definition.`);
      return def;
    },
    emit(input) {
      const def = ctx.eventType(input.type);
      const event: SimEvent = {
        id: ctx.nextId('event'),
        day: state.day,
        type: input.type,
        importance: def.baseImportance + (input.importanceBonus ?? 0),
        actors: input.actors ?? [],
        place: input.place ?? null,
        causes: input.causes ?? [],
        data: input.data ?? {},
      };
      state.events.push(event);
      return event;
    },
    lastEvent(type) {
      for (let i = state.events.length - 1; i >= 0; i -= 1) {
        if (state.events[i]!.type === type) return state.events[i];
      }
      return undefined;
    },
  };
  return ctx;
}
