// Canvas 2D world map (M1.4). Each (layer, hillshade, water) bitmap is rendered
// once per world at one pixel per cell, then only redrawn on pan and zoom.

import { useEffect, useRef, useState } from 'react';
import { MAP_LAYERS } from '../content';
import { layerValues, renderLayer, type ContentBundle, type WorldCells } from '../engine';
import { Inspector, LAYER_BY_ID, LAYER_KEYS, Legend, LayerPanel, type Overlays } from './MapPanels';
import { boundCamera, cellAt, cellScale, clampZoom, DEFAULT_LAYER, type Camera } from './map-view';
import './world-map.css';

export interface ViewChange {
  layer?: string;
  at?: { x: number; y: number } | null;
  zoom?: number;
}

interface Props {
  cells: WorldCells | null;
  seed: string;
  content: Pick<ContentBundle, 'biomes' | 'resources'>;
  layer: string;
  at: { x: number; y: number } | null;
  zoom: number;
  /** A new world is generating: keep the old map, dimmed. */
  busy: boolean;
  onView: (change: ViewChange) => void;
}

/** A drag shorter than this many pixels is a click. */
const DRAG_THRESHOLD = 4;
/** Minimum ms between wheel zoom steps, so one trackpad flick is one step. */
const WHEEL_STEP_MS = 120;
/** Zoom step used when the minimap recentres a fully zoomed-out map. */
const MINIMAP_ZOOM = 2;
const ELEVATION = MAP_LAYERS.find((l) => l.id === DEFAULT_LAYER)!;

interface Cache {
  cells: WorldCells | null;
  bitmaps: Map<string, HTMLCanvasElement>;
  values: Map<string, ArrayLike<number> | null>;
}

export function WorldMap({ cells, seed, content, layer, at, zoom, busy, onView }: Props) {
  const [overlays, setOverlays] = useState<Overlays>({ water: true, shade: true, raw: false });
  const [hoverCell, setHoverCell] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<Camera>({ x: 0, y: 0 });
  const cache = useRef<Cache>({ cells: null, bitmaps: new Map(), values: new Map() });
  const latest = useRef({ cells, layer, overlays, at, zoom, onView });
  latest.current = { cells, layer, overlays, at, zoom, onView };

  const layerDef = LAYER_BY_ID.get(layer) ?? LAYER_BY_ID.get(DEFAULT_LAYER)!;
  const selected = cells && at && at.x < cells.width && at.y < cells.height ? at : null;

  function bitmap(c: WorldCells, id: string, shade: boolean, water: boolean): HTMLCanvasElement {
    if (cache.current.cells !== c)
      cache.current = { cells: c, bitmaps: new Map(), values: new Map() };
    const key = `${id}|${shade}|${water}`;
    let made = cache.current.bitmaps.get(key);
    if (!made) {
      const def = LAYER_BY_ID.get(id) ?? ELEVATION;
      const pixels = renderLayer(c, def, {
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
      cache.current = { cells: c, bitmaps: new Map(), values: new Map() };
    if (!cache.current.values.has(id)) cache.current.values.set(id, layerValues(c, id));
    return cache.current.values.get(id)!;
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

  const hoverValue =
    cells && hoverCell !== null
      ? { value: valuesOf(cells, layerDef.id)?.[hoverCell] ?? 0, water: cells.water[hoverCell]! }
      : null;

  return (
    <div
      className={busy ? 'stage dimmed' : 'stage'}
      data-testid="world-map"
      data-state={cells ? (busy ? 'busy' : 'ready') : 'empty'}
      data-seed={seed}
    >
      <canvas
        ref={canvasRef}
        className="map"
        aria-label="World map"
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
          if (index !== hoverCell) setHoverCell(index);
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
      <Legend layer={layerDef} shade={overlays.shade} hover={hoverValue} />
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
      {cells && selected && (
        <Inspector
          cells={cells}
          x={selected.x}
          y={selected.y}
          biomes={content.biomes}
          resources={content.resources}
          raw={overlays.raw}
          onShow={(id) => onView({ layer: id })}
          onClose={() => onView({ at: null })}
        />
      )}
      {cells && !selected && <div className="float hint">Click any cell to inspect it</div>}
    </div>
  );
}
