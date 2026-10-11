// Minimal shell for the new engine, served at `?next` until Milestone A
// (REBOOT_PLAN M3.13). It proves the through line: content → engine loop →
// events → narrator → UI. Phase 1 replaces the body with the world map.

import { useMemo, useRef, useState } from 'react';
import { DEFAULT_CONTENT } from '../content';
import {
  BIRTH_TIER_IDS,
  DEFAULT_SYSTEMS,
  RngStream,
  advance,
  createWorld,
  deriveStreamState,
  formatDate,
  rollAptitude,
  templateNarrator,
  tierOfPower,
  validateContent,
  type Simulation,
  type TierId,
  type WorldState,
} from '../engine';

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
        const rng = new RngStream(
          { preview: deriveStreamState(seed, `preview.${race.id}`) },
          'preview',
        );
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
