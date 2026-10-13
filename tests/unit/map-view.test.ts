import { describe, expect, it } from 'vitest';
import {
  boundCamera,
  buildSiteUrl,
  buildViewUrl,
  MAX_LINK_DAY,
  siteLinkPoint,
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
    expect(url).toBe('/?seed=S1&size=128&layer=rainfall&at=118,40&z=3');
    expect(parseViewUrl(url.slice(2), IDS)).toEqual({
      seed: 'S1',
      size: 128,
      layer: 'rainfall',
      at: { x: 118, y: 40 },
      zoom: 3,
      year: null,
      open: null,
      cat: null,
      q: '',
      site: null,
    });
  });

  it('round-trips the year, open page and list state', () => {
    const view = {
      seed: 'S1',
      size: 256 as const,
      layer: 'elevation',
      at: null,
      zoom: 0,
      year: 112,
      open: 'event:412',
      cat: 'site' as const,
      q: 'ash & co',
      site: null,
    };
    const { site: _none, ...built } = view;
    const url = buildViewUrl(built);
    expect(url).toBe(
      '/?seed=S1&size=256&layer=elevation&year=112&open=event:412&cat=site&q=ash%20%26%20co',
    );
    expect(parseViewUrl(url.slice(2), IDS)).toEqual(view);
    expect(parseViewUrl('?next&open=race:human', IDS).open).toBe('race:human');
  });

  it('ignores bad year, open and category values', () => {
    const view = parseViewUrl('?next&year=-4&open=nope:1&cat=zzz', IDS);
    expect([view.year, view.open, view.cat]).toEqual([null, null, null]);
    expect(parseViewUrl('?next&open=civ:../x', IDS).open).toBeNull();
  });

  it('falls back on unknown or bad values', () => {
    const view = parseViewUrl('?next&size=999&layer=nope&at=oops&z=99', IDS);
    expect(view).toEqual({
      seed: null,
      size: 256,
      layer: 'elevation',
      at: null,
      zoom: 0,
      year: null,
      open: null,
      cat: null,
      q: '',
      site: null,
    });
  });
});

describe('site view URL (M3.1)', () => {
  it('builds and parses a site link', () => {
    const url = buildSiteUrl({
      seed: 'S1',
      size: 256,
      site: 6,
      day: 43,
      open: 'person:776',
      zoom: 2,
      at: { x: 65, y: 47 },
    });
    expect(url).toBe('/?seed=S1&size=256&site=6&day=43&open=person:776&z=3&at=65,47');
    expect(parseViewUrl(url.slice(2), IDS).site).toEqual({
      site: 6,
      day: 43,
      block: null,
      open: 'person:776',
      zoom: 2,
      at: { x: 65, y: 47 },
      tab: null,
      sec: null,
    });
  });

  it('carries the pane tab (M3.11), leaving Inspect out', () => {
    const base = { seed: 'S1', size: 256, site: 6, day: 3, open: null, zoom: 2 } as const;
    const url = buildSiteUrl({ ...base, at: { x: 1, y: 2 }, tab: 'chron' });
    expect(url).toBe('/?seed=S1&size=256&site=6&day=3&z=3&at=1,2&tab=chron');
    expect(parseViewUrl(url.slice(2), IDS).site?.tab).toBe('chron');
    expect(buildSiteUrl({ ...base, at: { x: 1, y: 2 }, tab: 'inspect' })).not.toContain('tab=');
    expect(parseViewUrl('?seed=S1&site=6&tab=nope', IDS).site?.tab).toBeNull();
  });

  it("carries the person page's section, leaving Now out", () => {
    const base = { seed: 'S1', size: 256, site: 6, day: 3, open: 'person:9', zoom: 2 } as const;
    const url = buildSiteUrl({ ...base, at: { x: 1, y: 2 }, sec: 'ties' });
    expect(url).toBe('/?seed=S1&size=256&site=6&day=3&open=person:9&z=3&at=1,2&sec=ties');
    expect(parseViewUrl(url.slice(2), IDS).site?.sec).toBe('ties');
    expect(buildSiteUrl({ ...base, at: { x: 1, y: 2 }, sec: 'now' })).not.toContain('sec=');
    expect(parseViewUrl('?seed=S1&site=6&sec=nope', IDS).site?.sec).toBeNull();
  });

  it('carries the last block run, and names the moment a clock shows', () => {
    const url = buildSiteUrl({
      seed: 'S1',
      size: 256,
      site: 6,
      day: 10,
      block: 2,
      open: null,
      zoom: 2,
      at: { x: 60, y: 46 },
    });
    expect(url).toBe('/?seed=S1&size=256&site=6&day=10&b=2&z=3&at=60,46');
    expect(parseViewUrl(url.slice(2), IDS).site?.block).toBe(2);
    expect(parseViewUrl('?seed=S1&site=6&day=10&b=4', IDS).site?.block).toBeNull();
    // Entered on day 5: nothing run; after the evening the clock has turned to the next day.
    expect(siteLinkPoint(5, 5, 0)).toEqual({ day: 0, block: null });
    expect(siteLinkPoint(5, 5, 1)).toEqual({ day: 0, block: 0 });
    expect(siteLinkPoint(15, 5, 3)).toEqual({ day: 10, block: 2 });
    expect(siteLinkPoint(16, 5, 0)).toEqual({ day: 10, block: 3 });
  });

  it('keeps tile selections, and leaves the world-map fields at their defaults', () => {
    const url = buildSiteUrl({
      seed: 'S1',
      size: 128,
      site: 9,
      day: 0,
      open: 'tile:12,34',
      zoom: 0,
      at: { x: 48, y: 48 },
    });
    expect(url).toContain('open=tile:12,34');
    const view = parseViewUrl(url.slice(2), IDS);
    expect(view.site?.open).toBe('tile:12,34');
    expect([view.open, view.at, view.zoom]).toEqual([null, null, 0]);
  });

  it('ignores bad site values and links without a site', () => {
    expect(parseViewUrl('?seed=S1&site=x', IDS).site).toBeNull();
    const view = parseViewUrl('?seed=S1&site=4&day=-1&open=civ:3&z=9&at=oops', IDS).site;
    expect(view).toEqual({
      site: 4,
      day: 0,
      block: null,
      open: null,
      zoom: null,
      at: null,
      tab: null,
      sec: null,
    });
    expect(parseViewUrl('?seed=S1&site=4&day=999999', IDS).site?.day).toBe(MAX_LINK_DAY);
    // Old links are untouched.
    const old = parseViewUrl('?seed=S1&open=civ:3&z=2&at=10,20', IDS);
    expect([old.site, old.open, old.zoom, old.at]).toEqual([null, 'civ:3', 2, { x: 10, y: 20 }]);
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
    // Elevation's 400 m stop sits too close to 0 m for both labels.
    const elevation = rampTicks(layer('elevation')).map((t) => t.label);
    expect(elevation[0]).toBe('0 m');
    expect(elevation).not.toContain('400 m');
    expect(elevation[elevation.length - 1]).toBe('6000 m');
  });
});
