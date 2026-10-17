// The Town room: one watched site, drawn calmly, with the person you follow in a side panel. It runs
// on the same site worker and snapshots as the old site view, so the clock, weather, needs and
// activities are the engine's own; this room only draws them and puts the words around them.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  DAYS_PER_YEAR,
  DAY_BLOCKS,
  applySiteSnapshot,
  bandOfAge,
  residentNames,
  eventYear,
  rollWeather,
  yearText,
  type ActiveSite,
  type BlockSpent,
  type ContentBundle,
  type Id,
  type LegendIndex,
  type Narrator,
  type SimEvent,
  type WorldState,
} from '../../engine';
import type { SiteHost } from '../../platform/site-host';
import type { SiteSpeed } from '../../platform/site-worker';
import { cap } from '../format';
import { siteLinkPoint } from '../map-view';
import { RoomShell, type RoomId } from '../rooms/Rooms';
import type { TickListener } from '../SiteView';
import { relation } from '../site-render';
import { weatherChip } from '../site-season';
import {
  createSiteModel,
  dayText,
  doingText,
  lastSpent,
  moodWord,
  shownBlock,
  type SiteModel,
} from '../site-panels';
import '../tales/fonts.css';
import { TownPainter } from './paint';
import {
  defaultFollow,
  leaveDelay,
  pacing,
  peopleLine,
  recentTales,
  sharedRoom,
  snapSheet,
  townBuildings,
  type Resident,
} from './scene';
import './town.css';

interface Props {
  world: WorldState;
  content: ContentBundle;
  index: LegendIndex;
  narrator: Narrator;
  host: SiteHost;
  /** Set to this room's tick handler while it is mounted. */
  ticks: MutableRefObject<TickListener | null>;
  /** Worker errors so far; the clock stops when this changes. */
  failures: number;
  /** The person to follow from the start (from the link or the page the reader came from). */
  follow: Id | null;
  onRoom: (room: RoomId) => void;
  /** "Leave for the world": back to Tales. */
  onLeave: () => void;
  /** "Hall of records": the town's page, outside the town. */
  onRecords: (siteId: Id) => void;
  /** "Their whole life": the person's page in People. */
  onLife: (id: Id) => void;
  /** The address bar follows the day and the person followed. */
  onLink: (parts: { day: number; block: number | null; follow: Id | null }) => void;
}

/** The speeds on offer, in days per second (the site worker's own); the number keys pick them. */
const SPEEDS: [SiteSpeed, string, string][] = [
  [0.125, '⅛×', 'An eighth of a day a second'],
  [0.25, '¼×', 'A quarter of a day a second'],
  [0.5, '½×', 'Half a day a second'],
  [1, '1×', 'One day a second'],
  [4, '4×', 'Four days a second'],
  [16, '16×', 'Sixteen days a second'],
];
const SPEED_WORDS: Record<number, string> = Object.fromEntries(SPEEDS.map(([v, , t]) => [v, t]));
/** The speed play starts at: slow enough to read a routine. */
const DEFAULT_SPEED: SiteSpeed = 0.25;
/** The collapsed sheet's height on a phone (px), and the open sheet's share of the screen. */
const SHEET_PEEK = 190;
const SHEET_OPEN = 0.56;
/** Event types that stop the clock: fires and threats, so a danger is never played past. */
const PAUSE_CATEGORIES = ['fires', 'threats'] as const;
/** Rows listed under "With them" before "and N more". */
const WITH_LIMIT = 5;
/** Tales listed under "Tales told here". */
const TALES_LIMIT = 4;

export function TownRoom(props: Props) {
  const { world, content, host, onRoom } = props;
  const active = world.activeSite!;
  const base = useMemo(
    () => {
      showTodaysWeather(world, content, active);
      return createSiteModel(world, content, props.index, props.narrator);
    },
    // Built once per watched site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [world, content],
  );
  const [snapshots, setSnapshots] = useState(0);
  const [day, setDay] = useState(world.day);
  const [speed, setSpeedState] = useState<SiteSpeed>(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  /** The sheet's height while a finger drags the handle (px); null when it rests. */
  const [dragH, setDragH] = useState<number | null>(null);
  const [zoomed, setZoomed] = useState(false);
  /** Counts the moments the panel catches up with the snapshot (see `held`). */
  const [panelTick, setPanelTick] = useState(0);
  const [followId, setFollowId] = useState<Id | null>(() =>
    props.follow !== null && active.residents.includes(props.follow)
      ? props.follow
      : defaultFollow(active.residents, base.civ?.rulerId),
  );
  const [announce, setAnnounce] = useState('');

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const sideRef = useRef<HTMLElement>(null);
  const measureRef = useRef<() => void>(() => undefined);
  const handle = useRef<{
    y0: number;
    h0: number;
    moved: boolean;
    y: number;
    t: number;
    v: number;
  } | null>(null);
  /** What the panel keeps showing for the followed person until their dot sets off. */
  const held = useRef<Held | null>(null);
  const holdTimer = useRef(0);
  const taps = useRef<{ follow: (id: Id) => void; closeSheet: () => void }>({
    follow: () => undefined,
    closeSheet: () => undefined,
  });
  const painter = useRef<TownPainter | null>(null);
  const resume = useRef<SiteSpeed>(DEFAULT_SPEED);
  const [painted, setPainted] = useState(false);

  // The people as the panel names them: rebuilt after each snapshot so newcomers have names.
  const m: SiteModel = useMemo(
    () => ({ ...base, names: residentNames(world, active.residents) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, snapshots],
  );
  const nameOf = useCallback(
    (id: Id) => m.names.get(id) ?? world.people.get(id)?.name ?? 'Someone',
    [m, world],
  );

  const pauseTypes = () => PAUSE_CATEGORIES.flatMap((c) => content.site.autoPause[c]);
  const latest = useRef({ speed, m, nameOf, followId });
  latest.current = { speed, m, nameOf, followId };

  const setSpeed = useCallback(
    (next: SiteSpeed) => {
      setSpeedState(next);
      if (next !== 0) {
        resume.current = next;
        setNotice(null);
      }
      host.setSpeed(next, pauseTypes());
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [host],
  );

  // ---- the drawing ----

  useEffect(() => {
    const canvas = canvasRef.current!;
    const p = new TownPainter(canvas, content.site);
    p.setSite(active, base.ruleWord === 'jarl');
    p.onPaint = () => setPainted(true);
    painter.current = p;
    const measure = () => {
      const stage = stageRef.current;
      const head = headRef.current;
      const bar = barRef.current;
      if (!stage) return;
      const box = stage.getBoundingClientRect();
      const top = head ? head.getBoundingClientRect().bottom - box.top + 10 : 0;
      const bottom = bar ? box.bottom - bar.getBoundingClientRect().top + 10 : 0;
      p.setPads(top, bottom);
    };
    measureRef.current = measure;
    const relayout = () => {
      measure();
      p.resize();
      p.refresh(world, pacing(0), latest.current.nameOf);
      p.request();
    };
    p.onTap = (x, y) => {
      const id = p.pick(x, y);
      if (id !== null) return taps.current.follow(id);
      p.showName(p.buildingAt(x, y)?.id ?? null);
      taps.current.closeSheet();
    };
    p.onHover = (x, y) => {
      if (x === null) {
        p.setHover(null);
        p.setHoverBuilding(null);
        return;
      }
      const id = p.pick(x, y);
      p.setHover(id);
      p.setHoverBuilding(id === null ? (p.buildingAt(x, y)?.id ?? null) : null);
      canvas.style.cursor = id === null ? 'default' : 'pointer';
    };
    p.onZoomed = setZoomed;
    relayout();
    const observer = new ResizeObserver(() => {
      measure();
      if (p.resize()) p.request();
    });
    observer.observe(canvas);
    if (headRef.current) observer.observe(headRef.current);
    if (barRef.current) observer.observe(barRef.current);
    return () => {
      observer.disconnect();
      window.clearTimeout(holdTimer.current);
      holdTimer.current = 0;
      p.dispose();
      painter.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  // The panel's view of who is where. It catches up when the followed dot sets off, not on the
  // beat of the snapshot, so the words and the dot change together.
  const shown = shownBlock(m);
  const blockName = DAY_BLOCKS[shown.block]!;
  const followed = followId === null ? undefined : world.people.get(followId);
  const residents: Resident[] = useMemo(
    () =>
      active.residents.map((id) => {
        const d = world.people.get(id)?.detail;
        return { id, pos: d?.pos, placeId: d?.placeId };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panelTick, base],
  );
  const blocks = useMemo(
    () =>
      townBuildings(active.buildings.values(), content.site.buildings, base.ruleWord === 'jarl'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panelTick, base],
  );
  const room = useMemo(
    () => (followId === null ? null : sharedRoom(residents, blocks, followId)),
    [residents, blocks, followId],
  );
  useEffect(() => {
    const p = painter.current;
    if (!p) return;
    p.setFollowed(followId);
    p.setBlock(blockName);
  }, [followId, blockName, painted]);
  useEffect(() => {
    painter.current?.setSlow(speed <= 1);
  }, [speed]);

  // ---- the clock ----

  useEffect(() => {
    props.ticks.current = (nextDay, events, _rate, snapshot, stopped) => {
      const { speed: current, m: model } = latest.current;
      world.day = nextDay;
      if (snapshot) {
        const who = latest.current.followId;
        // Keep showing what the followed person was doing until their dot sets off.
        if (who !== null && !holdTimer.current) {
          const p = world.people.get(who);
          held.current = p
            ? {
                id: who,
                spent: lastSpent(p),
                today: p.detail?.today,
                block: shownBlock(model).block,
              }
            : null;
        }
        applySiteSnapshot(world, snapshot);
        base.clock.day = snapshot.day;
        const pace = pacing(current);
        painter.current?.refresh(world, pace, latest.current.nameOf);
        setSnapshots((n) => n + 1);
        const delay =
          who === null ? 0 : leaveDelay(who, pace.spreadMs, world.people.get(who)?.detail?.leaveAt);
        if (delay > 0 && held.current) {
          if (!holdTimer.current) {
            holdTimer.current = window.setTimeout(() => {
              holdTimer.current = 0;
              held.current = null;
              setPanelTick((n) => n + 1);
            }, delay);
          }
        } else {
          held.current = null;
          setPanelTick((n) => n + 1);
        }
      }
      setDay(nextDay);
      if (stopped) setSpeedState(0);
      if (events.length === 0) return;
      for (const e of events) world.events.push(e);
      const stops = pauseTypes();
      const stop = events.find((e) => stops.includes(e.type));
      if (stop) {
        setSpeed(0);
        setNotice(props.narrator.renderEvent(stop));
        const actor = stop.actors.find((id) => model.active.residents.includes(id));
        if (actor !== undefined) setAnnounce(`${props.narrator.renderEvent(stop)}`);
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
    setSpeed(0);
  }, [props.failures, setSpeed]);

  // The address follows the day and the person followed.
  const point = siteLinkPoint(day, active.enteredDay, active.block);
  const { onLink } = props;
  useEffect(() => {
    onLink({ day: point.day, block: point.block, follow: followId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point.day, point.block, followId]);

  // Space plays and pauses anywhere in the room (not while typing); the number keys pick a speed.
  useEffect(() => {
    const typing = (target: EventTarget | null) =>
      Boolean((target as HTMLElement | null)?.closest?.('input,textarea,select,[contenteditable]'));
    const keydown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || typing(event.target)) return;
      if (event.key === ' ') {
        // A focused button would also be pressed by the space; this key is the room's.
        event.preventDefault();
        if (event.repeat) return;
        if (latest.current.speed !== 0) setSpeed(0);
        else setSpeed(resume.current);
        return;
      }
      const speed = /^[1-9]$/.test(event.key) ? SPEEDS[Number(event.key) - 1] : undefined;
      if (speed) {
        event.preventDefault();
        setSpeed(speed[0]);
      }
    };
    const keyup = (event: KeyboardEvent) => {
      if (event.key === ' ' && !typing(event.target)) event.preventDefault();
    };
    document.addEventListener('keydown', keydown);
    document.addEventListener('keyup', keyup);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('keyup', keyup);
    };
  }, [setSpeed]);

  // ---- following ----

  const follow = (id: Id) => {
    window.clearTimeout(holdTimer.current);
    holdTimer.current = 0;
    held.current = null;
    setFollowId(id);
    setAnnounce(`Following ${nameOf(id)}`);
  };
  taps.current = { follow, closeSheet: () => setSheet(false) };
  // Someone asked for who is not here: a Book note or a link named a person who has died, or who
  // lives elsewhere at the end of history. The town opens on someone else; say so.
  const asked =
    props.follow !== null && !active.residents.includes(props.follow)
      ? world.people.get(props.follow)
      : undefined;
  const askedLine = (() => {
    if (!asked) return null;
    const year = `Year ${yearText(Math.floor(active.enteredDay / DAYS_PER_YEAR))}`;
    if (asked.died !== undefined) {
      return `${asked.name} died in Year ${yearText(asked.died)}; this is ${m.site.name} in ${year}.`;
    }
    const elsewhere = asked.siteId == null ? undefined : world.sites.get(asked.siteId)?.name;
    return elsewhere && elsewhere !== m.site.name
      ? `${asked.name} lives in ${elsewhere} in ${year}; this is ${m.site.name}.`
      : `${asked.name} is not in ${m.site.name} in ${year}.`;
  })();

  // The sheet's handle: a tap opens or closes it, a drag follows the finger and snaps to peek or open.
  const sheetOpenPx = () => Math.round(window.innerHeight * SHEET_OPEN);
  const handleDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const h = sideRef.current?.getBoundingClientRect().height ?? SHEET_PEEK;
    handle.current = {
      y0: event.clientY,
      h0: h,
      moved: false,
      y: event.clientY,
      t: event.timeStamp,
      v: 0,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // No capture for a synthetic pointer; the drag still works while it stays on the handle.
    }
  };
  const handleMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const d = handle.current;
    if (!d) return;
    if (Math.abs(event.clientY - d.y0) > 6) d.moved = true;
    const dt = Math.max(1, event.timeStamp - d.t);
    d.v = (event.clientY - d.y) / dt;
    d.y = event.clientY;
    d.t = event.timeStamp;
    if (d.moved) {
      setDragH(Math.max(SHEET_PEEK, Math.min(sheetOpenPx(), d.h0 + d.y0 - event.clientY)));
    }
  };
  const handleUp = () => {
    const d = handle.current;
    handle.current = null;
    if (!d) return;
    if (!d.moved) setSheet((o) => !o);
    else {
      const h = Math.max(SHEET_PEEK, Math.min(sheetOpenPx(), d.h0 + d.y0 - d.y));
      setSheet(snapSheet(h, SHEET_PEEK, sheetOpenPx(), d.v) === 'open');
    }
    setDragH(null);
  };
  // The picture keeps clear of the bar, which rides on top of the sheet; measure once it settles.
  useEffect(() => {
    const timer = window.setTimeout(() => measureRef.current(), 260);
    return () => window.clearTimeout(timer);
  }, [sheet]);
  const tales = useMemo(
    () =>
      recentTales(
        props.index.events({ kind: 'site', id: m.site.id }),
        (id) => props.index.event(id),
        active.enteredDay,
        content.site.notable.minImportance,
        TALES_LIMIT,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base],
  );
  const siteAtCell = useMemo(() => {
    const byCell = new Map<number, string>();
    for (const s of world.sites.values()) byCell.set(s.cell, s.name);
    return byCell;
  }, [world]);

  // ---- words ----

  const chip = weatherChip({ world, active, content }, false);
  const date = dayText(shown.day);
  const civName = m.civ ? ` of the ${m.civ.name}` : '';
  const drawn = useMemo(
    () => active.residents.filter((id) => world.people.get(id)?.detail?.pos).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshots, base],
  );
  const counts = peopleLine(m.total, drawn);
  const sub = `${cap(m.site.kind)}${civName} · ${
    counts.all
      ? `${count(counts.people)} people · all can be followed`
      : `${count(counts.followed)} followed of ${count(counts.people)} people`
  }`;
  const mainStyle = {
    '--sheet': dragH !== null ? `${dragH}px` : sheet ? `${SHEET_OPEN * 100}dvh` : `${SHEET_PEEK}px`,
  } as CSSProperties;

  return (
    <RoomShell current="town" onRoom={onRoom} className="tw-root" data-testid="town">
      <div
        className={`tw-main${sheet ? ' sheet-open' : ''}${dragH !== null ? ' dragging' : ''}`}
        style={mainStyle}
      >
        <div className="tw-stage" ref={stageRef}>
          <canvas
            ref={canvasRef}
            className="tw-canvas"
            data-testid="town-canvas"
            data-state={painted ? 'ready' : 'drawing'}
            aria-label={`${m.site.name}, drawn from above. Click a dot to follow that person; drag to move the view; pinch or scroll to zoom.`}
          />
          <div className="tw-head" ref={headRef}>
            <div className="tw-title">
              <h1>{m.site.name}</h1>
              <p data-testid="town-sub">{sub}</p>
            </div>
            <div className="tw-clock" data-testid="town-clock" data-day={day}>
              <b>{cap(blockName)}</b>
              {date}
              <br />
              <span className={chip.warn ? 'warn' : undefined}>{chip.text}</span>
            </div>
            {zoomed && (
              <button
                type="button"
                className="tw-pill tw-reset"
                data-testid="town-reset"
                onClick={() => painter.current?.resetView()}
              >
                Reset view
              </button>
            )}
          </div>
          {notice && (
            <div className="tw-notice" role="status">
              <b>Paused:</b> {notice}
            </div>
          )}
          <div className="tw-bar" ref={barRef}>
            <button
              type="button"
              className="tw-pill dark"
              data-testid="town-play"
              aria-pressed={speed !== 0}
              onClick={() => (speed === 0 ? setSpeed(resume.current) : setSpeed(0))}
            >
              {speed === 0 ? '▶ Play' : '❚❚ Pause'}
            </button>
            <div className="tw-speeds" role="group" aria-label="Speed">
              {SPEEDS.map(([value, label, title]) => (
                <button
                  key={value}
                  type="button"
                  className="tw-pill"
                  title={title}
                  aria-label={title}
                  aria-pressed={speed === value}
                  data-testid={`town-speed-${value}`}
                  onClick={() => setSpeed(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="tw-rate" data-testid="town-rate">
              {speed === 0 ? 'Paused' : SPEED_WORDS[speed]}
            </span>
            <span className="tw-far" />
            <button
              type="button"
              className="tw-pill"
              data-testid="town-records"
              onClick={() => props.onRecords(m.site.id)}
            >
              Hall of records
            </button>
            <button
              type="button"
              className="tw-pill"
              data-testid="town-leave"
              onClick={props.onLeave}
            >
              Leave for the world
            </button>
          </div>
        </div>
        <aside
          className="tw-side"
          ref={sideRef}
          aria-label={`${m.site.name}: the person you follow`}
        >
          <button
            type="button"
            className="tw-handle"
            aria-expanded={sheet}
            aria-label={sheet ? 'Show less' : 'Show more'}
            data-testid="town-handle"
            onPointerDown={handleDown}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerCancel={() => {
              handle.current = null;
              setDragH(null);
            }}
            onClick={(event) => {
              // A keyboard press (no pointer, detail 0); a tap or drag was handled on pointer up.
              if (event.detail === 0) setSheet((o) => !o);
            }}
          >
            <i />
          </button>
          {askedLine && (
            <p className="tw-asked" data-testid="town-asked">
              {askedLine}
            </p>
          )}
          <FollowingCard
            m={m}
            id={followId}
            block={held.current?.id === followId ? held.current.block : shown.block}
            held={held.current?.id === followId ? held.current : null}
            onLife={props.onLife}
          />
          {room && followed && followId !== null && (
            <WithThem
              m={m}
              room={room}
              followed={followId}
              followedHome={
                [...active.households.values()].find((h) => h.members.includes(followId))?.home ??
                null
              }
              onFollow={follow}
            />
          )}
          <section className="tw-sec">
            <h3>Tales told here</h3>
            {tales.length === 0 ? (
              <p className="tw-quiet">No tale of the wider world has reached {m.site.name}.</p>
            ) : (
              <div className="tw-news" data-testid="town-tales">
                {tales.map((e) => (
                  <div key={e.id}>
                    <small>
                      Year {yearText(eventYear(e))}
                      {e.place !== null && siteAtCell.get(e.place) !== m.site.name
                        ? ` · from ${siteAtCell.get(e.place) ?? 'the wilds'}`
                        : ` · ${m.site.name}’s own`}
                    </small>
                    {props.narrator.renderEvent(e)}
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
      <p className="tw-sr" role="status" aria-live="polite">
        {announce}
      </p>
    </RoomShell>
  );
}

/**
 * The weather of the day the town is entered on. The engine rolls a day's weather when its first
 * block runs, so before anything has run the site still holds the placeholder (0 °C, clear). The
 * same roll is made here, from the same state, so the first view shows what the playing view will;
 * the worker rolls its own copy identically when play starts, and its snapshot replaces this.
 */
function showTodaysWeather(world: WorldState, content: ContentBundle, active: ActiveSite): void {
  if (world.day !== active.enteredDay || active.block !== 0) return;
  const name = world.sites.get(active.siteId)?.name ?? '';
  const cell = world.sites.get(active.siteId)?.cell ?? -1;
  // Nothing is recorded: the events a roll would emit belong to the worker's run.
  const emit = () => ({ id: -1 }) as SimEvent;
  try {
    rollWeather(world, content, active, emit, { name, cell });
  } catch {
    // Without a roll the card shows the placeholder; better than failing to open the town.
  }
}

const count = (n: number) => Math.round(n).toLocaleString('en-US');

/** The first letter of a name, for the round badge. */
const initialOf = (name: string) => name.trim().charAt(0).toUpperCase() || '?';

// ---- the person followed ----

/** What the panel shows of the followed person's doing until their dot sets off. */
interface Held {
  id: Id;
  spent: BlockSpent;
  today: BlockSpent[] | undefined;
  block: number;
}

function FollowingCard({
  m,
  id,
  block,
  held,
  onLife,
}: {
  m: SiteModel;
  id: Id | null;
  block: number;
  held: Held | null;
  onLife: (id: Id) => void;
}) {
  const { world, content, active } = m;
  const p = id === null ? undefined : world.people.get(id);
  if (!p || id === null) {
    return (
      <section className="tw-sec">
        <h3>Following</h3>
        <p className="tw-quiet">Click a dot on the map to follow that person.</p>
      </section>
    );
  }
  const alive = active.residents.includes(id);
  const year = Math.floor(world.day / DAYS_PER_YEAR);
  const age = year - p.born;
  const race = content.races.find((r) => r.id === p.raceId);
  const band = race ? bandOfAge(race, age) : age < 16 ? 'child' : age < 50 ? 'adult' : 'elder';
  const detail = p.detail;
  const job = content.jobs.find((j) => j.id === detail?.jobId);
  const role =
    m.civ?.rulerId === id
      ? cap(m.ruleWord)
      : job
        ? cap(job.worker)
        : band === 'child'
          ? 'Child'
          : band === 'elder'
            ? 'Elder'
            : 'Resident';
  const home = [...active.households.values()].find((h) => h.members.includes(id))?.home ?? null;
  const she = p.sex === 'f';
  if (!alive || !detail) {
    return (
      <section className="tw-sec">
        <h3>Following</h3>
        <div className="tw-who" data-testid="town-following">
          <div className="tw-r">
            <div className="tw-av">{initialOf(p.name)}</div>
            <div>
              <b>{p.name}</b>
              <small>
                {role} · {age} years
              </small>
            </div>
          </div>
          <p className="tw-doing">
            {p.diedDay !== undefined ? `Died on ${dayText(p.diedDay)}.` : 'No longer in the town.'}
          </p>
          <button type="button" className="tw-link" onClick={() => onLife(id)}>
            {she ? 'Her' : 'His'} whole life ›
          </button>
        </div>
      </section>
    );
  }
  // What they are doing in the block that just ran, and the blocks of today before it.
  const spentNow = held ? held.spent : lastSpent(p);
  const earlier = (held ? (held.today ?? []) : (detail.today ?? [])).flatMap((spent, b) =>
    b < block && (spent.activity || spent.with !== undefined)
      ? [`${cap(DAY_BLOCKS[b] ?? '')}: ${lower(doingText(m, spent, home))}`]
      : [],
  );
  const needs = content.needs.filter((n) => detail.needs[n.id] !== undefined);
  return (
    <section className="tw-sec">
      <h3>Following</h3>
      <div className="tw-who" data-testid="town-following">
        <div className="tw-r">
          <div className="tw-av">{initialOf(p.name)}</div>
          <div>
            <b data-testid="town-following-name">{m.names.get(id) ?? p.name}</b>
            <small>
              {role} · age {age} · {moodWord(detail.mood)}
            </small>
          </div>
        </div>
        <p className="tw-doing" data-testid="town-doing">
          {doingText(m, spentNow, home)}.
          {earlier.length > 0 && (
            <span className="tw-earlier"> Earlier: {earlier.slice(-2).join('; ')}.</span>
          )}
        </p>
        <div className="tw-needs" data-testid="town-needs">
          {needs.map((n) => {
            const value = Math.max(0, Math.min(100, Math.round(detail.needs[n.id]!)));
            return (
              <span key={n.id} className={value < n.lowAt ? 'low' : undefined}>
                {n.name}
                <i style={{ ['--v' as string]: `${value}%` }} />
              </span>
            );
          })}
        </div>
        <button
          type="button"
          className="tw-link"
          data-testid="town-life"
          onClick={() => onLife(id)}
        >
          {she ? 'Her' : 'His'} whole life ›
        </button>
      </div>
    </section>
  );
}

const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

// ---- the people in the same room ----

function WithThem({
  m,
  room,
  followed,
  followedHome,
  onFollow,
}: {
  m: SiteModel;
  room: { building: { id: Id; defId: string; label: string | null } | null; ids: Id[] };
  followed: Id;
  followedHome: Id | null;
  onFollow: (id: Id) => void;
}) {
  const { world } = m;
  const me = world.people.get(followed);
  const b = room.building;
  const where = !b
    ? 'out of doors, nearby'
    : b.defId === 'home'
      ? b.id === followedHome
        ? 'at home'
        : 'at a neighbour’s home'
      : b.defId === 'field'
        ? 'in a field'
        : `at the ${(b.label ?? b.defId).toLowerCase()}`;
  const parentsOf = (id: Id) => world.people.get(id)?.family.parents ?? [];
  return (
    <section className="tw-sec">
      <h3>With them</h3>
      <p className="tw-where" data-testid="town-where">
        {where}
      </p>
      {room.ids.length === 0 ? (
        <p className="tw-quiet">No one else is here.</p>
      ) : (
        <div data-testid="town-with">
          {room.ids.slice(0, WITH_LIMIT).map((id) => {
            const other = world.people.get(id);
            const name = m.names.get(id) ?? other?.name ?? 'Someone';
            const kin =
              me && other
                ? relation(
                    {
                      id: me.id,
                      spouses: me.family.spouses,
                      children: me.family.children,
                      parents: me.family.parents,
                    },
                    {
                      id: other.id,
                      sex: other.sex,
                      spouses: other.family.spouses,
                      parents: other.family.parents,
                    },
                    parentsOf,
                  )
                : 'relative';
            const age = other ? Math.floor(world.day / DAYS_PER_YEAR) - other.born : null;
            return (
              <div className="tw-row" key={id}>
                <div className="tw-av grey">{initialOf(name)}</div>
                <span>
                  <button type="button" className="tw-name" onClick={() => onFollow(id)}>
                    {name}
                  </button>
                  <small>
                    {kin !== 'relative' && kin !== 'head of the household'
                      ? cap(kin)
                      : age !== null
                        ? `Age ${age}`
                        : ''}
                  </small>
                </span>
              </div>
            );
          })}
          {room.ids.length > WITH_LIMIT && (
            <p className="tw-quiet">and {room.ids.length - WITH_LIMIT} more</p>
          )}
        </div>
      )}
    </section>
  );
}
