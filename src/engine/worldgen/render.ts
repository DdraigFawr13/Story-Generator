// Pure layer-to-pixel renderer shared by the worldmap CLI and the M1.4 Canvas
// map. Returns RGBA bytes, one pixel per cell (index = y * width + x); no DOM.

import type { MapLayer, MapLayerStop, Rgb } from '../core/content-types';
import type { Region, RegionKind, RouteGraph, Site, WorldCells } from '../core/types';

export interface RenderOptions {
  /** Shade land by the slope toward the north-west neighbour. Default: on for elevation. */
  hillshade?: boolean;
  /**
   * Paint sea cells by depth and rivers and lakes over the layer. Default: on for elevation only,
   * so the worldmap CLI output is unchanged.
   */
  water?: boolean;
  /** Sea colours by depth for `water` on other layers; default: the layer's own `seaStops`. */
  seaStops?: MapLayerStop[];
}

/** Rivers and lakes painted over the elevation layer (or any layer with `water`). */
const RIVER_RGB: Rgb = [50, 110, 215];
const LAKE_RGB: Rgb = [80, 150, 225];
/** Hillshade: metres of height difference that change brightness by 100%, and the clamp. */
const SHADE_METRES = 1000;
const SHADE_LIMIT = 0.35;
/** Volcano marker on the elevation and biome layers. */
const VOLCANO_RGB: Rgb = [230, 30, 30];
const UNKNOWN_RGB: Rgb = [255, 0, 255];
/** Sea colour when `water` is on but no depth stops are available. */
const FALLBACK_SEA_RGB: Rgb = [40, 80, 150];

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
    case 'biome':
      return cells.biome;
    case 'fertility':
      return cells.fertility;
    case 'wildness':
      return cells.wildness;
    case 'travelCost':
      return cells.travelCost;
    case 'aura':
      return cells.aura;
    case 'territory':
      return cells.territory;
    case 'resources':
      return richestResource(cells);
    default:
      return null;
  }
}

/** Per cell: 1 + index of the resource with the largest deposit (lowest index on ties), 0 for none. */
function richestResource(cells: WorldCells): Uint8Array {
  const out = new Uint8Array(cells.width * cells.height);
  for (const [cell, deposits] of cells.resources) {
    let best = deposits[0]!;
    for (const deposit of deposits) if (deposit.amount > best.amount) best = deposit;
    out[cell] = best.resource + 1;
  }
  return out;
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
  const water = options.water ?? isElevation;
  const seaStops = options.seaStops ?? layer.seaStops;
  for (let i = 0; i < width * height; i += 1) {
    let color: Rgb = values ? colorFor(layer, values[i]!) : UNKNOWN_RGB;
    if (water) {
      const kind = cells.water[i];
      if (kind === 1) color = RIVER_RGB;
      else if (kind === 2) color = LAKE_RGB;
      else if (kind === 3 && !isElevation) {
        color = seaStops ? rampColor(seaStops, cells.elevation[i]!) : FALLBACK_SEA_RGB;
      }
    }
    const volcano = cells.volcano[i] === 1 && (isElevation || layer.id === 'biome');
    if (volcano) color = VOLCANO_RGB;
    let factor = 1;
    const x = i % width;
    const y = (i - x) / width;
    if (shade && !volcano && x > 0 && y > 0 && cells.elevation[i]! > 0 && cells.water[i] === 0) {
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

/** Feature colours for `paintRegions`; ranges darken the land instead. */
const FEATURE_RGB: Partial<Record<RegionKind, Rgb>> = {
  bay: [150, 210, 245],
  strait: [235, 40, 220],
  harbour: [255, 225, 40],
  ford: [30, 230, 235],
  pass: [235, 30, 30],
};
/** Ranges are darkened by this factor. */
const RANGE_DARKEN = 0.8;
/** Paint order: later kinds sit on top. */
const PAINT_ORDER: RegionKind[] = ['range', 'bay', 'strait', 'harbour', 'ford', 'pass'];

/** Paints strategic features onto RGBA `pixels` (one per cell, `width` wide) in place, for the worldmap CLI. */
export function paintRegions(
  pixels: Uint8ClampedArray,
  width: number,
  regions: Iterable<Region>,
): void {
  const list = [...regions];
  for (const kind of PAINT_ORDER) {
    const color = FEATURE_RGB[kind];
    for (const region of list) {
      if (region.kind !== kind) continue;
      for (const cell of region.cells) {
        if (width <= 0 || cell * 4 + 3 >= pixels.length) continue;
        if (color) {
          pixels[cell * 4] = color[0];
          pixels[cell * 4 + 1] = color[1];
          pixels[cell * 4 + 2] = color[2];
        } else {
          pixels[cell * 4] = pixels[cell * 4]! * RANGE_DARKEN;
          pixels[cell * 4 + 1] = pixels[cell * 4 + 1]! * RANGE_DARKEN;
          pixels[cell * 4 + 2] = pixels[cell * 4 + 2]! * RANGE_DARKEN;
        }
      }
    }
  }
}

/** Route colours for `paintRoutes`. */
const ROAD_RGB: Rgb = [130, 80, 40];
const SEA_LANE_RGB: Rgb = [205, 230, 250];
const NODE_RGB: Rgb = [0, 0, 0];

/** Paints roads (brown), sea lanes (pale blue) and route nodes (black) onto RGBA `pixels` in place. */
export function paintRoutes(
  pixels: Uint8ClampedArray,
  width: number,
  cells: Pick<WorldCells, 'roads'>,
  routes: RouteGraph,
): void {
  const put = (cell: number, color: Rgb) => {
    if (width <= 0 || cell < 0 || cell * 4 + 3 >= pixels.length) return;
    pixels[cell * 4] = color[0];
    pixels[cell * 4 + 1] = color[1];
    pixels[cell * 4 + 2] = color[2];
  };
  for (let i = 0; i < cells.roads.length; i += 1) if (cells.roads[i]) put(i, ROAD_RGB);
  for (const edge of routes.edges) {
    if (!edge.sea) continue;
    for (const cell of edge.path) put(cell, SEA_LANE_RGB);
  }
  for (const node of routes.nodes) put(node.cell, NODE_RGB);
}

/** Territory tint strength (0-1) and site dot colour for `paintSites`. */
const TERRITORY_ALPHA = 0.5;
const SITE_DOT_RGB: Rgb = [255, 255, 255];
const SITE_DOT_EDGE_RGB: Rgb = [20, 20, 20];

/**
 * Tints each claimed cell with its civ's colour at about 35% and draws sites as dots sized by
 * population, onto RGBA `pixels` in place. `colorOf` maps a civ id to a colour.
 */
export function paintSites(
  pixels: Uint8ClampedArray,
  width: number,
  cells: Pick<WorldCells, 'territory'>,
  sites: Iterable<Site>,
  colorOf: (civId: number) => Rgb,
): void {
  for (let i = 0; i < cells.territory.length; i += 1) {
    const civ = cells.territory[i]!;
    if (civ === 0 || i * 4 + 3 >= pixels.length) continue;
    const color = colorOf(civ);
    for (let k = 0; k < 3; k += 1) {
      pixels[i * 4 + k] = pixels[i * 4 + k]! * (1 - TERRITORY_ALPHA) + color[k]! * TERRITORY_ALPHA;
    }
  }
  const put = (cell: number, color: Rgb) => {
    if (width <= 0 || cell < 0 || cell * 4 + 3 >= pixels.length) return;
    pixels[cell * 4] = color[0];
    pixels[cell * 4 + 1] = color[1];
    pixels[cell * 4 + 2] = color[2];
  };
  for (const site of sites) {
    const pop = site.pop.reduce((n, band) => n + band.count, 0);
    // Radius in cells: 0 for a hamlet, up to 2 for the largest sites.
    const radius = pop >= 1500 ? 2 : pop >= 300 ? 1 : 0;
    const x = site.cell % width;
    const y = (site.cell - x) / width;
    for (let dy = -radius - 1; dy <= radius + 1; dy += 1) {
      for (let dx = -radius - 1; dx <= radius + 1; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width) continue;
        const reach = Math.max(Math.abs(dx), Math.abs(dy));
        if (reach <= radius) put(ny * width + nx, SITE_DOT_RGB);
        else put(ny * width + nx, SITE_DOT_EDGE_RGB);
      }
    }
  }
}
