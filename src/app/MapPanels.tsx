// Floating panels of the world-map viewer: layer picker, legend and cell inspector.

import { Fragment, type ReactNode } from 'react';
import { MAP_LAYERS } from '../content';
import type { BiomeDef, MapLayer, Region, ResourceDef, WorldCells } from '../engine';
import { formatReadout, rampGradient, rampPosition, rampTicks } from './map-view';
import { explainCell } from './why';

export const LAYER_BY_ID = new Map(MAP_LAYERS.map((layer) => [layer.id, layer]));

interface LayerGroup {
  title: string;
  layers: { id: string; key?: string }[];
}
const LAYER_GROUPS: LayerGroup[] = [
  {
    title: 'Land',
    layers: [
      { id: 'elevation', key: '1' },
      { id: 'biome', key: '2' },
    ],
  },
  {
    title: 'Climate',
    layers: [
      { id: 'tempSummer', key: '3' },
      { id: 'tempWinter', key: '4' },
      { id: 'rainfall', key: '5' },
      { id: 'risk.drought' },
      { id: 'risk.storm' },
      { id: 'risk.snow' },
    ],
  },
  {
    title: 'Life',
    layers: [
      { id: 'fertility', key: '6' },
      { id: 'wildness', key: '7' },
      { id: 'aura', key: '8' },
      { id: 'resources', key: '9' },
    ],
  },
];
const DEBUG_LAYERS = ['plate', 'flow', 'seaDistance', 'floodplain', 'travelCost'];

/** Every layer the viewer can show, for URL validation and number keys. */
export const VIEWER_LAYER_IDS = [
  ...LAYER_GROUPS.flatMap((g) => g.layers.map((l) => l.id)),
  ...DEBUG_LAYERS,
];
export const LAYER_KEYS = new Map(
  LAYER_GROUPS.flatMap((g) => g.layers.flatMap((l) => (l.key ? [[l.key, l.id] as const] : []))),
);

export interface Overlays {
  water: boolean;
  shade: boolean;
  names: boolean;
  roads: boolean;
  raw: boolean;
}

function LayerButton({
  id,
  keyHint,
  active,
  onPick,
}: {
  id: string;
  keyHint?: string | undefined;
  active: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <button
      className="layer"
      aria-pressed={active}
      aria-keyshortcuts={keyHint}
      onClick={() => onPick(id)}
    >
      <span className="dot" aria-hidden="true" />
      {LAYER_BY_ID.get(id)?.label ?? id}
      {keyHint && <kbd aria-hidden="true">{keyHint}</kbd>}
    </button>
  );
}

export function LayerPanel({
  layer,
  overlays,
  onPick,
  onOverlays,
}: {
  layer: string;
  overlays: Overlays;
  onPick: (id: string) => void;
  onOverlays: (next: Partial<Overlays>) => void;
}) {
  return (
    <nav className="float layers" aria-label="Map layers">
      {LAYER_GROUPS.map((group) => (
        <Fragment key={group.title}>
          <div className="group">{group.title}</div>
          {group.layers.map((l) => (
            <LayerButton
              key={l.id}
              id={l.id}
              keyHint={l.key}
              active={layer === l.id}
              onPick={onPick}
            />
          ))}
        </Fragment>
      ))}
      <div className="group">Show on top</div>
      <div className="overlays">
        <label>
          <input
            type="checkbox"
            checked={overlays.water}
            onChange={(e) => onOverlays({ water: e.target.checked })}
          />
          Rivers, lakes, sea
        </label>
        <label>
          <input
            type="checkbox"
            checked={overlays.shade}
            onChange={(e) => onOverlays({ shade: e.target.checked })}
          />
          Hillshade <kbd>H</kbd>
        </label>
        <label>
          <input
            type="checkbox"
            checked={overlays.names}
            onChange={(e) => onOverlays({ names: e.target.checked })}
          />
          Names <kbd>N</kbd>
        </label>
        <label>
          <input
            type="checkbox"
            checked={overlays.roads}
            onChange={(e) => onOverlays({ roads: e.target.checked })}
          />
          Roads <kbd>R</kbd>
        </label>
      </div>
      <details className="debug">
        <summary className="group">Debug</summary>
        {DEBUG_LAYERS.map((id) => (
          <LayerButton key={id} id={id} active={layer === id} onPick={onPick} />
        ))}
        <div className="overlays">
          <label>
            <input
              type="checkbox"
              checked={overlays.raw}
              onChange={(e) => onOverlays({ raw: e.target.checked })}
            />
            Raw numbers
          </label>
        </div>
      </details>
    </nav>
  );
}

/** What the pointer is over: the layer value of that cell and its water class. */
export interface Hover {
  value: number;
  water: number;
}

export function Legend({
  layer,
  shade,
  hover,
}: {
  layer: MapLayer;
  shade: boolean;
  hover: Hover | null;
}) {
  const position = hover ? rampPosition(layer, hover.value, hover.water) : null;
  return (
    <div className="float wm-legend" aria-live="polite">
      <h3>
        {layer.label}
        <span>
          {layer.unit}
          {shade ? ' · hillshaded' : ''}
        </span>
      </h3>
      {layer.kind === 'ramp' ? (
        <>
          <div className="ramp" style={{ background: rampGradient(layer) }}>
            {position !== null && (
              <div className="cursor" style={{ left: `calc(${position * 100}% - 1px)` }} />
            )}
          </div>
          <div className="ticks" aria-hidden="true">
            {rampTicks(layer).map((tick) => (
              <span key={tick.pos} style={{ left: `${tick.pos * 100}%` }}>
                {tick.label}
              </span>
            ))}
          </div>
        </>
      ) : (
        <div className="swatches">
          {layer.legend.map((entry) => (
            <span key={entry.label}>
              <i style={{ background: `rgb(${entry.color.join(',')})` }} />
              {entry.label}
            </span>
          ))}
        </div>
      )}
      <div className="readout">
        {hover
          ? formatReadout(layer, hover.value, hover.water)
          : 'Point at the map to read a value'}
      </div>
    </div>
  );
}

const WATER_NAMES = ['Land', 'River', 'Lake', 'Sea'];
const FLOW_NAMES = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
];
/** Risk bands: below the first is low, below the second moderate, else high. */
const RISK_BANDS = [34, 67];

function riskLevel(value: number): string {
  return value < RISK_BANDS[0]! ? 'low' : value < RISK_BANDS[1]! ? 'moderate' : 'high';
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

export function Inspector({
  cells,
  x,
  y,
  biomes,
  resources,
  raw,
  places,
  onShow,
  onClose,
}: {
  cells: WorldCells;
  x: number;
  y: number;
  biomes: readonly BiomeDef[];
  resources: readonly ResourceDef[];
  raw: boolean;
  /** Regions containing the cell, in id order. */
  places: readonly Region[];
  onShow: (layerId: string) => void;
  onClose: () => void;
}) {
  const i = y * cells.width + x;
  const water = cells.water[i]!;
  const heading =
    water === 3
      ? 'Sea'
      : water === 2
        ? 'Lake'
        : water === 1
          ? 'River'
          : (biomes[cells.biome[i]!]?.name ?? 'Land');
  const why = water === 3 ? [] : explainCell(cells, x, y);
  const deposits = cells.resources.get(i) ?? [];
  const risks = (['drought', 'storm', 'snow'] as const).map((kind) => {
    const level = riskLevel(cells.risk[kind][i]!);
    return { kind, level };
  });
  const num = (n: number) => n.toLocaleString('en-US');
  return (
    <aside className="float wm-inspector" aria-label="Cell inspector">
      <header>
        <h2>{heading}</h2>
        <span className="coord">
          {x}, {y}
        </span>
        <button className="close" aria-label="Close inspector" onClick={onClose}>
          ×
        </button>
      </header>
      {why.length > 0 && (
        <ul className="why">
          {why.map((line) => (
            <li key={line.id}>
              <b>{line.lead}</b> {line.text}
              {line.layer && (
                <>
                  {' '}
                  <button
                    aria-label={`Show ${LAYER_BY_ID.get(line.layer)?.label ?? line.layer} layer`}
                    onClick={() => onShow(line.layer!)}
                  >
                    show
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {places.length > 0 && (
        <ul className="places" aria-label="Places">
          {places.map((place) => (
            <li key={place.id}>
              <b>{place.name}</b> · {place.kind}
            </li>
          ))}
        </ul>
      )}
      <dl className="facts">
        <Fact label="Elevation">{num(cells.elevation[i]!)} m</Fact>
        <Fact label="Summer / winter">
          {cells.tempSummer[i]} / {cells.tempWinter[i]} °C
        </Fact>
        <Fact label="Rainfall">{num(cells.rainfall[i]!)} mm/year</Fact>
        <Fact label="Risks">
          <span className="bars">
            {risks.map((r) => (
              <span key={r.kind} className={r.level === 'high' ? 'pill warn' : 'pill'}>
                {r.kind} {r.level}
              </span>
            ))}
          </span>
        </Fact>
        <Fact label="Water">{WATER_NAMES[water]}</Fact>
        {cells.volcano[i] === 1 && <Fact label="Volcano">yes</Fact>}
        <Fact label="Resources">
          {deposits.length === 0 ? (
            'none'
          ) : (
            <span className="bars">
              {deposits.map((d) => (
                <span key={d.resource} className="pill">
                  {resources[d.resource]?.name ?? `#${d.resource}`}
                </span>
              ))}
            </span>
          )}
        </Fact>
        {water !== 3 && (
          <Fact label="Travel">
            {cells.travelCost[i] === 255 ? 'impassable' : `cost ${cells.travelCost[i]}`}
            {cells.roads[i]! > 0 &&
              ` · on a road (${cells.roads[i]} route${cells.roads[i] === 1 ? '' : 's'})`}
          </Fact>
        )}
        <Fact label="Aura">{cells.aura[i]}</Fact>
        {raw && (
          <>
            <Fact label="Plate">{cells.plate[i]}</Fact>
            <Fact label="Flow">{num(cells.flow[i]!)}</Fact>
            <Fact label="Flow direction">{FLOW_NAMES[cells.flowDir[i]!] ?? 'none'}</Fact>
            <Fact label="Sea distance">{cells.seaDistance[i]} cells</Fact>
          </>
        )}
      </dl>
    </aside>
  );
}
