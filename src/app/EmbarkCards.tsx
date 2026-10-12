// The two ways into a live site from the world view (M3.1): "Watch this site" on a standing site
// and "Found an outpost" on empty fertile land. Each asks first and says what will happen.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildLocalMap,
  dateOf,
  layoutSite,
  MONTH_NAMES,
  sitePopulation,
  type Id,
  type WorldCells,
} from '../engine';
import type { SiteActions } from './legends-ctx';
import { followedWording } from './site-panels';
import { drawThumbnail, makeLookCtx, quarterOf, rulerWord } from './site-render';

/** Guess at people per household, for outlining the hall quarter before anyone is promoted. */
const PEOPLE_PER_HOUSEHOLD = 3;
/** Cells searched around an outpost site for water. */
const WATER_RADIUS = 4;
const WATER_NAMES = ['', 'a river', 'a lake', 'the sea'];

/** The nearest water to a cell within a few cells: what it is and how far. */
export function waterNear(cells: WorldCells, cell: number): { name: string; dist: number } | null {
  const w = cells.width;
  const cx = cell % w;
  const cy = (cell - cx) / w;
  let best: { name: string; dist: number } | null = null;
  for (let dy = -WATER_RADIUS; dy <= WATER_RADIUS; dy += 1) {
    for (let dx = -WATER_RADIUS; dx <= WATER_RADIUS; dx += 1) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= w || y >= cells.height) continue;
      const kind = cells.water[y * w + x]!;
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      if (kind !== 0 && (!best || dist < best.dist)) best = { name: WATER_NAMES[kind]!, dist };
    }
  }
  return best;
}

export function WatchCard({ siteId, actions }: { siteId: Id; actions: SiteActions }) {
  const { world, content } = actions;
  const [open, setOpen] = useState(false);
  const site = world.sites.get(siteId);
  const heading = useRef<HTMLHeadingElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const thumb = useRef<HTMLCanvasElement>(null);
  const civ = site?.civId == null ? undefined : world.civs.get(site.civId);
  const culture = content.cultures.find((c) => c.id === civ?.cultureId);
  const preview = useMemo(() => {
    if (!open || !site) return null;
    const total = sitePopulation(site);
    const followed = Math.min(total, content.site.followCap);
    const map = buildLocalMap(world, content, site.cell, String(site.id));
    const layout = layoutSite(map, content.site, {
      pop: total,
      followedHouseholds: Math.ceil(followed / PEOPLE_PER_HOUSEHOLD),
      isCapital: civ?.capital === site.id,
      coast: site.features.includes('coast'),
    });
    return {
      look: makeLookCtx(map, content.site, new Map(layout.buildings.map((b) => [b.id, b]))),
      quarter: total > followed ? quarterOf(layout.buildings) : null,
      total,
      followed,
    };
  }, [open, site, world, content, civ]);
  useEffect(() => {
    if (preview && thumb.current) drawThumbnail(thumb.current, preview.look, preview.quarter);
  }, [preview]);
  useEffect(() => {
    if (!open) return;
    heading.current?.focus({ preventScroll: true });
    heading.current?.parentElement?.scrollIntoView({ block: 'nearest' });
  }, [open]);
  if (!site || site.ruinedYear !== undefined || !actions.enabled) return null;
  const date = dateOf(world.day);
  const winter = world.cells?.tempWinter[site.cell];
  const word = rulerWord(culture?.government);
  return (
    <>
      <button
        ref={button}
        type="button"
        className="primary"
        aria-controls={`watch-${site.id}`}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        Watch this site
      </button>
      {open && preview && (
        <div className="emb-confirm" id={`watch-${site.id}`}>
          <h4 ref={heading} tabIndex={-1}>
            Watch {site.name}?
          </h4>
          <div className="row">
            <canvas
              ref={thumb}
              className="emb-thumb"
              width={96}
              height={96}
              aria-label="Thumbnail of the local map: the followed hall quarter is outlined"
            />
            <div>
              <p>
                {site.name} has {preview.total} people.{' '}
                {preview.total > preview.followed ? (
                  <>
                    You will follow <b>{preview.followed} of them</b> day by day:{' '}
                    {followedWording(word)}. The other {preview.total - preview.followed} stay as
                    counts.
                  </>
                ) : (
                  <>You will follow all of them day by day.</>
                )}
              </p>
              <p>
                The site starts in {date.season}, on {date.dayOfMonth} {MONTH_NAMES[date.month]}
                {winter !== undefined ? `; the winter low here is ${winter} °C` : ''}.
              </p>
            </div>
          </div>
          <p className="quiet">
            History stops at Year {world.params.historyYears}. You can go back to the world map at
            any time.
          </p>
          <div className="actions">
            <button type="button" className="primary" onClick={() => actions.watch(site.id)}>
              Start watching
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                window.setTimeout(() => button.current?.focus(), 0);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** "Found an outpost" on a cell where it is allowed, else the reason it is not. */
export function OutpostCard({ cell, actions }: { cell: number; actions: SiteActions }) {
  const { world, content } = actions;
  const cells = world.cells;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    heading.current?.focus({ preventScroll: true });
    heading.current?.parentElement?.scrollIntoView({ block: 'nearest' });
  }, [open]);
  if (!cells || cells.water[cell] !== 0 || !actions.enabled) return null;
  const check = actions.outpostCheck(cell);
  if (!check.ok) {
    return <p className="outpost-no">No outpost here: {check.reason}.</p>;
  }
  const origin = world.sites.get(check.fromSiteId);
  const biome = content.biomes[cells.biome[cell]!];
  const deposits = (cells.resources.get(cell) ?? [])
    .map((d) => content.resources[d.resource]?.name)
    .filter((n): n is string => Boolean(n));
  const water = waterNear(cells, cell);
  const originPop = origin ? sitePopulation(origin) : 0;
  return (
    <>
      <button
        ref={button}
        type="button"
        className="primary"
        aria-controls={`outpost-${cell}`}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        Found an outpost
      </button>
      {open && (
        <div className="emb-confirm" id={`outpost-${cell}`}>
          <h4 ref={heading} tabIndex={-1}>
            Found an outpost here?
          </h4>
          <p>
            <b>{check.settlers} settlers</b> leave {origin?.name ?? 'the nearest site'}, the nearest
            site of a people who can reach this cell. They take food from its stores.
          </p>
          <p>
            It is about {check.travelDays} {check.travelDays === 1 ? 'day' : 'days'} on foot. The
            cell is {biome?.name.toLowerCase() ?? 'open land'}
            {biome?.forest ? ', with timber to fell' : ''}, with{' '}
            {deposits.length > 0
              ? `${deposits.join(', ')} in the ground`
              : 'no ore or other deposits'}
            ;{' '}
            {water
              ? `${water.name} is ${water.dist} ${water.dist === 1 ? 'cell' : 'cells'} away`
              : 'there is no water nearby'}
            .
          </p>
          <label>
            Name the outpost
            <input
              className="search"
              autoComplete="off"
              maxLength={30}
              value={name}
              placeholder="A default name if left empty"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <p>
            {origin?.name}&apos;s count drops from {originPop} to {originPop - check.settlers}.
          </p>
          <p className="quiet">
            The outpost joins {world.civs.get(origin?.civId ?? -1)?.name ?? 'its people'} and
            appears on the world map and in Legends.
          </p>
          <div className="actions">
            <button
              type="button"
              className="primary"
              onClick={() => actions.found(cell, name.trim())}
            >
              Found it
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                window.setTimeout(() => button.current?.focus(), 0);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
