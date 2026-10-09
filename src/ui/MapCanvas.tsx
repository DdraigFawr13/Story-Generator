import { useEffect, useRef } from 'react';
import type { SettlementSnapshot } from '../controller/world';

export function MapCanvas({
  view,
  selectedTile,
  onSelect,
}: {
  view: SettlementSnapshot['world']['map'] &
    Pick<SettlementSnapshot['world'], 'buildings' | 'settlement' | 'project'>;
  selectedTile: number;
  onSelect: (tile: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;
    const size = 12;
    view.tiles.forEach((tile, index) => {
      const x = (index % view.width) * size,
        y = Math.floor(index / view.width) * size;
      context.fillStyle =
        tile[2] === 'water'
          ? '#668da4'
          : tile[2] === 'rock'
            ? '#919589'
            : tile[3] > 0
              ? '#537450'
              : '#b5c390';
      context.fillRect(x, y, size, size);
    });
    for (const building of view.buildings) {
      const x = (building.tile % view.width) * size,
        y = Math.floor(building.tile / view.width) * size;
      context.fillStyle =
        building.kind === 'field' ? '#d8b563' : building.kind === 'store' ? '#744e38' : '#c87653';
      context.fillRect(x + 1, y + 1, size - 2, size - 2);
      context.strokeStyle = '#2a3828';
      context.strokeRect(x + 1.5, y + 1.5, size - 3, size - 3);
    }
    if (view.project) {
      context.strokeStyle = '#744e38';
      context.setLineDash([2, 2]);
      context.strokeRect(
        (view.project.tile % view.width) * size + 1.5,
        Math.floor(view.project.tile / view.width) * size + 1.5,
        size - 3,
        size - 3,
      );
      context.setLineDash([]);
    }
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2;
    context.strokeRect(
      (selectedTile % view.width) * size + 1,
      Math.floor(selectedTile / view.width) * size + 1,
      size - 2,
      size - 2,
    );
  }, [view, selectedTile]);

  return (
    <canvas
      ref={canvasRef}
      width={view.width * 12}
      height={view.height * 12}
      role="img"
      aria-label={`Settlement map for ${view.settlement.name}. Use the coordinate controls below to inspect tiles with a keyboard.`}
      onClick={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const x = Math.min(
          view.width - 1,
          Math.max(0, Math.floor(((event.clientX - bounds.left) * view.width) / bounds.width)),
        );
        const y = Math.min(
          view.height - 1,
          Math.max(0, Math.floor(((event.clientY - bounds.top) * view.height) / bounds.height)),
        );
        onSelect(y * view.width + x);
      }}
    />
  );
}
