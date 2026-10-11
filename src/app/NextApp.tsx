// The `?next` page: world-map viewer on top (Phase 1, M1.4), with the Phase 0
// day controls, saves and chronicle below it until Phase 2 replaces them.

import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_CONTENT } from '../content';
import {
  BIRTH_TIER_IDS,
  DEFAULT_SYSTEMS,
  RngStream,
  advance,
  createWorld,
  formatDate,
  rollAptitude,
  templateNarrator,
  tierOfPower,
  validateContent,
  validateSeed,
  type Simulation,
  type TierId,
  type WorldState,
  type WorldgenStage,
} from '../engine';
import { openSaveStore, type SaveStore, type SaveSummary } from '../platform/save-store';
import { generateInWorker, type WorldgenJob } from '../platform/worldgen-host';
import { VIEWER_LAYER_IDS } from './MapPanels';
import { WorldMap, type ViewChange } from './WorldMap';
import {
  DEFAULT_LAYER,
  DEFAULT_SEED,
  buildViewUrl,
  parseViewUrl,
  type ViewState,
  type WorldSize,
} from './map-view';
import './world-map.css';

const SIM: Simulation = { content: DEFAULT_CONTENT, systems: DEFAULT_SYSTEMS };
const CONTENT_PROBLEMS = validateContent(DEFAULT_CONTENT);

const STAGE_LABELS: Record<WorldgenStage, string> = {
  terrain: 'Terrain',
  erosion: 'Erosion',
  climate: 'Climate',
  water: 'Water',
  biomes: 'Biomes',
  volcanoes: 'Volcanoes',
  aura: 'Aura',
  resources: 'Resources',
  habitat: 'Fertility and wildness',
  regions: 'Names and places',
  routes: 'Travel and routes',
  settle: 'Peoples and sites',
};
/** How long "Link copied" stays on the button. */
const COPIED_MS = 2000;

type View = Pick<ViewState, 'layer' | 'at' | 'zoom'>;
const INITIAL_VIEW: View = { layer: DEFAULT_LAYER, at: null, zoom: 0 };

export function NextApp() {
  const [initial] = useState(() => parseViewUrl(window.location.search, VIEWER_LAYER_IDS));
  const [seedInput, setSeedInput] = useState(initial.seed ?? DEFAULT_SEED);
  const [size, setSize] = useState<WorldSize>(initial.size);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ label: string; fraction: number } | null>(null);
  const [view, setView] = useState<View>({
    layer: initial.layer,
    at: initial.at,
    zoom: initial.zoom,
  });
  const [copy, setCopy] = useState<'idle' | 'ok' | 'failed'>('idle');
  const world = useRef<WorldState>(createWorld(initial.seed ?? DEFAULT_SEED));
  /** Seed and size of the map on screen (the inputs may be mid-edit). */
  const shown = useRef<{ seed: string; size: WorldSize } | null>(null);
  const job = useRef<WorldgenJob | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const narrator = useMemo(
    () => templateNarrator(DEFAULT_CONTENT, (id) => world.current.people.get(id)?.name ?? `#${id}`),
    [],
  );

  const writeUrl = (mode: 'push' | 'replace', next: View) => {
    if (!shown.current) return;
    const url = buildViewUrl({ ...shown.current, ...next });
    if (mode === 'push') window.history.pushState(null, '', url);
    else window.history.replaceState(null, '', url);
  };

  /** Generate in the worker; the old map stays (dimmed) until the new world arrives. */
  const generate = (
    seedText: string,
    worldSize: WorldSize,
    next: View,
    mode: 'push' | 'replace',
  ) => {
    let seed: string;
    try {
      seed = validateSeed(seedText);
    } catch (problem) {
      setSeedError((problem as Error).message);
      return;
    }
    setSeedError(null);
    setError(null);
    setProgress({ label: 'Starting…', fraction: 0 });
    const started = generateInWorker(
      seed,
      { width: worldSize, height: worldSize },
      DEFAULT_CONTENT,
      (stage, done, total) =>
        setProgress({ label: `${STAGE_LABELS[stage]}…`, fraction: done / total }),
    );
    job.current = started;
    started.promise.then(
      (generated) => {
        world.current = generated;
        shown.current = { seed, size: worldSize };
        setView(next);
        setProgress(null);
        setRevision((n) => n + 1);
        writeUrl(mode, next);
      },
      (problem: Error) => {
        if (problem.message === 'cancelled') return;
        setProgress(null);
        setError(problem.message);
      },
    );
  };
  // Handlers outlive renders (popstate), so they call the latest closure through a ref.
  const generateRef = useRef(generate);
  generateRef.current = generate;

  useEffect(() => {
    generateRef.current(
      initial.seed ?? DEFAULT_SEED,
      initial.size,
      {
        layer: initial.layer,
        at: initial.at,
        zoom: initial.zoom,
      },
      'replace',
    );
    const popstate = () => {
      const url = parseViewUrl(window.location.search, VIEWER_LAYER_IDS);
      if (!new URLSearchParams(window.location.search).has('next')) return;
      const next = { layer: url.layer, at: url.at, zoom: url.zoom };
      const seed = url.seed ?? DEFAULT_SEED;
      setSeedInput(seed);
      setSize(url.size);
      if (shown.current?.seed === seed && shown.current.size === url.size) setView(next);
      else generateRef.current(seed, url.size, next, 'replace');
    };
    window.addEventListener('popstate', popstate);
    return () => {
      window.removeEventListener('popstate', popstate);
      job.current?.cancel();
    };
  }, [initial]);

  // Layer, selection and zoom changes edit the current history entry.
  useEffect(() => {
    if (!progress) writeUrl('replace', view);
  }, [view]);

  const changeView = (change: ViewChange) => setView((v) => ({ ...v, ...change }));
  const copyLink = async () => {
    if (!shown.current) return;
    try {
      await navigator.clipboard.writeText(
        window.location.origin + buildViewUrl({ ...shown.current, ...view }),
      );
      setCopy('ok');
    } catch {
      setCopy('failed');
    }
    window.setTimeout(() => setCopy('idle'), COPIED_MS);
  };

  const run = (days: number) => {
    advance(world.current, SIM, days);
    setRevision((n) => n + 1);
  };

  const state = world.current;
  const recent = state.events.slice(-60).reverse();
  return (
    <main className="wm-root" data-revision={revision}>
      <h1>Story Generator — world map</h1>
      {CONTENT_PROBLEMS.length > 0 && (
        <pre role="alert" style={{ color: '#b00020' }}>
          {CONTENT_PROBLEMS.join('\n')}
        </pre>
      )}
      <div className="wm-app">
        <form
          className="bar"
          onSubmit={(event) => {
            event.preventDefault();
            generate(seedInput, size, { ...INITIAL_VIEW, layer: view.layer }, 'push');
          }}
        >
          <span className="brand">New world</span>
          <label>
            Seed{' '}
            <input
              value={seedInput}
              spellCheck={false}
              aria-invalid={seedError !== null}
              onChange={(event) => setSeedInput(event.target.value)}
            />
          </label>
          <label>
            Size{' '}
            <select
              value={size}
              onChange={(event) => setSize(Number(event.target.value) as WorldSize)}
            >
              <option value={256}>256 × 256</option>
              <option value={128}>128 × 128 (small)</option>
            </select>
          </label>
          <button type="submit" className="primary">
            Generate
          </button>
          <button type="button" onClick={() => void copyLink()}>
            {copy === 'ok' ? 'Link copied' : copy === 'failed' ? 'Copy failed' : 'Copy link'}
          </button>
          {seedError && (
            <p role="alert" className="field-error">
              {seedError}
            </p>
          )}
        </form>
        <div className="progress" aria-live="polite">
          <i style={{ width: progress ? `${progress.fraction * 100}%` : 0 }} />
          <span className="progress-label">{progress?.label ?? ''}</span>
        </div>
        <WorldMap
          cells={state.cells}
          regions={state.regions}
          routes={state.routes}
          sites={state.sites}
          civs={state.civs}
          cultures={DEFAULT_CONTENT.cultures}
          seed={state.seed}
          content={DEFAULT_CONTENT}
          layer={view.layer}
          at={view.at}
          zoom={view.zoom}
          busy={progress !== null}
          onView={changeView}
        />
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="wm-below">
        <section aria-label="Time controls" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => run(1)}>+1 day</button>
          <button onClick={() => run(28)}>+1 month</button>
          <button onClick={() => run(336)}>+1 year</button>
        </section>
        <p>
          <strong>{formatDate(state.day)}</strong> · weather: {state.weather.current} · events:{' '}
          {state.events.length}
        </p>
        <SavePanel
          world={state}
          onLoad={(loaded) => {
            job.current?.cancel();
            const loadedSize: WorldSize = loaded.params.width <= 128 ? 128 : 256;
            world.current = loaded;
            shown.current = { seed: loaded.seed, size: loadedSize };
            setSeedInput(loaded.seed);
            setSize(loadedSize);
            setProgress(null);
            setView((v) => ({ ...v, at: null, zoom: 0 }));
            setRevision((n) => n + 1);
          }}
        />
        <AptitudePreview seed={state.seed} />
        <h2 style={{ fontSize: 18 }}>Chronicle</h2>
        <ol style={{ paddingLeft: 20 }}>
          {recent.map((event) => (
            <li key={event.id}>{narrator.renderEvent(event)}</li>
          ))}
        </ol>
      </div>
    </main>
  );
}

/** Dev view of R-13: how magic aptitude falls out per race for 5,000 births. */
function AptitudePreview({ seed }: { seed: string }) {
  const rows = useMemo(
    () =>
      DEFAULT_CONTENT.races.map((race) => {
        // A preview stream outside world state: viewing never changes history.
        const rng = RngStream.detached(seed, `preview.${race.id}`);
        const counts: Record<TierId, number> = {
          none: 0,
          faint: 0,
          gifted: 0,
          strong: 0,
          exceptional: 0,
          legendary: 0,
        };
        for (let i = 0; i < 5000; i += 1) {
          counts[tierOfPower(rollAptitude({ race }, rng).magic.power)] += 1;
        }
        return { race, counts };
      }),
    [seed],
  );
  return (
    <details>
      <summary>Magic aptitude per 5,000 births</summary>
      <table>
        <thead>
          <tr>
            <th>Race</th>
            {BIRTH_TIER_IDS.map((id) => (
              <th key={id}>{id}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ race, counts }) => (
            <tr key={race.id}>
              <td>{race.name}</td>
              {BIRTH_TIER_IDS.map((id) => (
                <td key={id}>{counts[id]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** Named browser saves (M0.3). Loading replaces the world only after it validates. */
function SavePanel({ world, onLoad }: { world: WorldState; onLoad: (world: WorldState) => void }) {
  const [store, setStore] = useState<SaveStore | null>(null);
  const [persistent, setPersistent] = useState(true);
  const [saves, setSaves] = useState<SaveSummary[]>([]);
  const [name, setName] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void openSaveStore().then(async (opened) => {
      if (!active) return;
      setStore(opened.store);
      setPersistent(opened.persistent);
      setSaves(await opened.store.list());
    });
    return () => {
      active = false;
    };
  }, []);

  const attempt = async (action: () => Promise<string>) => {
    if (!store) return;
    try {
      setStatus(await action());
      setSaves(await store.list());
    } catch (problem) {
      setStatus((problem as Error).message);
    }
  };

  return (
    <section aria-label="Saves" style={{ margin: '12px 0' }}>
      <h2 style={{ fontSize: 18 }}>Saves</h2>
      {!persistent && <p>This browser is not keeping saves; they last until the page closes.</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label>
          Save name{' '}
          <input value={name} placeholder={world.seed} onChange={(e) => setName(e.target.value)} />
        </label>
        <button
          disabled={!store}
          onClick={() =>
            void attempt(async () => {
              const saved = await store!.save(name || world.seed, world);
              return `Saved "${saved.name}" at ${formatDate(saved.day)}.`;
            })
          }
        >
          Save
        </button>
      </div>
      {status && <p role="status">{status}</p>}
      <ul style={{ paddingLeft: 20 }}>
        {saves.map((save) => (
          <li key={save.name}>
            {save.name} · {save.seed} · {formatDate(save.day)}{' '}
            <button
              aria-label={`Load ${save.name}`}
              onClick={() =>
                void attempt(async () => {
                  onLoad(await store!.load(save.name));
                  return `Loaded "${save.name}".`;
                })
              }
            >
              Load
            </button>{' '}
            <button
              aria-label={`Delete ${save.name}`}
              onClick={() =>
                void attempt(async () => {
                  await store!.remove(save.name);
                  return `Deleted "${save.name}".`;
                })
              }
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
