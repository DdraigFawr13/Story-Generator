// The year slider under the map (M2.7): play/pause, a labelled range over the history years, and
// tick marks for the events that shaped it (wars, razings, foundings, legends).

import { useEffect, useMemo, useRef, useState } from 'react';
import { DAYS_PER_YEAR, type Narrator, type WorldState } from '../engine';

/** One year of history per step while playing, this many ms apart. */
const PLAY_STEP_MS = 70;
/** A labelled tick every this many years. */
const LABEL_EVERY = 50;
/** Event types that get a tick, with the colour class they use. */
const TICK_TYPES = new Set(['war_declared', 'site_razed', 'civ_founded', 'legend_risen']);

/** The last history year the slider reaches. */
export function finalHistoryYear(world: WorldState): number {
  return Math.min(Math.floor(world.day / DAYS_PER_YEAR), world.params.historyYears);
}

interface Props {
  world: WorldState;
  narrator: Narrator;
  /** Changes when the event list does, so the ticks are rebuilt. */
  revision: number;
  year: number;
  /** The decade the borders are drawn from. */
  snapshotYear: number;
  onYear: (year: number) => void;
}

export function YearSlider({ world, narrator, revision, year, snapshotYear, onYear }: Props) {
  const last = finalHistoryYear(world);
  const [playing, setPlaying] = useState(false);
  const now = useRef(year);
  now.current = year;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const next = Math.min(last, now.current + 1);
      now.current = next;
      onYear(next);
      if (next >= last) setPlaying(false);
    }, PLAY_STEP_MS);
    return () => window.clearInterval(timer);
    // `onYear` is a state setter in the app; restarting on it would only reset the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, last]);

  const ticks = useMemo(
    () =>
      world.events
        .filter((event) => TICK_TYPES.has(event.type))
        .map((event) => ({
          id: event.id,
          type: event.type,
          year: Math.floor(event.day / DAYS_PER_YEAR),
          text: narrator.renderEvent(event),
        }))
        .filter((tick) => tick.year <= last),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revision, narrator, last],
  );
  const labels: number[] = [];
  for (let y = 0; y <= last; y += LABEL_EVERY) labels.push(y);
  const at = (y: number) => `${last > 0 ? (y / last) * 100 : 0}%`;

  return (
    <section className="lg-years" aria-label="Year slider">
      <div className="row">
        <button
          type="button"
          aria-label={playing ? 'Pause history' : 'Play history'}
          onClick={() => {
            if (!playing && year >= last) onYear(0);
            setPlaying(!playing);
          }}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <div className="yr" data-testid="year-label">
          Year {year}
          {snapshotYear !== year && <small> borders as of {snapshotYear}</small>}
        </div>
        <input
          type="range"
          min={0}
          max={last}
          value={year}
          aria-label="Year"
          onChange={(event) => onYear(Number(event.target.value))}
        />
      </div>
      <div className="ticks" aria-hidden="true">
        {labels.map((y) => (
          <span key={`l${y}`} className="tickl" style={{ left: at(y) }}>
            {y}
          </span>
        ))}
        {ticks.map((tick) => (
          <span
            key={tick.id}
            className={`tick ${tick.type}`}
            title={tick.text}
            style={{ left: at(tick.year) }}
          />
        ))}
      </div>
      <div className="key">
        <span>
          <i className="sw war_declared" />
          war
        </span>
        <span>
          <i className="sw site_razed" />
          razed
        </span>
        <span>
          <i className="sw civ_founded" />
          people founded
        </span>
        <span>
          <i className="sw legend_risen" />
          legend
        </span>
      </div>
    </section>
  );
}
