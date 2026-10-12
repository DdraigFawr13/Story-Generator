// The year slider under the map (M2.7): play/pause, a labelled range over the history years, and
// clickable tick marks for the events that shaped it (wars, razings, foundings, legends).

import { useEffect, useMemo, useRef, useState } from 'react';
import { DAYS_PER_YEAR, yearText, type SimEvent, type WorldState } from '../engine';

/** One year of history per step while playing, this many ms apart (divided by the speed). */
const PLAY_STEP_MS = 70;
/** "Fast" plays this many times quicker. */
const FAST_SPEED = 4;
/** A labelled tick every this many years; faint minor ticks mark the decade snapshots. */
const LABEL_EVERY = 50;
const DECADE = 10;
/** Ticks this close (as a fraction of the track) to an end open their tooltip inward. */
const TIP_EDGE = 0.15;
/** How long the title of the event that paused play stays in the year label. */
const ANNOUNCE_MS = 1500;
/** Event types that get a tick, with the colour class they use. */
const TICK_TYPES = new Set(['war_declared', 'site_razed', 'civ_founded', 'legend_risen']);
const KEY: [string, string][] = [
  ['war_declared', 'war'],
  ['site_razed', 'razed'],
  ['civ_founded', 'civ founded'],
  ['legend_risen', 'legend'],
];

/** The last history year the slider reaches. */
export function finalHistoryYear(world: WorldState): number {
  return Math.min(Math.floor(world.day / DAYS_PER_YEAR), world.params.historyYears);
}

interface Props {
  world: WorldState;
  titleOf: (event: SimEvent) => string;
  /** Changes when the event list does, so the ticks are rebuilt. */
  revision: number;
  year: number;
  /** The decade the borders are drawn from. */
  snapshotYear: number;
  /** Lines after the slider year fade while the year is locked. */
  locked: boolean;
  onLock: (locked: boolean) => void;
  onYear: (year: number) => void;
}

export function YearSlider({
  world,
  titleOf,
  revision,
  year,
  snapshotYear,
  locked,
  onLock,
  onYear,
}: Props) {
  const last = finalHistoryYear(world);
  const [playing, setPlaying] = useState(false);
  const [fast, setFast] = useState(false);
  const [announce, setAnnounce] = useState<string | null>(null);
  /** The value under the thumb while a change waits for the next animation frame. */
  const [pending, setPending] = useState<number | null>(null);
  const now = useRef(year);
  now.current = year;
  const frame = useRef(0);
  const target = useRef(0);

  const ticks = useMemo(
    () =>
      world.events
        .filter((event) => TICK_TYPES.has(event.type))
        .map((event) => ({
          id: event.id,
          type: event.type,
          year: Math.floor(event.day / DAYS_PER_YEAR),
          text: titleOf(event),
        }))
        .filter((tick) => tick.year <= last),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revision, last],
  );
  const tickTitles = useMemo(() => {
    const byYear = new Map<number, string>();
    for (const tick of ticks) if (!byYear.has(tick.year)) byYear.set(tick.year, tick.text);
    return byYear;
  }, [ticks]);

  /** Jump to a year; drags and key repeats are coalesced to one update per animation frame. */
  const jump = (to: number) => {
    const next = Math.max(0, Math.min(last, to));
    target.current = next;
    now.current = next;
    setPending(next);
    if (frame.current !== 0) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = 0;
      onYear(target.current);
      setPending(null);
    });
  };
  const toggle = () => {
    if (!playing && now.current >= last) onYear(0);
    setPlaying(!playing);
  };
  // The key handler is attached once; it calls the latest closures through this ref.
  const actions = useRef({ jump, toggle });
  actions.current = { jump, toggle };

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(
      () => {
        const next = Math.min(last, now.current + 1);
        now.current = next;
        onYear(next);
        const title = tickTitles.get(next);
        if (title !== undefined) {
          setPlaying(false);
          setAnnounce(title);
        } else if (next >= last) setPlaying(false);
      },
      PLAY_STEP_MS / (fast ? FAST_SPEED : 1),
    );
    return () => window.clearInterval(timer);
    // `onYear` is a state setter in the app; restarting on it would only reset the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, last, fast, tickTitles]);

  useEffect(() => {
    if (announce === null) return;
    const timer = window.setTimeout(() => setAnnounce(null), ANNOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [announce]);

  useEffect(() => {
    return () => window.cancelAnimationFrame(frame.current);
  }, []);

  // Space plays or pauses, arrows step a year (Shift: ten) while the map or the slider has focus.
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target_ = event.target as HTMLElement;
      if (!target_.matches?.('canvas.map, .lg-years input[type="range"]')) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const step = event.shiftKey ? DECADE : 1;
      if (event.key === ' ') actions.current.toggle();
      else if (event.key === 'ArrowLeft') actions.current.jump(now.current - step);
      else if (event.key === 'ArrowRight') actions.current.jump(now.current + step);
      else return;
      event.preventDefault();
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, []);

  const shown = pending ?? year;
  const labels: number[] = [];
  for (let y = 0; y <= last; y += LABEL_EVERY) labels.push(y);
  const minors: number[] = [];
  for (let y = 0; y <= last; y += DECADE) minors.push(y);
  const at = (y: number) => `${last > 0 ? (y / last) * 100 : 0}%`;

  return (
    <section className="lg-years" aria-label="Year slider">
      <div className="row">
        <button
          type="button"
          aria-label={playing ? 'Pause history' : 'Play history'}
          onClick={toggle}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <button
          type="button"
          className="speed"
          aria-pressed={fast}
          aria-label="Play speed"
          title="Play speed"
          onClick={() => setFast(!fast)}
        >
          {fast ? `${FAST_SPEED}×` : '1×'}
        </button>
        <div className="yr" data-testid="year-label">
          Year {yearText(shown)}
          {announce !== null ? (
            <small> · {announce}</small>
          ) : (
            snapshotYear !== shown && <small> (borders: {yearText(snapshotYear)})</small>
          )}
        </div>
        <label className="lock" title="Fade chronicle lines after this year">
          <input type="checkbox" checked={locked} onChange={(e) => onLock(e.target.checked)} />
          Lock year
        </label>
      </div>
      <div className="track">
        <input
          type="range"
          min={0}
          max={last}
          value={shown}
          aria-label="Year"
          onChange={(event) => jump(Number(event.target.value))}
        />
        <div className="ticks">
          {minors.map((y) => (
            <i key={`m${y}`} className="minor" style={{ left: at(y) }} aria-hidden="true" />
          ))}
          {ticks.map((tick) => (
            <button
              key={tick.id}
              type="button"
              className={`tick ${tick.type}${
                tick.year < last * TIP_EDGE
                  ? ' tip-l'
                  : tick.year > last * (1 - TIP_EDGE)
                    ? ' tip-r'
                    : ''
              }`}
              style={{ left: at(tick.year) }}
              aria-label={`Year ${yearText(tick.year)}: ${tick.text}`}
              onClick={() => jump(tick.year)}
            >
              <span className="tip" aria-hidden="true">
                {yearText(tick.year)} · {tick.text}
              </span>
            </button>
          ))}
        </div>
        <div className="labels" aria-hidden="true">
          {labels.map((y) => (
            <span key={`l${y}`} style={{ left: at(y) }}>
              {yearText(y)}
            </span>
          ))}
        </div>
      </div>
      <div className="key">
        {KEY.map(([type, label]) => (
          <span key={type}>
            <i className={`sw ${type}`} />
            {label}
          </span>
        ))}
      </div>
    </section>
  );
}
