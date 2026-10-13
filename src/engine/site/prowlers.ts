// Prowlers at the watched site (M3.8): a wild animal takes a lone worker far from the village.
// One roll a day on the `site.threats` stream; nothing shows on the map, only the chronicle line.

import { DAYS_PER_YEAR } from '../core/clock';
import { type RngStream } from '../core/rng';
import type { ActiveSite, Person, Site, WorldState } from '../core/types';
import { soldierEquivalent } from '../people/combat-scale';
import { type SiteLabel } from './build';
import { type SiteContent } from './defs';
import { woundPerson } from './health';
import { addItem } from './stock';
import { workTile } from './work';

import { alive, bandOf, dist, weaponsOf, type Emit } from './threat-common';

// ---- Prowlers ----

/** The kind of wild animal that roams the site's cell, if any, and how wild the cell is. */
export function wildFor(world: WorldState, content: SiteContent, site: Site) {
  const cells = world.cells;
  if (!cells) return { kinds: [], wildness: 0 };
  const biome = content.biomes[cells.biome[site.cell]!]?.id ?? '';
  return {
    kinds: content.threats.prowlers.kinds.filter((k) => k.biomes.includes(biome)),
    wildness: cells.wildness[site.cell]!,
  };
}

/** One roll a day: a wild animal takes someone working far out; nothing happens if no one is. */
export function prowl(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  rng: RngStream,
  emit: Emit,
  label: SiteLabel,
): void {
  const rules = content.threats.prowlers;
  const site = world.sites.get(active.siteId);
  if (!site) return;
  const { kinds, wildness } = wildFor(world, content, site);
  if (kinds.length === 0 || !rng.chance((rules.perYear * wildness) / 100 / DAYS_PER_YEAR)) return;
  const kind = rng.pick(kinds);
  const width = active.map.width;
  const origin = active.origin[1] * width + active.origin[0];
  const jobs = new Map(content.jobs.map((j) => [j.id, j]));
  const out: Person[] = [];
  for (const id of active.residents) {
    const p = world.people.get(id);
    const job = alive(p) && p.detail!.jobId !== undefined ? jobs.get(p.detail!.jobId) : undefined;
    if (!alive(p) || !job || p.detail!.abed || !rules.workplaces.includes(job.workplace)) continue;
    if (bandOf(world, content, active, p) !== 'adult') continue;
    const tile = workTile(content, active, { id, field: -1 }, job);
    if (tile >= 0 && dist(width, tile, origin) >= rules.from) out.push(p);
  }
  if (out.length === 0) return;
  const victim = rng.pick(out);
  const weapon = weaponsOf(world, content, active).get(victim.id) ?? 0;
  const s = soldierEquivalent(victim) + content.threats.combat.weaponMul * weapon;
  const stats = active.threats.stats;
  stats.prowlers += 1;
  const data = { site: label.name, animal: kind.name };
  const ev = content.threats.events;
  if (rng.chance(s / (s + kind.danger))) {
    if (rng.chance(rules.killShare)) {
      const hunt = content.jobs.find((j) => j.id === content.steward.roles.hunt);
      const meat = Object.keys(hunt?.outputs ?? {})[0];
      if (meat !== undefined) addItem(active, meat, kind.meat);
      emit({ type: ev.prowlerKilled, actors: [victim.id], place: label.cell, data });
    } else emit({ type: ev.prowlerDriven, actors: [victim.id], place: label.cell, data });
    return;
  }
  const event = emit({ type: ev.prowler, actors: [victim.id], place: label.cell, data });
  const tier = rng.weighted(Object.entries(content.threats.combat.woundShares));
  woundPerson(
    world,
    content,
    active,
    victim,
    tier,
    `while fighting a ${kind.name}`,
    emit,
    label,
    event.id,
  );
  stats.wounds += 1;
}
