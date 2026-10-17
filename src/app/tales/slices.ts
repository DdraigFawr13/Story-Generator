// Runs a build that comes in slices (a generator that yields between stretches of work) in the
// page's free moments, so drawing the sharper map never holds the page still for long.

export interface SliceStats {
  /** Milliseconds of work, not counting the gaps. */
  work: number;
  /** The longest single run of work between gaps, in milliseconds. */
  longest: number;
  /** Runs of work. */
  runs: number;
}

/**
 * Steps `steps` a few slices at a time (about `budgetMs` of work), with a short gap between, and
 * calls `done` with its result. Returns a function that stops it.
 */
export function runSliced<T>(
  steps: Generator<void, T, void>,
  done: (value: T, stats: SliceStats) => void,
  { budgetMs = 12, gapMs = 6, delayMs = 0 } = {},
): () => void {
  const stats: SliceStats = { work: 0, longest: 0, runs: 0 };
  let timer = 0;
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    const start = performance.now();
    for (;;) {
      const r = steps.next();
      const now = performance.now();
      if (r.done) {
        stats.work += now - start;
        stats.longest = Math.max(stats.longest, now - start);
        stats.runs += 1;
        done(r.value, stats);
        return;
      }
      if (now - start >= budgetMs) break;
    }
    const spent = performance.now() - start;
    stats.work += spent;
    stats.longest = Math.max(stats.longest, spent);
    stats.runs += 1;
    timer = window.setTimeout(tick, gapMs);
  };
  timer = window.setTimeout(tick, delayMs);
  return () => {
    stopped = true;
    window.clearTimeout(timer);
  };
}
