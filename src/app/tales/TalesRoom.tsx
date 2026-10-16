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
import { TINT, createAtlas, type Atlas, type MapMode, type Town } from './atlas';
import {
  assignHues,
  assignRaceHues,
  borderColour,
  fillColour,
  labelColour,
  touching,
  type Neighbours,
  type Rgb3,
} from './colours';
import {
  CARD_ROWS,
  TOWN_NAMES_ZOOM,
  ZOOM_MAX,
  centreOn,
  clampView,
  groupMarks,
  zoomAt,
  type View,
} from './explore';
import { ExploreMarks, Towns, type TownMark } from './exploreMarks';
import { settleLabels } from './labels';
import { PHONE_MAX, cardSide, fitMap, nearestCell } from './layout';
import { Capitals, MAX_TAGS, Marks, type Clock, type Recent } from './markers';
import { buildModel } from './model';
import {
  DEFAULT_PAUSES,
  DEFAULT_SHOWN,
  FOLLOW_MIN_IMPORTANCE,
  PAUSE_KINDS,
  dotColour,
  kickerOf,
  pauseAllowed,
  pauseKindOf,
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
  /** Open the story of an event (its chapter in the Book). */
  onOpenEvent: (id: Id) => void;
  /** Open the Book room; `year` and `follow` say where Tales comes back to. */
  onBook: (year: number, follow: { id: Id; name: string } | null) => void;
  /** Deprecated: the end card no longer opens the Legends pane. */
  onLegends?: (category?: LegendCategory) => void;
  /** Open the People room's index; `year` and `follow` say where Tales comes back to. */
  onPeople: (year: number, follow: { id: Id; name: string } | null) => void;
  /** Open the Town room (the last town watched, else the picker); Tales comes back to `year`. */
  onTown: (year: number, follow: { id: Id; name: string } | null) => void;
  /** Open a person's page; `year` and `follow` say where to come back to. */
  onOpenPerson: (id: Id, year: number, follow: { id: Id; name: string } | null) => void;
  /** A person to follow from the start (Follow on their page). */
  initialFollow?: { id: Id; name: string } | null | undefined;
  /**
   * Open in the explore state at this year, not playing; with a cell, zoomed on it and ringed
   * ("show on map", the rail's World item).
   */
  explore?: { year: number; cell: number | null } | null;
  /** Watch a town day by day (offered at the present only). */
  onWatch?: (siteId: Id) => void;
  /** Open a town's records. */
  onRecords?: (siteId: Id) => void;
}

/** What the open place card is about: the events at a cell, or a town (and its events). */
type Pin =
  | { kind: 'events'; cell: number; side: 'left' | 'right' | 'mid' }
  | {
      kind: 'town';
      cell: number;
      site: Id;
      side: 'left' | 'right' | 'mid';
    };

/** Years a second the clock can run at. */
export const SPEEDS = [0.5, 1, 2, 4, 8, 15, 30, 60] as const;
export const DEFAULT_SPEED = 4;

const MODES: { id: MapMode; label: string }[] = [
  { id: 'realms', label: 'Realms' },
  { id: 'land', label: 'Land' },
  { id: 'peoples', label: 'Peoples' },
  { id: 'faiths', label: 'Faiths' },
  { id: 'plain', label: 'Plain' },
];
const AUTO_RESUME_MS = 8000;
/** The sharper terrain is at most this many pixels a side. */
const SHARP_PX = 2048;
const RECENT_MS = 2600;
/** Event tags show at this speed or slower. */
const TAG_SPEED = 8;
/** Events that draw a short tag as they play, at this importance or more. */
const TAG_MIN_IMPORTANCE = 6;
/** Rows of realms, peoples or faiths the map key lists before "and N more". */
const KEY_ROWS = 4;
/** A biome joins the Land key when it covers this share of the land. */
const KEY_BIOME_SHARE = 0.03;

/** Worlds whose history has played to the present once: later plays pause to ask. */
const playedThrough = new WeakSet<WorldState>();
/** The event filter outlives a visit to another room and a reload (per browser tab). */
const FILTER_KEY = 'tales-events';

function readFilter(): { shown: Set<PauseKind>; paused: Set<PauseKind> } | null {
  try {
    const raw = window.sessionStorage.getItem(FILTER_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { shown?: unknown; paused?: unknown };
    const ids = new Set<string>(PAUSE_KINDS.map((k) => k.id));
    const pick = (v: unknown) =>
      new Set((Array.isArray(v) ? v : []).filter((k): k is PauseKind => ids.has(String(k))));
    return { shown: pick(saved.shown), paused: pick(saved.paused) };
  } catch {
    return null;
  }
}

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
  const raceHue = assignRaceHues(acc.neighbours, acc.size, (civ) => world.civs.get(civ)?.raceId);
  return { hue, faithHue, faithOf, raceHue };
}

function Room({
  world,
  data,
  textOf,
  startYear,
  onView,
  onOpenEvent,
  onPeople,
  onTown,
  onBook,
  onOpenPerson,
  initialFollow,
  explore,
  onWatch,
  onRecords,
}: Props & { data: PlaybackData }) {
  const palette = useMemo(() => buildPalette(world, data), [world, data]);
  const baseModel = useMemo(() => buildModel(world, data, DEFAULT_CONTENT), [world, data]);
  const eventById = useMemo(() => new Map(world.events.map((e) => [e.id, e])), [world]);
  const realmOf = useMemo(
    () => new Map([...world.civs.values()].map((c) => [c.id, c.raceId])),
    [world],
  );

  const [mode, setMode] = useState<MapMode>('realms');
  const [kinds, setKinds] = useState<ReadonlySet<PauseKind>>(
    () => readFilter()?.paused ?? DEFAULT_PAUSES,
  );
  const [shown, setShown] = useState<ReadonlySet<PauseKind>>(
    () => readFilter()?.shown ?? DEFAULT_SHOWN,
  );
  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        FILTER_KEY,
        JSON.stringify({ shown: [...shown], paused: [...kinds] }),
      );
    } catch {
      // Storage may be off; the filter then lasts for this visit only.
    }
  }, [shown, kinds]);
  // The first play of a world runs to the present without stopping; later plays pause to ask.
  const [firstRun, setFirstRun] = useState(() => !playedThrough.has(world));
  const [chooser, setChooser] = useState(false);
  const [follow, setFollow] = useState<{ id: Id; name: string } | null>(initialFollow ?? null);
  const [speed, setSpeed] = useState<number>(DEFAULT_SPEED);
  const [playing, setPlaying] = useState(!explore);
  const [ended, setEnded] = useState(false);
  // Explore: the finished map, zoomable, with marks for the events. Playing never zooms.
  const [exploring, setExploring] = useState(() => !!explore);
  const [zoom, setZoom] = useState<View | null>(null);
  const [glide, setGlide] = useState(false);
  const [pin, setPin] = useState<Pin | null>(null);
  const [focus, setFocus] = useState<number | null>(explore?.cell ?? null);
  const pendingFocus = useRef<number | null>(explore?.cell ?? null);
  const [year, setYear] = useState(Math.floor(explore?.year ?? startYear));
  const [card, setCard] = useState<{ event: PlaybackEvent; key: number } | null>(null);
  const [recent, setRecent] = useState<(Recent & { until: number })[]>([]);
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [helpOpen, setHelpOpen] = useState(false);
  const [labels, setLabels] = useState<Map<number, { x: number; y: number; n: number }>>(new Map());

  const clock = useRef<Clock>({ t: explore?.year ?? startYear });
  const lastPause = useRef(-99);
  /** When the last card closed (ms), for the real-time gap between cards. */
  const closedAt = useRef<number | null>(null);
  const cardKey = useRef(0);
  const stageEl = useRef<HTMLDivElement>(null);
  const wrapEl = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  /** Kinds that stop the playback: switched on to pause, and shown. */
  const pausing = useMemo(
    () => (firstRun ? new Set<PauseKind>() : new Set([...kinds].filter((k) => shown.has(k)))),
    [firstRun, kinds, shown],
  );
  const live = useRef({ kinds: pausing, shown, follow, speed, mode, firstRun });
  live.current = { kinds: pausing, shown, follow, speed, mode, firstRun };
  useEffect(() => {
    if (!ended) return;
    playedThrough.add(world);
    setFirstRun(false);
  }, [ended, world]);
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
      if (mode === 'peoples') {
        const h = palette.raceHue.get(realmOf.get(civ) ?? '');
        return h === undefined ? null : fillColour(h);
      }
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
      const {
        kinds: on,
        shown: seen,
        follow: who,
        speed: perSecond,
        firstRun: first,
      } = live.current;
      const c = clock.current;
      const next = c.t + dt * perSecond;
      const lo = Math.floor(c.t) + 1;
      const hi = Math.min(Math.floor(next), data.last);
      // The first play never stops, not even for a followed person.
      for (let y = lo; !first && y <= hi; y += 1) {
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
            const kind = pauseKindOf(e.type, e.importance);
            if (!kind || !seen.has(kind)) continue;
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
    if (exploring) {
      // Play on from the year shown (from the start when that is the present).
      leaveExplore();
      if (clock.current.t >= data.last) return replay();
      lastPause.current = Math.floor(clock.current.t);
      closedAt.current = null;
      setEnded(false);
      setPlaying(true);
      return undefined;
    }
    if (ended) return replay();
    setPlaying((p) => !p);
    return undefined;
  };
  const leaveExplore = () => {
    setExploring(false);
    setZoom(null);
    setGlide(false);
    setPin(null);
    setFocus(null);
    pendingFocus.current = null;
  };
  /** The finished map at the present: borders, towns and marks, free to zoom. */
  const startExplore = () => {
    closedAt.current = performance.now();
    setCard(null);
    clock.current.t = data.last;
    sync();
    setPlaying(false);
    setEnded(true);
    setExploring(true);
  };
  const replay = () => {
    leaveExplore();
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
  const flip = (old: ReadonlySet<PauseKind>, kind: PauseKind) => {
    const next = new Set(old);
    if (next.has(kind)) next.delete(kind);
    else next.add(kind);
    return next;
  };
  const togglePause = (kind: PauseKind) => setKinds((old) => flip(old, kind));
  const toggleShown = (kind: PauseKind) => setShown((old) => flip(old, kind));

  // Keep the map's text clear of itself: one collision pass after every render, and a few times a
  // second while things glide. Counts of named realms are left on the stage for the tests.
  useLayoutEffect(() => {
    settle();
    // The zoom buttons sit above the key, whatever height it has.
    const key = stageEl.current?.querySelector<HTMLElement>('.tr-key');
    stageEl.current?.style.setProperty('--tr-key-h', `${key?.offsetHeight ?? 0}px`);
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
  /** The land's box as fractions of the atlas, and the stage rows kept clear on a phone. */
  const land = useMemo(
    () =>
      atlas
        ? {
            x0: atlas.box.x0 / atlas.width,
            y0: atlas.box.y0 / atlas.height,
            x1: atlas.box.x1 / atlas.width,
            y1: atlas.box.y1 / atlas.height,
          }
        : null,
    [atlas],
  );
  const reserve = stage.w <= PHONE_MAX ? { top: 52, bottom: 52 } : { top: 0, bottom: 0 };
  // Where the map sits: the whole-map fit, or the zoomed view kept on the stage (explore only).
  const view = useMemo(() => {
    if (!layout) return null;
    const whole = { z: 1, left: layout.left, top: layout.top, size: layout.size };
    if (!exploring || !zoom || zoom.z <= 1.001 || !land) return whole;
    const c = clampView(zoom, layout.size, stage, land, reserve);
    return { ...c, size: layout.size * c.z };
    // `reserve` follows the stage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, exploring, zoom, land, stage]);
  const geo = useRef({ layout, view, stage, land, reserve });
  geo.current = { layout, view, stage, land, reserve };
  /** Moves the map to `v` (kept on the stage); `smooth` glides there, a gesture follows at once. */
  const setView = (v: View, smooth: boolean): View | null => {
    const g = geo.current;
    if (!g.layout || !g.land) return null;
    const c = clampView(v, g.layout.size, g.stage, g.land, g.reserve);
    setGlide(smooth);
    setZoom(c.z <= 1.001 ? null : c);
    return c;
  };
  const zoomBy = (factor: number, at?: { x: number; y: number }, smooth = false) => {
    const g = geo.current;
    if (!g.view || !g.layout) return;
    const p = at ?? { x: g.stage.w / 2, y: g.stage.h / 2 };
    setView(zoomAt(g.view, g.layout.size, g.view.z * factor, p), smooth);
  };
  const wholeMap = () => {
    setGlide(true);
    setZoom(null);
  };
  // The first view of an explore opened on a place: 2x, centred on its cell.
  useEffect(() => {
    const cell = pendingFocus.current;
    if (cell === null || !layout || !atlas) return;
    pendingFocus.current = null;
    setView(
      centreOn(((cell % W) + 0.5) / W, (Math.floor(cell / W) + 0.5) / H, 2, layout.size, stage),
      false,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, atlas]);
  // Past 2x the terrain is built again at twice the pixels (once a world), so a close view stays
  // crisp. It waits a moment so a zoom in progress is not held up by it.
  const sharpFor = useRef<WorldState | null>(null);
  const sharpZoom = (view?.z ?? 1) > 2;
  useEffect(() => {
    if (!exploring || !atlas || !sharpZoom || sharpFor.current === world) return undefined;
    const timer = window.setTimeout(() => {
      sharpFor.current = world;
      const scale = Math.min(Math.round(atlas.scale * 1.5), Math.floor(SHARP_PX / atlas.width));
      if (scale <= atlas.scale) return;
      const made = createAtlas(
        world.cells!,
        DEFAULT_CONTENT.biomes.map((b) => b.id),
        scale,
      );
      stageEl.current?.setAttribute('data-sharp-ms', made.terrainMs.toFixed(0));
      setAtlas(made);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [exploring, atlas, sharpZoom, world]);
  // Wheel, drag and pinch on the stage, in the explore state only.
  useEffect(() => {
    const el = stageEl.current;
    if (!exploring || !el) return undefined;
    const IGNORE = 'button, a, input, select, label, .tr-ask, .tr-chooser, .tr-key, .tr-chip';
    const local = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const pts = new Map<number, { x: number; y: number }>();
    let drag: { x: number; y: number; view: View; moved: boolean } | null = null;
    let pinch: { d: number; mid: { x: number; y: number }; view: View } | null = null;
    const current = (): View | null => {
      const v = geo.current.view;
      return v ? { z: v.z, left: v.left, top: v.top } : null;
    };
    const pair = () => {
      const [a, b] = [...pts.values()] as [{ x: number; y: number }, { x: number; y: number }];
      return {
        d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
    };
    const onWheel = (e: WheelEvent) => {
      if ((e.target as Element).closest('.tr-ask, .tr-chooser')) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : 1;
      zoomBy(Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0016)), local(e));
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if ((e.target as Element).closest(IGNORE)) return;
      const v = current();
      if (!v) return;
      pts.set(e.pointerId, local(e));
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // A pointer that is already gone cannot be captured.
      }
      if (pts.size === 1) drag = { ...local(e), view: v, moved: false };
      else if (pts.size === 2) {
        drag = null;
        pinch = { ...pair(), view: v };
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, local(e));
      const v = current();
      if (!v) return;
      if (pts.size >= 2 && pinch) {
        const now = pair();
        const base = pinch.view;
        const moved = zoomAt(base, geo.current.layout!.size, base.z * (now.d / pinch.d), pinch.mid);
        const made = setView(
          {
            ...moved,
            left: moved.left + now.mid.x - pinch.mid.x,
            top: moved.top + now.mid.y - pinch.mid.y,
          },
          false,
        );
        // Each step is measured from the last: the span and the view it left.
        if (made) pinch = { ...now, view: made };
      } else if (drag) {
        const p = local(e);
        const dx = p.x - drag.x;
        const dy = p.y - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) < 4) return;
        drag.moved = true;
        el.classList.add('dragging');
        setView({ z: drag.view.z, left: drag.view.left + dx, top: drag.view.top + dy }, false);
      }
    };
    const onUp = (e: PointerEvent) => {
      if (!pts.delete(e.pointerId)) return;
      pinch = null;
      const v = current();
      const left = [...pts.values()][0];
      drag = pts.size === 1 && left && v ? { ...left, view: v, moved: true } : null;
      if (!pts.size) el.classList.remove('dragging');
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.classList.remove('dragging');
    };
    // The handlers read the live view through `geo`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exploring]);
  // A beast's mark stands on drawn land: its lair's cell, or the nearest cell that is.
  // Armies march in wars and battles; great figures are the legends.
  const armies = shown.has('war') || shown.has('battle');
  const legends = shown.has('legend');
  const model = useMemo(() => {
    const marches = armies ? baseModel.marches : [];
    const figures = legends ? baseModel.figures : [];
    if (!atlas) return { ...baseModel, marches, figures };
    const ok = (c: number) => atlas.inland[c] === 1;
    return {
      ...baseModel,
      marches,
      figures,
      beasts: baseModel.beasts.map((b) => ({
        ...b,
        cell: nearestCell(b.cell, atlas.width, atlas.height, ok),
      })),
    };
  }, [baseModel, atlas, armies, legends]);
  /** Key rows for marks only while the map can draw them in the shown year. */
  const keyMarks = useMemo(
    () => ({
      figure: model.figures.some((f) => f.from <= year + 1 && year <= f.to),
      beast: model.beasts.some((b) => b.from <= year + 1 && year <= b.to),
    }),
    [model, year],
  );
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
  /** Each land biome's share of the land, biggest first, for the Land key. */
  const biomeShare = useMemo(() => {
    const cells = world.cells!;
    const count = new Map<number, number>();
    let land = 0;
    for (let i = 0; i < cells.biome.length; i += 1) {
      if (cells.water[i] === 2 || cells.water[i] === 3) continue;
      const b = cells.biome[i]!;
      if (b <= 1) continue;
      count.set(b, (count.get(b) ?? 0) + 1);
      land += 1;
    }
    return [...count]
      .map(([b, n]) => [b, n / Math.max(1, land)] as [number, number])
      .sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  }, [world]);
  const ring = card?.event.place ?? pin?.cell ?? focus ?? null;
  /** The side a card takes so it leaves the ringed cell and the most land uncovered. */
  const sideOf = (cell: number | null, box: { left: number; top: number; size: number } | null) => {
    if (cell === null || !box || !atlas) return 'left' as const;
    const at = {
      x: box.left + (((cell % W) + 0.5) / W) * box.size,
      y: box.top + ((Math.floor(cell / W) + 0.5) / H) * box.size,
    };
    if (stage.w <= PHONE_MAX) return 'left' as const;
    // Land share under a pixel rectangle of the stage, from the atlas's land mask.
    let total = 0;
    for (let i = 0; i < atlas.inland.length; i += 1) total += atlas.inland[i]!;
    const landUnder = (x0: number, y0: number, x1: number, y1: number) => {
      let n = 0;
      for (let i = 0; i < atlas.inland.length; i += 1) {
        if (!atlas.inland[i]) continue;
        const x = box.left + (((i % W) + 0.5) / W) * box.size;
        const y = box.top + ((Math.floor(i / W) + 0.5) / H) * box.size;
        if (x >= x0 && x < x1 && y >= y0 && y < y1) n += 1;
      }
      return total ? n / total : 0;
    };
    return cardSide(stage, landUnder, at);
  };
  const cardPlace = card?.event.place ?? null;
  const ringSide = useMemo(
    () => sideOf(cardPlace, layout),
    // `sideOf` reads the same inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cardPlace, layout, atlas, stage, W, H],
  );
  // ---- explore: event marks, towns and the place card ---------------------------------------
  const groups = useMemo(
    () => (exploring ? groupMarks(data.events, year, shown) : []),
    [exploring, data, year, shown],
  );
  const borderNow = data.borderYear(year);
  const towns = useMemo(() => {
    const out: (TownMark & { civ: number; pop: number })[] = [];
    if (!exploring) return out;
    for (const [id, s] of data.sitesAt(borderNow)) {
      const site = data.sites.get(id);
      if (!site || s.ruined || s.pop <= 0) continue;
      out.push({ id, name: site.name, cell: site.cell, civ: s.civ, pop: s.pop });
    }
    return out;
  }, [exploring, data, borderNow]);
  /** Capitals the map already names (so a town name is not written twice). */
  const namedSeats = useMemo(() => {
    const out = new Set<number>();
    if (!exploring || mode === 'realms' || mode === 'plain') return out;
    for (const id of data.seatsAt(year).values()) {
      if (mode !== 'faiths' || holySeats.has(id)) out.add(id);
    }
    return out;
  }, [exploring, mode, data, year, holySeats]);
  const siteAtCell = useMemo(() => {
    const out = new Map<number, string>();
    for (const site of data.sites.values()) if (!out.has(site.cell)) out.set(site.cell, site.name);
    return out;
  }, [data]);
  const zoomed = (view?.z ?? 1) >= TOWN_NAMES_ZOOM;
  /** What the place card lists: the shown events there up to the year shown, newest first. */
  const pinRows = useMemo(() => {
    if (!pin) return [];
    const here = data.events.filter((e) => e.place === pin.cell);
    const list = groupMarks(here, year, shown, 1)[0]?.events ?? [];
    return list.slice(0, pin.kind === 'town' ? CARD_ROWS : 12).map((e) => {
      const event = eventById.get(e.id);
      const person = e.actors.map((id) => world.people.get(id)).find((p) => p !== undefined);
      return {
        id: e.id,
        y: e.y,
        title: e.title,
        text: event ? textOf(event) : '',
        person: person ? { id: person.id, name: person.name } : null,
      };
    });
    // `textOf` is a new function each render; the rows follow the place, the year and the filter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, data, year, shown, eventById, world]);
  const pinTown = pin?.kind === 'town' ? towns.find((t) => t.id === pin.site) : undefined;
  const openEvents = (cell: number) => {
    setFocus(null);
    setPin({ kind: 'events', cell, side: sideOf(cell, view) });
  };
  const openTown = (id: Id) => {
    const t = towns.find((x) => x.id === id);
    if (!t) return;
    setFocus(null);
    setPin({ kind: 'town', cell: t.cell, site: id, side: sideOf(t.cell, view) });
  };
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
      if (!shown.size) break;
      const kind = pauseKindOf(e.type, e.importance);
      if (!kind || !shown.has(kind)) continue;
      const colour = PAUSE_KINDS.find((k) => k.id === kind)!.colour;
      out.push({ key: e.id, year: e.y, colour, kind, title: `Year ${e.y} · ${e.title}` });
    }
    return out;
  }, [data, shown]);
  // The dots are built once per filter: rebuilding a few hundred of them every frame of play
  // slowed each render enough to trip React's nested-update guard.
  const tickDots = useMemo(
    () =>
      ticks.map((tick) => (
        <i
          key={tick.key}
          data-kind={tick.kind}
          style={{
            left: `${(tick.year / Math.max(1, data.last)) * 100}%`,
            background: tick.colour,
          }}
          title={tick.title}
        />
      )),
    [ticks, data],
  );
  /** Events of each kind in the whole history: the dots a kind puts on the ribbon. */
  const kindCount = useMemo(() => {
    const out = new Map<PauseKind, number>();
    for (const e of data.events) {
      const kind = pauseKindOf(e.type, e.importance);
      if (kind) out.set(kind, (out.get(kind) ?? 0) + 1);
    }
    return out;
  }, [data]);
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

  // The map key's top part: what the colours of this mode mean, for what the map shows now.
  const legend = useMemo(() => {
    type Row = { key: string; label: string; fill: string; edge?: string };
    const css = ([r, g, b]: Rgb3, a = 1) => `rgba(${r},${g},${b},${a})`;
    // The same strength the fills lie over the land with (atlas.ts FILL_STRENGTH).
    const soft = (c: Rgb3) => css(c, 0.42);
    const held = [...labels]
      .filter(([, c]) => c.n > 0)
      .sort((a, b) => b[1].n - a[1].n || a[0] - b[0]);
    const cut = (rows: Row[], title: string) => ({
      title,
      rows: rows.slice(0, KEY_ROWS),
      more: Math.max(0, rows.length - KEY_ROWS),
    });
    if (mode === 'realms') {
      const rows: Row[] = [];
      for (const [civ] of held) {
        const info = data.civById.get(civ);
        if (!info) continue;
        const hue = palette.hue.get(civ) ?? 0;
        rows.push({
          key: `r${civ}`,
          label: info.name,
          fill: soft(fillColour(hue)),
          edge: css(borderColour(hue)),
        });
      }
      return cut(rows, `Realms in year ${year}`);
    }
    if (mode === 'peoples') {
      const size = new Map<string, number>();
      for (const [civ, c] of held) {
        const race = realmOf.get(civ);
        if (race) size.set(race, (size.get(race) ?? 0) + c.n);
      }
      const rows: Row[] = [...size]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([race]) => ({
          key: `p${race}`,
          label: DEFAULT_CONTENT.races.find((r) => r.id === race)?.name ?? race,
          fill: soft(fillColour(palette.raceHue.get(race) ?? 0)),
        }));
      return cut(rows, 'Peoples of the realms');
    }
    if (mode === 'faiths') {
      const size = new Map<number, number>();
      for (const [civ, c] of held) {
        const f = palette.faithOf(civ);
        if (f !== undefined) size.set(f, (size.get(f) ?? 0) + c.n);
      }
      const rows: Row[] = [...size]
        .sort((a, b) => b[1] - a[1] || a[0] - b[0])
        .map(([f]) => ({
          key: `f${f}`,
          label: world.faiths.get(f)?.name ?? 'a faith',
          fill: soft(fillColour(palette.faithHue.get(f) ?? 0)),
        }));
      return cut(rows, 'Faiths of the realms');
    }
    if (mode === 'land') {
      const rows: Row[] = [];
      for (const [biome, share] of biomeShare) {
        const def = DEFAULT_CONTENT.biomes[biome];
        const tint = def && TINT[def.id];
        if (!def || !tint || share < KEY_BIOME_SHARE) continue;
        rows.push({ key: `b${def.id}`, label: def.name.toLowerCase(), fill: css(tint) });
      }
      return { title: 'The land', rows, more: 0 };
    }
    return null;
  }, [mode, labels, data, palette, realmOf, world, year, biomeShare]);

  const openPerson = (id: Id) =>
    onOpenPerson(id, Math.floor(clock.current.t), follow ? { ...follow } : null);
  const onRoom = (room: RoomId) => {
    if (room === 'people') onPeople(Math.floor(clock.current.t), follow ? { ...follow } : null);
    else if (room === 'book') onBook(Math.floor(clock.current.t), follow ? { ...follow } : null);
    else if (room === 'town') onTown(Math.floor(clock.current.t), follow ? { ...follow } : null);
    else if (room === 'world') startExplore();
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
        <div
          className={`tr-stage${exploring ? ' exploring' : ''}`}
          ref={stageEl}
          data-testid="tales-stage"
          data-explore={exploring ? 'true' : 'false'}
          data-zoom={view ? view.z.toFixed(2) : '1.00'}
        >
          <div
            className={`tr-map${glide ? ' glide' : ''}`}
            ref={wrapEl}
            style={
              view
                ? { width: view.size, height: view.size, left: view.left, top: view.top }
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
                maxTags={stage.w <= PHONE_MAX ? 1 : MAX_TAGS}
                recent={recent}
              />
            )}
            {exploring && (
              <>
                <Towns
                  towns={towns}
                  width={W}
                  height={H}
                  named={zoomed}
                  skip={namedSeats}
                  open={pin?.cell ?? null}
                  onOpen={openTown}
                />
                <ExploreMarks
                  groups={groups}
                  width={W}
                  height={H}
                  open={pin?.kind === 'events' ? pin.cell : null}
                  onOpen={openEvents}
                />
              </>
            )}
            <div
              className={`tr-ring${card || pin || focus !== null ? ' on' : ''}`}
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
              <small>
                {firstRun ? 'no pauses on the first play' : 'pauses only on their story'}
              </small>
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
                {exploring ? (
                  <>
                    <small>Show</small> <span>{pausesLabel(shown)}</span>
                  </>
                ) : firstRun ? (
                  <>
                    <small>First play</small> <span>no pauses</span>
                  </>
                ) : (
                  <>
                    <small>Pauses on</small> <span>{pausesLabel(pausing)}</span>
                  </>
                )}{' '}
                ▾
              </button>
              {chooser && (
                <div className="tr-chooser" role="group" aria-label="Events">
                  <div className="head" aria-hidden="true">
                    <span>Events</span>
                    <span>Show</span>
                    <span>Pause</span>
                  </div>
                  {PAUSE_KINDS.map((k) => (
                    <div key={k.id} className="row">
                      <span className="name">
                        <i style={{ background: k.colour }} />
                        {k.label}
                        <small>{kindCount.get(k.id) ?? 0}</small>
                      </span>
                      <input
                        type="checkbox"
                        aria-label={`Show ${k.label}`}
                        checked={shown.has(k.id)}
                        onChange={() => toggleShown(k.id)}
                      />
                      <input
                        type="checkbox"
                        aria-label={`Pause on ${k.label}`}
                        checked={shown.has(k.id) && kinds.has(k.id)}
                        disabled={!shown.has(k.id)}
                        onChange={() => togglePause(k.id)}
                      />
                    </div>
                  ))}
                  <p>
                    {exploring
                      ? 'Each ticked kind is marked on the map up to the year on the ribbon: click a mark to read it. The Pause ticks apply when you play on.'
                      : firstRun
                        ? 'The first play runs to the present (or until you skip) without pausing. Replays pause on the ticked events.'
                        : 'Shown events are marked on the map and the ribbon; paused ones stop to ask. Peace is shown with wars but never pauses.'}
                  </p>
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
          {exploring && (
            <div className="tr-zoom" role="group" aria-label="Zoom">
              <button
                type="button"
                aria-label="Zoom in"
                disabled={(view?.z ?? 1) >= ZOOM_MAX - 0.001}
                onClick={() => zoomBy(1.5, undefined, true)}
              >
                +
              </button>
              <button
                type="button"
                aria-label="Zoom out"
                disabled={(view?.z ?? 1) <= 1.001}
                onClick={() => zoomBy(1 / 1.5, undefined, true)}
              >
                −
              </button>
              <button type="button" disabled={(view?.z ?? 1) <= 1.001} onClick={wholeMap}>
                Whole map
              </button>
            </div>
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
            data-testid="tales-key"
          >
            {legend && (
              <section className="tr-legend" data-legend={mode}>
                <h3>{legend.title}</h3>
                {legend.rows.map((row) => (
                  <div key={row.key}>
                    <i
                      className="sw"
                      style={{
                        background: row.fill,
                        borderColor: row.edge ?? 'rgba(70,62,52,0.35)',
                      }}
                    />
                    <span>{row.label}</span>
                  </div>
                ))}
                {legend.more > 0 && (
                  <small>
                    and {legend.more} more{mode === 'realms' ? ', named on the map' : ''}
                  </small>
                )}
              </section>
            )}
            <div>
              <i className="town" />
              town
            </div>
            {armies && (
              <div>
                <FlagKey />
                army
              </div>
            )}
            <div>
              <i className="capital" />
              capital
            </div>
            {keyMarks.figure && (
              <div>
                <StarKey />
                great figure
              </div>
            )}
            <div>
              <i className="road" />
              road
            </div>
            {keyMarks.beast && (
              <div>
                <BeastKey />
                great beast
              </div>
            )}
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

          {pin && (
            <section
              key={`${pin.kind}:${pin.cell}`}
              className={`tr-ask tr-pin ${pin.side}`}
              role="dialog"
              aria-label={pin.kind === 'town' ? 'Town' : 'Events at this place'}
              data-testid="tales-pin"
            >
              <button type="button" className="x" aria-label="Close" onClick={() => setPin(null)}>
                ✕
              </button>
              {pinTown ? (
                <>
                  <div
                    className="k"
                    style={{
                      color: `rgb(${labelColour(palette.hue.get(pinTown.civ) ?? 0).join(',')})`,
                    }}
                  >
                    {data.civById.get(pinTown.civ)?.name ?? 'A free town'}
                  </div>
                  <h2>{pinTown.name}</h2>
                  <p>
                    {pinTown.pop.toLocaleString('en-GB')} people in year {year}
                    {world.sites.get(pinTown.id)
                      ? `, founded in year ${world.sites.get(pinTown.id)!.founded}`
                      : ''}
                    .
                  </p>
                  <div className="acts">
                    {onWatch && year >= data.last && (
                      <button type="button" className="p" onClick={() => onWatch(pinTown.id)}>
                        Watch this town
                      </button>
                    )}
                    {onRecords && (
                      <button type="button" onClick={() => onRecords(pinTown.id)}>
                        Its records
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="k">Marked on the map</div>
                  <h2>{siteAtCell.get(pin.cell) ?? 'Open country'}</h2>
                </>
              )}
              {pinRows.length === 0 ? (
                <p className="none">
                  Nothing is marked here for the kinds shown, up to year {year}.
                </p>
              ) : (
                <ol className="tr-rows">
                  {pinRows.map((r) => (
                    <li key={r.id}>
                      <div className="k">Year {r.y}</div>
                      <h3>{r.title}</h3>
                      <p>{r.text}</p>
                      <div className="acts">
                        <button type="button" className="p" onClick={() => onOpenEvent(r.id)}>
                          Read the story
                        </button>
                        {r.person && (
                          <button type="button" onClick={() => openPerson(r.person!.id)}>
                            Who is {r.person.name}?
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}

          {ended && !exploring && (
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
                <button type="button" className="p" onClick={startExplore}>
                  Explore the map
                </button>
                <button
                  type="button"
                  onClick={() => onBook(Math.floor(clock.current.t), follow ? { ...follow } : null)}
                >
                  Read the book
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
            {!ended && !exploring && (
              <button type="button" className="skip" onClick={skip}>
                Skip to the present
              </button>
            )}
          </div>
          <div className="tr-keyrow">
            {PAUSE_KINDS.filter((k) => shown.has(k.id)).map((k) => (
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
              {tickDots}
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
