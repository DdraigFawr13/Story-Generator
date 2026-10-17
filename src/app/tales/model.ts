// What the Tales map marks besides the land: great beasts, great figures and armies, built once
// from a finished world. No DOM. Hosts and settlers come from the battles and foundings the history
// logged (see hosts.ts).

import type { ContentBundle, Id, WorldState } from '../../engine';
import type { PlaybackData } from '../playback/data';
import { buildSettlers, buildWarHosts, type Settlers, type WarHosts } from './hosts';

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
export interface Model {
  beasts: Beast[];
  figures: Figure[];
  wars: WarHosts[];
  settlers: Settlers[];
}

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

  const grid = { width: cells.width, height: cells.height, roads: cells.roads };
  const seatCell = (civName: string, year: number) => {
    const civ = data.civByName.get(civName);
    const seat = civ ? data.seatsAt(year).get(civ.id) : undefined;
    return seat === undefined ? undefined : data.sites.get(seat)?.cell;
  };
  const siteCell = (name: string) => data.siteByName.get(name)?.cell;
  const wars = buildWarHosts(data.events, seatCell, grid, data.last);
  const settlers = buildSettlers(data.events, siteCell, grid);
  return { beasts, figures, wars, settlers };
}
