// What the Tales map marks besides the land: great beasts, great figures and armies, built once
// from a finished world. No DOM. Armies are drawn from the battles the history logged: a host walks
// the roads from its realm's capital to the battle in the year before the fight.

import type { ContentBundle, Id, WorldState } from '../../engine';
import type { PlaybackData } from '../playback/data';
import { roadPath } from './march';

export interface Beast {
  id: Id;
  name: string;
  cell: number;
  /** Years it lives: from birth to death (Infinity while it lives). */
  from: number;
  to: number;
  danger: number;
}
export interface Figure {
  id: Id;
  name: string;
  cell: number;
  from: number;
  to: number;
  fame: number;
}
export interface March {
  key: string;
  /** The attacking realm's name. */
  civ: string;
  /** The battle's year, with the day as a fraction. */
  at: number;
  /** Where the host starts and the battle site, as cells. */
  from: number;
  to: number;
  /** The road path, found when first needed. */
  path: () => number[];
}
export interface Model {
  beasts: Beast[];
  figures: Figure[];
  marches: March[];
}

/** Years an army walks before its battle, and stays after it. */
export const MARCH_YEARS = 0.7;
export const STAY_YEARS = 0.3;

export function buildModel(world: WorldState, data: PlaybackData, content: ContentBundle): Model {
  const cells = world.cells!;
  const tiers = new Map(content.creatures.map((def) => [def.id, def]));
  const beasts: Beast[] = [];
  for (const creature of world.creatures.values()) {
    const def = tiers.get(creature.defId);
    if (!def || (def.tier === 'beast' && !creature.dragon)) continue;
    beasts.push({
      id: creature.id,
      name: creature.name,
      cell: creature.lair,
      from: creature.born,
      to: creature.died ?? Infinity,
      danger: def.danger,
    });
  }
  beasts.sort((a, b) => b.danger - a.danger || a.id - b.id);

  const figures: Figure[] = [];
  for (const event of data.events) {
    if (event.type !== 'legend_risen') continue;
    const id = event.actors[0];
    const person = id === undefined ? undefined : world.people.get(id);
    if (!person) continue;
    const site = person.siteId ? data.sites.get(person.siteId) : undefined;
    const cell = site?.cell ?? event.place;
    if (cell === null) continue;
    figures.push({
      id: person.id,
      name: person.name,
      cell,
      from: event.t,
      to: person.died ?? Infinity,
      fame: person.fame,
    });
  }
  figures.sort((a, b) => b.fame - a.fame || a.id - b.id);

  const marches: March[] = [];
  for (const event of data.events) {
    if (event.type !== 'battle' || event.place === null) continue;
    const civName = String(event.data.civ ?? '');
    const civ = data.civByName.get(civName);
    if (!civ) continue;
    const capitalId = data.seatsAt(event.y).get(civ.id) ?? civ.capital;
    const from = data.sites.get(capitalId)?.cell;
    if (from === undefined || from === event.place) continue;
    const to = event.place;
    let cache: number[] | null = null;
    marches.push({
      key: `march:${event.id}`,
      civ: civName,
      at: event.t,
      from,
      to,
      path: () =>
        (cache ??= roadPath(
          { width: cells.width, height: cells.height, roads: cells.roads },
          from,
          to,
        )),
    });
  }
  return { beasts, figures, marches };
}
