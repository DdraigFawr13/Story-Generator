// Compares per-seed history metrics against a saved baseline (pure; no I/O).

const fmt = (v) => (v === undefined ? 'missing' : String(Math.round(v * 10) / 10));
const signed = (v) => (v === undefined ? '?' : `${v >= 0 ? '+' : ''}${fmt(v)}`);

/**
 * base and now map seed -> { metric: number }. A metric differs when |now - base| exceeds
 * max(abs, rel * |base|); a seed or metric present on one side only always counts as changed.
 */
export function diffBaseline(base, now, { abs = 1, rel = 0.1 } = {}) {
  const rows = [];
  const sums = new Map();
  const seeds = [...new Set([...Object.keys(base), ...Object.keys(now)])].sort();
  for (const seed of seeds) {
    const b = base[seed] ?? {};
    const n = now[seed] ?? {};
    const metrics = [...new Set([...Object.keys(b), ...Object.keys(n)])];
    for (const metric of metrics) {
      const bv = b[metric];
      const nv = n[metric];
      if (bv !== undefined && nv !== undefined) {
        const sum = sums.get(metric) ?? { base: 0, now: 0, count: 0 };
        sum.base += bv;
        sum.now += nv;
        sum.count += 1;
        sums.set(metric, sum);
      }
      const delta = bv !== undefined && nv !== undefined ? nv - bv : undefined;
      const moved = delta === undefined || Math.abs(delta) > Math.max(abs, rel * Math.abs(bv));
      if (moved) rows.push({ seed, metric, base: bv, now: nv, delta });
    }
  }
  const means = [...sums].map(([metric, s]) => ({
    metric,
    base: s.base / s.count,
    now: s.now / s.count,
    delta: (s.now - s.base) / s.count,
  }));
  return { rows, means, changed: rows.length };
}

export function formatDiff({ rows, means, changed }) {
  const lines = rows.map(
    (r) => `${r.seed} ${r.metric} ${fmt(r.base)} -> ${fmt(r.now)} (${signed(r.delta)})`,
  );
  for (const m of means) {
    lines.push(`mean ${m.metric} ${fmt(m.base)} -> ${fmt(m.now)} (${signed(m.delta)})`);
  }
  lines.push(
    changed ? `${changed} numbers changed beyond tolerance` : 'no change beyond tolerance',
  );
  return lines.join('\n');
}
