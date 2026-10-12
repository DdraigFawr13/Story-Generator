// Canvas 2D world map (M1.4). Each (layer, hillshade, water) bitmap is rendered
// once per world at one pixel per cell, then only redrawn on pan and zoom.

import { useEffect, useMemo, useRef, useState } from 'react';
import { MAP_LAYERS, civColor } from '../content';
import {
  cellsDigest,
  layerValues,
  renderLayer,
  cellDistance,
  sitePopulation,
  type Civ,
  type ContentBundle,
  type Creature,
  type CultureDef,
  type Dynasty,
  type HistoryAt,
  type Id,
  type Person,
  type Region,
  type RouteGraph,
  type Biography,
  type Site,
  type WorldCells,
} from '../engine';
import type { SiteActions } from './legends-ctx';
import { Inspector, LAYER_BY_ID, LAYER_KEYS, Legend, LayerPanel, type Overlays } from './MapPanels';
import {
  boundCamera,
  cellAt,
  cellScale,
  clampZoom,
  DEFAULT_LAYER,
  roadWidth,
  type Camera,
} from './map-view';
import { boxesOverlap, planLabels, regionLookup, type Label } from './map-labels';
import './world-map.css';

export interface ViewChange {
  layer?: string;
  at?: { x: number; y: number } | null;
  zoom?: number;
}

interface Props {
  cells: WorldCells | null;
  regions: ReadonlyMap<Id, Region>;
  routes: RouteGraph;
  sites: ReadonlyMap<Id, Site>;
  civs: ReadonlyMap<Id, Civ>;
  creatures: ReadonlyMap<Id, Creature>;
  /** Notables and their dynasties; `year` is the history year their ages count to. */
  people: ReadonlyMap<Id, Person>;
  dynasties: ReadonlyMap<Id, Dynasty>;
  year: number;
  /** The biography of a site (by id), shown in the site inspector. */
  siteBiography: (siteId: Id) => Biography;
  cultures: readonly CultureDef[];
  seed: string;
  content: Pick<ContentBundle, 'biomes' | 'resources' | 'creatures'>;
  layer: string;
  at: { x: number; y: number } | null;
  zoom: number;
  /** A new world is generating: keep the old map, dimmed. */
  busy: boolean;
  onView: (change: ViewChange) => void;
  /** The world as of a past year (year slider); null shows the present day. */
  history: HistoryAt | null;
  /** Centre the camera on a cell when `key` changes (Legends "Show on map"). */
  focus: { x: number; y: number; key: number } | null;
  /** Sites of the open Legends page: ringed, while the other sites dim. Null dims nothing. */
  highlight: ReadonlySet<Id> | null;
  /** Shown in the narrow (tabbed) layout when the map was opened from a Legends page. */
  onBackToLegends?: (() => void) | undefined;
  /** Watching a site and founding an outpost (M3.1), offered in the cell inspector. */
  siteActions: SiteActions;
}

/** A drag shorter than this many pixels is a click. */
const DRAG_THRESHOLD = 4;
/** Half-size in pixels of the cross drawn on a ruined site. */
const RUIN_RADIUS = 3;
/** Lair triangle half-width (px); legendary beasts are drawn larger and outlined. */
const LAIR_RADIUS = 4;
const LEGENDARY_LAIR_RADIUS = 6;
const LAIR_COLOR = '#7a1010';
/** Minimum ms between wheel zoom steps, so one trackpad flick is one step. */
const WHEEL_STEP_MS = 120;
/** Lowest zoom step a focus request raises the map to, and the ring drawn round its cell. */
const FOCUS_ZOOM = 2;
const FOCUS_COLOR = '#ffd34d';
/** Opacity of sites outside the open Legends page. */
const DIM_ALPHA = 0.4;
/** Gap (px) between the pointer and the site tooltip. */
const TIP_OFFSET_PX = 14;
/** A focus target this close to the view's edge counts as off screen. */
const EDGE_MARGIN_PX = 24;
/** Zoom step used when the minimap recentres a fully zoomed-out map. */
const MINIMAP_ZOOM = 2;
/** Radius (px) of the pass, ford and harbour markers. */
const MARKER_RADIUS = 5;
/** Route nodes show as dots from this cell scale (pixels per cell). */
const NODE_DOT_SCALE = 3;
const ROAD_COLOR = 'rgba(120, 72, 32, 0.9)';
const SEA_LANE_COLOR = 'rgba(210, 235, 255, 0.95)';
/** Dash pattern (px) of sea lanes. */
const SEA_LANE_DASH = [6, 5];
/** Site names show from this cell scale for capitals and for other sites. */
const CAPITAL_LABEL_SCALE = 2;
const SITE_LABEL_SCALE = 4;
/** Site glyph radius (px) = base + sqrt(pop) / divisor, capped. */
const SITE_RADIUS_BASE = 3;
const SITE_RADIUS_DIVISOR = 6;
const SITE_RADIUS_MAX = 9;
const ELEVATION = MAP_LAYERS.find((l) => l.id === DEFAULT_LAYER)!;

function drawMarker(
  ctx: CanvasRenderingContext2D,
  kind: 'pass' | 'ford' | 'harbour',
  x: number,
  y: number,
) {
  const r = MARKER_RADIUS;
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#1b1b1b';
  ctx.beginPath();
  if (kind === 'pass') {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y + r);
    ctx.lineTo(x - r, y + r);
    ctx.closePath();
  } else if (kind === 'ford') {
    ctx.moveTo(x - r, y);
    ctx.quadraticCurveTo(x - r / 2, y - r, x, y);
    ctx.quadraticCurveTo(x + r / 2, y + r, x + r, y);
  } else {
    ctx.arc(x, y, r - 1, 0, Math.PI * 2);
  }
  ctx.stroke();
  if (kind === 'ford') {
    ctx.strokeStyle = '#1b1b1b';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  } else {
    ctx.fill();
  }
}

/** Draws one site glyph centred on (x, y); the shape tells the kind, the fill is the civ's colour. */
function drawSiteGlyph(
  ctx: CanvasRenderingContext2D,
  kind: Site['kind'],
  x: number,
  y: number,
  r: number,
  fill: string,
) {
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = fill;
  ctx.beginPath();
  switch (kind) {
    case 'town':
      ctx.rect(x - r, y - r, r * 2, r * 2);
      break;
    case 'city':
      ctx.rect(x - r - 1, y - r - 1, (r + 1) * 2, (r + 1) * 2);
      break;
    case 'fortress':
      ctx.moveTo(x, y - r - 1);
      ctx.lineTo(x + r + 1, y + r);
      ctx.lineTo(x - r - 1, y + r);
      ctx.closePath();
      break;
    case 'mine':
      ctx.moveTo(x, y - r - 1);
      ctx.lineTo(x + r + 1, y);
      ctx.lineTo(x, y + r + 1);
      ctx.lineTo(x - r - 1, y);
      ctx.closePath();
      break;
    case 'temple': {
      const t = r / 2;
      ctx.moveTo(x - t, y - r);
      ctx.lineTo(x + t, y - r);
      ctx.lineTo(x + t, y - t);
      ctx.lineTo(x + r, y - t);
      ctx.lineTo(x + r, y + t);
      ctx.lineTo(x + t, y + t);
      ctx.lineTo(x + t, y + r);
      ctx.lineTo(x - t, y + r);
      ctx.lineTo(x - t, y + t);
      ctx.lineTo(x - r, y + t);
      ctx.lineTo(x - r, y - t);
      ctx.lineTo(x - t, y - t);
      ctx.closePath();
      break;
    }
    default:
      ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();
  const inner = kind === 'city' || kind === 'port';
  if (inner) {
    ctx.fillStyle = '#1b1b1b';
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1, r / 3), 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A ruined site: a small grey cross, no name. */
function drawRuin(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const r = RUIN_RADIUS;
  ctx.lineCap = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.moveTo(x - r, y - r);
  ctx.lineTo(x + r, y + r);
  ctx.moveTo(x + r, y - r);
  ctx.lineTo(x - r, y + r);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#6b6b6b';
  ctx.stroke();
}

/** Whether a beast lived in `year` (the present day when undefined). */
function aliveIn(beast: Creature, year: number | undefined): boolean {
  if (year === undefined) return beast.died === undefined;
  return beast.born <= year && (beast.died === undefined || beast.died > year);
}

/** A lair: a dark red triangle, larger and outlined in dark for legendary beasts. */
function drawLair(ctx: CanvasRenderingContext2D, x: number, y: number, legendary: boolean) {
  const r = legendary ? LEGENDARY_LAIR_RADIUS : LAIR_RADIUS;
  ctx.lineWidth = legendary ? 2 : 1.5;
  ctx.strokeStyle = legendary ? '#1b1b1b' : '#fff';
  ctx.fillStyle = LAIR_COLOR;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y + r);
  ctx.lineTo(x - r, y + r);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
}

interface Cache {
  cells: WorldCells | null;
  bitmaps: Map<string, HTMLCanvasElement>;
  values: Map<string, ArrayLike<number> | null>;
  /** Labels and the cell-to-regions lookup, built once per world. */
  places: { labels: Label[]; lookup: Map<number, Region[]> } | null;
}

export function WorldMap({
  cells,
  regions,
  routes,
  sites,
  civs,
  creatures,
  people,
  dynasties,
  year,
  siteBiography,
  cultures,
  seed,
  content,
  layer,
  at,
  zoom,
  busy,
  onView,
  history,
  focus,
  highlight,
  onBackToLegends,
  siteActions,
}: Props) {
  const [overlays, setOverlays] = useState<Overlays>({
    water: true,
    shade: true,
    names: true,
    roads: true,
    sites: true,
    raw: false,
  });
  const [hoverCell, setHoverCell] = useState<number | null>(null);
  /** Where in the map the pointer entered the hovered cell, for the site tooltip. */
  const [hoverAt, setHoverAt] = useState<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<Camera>({ x: 0, y: 0 });
  const cache = useRef<Cache>({
    cells: null,
    bitmaps: new Map(),
    values: new Map(),
    places: null,
  });
  const latest = useRef({
    cells,
    regions,
    routes,
    sites,
    civs,
    creatures,
    content,
    layer,
    overlays,
    at,
    zoom,
    onView,
    history,
    focus,
    highlight,
  });
  latest.current = {
    cells,
    regions,
    routes,
    sites,
    civs,
    creatures,
    content,
    layer,
    overlays,
    at,
    zoom,
    onView,
    history,
    focus,
    highlight,
  };

  const layerDef = LAYER_BY_ID.get(layer) ?? LAYER_BY_ID.get(DEFAULT_LAYER)!;
  const selected = cells && at && at.x < cells.width && at.y < cells.height ? at : null;

  function bitmap(c: WorldCells, id: string, shade: boolean, water: boolean): HTMLCanvasElement {
    if (cache.current.cells !== c)
      cache.current = { cells: c, bitmaps: new Map(), values: new Map(), places: null };
    // The territory layer follows the year slider; its bitmaps are keyed by snapshot year.
    const past = id === 'territory' ? latest.current.history : null;
    const key = `${id}|${shade}|${water}|${past ? past.snapshotYear : 'now'}`;
    let made = cache.current.bitmaps.get(key);
    if (!made) {
      const def = LAYER_BY_ID.get(id) ?? ELEVATION;
      const source = past ? { ...c, territory: past.territory } : c;
      const pixels = renderLayer(source, def, {
        hillshade: shade,
        water,
        ...(ELEVATION.seaStops ? { seaStops: ELEVATION.seaStops } : {}),
      });
      made = document.createElement('canvas');
      made.width = c.width;
      made.height = c.height;
      made
        .getContext('2d')!
        .putImageData(
          new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, c.width, c.height),
          0,
          0,
        );
      cache.current.bitmaps.set(key, made);
    }
    return made;
  }

  function valuesOf(c: WorldCells, id: string): ArrayLike<number> | null {
    if (cache.current.cells !== c)
      cache.current = { cells: c, bitmaps: new Map(), values: new Map(), places: null };
    if (!cache.current.values.has(id)) cache.current.values.set(id, layerValues(c, id));
    return cache.current.values.get(id)!;
  }

  function placesOf(c: WorldCells, all: ReadonlyMap<Id, Region>) {
    if (cache.current.cells !== c)
      cache.current = { cells: c, bitmaps: new Map(), values: new Map(), places: null };
    cache.current.places ??= {
      labels: planLabels(all.values()),
      lookup: regionLookup(all.values()),
    };
    return cache.current.places;
  }

  /** Draws region names over the bitmap, skipping any label that would overlap a drawn one. */
  function drawLabels(
    ctx: CanvasRenderingContext2D,
    c: WorldCells,
    scale: number,
    ox: number,
    oy: number,
    width: number,
    height: number,
    drawn: [number, number, number, number][],
  ) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const label of placesOf(c, latest.current.regions).labels) {
      if (scale < label.minScale) continue;
      const { anchor, name } = label.region;
      const sx = ox + ((anchor % c.width) + 0.5) * scale;
      const sy = oy + (Math.floor(anchor / c.width) + 0.5) * scale;
      if (sx < 0 || sy < 0 || sx > width || sy > height) continue;
      ctx.font = `${label.italic ? 'italic ' : ''}${label.size}px system-ui, sans-serif`;
      const w = ctx.measureText(name).width;
      const ty = label.marker ? sy + MARKER_RADIUS + label.size / 2 + 1 : sy;
      const box: [number, number, number, number] = [
        sx - w / 2 - 2,
        (label.marker ? sy - MARKER_RADIUS : ty - label.size / 2) - 1,
        w + 4,
        label.marker ? MARKER_RADIUS + label.size + 3 : label.size + 2,
      ];
      if (drawn.some((other) => boxesOverlap(box, other))) continue;
      drawn.push(box);
      if (label.marker) drawMarker(ctx, label.marker, sx, sy);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.strokeText(name, sx, ty);
      ctx.fillStyle = '#1b1b1b';
      ctx.fillText(name, sx, ty);
    }
  }

  /** Draws site glyphs and names; returns the boxes taken, so region labels can avoid them. */
  function drawSites(
    ctx: CanvasRenderingContext2D,
    c: WorldCells,
    scale: number,
    ox: number,
    oy: number,
    width: number,
    height: number,
  ): [number, number, number, number][] {
    const { sites: all, civs: owners, history: past, highlight: marked } = latest.current;
    const capitals = new Set([...owners.values()].map((civ) => civ.capital));
    const taken: [number, number, number, number][] = [];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    // Capitals first, then larger sites, so the important names win collisions.
    // In a past year only the sites that existed then, as they stood then.
    const stateOf = (site: Site) =>
      past
        ? past.sites.get(site.id)
        : { civId: site.civId, pop: sitePopulation(site), ruined: site.ruinedYear !== undefined };
    const standing = [...all.values()].filter((site) => stateOf(site) !== undefined);
    const order = standing.sort(
      (a, b) =>
        Number(capitals.has(b.id)) - Number(capitals.has(a.id)) ||
        stateOf(b)!.pop - stateOf(a)!.pop ||
        a.id - b.id,
    );
    for (const site of order) {
      const state = stateOf(site)!;
      const sx = ox + ((site.cell % c.width) + 0.5) * scale;
      const sy = oy + (Math.floor(site.cell / c.width) + 0.5) * scale;
      if (sx < -20 || sy < -20 || sx > width + 20 || sy > height + 20) continue;
      // With an entity page open, its sites are ringed and the others dim.
      const lit = marked === null || marked.has(site.id);
      ctx.globalAlpha = lit ? 1 : DIM_ALPHA;
      if (state.ruined) {
        drawRuin(ctx, sx, sy);
        ctx.globalAlpha = 1;
        continue;
      }
      const r = Math.min(
        SITE_RADIUS_MAX,
        SITE_RADIUS_BASE + Math.sqrt(state.pop) / SITE_RADIUS_DIVISOR,
      );
      const [cr, cg, cb] = civColor(state.civId ?? 0);
      drawSiteGlyph(ctx, site.kind, sx, sy, r, `rgb(${cr},${cg},${cb})`);
      if (marked !== null && lit) {
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = FOCUS_COLOR;
        ctx.beginPath();
        ctx.arc(sx, sy, r + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      taken.push([sx - r - 1, sy - r - 1, r * 2 + 2, r * 2 + 2]);
      const minScale = capitals.has(site.id) ? CAPITAL_LABEL_SCALE : SITE_LABEL_SCALE;
      if (scale < minScale) {
        ctx.globalAlpha = 1;
        continue;
      }
      const size = capitals.has(site.id) ? 13 : 11;
      ctx.font = `${capitals.has(site.id) ? 'bold ' : ''}${size}px system-ui, sans-serif`;
      const w = ctx.measureText(site.name).width;
      const ty = sy + r + size / 2 + 2;
      const box: [number, number, number, number] = [
        sx - w / 2 - 2,
        ty - size / 2 - 1,
        w + 4,
        size + 2,
      ];
      if (taken.some((other, k) => k < taken.length - 1 && boxesOverlap(box, other))) {
        ctx.globalAlpha = 1;
        continue;
      }
      taken.push(box);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.strokeText(site.name, sx, ty);
      ctx.fillStyle = '#1b1b1b';
      ctx.fillText(site.name, sx, ty);
      ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = 1;
    drawLairs(ctx, c, scale, ox, oy, width, height, taken);
    return taken;
  }

  /** Draws the lairs of living beasts, named at the same zoom as ordinary sites. */
  function drawLairs(
    ctx: CanvasRenderingContext2D,
    c: WorldCells,
    scale: number,
    ox: number,
    oy: number,
    width: number,
    height: number,
    taken: [number, number, number, number][],
  ) {
    const { creatures: beasts, content: bundle, history: past } = latest.current;
    const tiers = new Map(bundle.creatures.map((d) => [d.id, d.tier]));
    for (const beast of beasts.values()) {
      if (!aliveIn(beast, past?.year)) continue;
      const sx = ox + ((beast.lair % c.width) + 0.5) * scale;
      const sy = oy + (Math.floor(beast.lair / c.width) + 0.5) * scale;
      if (sx < -20 || sy < -20 || sx > width + 20 || sy > height + 20) continue;
      const legendary = tiers.get(beast.defId) === 'legendary';
      drawLair(ctx, sx, sy, legendary);
      const r = legendary ? LEGENDARY_LAIR_RADIUS : LAIR_RADIUS;
      taken.push([sx - r - 1, sy - r - 1, r * 2 + 2, r * 2 + 2]);
      if (scale < SITE_LABEL_SCALE) continue;
      ctx.font = '11px system-ui, sans-serif';
      const w = ctx.measureText(beast.name).width;
      const ty = sy + r + 8;
      const box: [number, number, number, number] = [sx - w / 2 - 2, ty - 6, w + 4, 13];
      if (taken.some((other, k) => k < taken.length - 1 && boxesOverlap(box, other))) continue;
      taken.push(box);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.strokeText(beast.name, sx, ty);
      ctx.fillStyle = LAIR_COLOR;
      ctx.fillText(beast.name, sx, ty);
    }
  }

  /** Draws land routes as brown lines and sea lanes as dashed pale blue, then route nodes as dots. */
  function drawRoutes(
    ctx: CanvasRenderingContext2D,
    c: WorldCells,
    graph: RouteGraph,
    scale: number,
    ox: number,
    oy: number,
  ) {
    const trace = (path: number[]) => {
      ctx.beginPath();
      path.forEach((cell, k) => {
        const px = ox + ((cell % c.width) + 0.5) * scale;
        const py = oy + (Math.floor(cell / c.width) + 0.5) * scale;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
    };
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.setLineDash(SEA_LANE_DASH);
    ctx.strokeStyle = SEA_LANE_COLOR;
    ctx.lineWidth = 1.5;
    for (const edge of graph.edges) {
      if (!edge.sea) continue;
      trace(edge.path);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = ROAD_COLOR;
    for (const edge of graph.edges) {
      if (edge.sea) continue;
      ctx.lineWidth = roadWidth(c.roads[edge.path[edge.path.length >> 1]!]!);
      trace(edge.path);
      ctx.stroke();
    }
    if (scale >= NODE_DOT_SCALE) {
      ctx.fillStyle = '#1b1b1b';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      for (const node of graph.nodes) {
        ctx.beginPath();
        ctx.arc(
          ox + ((node.cell % c.width) + 0.5) * scale,
          oy + (Math.floor(node.cell / c.width) + 0.5) * scale,
          2.5,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  /** Canvas size in CSS pixels, and how much of the view the whole map fills at zoom 0. */
  function viewport() {
    const rect = canvasRef.current!.getBoundingClientRect();
    const c = latest.current.cells;
    const fit = c ? Math.min(rect.width / c.width, rect.height / c.height) : 1;
    return { rect, fit };
  }

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { cells: c, layer: id, overlays: o, at: sel, zoom: z } = latest.current;
    const { rect, fit } = viewport();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (!c || rect.width === 0) return;

    const scale = cellScale(fit, clampZoom(fit, z));
    const cam = boundCamera(camRef.current, c.width, c.height, rect.width, rect.height, scale);
    camRef.current = cam;
    const ox = rect.width / 2 - cam.x * scale;
    const oy = rect.height / 2 - cam.y * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bitmap(c, id, o.shade, o.water), ox, oy, c.width * scale, c.height * scale);

    if (scale >= 8) {
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const x0 = Math.max(0, Math.floor(-ox / scale));
      const x1 = Math.min(c.width, Math.ceil((rect.width - ox) / scale));
      const y0 = Math.max(0, Math.floor(-oy / scale));
      const y1 = Math.min(c.height, Math.ceil((rect.height - oy) / scale));
      for (let x = x0; x <= x1; x += 1) {
        ctx.moveTo(ox + x * scale, oy + y0 * scale);
        ctx.lineTo(ox + x * scale, oy + y1 * scale);
      }
      for (let y = y0; y <= y1; y += 1) {
        ctx.moveTo(ox + x0 * scale, oy + y * scale);
        ctx.lineTo(ox + x1 * scale, oy + y * scale);
      }
      ctx.stroke();
    }
    if (o.roads) drawRoutes(ctx, c, latest.current.routes, scale, ox, oy);
    const taken = o.sites ? drawSites(ctx, c, scale, ox, oy, rect.width, rect.height) : [];
    if (o.names) drawLabels(ctx, c, scale, ox, oy, rect.width, rect.height, taken);
    if (sel && sel.x < c.width && sel.y < c.height) {
      const cx = ox + (sel.x + 0.5) * scale;
      const cy = oy + (sel.y + 0.5) * scale;
      const r = Math.max(7, scale * 1.2);
      for (const [width, color] of [
        [3, '#fff'],
        [1.5, '#111'],
      ] as const) {
        ctx.lineWidth = width;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    const mark = latest.current.focus;
    if (mark && mark.x < c.width && mark.y < c.height) {
      const cx = ox + (mark.x + 0.5) * scale;
      const cy = oy + (mark.y + 0.5) * scale;
      const r = Math.max(10, scale * 1.8);
      for (const [width, color] of [
        [5, 'rgba(0,0,0,0.45)'],
        [2.5, FOCUS_COLOR],
      ] as const) {
        ctx.lineWidth = width;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    const mini = miniRef.current;
    if (mini) {
      const m = mini.getContext('2d')!;
      m.imageSmoothingEnabled = true;
      m.drawImage(bitmap(c, DEFAULT_LAYER, true, true), 0, 0, mini.width, mini.height);
      const k = mini.width / c.width;
      const vw = Math.min(c.width, rect.width / scale);
      const vh = Math.min(c.height, rect.height / scale);
      m.strokeStyle = '#fff';
      m.lineWidth = 2;
      m.strokeRect((cam.x - vw / 2) * k, (cam.y - vh / 2) * k, vw * k, vh * k);
    }
  }

  // New world: centre on the selected cell, or the middle of the map.
  useEffect(() => {
    camRef.current = cells
      ? at && at.x < cells.width && at.y < cells.height
        ? { x: at.x + 0.5, y: at.y + 0.5 }
        : { x: cells.width / 2, y: cells.height / 2 }
      : { x: 0, y: 0 };
    setHoverCell(null);
    // `at` only positions the camera when a world arrives.
  }, [cells]);

  useEffect(draw);

  // Legends: zoom to FOCUS_ZOOM only when the map is fully zoomed out or the cell is off screen,
  // never zoom out, and centre only when something moves. The cell gets a gold ring rather than the
  // selection, so the present-day inspector does not cover a past-year map.
  useEffect(() => {
    const c = latest.current.cells;
    if (!focus || !c) return;
    const { rect, fit } = viewport();
    const current = clampZoom(fit, latest.current.zoom);
    const scale = cellScale(fit, current);
    const cam = camRef.current;
    const onScreen =
      rect.width > 0 &&
      Math.abs(focus.x + 0.5 - cam.x) * scale < rect.width / 2 - EDGE_MARGIN_PX &&
      Math.abs(focus.y + 0.5 - cam.y) * scale < rect.height / 2 - EDGE_MARGIN_PX;
    if (current > 0 && onScreen) return;
    camRef.current = { x: focus.x + 0.5, y: focus.y + 0.5 };
    const raised = Math.max(current, FOCUS_ZOOM);
    // The re-render this causes draws at the new zoom; drawing first would clamp the camera.
    latest.current.onView({ zoom: rect.width > 0 ? clampZoom(fit, raised) : raised });
    // Only a new request moves the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.key]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas);
    let lastWheel = 0;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const now = Date.now();
      if (now - lastWheel < WHEEL_STEP_MS) return;
      lastWheel = now;
      const { fit } = viewport();
      const { zoom: z, onView: change } = latest.current;
      change({ zoom: clampZoom(fit, z + (event.deltaY < 0 ? 1 : -1)) });
    };
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => {
      observer.disconnect();
      canvas.removeEventListener('wheel', wheel);
    };
  }, []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.closest('input, select, textarea') ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }
      const { overlays: o, at: sel, onView: change } = latest.current;
      const picked = LAYER_KEYS.get(event.key);
      if (picked) change({ layer: picked });
      else if (event.key === 'h' || event.key === 'H') setOverlays({ ...o, shade: !o.shade });
      else if (event.key === 'n' || event.key === 'N') setOverlays({ ...o, names: !o.names });
      else if (event.key === 'r' || event.key === 'R') setOverlays({ ...o, roads: !o.roads });
      else if (event.key === 's' || event.key === 'S') setOverlays({ ...o, sites: !o.sites });
      else if (event.key === 'Escape' && sel) change({ at: null });
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);

  const drag = useRef<{ x: number; y: number; cam: Camera; moved: boolean } | null>(null);
  const cellUnder = (event: { clientX: number; clientY: number }) => {
    const c = latest.current.cells;
    if (!c) return null;
    const { rect, fit } = viewport();
    const scale = cellScale(fit, clampZoom(fit, latest.current.zoom));
    return cellAt(
      event.clientX - rect.left,
      event.clientY - rect.top,
      camRef.current,
      rect.width,
      rect.height,
      scale,
      c.width,
      c.height,
    );
  };

  const valuesNow = (c: WorldCells) =>
    layerDef.id === 'territory' && history ? history.territory : valuesOf(c, layerDef.id);
  const hoverValue =
    cells && hoverCell !== null
      ? { value: valuesNow(cells)?.[hoverCell] ?? 0, water: cells.water[hoverCell]! }
      : null;

  // The site under the selected cell or the nearest within one cell, and who owns the land.
  let siteHere: Site | null = null;
  if (cells && selected) {
    const here = selected.y * cells.width + selected.x;
    let nearest = Infinity;
    for (const site of sites.values()) {
      if (history && !history.sites.has(site.id)) continue;
      const d = cellDistance(cells.width, site.cell, here);
      if (d <= 1 && d < nearest) {
        nearest = d;
        siteHere = site;
      }
    }
  }
  // The lair on or beside the cell, a living beast's first.
  let lairHere: Creature | null = null;
  if (cells && selected) {
    const here = selected.y * cells.width + selected.x;
    for (const beast of creatures.values()) {
      if (history && !aliveIn(beast, history.year)) continue;
      if (cellDistance(cells.width, beast.lair, here) > 1) continue;
      if (!lairHere || (lairHere.died !== undefined && beast.died === undefined)) lairHere = beast;
    }
  }
  const ownerOf = (id: Id | null | undefined) => (id ? (civs.get(id) ?? null) : null);
  const cultureOf = (id: string | undefined) =>
    cultures.find((culture) => culture.id === id) ?? null;
  // The Peoples legend lists the civs this world has, with their map colours.
  const peoples =
    layerDef.id === 'territory' && civs.size > 0
      ? [
          { label: 'Unclaimed', color: civColor(0) },
          ...[...civs.values()]
            .sort((a, b) => a.id - b.id)
            .map((civ) => ({
              label:
                civ.fell === undefined ? civ.name : `${civ.name} (fell in year ${civ.fell + 1})`,
              color: civColor(civ.id),
            })),
        ]
      : undefined;
  const landCiv =
    cells && selected
      ? ownerOf((history?.territory ?? cells.territory)[selected.y * cells.width + selected.x])
      : null;
  const siteCivId = siteHere
    ? history
      ? history.sites.get(siteHere.id)?.civId
      : siteHere.civId
    : null;
  // The site under the pointer, as it stood in the slider year, with who held it and how many lived there.
  const tipSite =
    hoverCell !== null && hoverAt !== null
      ? [...sites.values()].find((site) => site.cell === hoverCell)
      : undefined;
  const tipState = tipSite
    ? history
      ? history.sites.get(tipSite.id)
      : {
          civId: tipSite.civId,
          pop: sitePopulation(tipSite),
          ruined: tipSite.ruinedYear !== undefined,
        }
    : undefined;
  const digest = useMemo(() => (cells ? cellsDigest(cells) : undefined), [cells]);

  return (
    <div
      className={busy ? 'stage dimmed' : 'stage'}
      data-testid="world-map"
      data-state={cells ? (busy ? 'busy' : 'ready') : 'empty'}
      data-seed={seed}
      data-cells-digest={digest}
      data-focus={focus ? `${focus.x},${focus.y}` : undefined}
    >
      <canvas
        ref={canvasRef}
        className="map"
        aria-label="World map"
        tabIndex={0}
        onPointerDown={(event) => {
          drag.current = { x: event.clientX, y: event.clientY, cam: camRef.current, moved: false };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const d = drag.current;
          if (d) {
            const dx = event.clientX - d.x;
            const dy = event.clientY - d.y;
            if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) d.moved = true;
            if (d.moved) {
              const { fit } = viewport();
              const scale = cellScale(fit, clampZoom(fit, zoom));
              camRef.current = { x: d.cam.x - dx / scale, y: d.cam.y - dy / scale };
              draw();
            }
            return;
          }
          const cell = cellUnder(event);
          const index = cell && cells ? cell.y * cells.width + cell.x : null;
          if (index !== hoverCell) {
            setHoverCell(index);
            const box = event.currentTarget.getBoundingClientRect();
            setHoverAt({ x: event.clientX - box.left, y: event.clientY - box.top });
          }
        }}
        onPointerUp={(event) => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved) {
            const cell = cellUnder(event);
            if (cell) onView({ at: cell });
          }
        }}
        onPointerLeave={() => setHoverCell(null)}
      />

      <LayerPanel
        layer={layerDef.id}
        overlays={overlays}
        onPick={(id) => onView({ layer: id })}
        onOverlays={(next) => setOverlays({ ...overlays, ...next })}
      />
      <Legend
        layer={layerDef}
        shade={overlays.shade}
        hover={hoverValue}
        entries={peoples}
        readout={peoples ? (value) => (value > 0 ? civs.get(value)?.name : undefined) : undefined}
      />
      <div className="float minimap">
        <canvas
          ref={miniRef}
          width={128}
          height={128}
          aria-label="Minimap"
          onPointerDown={(event) => {
            if (!cells) return;
            const rect = event.currentTarget.getBoundingClientRect();
            camRef.current = {
              x: ((event.clientX - rect.left) / rect.width) * cells.width,
              y: ((event.clientY - rect.top) / rect.height) * cells.height,
            };
            if (zoom === 0) onView({ zoom: MINIMAP_ZOOM });
            else draw();
          }}
        />
      </div>
      {tipSite && tipState && hoverAt && (
        <div
          className="float wm-tip"
          role="tooltip"
          style={{ left: hoverAt.x + TIP_OFFSET_PX, top: hoverAt.y + TIP_OFFSET_PX }}
        >
          <strong>{tipSite.name}</strong>
          <span>
            {tipState.ruined
              ? 'ruin'
              : `${(tipState.civId != null && civs.get(tipState.civId)?.name) || 'no people'} · population ${tipState.pop.toLocaleString('en-US')}`}
          </span>
        </div>
      )}
      {onBackToLegends && (
        <button type="button" className="float back-legends" onClick={onBackToLegends}>
          ← Back to Legends
        </button>
      )}
      <div className="float zoom">
        <button
          aria-label="Zoom in"
          onClick={() => onView({ zoom: clampZoom(viewport().fit, zoom + 1) })}
        >
          +
        </button>
        <button aria-label="Zoom out" onClick={() => onView({ zoom: Math.max(0, zoom - 1) })}>
          −
        </button>
      </div>
      <button
        aria-label="Whole world"
        title="Whole world"
        className="float whole"
        onClick={() => {
          if (cells) camRef.current = { x: cells.width / 2, y: cells.height / 2 };
          onView({ zoom: 0 });
        }}
      >
        Whole world
      </button>
      {cells && selected && (
        <Inspector
          cells={cells}
          x={selected.x}
          y={selected.y}
          biomes={content.biomes}
          resources={content.resources}
          raw={overlays.raw}
          site={siteHere}
          lair={lairHere}
          lairDef={content.creatures.find((d) => d.id === lairHere?.defId) ?? null}
          siteCiv={ownerOf(siteCivId)}
          siteCulture={cultureOf(ownerOf(siteCivId)?.cultureId)}
          landCiv={landCiv}
          landCulture={cultureOf(landCiv?.cultureId)}
          places={placesOf(cells, regions).lookup.get(selected.y * cells.width + selected.x) ?? []}
          siteBiography={siteBiography}
          people={people}
          dynasties={dynasties}
          year={year}
          siteActions={siteActions}
          onShow={(id) => onView({ layer: id })}
          onClose={() => onView({ at: null })}
        />
      )}
      {cells && !selected && <div className="float hint">Click any cell to inspect it</div>}
    </div>
  );
}
