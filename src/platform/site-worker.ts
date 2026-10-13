// Web Worker entry for the live site (M3.1): owns the watched world, runs days at the requested
// speed off the main thread, and sends back events. The whole world crosses only when embarking
// and leaving; ticks carry just the new events. M3.12: "Next notable" runs flat out until an
// important event; a save is serialized and gzipped here, and a loaded save resumes here.

import {
  embark,
  serializeWorld,
  foundOutpost,
  leaveSite,
  siteSnapshot,
  stepBlock,
  stepSite,
  type Id,
  type SimEvent,
  type SiteContent,
  type SiteSnapshot,
  type WorldState,
} from '../engine';
import { compress, headerOf, type SaveHeader } from './save-store';

/** Days a second; ½ is the default when play starts (village life: one block every half second). */
export type SiteSpeed = 0 | 0.5 | 1 | 4 | 16;

export type SiteRequest =
  | { type: 'embark'; world: WorldState; content: SiteContent; siteId: Id }
  | { type: 'found'; world: WorldState; content: SiteContent; cell: number; name: string | null }
  /** M3.12: carries on watching the site of a loaded save (its `activeSite` is set). */
  | { type: 'resume'; world: WorldState; content: SiteContent }
  | {
      type: 'speed';
      daysPerSecond: SiteSpeed;
      stopOn?: readonly string[];
      /** M3.12: run as fast as the worker can until an event this important, or `maxDays` pass. */
      until?: { minImportance: number; maxDays: number };
    }
  /** M3.12: the world as it stands, serialized and gzipped for a save. */
  | { type: 'save' }
  /** Runs this many days at once (restoring a link), paused. */
  | { type: 'run'; days: number; blocks?: number }
  | { type: 'leave' };

export type SiteReply =
  | { type: 'embarked'; world: WorldState }
  /**
   * `rate` is the measured days per second over the last second. `stopped` ends a "Next notable"
   * run: on an important (or auto-pause) event, or at the day limit with nothing notable.
   */
  | {
      type: 'tick';
      day: number;
      events: SimEvent[];
      rate: number;
      snapshot?: SiteSnapshot;
      stopped?: 'notable' | 'limit';
    }
  | { type: 'saved'; header: SaveHeader; data: Uint8Array }
  | { type: 'ran'; day: number; events: SimEvent[]; snapshot: SiteSnapshot }
  | { type: 'left'; world: WorldState }
  | { type: 'resumed' }
  | { type: 'error'; message: string };

/** Time between slices; a fast speed runs its days in many small slices so the worker stays responsive. */
const SLICE_MS = 60;
/** Day blocks in a game day (DAY_BLOCKS); owed work is counted in blocks so people move visibly. */
const BLOCKS_PER_DAY = 4;
/** A snapshot (every followed person's detail) is attached to ticks at most this often. */
const SNAPSHOT_MS = 100;
/** Event types that stop the clock on the block that emits them (set with each speed change). */
let stopOn: ReadonlySet<string> = new Set();
/** Length of the window over which the measured rate is averaged. */
const RATE_WINDOW_MS = 1000;
/** Work time per slice while running until notable; the rest of each slice is left for messages. */
const UNTIL_SLICE_MS = 45;

const scope = self as unknown as { postMessage(reply: SiteReply): void };

let world: WorldState | null = null;
let content: SiteContent | null = null;
let speed: SiteSpeed = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let lastSlice = 0;
let owed = 0;
let windowStart = 0;
let rate = 0;
let lastSnapshot = 0;
/** `layoutVersion` of the last snapshot sent; the map layers ride along only when it moves. */
let sentVersion = -1;
/** `peopleVersion` of the last snapshot sent; the new people ride along only when it moves. */
let sentPeople = -1;
/** Days run since the window began, in blocks. */
let windowBlocks = 0;
/** The running "Next notable": the importance that stops it and the last day it may run to. */
let until: { minImportance: number; lastDay: number } | null = null;

function stop(): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
}

/** A snapshot that leaves out the map layers the main thread already has. */
function snapshotNow(current: WorldState): SiteSnapshot {
  const snapshot = siteSnapshot(current, sentVersion, sentPeople);
  sentVersion = snapshot.layoutVersion;
  sentPeople = snapshot.peopleVersion;
  return snapshot;
}

function slice(): void {
  timer = undefined;
  if (!world || !content || speed === 0) return;
  const now = performance.now();
  const events: SimEvent[] = [];
  let blocks = 0;
  let stopped: 'notable' | 'limit' | undefined;
  try {
    if (until) {
      // Flat out for a slice's worth of work, then yield so pause and save requests get through.
      while (speed !== 0 && performance.now() - now < UNTIL_SLICE_MS) {
        for (const e of stepBlock(world, content)) {
          events.push(e);
          if (e.importance >= until.minImportance || stopOn.has(e.type)) speed = 0;
        }
        blocks += 1;
        if (speed === 0) stopped = 'notable';
        else if (world.day >= until.lastDay && world.activeSite?.block === 0) {
          speed = 0;
          stopped = 'limit';
        }
      }
      if (speed === 0) until = null;
    } else {
      // Blocks owed since the last slice (speed days a second, four blocks a day); capped at one
      // second's worth so a stall never causes a burst.
      const perSecond = speed * BLOCKS_PER_DAY;
      owed = Math.min(owed + ((now - lastSlice) * perSecond) / 1000, perSecond);
      lastSlice = now;
      blocks = Math.floor(owed);
      owed -= blocks;
      for (let i = 0; i < blocks && speed !== 0; i += 1) {
        for (const e of stepBlock(world, content)) {
          events.push(e);
          // An auto-pause event stops the clock on its own block, so the map shows that moment.
          if (stopOn.has(e.type)) speed = 0;
        }
      }
    }
  } catch (problem) {
    until = null;
    scope.postMessage({ type: 'error', message: (problem as Error).message });
    return;
  }
  const after = performance.now();
  windowBlocks += blocks;
  if (after - windowStart >= RATE_WINDOW_MS) {
    rate = (windowBlocks * 1000) / (BLOCKS_PER_DAY * (after - windowStart));
    windowStart = after;
    windowBlocks = 0;
  }
  if (blocks > 0) {
    const snapshot =
      speed === 0 || after - lastSnapshot >= SNAPSHOT_MS ? snapshotNow(world) : undefined;
    if (snapshot) lastSnapshot = after;
    const tick: SiteReply = { type: 'tick', day: world.day, events, rate };
    if (snapshot) tick.snapshot = snapshot;
    if (stopped) tick.stopped = stopped;
    scope.postMessage(tick);
  }
  if (speed !== 0) timer = setTimeout(slice, until ? 0 : SLICE_MS);
}

function restart(): void {
  stop();
  lastSlice = performance.now();
  windowStart = lastSlice;
  windowBlocks = 0;
  lastSnapshot = 0;
  owed = 0;
  rate = 0;
  if (speed !== 0) timer = setTimeout(slice, SLICE_MS);
}

self.addEventListener('message', (event: MessageEvent<SiteRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'embark' || request.type === 'found') {
      stop();
      speed = 0;
      world = request.world;
      content = request.content;
      const siteId =
        request.type === 'embark'
          ? request.siteId
          : foundOutpost(world, content, request.cell, request.name);
      embark(world, content, siteId);
      // The copy sent back carries the map as it stands now.
      sentVersion = world.activeSite?.layoutVersion ?? -1;
      sentPeople = world.activeSite?.peopleVersion ?? -1;
      scope.postMessage({ type: 'embarked', world });
    } else if (request.type === 'resume') {
      stop();
      speed = 0;
      until = null;
      world = request.world;
      content = request.content;
      if (!world.activeSite) throw new Error('This save has no watched site.');
      sentVersion = world.activeSite.layoutVersion;
      sentPeople = world.activeSite.peopleVersion;
      scope.postMessage({ type: 'resumed' });
    } else if (request.type === 'save') {
      if (!world) throw new Error('No site is being watched.');
      // Serialized now (synchronously, between slices), so the save is this exact moment.
      const header = headerOf(world);
      void compress(serializeWorld(world)).then(
        (data) =>
          (scope as unknown as Worker).postMessage({ type: 'saved', header, data }, [data.buffer]),
        (problem: Error) => scope.postMessage({ type: 'error', message: problem.message }),
      );
    } else if (request.type === 'speed') {
      speed = request.daysPerSecond;
      stopOn = new Set(request.stopOn ?? []);
      until =
        request.until && world && speed !== 0
          ? {
              minImportance: request.until.minImportance,
              lastDay: world.day + request.until.maxDays,
            }
          : null;
      restart();
      // Pausing sends the state as it stands, so the main thread's copy ends exact.
      if (speed === 0 && world) {
        scope.postMessage({
          type: 'tick',
          day: world.day,
          events: [],
          rate: 0,
          snapshot: snapshotNow(world),
        });
      }
    } else if (request.type === 'run') {
      if (!world || !content) throw new Error('No site is being watched.');
      const events: SimEvent[] = [];
      for (let i = 0; i < request.days; i += 1) {
        for (const e of stepSite(world, content)) events.push(e);
      }
      // Then part of a day: the link's block (0-3 more blocks, short of a whole day).
      for (let i = 0; i < (request.blocks ?? 0); i += 1) {
        for (const e of stepBlock(world, content)) events.push(e);
      }
      scope.postMessage({ type: 'ran', day: world.day, events, snapshot: snapshotNow(world) });
    } else {
      if (!world || !content) throw new Error('No site is being watched.');
      stop();
      speed = 0;
      until = null;
      leaveSite(world, content);
      scope.postMessage({ type: 'left', world });
      world = null;
      content = null;
    }
  } catch (problem) {
    scope.postMessage({ type: 'error', message: (problem as Error).message });
  }
});
