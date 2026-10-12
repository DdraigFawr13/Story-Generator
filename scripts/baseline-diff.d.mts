export type SeedMetrics = Record<string, Record<string, number>>;
export interface DiffRow {
  seed: string;
  metric: string;
  base: number | undefined;
  now: number | undefined;
  delta: number | undefined;
}
export interface MeanRow {
  metric: string;
  base: number;
  now: number;
  delta: number;
}
export interface DiffResult {
  rows: DiffRow[];
  means: MeanRow[];
  changed: number;
}
export function diffBaseline(
  base: SeedMetrics,
  now: SeedMetrics,
  tolerance?: { abs?: number; rel?: number },
): DiffResult;
export function formatDiff(result: DiffResult): string;
