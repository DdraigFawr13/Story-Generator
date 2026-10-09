import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SettlementSnapshot } from '../controller/world';
import { boundCamera, tileAt } from '../controller/map-camera';
import { populationMarkers, type PopulationMapView } from '../controller/population-markers';

const ZOOM = [8, 12, 18, 24, 32] as const;
type MapView = PopulationMapView & Pick<SettlementSnapshot['world'], 'entities'>;
export function MapCanvas({
  view,
  selectedTile,
  onSelect,
  focusRequest,
  dormantFields,
}: {
  view: MapView;
  selectedTile: number;
  onSelect: (tile: number) => void;
  focusRequest: { tile: number; revision: number };
  dormantFields: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 768, height: 420 });
  const [zoom, setZoom] = useState(1);
  const [showPopulation, setShowPopulation] = useState(true);
  const { tiles, width, height, buildings, settlement, project } = view;
  const population = useMemo(
    () => populationMarkers({ tiles, width, height, buildings, settlement, project }),
    [tiles, width, height, buildings, settlement, project],
  );
  const [center, setCenter] = useState({
    x: (view.settlement.center % view.width) + 0.5,
    y: Math.floor(view.settlement.center / view.width) + 0.5,
  });
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    camera: typeof center;
    moved: boolean;
  } | null>(null);
  const tileSize = ZOOM[zoom]!;
  const camera = boundCamera(center, view.width, view.height, size.width, size.height, tileSize);
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const measure = () => {
      const bounds = canvas.getBoundingClientRect();
      setSize({ width: bounds.width, height: bounds.height });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setCenter({
      x: (focusRequest.tile % view.width) + 0.5,
      y: Math.floor(focusRequest.tile / view.width) + 0.5,
    });
  }, [focusRequest, view.width]);
  useEffect(() => {
    const canvas = canvasRef.current,
      context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.width * ratio);
    canvas.height = Math.round(size.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.imageSmoothingEnabled = false;
    context.fillStyle = '#e0e4d7';
    context.fillRect(0, 0, size.width, size.height);
    const point = (tile: number) => ({
      x: size.width / 2 + ((tile % view.width) - camera.x) * tileSize,
      y: size.height / 2 + (Math.floor(tile / view.width) - camera.y) * tileSize,
    });
    view.tiles.forEach((tile, index) => {
      const { x, y } = point(index);
      if (x + tileSize < 0 || x > size.width || y + tileSize < 0 || y > size.height) return;
      context.fillStyle =
        tile[2] === 'water'
          ? '#668da4'
          : tile[2] === 'rock'
            ? '#919589'
            : tile[3] > 0
              ? '#537450'
              : '#b5c390';
      context.fillRect(x, y, tileSize + 0.5, tileSize + 0.5);
    });
    const occupied = new Set(view.buildings.map((b) => b.tile));
    if (view.project) occupied.add(view.project.tile);
    for (const entity of view.entities.filter((e) => e.retired && !occupied.has(e.tile))) {
      const { x, y } = point(entity.tile);
      context.strokeStyle = '#675e50';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(x + 2, y + 2);
      context.lineTo(x + tileSize - 2, y + tileSize - 2);
      context.moveTo(x + tileSize - 2, y + 2);
      context.lineTo(x + 2, y + tileSize - 2);
      context.stroke();
    }
    for (const building of view.buildings) {
      const { x, y } = point(building.tile);
      context.globalAlpha =
        building.durability === null ? 1 : 0.45 + (0.55 * building.durability) / 100;
      context.fillStyle =
        building.kind === 'field'
          ? dormantFields
            ? '#aaa797'
            : '#d8b563'
          : building.kind === 'store'
            ? '#744e38'
            : '#c87653';
      context.fillRect(x + 1, y + 1, tileSize - 2, tileSize - 2);
      context.globalAlpha = 1;
      context.strokeStyle = '#2a3828';
      context.lineWidth = 1;
      context.beginPath();
      if (building.kind === 'hut') {
        context.moveTo(x + 2, y + tileSize / 2);
        context.lineTo(x + tileSize / 2, y + 2);
        context.lineTo(x + tileSize - 2, y + tileSize / 2);
      } else if (building.kind === 'field') {
        for (const row of [0.35, 0.65]) {
          context.moveTo(x + 2, y + tileSize * row);
          context.lineTo(x + tileSize - 2, y + tileSize * row);
        }
      } else {
        context.moveTo(x + tileSize / 2, y + 2);
        context.lineTo(x + tileSize / 2, y + tileSize - 2);
      }
      context.stroke();
      if (building.kind === 'field' && dormantFields) context.setLineDash([2, 2]);
      context.strokeRect(x + 1.5, y + 1.5, tileSize - 3, tileSize - 3);
      context.setLineDash([]);
    }
    if (view.project) {
      const { x, y } = point(view.project.tile);
      context.strokeStyle = '#744e38';
      context.setLineDash([3, 2]);
      context.strokeRect(x + 1.5, y + 1.5, tileSize - 3, tileSize - 3);
      context.setLineDash([]);
    }
    if (showPopulation) {
      context.fillStyle = '#fff7df';
      context.strokeStyle = '#283b2e';
      context.lineWidth = 1;
      const radius = Math.max(1, Math.min(2.5, tileSize * 0.13));
      for (const marker of population.markers) {
        const x = size.width / 2 + (marker.x - camera.x) * tileSize;
        const y = size.height / 2 + (marker.y - camera.y) * tileSize;
        if (x + radius < 0 || x - radius > size.width || y + radius < 0 || y - radius > size.height)
          continue;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
        context.stroke();
      }
    }
    const { x, y } = point(selectedTile);
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2;
    context.strokeRect(x + 1, y + 1, tileSize - 2, tileSize - 2);
  }, [
    view,
    selectedTile,
    camera.x,
    camera.y,
    tileSize,
    size,
    dormantFields,
    showPopulation,
    population,
  ]);
  function pan(dx: number, dy: number) {
    setCenter({ x: camera.x + dx, y: camera.y + dy });
  }
  return (
    <>
      <div className="map-tools" role="group" aria-label="Map navigation">
        <button
          type="button"
          className="secondary"
          disabled={zoom === 0}
          onClick={() => setZoom(zoom - 1)}
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          className="secondary"
          disabled={zoom === ZOOM.length - 1}
          onClick={() => setZoom(zoom + 1)}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() =>
            setCenter({
              x: (selectedTile % view.width) + 0.5,
              y: Math.floor(selectedTile / view.width) + 0.5,
            })
          }
        >
          Focus selected tile
        </button>
        <button
          type="button"
          className="secondary"
          aria-label="Show population markers"
          aria-pressed={showPopulation}
          onClick={() => setShowPopulation((visible) => !visible)}
        >
          Residents
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => pan(0, -5)}
          aria-label="Pan north"
        >
          ↑
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => pan(-5, 0)}
          aria-label="Pan west"
        >
          ←
        </button>
        <button type="button" className="secondary" onClick={() => pan(5, 0)} aria-label="Pan east">
          →
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => pan(0, 5)}
          aria-label="Pan south"
        >
          ↓
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="navigable-map"
        role="img"
        tabIndex={0}
        aria-label={`Settlement map for ${view.settlement.name}. Drag to pan, use arrow keys or map buttons, and use the coordinate controls to inspect tiles.`}
        aria-describedby="map-help population-help"
        onKeyDown={(event) => {
          const directions: Record<string, [number, number]> = {
            ArrowUp: [0, -5],
            ArrowDown: [0, 5],
            ArrowLeft: [-5, 0],
            ArrowRight: [5, 0],
          };
          const direction = directions[event.key];
          if (direction) {
            event.preventDefault();
            pan(...direction);
          } else if (event.key === '+' || event.key === '=') {
            event.preventDefault();
            setZoom(Math.min(ZOOM.length - 1, zoom + 1));
          } else if (event.key === '-') {
            event.preventDefault();
            setZoom(Math.max(0, zoom - 1));
          }
        }}
        onPointerDown={(event) => {
          if (drag.current || event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            camera,
            moved: false,
          };
        }}
        onPointerMove={(event) => {
          const pointer = drag.current;
          if (!pointer || pointer.id !== event.pointerId) return;
          const dx = event.clientX - pointer.x,
            dy = event.clientY - pointer.y;
          if (Math.hypot(dx, dy) > 5) pointer.moved = true;
          if (pointer.moved)
            setCenter({ x: pointer.camera.x - dx / tileSize, y: pointer.camera.y - dy / tileSize });
        }}
        onPointerUp={(event) => {
          const pointer = drag.current;
          if (!pointer || pointer.id !== event.pointerId) return;
          drag.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
          if (!pointer.moved) {
            const bounds = event.currentTarget.getBoundingClientRect();
            const tile = tileAt(
              event.clientX - bounds.left,
              event.clientY - bounds.top,
              camera,
              size.width,
              size.height,
              tileSize,
              view.width,
              view.height,
            );
            if (tile !== null) onSelect(tile);
          }
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      />
      <p id="population-help" className="map-help">
        {population.population === 0
          ? 'No residents remain.'
          : showPopulation
            ? `${population.markers.length} of ${population.population} residents represented by dots. Placement is illustrative.`
            : `Population: ${population.population}. Resident dots are hidden.`}
      </p>
      <p id="map-help" className="map-help">
        Drag or use arrows to explore. Zoom with +/−. White outline: selected tile. Cross: a removed
        building.
      </p>
    </>
  );
}
