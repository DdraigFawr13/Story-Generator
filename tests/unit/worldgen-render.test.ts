import { describe, expect, it } from 'vitest';
import { generateWorld, renderLayer, type MapLayer, type WorldCells } from '../../src/engine';
import { DEFAULT_CONTENT, MAP_LAYERS } from '../../src/content';

const layer = (id: string): MapLayer => MAP_LAYERS.find((l) => l.id === id)!;
const rgb = (px: Uint8ClampedArray, i: number) => [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]];

function firstCell(cells: WorldCells, water: number): number {
  for (let i = 0; i < cells.water.length; i += 1) if (cells.water[i] === water) return i;
  return -1;
}

describe('renderLayer water option', () => {
  const world = generateWorld(
    'RENDER',
    { width: 64, height: 64, historyYears: 0 },
    DEFAULT_CONTENT,
  );
  const cells = world.cells!;
  const sea = firstCell(cells, 3);
  const river = firstCell(cells, 1);

  it('keeps the default: water only on the elevation layer', () => {
    const plain = renderLayer(cells, layer('rainfall'));
    const forced = renderLayer(cells, layer('rainfall'), { water: false });
    expect(Array.from(plain)).toEqual(Array.from(forced));
    const elevation = renderLayer(cells, layer('elevation'));
    expect(Array.from(elevation)).toEqual(
      Array.from(renderLayer(cells, layer('elevation'), { water: true })),
    );
  });

  it('paints sea by depth and rivers over any layer', () => {
    const seaStops = layer('elevation').seaStops!;
    const dry = renderLayer(cells, layer('rainfall'));
    const wet = renderLayer(cells, layer('rainfall'), { water: true, seaStops });
    expect(rgb(wet, sea)).not.toEqual(rgb(dry, sea));
    expect(rgb(wet, river)).toEqual([50, 110, 215]);
    const land = cells.water.findIndex((w) => w === 0);
    expect(rgb(wet, land)).toEqual(rgb(dry, land));
  });

  it('shades land on non-elevation layers only when asked', () => {
    const flat = renderLayer(cells, layer('rainfall'), { hillshade: false });
    const shaded = renderLayer(cells, layer('rainfall'), { hillshade: true });
    expect(Array.from(shaded)).not.toEqual(Array.from(flat));
  });
});
