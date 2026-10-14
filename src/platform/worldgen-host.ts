// Main-thread side of the generation worker. One generation at a time: starting
// a new one terminates the previous worker.

import type { WorldParams, WorldState, WorldgenContent, WorldgenStage } from '../engine';
import type { WorkerReply, WorkerRequest } from './worldgen-worker';

export type WorldgenProgress = (
  stage: WorldgenStage,
  done: number,
  total: number,
  fraction?: number,
) => void;

export interface WorldgenJob {
  /** Resolves with the world; rejects with `Error('cancelled')` if superseded or cancelled. */
  promise: Promise<WorldState>;
  cancel(): void;
}

let active: WorldgenJob | null = null;

export function generateInWorker(
  seed: string,
  params: Partial<WorldParams>,
  content: WorldgenContent,
  onProgress: WorldgenProgress = () => {},
): WorldgenJob {
  active?.cancel();
  const worker = new Worker(new URL('./worldgen-worker.ts', import.meta.url), { type: 'module' });
  let settled = false;
  let job: WorldgenJob;
  const promise = new Promise<WorldState>((resolve, reject) => {
    const settle = (action: () => void) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      if (active === job) active = null;
      action();
    };
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data;
      if (reply.type === 'progress')
        onProgress(reply.stage, reply.done, reply.total, reply.fraction);
      else if (reply.type === 'done') settle(() => resolve(reply.world));
      else settle(() => reject(new Error(reply.message)));
    };
    worker.onerror = (event) => settle(() => reject(new Error(event.message || 'Worker failed.')));
    job = {
      promise: undefined as never,
      cancel: () => settle(() => reject(new Error('cancelled'))),
    };
  });
  job!.promise = promise;
  active = job!;
  // Only the plain-data tables cross over: a full content bundle holds functions, which cannot be cloned.
  const {
    biomes,
    biomeRules,
    resources,
    names,
    races,
    cultures,
    eventTypes,
    settlement,
    history,
    creatures,
    dragons,
    places,
    diseases,
    notables,
    threats,
  } = content;
  const request: WorkerRequest = {
    seed,
    params,
    content: {
      biomes,
      biomeRules,
      resources,
      names,
      races,
      cultures,
      eventTypes,
      settlement,
      history,
      creatures,
      dragons,
      places,
      diseases,
      notables,
      threats,
    },
  };
  worker.postMessage(request);
  return job!;
}
