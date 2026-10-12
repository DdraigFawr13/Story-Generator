// Web Worker entry for the live site (M3.1): owns the watched world, runs days at the requested
// speed off the main thread, and sends back events. The whole world crosses only when embarking
// and leaving; ticks carry just the new events.

import {
  embark,
  foundOutpost,
  leaveSite,
  stepSite,
  type Id,
  type SimEvent,
  type SiteContent,
  type WorldState,
} from '../engine';

export type SiteSpeed = 0 | 1 | 4 | 16;

export type SiteRequest =
  | { type: 'embark'; world: WorldState; content: SiteContent; siteId: Id }
  | { type: 'found'; world: WorldState; content: SiteContent; cell: number; name: string | null }
  | { type: 'speed'; daysPerSecond: SiteSpeed }
  /** Runs this many days at once (restoring a link), paused. */
  | { type: 'run'; days: number }
  | { type: 'leave' };

export type SiteReply =
  | { type: 'embarked'; world: WorldState }
  /** `rate` is the measured days per second over the last second. */
  | { type: 'tick'; day: number; events: SimEvent[]; rate: number }
  | { type: 'ran'; day: number; events: SimEvent[] }
  | { type: 'left'; world: WorldState }
  | { type: 'error'; message: string };

/** Time between slices; a fast speed runs its days in many small slices so the worker stays responsive. */
const SLICE_MS = 60;
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
let windowDays = 0;
let rate = 0;

function stop(): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
}

function slice(): void {
  timer = undefined;
  if (!world || !content || speed === 0) return;
  const now = performance.now();
  // Days owed since the last slice; capped at one second's worth so a stall never causes a burst.
  owed = Math.min(owed + ((now - lastSlice) * speed) / 1000, speed);
  lastSlice = now;
  const days = Math.floor(owed);
  owed -= days;
  const events: SimEvent[] = [];
  try {
    for (let i = 0; i < days; i += 1) for (const e of stepSite(world, content)) events.push(e);
  } catch (problem) {
    scope.postMessage({ type: 'error', message: (problem as Error).message });
    return;
  }
  windowDays += days;
  if (now - windowStart >= RATE_WINDOW_MS) {
    rate = (windowDays * 1000) / (now - windowStart);
    windowStart = now;
    windowDays = 0;
  }
  if (days > 0) scope.postMessage({ type: 'tick', day: world.day, events, rate });
  timer = setTimeout(slice, SLICE_MS);
}

function restart(): void {
  stop();
  lastSlice = performance.now();
  windowStart = lastSlice;
  windowDays = 0;
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
      scope.postMessage({ type: 'embarked', world });
    } else if (request.type === 'speed') {
      speed = request.daysPerSecond;
      restart();
    } else if (request.type === 'run') {
      if (!world || !content) throw new Error('No site is being watched.');
      const events: SimEvent[] = [];
      for (let i = 0; i < request.days; i += 1) {
        for (const e of stepSite(world, content)) events.push(e);
      }
      scope.postMessage({ type: 'ran', day: world.day, events });
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
