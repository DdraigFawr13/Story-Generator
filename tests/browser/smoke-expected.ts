// The browser smoke compares what Chromium draws with what Node computes for the same world, so
// float drift between them fails CI. Computed here at test time; nothing to re-save when history changes.
import { DEFAULT_CONTENT } from '../../src/content';
import { cellsDigest, embark, generateWorld, localMapDigest } from '../../src/engine';

export const SMOKE = { seed: 'SMOKE', size: 128 } as const;

let expected: { cells: string; site: number; localMap: string } | undefined;

/** The SMOKE world's cells digest, its first standing site and that site's local-map digest. */
export function smokeExpected() {
  if (expected) return expected;
  const world = generateWorld(
    SMOKE.seed,
    { width: SMOKE.size, height: SMOKE.size },
    DEFAULT_CONTENT,
  );
  const cells = cellsDigest(world.cells!);
  // The Sites list in Legends sorts by peak population, then id; the smoke opens the first standing one.
  const first = [...world.sites.values()]
    .filter((s) => s.ruinedYear === undefined)
    .sort((a, b) => b.peakPop - a.peakPop || a.id - b.id)[0]!;
  const localMap = localMapDigest(embark(world, DEFAULT_CONTENT, first.id).map);
  return (expected = { cells, site: first.id, localMap });
}
