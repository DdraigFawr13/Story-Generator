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

// ---- URL: /?next&seed=S1&size=256&layer=rainfall&at=118,40&z=3 ----

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
}

export function parseViewUrl(search: string, layerIds: readonly string[]): ViewState {
  const params = new URLSearchParams(search);
  const size = Number(params.get('size')) === 128 ? 128 : 256;
  const layer = params.get('layer') ?? '';
  const at = /^(\d{1,3}),(\d{1,3})$/.exec(params.get('at') ?? '');
  const zoom = Number(params.get('z'));
  return {
    seed: params.get('seed') || null,
    size,
    layer: layerIds.includes(layer) ? layer : DEFAULT_LAYER,
    at: at ? { x: Number(at[1]), y: Number(at[2]) } : null,
    zoom: Number.isInteger(zoom) && zoom >= 0 && zoom < ZOOM_STEPS.length ? zoom : 0,
  };
}

/** Path and query for a view; zoom 0 and no selection are left out. */
export function buildViewUrl(view: Omit<ViewState, 'seed'> & { seed: string }): string {
  const parts = [
    'next',
    `seed=${encodeURIComponent(view.seed)}`,
    `size=${view.size}`,
    `layer=${view.layer}`,
  ];
  if (view.at) parts.push(`at=${view.at.x},${view.at.y}`);
  if (view.zoom > 0) parts.push(`z=${view.zoom}`);
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

/** Labelled ticks along the bar, 0–1; the labels come from the layer's legend. */
export function rampTicks(layer: MapLayer): { pos: number; label: string }[] {
  const [lo, hi] = stopSpan(layer);
  return (layer.stops ?? []).map((s, i) => ({
    pos: (s.at - lo) / (hi - lo),
    label: layer.legend[i]?.label ?? String(s.at),
  }));
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
