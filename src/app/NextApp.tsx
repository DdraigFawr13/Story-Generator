// The app at `/`: world-map viewer on top (Phase 1, M1.4) beside the Legends pane (M2.7), with the
// Phase 0 day controls, saves and chronicle below.

import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_CONTENT } from '../content';
import {
  BIRTH_TIER_IDS,
  DAYS_PER_YEAR,
  DEFAULT_SYSTEMS,
  RngStream,
  advance,
  applySiteSnapshot,
  biography,
  buildLegendIndex,
  createWorld,
  dateOf,
  eventTitle,
  eventYear,
  historyAt,
  liveSites,
  locate,
  outpostCheck,
  MONTH_NAMES,
  rollAptitude,
  templateNarrator,
  tierOfPower,
  validateContent,
  validateSeed,
  type Id,
  type SimEvent,
  type Simulation,
  type TierId,
  type WorldState,
  type WorldgenStage,
} from '../engine';
import {
  openSaveStore,
  type SaveStore,
  type SaveSummary,
  type SaveView,
} from '../platform/save-store';
import { createSiteHost, type SiteHost } from '../platform/site-host';
import { generateInWorker, type WorldgenJob } from '../platform/worldgen-host';
import { HistoryPlayback } from './HistoryPlayback';
import { Legends } from './Legends';
import {
  openOf,
  pageFromOpen,
  sameRef,
  type CategoryId,
  type LegendNav,
  type PageRef,
  type SiteActions,
} from './legends-ctx';
import { VIEWER_LAYER_IDS } from './MapPanels';
import { SiteView, type SiteLinkParts, type TickListener } from './SiteView';
import { WorldMap, type ViewChange } from './WorldMap';
import { YearSlider, finalHistoryYear } from './YearSlider';
import {
  DEFAULT_LAYER,
  DEFAULT_SEED,
  buildSiteUrl,
  siteLinkPoint,
  buildViewUrl,
  parseViewUrl,
  type SiteLink,
  type ViewState,
  type WorldSize,
  type HistoryLength,
  HISTORY_YEARS,
  type SiteTab,
  type PersonSection,
} from './map-view';
import { nameSaysWhen } from './site-saves';
import './world-map.css';
import './site-view.css';

const SIM: Simulation = { content: DEFAULT_CONTENT, systems: DEFAULT_SYSTEMS };
const CONTENT_PROBLEMS = validateContent(DEFAULT_CONTENT);

const STAGE_LABELS: Record<WorldgenStage, string> = {
  terrain: 'Terrain',
  erosion: 'Erosion',
  climate: 'Climate',
  water: 'Water',
  biomes: 'Biomes',
  volcanoes: 'Volcanoes',
  aura: 'Aura',
  resources: 'Resources',
  habitat: 'Fertility and wildness',
  regions: 'Names and places',
  routes: 'Travel and routes',
  settle: 'Peoples and sites',
  history: 'History',
};
/** The "Play history after generating" choice is kept in this localStorage key. */
const PLAY_HISTORY_KEY = 'sg.playHistory';
function readPlayHistory(): boolean {
  try {
    return window.localStorage.getItem(PLAY_HISTORY_KEY) !== 'off';
  } catch {
    return true;
  }
}
/** How long "Link copied" stays on the button. */
const COPIED_MS = 2000;
/** The site link reaches the address bar at most once in this many ms. */
const SITE_LINK_MS = 1000;

type View = Pick<ViewState, 'layer' | 'at' | 'zoom'>;
const INITIAL_VIEW: View = { layer: DEFAULT_LAYER, at: null, zoom: 0 };
const EMPTY_NAV: LegendNav = {
  open: null,
  trail: [],
  cat: null,
  q: '',
  all: false,
  rev: 0,
  scroll: 0,
};
/** Pages kept in the breadcrumb trail. */
const MAX_TRAIL = 12;

/** What `go` may change: the open page (and its trail), list category, search, "every event". */
interface GoPatch {
  open?: PageRef | null;
  trail?: PageRef[];
  cat?: CategoryId | null;
  q?: string;
  all?: boolean;
}
/** The part of a history entry that is not in its URL. */
interface EntryState {
  trail?: string[];
  all?: boolean;
  scroll?: number;
}
/** The slider year and Legends place a world is shown with. */
interface Restore {
  year: number | null;
  nav: LegendNav;
  /** A watched site to go straight into (a link with `site=`). */
  site?: SiteLink | null;
}

/** What the site view is showing: the site, and what to restore from a link. */
interface Watching {
  siteId: Id;
  name: string;
  key: number;
  restore: {
    events: SimEvent[];
    open: string | null;
    zoom: number | null;
    at: { x: number; y: number } | null;
    tab: SiteTab | null;
    sec: PersonSection | null;
  };
}
/** A site to watch: an existing one, or an outpost to found first. */
type WatchTarget =
  { kind: 'site'; id: Id } | { kind: 'outpost'; cell: number; name: string | null };

/** The history-year date line: engine dates count years from 1, the slider and chronicle from 0. */
function historyDate(day: number): string {
  const date = dateOf(day);
  return `${date.dayOfMonth} ${MONTH_NAMES[date.month]}, Year ${date.year - 1}`;
}

/** The Legends place a link names, with its breadcrumb trail from the entry state when it has one. */
function navFromUrl(url: ViewState, entry: EntryState | null, rev: number): LegendNav {
  const open = pageFromOpen(url.open);
  let trail = open ? (entry?.trail ?? []).flatMap((t) => pageFromOpen(t) ?? []) : [];
  if (open && (trail.length === 0 || !sameRef(trail[trail.length - 1]!, open))) trail = [open];
  return {
    open,
    trail,
    cat: url.cat,
    q: url.q,
    all: entry?.all ?? false,
    rev,
    scroll: entry?.scroll ?? 0,
  };
}

/** The map cell a Legends page is about, if any. */
function cellOfPage(state: WorldState, ref: PageRef): number | null {
  if (ref.kind === 'race') return null;
  if (ref.kind === 'event') return state.events.find((e) => e.id === ref.id)?.place ?? null;
  return locate(state, ref);
}

export function NextApp() {
  const [initial] = useState(() => parseViewUrl(window.location.search, VIEWER_LAYER_IDS));
  const [seedInput, setSeedInput] = useState(initial.seed ?? DEFAULT_SEED);
  const [size, setSize] = useState<WorldSize>(initial.size);
  const [years, setYears] = useState<HistoryLength>(initial.years);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ label: string; fraction: number } | null>(null);
  const [view, setView] = useState<View>({
    layer: initial.layer,
    at: initial.at,
    zoom: initial.zoom,
  });
  const [copy, setCopy] = useState<'idle' | 'ok' | 'failed'>('idle');
  /** The year slider; null means the present day (the final history year). */
  const [sliderYear, setSliderYear] = useState<number | null>(null);
  /** With the year locked, chronicle lines after the slider year fade. */
  const [locked, setLocked] = useState(false);
  /** The history playback replaces the map while set; `from` is the year it starts at. */
  const [playback, setPlayback] = useState<{ from: number; key: number } | null>(null);
  const playbackKey = useRef(0);
  /** Play the history after a world is generated (a Generate click or a link with no year). */
  const [playHistory, setPlayHistory] = useState(readPlayHistory);
  const [nav, setNav] = useState<LegendNav>(EMPTY_NAV);
  const [focus, setFocus] = useState<{ x: number; y: number; key: number } | null>(null);
  /** On narrow screens the map and the Legends pane are tabs. */
  const [tab, setTab] = useState<'map' | 'legends'>(initial.open ? 'legends' : 'map');
  /** The map was opened from a Legends page, so it offers a way back (narrow layout). */
  const [fromLegends, setFromLegends] = useState(false);
  const world = useRef<WorldState>(createWorld(initial.seed ?? DEFAULT_SEED));
  /** The watched site (M3.1): while set, the site view replaces the map and Legends. */
  const [watching, setWatching] = useState<Watching | null>(null);
  const watchingRef = useRef<Watching | null>(null);
  const siteHost = useRef<SiteHost | null>(null);
  const ticks = useRef<TickListener | null>(null);
  /** Counts site worker errors; the site view pauses its clock on each. */
  const [siteFailures, setSiteFailures] = useState(0);
  const watchKey = useRef(0);
  /** Seed, size and history length of the map on screen (the inputs may be mid-edit). */
  const shown = useRef<{ seed: string; size: WorldSize; years: HistoryLength } | null>(null);
  const job = useRef<WorldgenJob | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const narrator = useMemo(
    () => templateNarrator(DEFAULT_CONTENT, (id) => world.current.people.get(id)?.name ?? `#${id}`),
    [],
  );

  // Rebuilt when a world is generated, loaded or stepped (the revision), never per render.
  const legend = useMemo(
    () => buildLegendIndex(world.current, DEFAULT_CONTENT),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revision],
  );
  /** Decoded territory by snapshot year, so scrubbing back and forth decodes each once. */
  const territoryCache = useMemo(
    () => new Map<number, Uint16Array>(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revision],
  );

  // Handlers outlive renders (popstate, debounce), so they read the latest state through refs.
  const latest = useRef({ view, sliderYear, nav, locked, legend, finalYear: 0, playHistory });
  const finalYear = finalHistoryYear(world.current);
  latest.current = { view, sliderYear, nav, locked, legend, finalYear, playHistory };
  /** The next URL write adds a history entry (a page or list change) instead of editing one. */
  const pushNext = useRef(false);

  const urlFor = (
    state: { seed: string; size: WorldSize; years: HistoryLength },
    v: View,
    n: LegendNav,
    y: number | null,
  ) =>
    buildViewUrl({
      ...state,
      ...v,
      year: y !== null && y < latest.current.finalYear ? y : null,
      open: n.open ? openOf(n.open) : null,
      cat: n.cat,
      q: n.q.trim(),
    });
  const writeUrl = (mode: 'push' | 'replace', v: View, n: LegendNav, y: number | null) => {
    if (!shown.current || watchingRef.current) return;
    const entry: EntryState = { trail: n.trail.map(openOf), all: n.all };
    const url = urlFor(shown.current, v, n, y);
    if (mode === 'push') window.history.pushState(entry, '', url);
    else window.history.replaceState({ ...window.history.state, ...entry }, '', url);
  };

  /** Generate in the worker; the old map stays (dimmed) until the new world arrives. */
  const generate = (
    seedText: string,
    worldSize: WorldSize,
    historyYears: HistoryLength,
    next: View,
    mode: 'push' | 'replace',
    restore?: Restore,
    /** Play the history from year 0 when the world arrives, if the box is checked. */
    autoPlay = false,
  ) => {
    let seed: string;
    try {
      seed = validateSeed(seedText);
    } catch (problem) {
      setSeedError((problem as Error).message);
      return;
    }
    setSeedError(null);
    setError(null);
    setProgress({ label: 'Starting…', fraction: 0 });
    const started = generateInWorker(
      seed,
      { width: worldSize, height: worldSize, historyYears },
      DEFAULT_CONTENT,
      (stage, done, total, within) =>
        setProgress({
          label:
            stage === 'history' && within !== undefined
              ? `History, year ${Math.round(within * historyYears)}…`
              : `${STAGE_LABELS[stage]}…`,
          fraction: (done + (within ?? 0)) / total,
        }),
    );
    job.current = started;
    started.promise.then(
      (generated) => {
        world.current = generated;
        shown.current = { seed, size: worldSize, years: historyYears };
        const place = restore ?? {
          year: null,
          nav: { ...EMPTY_NAV, rev: latest.current.nav.rev + 1 },
        };
        latest.current.finalYear = finalHistoryYear(generated);
        setView(next);
        setSliderYear(place.year);
        setNav(place.nav);
        const cell = place.nav.open ? cellOfPage(generated, place.nav.open) : null;
        const width = generated.cells?.width;
        setFocus(
          cell !== null && width ? { x: cell % width, y: Math.floor(cell / width), key: 1 } : null,
        );
        setProgress(null);
        setRevision((n) => n + 1);
        if (autoPlay && latest.current.playHistory && !place.site && generated.playback) {
          playbackKey.current += 1;
          setPlayback({ from: 0, key: playbackKey.current });
        } else setPlayback(null);
        if (place.site) {
          // A link into a site: its view is the first history entry; the world URL waits behind it.
          void watchRef.current({ kind: 'site', id: place.site.site }, place.site, next, place);
        } else writeUrl(mode, next, place.nav, place.year);
      },
      (problem: Error) => {
        if (problem.message === 'cancelled') return;
        setProgress(null);
        setError(problem.message);
      },
    );
  };
  const generateRef = useRef(generate);
  generateRef.current = generate;

  const hostOf = (): SiteHost => {
    siteHost.current ??= createSiteHost({
      onTick: (day, events, rate, snapshot, stopped) =>
        ticks.current?.(day, events, rate, snapshot, stopped),
      onError: (message) => {
        setError(message);
        setSiteFailures((n) => n + 1);
      },
    });
    return siteHost.current;
  };

  /**
   * Starts watching a site (or founds an outpost and watches it). `link` restores a day,
   * selection and view from a URL; then the site URL replaces the current history entry.
   */
  const watch = async (
    target: WatchTarget,
    link?: SiteLink | null,
    fallback?: View,
    place?: Restore,
  ) => {
    const host = hostOf();
    const label =
      target.kind === 'site'
        ? (world.current.sites.get(target.id)?.name ?? 'the site')
        : (target.name ?? 'the outpost');
    setError(null);
    setProgress({ label: `Gathering the people of ${label}…`, fraction: 0.4 });
    try {
      if (target.kind === 'site') {
        const site = world.current.sites.get(target.id);
        if (!site) throw new Error(`There is no site ${target.id} in this world.`);
        if (site.ruinedYear !== undefined) throw new Error(`${site.name} is a ruin.`);
      }
      const embarked =
        target.kind === 'site'
          ? await host.embark(world.current, DEFAULT_CONTENT, target.id)
          : await host.found(world.current, DEFAULT_CONTENT, target.cell, target.name);
      const active = embarked.activeSite;
      if (!active) throw new Error('The site did not start.');
      let events: SimEvent[] = [];
      // A link with a block replays through that block of its day; one without runs whole days.
      const toRun = link ? { days: link.day, blocks: 0 } : { days: 0, blocks: 0 };
      if (link && link.block !== null) {
        toRun.days = link.block === 3 ? link.day + 1 : link.day;
        toRun.blocks = link.block === 3 ? 0 : link.block + 1;
      }
      if (link && (toRun.days > 0 || toRun.blocks > 0)) {
        const ran = await host.run(toRun.days, toRun.blocks);
        embarked.day = ran.day;
        applySiteSnapshot(embarked, ran.snapshot);
        events = ran.events;
        for (const e of events) embarked.events.push(e);
      }
      world.current = embarked;
      const name = embarked.sites.get(active.siteId)?.name ?? label;
      watchKey.current += 1;
      const next: Watching = {
        siteId: active.siteId,
        name,
        key: watchKey.current,
        restore: {
          events,
          open: link?.open ?? null,
          zoom: link?.zoom ?? null,
          at: link?.at ?? null,
          tab: link?.tab ?? null,
          sec: link?.sec ?? null,
        },
      };
      watchingRef.current = next;
      const url = buildSiteUrl({
        seed: embarked.seed,
        size: shown.current?.size ?? 256,
        years: shown.current?.years ?? 250,
        site: active.siteId,
        ...siteLinkPoint(embarked.day, active.enteredDay, active.block),
        open: next.restore.open,
        zoom: next.restore.zoom ?? 2,
        at: next.restore.at ?? { x: 0, y: 0 },
        tab: next.restore.tab,
        sec: next.restore.sec,
      });
      if (link) window.history.replaceState({}, '', url);
      else window.history.pushState({}, '', url);
      setWatching(next);
      setPlayback(null);
      setProgress(null);
      setRevision((n) => n + 1);
    } catch (problem) {
      const message = (problem as Error).message;
      if (message === 'cancelled') return;
      siteHost.current?.dispose();
      siteHost.current = null;
      setProgress(null);
      setError(message);
      if (link && fallback && place) writeUrl('replace', fallback, place.nav, place.year);
    }
  };
  const watchRef = useRef(watch);
  watchRef.current = watch;

  /**
   * M3.12: opens a loaded save. A save made while watching a site carries on watching it in a new
   * worker, exactly where it was saved; any other save shows its world on the map.
   */
  const openSave = async (loaded: WorldState, view?: SaveView) => {
    job.current?.cancel();
    const loadedSize: WorldSize = loaded.params.width <= 128 ? 128 : 256;
    const loadedYears = HISTORY_YEARS.find((y) => y === loaded.params.historyYears) ?? 250;
    const active = loaded.activeSite;
    if (active) {
      const name = loaded.sites.get(active.siteId)?.name ?? 'the site';
      setError(null);
      setProgress({ label: `Opening ${name}…`, fraction: 0.6 });
      try {
        await hostOf().resume(loaded, DEFAULT_CONTENT);
      } catch (problem) {
        const message = (problem as Error).message;
        if (message === 'cancelled') return;
        siteHost.current?.dispose();
        siteHost.current = null;
        setProgress(null);
        setError(message);
        return;
      }
      world.current = loaded;
      shown.current = { seed: loaded.seed, size: loadedSize, years: loadedYears };
      setSeedInput(loaded.seed);
      setSize(loadedSize);
      setYears(loadedYears);
      watchKey.current += 1;
      const next: Watching = {
        siteId: active.siteId,
        name,
        key: watchKey.current,
        // The save's view (selection, zoom, centre, tabs) reopens the scene it was made in.
        restore: {
          events: [],
          open: view?.open ?? null,
          zoom: view?.zoom ?? null,
          at: view?.at ?? null,
          tab: (view?.tab as SiteTab | null | undefined) ?? null,
          sec: (view?.sec as PersonSection | null | undefined) ?? null,
        },
      };
      watchingRef.current = next;
      window.history.pushState(
        {},
        '',
        buildSiteUrl({
          seed: loaded.seed,
          size: loadedSize,
          years: loadedYears,
          site: active.siteId,
          ...siteLinkPoint(loaded.day, active.enteredDay, active.block),
          open: next.restore.open,
          zoom: next.restore.zoom ?? 2,
          at: next.restore.at ?? { x: 0, y: 0 },
          tab: next.restore.tab,
          sec: next.restore.sec,
        }),
      );
      setWatching(next);
      setPlayback(null);
      setProgress(null);
      setRevision((n) => n + 1);
      return;
    }
    // A world save: leave any watched site's worker behind and show the world.
    siteHost.current?.dispose();
    siteHost.current = null;
    watchingRef.current = null;
    setWatching(null);
    world.current = loaded;
    shown.current = { seed: loaded.seed, size: loadedSize, years: loadedYears };
    setSeedInput(loaded.seed);
    setSize(loadedSize);
    setYears(loadedYears);
    setProgress(null);
    setPlayback(null);
    setView((v) => ({ ...v, at: null, zoom: 0 }));
    setSliderYear(null);
    setNav((n) => ({ ...EMPTY_NAV, rev: n.rev + 1 }));
    setFocus(null);
    setRevision((n) => n + 1);
  };

  /** Leaves the site: demotes it, takes the world back and shows the map at the site. */
  const leave = async (pushUrl: boolean): Promise<boolean> => {
    const current = watchingRef.current;
    if (!current || !siteHost.current) return true;
    setProgress({ label: `Leaving ${current.name}…`, fraction: 0.6 });
    try {
      const left = await siteHost.current.leave();
      siteHost.current.dispose();
      siteHost.current = null;
      world.current = left;
      watchingRef.current = null;
      setWatching(null);
      setProgress(null);
      const cell = left.sites.get(current.siteId)?.cell;
      if (cell !== undefined) focusCell(cell);
      setTab('map');
      setNav((n) => ({ ...n, rev: n.rev + 1 }));
      setRevision((n) => n + 1);
      if (pushUrl) {
        window.history.pushState(
          { trail: latest.current.nav.trail.map(openOf), all: latest.current.nav.all },
          '',
          urlFor(
            shown.current!,
            latest.current.view,
            latest.current.nav,
            latest.current.sliderYear,
          ),
        );
      }
      return true;
    } catch (problem) {
      setProgress(null);
      setError((problem as Error).message);
      return false;
    }
  };
  const leaveRef = useRef(leave);
  leaveRef.current = leave;

  /** "Open in Legends" from the site: back to the world, with that page open. */
  const leaveToLegends = async (ref: PageRef) => {
    // Leaving always writes one new world entry after the site's: the nav change `leave` makes
    // pushes it, and `go` then edits that entry. Without this, a ref already open before embarking
    // moves nothing, `go` pushes nothing, and the world URL replaces the site entry.
    pushNext.current = true;
    if (await leave(false)) {
      go({ open: ref }, 'replace');
      setTab('legends');
    } else pushNext.current = false;
  };

  // The site link changes every game day, so the address bar is rewritten at most once a
  // second (browsers throttle history writes), always ending on the latest parts.
  const siteLink = useRef<{ parts: SiteLinkParts | null; last: number; timer: number }>({
    parts: null,
    last: 0,
    timer: 0,
  });
  const flushSiteLink = () => {
    const link = siteLink.current;
    link.timer = 0;
    const current = watchingRef.current;
    if (!link.parts || !current || !shown.current) return;
    link.last = performance.now();
    try {
      window.history.replaceState(
        window.history.state,
        '',
        buildSiteUrl({
          seed: world.current.seed,
          size: shown.current.size,
          years: shown.current.years,
          site: current.siteId,
          ...link.parts,
        }),
      );
    } catch {
      // A refused history write only leaves the address bar a little behind.
    }
  };
  const writeSiteLink = (parts: SiteLinkParts) => {
    const link = siteLink.current;
    link.parts = parts;
    if (link.timer) return;
    const wait = SITE_LINK_MS - (performance.now() - link.last);
    if (wait <= 0) flushSiteLink();
    else link.timer = window.setTimeout(flushSiteLink, wait);
  };

  useEffect(() => {
    generateRef.current(
      initial.seed ?? DEFAULT_SEED,
      initial.size,
      initial.years,
      {
        layer: initial.layer,
        at: initial.at,
        zoom: initial.zoom,
      },
      'replace',
      { year: initial.year, nav: navFromUrl(initial, window.history.state, 0), site: initial.site },
      // Links with a year, an open page or a watched site never auto-play.
      initial.year === null && !initial.open && !initial.site,
    );
    const popstate = () => {
      const url = parseViewUrl(window.location.search, VIEWER_LAYER_IDS);
      const next = { layer: url.layer, at: url.at, zoom: url.zoom };
      const seed = url.seed ?? DEFAULT_SEED;
      const place = {
        year: url.year,
        nav: navFromUrl(url, window.history.state, latest.current.nav.rev + 1),
      };
      const apply = () => {
        setSeedInput(seed);
        setSize(url.size);
        setYears(url.years);
        if (place.nav.open) setTab('legends');
        setPlayback(null);
        if (
          shown.current?.seed === seed &&
          shown.current.size === url.size &&
          shown.current.years === url.years
        ) {
          setView(next);
          setSliderYear(place.year);
          setNav(place.nav);
        } else generateRef.current(seed, url.size, url.years, next, 'replace', place);
      };
      if (watchingRef.current) {
        // Back out of a site: leave it, then show the world the link names.
        if (!url.site) {
          void leaveRef.current(false).then((left) => {
            if (left) apply();
          });
        }
        return;
      }
      if (
        url.site &&
        shown.current?.seed === seed &&
        shown.current.size === url.size &&
        shown.current.years === url.years
      ) {
        void watchRef.current({ kind: 'site', id: url.site.site }, url.site, next, place);
      } else if (url.site) {
        generateRef.current(seed, url.size, url.years, next, 'replace', {
          ...place,
          site: url.site,
        });
      } else apply();
    };
    window.addEventListener('popstate', popstate);
    return () => {
      window.removeEventListener('popstate', popstate);
      job.current?.cancel();
      siteHost.current?.dispose();
      window.clearTimeout(siteLink.current.timer);
    };
  }, [initial]);

  // Layer, selection, zoom, slider and Legends changes edit the current history entry, or add one
  // when `go` asked for it.
  useEffect(() => {
    if (progress) return;
    const mode = pushNext.current ? 'push' : 'replace';
    pushNext.current = false;
    writeUrl(mode, view, nav, sliderYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, sliderYear, nav]);

  const changeView = (change: ViewChange) => setView((v) => ({ ...v, ...change }));
  const copyLink = async () => {
    if (!shown.current) return;
    try {
      await navigator.clipboard.writeText(
        window.location.origin + urlFor(shown.current, view, nav, sliderYear),
      );
      setCopy('ok');
    } catch {
      setCopy('failed');
    }
    window.setTimeout(() => setCopy('idle'), COPIED_MS);
  };

  const focusCell = (cell: number) => {
    const width = world.current.cells?.width;
    if (!width) return;
    setFocus((f) => ({ x: cell % width, y: Math.floor(cell / width), key: (f?.key ?? 0) + 1 }));
  };

  /** Move the Legends pane. A page or list change adds a history entry; the rest edit this one. */
  const go = (patch: GoPatch, mode: 'push' | 'replace' = 'push') => {
    const cur = latest.current.nav;
    const open = patch.open === undefined ? cur.open : patch.open;
    const cat = patch.cat === undefined ? cur.cat : patch.cat;
    const q = patch.q === undefined ? cur.q : patch.q;
    const moved =
      (open === null ? cur.open !== null : cur.open === null || !sameRef(open, cur.open)) ||
      cat !== cur.cat ||
      q.trim() !== cur.q.trim();
    if (!moved && (patch.all === undefined || patch.all === cur.all)) return;
    let trail = cur.trail;
    if (patch.trail) trail = patch.trail;
    else if (open === null) trail = [];
    else if (moved && !(cur.open && sameRef(open, cur.open)))
      trail = [...cur.trail, open].slice(-MAX_TRAIL);
    if (moved && mode === 'push') {
      // Remember where this entry was scrolled to, for browser back.
      const top = document.querySelector('.lg-body')?.scrollTop ?? 0;
      window.history.replaceState({ ...window.history.state, scroll: top }, '');
      pushNext.current = true;
    }
    setNav({
      open,
      trail,
      cat,
      q,
      all: moved ? (patch.all ?? false) : (patch.all ?? cur.all),
      rev: moved ? cur.rev + 1 : cur.rev,
      scroll: 0,
    });
    if (!moved || open === null || (cur.open && sameRef(open, cur.open))) return;
    // Opening a page: show it, and move the map and the slider to it.
    setTab('legends');
    setPlayback(null);
    const { legend: index, locked: lock } = latest.current;
    if (open.kind === 'event') {
      const event = index.event(open.id);
      if (event) {
        setSliderYear(eventYear(event));
        if (event.place !== null) focusCell(event.place);
      }
    } else {
      if (!lock) setSliderYear(null);
      const cell = cellOfPage(world.current, open);
      if (cell !== null) focusCell(cell);
    }
  };

  const hrefOf = (ref: PageRef | null): string => {
    if (!shown.current) return '#';
    const event = ref?.kind === 'event' ? latest.current.legend.event(ref.id) : undefined;
    return urlFor(
      shown.current,
      { layer: view.layer, at: null, zoom: 0 },
      ref ? { ...EMPTY_NAV, open: ref } : { ...EMPTY_NAV, cat: nav.cat, q: nav.q },
      event ? eventYear(event) : null,
    );
  };

  const run = (days: number) => {
    advance(world.current, SIM, days);
    setRevision((n) => n + 1);
  };

  const state = world.current;
  const yearShown = Math.min(sliderYear ?? finalYear, finalYear);
  // The world as of the slider year; the map only gets it when that is before the present.
  const past = useMemo(
    () => historyAt(world.current, yearShown, territoryCache),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revision, yearShown],
  );
  const sitesAt = useMemo(
    () => (yearShown < finalYear ? past.sites : liveSites(world.current)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [past, revision, yearShown < finalYear],
  );
  const titleOf = (event: SimEvent) =>
    eventTitle(
      event,
      DEFAULT_CONTENT.eventTypes.find((d) => d.id === event.type),
    );
  // While an entity page is open its sites are ringed on the map and the rest dim.
  const highlight = useMemo(() => {
    const page = nav.open;
    if (!page || page.kind === 'event' || page.kind === 'race') return null;
    const ids = new Set<Id>();
    if (page.kind === 'civ') {
      for (const [id, s] of sitesAt) if (s.civId === page.id && !s.ruined) ids.add(id);
    } else if (page.kind === 'site') ids.add(page.id);
    else if (page.kind === 'person') {
      const home = state.people.get(page.id)?.siteId;
      if (home != null) ids.add(home);
    } else if (page.kind === 'dynasty') {
      for (const p of state.people.values()) {
        if (p.dynastyId === page.id && p.siteId != null) ids.add(p.siteId);
      }
    }
    return ids.size > 0 ? ids : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.open, sitesAt, revision]);
  if (watching && state.activeSite) {
    return (
      <main className="sv-root" data-revision={revision}>
        <h1>Story Generator — {watching.name}</h1>
        {error && <p role="alert">{error}</p>}
        <SiteView
          key={watching.key}
          world={state}
          content={DEFAULT_CONTENT}
          index={legend}
          narrator={narrator}
          host={hostOf()}
          ticks={ticks}
          failures={siteFailures}
          restore={watching.restore}
          onLeave={() => void leave(true)}
          onLoadSave={(loaded, view) => void openSave(loaded, view)}
          onOpenLegends={(ref) => void leaveToLegends(ref)}
          hrefOf={hrefOf}
          onLink={writeSiteLink}
        />
      </main>
    );
  }
  /** Watching and founding act on the present day only, and one thing at a time. */
  const actions: SiteActions = {
    world: state,
    content: DEFAULT_CONTENT,
    enabled: yearShown >= finalYear && progress === null,
    watch: (siteId: Id) => void watch({ kind: 'site', id: siteId }),
    outpostCheck: (cell: number) => outpostCheck(state, DEFAULT_CONTENT, cell),
    found: (cell: number, name: string) =>
      void watch({ kind: 'outpost', cell, name: name === '' ? null : name }),
  };
  return (
    <main className="wm-root" data-revision={revision}>
      <h1>Story Generator — world map</h1>
      {CONTENT_PROBLEMS.length > 0 && (
        <pre role="alert" style={{ color: '#b00020' }}>
          {CONTENT_PROBLEMS.join('\n')}
        </pre>
      )}
      <div className="wm-app">
        <form
          className="bar"
          onSubmit={(event) => {
            event.preventDefault();
            generate(
              seedInput,
              size,
              years,
              { ...INITIAL_VIEW, layer: view.layer },
              'push',
              undefined,
              true,
            );
          }}
        >
          <span className="brand">New world</span>
          <label>
            Seed{' '}
            <input
              value={seedInput}
              spellCheck={false}
              aria-invalid={seedError !== null}
              onChange={(event) => setSeedInput(event.target.value)}
            />
          </label>
          <label>
            Size{' '}
            <select
              value={size}
              onChange={(event) => setSize(Number(event.target.value) as WorldSize)}
            >
              <option value={256}>256 × 256</option>
              <option value={128}>128 × 128 (small)</option>
            </select>
          </label>
          <label>
            History{' '}
            <select
              value={years}
              onChange={(event) => setYears(Number(event.target.value) as HistoryLength)}
            >
              <option value={250}>250 years</option>
              <option value={500}>500 years (slower)</option>
              <option value={1000}>1000 years (slowest)</option>
            </select>
          </label>
          <button type="submit" className="primary">
            Generate
          </button>
          <label className="play-history">
            <input
              type="checkbox"
              checked={playHistory}
              onChange={(event) => {
                setPlayHistory(event.target.checked);
                try {
                  window.localStorage.setItem(
                    PLAY_HISTORY_KEY,
                    event.target.checked ? 'on' : 'off',
                  );
                } catch {
                  // The choice then lasts only until the page closes.
                }
              }}
            />{' '}
            Play history after generating
          </label>
          <button type="button" onClick={() => void copyLink()}>
            {copy === 'ok' ? 'Link copied' : copy === 'failed' ? 'Copy failed' : 'Copy link'}
          </button>
          <div className="tabs" role="group" aria-label="View">
            <button
              type="button"
              aria-pressed={tab === 'map'}
              onClick={() => {
                setFromLegends(false);
                setTab('map');
              }}
            >
              Map
            </button>
            <button
              type="button"
              aria-pressed={tab === 'legends'}
              onClick={() => setTab('legends')}
            >
              Legends
            </button>
          </div>
          {seedError && (
            <p role="alert" className="field-error">
              {seedError}
            </p>
          )}
        </form>
        <div className="progress" aria-live="polite">
          <i style={{ width: progress ? `${progress.fraction * 100}%` : 0 }} />
          <span className="progress-label">{progress?.label ?? ''}</span>
        </div>
        <div className="wm-main" data-tab={tab}>
          <div className="wm-mapcol">
            {playback ? (
              <HistoryPlayback
                key={playback.key}
                world={state}
                titleOf={titleOf}
                startYear={playback.from}
                onClose={(year) => {
                  setPlayback(null);
                  setSliderYear(year >= finalYear ? null : year);
                }}
                onLegends={() => {
                  setPlayback(null);
                  setSliderYear(null);
                  setTab('legends');
                }}
              />
            ) : (
              <>
                <WorldMap
                  cells={state.cells}
                  regions={state.regions}
                  routes={state.routes}
                  sites={state.sites}
                  civs={state.civs}
                  creatures={state.creatures}
                  people={state.people}
                  dynasties={state.dynasties}
                  year={Math.floor(state.day / DAYS_PER_YEAR)}
                  siteBiography={(siteId) =>
                    biography(state, DEFAULT_CONTENT, narrator, legend, {
                      kind: 'site',
                      id: siteId,
                    })
                  }
                  cultures={DEFAULT_CONTENT.cultures}
                  seed={state.seed}
                  content={DEFAULT_CONTENT}
                  layer={view.layer}
                  at={view.at}
                  zoom={view.zoom}
                  busy={progress !== null}
                  onView={changeView}
                  history={yearShown < finalYear ? past : null}
                  focus={focus}
                  highlight={highlight}
                  onBackToLegends={
                    fromLegends && tab === 'map' ? () => setTab('legends') : undefined
                  }
                  siteActions={actions}
                />
                <YearSlider
                  world={state}
                  titleOf={titleOf}
                  revision={revision}
                  year={yearShown}
                  snapshotYear={past.snapshotYear}
                  locked={locked}
                  onLock={setLocked}
                  onYear={setSliderYear}
                  onPlay={
                    state.playback
                      ? () => {
                          playbackKey.current += 1;
                          setPlayback({
                            from: yearShown >= finalYear ? 0 : yearShown,
                            key: playbackKey.current,
                          });
                        }
                      : null
                  }
                />
              </>
            )}
          </div>
          <Legends
            world={state}
            index={legend}
            narrator={narrator}
            content={DEFAULT_CONTENT}
            year={yearShown}
            finalYear={finalYear}
            locked={locked}
            sitesAt={sitesAt}
            nav={nav}
            go={go}
            hrefOf={hrefOf}
            siteActions={actions}
            onShow={(cell) => {
              setPlayback(null);
              focusCell(cell);
              setFromLegends(true);
              setTab('map');
            }}
            onOpenOnMap={(cell, year) => {
              setPlayback(null);
              setSliderYear(year);
              if (cell !== null) focusCell(cell);
              setFromLegends(true);
              setTab('map');
            }}
            onGoMap={() => {
              setFromLegends(false);
              setTab('map');
            }}
          />
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="wm-below">
        <section aria-label="Time controls" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => run(1)}>+1 day</button>
          <button onClick={() => run(28)}>+1 month</button>
          <button onClick={() => run(336)}>+1 year</button>
        </section>
        <p>
          <strong>{historyDate(state.day)}</strong> · weather: {state.weather.current} · events:{' '}
          {state.events.length}
        </p>
        <SavePanel world={state} onLoad={(loaded, view) => void openSave(loaded, view)} />
        <AptitudePreview seed={state.seed} />
      </div>
    </main>
  );
}

/** Dev view of R-13: how magic aptitude falls out per race for 5,000 births. */
function AptitudePreview({ seed }: { seed: string }) {
  const rows = useMemo(
    () =>
      DEFAULT_CONTENT.races.map((race) => {
        // A preview stream outside world state: viewing never changes history.
        const rng = RngStream.detached(seed, `preview.${race.id}`);
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

/** Named browser saves (M0.3). Loading replaces the world only after it validates. */
function SavePanel({
  world,
  onLoad,
}: {
  world: WorldState;
  onLoad: (world: WorldState, view?: SaveView) => void;
}) {
  const [store, setStore] = useState<SaveStore | null>(null);
  const [persistent, setPersistent] = useState(true);
  const [saves, setSaves] = useState<SaveSummary[]>([]);
  const [name, setName] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void openSaveStore().then(async (opened) => {
      if (!active) return;
      setStore(opened.store);
      setPersistent(opened.persistent);
      setSaves(await opened.store.list());
    });
    return () => {
      active = false;
    };
  }, []);

  const attempt = async (action: () => Promise<string>) => {
    if (!store) return;
    try {
      setStatus(await action());
      setSaves(await store.list());
    } catch (problem) {
      setStatus((problem as Error).message);
    }
  };

  return (
    <section aria-label="Saves" style={{ margin: '12px 0' }}>
      <h2 style={{ fontSize: 18 }}>Saves</h2>
      {!persistent && <p>This browser is not keeping saves; they last until the page closes.</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label>
          Save name{' '}
          <input value={name} placeholder={world.seed} onChange={(e) => setName(e.target.value)} />
        </label>
        <button
          disabled={!store}
          onClick={() =>
            void attempt(async () => {
              const saved = await store!.save(name || world.seed, world);
              return `Saved "${saved.name}" at ${historyDate(saved.day)}.`;
            })
          }
        >
          Save
        </button>
      </div>
      {status && <p role="status">{status}</p>}
      <ul style={{ paddingLeft: 20 }}>
        {saves.map((save) => (
          <li key={save.name}>
            {save.name} · {save.seed}
            {nameSaysWhen(save) ? '' : ` · ${historyDate(save.day)}`}
            {save.site ? ` · watching ${save.site}` : ''}{' '}
            <button
              aria-label={`Load ${save.name}`}
              onClick={() =>
                void attempt(async () => {
                  onLoad(await store!.load(save.name), save.view);
                  return `Loaded "${save.name}".`;
                })
              }
            >
              Load
            </button>{' '}
            <button
              aria-label={`Delete ${save.name}`}
              onClick={() =>
                void attempt(async () => {
                  await store!.remove(save.name);
                  return `Deleted "${save.name}".`;
                })
              }
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
