// Colour schemes and legends for the world-map layers (Phase 1). Pure data:
// the renderer in engine/worldgen/render.ts turns cell values into pixels.

import type { MapLayer, MapLayerStop, Rgb } from '../engine';

/** Build ramp stops and legend swatches from [value, colour, label] rows. */
function ramp(rows: [number, Rgb, string][]) {
  const stops: MapLayerStop[] = rows.map(([at, color]) => ({ at, color }));
  const legend = rows.map(([, color, label]) => ({ label, color }));
  return { stops, legend };
}

const SEA_DEEP: Rgb = [10, 30, 90];
const SEA_SHALLOW: Rgb = [70, 130, 190];
const RIVER: Rgb = [60, 120, 220];

const temperature = (id: string, label: string): MapLayer => ({
  id,
  label,
  unit: '°C',
  kind: 'ramp',
  ...ramp([
    [-30, [90, 40, 160], '-30'],
    [-10, [60, 110, 220], '-10'],
    [5, [120, 200, 220], '5'],
    [15, [240, 240, 140], '15'],
    [25, [240, 160, 60], '25'],
    [40, [190, 30, 30], '40'],
  ]),
});

const risk = (id: string, label: string, high: Rgb): MapLayer => ({
  id,
  label,
  unit: '0–100',
  kind: 'ramp',
  ...ramp([
    [0, [235, 235, 225], 'none'],
    [50, [235, 200, 120], 'moderate'],
    [100, high, 'severe'],
  ]),
});

export const MAP_LAYERS: MapLayer[] = [
  {
    id: 'elevation',
    label: 'Elevation',
    unit: 'm',
    kind: 'ramp',
    seaStops: [
      { at: -6000, color: SEA_DEEP },
      { at: -200, color: SEA_SHALLOW },
      { at: 0, color: [130, 180, 215] },
    ],
    ...ramp([
      [1, [90, 150, 70], '0 m'],
      [400, [170, 190, 90], '400 m'],
      [1200, [190, 160, 100], '1200 m'],
      [2500, [140, 110, 90], '2500 m'],
      [4000, [225, 225, 225], '4000 m'],
      [6000, [255, 255, 255], '6000 m'],
    ]),
  },
  {
    id: 'plate',
    label: 'Plates',
    unit: 'id',
    kind: 'categories',
    cycle: true,
    categories: [
      [230, 25, 75],
      [60, 180, 75],
      [255, 225, 25],
      [67, 99, 216],
      [245, 130, 49],
      [145, 30, 180],
      [70, 240, 240],
      [240, 50, 230],
      [188, 246, 12],
      [250, 190, 190],
      [0, 128, 128],
      [170, 110, 40],
    ].map((color, value) => ({ value, label: `Plate ${value}`, color: color as Rgb })),
    legend: [],
  },
  {
    id: 'seaDistance',
    label: 'Distance to sea',
    unit: 'cells',
    kind: 'ramp',
    ...ramp([
      [0, SEA_SHALLOW, 'coast'],
      [10, [200, 220, 140], '10'],
      [40, [150, 110, 60], '40'],
      [100, [70, 40, 20], '100+'],
    ]),
  },
  temperature('tempSummer', 'Summer high'),
  temperature('tempWinter', 'Winter low'),
  {
    id: 'rainfall',
    label: 'Rainfall',
    unit: 'mm/year',
    kind: 'ramp',
    ...ramp([
      [0, [200, 160, 90], '0'],
      [250, [225, 200, 120], '250'],
      [750, [140, 200, 110], '750'],
      [1500, [50, 150, 150], '1500'],
      [3000, [20, 60, 160], '3000+'],
    ]),
  },
  risk('risk.drought', 'Drought risk', [180, 90, 20]),
  risk('risk.storm', 'Storm risk', [80, 40, 140]),
  risk('risk.snow', 'Snow risk', [60, 120, 220]),
  {
    id: 'flow',
    label: 'River flow',
    unit: 'runoff',
    kind: 'ramp',
    // Buckets double roughly every step: 0 = none, then 1, 4, 16 ... runoff.
    thresholds: [1, 4, 16, 64, 256, 1024, 4096],
    ...ramp([
      [0, [20, 30, 50], 'none'],
      [1, [50, 70, 100], '1'],
      [2, [70, 110, 150], '4'],
      [3, [90, 150, 190], '16'],
      [4, [120, 190, 220], '64'],
      [5, [170, 225, 235], '256'],
      [6, [220, 245, 250], '1024'],
      [7, [255, 255, 255], '4096+'],
    ]),
  },
  {
    id: 'water',
    label: 'Water',
    unit: 'class',
    kind: 'categories',
    categories: [
      { value: 0, label: 'Land', color: [150, 170, 110] },
      { value: 1, label: 'River', color: RIVER },
      { value: 2, label: 'Lake', color: [90, 160, 230] },
      { value: 3, label: 'Sea', color: SEA_DEEP },
    ],
    legend: [
      { label: 'Land', color: [150, 170, 110] },
      { label: 'River', color: RIVER },
      { label: 'Lake', color: [90, 160, 230] },
      { label: 'Sea', color: SEA_DEEP },
    ],
  },
  {
    id: 'floodplain',
    label: 'Floodplain',
    unit: 'flag',
    kind: 'categories',
    categories: [
      { value: 0, label: 'Other', color: [60, 60, 60] },
      { value: 1, label: 'Floodplain', color: [120, 220, 110] },
    ],
    legend: [
      { label: 'Other', color: [60, 60, 60] },
      { label: 'Floodplain', color: [120, 220, 110] },
    ],
  },
];
