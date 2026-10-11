// Fixed-order daily loop (R-21). Each system declares a cadence; on every day
// the due systems run in the order they are listed. Order is part of the
// simulation: append new systems deliberately, don't sort them.

import { CADENCES, isDue, type Cadence } from './clock';
import type { ContentBundle } from './content-types';
import { createContext, type SimContext } from './context';
import type { Command, WorldState } from './types';

export interface System {
  id: string;
  cadence: Cadence;
  run(ctx: SimContext): void;
}

export type CommandHandler = (ctx: SimContext, command: Command) => void;

export interface Simulation {
  content: ContentBundle;
  systems: readonly System[];
  /** Empty in observer mode. Hybrid modes (Phase 8) register handlers here. */
  commandHandlers?: Readonly<Record<string, CommandHandler>>;
}

/** Simulates one day: commands first, then due systems, then the clock advances. */
export function step(state: WorldState, sim: Simulation): void {
  const ctx = createContext(state, sim.content);
  if (state.commands.length > 0) {
    const due = state.commands.filter((command) => command.day <= state.day);
    state.commands = state.commands.filter((command) => command.day > state.day);
    for (const command of due) {
      const handler = sim.commandHandlers?.[command.kind];
      if (!handler) throw new Error(`No handler for command "${command.kind}".`);
      handler(ctx, command);
    }
  }
  for (const system of sim.systems) {
    if (isDue(system.cadence, state.day)) system.run(ctx);
  }
  state.day += 1;
}

export function advance(state: WorldState, sim: Simulation, days: number): void {
  for (let i = 0; i < days; i += 1) step(state, sim);
}

/** Runs content event rules of one cadence (§7.5). One system per cadence keeps order stable. */
export function rulesSystem(cadence: Cadence): System {
  return {
    id: `rules.${cadence}`,
    cadence,
    run(ctx) {
      const rng = ctx.rng('rules');
      for (const rule of ctx.content.rules) {
        if (rule.cadence !== cadence || !rule.when(ctx)) continue;
        if (rng.chance(rule.weight(ctx))) rule.apply(ctx);
      }
    },
  };
}

export function allRuleSystems(): System[] {
  return CADENCES.map(rulesSystem);
}
