// The site view (M3.1): the watched site as a Canvas 2D tile map with a time bar, beside the pane
// (Inspect, Site, People, Chronicle). It replaces the world map and Legends while a site is watched.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MutableRefObject,
  type RefObject,
} from 'react';
import {
  DAY_BLOCKS,
  applySiteSnapshot,
  buildLegendIndex,
  dateOf,
  localMapDigest,
  type ContentBundle,
  type Id,
  type LegendIndex,
  type Narrator,
  type SimEvent,
  type SiteSnapshot,
  type WorldState,
} from '../engine';
import type { SiteHost } from '../platform/site-host';
import type { SiteSpeed } from '../platform/site-worker';
import type { PageRef } from './legends-ctx';
import {
  ChroniclePane,
  InspectPane,
  PeoplePane,
  SitePane,
  createSiteModel,
  shownBlock,
  dayText,
  monthName,
  joinList,
  selectionAnnouncement,
  selectionName,
  tipText,
  usePaneUi,
  type LiveLine,
  type PanelActions,
  type SiteModel,
} from './site-panels';
import {
  SiteRenderer,
  clampViewport,
  formatSelection,
  movePeople,
  refreshLayout,
  refreshLive,
  parseSelection,
  selectionRect,
  tileAtPoint,
  type Selection,
} from './site-render';
import { NARROW_PX, fireLine, shortDate, threatLine, weatherChip } from './site-season';
import './site-view.css';

/** The part of a link the site view writes back. */
export interface SiteLinkParts {
  day: number;
  open: string | null;
  zoom: number;
  at: { x: number; y: number };
}

export type TickListener = (
  day: number,
  events: SimEvent[],
  rate: number,
  snapshot?: SiteSnapshot,
) => void;

interface Props {
  world: WorldState;
  content: ContentBundle;
  index: LegendIndex;
  narrator: Narrator;
  host: SiteHost;
  /** Set to the site view's tick handler while it is mounted. */
  ticks: MutableRefObject<TickListener | null>;
  /** Worker errors so far; the clock stops when this changes, as the worker no longer runs. */
  failures: number;
  /** Restored from a link: events from the days already run, the selection, zoom step and centre. */
  restore: {
    events: SimEvent[];
    open: string | null;
    zoom: number | null;
    at: { x: number; y: number } | null;
  };
  onLeave(): void;
  onOpenLegends(ref: PageRef): void;
  hrefOf(ref: PageRef): string;
  onLink(parts: SiteLinkParts): void;
}

/** Speeds the keys 0-4 choose. */
const KEY_SPEEDS: SiteSpeed[] = [0, 0, 1, 4, 16];
const SPEEDS: [SiteSpeed, string, string][] = [
  [0, '❚❚', 'Pause (Space or 1)'],
  [1, '1×', '1 day a second (2)'],
  [4, '4×', '4 days a second (3)'],
  [16, '16×', '16 days a second (4)'],
];
const PAUSE_CATEGORIES = ['deaths', 'breakdowns', 'fires', 'threats', 'arrivals'] as const;
type PauseCategory = (typeof PAUSE_CATEGORIES)[number];
/** Zoom step a selection centres to, and the step "Show on map" raises to. */
const SELECT_ZOOM = 2;
const SHOW_ZOOM = 3;
/** Pixels a drag must move before it stops being a click. */
const DRAG_THRESHOLD = 4;
/** Arrow keys with Shift pan this many tiles. */
const PAN_STEP = 6;
/** The phone shows the pane this long after a tap picked something. */
const PHONE_PANE_DELAY_MS = 700;
/** Live events reach the Legends index at most this often. */
const INDEX_REBUILD_MS = 500;
const TIP_HOLD_MS = 2200;
const TOAST_MS = 3200;
/** Widest map and narrowest pane of the desktop layout, in pixels. */
const MAP_MAX = 760;
const MAP_MIN = 300;
const PANE_MIN = 360;
const COLUMN_GAP = 14;
const PHONE_QUERY = '(max-width: 860px)';

const NARROW_QUERY = `(max-width: ${NARROW_PX - 1}px)`;
const watchNarrow = (notify: () => void) => {
  const query = window.matchMedia(NARROW_QUERY);
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
};
/** True under 480 px: the time bar uses the short date and the short weather chip. */
const useNarrow = () =>
  useSyncExternalStore(
    watchNarrow,
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false,
  );

const isPhone = () => window.matchMedia(PHONE_QUERY).matches;
const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.matches('input,textarea,select') || el.isContentEditable);

interface Banner {
  eventId: Id;
  text: string;
  /** The event started a fire: the banner follows the fight. */
  fire: boolean;
  /** M3.8: the event was a threat's: the banner follows the danger. */
  threat: boolean;
  causes: { word: string; text: string }[];
}

/** How long a disc takes to walk to its new tile, by speed: about one block of wall-clock time. */
const TWEEN_MS: Partial<Record<SiteSpeed, number>> = { 1: 250, 4: 60 };

export function SiteView(props: Props) {
  const { world, content, host, onLeave } = props;
  const active = world.activeSite!;
  const size = active.map.width;
  const base = useMemo(
    () => createSiteModel(world, content, props.index, props.narrator),
    // The model is built once per watched site; events only replace its index.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [world, content],
  );
  const [index, setIndex] = useState<LegendIndex>(props.index);
  const m: SiteModel = useMemo(() => ({ ...base, index }), [base, index]);
  const digest = useMemo(() => localMapDigest(active.map), [active]);
  const ui = usePaneUi();
  const narrow = useNarrow();

  const startLine = useMemo<LiveLine>(() => {
    const followed = active.residents.length;
    const text =
      m.scene.countedPeople > 0
        ? `You began watching ${m.site.name}. ${followed} of its ${m.total} people live in the hall quarter; the other ${m.scene.countedPeople} are counted, not followed.`
        : `You began watching ${m.site.name}. All ${m.total} of its people are followed.`;
    return { day: active.enteredDay, text };
  }, [active, m.site.name, m.total, m.scene.countedPeople]);
  const [live, setLive] = useState<LiveLine[]>(() => [
    startLine,
    ...props.restore.events.map((e) => ({ day: e.day, eventId: e.id })),
  ]);

  const [day, setDay] = useState(world.day);
  /** Bumped by each snapshot so the panes and the time bar re-read the people. */
  const [, setSnapshots] = useState(0);
  const [speed, setSpeedState] = useState<SiteSpeed>(0);
  const [rate, setRate] = useState(0);
  const [sel, setSel] = useState<Selection | null>(() => {
    const found = parseSelection(props.restore.open, size);
    if (!found) return null;
    if (found.kind === 'person' && !base.scene.marks.has(found.id)) return null;
    if (found.kind === 'household' && !active.households.has(found.id)) return null;
    if (found.kind === 'building' && !active.buildings.has(found.id)) return null;
    return found;
  });
  const [tab, setTab] = useState<'inspect' | 'site' | 'people' | 'chron'>('inspect');
  const [phoneTab, setPhoneTab] = useState<'map' | 'pane'>('map');
  const [banner, setBanner] = useState<Banner | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const [pauseOn, setPauseOn] = useState<ReadonlySet<PauseCategory>>(new Set(PAUSE_CATEGORIES));
  /** On a phone the pause chips fold behind a button so the map keeps the screen. */
  const [chipsOpen, setChipsOpen] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [tip, setTip] = useState<{ text: string; left: number; top: number } | null>(null);
  const [paint, setPaint] = useState<{ zoomLabel: string; whole: boolean } | null>(null);
  const [viewKey, setViewKey] = useState('');
  const [announce, setAnnounce] = useState('');

  const mainRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overviewRef = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<SiteRenderer | null>(null);
  const cursor = useRef({ x: 0, y: 0 });
  const resumeSpeed = useRef<SiteSpeed>(1);
  const picked = useRef(0);
  const toastTimer = useRef(0);
  const tipTimer = useRef(0);
  const paneTimer = useRef(0);
  const indexTimer = useRef(0);
  /** Set when an event paused the clock, so ticks already on their way can't replace the banner. */
  const autoPaused = useRef(false);

  useEffect(
    () => () => {
      window.clearTimeout(toastTimer.current);
      window.clearTimeout(tipTimer.current);
      window.clearTimeout(paneTimer.current);
      window.clearTimeout(indexTimer.current);
    },
    [],
  );

  const showToast = useCallback((text: string) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  // ---- renderer ----

  const homeOf = useCallback(
    (householdId: number) => active.households.get(householdId)?.home ?? null,
    [active],
  );
  const rectOf = useCallback(
    (s: Selection | null) => (s ? selectionRect(base.scene, s, homeOf) : null),
    [base, homeOf],
  );
  const redrawOverview = useCallback(() => {
    if (overviewRef.current) renderer.current?.drawOverview(overviewRef.current);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const view = { z: props.restore.zoom ?? SELECT_ZOOM, cx: size / 2, cy: size / 2 };
    const hall = [...active.buildings.values()].find((b) => b.defId === 'hall');
    const quarter = base.scene.quarter;
    view.cx = props.restore.at?.x ?? (hall ? hall.x + hall.w / 2 : quarter[0] + quarter[2] / 2);
    view.cy = props.restore.at?.y ?? (hall ? hall.y + hall.h / 2 + 4 : quarter[1] + quarter[3] / 2);
    const r = new SiteRenderer(
      canvas,
      base.scene,
      { view, selected: { rect: null, personId: null }, hoverId: null, cursor: null },
      (info) => {
        setPaint((old) =>
          old && old.zoomLabel === info.zoomLabel && old.whole === info.whole ? old : info,
        );
        const v = r.state.view;
        setViewKey(`${v.z},${Math.round(v.cx)},${Math.round(v.cy)}`);
        if (overviewRef.current) r.drawOverview(overviewRef.current);
      },
    );
    renderer.current = r;
    const hallRect = hall ? { x: hall.x + (hall.w >> 1), y: hall.y + hall.h } : null;
    cursor.current = hallRect ?? { x: Math.floor(size / 2), y: Math.floor(size / 2) };
    const relayout = () => {
      fitMap();
      if (r.resize()) {
        r.clamp();
        r.draw();
      }
    };
    const fitMap = () => {
      const main = mainRef.current;
      const time = timeRef.current;
      if (!main || !time) return;
      if (isPhone()) {
        main.style.removeProperty('--mapw');
        return;
      }
      for (let i = 0; i < 4; i += 1) {
        const top = main.getBoundingClientRect().top + window.scrollY;
        const avail = window.innerHeight - top - time.offsetHeight - 8 - 12;
        const w = Math.round(
          Math.max(MAP_MIN, Math.min(MAP_MAX, avail, main.clientWidth - COLUMN_GAP - PANE_MIN)),
        );
        if (main.style.getPropertyValue('--mapw') === `${w}px`) break;
        main.style.setProperty('--mapw', `${w}px`);
      }
    };
    relayout();
    const observer = new ResizeObserver(() => {
      if (r.resize()) {
        r.clamp();
        r.draw();
      }
    });
    observer.observe(canvas);
    window.addEventListener('resize', relayout);
    const dark = window.matchMedia('(prefers-color-scheme: dark)');
    const retheme = () => r.retheme();
    dark.addEventListener('change', retheme);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', relayout);
      dark.removeEventListener('change', retheme);
      r.dispose();
      renderer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  // Wheel zoom needs a non-passive listener to keep the page from scrolling.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const listener = (event: WheelEvent) => {
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? 1 : -1);
    };
    canvas.addEventListener('wheel', listener, { passive: false });
    return () => canvas.removeEventListener('wheel', listener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The selection reaches the renderer (and the first paint centres on a restored selection).
  useEffect(() => {
    const r = renderer.current;
    if (!r) return;
    r.state.selected = {
      rect: rectOf(sel),
      personId: sel?.kind === 'person' ? sel.id : null,
    };
    r.draw();
  }, [sel, rectOf]);

  const centreOn = (rect: [number, number, number, number], minZoom: number) => {
    const r = renderer.current;
    if (!r) return;
    r.state.view.cx = rect[0] + rect[2] / 2;
    r.state.view.cy = rect[1] + rect[3] / 2;
    if (r.state.view.z < minZoom) r.state.view.z = minZoom;
    r.clamp();
    r.draw();
  };

  const select = (next: Selection | null, centre = false) => {
    setSel(next);
    setTab('inspect');
    setAnnounce(selectionAnnouncement(m, next));
    if (next && centre) {
      const rect = rectOf(next);
      if (rect) centreOn(rect, SELECT_ZOOM);
    }
  };
  const actions: PanelActions = {
    select: (next) => select(next, true),
    showOnMap(next) {
      setSel(next);
      setTab('inspect');
      const rect = rectOf(next);
      if (rect) centreOn(rect, SHOW_ZOOM);
      window.clearTimeout(paneTimer.current);
      if (isPhone()) setPhoneTab('map');
    },
    openLegends: props.onOpenLegends,
    hrefOf: props.hrefOf,
  };

  // ---- time ----

  const setSpeed = (next: SiteSpeed) => {
    window.clearTimeout(paneTimer.current);
    if (next !== 0) autoPaused.current = false;
    setSpeedState(next);
    setRate(0);
    if (next !== 0) {
      resumeSpeed.current = next;
      setBanner(null);
    }
    // The worker stops on the very block of an auto-pause event, so the map shows that moment.
    const on = latest.current.pauseOn;
    host.setSpeed(
      next,
      PAUSE_CATEGORIES.filter((c) => on.has(c)).flatMap((c) => content.site.autoPause[c]),
    );
  };
  const resume = () => setSpeed(resumeSpeed.current || 1);
  const latest = useRef({ speed, pauseOn, m, setSpeed });
  latest.current = { speed, pauseOn, m, setSpeed };

  useEffect(() => {
    props.ticks.current = (nextDay, events, nextRate, snapshot) => {
      const { pauseOn: on, m: model, speed: current } = latest.current;
      world.day = nextDay;
      if (snapshot) {
        // The worker owns the running world; this copy mirrors it from the snapshots.
        applySiteSnapshot(world, snapshot);
        base.clock.day = snapshot.day;
        // A building went up or the map changed: rebuild the scene's lookups and redraw the layers.
        if (snapshot.map) {
          refreshLayout(model.scene, world, content.site);
          renderer.current?.refreshLayout();
        }
        const before = new Map<Id, number>();
        for (const mark of model.scene.marks.values()) before.set(mark.id, mark.k);
        movePeople(model.scene, world);
        // Crops, snow, fire and animals ride on every snapshot.
        refreshLive(model.scene, world);
        renderer.current?.refreshLive();
        renderer.current?.beginTween(before, TWEEN_MS[current] ?? 0);
        renderer.current?.refreshPeople();
        redrawOverview();
        setSnapshots((n) => n + 1);
      }
      setDay(nextDay);
      setRate(nextRate);
      if (events.length === 0) return;
      for (const e of events) world.events.push(e);
      // One index rebuild per burst of ticks, not one per tick.
      if (!indexTimer.current) {
        indexTimer.current = window.setTimeout(() => {
          indexTimer.current = 0;
          setIndex(buildLegendIndex(world, content));
        }, INDEX_REBUILD_MS);
      }
      setLive((lines) => [...lines, ...events.map((e) => ({ day: e.day, eventId: e.id }))]);
      // A threat's own line wins the banner over a death in the same block: its count names the dead.
      const threatFirst = [...events].sort(
        (x, y) =>
          Number(!content.site.autoPause.threats.includes(x.type)) -
          Number(!content.site.autoPause.threats.includes(y.type)),
      );
      for (const event of threatFirst) {
        const category = PAUSE_CATEGORIES.find(
          (c) => content.site.autoPause[c].includes(event.type) && on.has(c),
        );
        if (!category || autoPaused.current) continue;
        autoPaused.current = true;
        if (current !== 0) resumeSpeed.current = current;
        latest.current.setSpeed(0);
        const causes = event.causes.flatMap((id) => {
          const cause = world.events.find((e) => e.id === id);
          if (!cause) return [];
          const word = content.eventTypes.find((d) => d.id === event.type)?.causeWord ?? 'after';
          return [{ word, text: props.narrator.renderEvent(cause) }];
        });
        setBanner({
          eventId: event.id,
          text: props.narrator.renderEvent(event),
          fire: category === 'fires',
          threat: category === 'threats',
          causes,
        });
        setWhyOpen(false);
        const actor = event.actors.find((id) => model.scene.marks.has(id));
        if (actor !== undefined) {
          const next: Selection = { kind: 'person', id: actor };
          setSel(next);
          setTab('inspect');
          const rect = selectionRect(model.scene, next, () => null);
          if (rect) {
            const r = renderer.current;
            if (r) {
              r.state.view.cx = rect[0] + rect[2] / 2;
              r.state.view.cy = rect[1] + rect[3] / 2;
              if (r.state.view.z < SELECT_ZOOM) r.state.view.z = SELECT_ZOOM;
              r.clamp();
              r.draw();
            }
          }
        } else if (category === 'threats') {
          // M3.8: a threat has no one to select: cut (no pan) to the attackers, or to where the
          // people gathered if they fled, centred in the part of the map the banner leaves clear.
          const mark = model.scene.live.threat;
          const spot = mark?.at[0] ?? mark?.camp;
          const r = renderer.current;
          // After the banner has rendered, so its height is known.
          if (spot && r)
            window.requestAnimationFrame(() => {
              if (r.state.view.z < SELECT_ZOOM) r.state.view.z = SELECT_ZOOM;
              const below = (bannerRef.current?.offsetHeight ?? 0) / 2 / r.scale;
              r.state.view.cx = spot.x + 0.5;
              r.state.view.cy = spot.y + 0.5 - below;
              r.clamp();
              r.draw();
            });
        }
        break;
      }
    };
    return () => {
      props.ticks.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, content]);

  const failuresSeen = useRef(props.failures);
  useEffect(() => {
    if (props.failures === failuresSeen.current) return;
    failuresSeen.current = props.failures;
    latest.current.setSpeed(0);
  }, [props.failures]);

  useLayoutEffect(() => {
    boxRef.current?.style.setProperty(
      '--bh',
      banner && bannerRef.current ? `${bannerRef.current.offsetHeight}px` : '0px',
    );
  }, [banner, whyOpen]);

  // Under 860 px the time bar is pinned to the viewport bottom; keep room for it.
  useEffect(() => {
    const time = timeRef.current;
    const main = mainRef.current;
    if (!time || !main) return;
    const set = () => main.style.setProperty('--timeh', `${time.offsetHeight}px`);
    set();
    const observer = new ResizeObserver(set);
    observer.observe(time);
    return () => observer.disconnect();
  }, []);

  // ---- link line ----

  // Until the map first paints (a hidden phone tab may never size it), the link keeps the restored view.
  const painted = renderer.current && viewKey !== '' ? renderer.current.state.view : null;
  const rounded = painted
    ? { x: Math.round(painted.cx), y: Math.round(painted.cy) }
    : (props.restore.at ?? { x: Math.round(size / 2), y: Math.round(size / 2) });
  const openText = sel ? formatSelection(sel, size) : null;
  const zoomIndex = painted ? painted.z : (props.restore.zoom ?? SELECT_ZOOM);
  const linkText = useMemo(() => {
    const parts = [`seed=${world.seed}`, `site=${active.siteId}`, `day=${day - active.enteredDay}`];
    if (openText) parts.push(`open=${openText}`);
    parts.push(`z=${zoomIndex + 1}`, `at=${rounded.x},${rounded.y}`);
    return `?${parts.join('&')}`;
    // viewKey stands for the zoom and centre, which live in the renderer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world.seed, active, day, openText, viewKey]);
  const { onLink } = props;
  useEffect(() => {
    onLink({ day: day - active.enteredDay, open: openText, zoom: zoomIndex, at: rounded });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkText]);

  const copyLink = async () => {
    const full = window.location.origin + window.location.pathname + linkText;
    try {
      await navigator.clipboard.writeText(full);
      showToast('Link copied');
    } catch {
      showToast('Copy failed: select the link and press Ctrl+C');
    }
  };

  // ---- map interaction ----

  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(
    null,
  );
  const tileUnder = (event: { clientX: number; clientY: number }) => {
    const r = renderer.current;
    if (!r) return null;
    const box = r.canvas.getBoundingClientRect();
    const px = event.clientX - box.left;
    const py = event.clientY - box.top;
    return { px, py, tile: tileAtPoint(px, py, r.state.view, r.scale, r.vw, r.vh, size) };
  };
  const pickTile = (k: number) => {
    picked.current = performance.now();
    const ids = base.scene.at.get(k);
    if (ids) {
      const at = sel?.kind === 'person' ? ids.indexOf(sel.id) : -1;
      select({ kind: 'person', id: ids[(at + 1) % ids.length]! });
      return;
    }
    const b = active.map.building[k] ? active.buildings.get(active.map.building[k]!) : undefined;
    if (b && b.defId !== 'field') select({ kind: 'building', id: b.id });
    else select({ kind: 'tile', id: k });
  };
  const showTip = (k: number, px: number, py: number, hold: number) => {
    const r = renderer.current!;
    setTip({
      text: tipText(m, k),
      left: Math.max(4, Math.min(px + 14, r.vw - 200)),
      top: Math.min(py + 16, r.vh - 30),
    });
    window.clearTimeout(tipTimer.current);
    if (hold) tipTimer.current = window.setTimeout(() => setTip(null), hold);
  };
  const setHover = (id: Id | null) => {
    const r = renderer.current;
    if (!r || r.state.hoverId === id) return;
    r.state.hoverId = id;
    r.draw();
  };
  const zoomBy = (delta: number) => {
    const r = renderer.current;
    if (!r) return;
    r.state.view.z = Math.max(0, Math.min(r.zooms.length - 1, r.state.view.z + delta));
    r.clamp();
    r.draw();
  };
  const moveCursor = (dx: number, dy: number) => {
    const r = renderer.current;
    if (!r) return;
    const c = cursor.current;
    c.x = Math.max(0, Math.min(size - 1, c.x + dx));
    c.y = Math.max(0, Math.min(size - 1, c.y + dy));
    const view = r.state.view;
    const s = r.scale;
    const hw = r.vw / s / 2;
    const hh = r.vh / s / 2;
    if (c.x + 0.5 < view.cx - hw + 1) view.cx = c.x + 0.5 + hw - 1;
    else if (c.x + 0.5 > view.cx + hw - 1) view.cx = c.x + 0.5 - hw + 1;
    if (c.y + 0.5 < view.cy - hh + 1) view.cy = c.y + 0.5 + hh - 1;
    else if (c.y + 0.5 > view.cy + hh - 1) view.cy = c.y + 0.5 - hh + 1;
    r.state.cursor = { ...c };
    r.clamp();
    r.draw();
    setAnnounce(`Cursor on ${tipText(m, c.y * size + c.x)}`);
  };
  const cyclePeople = (dir: number) => {
    let k: number;
    if (sel?.kind === 'person') k = base.scene.marks.get(sel.id)?.k ?? 0;
    else if (sel?.kind === 'tile') k = sel.id;
    else k = cursor.current.y * size + cursor.current.x;
    const ids = base.scene.at.get(k);
    if (!ids) {
      showToast('No people on this tile');
      return;
    }
    const at = sel?.kind === 'person' ? ids.indexOf(sel.id) : -1;
    select({ kind: 'person', id: ids[(at + dir + ids.length) % ids.length]! });
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey || typing(event.target)) return;
    const target = event.target as HTMLElement;
    const onCanvas = target === canvasRef.current;
    const onBody = target === document.body;
    if (
      target.matches?.('a[role="link"],a[role="button"]') &&
      (event.key === 'Enter' || event.key === ' ')
    ) {
      return;
    }
    if (event.key >= '0' && event.key <= '4') {
      setSpeed(KEY_SPEEDS[Number(event.key)]!);
      return;
    }
    if (event.key === ' ' && (onBody || onCanvas)) {
      event.preventDefault();
      if (latest.current.speed) setSpeed(0);
      else resume();
      return;
    }
    if (event.key === 'Escape') {
      if (keyOpen) setKeyOpen(false);
      else if (sel) {
        setSel(null);
        setAnnounce('Selection cleared');
      }
      return;
    }
    if (event.key === '[' || event.key === ']') {
      cyclePeople(event.key === ']' ? 1 : -1);
      return;
    }
    if (!onCanvas) return;
    const r = renderer.current;
    if (!r) return;
    if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      const dx = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
      const dy = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
      if (event.shiftKey) {
        r.state.view.cx += dx * PAN_STEP;
        r.state.view.cy += dy * PAN_STEP;
        r.clamp();
        r.draw();
      } else moveCursor(dx, dy);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      pickTile(cursor.current.y * size + cursor.current.x);
    } else if (event.key === '+' || event.key === '=') zoomBy(1);
    else if (event.key === '-') zoomBy(-1);
  };
  const keyHandler = useRef(onKey);
  keyHandler.current = onKey;
  useEffect(() => {
    const listener = (event: KeyboardEvent) => keyHandler.current(event);
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, []);

  // Close the key popover on an outside click.
  useEffect(() => {
    if (!keyOpen) return;
    const listener = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest('.keypop,.keybtn')) setKeyOpen(false);
    };
    document.addEventListener('click', listener);
    return () => document.removeEventListener('click', listener);
  }, [keyOpen]);

  // Back on the map tab of the phone layout, the canvas has a size again.
  useEffect(() => {
    if (phoneTab !== 'map') return;
    const r = renderer.current;
    if (r?.resize()) {
      r.clamp();
      r.draw();
    }
  }, [phoneTab]);

  useEffect(() => {
    window.scrollTo?.({ top: 0 });
  }, []);

  // ---- render ----

  const model = m;
  const liveLine = announce && !sel ? announce : selectionAnnouncement(model, sel);
  const selectedName = sel ? selectionName(model, sel) : '';
  // The date line names the block that just ran (what the inspector shows people doing); after
  // the evening the day has already turned, so that block belongs to the day before.
  const shown = shownBlock(m);
  const lastBlock = shown.block;
  const blockDay = shown.day;
  const blockSeason = dateOf(blockDay).season;
  const date_ = narrow ? shortDate(blockDay) : dayText(blockDay);
  const month = monthName(blockDay);
  const chip = weatherChip({ world, active, content }, narrow);
  // On a phone the time of day moves down beside the speed buttons, and the rate is rounded.
  const rateText = narrow
    ? `${DAY_BLOCKS[lastBlock]} · ${speed === 0 ? 'paused' : `${Math.round(rate)} d/s`}`
    : speed === 0
      ? 'paused'
      : rate <= 0
        ? `${speed}× · measuring`
        : `${speed}× · ${rate.toFixed(1)} days/s`;
  const tabs: [typeof tab, string, string?][] = [
    ['inspect', 'Inspect'],
    ['site', 'Site'],
    ['people', 'People', String(active.residents.length)],
    ['chron', 'Chronicle'],
  ];

  // A fire banner says who is fighting it and with what water, read from the live state.
  const fire = banner?.fire ? fireLine({ world, active, content }) : null;
  // A threat banner says who stands to arms and how the fight goes (M3.8).
  // The fight's running count shows under any banner while attackers are on the map (a death in it too).
  const danger =
    banner?.threat || (banner && active.threat && active.threat.stage !== 'warned')
      ? threatLine({ world, active, content })
      : null;

  // On a phone the Key sits beside the speed buttons, so the date and both chips share one row.
  const keyButton = (
    <button
      type="button"
      className="small keybtn"
      aria-expanded={keyOpen}
      aria-controls="sv-key"
      onClick={() => setKeyOpen((o) => !o)}
    >
      Key
    </button>
  );

  /** The auto-pause banner; a second copy sits above the pane for the phone's pane tab (CSS shows one). */
  const bannerView = (ref: RefObject<HTMLDivElement | null> | undefined, cls: string) =>
    banner && (
      <div className={`banner${cls}`} ref={ref} role="status">
        <div className="b1">
          <b>Paused:</b> <span>{banner.text}</span>{' '}
          {banner.causes.length > 0 && (
            <a
              className="ln"
              role="button"
              tabIndex={0}
              aria-expanded={whyOpen}
              onClick={() => setWhyOpen((o) => !o)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setWhyOpen((o) => !o);
                }
              }}
            >
              why?
            </a>
          )}
          <button type="button" className="primary" onClick={resume}>
            Resume (Space)
          </button>
          <button
            type="button"
            className="chipfold"
            aria-expanded={chipsOpen}
            onClick={() => setChipsOpen((o) => !o)}
          >
            Pause on…
          </button>
        </div>
        {fire && <div className="spread">{fire}</div>}
        {danger && <div className="spread">{danger}</div>}
        {whyOpen && (
          <div className="why">
            {banner.causes.map((c, k) => (
              <div key={k}>
                {c.word} {c.text}
              </div>
            ))}
          </div>
        )}
        <div className={`chips${chipsOpen ? '' : ' folded'}`} role="group" aria-label="Pause on">
          <span className="lbl">Pause on:</span>
          {PAUSE_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className="chip tg"
              aria-pressed={pauseOn.has(c)}
              onClick={() =>
                setPauseOn((on) => {
                  const next = new Set(on);
                  if (!next.delete(c)) next.add(c);
                  return next;
                })
              }
            >
              {c}
            </button>
          ))}
        </div>
      </div>
    );

  return (
    <section className="sv-site">
      <div className="bar">
        <nav className="crumbs" aria-label="Breadcrumb">
          <button type="button" className="crumb" onClick={onLeave}>
            World map
          </button>
          <span className="sepc" aria-hidden="true">
            ›
          </span>
          <button
            type="button"
            className="crumb"
            aria-current={sel ? undefined : 'page'}
            onClick={() => {
              setTab('site');
              if (isPhone()) setPhoneTab('pane');
            }}
          >
            {m.site.name}
          </button>
          {sel && (
            <>
              <span className="sepc" aria-hidden="true">
                ›
              </span>
              <button
                type="button"
                className="crumb"
                aria-current="page"
                onClick={() => {
                  setTab('inspect');
                  if (isPhone()) setPhoneTab('pane');
                }}
              >
                {selectedName}
              </button>
            </>
          )}
        </nav>
        <span className="sub">
          {m.site.kind}
          {m.civ ? ` of the ${m.civ.name}` : ''}
          {m.culture ? ` · ${m.culture.name}` : ''}
          {m.site.features.length > 0 ? ` · ${joinList(m.site.features)}` : ''}
        </span>
        <span className="sp" />
        <div className="tabs" role="group" aria-label="View">
          <button
            type="button"
            aria-pressed={phoneTab === 'map'}
            onClick={() => {
              window.clearTimeout(paneTimer.current);
              setPhoneTab('map');
            }}
          >
            Map
          </button>
          <button
            type="button"
            aria-pressed={phoneTab === 'pane'}
            onClick={() => {
              window.clearTimeout(paneTimer.current);
              setPhoneTab('pane');
            }}
          >
            Site
          </button>
        </div>
      </div>
      <div className="linkline">
        <span>Link:</span>
        <code data-testid="site-link">{linkText}</code>
        <button type="button" onClick={() => void copyLink()}>
          Copy
        </button>
      </div>
      <div className="main" ref={mainRef} data-tab={phoneTab}>
        <div className="mapcol">
          <div
            className={`mapbox${paint?.whole ? ' whole' : ''}${overviewOpen ? ' ov-open' : ''}`}
            ref={boxRef}
          >
            <canvas
              ref={canvasRef}
              tabIndex={0}
              data-testid="site-canvas"
              data-state={paint ? 'ready' : 'drawing'}
              data-localmap-digest={digest}
              aria-label={`Site map, ${size} by ${size} tiles. Drag to pan, click or tap a tile or a person to inspect it. With the keyboard: arrow keys move a cursor, Shift and arrows pan, Enter inspects, Escape clears, brackets cycle people on a tile.`}
              onFocus={() => {
                const r = renderer.current;
                if (r) {
                  r.state.cursor = { ...cursor.current };
                  r.draw();
                }
              }}
              onBlur={() => {
                const r = renderer.current;
                if (r) {
                  r.state.cursor = null;
                  r.draw();
                }
              }}
              onPointerDown={(event) => {
                const r = renderer.current;
                if (!r) return;
                drag.current = {
                  x: event.clientX,
                  y: event.clientY,
                  cx: r.state.view.cx,
                  cy: r.state.view.cy,
                  moved: false,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                const r = renderer.current;
                const d = drag.current;
                if (!r) return;
                if (d) {
                  const dx = event.clientX - d.x;
                  const dy = event.clientY - d.y;
                  if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) {
                    d.moved = true;
                    event.currentTarget.classList.add('dragging');
                    setTip(null);
                  }
                  if (d.moved) {
                    r.state.view = clampViewport(
                      { z: r.state.view.z, cx: d.cx - dx / r.scale, cy: d.cy - dy / r.scale },
                      r.scale,
                      r.vw,
                      r.vh,
                      size,
                    );
                    r.draw();
                  }
                  return;
                }
                if (event.pointerType !== 'mouse') return;
                const hit = tileUnder(event);
                if (!hit?.tile) {
                  setTip(null);
                  setHover(null);
                  return;
                }
                const k = hit.tile.y * size + hit.tile.x;
                showTip(k, hit.px, hit.py, 0);
                setHover(base.scene.at.get(k)?.[0] ?? null);
              }}
              onPointerLeave={(event) => {
                if (event.pointerType !== 'mouse') return;
                setTip(null);
                setHover(null);
              }}
              onPointerCancel={(event) => {
                drag.current = null;
                event.currentTarget.classList.remove('dragging');
              }}
              onPointerUp={(event) => {
                event.currentTarget.classList.remove('dragging');
                const d = drag.current;
                drag.current = null;
                if (d?.moved) return;
                const hit = tileUnder(event);
                if (!hit?.tile) return;
                cursor.current = { x: hit.tile.x, y: hit.tile.y };
                const k = hit.tile.y * size + hit.tile.x;
                pickTile(k);
                if (event.pointerType !== 'mouse') showTip(k, hit.px, hit.py, TIP_HOLD_MS);
                if (isPhone() && performance.now() - picked.current < 50) {
                  window.clearTimeout(paneTimer.current);
                  paneTimer.current = window.setTimeout(
                    () => setPhoneTab('pane'),
                    PHONE_PANE_DELAY_MS,
                  );
                }
              }}
            />
            {bannerView(bannerRef, '')}
            <div className="where">
              <b>{paint?.zoomLabel ?? 'Zoom'}</b>
              {paint?.whole ? ' · whole site' : ''} ·{' '}
              <span className="north" title="North is up">
                N ↑
              </span>
            </div>
            <div className="zoom">
              <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1)}>
                +
              </button>
              <button type="button" aria-label="Zoom out" onClick={() => zoomBy(-1)}>
                −
              </button>
              <button
                type="button"
                onClick={() => {
                  const r = renderer.current;
                  if (!r) return;
                  r.state.view = { z: 0, cx: size / 2, cy: size / 2 };
                  r.clamp();
                  r.draw();
                }}
              >
                Whole site
              </button>
            </div>
            <button
              type="button"
              className="ovbtn"
              aria-expanded={overviewOpen}
              aria-controls="sv-overview"
              onClick={() => {
                setOverviewOpen((o) => !o);
                window.setTimeout(redrawOverview, 0);
              }}
            >
              Overview
            </button>
            <div
              className="overview"
              id="sv-overview"
              title="Whole site: click to move the view"
              onClick={(event) => {
                const r = renderer.current;
                if (!r) return;
                const box = event.currentTarget.getBoundingClientRect();
                r.state.view.cx = ((event.clientX - box.left) / box.width) * size;
                r.state.view.cy = ((event.clientY - box.top) / box.height) * size;
                r.clamp();
                r.draw();
              }}
            >
              <canvas ref={overviewRef} width={192} height={192} />
            </div>
            {tip && (
              <div className="tip" style={{ left: tip.left, top: tip.top }}>
                {tip.text}
              </div>
            )}
          </div>
        </div>
        <div className="time" ref={timeRef}>
          <div className="row">
            <div className="date" data-testid="site-date">
              <span>{date_}</span>
              <span className={`season ${blockSeason}`}>
                {narrow
                  ? blockSeason
                  : `${blockSeason} · ${month} · ${DAY_BLOCKS[lastBlock]}${shown.restDay ? ' · rest day' : ''}`}
              </span>
              <span
                className={`season wx${chip.warn ? ' warn' : ''}`}
                data-testid="site-weather"
                title="Weather today at the site"
              >
                {chip.text}
              </span>
            </div>
            {!narrow && <span className="sp" />}
            {!narrow && keyButton}
          </div>
          <div className="row">
            <div className="seg" role="group" aria-label="Speed">
              {SPEEDS.map(([value, label, title]) => (
                <button
                  key={value}
                  type="button"
                  title={title}
                  aria-label={value === 0 ? 'Pause' : `${value}×`}
                  aria-pressed={speed === value}
                  onClick={() => setSpeed(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="rate" data-testid="site-rate">
              {rateText}
            </span>
            {narrow && <span className="sp" />}
            {narrow && keyButton}
          </div>
          {keyOpen && <KeyPopover id="sv-key" animals={content.environment.wild.animals.kinds} />}
        </div>
        {bannerView(undefined, ' above')}
        <aside className="pane" aria-label="Site pane">
          <div className="live" aria-live="polite" aria-atomic="true">
            {liveLine}
          </div>
          <div className="ptabs" role="tablist">
            {tabs.map(([id, label, n]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
              >
                {label}
                {n && <span className="n">{n}</span>}
              </button>
            ))}
          </div>
          <div className="body">
            {tab === 'inspect' && <InspectPane m={model} sel={sel} a={actions} ui={ui} />}
            {tab === 'site' && <SitePane m={model} a={actions} />}
            {tab === 'people' && <PeoplePane m={model} sel={sel} a={actions} ui={ui} />}
            {tab === 'chron' && <ChroniclePane m={model} a={actions} ui={ui} live={live} />}
          </div>
        </aside>
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </section>
  );
}

// ---- the key, drawn with the real glyphs ----

const KEY_TILES: [string, string, string, string][] = [
  ['t-grass', ',', 't-grass-ink', 'grass'],
  ['t-scrub', ';', 't-scrub-ink', 'scrub'],
  ['t-wood', '♣', 't-tree', 'woodland (broadleaf)'],
  ['t-wood', '♠', 't-pine', 'pine'],
  ['t-marsh', '"', 't-marsh-ink', 'marsh'],
  ['t-sand', '.', 't-sand-ink', 'shore'],
  ['t-river', '~', 't-water-ink', 'river'],
  ['t-sea', '≈', 't-water-ink', 'sea'],
  ['t-rock', '^', 't-rock-ink', 'rock'],
  ['t-rock', '*', 't-ore', 'ore'],
  ['t-field', '"', 't-field-ink', 'field (bare)'],
  ['t-field', ',', 't-field-ink', 'sown'],
  ['t-crop-grow', '"', 't-crop-grow-ink', 'growing grain'],
  ['t-crop-ripe', '"', 't-crop-ripe-ink', 'ripe grain'],
  ['t-crop-cut', '.', 't-field-ink', 'cut stubble'],
  ['t-crop-ruin', '×', 't-crop-ruin-ink', 'withered or ruined'],
  ['t-crop-frost', '*', 't-crop-frost-ink', 'frost-bitten grain'],
  ['t-snow', '', 't-grass-ink', 'snow on open ground'],
  ['t-fire', '▲', 't-fire-ink', 'fire'],
  ['t-burnt', '#', 't-burnt-ink', 'burnt ground'],
  ['t-threat', 'x', 't-threat-ink', 'raiders or a beast (red disc)'],
  ['t-path', '·', 't-path-ink', 'path'],
];
const KEY_BUILDINGS: [string, string, string, string, string?][] = [
  ['t-wall', '#', 't-wall-ink', 'wall'],
  ['t-floor', '·', 't-floor-ink', 'floor'],
  ['t-floor', '∩', 't-door', 'door'],
  ['t-counted', '', 't-counted-ink', 'counted home (hatched, dotted outline)', 'cnt'],
  ['t-floor', 'O', 't-feature', 'well'],
  ['t-floor', '=', 't-feature', 'stockpile'],
  ['t-floor', '+', 't-feature', 'shrine'],
  ['t-floor', '≡', 't-feature', 'dock'],
  ['t-path', '‖', 't-door', 'bridge'],
];
const KEY_PEOPLE: [string, string, string][] = [
  ['', 'Ab', 'adult'],
  ['child', 'ab', 'child'],
  ['notable', 'Ab', 'notable'],
  ['jarl', 'St', 'ruler'],
  ['elder', 'Ul', 'elder'],
  ['gifted', 'Ab', 'gifted or stronger in magic (✦)'],
];

function KeyPopover({
  id,
  animals,
}: {
  id: string;
  animals: readonly { id: string; name: string; glyph: string }[];
}) {
  const glyph = ([bg, text, ink, label, cls]: [string, string, string, string, string?]) => (
    <span key={label}>
      <i
        className={`g${cls ? ` ${cls}` : ''}`}
        style={{ background: `var(--${bg})`, color: `var(--${ink})` }}
      >
        {text}
      </i>
      {label}
    </span>
  );
  return (
    <div className="keypop" id={id}>
      <div>
        <h4>Terrain</h4>
        <div className="key">{KEY_TILES.map(glyph)}</div>
      </div>
      <div>
        <h4>Buildings</h4>
        <div className="key">{KEY_BUILDINGS.map(glyph)}</div>
      </div>
      <div>
        <h4>People (letters are the first of the name; the ring shows the role)</h4>
        <div className="key">
          {KEY_PEOPLE.map(([cls, text, label]) => (
            <span key={label}>
              <i className={`pd ${cls}`}>{text}</i>
              {label}
            </span>
          ))}
        </div>
      </div>
      <div>
        <h4>Wild animals (letters, no ring)</h4>
        <div className="key">
          {animals.map((k) => (
            <span key={k.id}>
              <i className="g" style={{ background: 'var(--t-grass)', color: 'var(--t-animal)' }}>
                {k.glyph}
              </i>
              {k.name}
            </span>
          ))}
        </div>
      </div>
      <p className="quiet">
        Tiles shade lighter on higher ground. Zoom out to the first step for the whole site.
      </p>
    </div>
  );
}
