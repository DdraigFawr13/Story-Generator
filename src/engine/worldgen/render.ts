// Pure layer-to-pixel renderer shared by the worldmap CLI and the M1.4 Canvas
// map. Returns RGBA bytes, one pixel per cell (index = y * width + x); no DOM.

import type { MapLayer, MapLayerStop, Rgb } from '../core/content-types';
import type { WorldCells } from '../core/types';

export interface RenderOptions {
  /** Shade land by the slope toward the north-west neighbour. Default: on for elevation. */
  hillshade?: boolean;
}

/** Rivers and lakes painted over the elevation layer. */
const RIVER_RGB: Rgb = [50, 110, 215];
const LAKE_RGB: Rgb = [80, 150, 225];
/** Hillshade: metres of height difference that change brightness by 100%, and the clamp. */
const SHADE_METRES = 1000;
const SHADE_LIMIT = 0.35;
const UNKNOWN_RGB: Rgb = [255, 0, 255];

/** Cell values behind a layer id such as "elevation" or "risk.drought". */
export function layerValues(cells: WorldCells, id: string): ArrayLike<number> | null {
  if (id.startsWith('risk.')) {
    const key = id.slice(5);
    return key === 'drought' || key === 'storm' || key === 'snow' ? cells.risk[key] : null;
  }
  switch (id) {
    case 'elevation':
      return cells.elevation;
    case 'plate':
      return cells.plate;
    case 'seaDistance':
      return cells.seaDistance;
    case 'tempSummer':
      return cells.tempSummer;
    case 'tempWinter':
      return cells.tempWinter;
    case 'rainfall':
      return cells.rainfall;
    case 'flow':
      return cells.flow;
    case 'water':
      return cells.water;
    case 'floodplain':
      return cells.floodplain;
    default:
      return null;
  }
}

function rampColor(stops: MapLayerStop[], value: number): Rgb {
  const first = stops[0];
  if (!first) return UNKNOWN_RGB;
  if (value <= first.at) return first.color;
  for (let s = 1; s < stops.length; s += 1) {
    const hi = stops[s]!;
    if (value <= hi.at) {
      const lo = stops[s - 1]!;
      const t = (value - lo.at) / (hi.at - lo.at);
      return [
        Math.round(lo.color[0] + (hi.color[0] - lo.color[0]) * t),
        Math.round(lo.color[1] + (hi.color[1] - lo.color[1]) * t),
        Math.round(lo.color[2] + (hi.color[2] - lo.color[2]) * t),
      ];
    }
  }
  return stops[stops.length - 1]!.color;
}

function colorFor(layer: MapLayer, value: number): Rgb {
  if (layer.kind === 'categories') {
    const list = layer.categories ?? [];
    const exact = list.find((c) => c.value === value);
    if (exact) return exact.color;
    if (layer.cycle && list.length > 0) return list[value % list.length]!.color;
    return UNKNOWN_RGB;
  }
  let v = value;
  if (layer.thresholds) {
    v = 0;
    for (const limit of layer.thresholds) if (value >= limit) v += 1;
  }
  if (layer.seaStops && value <= 0) return rampColor(layer.seaStops, value);
  return rampColor(layer.stops ?? [], v);
}

export function renderLayer(
  cells: WorldCells,
  layer: MapLayer,
  options: RenderOptions = {},
): Uint8ClampedArray {
  const { width, height } = cells;
  const values = layerValues(cells, layer.id);
  const out = new Uint8ClampedArray(width * height * 4);
  const isElevation = layer.id === 'elevation';
  const shade = options.hillshade ?? isElevation;
  for (let i = 0; i < width * height; i += 1) {
    let color: Rgb = values ? colorFor(layer, values[i]!) : UNKNOWN_RGB;
    if (isElevation) {
      const water = cells.water[i];
      if (water === 1) color = RIVER_RGB;
      else if (water === 2) color = LAKE_RGB;
    }
    let factor = 1;
    const x = i % width;
    const y = (i - x) / width;
    if (shade && x > 0 && y > 0 && cells.elevation[i]! > 0 && cells.water[i] === 0) {
      const diff = cells.elevation[i]! - cells.elevation[i - width - 1]!;
      factor = 1 + Math.max(-SHADE_LIMIT, Math.min(SHADE_LIMIT, diff / SHADE_METRES));
    }
    out[i * 4] = color[0] * factor;
    out[i * 4 + 1] = color[1] * factor;
    out[i * 4 + 2] = color[2] * factor;
    out[i * 4 + 3] = 255;
  }
  return out;
}
