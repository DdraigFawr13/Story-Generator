import { describe, expect, it } from 'vitest';
import {
  boundCamera,
  buildViewUrl,
  cellAt,
  cellScale,
  clampZoom,
  formatReadout,
  maxZoom,
  parseViewUrl,
  rampPosition,
  rampTicks,
} from '../../src/app/map-view';
import { MAP_LAYERS } from '../../src/content';

const IDS = MAP_LAYERS.map((l) => l.id);
const layer = (id: string) => MAP_LAYERS.find((l) => l.id === id)!;

describe('camera', () => {
  it('fits at zoom 0 and caps at 8 px per cell', () => {
    expect(cellScale(2.4, 0)).toBeCloseTo(2.4);
    expect(cellScale(2.4, 6)).toBe(8);
    expect(maxZoom(2.4)).toBe(4); // 2.4 * 4 = 9.6 reaches the cap
    expect(clampZoom(2.4, 6)).toBe(4);
    expect(cellScale(10, 3)).toBe(10); // a huge fit is never shrunk
  });

  it('centres a small map and keeps a large one inside the view', () => {
    expect(boundCamera({ x: 0, y: 0 }, 10, 10, 100, 100, 2)).toEqual({ x: 5, y: 5 });
    expect(boundCamera({ x: 0, y: 99 }, 100, 100, 100, 100, 4)).toEqual({ x: 12.5, y: 87.5 });
  });

  it('finds the cell under a point', () => {
    const camera = { x: 5, y: 5 };
    expect(cellAt(50, 50, camera, 100, 100, 10, 10, 10)).toEqual({ x: 5, y: 5 });
    expect(cellAt(-1, 0, camera, 100, 100, 10, 10, 10)).toBeNull();
  });
});

describe('view URL', () => {
  it('round-trips', () => {
    const url = buildViewUrl({
      seed: 'S1',
      size: 128,
      layer: 'rainfall',
      at: { x: 118, y: 40 },
      zoom: 3,
    });
    expect(url).toBe('/?next&seed=S1&size=128&layer=rainfall&at=118,40&z=3');
    expect(parseViewUrl(url.slice(2), IDS)).toEqual({
      seed: 'S1',
      size: 128,
      layer: 'rainfall',
      at: { x: 118, y: 40 },
      zoom: 3,
    });
  });

  it('falls back on unknown or bad values', () => {
    const view = parseViewUrl('?next&size=999&layer=nope&at=oops&z=99', IDS);
    expect(view).toEqual({ seed: null, size: 256, layer: 'elevation', at: null, zoom: 0 });
  });
});

describe('readout', () => {
  it('formats by unit and category', () => {
    expect(formatReadout(layer('elevation'), 1240, 0)).toBe('1,240 m');
    expect(formatReadout(layer('elevation'), -300, 3)).toBe('Sea');
    expect(formatReadout(layer('rainfall'), 750, 0)).toBe('750 mm/year');
    expect(formatReadout(layer('tempSummer'), 21, 0)).toBe('21 °C');
    expect(formatReadout(layer('fertility'), 62, 0)).toBe('62 of 100');
    expect(formatReadout(layer('biome'), 2, 0)).toBe(layer('biome').categories![2]!.label);
  });

  it('places ticks and cursor along the ramp', () => {
    const ticks = rampTicks(layer('rainfall'));
    expect(ticks[0]).toEqual({ pos: 0, label: '0' });
    expect(ticks[ticks.length - 1]!.pos).toBe(1);
    expect(rampPosition(layer('rainfall'), 1500, 0)).toBeCloseTo(0.5);
    expect(rampPosition(layer('rainfall'), 9000, 0)).toBe(1);
    expect(rampPosition(layer('biome'), 3, 0)).toBeNull();
    expect(rampPosition(layer('elevation'), -5, 3)).toBeNull();
  });
});
