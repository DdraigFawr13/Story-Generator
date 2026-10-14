// The DOM layer over the Tales canvas: capital names, great beasts, great figures, armies on the
// road and short event tags. Positions are percentages of the map, so the layer scales with it.
// Things glide and fade; nothing pops, and at most three short tags show at once.

import { useEffect, useMemo, useState, type MutableRefObject } from 'react';
import { PLAYBACK_TAGS } from '../../content';
import type { PlaybackData } from '../playback/data';
import { shortRealm } from '../playback/data';
import { pointAlong } from './march';
import { MARCH_YEARS, STAY_YEARS, type Model } from './model';

export const MAX_TAGS = 3;
/** Armies drawn at once. */
const MAX_ARMIES = 4;

export interface Clock {
  /** History years, with the day as a fraction. */
  t: number;
}
/** An event that has just played, shown as a short tag for a few seconds. */
export interface Recent {
  key: string;
  type: string;
  place: number;
  data: Record<string, string | number | boolean>;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Keeps items that left the list for `ms`, flagged `leaving`, so they fade out instead of popping. */
export function useFading<T extends { key: string }>(
  items: readonly T[],
  ms = 600,
): (T & { leaving?: boolean; until?: number })[] {
  const [out, setOut] = useState<(T & { leaving?: boolean; until?: number })[]>([...items]);
  // A list rebuilt with the same contents (every year of play) sets no state: during long fast play
  // an update from this effect on every frame trips React's nested-update guard.
  const text = JSON.stringify(items);
  useEffect(() => {
    const now = performance.now();
    setOut((prev) => {
      const current = new Set(items.map((i) => i.key));
      const kept = prev
        .filter((p) => !current.has(p.key))
        .map((p) => ({ ...p, leaving: true, until: p.until ?? now + ms }))
        .filter((p) => p.until > now);
      return [...items, ...kept];
    });
    const timer = window.setTimeout(
      () => setOut((prev) => prev.filter((p) => !p.leaving || (p.until ?? 0) > performance.now())),
      ms + 40,
    );
    return () => window.clearTimeout(timer);
    // `text` stands for `items`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, ms]);
  return out;
}

/** Words for an event tag: "Battle at Ash"; falls back to the plain form when data is missing. */
export function tagText(type: string, data: Record<string, string | number | boolean>): string {
  const tag = PLAYBACK_TAGS[type];
  if (!tag) return '';
  let missing = false;
  const full = tag.text.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = String(data[key] ?? '');
    if (value === '') missing = true;
    return key === 'civ' ? shortRealm(value) : value;
  });
  return missing ? (tag.plain ?? '') : full;
}

export const StarIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2l3 7 7 .6-5.3 4.7L18.2 22 12 18.2 5.8 22l1.5-7.7L2 9.6 9 9z" fill="#c99a18" />
  </svg>
);
export const BeastIcon = () => (
  <svg width="17" height="13" viewBox="0 0 34 26" aria-hidden="true">
    <path d="M2 24 L10 6 L16 17 L22 4 L32 24 Z" fill="#8c2f1f" stroke="#5a1c12" strokeWidth="2" />
  </svg>
);
export const FlagIcon = () => (
  <svg width="14" height="17" viewBox="0 0 14 17" aria-hidden="true">
    <path d="M2 16V1" stroke="#2d2a25" strokeWidth="1.6" />
    <path d="M2 1.5h10l-3 3.3 3 3.3H2z" fill="#a0442c" stroke="#5a1c12" strokeWidth="1" />
  </svg>
);

interface Pos {
  x: number;
  y: number;
}

interface MarksProps {
  model: Model;
  clock: MutableRefObject<Clock>;
  width: number;
  height: number;
  followId: number | null;
  recent: readonly Recent[];
}

/** Beasts, figures, armies and tags; re-renders when the clock moves by a fiftieth of a year. */
export function Marks({ model, clock, width, height, followId, recent }: MarksProps) {
  const [t, setT] = useState(clock.current.t);
  useEffect(() => {
    let raf = 0;
    let shown = clock.current.t;
    const loop = () => {
      const q = Math.round(clock.current.t * 50) / 50;
      if (q !== shown) {
        shown = q;
        setT(q);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [clock]);

  const at = (cell: number): Pos => ({ x: cell % width, y: Math.floor(cell / width) });
  const css = (p: Pos) => ({
    left: `${((p.x + 0.5) / width) * 100}%`,
    top: `${((p.y + 0.5) / height) * 100}%`,
  });

  let budget = MAX_TAGS;
  const take = (want = true): boolean => {
    if (!want || budget <= 0) return false;
    budget -= 1;
    return true;
  };

  // Armies in a war: a flag walking the road, with a dotted trail behind it.
  const armies: {
    key: string;
    x: number;
    y: number;
    opacity: number;
    trail: Pos[];
    civ: string;
  }[] = [];
  for (const m of model.marches) {
    const start = m.at - MARCH_YEARS;
    if (t < start || t > m.at + STAY_YEARS) continue;
    const p = clamp01((t - start) / MARCH_YEARS);
    const here = pointAlong(m.path(), width, p);
    armies.push({
      key: m.key,
      x: here.x - 0.5,
      y: here.y - 0.5,
      opacity: Math.min(1, (t - start) / 0.08, (m.at + STAY_YEARS - t) / 0.1),
      trail: here.upTo.map(([x, y]) => ({ x, y })),
      civ: m.civ,
    });
  }
  armies.splice(0, Math.max(0, armies.length - MAX_ARMIES));

  const window_ = (from: number, to: number) =>
    clamp01((t - from) / 1.5) * clamp01((to + 0.8 - t) / 0.8);
  const figures = model.figures
    .map((f) => ({ f, opacity: window_(f.from, f.to) }))
    .filter((x) => x.opacity > 0.02);
  const beasts = model.beasts
    .map((b) => ({ b, opacity: window_(b.from, b.to) }))
    .filter((x) => x.opacity > 0.02);

  // Tag priority: the followed figure, armies, what just happened, then figures and beasts.
  const followed = new Set<number>();
  if (followId !== null && figures.some((x) => x.f.id === followId)) {
    if (take()) followed.add(followId);
  }
  const armyTag = new Set<string>();
  for (const a of [...armies].reverse()) if (take()) armyTag.add(a.key);
  const recentShown: Recent[] = [];
  for (const r of recent) if (take(tagText(r.type, r.data) !== '')) recentShown.push(r);
  const figureTag = new Set<number>();
  for (const x of figures)
    if (x.f.id !== followId && x.opacity > 0.6 && take()) figureTag.add(x.f.id);
  const beastTag = new Set<number>();
  for (const x of beasts) if (x.opacity > 0.6 && take()) beastTag.add(x.b.id);

  return (
    <>
      <svg
        className="tr-trails"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {armies.map((a) => (
          <polyline
            key={a.key}
            points={a.trail.map((p) => `${p.x},${p.y}`).join(' ')}
            style={{ opacity: a.opacity * 0.9 }}
          />
        ))}
      </svg>
      {beasts.map(({ b, opacity }) => (
        <div
          key={`beast:${b.id}`}
          className="tr-mk beast"
          style={{ ...css(at(b.cell)), opacity }}
          title={b.name}
          data-testid="mark-beast"
        >
          <BeastIcon />
          <span data-lbl="tag" className={beastTag.has(b.id) ? '' : 'off'}>
            {b.name}
          </span>
        </div>
      ))}
      {figures.map(({ f, opacity }) => (
        <div
          key={`fig:${f.id}`}
          className={`tr-mk great${f.id === followId ? ' f' : ''}`}
          style={{ ...css(at(f.cell)), opacity }}
          title={f.name}
          data-testid="mark-figure"
        >
          <StarIcon />
          <span data-lbl="tag" className={followed.has(f.id) || figureTag.has(f.id) ? '' : 'off'}>
            {f.name}
          </span>
        </div>
      ))}
      {armies.map((a) => (
        <div
          key={a.key}
          className="tr-mk army"
          style={{ ...css({ x: a.x, y: a.y }), opacity: a.opacity }}
          title={`The host of ${shortRealm(a.civ)}`}
          data-testid="mark-army"
        >
          <FlagIcon />
          <span data-lbl="tag" className={armyTag.has(a.key) ? '' : 'off'}>
            {shortRealm(a.civ)} host
          </span>
        </div>
      ))}
      {recentShown.map((r) => (
        <div key={r.key} className="tr-tag" data-lbl="tag" style={css(at(r.place))}>
          {tagText(r.type, r.data)}
        </div>
      ))}
    </>
  );
}

interface CapitalsProps {
  data: PlaybackData;
  year: number;
  width: number;
  height: number;
  /** A realm's own name is written across it instead (Realms mode). */
  hidden: boolean;
  /** Only these sites are named (Faiths mode: the holy cities); null names every capital. */
  only?: ReadonlySet<number> | null;
}

/** Capital names at the year shown; a capital that moves glides, a new or lost one fades. */
export function Capitals({ data, year, width, height, hidden, only }: CapitalsProps) {
  const items = useMemo(() => {
    const out: { key: string; name: string; cell: number }[] = [];
    if (hidden) return out;
    for (const [civ, siteId] of data.seatsAt(year)) {
      const site = data.sites.get(siteId);
      if (only && !only.has(siteId)) continue;
      if (site) out.push({ key: `cap:${civ}`, name: site.name, cell: site.cell });
    }
    return out;
  }, [data, year, hidden, only]);
  const shown = useFading(items, 500);
  return (
    <>
      {shown.map((c) => (
        <div
          key={c.key}
          className={`tr-cp${c.leaving ? ' leaving' : ''}`}
          style={{
            left: `${(((c.cell % width) + 0.5) / width) * 100}%`,
            top: `${((Math.floor(c.cell / width) + 0.5) / height) * 100}%`,
          }}
        >
          <span data-lbl="cap">{c.name}</span>
        </div>
      ))}
    </>
  );
}
