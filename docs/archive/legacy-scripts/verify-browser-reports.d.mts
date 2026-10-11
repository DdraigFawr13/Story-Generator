export const BROWSER_PROJECTS: readonly string[];
export function verifyBrowserReports(
  expected: unknown,
  inputs: { name: string; report: unknown }[],
): {
  coverage: Record<string, number>;
  cases: number;
  partitions: number;
  flaky: string[];
};
