// Pure helpers for the world-map viewer: camera maths (ported from the legacy
// controller/map-camera), the shareable URL and legend/readout text. No DOM.

import type { MapLayer } from '../engine';

export interface Camera {
  /** Centre of the view in cell units. */
  x: number;
  y: number;
}

/** Zoom steps as multiples of the fit-to-screen scale. */
export const ZOOM_STEPS: readonly number[] = [1, 1.5, 2, 3, 4, 6, 8];
/** Most screen pixels per cell. */
export const MAX_CELL_PX = 8;

/** Screen pixels per cell at a zoom step; step 0 fits the whole map. */
export function cellScale(fit: number, zoom: number): number {
  const step = ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, zoom))]!;
  return Math.max(fit, Math.min(MAX_CELL_PX, fit * step));
}

/** Largest useful zoom step: the first one that reaches the pixel cap (or the last). */
export function maxZoom(fit: number): number {
  for (let z = 0; z < ZOOM_STEPS.length; z += 1) {
    if (fit * ZOOM_STEPS[z]! >= MAX_CELL_PX) return z;
  }
  return ZOOM_STEPS.length - 1;
}

export function clampZoom(fit: number, zoom: number): number {
  return Math.max(0, Math.min(maxZoom(fit), Math.round(zoom)));
}

/** Keep the view inside the map; a map smaller than the view is centred. */
export function boundCamera(
  camera: Camera,
  columns: number,
  rows: number,
  viewWidth: number,
  viewHeight: number,
  scale: number,
): Camera {
  const halfX = viewWidth / scale / 2;
  const halfY = viewHeight / scale / 2;
  return {
    x: halfX >= columns / 2 ? columns / 2 : Math.min(columns - halfX, Math.max(halfX, camera.x)),
    y: halfY >= rows / 2 ? rows / 2 : Math.min(rows - halfY, Math.max(halfY, camera.y)),
  };
}

/** Cell under a point in the view (relative to its top-left), or null off the map. */
export function cellAt(
  screenX: number,
  screenY: number,
  camera: Camera,
  viewWidth: number,
  viewHeight: number,
  scale: number,
  columns: number,
  rows: number,
): { x: number; y: number } | null {
  const x = Math.floor(camera.x + (screenX - viewWidth / 2) / scale);
  const y = Math.floor(camera.y + (screenY - viewHeight / 2) / scale);
  return x < 0 || x >= columns || y < 0 || y >= rows ? null : { x, y };
}

// ---- URL: /?seed=S1&size=256&layer=rainfall&at=118,40&z=3&year=112&open=event:412&cat=site&q=ash ----

/** Legends list categories, in tab order. */
export const LEGEND_CATEGORIES = [
  'civ',
  'site',
  'race',
  'person',
  'dynasty',
  'beast',
  'item',
  'event',
] as const;
export type LegendCategory = (typeof LEGEND_CATEGORIES)[number];
/** Longest search text kept in a link. */
const MAX_QUERY = 80;

/** A Legends page named in a link: "event:412", "civ:3", "race:human". */
export function parseOpen(text: string | null): { kind: LegendCategory; id: string } | null {
  const found = /^(\w+):([\w-]{1,40})$/.exec(text ?? '');
  const kind = LEGEND_CATEGORIES.find((c) => c === found?.[1]);
  return found && kind ? { kind, id: found[2]! } : null;
}

export const WORLD_SIZES = [256, 128] as const;
export type WorldSize = (typeof WORLD_SIZES)[number];
export const DEFAULT_SEED = 'S1';
export const DEFAULT_LAYER = 'elevation';

export interface ViewState {
  /** Null when the link has no seed. */
  seed: string | null;
  size: WorldSize;
  layer: string;
  at: { x: number; y: number } | null;
  zoom: number;
  /** Slider year; null is the final year. */
  year: number | null;
  /** The open Legends page as "kind:id", or null for the lists. */
  open: string | null;
  /** The Legends list category, or null for the default. */
  cat: LegendCategory | null;
  /** The Legends search text. */
  q: string;
  /** A watched site (M3.1): present when the link has `site=`. */
  site: SiteLink | null;
}

/** The site-mode part of a link: `?site=6&day=43&open=person:776&z=3&at=65,47`. */
export interface SiteLink {
  site: number;
  /** Days since watching began (the day of the shown block, or whole days to run when `block` is null). */
  day: number;
  /** The last block run on that day, 0-3 (the time-of-day chip); null before any block ran or in older links. */
  block: number | null;
  /** The selection as "person:776", "household:3", "building:5" or "tile:65,47". */
  open: string | null;
  /** Zoom step, 0-based (the link's `z` counts from 1). */
  zoom: number | null;
  /** Tile at the centre of the view. */
  at: { x: number; y: number } | null;
  /** M3.11: the pane tab open (`tab=chron`); null for Inspect. */
  tab: SiteTab | null;
  /** M3.11: the person page's section (`sec=ties`); null for Now. */
  sec: PersonSection | null;
}
export const PERSON_SECTIONS = ['now', 'ties', 'story', 'skills'] as const;
export type PersonSection = (typeof PERSON_SECTIONS)[number];
export const SITE_TABS = ['inspect', 'site', 'people', 'chron'] as const;
export type SiteTab = (typeof SITE_TABS)[number];
/** Most zoom steps the site view has, for validating `z`. */
const SITE_ZOOM_STEPS = 5;
const SITE_OPEN = /^(?:(?:person|household|building):\d{1,9}|tile:\d{1,3},\d{1,3})$/;

export function parseViewUrl(search: string, layerIds: readonly string[]): ViewState {
  const params = new URLSearchParams(search);
  const size = Number(params.get('size')) === 128 ? 128 : 256;
  const layer = params.get('layer') ?? '';
  const at = /^(\d{1,3}),(\d{1,3})$/.exec(params.get('at') ?? '');
  const zoom = Number(params.get('z'));
  const year = params.get('year');
  const open = parseOpen(params.get('open'));
  const site = parseSiteLink(params);
  return {
    seed: params.get('seed') || null,
    size,
    layer: layerIds.includes(layer) ? layer : DEFAULT_LAYER,
    // With `site=`, open, z and at belong to the site view.
    at: at && !site ? { x: Number(at[1]), y: Number(at[2]) } : null,
    zoom: Number.isInteger(zoom) && zoom >= 0 && zoom < ZOOM_STEPS.length && !site ? zoom : 0,
    year: year !== null && /^\d{1,4}$/.test(year) ? Number(year) : null,
    open: open && !site ? `${open.kind}:${open.id}` : null,
    cat: LEGEND_CATEGORIES.find((c) => c === params.get('cat')) ?? null,
    q: (params.get('q') ?? '').slice(0, MAX_QUERY),
    site,
  };
}

/** Links replay at most this many days on load (four 336-day years), so a bad link can't stall the worker. */
export const MAX_LINK_DAY = 4 * 336;

function parseSiteLink(params: URLSearchParams): SiteLink | null {
  const site = params.get('site');
  if (site === null || !/^\d{1,9}$/.test(site)) return null;
  const day = params.get('day');
  const block = params.get('b');
  const open = params.get('open') ?? '';
  const z = Number(params.get('z'));
  const at = /^(\d{1,3}),(\d{1,3})$/.exec(params.get('at') ?? '');
  const tab = SITE_TABS.find((t) => t === params.get('tab')) ?? null;
  const sec = PERSON_SECTIONS.find((t) => t === params.get('sec')) ?? null;
  return {
    site: Number(site),
    day: day !== null && /^\d{1,6}$/.test(day) ? Math.min(Number(day), MAX_LINK_DAY) : 0,
    block: block !== null && /^[0-3]$/.test(block) ? Number(block) : null,
    open: SITE_OPEN.test(open) ? open : null,
    zoom: Number.isInteger(z) && z >= 1 && z <= SITE_ZOOM_STEPS ? z - 1 : null,
    at: at ? { x: Number(at[1]), y: Number(at[2]) } : null,
    tab: tab === 'inspect' ? null : tab,
    sec: sec === 'now' ? null : sec,
  };
}

/**
 * The link's day and block for a site clock: the block last run and its day, as the date chip
 * shows it (after the evening the clock has turned, so that block belongs to the day before).
 * Before anything ran (the entry day at night) the block is null.
 */
export function siteLinkPoint(
  clockDay: number,
  enteredDay: number,
  nextBlock: number,
): { day: number; block: number | null } {
  if (clockDay === enteredDay && nextBlock === 0) return { day: 0, block: null };
  return nextBlock === 0
    ? { day: clockDay - 1 - enteredDay, block: 3 }
    : { day: clockDay - enteredDay, block: nextBlock - 1 };
}

/** Path and query for the site view; the world-map fields are left out. */
export function buildSiteUrl(link: {
  seed: string;
  size: WorldSize;
  site: number;
  day: number;
  /** The last block run on `day`; omitted before any block ran. */
  block?: number | null;
  open: string | null;
  zoom: number;
  at: { x: number; y: number };
  /** The pane tab; Inspect (or none) is left out. */
  tab?: SiteTab | null;
  /** The person page's section; Now (or none) is left out. */
  sec?: PersonSection | null;
}): string {
  const parts = [
    `seed=${encodeURIComponent(link.seed)}`,
    `size=${link.size}`,
    `site=${link.site}`,
    `day=${link.day}`,
  ];
  if (link.block != null) parts.push(`b=${link.block}`);
  if (link.open)
    parts.push(`open=${encodeURIComponent(link.open).replace(/%3A/g, ':').replace(/%2C/g, ',')}`);
  parts.push(`z=${link.zoom + 1}`, `at=${link.at.x},${link.at.y}`);
  if (link.tab && link.tab !== 'inspect') parts.push(`tab=${link.tab}`);
  if (link.sec && link.sec !== 'now') parts.push(`sec=${link.sec}`);
  return `/?${parts.join('&')}`;
}

/** Path and query for a view; zoom 0, no selection and empty Legends state are left out. */
export function buildViewUrl(
  view: Omit<ViewState, 'seed' | 'year' | 'open' | 'cat' | 'q' | 'site'> &
    Partial<Pick<ViewState, 'year' | 'open' | 'cat' | 'q'>> & { seed: string },
): string {
  const parts = [
    `seed=${encodeURIComponent(view.seed)}`,
    `size=${view.size}`,
    `layer=${view.layer}`,
  ];
  if (view.at) parts.push(`at=${view.at.x},${view.at.y}`);
  if (view.zoom > 0) parts.push(`z=${view.zoom}`);
  if (view.year != null) parts.push(`year=${view.year}`);
  if (view.open) parts.push(`open=${encodeURIComponent(view.open).replace(/%3A/g, ':')}`);
  if (view.cat) parts.push(`cat=${view.cat}`);
  if (view.q) parts.push(`q=${encodeURIComponent(view.q.slice(0, MAX_QUERY))}`);
  return `/?${parts.join('&')}`;
}

// ---- legend and readout ----

const UNIT_FORMAT: Record<string, (n: string) => string> = {
  '0–100': (n) => `${n} of 100`,
  m: (n) => `${n} m`,
  '°C': (n) => `${n} °C`,
  'mm/year': (n) => `${n} mm/year`,
  cells: (n) => `${n} cells`,
};

/** Text for one cell's value on a layer: "1,240 m", "Sea", a biome name, "62 of 100". */
export function formatReadout(layer: MapLayer, value: number, water: number): string {
  if (water === 3) return 'Sea';
  if (layer.kind === 'categories') {
    const found = layer.categories?.find((c) => c.value === value);
    if (found) return found.label;
    return layer.cycle ? `${layer.label.replace(/s$/, '')} ${value}` : String(value);
  }
  const text = value.toLocaleString('en-US');
  const unit = UNIT_FORMAT[layer.unit];
  if (unit) return unit(text);
  return layer.id === 'flow' ? `${text} runoff` : `${text} ${layer.unit}`;
}

function stopSpan(layer: MapLayer): [number, number] {
  const stops = layer.stops ?? [];
  const lo = stops[0]?.at ?? 0;
  const hi = stops[stops.length - 1]?.at ?? 1;
  return [lo, hi === lo ? lo + 1 : hi];
}

/** CSS gradient for a ramp layer's legend bar. */
export function rampGradient(layer: MapLayer): string {
  const [lo, hi] = stopSpan(layer);
  const stops = (layer.stops ?? []).map(
    (s) => `rgb(${s.color.join(',')}) ${(((s.at - lo) / (hi - lo)) * 100).toFixed(1)}%`,
  );
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

/** Width of one tick-label character as a share of the bar (0.66rem mono on a ~260 px bar). */
const TICK_CHAR = 0.025;

/**
 * Labelled ticks along the bar, 0–1; the labels come from the layer's legend. An inner tick
 * whose label would overlap its neighbour's is dropped (elevation's 0 m and 400 m).
 */
export function rampTicks(layer: MapLayer): { pos: number; label: string }[] {
  const [lo, hi] = stopSpan(layer);
  const ticks = (layer.stops ?? []).map((s, i) => ({
    pos: (s.at - lo) / (hi - lo),
    label: layer.legend[i]?.label ?? String(s.at),
  }));
  // The first label starts at its tick, the last ends at it, the rest are centred (world-map.css).
  const span = (i: number) => {
    const { pos, label } = ticks[i]!;
    const width = (label.length + 1) * TICK_CHAR;
    if (i === 0) return [pos, pos + width] as const;
    if (i === ticks.length - 1) return [pos - width, pos] as const;
    return [pos - width / 2, pos + width / 2] as const;
  };
  const kept: number[] = [];
  for (let i = 0; i < ticks.length; i++) {
    const last = i === ticks.length - 1;
    while (last && kept.length > 1 && span(kept[kept.length - 1]!)[1] > span(i)[0]) kept.pop();
    if (kept.length === 0 || last || span(kept[kept.length - 1]!)[1] <= span(i)[0]) kept.push(i);
  }
  return kept.map((i) => ticks[i]!);
}

/** Where a cell value sits on the bar, 0–1, or null (categories, sea). */
export function rampPosition(layer: MapLayer, value: number, water: number): number | null {
  if (layer.kind !== 'ramp' || water === 3) return null;
  let v = value;
  if (layer.thresholds) {
    v = 0;
    for (const limit of layer.thresholds) if (value >= limit) v += 1;
  }
  const [lo, hi] = stopSpan(layer);
  return Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
}

/** Line width (px) of a land route whose middle cell is used by `count` routes: 1 to 3. */
export function roadWidth(count: number): number {
  return Math.max(1, Math.min(3, 1 + Math.floor((count - 1) / 2)));
}
