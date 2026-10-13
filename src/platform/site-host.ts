// Main-thread side of the site worker (M3.1). One watched site at a time: embarking again
// replaces the worker. The worker owns the running world; the main thread mirrors it from the
// whole world sent on embark and leave, and from the events in each tick.

import type { Id, SimEvent, SiteContent, SiteSnapshot, WorldState } from '../engine';
import type { SaveHeader } from './save-store';
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
  /** M3.12: carries on watching the site of a loaded save, in a new worker. */
  resume(world: WorldState, content: SiteContent): Promise<void>;
  /**
   * `stopOn`: event types that stop the clock on the block that emits them (the auto-pause).
   * `until` (M3.12): run flat out until an event this important, or `maxDays` pass.
   */
  setSpeed(
    daysPerSecond: SiteSpeed,
    stopOn?: readonly string[],
    until?: { minImportance: number; maxDays: number },
  ): void;
  /** M3.12: the running world, serialized and gzipped by the worker, for a save. */
  save(): Promise<{ header: SaveHeader; data: Uint8Array }>;
  /** Runs `days` days, then `blocks` more blocks, at once; resolves with the new day, the events they emitted and the state after. */
  run(
    days: number,
    blocks?: number,
  ): Promise<{ day: number; events: SimEvent[]; snapshot: SiteSnapshot }>;
  /** Demotes the site; resolves with the world as it stands, activeSite null. */
  leave(): Promise<WorldState>;
  /** Stops the worker without demoting. */
  dispose(): void;
}

export interface SiteHostHandlers {
  /** `snapshot` rides along at most every 100 ms, and always when the clock stops; `stopped` ends a "Next notable" run. */
  onTick(
    day: number,
    events: SimEvent[],
    rate: number,
    snapshot?: SiteSnapshot,
    stopped?: 'notable' | 'limit',
  ): void;
  onError?(message: string): void;
}

/** Only the plain-data tables cross over: a full content bundle holds functions, which cannot be cloned. */
export function siteContentOf(content: SiteContent): SiteContent {
  const { biomes, resources, races, cultures, eventTypes, settlement, site } = content;
  const { history, needs, traits, memories, life } = content;
  const { abilities, items, jobs, steward, environment } = content;
  const { health, conditions, ailments, diseases } = content;
  const { interactions, social, family, society, creatures, threats, lore, awakenings } = content;
  const { notables, politics, chronicle } = content;
  return {
    biomes,
    resources,
    races,
    cultures,
    eventTypes,
    settlement,
    history,
    site,
    needs,
    traits,
    memories,
    life,
    abilities,
    items,
    jobs,
    steward,
    environment,
    health,
    conditions,
    ailments,
    diseases,
    interactions,
    social,
    family,
    society,
    creatures,
    threats,
    lore,
    awakenings,
    politics,
    chronicle,
    notables,
  };
}

export function createSiteHost(handlers: SiteHostHandlers): SiteHost {
  let worker: Worker | null = null;
  let waiting: {
    reply: SiteReply['type'];
    resolve: (reply: SiteReply) => void;
    reject: (error: Error) => void;
  } | null = null;

  const start = (): Worker => {
    worker?.terminate();
    const next = new Worker(new URL('./site-worker.ts', import.meta.url), { type: 'module' });
    next.onmessage = (event: MessageEvent<SiteReply>) => {
      const reply = event.data;
      if (reply.type === 'tick')
        handlers.onTick(reply.day, reply.events, reply.rate, reply.snapshot, reply.stopped);
      else if (reply.type === 'error') {
        handlers.onError?.(reply.message);
        waiting?.reject(new Error(reply.message));
        waiting = null;
      } else if (waiting && waiting.reply === reply.type) {
        waiting.resolve(reply);
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
  const request = <T>(
    target: Worker,
    message: SiteRequest,
    reply: SiteReply['type'],
    pick: (reply: SiteReply) => T,
  ) =>
    new Promise<T>((resolve, reject) => {
      waiting?.reject(new Error('cancelled'));
      waiting = { reply, resolve: (got) => resolve(pick(got)), reject };
      target.postMessage(message);
    });
  const worldOf = (reply: SiteReply) => (reply as { world: WorldState }).world;

  return {
    embark: (world, content, siteId) =>
      request(
        start(),
        { type: 'embark', world, content: siteContentOf(content), siteId },
        'embarked',
        worldOf,
      ),
    found: (world, content, cell, name) =>
      request(
        start(),
        { type: 'found', world, content: siteContentOf(content), cell, name },
        'embarked',
        worldOf,
      ),
    resume: (world, content) =>
      request(
        start(),
        { type: 'resume', world, content: siteContentOf(content) },
        'resumed',
        () => undefined,
      ),
    setSpeed: (daysPerSecond, stopOn = [], until) =>
      worker?.postMessage(
        (until
          ? { type: 'speed', daysPerSecond, stopOn, until }
          : { type: 'speed', daysPerSecond, stopOn }) satisfies SiteRequest,
      ),
    save() {
      if (!worker) return Promise.reject(new Error('No site is being watched.'));
      return request(worker, { type: 'save' }, 'saved', (reply) => {
        const { header, data } = reply as { header: SaveHeader; data: Uint8Array };
        return { header, data };
      });
    },
    run(days, blocks = 0) {
      if (!worker) return Promise.reject(new Error('No site is being watched.'));
      return request(worker, { type: 'run', days, blocks }, 'ran', (reply) => {
        const { day, events, snapshot } = reply as {
          day: number;
          events: SimEvent[];
          snapshot: SiteSnapshot;
        };
        return { day, events, snapshot };
      });
    },
    leave() {
      if (!worker) return Promise.reject(new Error('No site is being watched.'));
      return request(worker, { type: 'leave' }, 'left', worldOf);
    },
    dispose() {
      worker?.terminate();
      worker = null;
      waiting?.reject(new Error('cancelled'));
      waiting = null;
    },
  };
}
