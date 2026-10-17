export type Metrics = Record<string, number>;
export function countEvents(
  world: any,
  opts: { rollupBelow?: number; DAYS_PER_YEAR: number },
): Record<string, number>;
export function historyMetrics(
  world: any,
  opts: {
    startPop: number;
    peakPop: number;
    historyMs: number;
    rollupBelow?: number;
    DAYS_PER_YEAR: number;
    raceIds?: string[];
    orderRules?: any;
    cultures?: any[];
  },
): Metrics;
export function baselineMetrics(metrics: Metrics): Metrics;
