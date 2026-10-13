// Web Worker entry for the live site (M3.1): owns the watched world, runs days at the requested
// speed off the main thread, and sends back events. The whole world crosses only when embarking
// and leaving; ticks carry just the new events.

import {
  embark,
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

export type SiteSpeed = 0 | 1 | 4 | 16;

export type SiteRequest =
  | { type: 'embark'; world: WorldState; content: SiteContent; siteId: Id }
  | { type: 'found'; world: WorldState; content: SiteContent; cell: number; name: string | null }
  | { type: 'speed'; daysPerSecond: SiteSpeed; stopOn?: readonly string[] }
  /** Runs this many days at once (restoring a link), paused. */
  | { type: 'run'; days: number }
  | { type: 'leave' };

export type SiteReply =
  | { type: 'embarked'; world: WorldState }
  /** `rate` is the measured days per second over the last second. */
  | { type: 'tick'; day: number; events: SimEvent[]; rate: number; snapshot?: SiteSnapshot }
  | { type: 'ran'; day: number; events: SimEvent[]; snapshot: SiteSnapshot }
  | { type: 'left'; world: WorldState }
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
  // Blocks owed since the last slice (speed days a second, four blocks a day); capped at one
  // second's worth so a stall never causes a burst.
  const perSecond = speed * BLOCKS_PER_DAY;
  owed = Math.min(owed + ((now - lastSlice) * perSecond) / 1000, perSecond);
  lastSlice = now;
  const blocks = Math.floor(owed);
  owed -= blocks;
  const events: SimEvent[] = [];
  try {
    for (let i = 0; i < blocks && speed !== 0; i += 1) {
      for (const e of stepBlock(world, content)) {
        events.push(e);
        // An auto-pause event stops the clock on its own block, so the map shows that moment.
        if (stopOn.has(e.type)) speed = 0;
      }
    }
  } catch (problem) {
    scope.postMessage({ type: 'error', message: (problem as Error).message });
    return;
  }
  windowBlocks += blocks;
  if (now - windowStart >= RATE_WINDOW_MS) {
    rate = (windowBlocks * 1000) / (BLOCKS_PER_DAY * (now - windowStart));
    windowStart = now;
    windowBlocks = 0;
  }
  if (blocks > 0) {
    const snapshot =
      speed === 0 || now - lastSnapshot >= SNAPSHOT_MS ? snapshotNow(world) : undefined;
    if (snapshot) lastSnapshot = now;
    scope.postMessage(
      snapshot
        ? { type: 'tick', day: world.day, events, rate, snapshot }
        : { type: 'tick', day: world.day, events, rate },
    );
  }
  if (speed !== 0) timer = setTimeout(slice, SLICE_MS);
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
    } else if (request.type === 'speed') {
      speed = request.daysPerSecond;
      stopOn = new Set(request.stopOn ?? []);
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
      scope.postMessage({ type: 'ran', day: world.day, events, snapshot: snapshotNow(world) });
    } else {
      if (!world || !content) throw new Error('No site is being watched.');
      stop();
      speed = 0;
      leaveSite(world, content);
      scope.postMessage({ type: 'left', world });
      world = null;
      content = null;
    }
  } catch (problem) {
    scope.postMessage({ type: 'error', message: (problem as Error).message });
  }
});
