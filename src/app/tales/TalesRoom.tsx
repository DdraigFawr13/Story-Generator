// The Tales room: the world's history playing on a storybook map. A rail picks the room, the map
// has five modes, and the history pauses to ask on the events the reader chose. The map is drawn
// by atlas.ts, the marks over it by markers.tsx; this file holds the clock, the controls and the
// pause card. It only shows what the history logged.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_CONTENT, PLAYBACK_EFFECTS, PLAYBACK_TAGS } from '../../content';
import type { Id, SimEvent, WorldState } from '../../engine';
import type { LegendCategory } from '../map-view';
import {
  buildPlayback,
  census,
  shortRealm,
  type PlaybackCiv,
  type PlaybackData,
  type PlaybackEvent,
} from '../playback/data';
import { RoomShell, type RoomId } from '../rooms/Rooms';
import { createAtlas, type Atlas, type MapMode, type Town } from './atlas';
import {
  RACE_FILL,
  assignHues,
  borderColour,
  fillColour,
  labelColour,
  touching,
  type Neighbours,
  type Rgb3,
} from './colours';
import { settleLabels } from './labels';
import { PHONE_MAX, cardSide, fitMap, nearestCell } from './layout';
import { Capitals, Marks, type Clock, type Recent } from './markers';
import { buildModel } from './model';
import {
  DEFAULT_PAUSES,
  FOLLOW_MIN_IMPORTANCE,
  PAUSE_KINDS,
  dotColour,
  kickerOf,
  pauseAllowed,
  pickPause,
  pausesLabel,
  type PauseKind,
} from './pauses';
import './fonts.css';
import './tales.css';

interface Props {
  world: WorldState;
  titleOf: (event: SimEvent) => string;
  /** The chronicle line of an event. */
  textOf: (event: SimEvent) => string;
  /** The year to play from. */
  startYear: number;
  /** Back to the normal map at a year. */
  onClose: (year: number) => void;
  /** Tales is at this whole year, following this person (for the address bar). */
  onView?: (year: number, follow: { id: Id; name: string } | null) => void;
  /** Open an event's page in Legends. */
  onOpenEvent: (id: Id) => void;
  /** Open the Legends pane, at a category when one is named (Book). */
  onLegends: (category?: LegendCategory) => void;
  /** Open the People room's index; `year` and `follow` say where Tales comes back to. */
  onPeople: (year: number, follow: { id: Id; name: string } | null) => void;
  /** Open a person's page; `year` and `follow` say where to come back to. */
  onOpenPerson: (id: Id, year: number, follow: { id: Id; name: string } | null) => void;
  /** A person to follow from the start (Follow on their page). */
  initialFollow?: { id: Id; name: string } | null | undefined;
}

/** Years a second the clock can run at. */
export const SPEEDS = [0.5, 1, 2, 4, 8, 15, 30, 60] as const;
export const DEFAULT_SPEED = 4;

const MODES: { id: MapMode; label: string }[] = [
  { id: 'land', label: 'Land' },
  { id: 'realms', label: 'Realms' },
  { id: 'peoples', label: 'Peoples' },
  { id: 'faiths', label: 'Faiths' },
  { id: 'plain', label: 'Plain' },
];
const AUTO_RESUME_MS = 8000;
const RECENT_MS = 2600;
/** Event tags show at this speed or slower. */
const TAG_SPEED = 8;
/** Events that draw a short tag as they play, at this importance or more. */
const TAG_MIN_IMPORTANCE = 6;

export function TalesRoom(props: Props) {
  // The log is read once per world; a new title function each render does not rebuild it.
  const data = useMemo(
    () => buildPlayback(props.world, props.titleOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.world],
  );
  useEffect(() => {
    if (!data) props.onClose(props.startYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  if (!data) return null;
  return <Room {...props} data={data} />;
}

/** One hue per realm for the whole history, and one per faith, from who touches whom. */
function buildPalette(world: WorldState, data: PlaybackData) {
  const cells = world.cells!;
  const skip = Uint8Array.from(cells.water, (v) => (v === 2 || v === 3 ? 1 : 0));
  const acc = { neighbours: new Map() as Neighbours, size: new Map<number, number>() };
  const seen = new Set<number>();
  const stride = Math.max(1, Math.round(data.last / 40));
  for (let y = 0; y <= data.last; y += stride) {
    const by = data.borderYear(y);
    if (seen.has(by)) continue;
    seen.add(by);
    touching(data.bordersAt(y), cells.width, cells.height, skip, acc);
  }
  if (!seen.has(data.borderYear(data.last))) {
    touching(data.bordersAt(data.last), cells.width, cells.height, skip, acc);
  }
  const civIds = data.civs.map((c) => c.id);
  const hue = assignHues(civIds, acc.neighbours, acc.size);
  const faithOf = (civ: number) => world.civs.get(civ)?.faithId;
  const faithLinks: Neighbours = new Map();
  const faithSize = new Map<number, number>();
  for (const id of civIds) {
    const f = faithOf(id);
    if (f !== undefined) faithSize.set(f, (faithSize.get(f) ?? 0) + (acc.size.get(id) ?? 0));
  }
  for (const [a, set] of acc.neighbours) {
    const fa = faithOf(a);
    if (fa === undefined) continue;
    for (const b of set) {
      const fb = faithOf(b);
      if (fb === undefined || fb === fa) continue;
      if (!faithLinks.has(fa)) faithLinks.set(fa, new Set());
      faithLinks.get(fa)!.add(fb);
    }
  }
  const faithHue = assignHues([...world.faiths.keys()], faithLinks, faithSize);
  return { hue, faithHue, faithOf };
}

function Room({
  world,
  data,
  textOf,
  startYear,
  onClose,
  onView,
  onOpenEvent,
  onLegends,
  onPeople,
  onOpenPerson,
  initialFollow,
}: Props & { data: PlaybackData }) {
  const palette = useMemo(() => buildPalette(world, data), [world, data]);
  const baseModel = useMemo(() => buildModel(world, data, DEFAULT_CONTENT), [world, data]);
  const eventById = useMemo(() => new Map(world.events.map((e) => [e.id, e])), [world]);
  const realmOf = useMemo(
    () => new Map([...world.civs.values()].map((c) => [c.id, c.raceId])),
    [world],
  );

  const [mode, setMode] = useState<MapMode>('land');
  const [kinds, setKinds] = useState<ReadonlySet<PauseKind>>(DEFAULT_PAUSES);
  const [chooser, setChooser] = useState(false);
  const [follow, setFollow] = useState<{ id: Id; name: string } | null>(initialFollow ?? null);
  const [speed, setSpeed] = useState<number>(DEFAULT_SPEED);
  const [playing, setPlaying] = useState(true);
  const [ended, setEnded] = useState(false);
  const [year, setYear] = useState(Math.floor(startYear));
  const [card, setCard] = useState<{ event: PlaybackEvent; key: number } | null>(null);
  const [recent, setRecent] = useState<(Recent & { until: number })[]>([]);
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [helpOpen, setHelpOpen] = useState(false);
  const [labels, setLabels] = useState<Map<number, { x: number; y: number; n: number }>>(new Map());

  const clock = useRef<Clock>({ t: startYear });
  const lastPause = useRef(-99);
  /** When the last card closed (ms), for the real-time gap between cards. */
  const closedAt = useRef<number | null>(null);
  const cardKey = useRef(0);
  const stageEl = useRef<HTMLDivElement>(null);
  const wrapEl = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const live = useRef({ kinds, follow, speed, mode });
  live.current = { kinds, follow, speed, mode };
  // The address bar follows the year and the person followed.
  useEffect(() => {
    onView?.(year, follow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, follow]);

  // Build the terrain once per world.
  useEffect(() => {
    const made = createAtlas(
      world.cells!,
      DEFAULT_CONTENT.biomes.map((b) => b.id),
    );
    setAtlas(made);
    return () => setAtlas(null);
  }, [world]);
  useEffect(() => {
    if (atlas && wrapEl.current) {
      atlas.canvas.className = 'tr-canvas';
      atlas.canvas.setAttribute('role', 'img');
      atlas.canvas.setAttribute('aria-label', "The world's history playing on the map");
      wrapEl.current.prepend(atlas.canvas);
      return () => atlas.canvas.remove();
    }
    return undefined;
  }, [atlas]);

  // The stage size, for fitting the map.
  useEffect(() => {
    const el = stageEl.current;
    if (!el) return undefined;
    const read = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    read();
    const watcher = new ResizeObserver(read);
    watcher.observe(el);
    return () => watcher.disconnect();
  }, []);

  // The political layer, redrawn only when the borders or the mode change.
  const borderKey = data.borderYear(year);
  useEffect(() => {
    if (!atlas) return;
    const sites = data.sitesAt(borderKey);
    const seats = new Set(data.seatsAt(borderKey).values());
    const towns: Town[] = [];
    for (const [id, s] of sites) {
      const site = data.sites.get(id);
      if (!site || s.ruined || s.pop <= 0) continue;
      towns.push({ cell: site.cell, pop: s.pop, capital: seats.has(id) });
    }
    const last = data.sitesAt(data.last);
    const holy: number[] = [];
    for (const faith of world.faiths.values()) {
      const site = faith.seatSiteId === undefined ? undefined : data.sites.get(faith.seatSiteId);
      if (site && !last.get(site.id)?.ruined) holy.push(site.cell);
    }
    const fillOf = (civ: number): Rgb3 | null => {
      if (mode === 'realms') return fillColour(palette.hue.get(civ) ?? 0);
      if (mode === 'peoples') return RACE_FILL[realmOf.get(civ) ?? ''] ?? null;
      if (mode === 'faiths') {
        const f = palette.faithOf(civ);
        const h = f === undefined ? undefined : palette.faithHue.get(f);
        return h === undefined ? null : fillColour(h);
      }
      return null;
    };
    const result = atlas.draw({
      mode,
      key: borderKey,
      owner: data.bordersAt(borderKey),
      fillOf,
      borderOf: (civ) => borderColour(palette.hue.get(civ) ?? 0),
      towns,
      holy,
    });
    setLabels(result.centres);
    stageEl.current?.setAttribute('data-terrain-ms', atlas.terrainMs.toFixed(0));
    stageEl.current?.setAttribute('data-draw-ms', result.ms.toFixed(0));
  }, [atlas, mode, borderKey, data, palette, realmOf, world]);

  /** Moves the playhead DOM; the heavy parts follow the year state. */
  const sync = () => {
    const t = clock.current.t;
    const pct = `${(Math.min(t, data.last) / Math.max(1, data.last)) * 100}%`;
    if (thumb.current) thumb.current.style.left = pct;
    if (fill.current) fill.current.style.width = pct;
    setYear(Math.floor(Math.min(t, data.last)));
  };

  // The clock: runs while playing, stops at a pause the reader asked for and at the present.
  useEffect(() => {
    if (!playing) return undefined;
    let raf = 0;
    let prev = performance.now();
    const step = (now: number) => {
      const dt = Math.max(0, Math.min(0.1, (now - prev) / 1000));
      prev = now;
      const { kinds: on, follow: who, speed: perSecond } = live.current;
      const c = clock.current;
      const next = c.t + dt * perSecond;
      const lo = Math.floor(c.t) + 1;
      const hi = Math.min(Math.floor(next), data.last);
      for (let y = lo; y <= hi; y += 1) {
        if (
          !pauseAllowed(y, lastPause.current, performance.now(), closedAt.current, who !== null)
        ) {
          continue;
        }
        const picked = pickPause(data.eventsByYear.get(y) ?? [], on, who?.id ?? null);
        if (picked) {
          c.t = picked.t;
          lastPause.current = picked.y;
          sync();
          cardKey.current += 1;
          setCard({ event: picked, key: cardKey.current });
          setPlaying(false);
          return;
        }
      }
      if (perSecond <= TAG_SPEED && hi >= lo) {
        const fresh: (Recent & { until: number })[] = [];
        for (let y = Math.max(lo, hi - 1); y <= hi; y += 1) {
          for (const e of data.eventsByYear.get(y) ?? []) {
            if (e.place === null || e.importance < TAG_MIN_IMPORTANCE) continue;
            if (!(e.type in PLAYBACK_TAGS)) continue;
            fresh.push({
              key: `ev:${e.id}`,
              type: e.type,
              place: e.place,
              data: e.data,
              until: performance.now() + RECENT_MS,
            });
          }
        }
        if (fresh.length) {
          setRecent((old) =>
            [...old.filter((r) => r.until > performance.now()), ...fresh].slice(-3),
          );
        }
      }
      if (next >= data.last) {
        c.t = data.last;
        sync();
        setPlaying(false);
        setEnded(true);
        return;
      }
      c.t = next;
      sync();
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // `sync` only reads refs and the stable data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, data]);

  // Recent tags expire on their own.
  useEffect(() => {
    if (!recent.length) return undefined;
    const next = Math.min(...recent.map((r) => r.until)) - performance.now();
    const timer = window.setTimeout(
      () => setRecent((old) => old.filter((r) => r.until > performance.now())),
      Math.max(30, next + 20),
    );
    return () => window.clearTimeout(timer);
  }, [recent]);

  // A pause plays on by itself.
  useEffect(() => {
    if (!card) return undefined;
    const timer = window.setTimeout(() => resume(), AUTO_RESUME_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card]);

  const resume = () => {
    closedAt.current = performance.now();
    setCard(null);
    setPlaying(true);
  };
  const seek = (to: number) => {
    clock.current.t = to;
    lastPause.current = to;
    setEnded(false);
    sync();
    if (card) {
      closedAt.current = performance.now();
      setCard(null);
      setPlaying(true);
    }
  };
  const toggle = () => {
    if (card) return resume();
    if (ended) return replay();
    setPlaying((p) => !p);
  };
  const replay = () => {
    clock.current.t = 0;
    lastPause.current = -99;
    closedAt.current = null;
    setEnded(false);
    sync();
    setPlaying(true);
  };
  const skip = () => {
    closedAt.current = performance.now();
    setCard(null);
    clock.current.t = data.last;
    sync();
    setPlaying(false);
    setEnded(true);
  };
  const togglePause = (kind: PauseKind) =>
    setKinds((old) => {
      const next = new Set(old);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  // Keep the map's text clear of itself: one collision pass after every render, and a few times a
  // second while things glide. Counts of named realms are left on the stage for the tests.
  useLayoutEffect(() => {
    settle();
  });
  useEffect(() => {
    const timer = window.setInterval(settle, 160);
    return () => window.clearInterval(timer);
  }, []);
  function settle() {
    const el = stageEl.current;
    if (!el) return;
    const report = settleLabels(el);
    if (el.dataset.realmsNamed !== String(report.named))
      el.dataset.realmsNamed = String(report.named);
    if (el.dataset.realmsTotal !== String(report.realms))
      el.dataset.realmsTotal = String(report.realms);
  }

  // ---- layout ------------------------------------------------------------------------------
  const layout = useMemo(() => {
    if (!atlas || !stage.w || !stage.h) return null;
    const S = atlas.scale;
    const { x0, y0, x1, y1 } = atlas.box;
    const fit = fitMap(
      stage,
      { x0: x0 * S, y0: y0 * S, w: (x1 - x0) * S, h: (y1 - y0) * S },
      atlas.size,
    );
    return { size: fit.size, left: fit.left, top: fit.top };
  }, [atlas, stage]);
  const W = atlas?.width ?? data.width;
  const H = atlas?.height ?? data.height;
  // A beast's mark stands on drawn land: its lair's cell, or the nearest cell that is.
  const model = useMemo(() => {
    if (!atlas) return baseModel;
    const ok = (c: number) => atlas.inland[c] === 1;
    return {
      ...baseModel,
      beasts: baseModel.beasts.map((b) => ({
        ...b,
        cell: nearestCell(b.cell, atlas.width, atlas.height, ok),
      })),
    };
  }, [baseModel, atlas]);
  const pct = (cell: number) => ({
    left: `${(((cell % W) + 0.5) / W) * 100}%`,
    top: `${((Math.floor(cell / W) + 0.5) / H) * 100}%`,
  });

  // Realm names in Realms mode, biggest first. Only a realm of under 14 cells goes unnamed; the
  // collision pass (labels.ts) picks the full or short name and a nudge for the rest.
  const realmLabels = useMemo(() => {
    if (mode !== 'realms') return [];
    const out: { civ: number; c: { x: number; y: number; n: number }; info: PlaybackCiv }[] = [];
    for (const [civ, c] of [...labels].sort((a, b) => b[1].n - a[1].n || a[0] - b[0])) {
      const info = data.civById.get(civ);
      if (info && c.n >= 14) out.push({ civ, c, info });
    }
    return out;
  }, [mode, labels, data]);
  const holySeats = useMemo(
    () =>
      new Set(
        [...world.faiths.values()].flatMap((f) =>
          f.seatSiteId === undefined ? [] : [f.seatSiteId],
        ),
      ),
    [world],
  );

  const now = useMemo(() => census(data, year), [data, year]);
  const ring = card?.event.place ?? null;
  const ringSide = useMemo((): 'left' | 'right' | 'mid' => {
    if (ring === null || !layout || !atlas) return 'left';
    const at = {
      x: layout.left + (((ring % W) + 0.5) / W) * layout.size,
      y: layout.top + ((Math.floor(ring / W) + 0.5) / H) * layout.size,
    };
    if (stage.w <= PHONE_MAX) return 'left';
    // Land share under a pixel rectangle of the stage, from the atlas's land mask.
    let total = 0;
    for (let i = 0; i < atlas.inland.length; i += 1) total += atlas.inland[i]!;
    const landUnder = (x0: number, y0: number, x1: number, y1: number) => {
      let n = 0;
      for (let i = 0; i < atlas.inland.length; i += 1) {
        if (!atlas.inland[i]) continue;
        const x = layout.left + (((i % W) + 0.5) / W) * layout.size;
        const y = layout.top + ((Math.floor(i / W) + 0.5) / H) * layout.size;
        if (x >= x0 && x < x1 && y >= y0 && y < y1) n += 1;
      }
      return total ? n / total : 0;
    };
    return cardSide(stage, landUnder, at);
  }, [ring, layout, atlas, stage, W, H]);
  const cardPerson = card
    ? card.event.actors.map((id) => world.people.get(id)).find((p) => p !== undefined)
    : undefined;
  const cardEvent = card ? eventById.get(card.event.id) : undefined;
  const effect = card ? PLAYBACK_EFFECTS[card.event.type] : undefined;
  const regions = useMemo(() => {
    const ranked = [...world.regions.values()]
      .filter((r) => ['range', 'desert', 'forest', 'island', 'sea'].includes(r.kind))
      .sort((a, b) => b.cells.length - a.cells.length);
    const seas = ranked.filter((r) => r.kind === 'sea').slice(0, 2);
    const land = ranked.filter((r) => r.kind !== 'sea').slice(0, 9);
    return [...seas, ...land];
  }, [world]);

  const ticks = useMemo(() => {
    const out: { key: number; year: number; colour: string; kind: string; title: string }[] = [];
    for (const e of data.events) {
      if (!kinds.size) break;
      const colour = dotColour(e.type, e.importance);
      const kind = colour && PAUSE_KINDS.find((k) => k.colour === colour);
      if (!colour || !kind || !kinds.has(kind.id)) continue;
      out.push({ key: e.id, year: e.y, colour, kind: kind.id, title: `Year ${e.y} · ${e.title}` });
    }
    return out;
  }, [data, kinds]);
  const lane = useMemo(
    () =>
      follow
        ? data.events
            .filter((e) => e.actors.includes(follow.id) && e.importance >= FOLLOW_MIN_IMPORTANCE)
            .map((e) => ({
              key: e.id,
              year: e.y,
              colour: dotColour(e.type, e.importance) ?? '#a0442c',
              title: `Year ${e.y} · ${e.title}`,
            }))
        : [],
    [data, follow],
  );
  const lastPct = (y: number) => `${(y / Math.max(1, data.last)) * 100}%`;
  /** The followed person's life on the ribbon: from birth (or the start) to death (or the present). */
  const laneSpan = useMemo(() => {
    const person = follow ? world.people.get(follow.id) : undefined;
    if (!person) return undefined;
    const from = Math.max(0, person.born);
    const to = Math.min(data.last, person.died ?? data.last);
    const total = Math.max(1, data.last);
    return {
      left: `${(from / total) * 100}%`,
      width: `${(Math.max(0, to - from) / total) * 100}%`,
    };
  }, [follow, world, data]);
  const present = useMemo(() => {
    const final = census(data, data.last);
    const count = (type: string) =>
      data.events.filter(
        (e) => e.type === type && e.importance >= (PLAYBACK_EFFECTS[type]?.minImportance ?? 0),
      ).length;
    return {
      final,
      rows: [
        ['realms founded', data.civs.length],
        ['wars', count('war_declared')],
        ['razed', count('site_razed')],
        ['legends', count('legend_risen')],
      ] as [string, number][],
    };
  }, [data]);

  const finish = () => onClose(ended ? data.last : Math.floor(clock.current.t));
  const openPerson = (id: Id) =>
    onOpenPerson(id, Math.floor(clock.current.t), follow ? { ...follow } : null);
  const onRoom = (room: RoomId) => {
    if (room === 'people') onPeople(Math.floor(clock.current.t), follow ? { ...follow } : null);
    else if (room === 'book') onLegends('event');
    else if (room === 'world' || room === 'town') finish();
  };

  return (
    <RoomShell
      current="tales"
      onRoom={onRoom}
      className="tr-root"
      data-testid="tales"
      data-mode={mode}
    >
      <div className="tr-main">
        <div className="tr-stage" ref={stageEl} data-testid="tales-stage">
          <div
            className="tr-map"
            ref={wrapEl}
            style={
              layout
                ? { width: layout.size, height: layout.size, left: layout.left, top: layout.top }
                : { visibility: 'hidden' }
            }
          >
            {mode === 'faiths' &&
              [...world.faiths.values()].map((f) => {
                const site = f.seatSiteId === undefined ? undefined : data.sites.get(f.seatSiteId);
                if (!site || data.sitesAt(data.last).get(site.id)?.ruined) return null;
                return (
                  <div key={`faith:${f.id}`} className="tr-cp faith" style={pct(site.cell)}>
                    <span data-lbl="faith">{f.name}</span>
                  </div>
                );
              })}
            {regions
              .filter((r) => mode !== 'realms' || r.kind === 'sea')
              .map((r) => (
                <div
                  key={`rg:${r.id}`}
                  className={`tr-rg${r.kind === 'sea' ? ' sea' : ''}`}
                  data-lbl="region"
                  style={pct(r.anchor)}
                >
                  {r.name}
                </div>
              ))}
            {mode === 'realms' &&
              realmLabels.map(({ civ, c, info }) => {
                const [r, g, b] = labelColour(palette.hue.get(civ) ?? 0);
                const short = shortRealm(info.name);
                return (
                  <div
                    key={`realm:${civ}`}
                    className="tr-rg realm"
                    data-lbl="realm"
                    data-form="full"
                    style={{
                      left: `${(c.x / W) * 100}%`,
                      top: `${(c.y / H) * 100}%`,
                      color: `rgb(${r},${g},${b})`,
                    }}
                  >
                    <span className="full">{info.name}</span>
                    {short !== info.name && <span className="short">{short}</span>}
                  </div>
                );
              })}
            {mode !== 'plain' && (
              <Capitals
                data={data}
                year={year}
                width={W}
                height={H}
                hidden={mode === 'realms'}
                only={mode === 'faiths' ? holySeats : null}
              />
            )}
            {mode !== 'plain' && (
              <Marks
                model={model}
                clock={clock}
                width={W}
                height={H}
                followId={follow?.id ?? null}
                recent={recent}
              />
            )}
            <div
              className={`tr-ring${card ? ' on' : ''}`}
              style={ring === null ? { opacity: 0 } : pct(ring)}
            />
          </div>
          <div className="tr-dim" data-on={card ? 'true' : 'false'} />
          <div className="tr-frame" aria-hidden="true">
            <i style={{ left: -9, top: -9 }} />
            <i style={{ right: -9, top: -9 }} />
            <i style={{ left: -9, bottom: -9 }} />
            <i style={{ right: -9, bottom: -9 }} />
          </div>

          {follow ? (
            <div className="tr-chip following">
              <b>
                Following{' '}
                <button type="button" className="tr-who" onClick={() => openPerson(follow.id)}>
                  {follow.name}
                </button>
              </b>
              <small>pauses only on their story</small>
              <button type="button" aria-label="Stop following" onClick={() => setFollow(null)}>
                ✕
              </button>
            </div>
          ) : (
            <div className="tr-chip">
              <button
                type="button"
                className="tr-chooser-btn"
                aria-expanded={chooser}
                onClick={() => setChooser((o) => !o)}
              >
                <small>Pauses on</small> <span>{pausesLabel(kinds)}</span> ▾
              </button>
              {chooser && (
                <div className="tr-chooser" role="group" aria-label="Pauses on">
                  {PAUSE_KINDS.map((k) => (
                    <label key={k.id}>
                      <input
                        type="checkbox"
                        checked={kinds.has(k.id)}
                        onChange={() => togglePause(k.id)}
                      />
                      <i style={{ background: k.colour }} />
                      {k.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="tr-modes" role="group" aria-label="Map mode">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={mode === m.id}
                onClick={() => setMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
          {mode === 'faiths' && (
            <p className="tr-note">Faiths are shown as they stood when history ended.</p>
          )}
          <div className={`tr-year${mode === 'faiths' ? ' lower' : ''}`}>
            <div data-testid="tales-year" aria-live="off">
              Year {year}
            </div>
            <small>
              {now.realms} realms · {now.people.toLocaleString('en-GB')} people
            </small>
          </div>

          <button
            type="button"
            className="tr-help"
            aria-label="Map key"
            aria-expanded={helpOpen}
            onClick={() => setHelpOpen((o) => !o)}
          >
            ?
          </button>
          <div
            className={`tr-key${helpOpen ? ' open' : ''}`}
            aria-hidden={helpOpen ? undefined : 'true'}
            data-hidden={card ? 'true' : 'false'}
            onClick={() => setHelpOpen(false)}
          >
            <div>
              <i className="town" />
              town
            </div>
            <div>
              <FlagKey />
              army
            </div>
            <div>
              <i className="capital" />
              capital
            </div>
            <div>
              <StarKey />
              great figure
            </div>
            <div>
              <i className="road" />
              road
            </div>
            <div>
              <BeastKey />
              great beast
            </div>
            <div>
              <i className="wild" />
              wild land
            </div>
            {mode === 'faiths' && (
              <div>
                <i className="holy" />
                holy city
              </div>
            )}
          </div>

          {card && (
            <section
              key={card.key}
              className={`tr-ask ${ringSide}`}
              role="dialog"
              aria-label="History paused"
              data-testid="tales-card"
            >
              <div className="k">
                Year {card.event.y} · {kickerOf(card.event.type, effect?.big ?? effect?.label)}
              </div>
              <h2>{card.event.title}</h2>
              <p>{cardEvent ? textOf(cardEvent) : ''}</p>
              <div className="acts">
                <button type="button" className="p" onClick={() => onOpenEvent(card.event.id)}>
                  Read the story
                </button>
                {cardPerson && (
                  <button type="button" onClick={() => openPerson(cardPerson.id)}>
                    Who is {cardPerson.name}?
                  </button>
                )}
                {cardPerson && follow?.id !== cardPerson.id && (
                  <button
                    type="button"
                    onClick={() => {
                      setFollow({ id: cardPerson.id, name: cardPerson.name });
                      resume();
                    }}
                  >
                    Follow {cardPerson.name}
                  </button>
                )}
                <button type="button" onClick={resume}>
                  Keep playing
                </button>
              </div>
              <div className="auto">
                Plays on by itself
                <i>
                  <b style={{ animationDuration: `${AUTO_RESUME_MS}ms` }} />
                </i>
              </div>
            </section>
          )}

          {ended && (
            <section className="tr-ask end" role="dialog" aria-label="The present day">
              <div className="k">Year {data.last} · the present day</div>
              <h2>
                {present.final.realms} realms, {present.final.settlements} settlements
              </h2>
              <p>
                {present.final.people.toLocaleString('en-GB')} people stand at the present day.{' '}
                {present.rows.map(([label, n]) => `${n} ${label}`).join(', ')}.
              </p>
              <div className="acts">
                <button type="button" className="p" onClick={finish}>
                  Explore the map
                </button>
                <button type="button" onClick={() => onLegends()}>
                  Open legends
                </button>
                <button type="button" onClick={replay}>
                  Replay
                </button>
              </div>
            </section>
          )}
        </div>

        <section
          className="tr-ribbon"
          aria-label="Time ribbon"
          data-hidden={card ? 'true' : 'false'}
        >
          <div className="tr-ctrl">
            <button
              type="button"
              className="pb"
              aria-label={playing ? 'Pause history' : 'Play history'}
              onClick={toggle}
            >
              {playing ? '❚❚' : '▶'}
            </button>
            <label className="pill">
              <select
                aria-label="Years a second"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
              >
                {SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {s === 0.5 ? '½' : s} {s === 1 ? 'year' : 'years'} a second
                  </option>
                ))}
              </select>
            </label>
            {!ended && (
              <button type="button" className="skip" onClick={skip}>
                Skip to the present
              </button>
            )}
          </div>
          <div className="tr-keyrow">
            {PAUSE_KINDS.filter((k) => kinds.has(k.id)).map((k) => (
              <span key={k.id}>
                <i style={{ background: k.colour }} />
                {k.label}
              </span>
            ))}
          </div>
          <div className="tr-track">
            <div className="tr-label" style={{ left: lastPct(year) }}>
              Year {year}
            </div>
            <div className="tr-line">
              <div className="tr-fill" ref={fill} style={{ width: lastPct(clock.current.t) }} />
              {ticks.map((tick) => (
                <i
                  key={tick.key}
                  data-kind={tick.kind}
                  style={{ left: lastPct(tick.year), background: tick.colour }}
                  title={tick.title}
                />
              ))}
              <div className="tr-thumb" ref={thumb} style={{ left: lastPct(clock.current.t) }} />
              <input
                type="range"
                min={0}
                max={data.last}
                step={1}
                value={year}
                aria-label="Year"
                onChange={(e) => seek(Number(e.target.value))}
              />
            </div>
            {follow && (
              <div className="tr-lane">
                <b>
                  <button
                    type="button"
                    className="tr-who"
                    style={
                      laneSpan && parseFloat(laneSpan.left) > 65
                        ? { right: 0 }
                        : { left: laneSpan?.left ?? 0 }
                    }
                    onClick={() => openPerson(follow.id)}
                  >
                    {follow.name}
                  </button>
                </b>
                <div className="track">
                  <div className="bar" style={laneSpan} />
                  {lane.map((tick) => (
                    <i
                      key={tick.key}
                      style={{ left: lastPct(tick.year), borderColor: tick.colour }}
                      title={tick.title}
                    />
                  ))}
                </div>
              </div>
            )}
            <div className="tr-axis" aria-hidden="true">
              {Array.from({ length: Math.floor(data.last / 50) + 1 }, (_, n) => n * 50).map((y) => (
                <span key={y} style={{ left: lastPct(y) }}>
                  {y}
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>
    </RoomShell>
  );
}

const FlagKey = () => (
  <svg width="12" height="14" viewBox="0 0 14 17" aria-hidden="true">
    <path d="M2 16V1" stroke="#2d2a25" strokeWidth="1.6" />
    <path d="M2 1.5h10l-3 3.3 3 3.3H2z" fill="#a0442c" />
  </svg>
);
const StarKey = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2l3 7 7 .6-5.3 4.7L18.2 22 12 18.2 5.8 22l1.5-7.7L2 9.6 9 9z" fill="#c99a18" />
  </svg>
);
const BeastKey = () => (
  <svg width="15" height="12" viewBox="0 0 34 26" aria-hidden="true">
    <path d="M2 24 L10 6 L16 17 L22 4 L32 24 Z" fill="#8c2f1f" />
  </svg>
);
