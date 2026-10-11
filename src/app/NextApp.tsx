// Minimal shell for the new engine, served at `?next` until Milestone A
// (REBOOT_PLAN M3.13). It proves the through line: content → engine loop →
// events → narrator → UI. Phase 1 replaces the body with the world map.

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
  type Simulation,
  type TierId,
  type WorldState,
} from '../engine';
import { openSaveStore, type SaveStore, type SaveSummary } from '../platform/save-store';

const SIM: Simulation = { content: DEFAULT_CONTENT, systems: DEFAULT_SYSTEMS };
const CONTENT_PROBLEMS = validateContent(DEFAULT_CONTENT);

export function NextApp() {
  const [seed, setSeed] = useState('RIVERSIDE');
  const world = useRef<WorldState>(createWorld('RIVERSIDE'));
  const [, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const narrator = useMemo(
    () => templateNarrator(DEFAULT_CONTENT, (id) => world.current.people.get(id)?.name ?? `#${id}`),
    [],
  );

  const run = (days: number) => {
    advance(world.current, SIM, days);
    setRevision((n) => n + 1);
  };
  const regenerate = () => {
    try {
      world.current = createWorld(seed);
      setError(null);
      setRevision((n) => n + 1);
    } catch (problem) {
      setError((problem as Error).message);
    }
  };

  const state = world.current;
  const recent = state.events.slice(-60).reverse();
  return (
    <main
      style={{ fontFamily: 'system-ui, sans-serif', padding: 16, maxWidth: 900, margin: '0 auto' }}
    >
      <h1 style={{ fontSize: 22 }}>Story Generator — new engine (scaffold)</h1>
      {CONTENT_PROBLEMS.length > 0 && (
        <pre role="alert" style={{ color: '#b00020' }}>
          {CONTENT_PROBLEMS.join('\n')}
        </pre>
      )}
      <section aria-label="World controls" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label>
          Seed <input value={seed} onChange={(event) => setSeed(event.target.value)} />
        </label>
        <button onClick={regenerate}>New world</button>
        <button onClick={() => run(1)}>+1 day</button>
        <button onClick={() => run(28)}>+1 month</button>
        <button onClick={() => run(336)}>+1 year</button>
      </section>
      {error && <p role="alert">{error}</p>}
      <p>
        <strong>{formatDate(state.day)}</strong> · weather: {state.weather.current} · events:{' '}
        {state.events.length}
      </p>
      <SavePanel
        world={state}
        onLoad={(loaded) => {
          world.current = loaded;
          setSeed(loaded.seed);
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
