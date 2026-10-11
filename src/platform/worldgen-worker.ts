// Web Worker entry: runs world generation off the main thread so the UI never
// freezes. Content arrives as plain data; progress and the finished world go
// back by structured clone (typed arrays and Maps survive it).

import {
  generateWorld,
  type WorldParams,
  type WorldState,
  type WorldgenContent,
  type WorldgenStage,
} from '../engine';

export interface WorkerRequest {
  seed: string;
  params: Partial<WorldParams>;
  content: WorldgenContent;
}

export type WorkerReply =
  | {
      type: 'progress';
      stage: WorldgenStage;
      done: number;
      total: number;
      fraction?: number | undefined;
    }
  | { type: 'done'; world: WorldState }
  | { type: 'error'; message: string };

const scope = self as unknown as { postMessage(reply: WorkerReply): void };

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const { seed, params, content } = event.data;
  try {
    const world = generateWorld(seed, params, content, (stage, done, total, fraction) =>
      scope.postMessage({ type: 'progress', stage, done, total, fraction }),
    );
    scope.postMessage({ type: 'done', world });
  } catch (problem) {
    scope.postMessage({ type: 'error', message: (problem as Error).message });
  }
});
