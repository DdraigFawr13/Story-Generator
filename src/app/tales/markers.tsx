// The DOM layer over the Tales canvas: capital names, great beasts, great figures, the hosts of a
// war, settlers on the road and short event tags. Positions are percentages of the map, so the layer scales with it.
// Things glide and fade; nothing pops, and at most three short tags show at once.

import { useEffect, useMemo, useState, type CSSProperties, type MutableRefObject } from 'react';
import { PLAYBACK_TAGS } from '../../content';
import type { PlaybackData } from '../playback/data';
import { shortRealm } from '../playback/data';
import { FADE_YEARS, hostAt, pickGroups, settlersAt } from './hosts';
import type { Model } from './model';

export const MAX_TAGS = 3;
/** Colour of a flag with no realm colour. */
const FLAG_FILL = '#a0442c';
/** Hosts closer than this many cells stand apart, up to this many pixels each side. */
const MEET_CELLS = 1.5;
const MEET_NUDGE_PX = 8;
/** On a phone's small map the flags stand further apart, clear of the swords. */
const MEET_NUDGE_SMALL_PX = 11;
/** A host standing between marches is drawn a little fainter. */
const RESTING_OPACITY = 0.65;

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
export const FlagIcon = ({ colour = FLAG_FILL }: { colour?: string }) => (
  <svg width="14" height="17" viewBox="0 0 14 17" aria-hidden="true">
    <path d="M2 16V1" stroke="#2d2a25" strokeWidth="1.6" />
    <path d="M2 1.5h10l-3 3.3 3 3.3H2z" fill={colour} stroke="#3a1a10" strokeWidth="1" />
  </svg>
);
/** Crossed swords: two hosts meeting at a field. */
export const SwordsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 4l14 15M19 4L5 19" stroke="#2d2a25" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M4 17l4 4M20 17l-4 4" stroke="#2d2a25" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);
/** A small covered wagon: settlers on the road. */
export const SettlersIcon = () => (
  <svg width="17" height="13" viewBox="0 0 26 20" aria-hidden="true">
    <path d="M3 13Q3 3 12 3t9 10z" fill="#c9b48a" stroke="#3a2f1c" strokeWidth="1.8" />
    <path d="M2 13h20" stroke="#3a2f1c" strokeWidth="2" />
    <circle cx="8" cy="16" r="2.6" fill="#6b5a3a" stroke="#3a2f1c" strokeWidth="1.4" />
    <circle cx="18" cy="16" r="2.6" fill="#6b5a3a" stroke="#3a2f1c" strokeWidth="1.4" />
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
  /** A flag's fill (CSS colour) for the realm of that name; `alt` is a lighter shade of it. */
  flagColour: (civName: string, alt?: boolean) => string;
  /** Tags at once (3 by default; phones show 1). */
  maxTags?: number;
  /** A phone-sized map. */
  small?: boolean;
}

/** Beasts, figures, armies and tags; re-renders when the clock moves by a fiftieth of a year. */
export function Marks({
  model,
  clock,
  width,
  height,
  followId,
  recent,
  flagColour,
  maxTags = MAX_TAGS,
  small = false,
}: MarksProps) {
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

  let budget = maxTags;
  const take = (want = true): boolean => {
    if (!want || budget <= 0) return false;
    budget -= 1;
    return true;
  };

  // Moving parties, at most three at once: the hosts of up to two wars (a flag a side, crossed swords
  // where they meet), then a band of settlers. Each walks the road with a dotted trail behind.
  // At the last year nothing walks: the closing card never sits over frozen flags.
  const picked =
    t >= model.last ? { wars: [], settlers: [] } : pickGroups(model.wars, model.settlers, t);
  const cellPos = (p: Pos): Pos => ({ x: p.x - 0.5, y: p.y - 0.5 });
  const hosts: {
    key: string;
    x: number;
    y: number;
    opacity: number;
    moving: boolean;
    trail: Pos[];
    civ: string;
    colour: string;
    /** The war's key. */
    war: string;
    /** Pixels sideways, apart from the other host on the same field. */
    nudge: number;
  }[] = [];
  const swords: { key: string; war: string; cell: number; opacity: number; site: string }[] = [];
  for (const war of picked.wars) {
    const poses = war.hosts.map((h) => hostAt(h, t, width));
    // Two hosts closing on one field stand a few pixels apart, so both flags show above the swords.
    const [pa, pb] = poses;
    const near = pa && pb ? clamp01(1 - Math.hypot(pa.x - pb.x, pa.y - pb.y) / MEET_CELLS) : 0;
    // A war that waited for a slot fades in rather than appearing mid-march.
    const entry = war.shownFrom > war.appear ? clamp01((t - war.shownFrom) / FADE_YEARS) : 1;
    // Two realms with the same colour: the second flag takes a lighter shade of it.
    const same =
      war.hosts.length > 1 && flagColour(war.hosts[0]!.civ) === flagColour(war.hosts[1]!.civ);
    war.hosts.forEach((h, i) => {
      const pose = poses[i];
      if (!pose) return;
      hosts.push({
        key: h.key,
        ...cellPos(pose),
        opacity: entry * pose.opacity * (pose.moving ? 1 : RESTING_OPACITY),
        moving: pose.moving,
        trail: pose.moving ? pose.trail : [],
        civ: h.civ,
        colour: flagColour(h.civ, same && i === 1),
        war: war.key,
        nudge: (i === 0 ? -1 : 1) * (small ? MEET_NUDGE_SMALL_PX : MEET_NUDGE_PX) * near,
      });
    });
    const meet = war.battles.find((b) => t >= b.t && t <= b.t + b.stay);
    if (meet && poses.some((p) => p)) {
      const opacity = clamp01(Math.min((t - meet.t) / 0.05, (meet.t + meet.stay - t) / 0.05));
      swords.push({
        key: `${war.key}:swords`,
        war: war.key,
        cell: meet.cell,
        opacity: entry * opacity,
        site: meet.site,
      });
    }
  }
  const bands: {
    key: string;
    x: number;
    y: number;
    opacity: number;
    trail: Pos[];
    from: string;
  }[] = [];
  for (const s of picked.settlers) {
    const pose = settlersAt(s, t, width);
    if (!pose) continue;
    bands.push({
      key: s.key,
      ...cellPos(pose),
      opacity: pose.opacity,
      trail: pose.trail,
      from: s.fromName,
    });
  }

  const window_ = (from: number, to: number) =>
    clamp01((t - from) / 1.5) * clamp01((to + 0.8 - t) / 0.8);
  const figures = model.figures
    .map((f) => ({ f, opacity: window_(f.from, f.to) }))
    .filter((x) => x.opacity > 0.02);
  const beasts = model.beasts
    .map((b) => ({ b, opacity: window_(b.from, b.to) }))
    .filter((x) => x.opacity > 0.02);

  // Tag priority: the followed figure, moving parties, what just happened, then figures and beasts.
  const followed = new Set<number>();
  if (followId !== null && figures.some((x) => x.f.id === followId)) {
    if (take()) followed.add(followId);
  }
  const partyTag = new Set<string>();
  // One tag a war, so a band of settlers keeps a tag too: the meeting's, else a marching host's.
  const warTagged = new Set<string>();
  for (const w of swords) {
    if (!take()) continue;
    partyTag.add(w.key);
    warTagged.add(w.war);
  }
  for (const h of hosts) {
    if (!h.moving || warTagged.has(h.war) || !take()) continue;
    partyTag.add(h.key);
    warTagged.add(h.war);
  }
  for (const b of bands) if (take()) partyTag.add(b.key);
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
        {hosts
          .filter((h) => h.moving)
          .map((h) => (
            <polyline
              key={h.key}
              points={h.trail.map((p) => `${p.x},${p.y}`).join(' ')}
              style={{ opacity: h.opacity * 0.9 }}
            />
          ))}
        {bands.map((b) => (
          <polyline
            key={b.key}
            className="settlers"
            points={b.trail.map((p) => `${p.x},${p.y}`).join(' ')}
            style={{ opacity: b.opacity * 0.9 }}
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
      {hosts.map((h) => (
        <div
          key={h.key}
          className="tr-mk army"
          style={
            {
              ...css({ x: h.x, y: h.y }),
              opacity: h.opacity,
              '--nx': `${h.nudge.toFixed(1)}px`,
            } as CSSProperties
          }
          title={`The host of ${shortRealm(h.civ)}`}
          data-testid="mark-army"
        >
          <FlagIcon colour={h.colour} />
          <span data-lbl="tag" className={partyTag.has(h.key) ? '' : 'off'}>
            {shortRealm(h.civ)} host
          </span>
        </div>
      ))}
      {swords.map((w) => (
        <div
          key={w.key}
          className="tr-mk meet"
          style={{ ...css(at(w.cell)), opacity: w.opacity }}
          title={tagText('battle', { site: w.site })}
          data-testid="mark-battle"
        >
          <SwordsIcon />
          <span data-lbl="tag" className={partyTag.has(w.key) ? '' : 'off'}>
            {tagText('battle', { site: w.site })}
          </span>
        </div>
      ))}
      {bands.map((b) => (
        <div
          key={b.key}
          className="tr-mk settlers"
          style={{ ...css({ x: b.x, y: b.y }), opacity: b.opacity }}
          title={`Settlers from ${b.from}`}
          data-testid="mark-settlers"
        >
          <SettlersIcon />
          <span data-lbl="tag" className={partyTag.has(b.key) ? '' : 'off'}>
            Settlers from {b.from}
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
