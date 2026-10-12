// Main-thread side of the site worker (M3.1). One watched site at a time: embarking again
// replaces the worker. The worker owns the running world; the main thread mirrors it from the
// whole world sent on embark and leave, and from the events in each tick.

import type { Id, SimEvent, SiteContent, WorldState } from '../engine';
import type { SiteReply, SiteRequest, SiteSpeed } from './site-worker';

export interface SiteHost {
  /** Resolves with the world once its activeSite is set. */
  embark(world: WorldState, content: SiteContent, siteId: Id): Promise<WorldState>;
  /** Founds an outpost at `cell` (name null = a default one) and embarks on it. */
  found(
    world: WorldState,
    content: SiteContent,
    cell: number,
    name: string | null,
  ): Promise<WorldState>;
  setSpeed(daysPerSecond: SiteSpeed): void;
  /** Demotes the site; resolves with the world as it stands, activeSite null. */
  leave(): Promise<WorldState>;
  /** Stops the worker without demoting. */
  dispose(): void;
}

export interface SiteHostHandlers {
  onTick(day: number, events: SimEvent[], rate: number): void;
  onError?(message: string): void;
}

/** Only the plain-data tables cross over: a full content bundle holds functions, which cannot be cloned. */
export function siteContentOf(content: SiteContent): SiteContent {
  const { biomes, resources, races, cultures, eventTypes, settlement, site } = content;
  return { biomes, resources, races, cultures, eventTypes, settlement, site };
}

export function createSiteHost(handlers: SiteHostHandlers): SiteHost {
  let worker: Worker | null = null;
  let waiting: {
    reply: SiteReply['type'];
    resolve: (world: WorldState) => void;
    reject: (error: Error) => void;
  } | null = null;

  const start = (): Worker => {
    worker?.terminate();
    const next = new Worker(new URL('./site-worker.ts', import.meta.url), { type: 'module' });
    next.onmessage = (event: MessageEvent<SiteReply>) => {
      const reply = event.data;
      if (reply.type === 'tick') handlers.onTick(reply.day, reply.events, reply.rate);
      else if (reply.type === 'error') {
        handlers.onError?.(reply.message);
        waiting?.reject(new Error(reply.message));
        waiting = null;
      } else if (waiting && waiting.reply === reply.type) {
        waiting.resolve(reply.world);
        waiting = null;
      }
    };
    next.onerror = (event) => {
      const message = event.message || 'Site worker failed.';
      handlers.onError?.(message);
      waiting?.reject(new Error(message));
      waiting = null;
    };
    worker = next;
    return next;
  };
  const request = (target: Worker, message: SiteRequest, reply: SiteReply['type']) =>
    new Promise<WorldState>((resolve, reject) => {
      waiting?.reject(new Error('cancelled'));
      waiting = { reply, resolve, reject };
      target.postMessage(message);
    });

  return {
    embark: (world, content, siteId) =>
      request(
        start(),
        { type: 'embark', world, content: siteContentOf(content), siteId },
        'embarked',
      ),
    found: (world, content, cell, name) =>
      request(
        start(),
        { type: 'found', world, content: siteContentOf(content), cell, name },
        'embarked',
      ),
    setSpeed: (daysPerSecond) =>
      worker?.postMessage({ type: 'speed', daysPerSecond } satisfies SiteRequest),
    leave() {
      if (!worker) return Promise.reject(new Error('No site is being watched.'));
      return request(worker, { type: 'leave' }, 'left');
    },
    dispose() {
      worker?.terminate();
      worker = null;
      waiting?.reject(new Error('cancelled'));
      waiting = null;
    },
  };
}
