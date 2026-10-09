import { digestCanonical } from '../../src/adapters/crypto';
import { canonicalJson } from '../../src/sim/canonical';
import { createFoundingSnapshot } from '../../src/sim/founding';
import { deriveStream, type StreamName } from '../../src/sim/seed';
import { nextUint32 } from '../../src/sim/rng';
import { prepareFounding, terrainFixture, type Tile } from '../../src/sim/terrain';

export async function collectBrowserFixtures() {
  const seeds = [
    'RIVERSIDE',
    ...Array.from({ length: 99 }, (_, index) => `TERRAIN_${String(index).padStart(3, '0')}`),
  ];
  const terrain = [];
  for (const seed of seeds) {
    const fixture = terrainFixture(seed);
    terrain.push({
      seed,
      digest: await digestCanonical(fixture),
      center: fixture.center,
      rng: fixture.terrainRng,
    });
  }
  const raw = terrainFixture('RIVERSIDE');
  const forced: Tile[] = raw.tiles.map((tile) => (tile[2] === 'water' ? tile : [90, 0, 'rock', 0]));
  let invalidAllWater = false;
  try {
    prepareFounding(Array.from({ length: 2560 }, (): Tile => [0, 0, 'water', 0]));
  } catch {
    invalidAllWater = true;
  }
  return {
    terrain,
    worldDigest: await digestCanonical(createFoundingSnapshot('RIVERSIDE')),
    forcedFallbackDigest: await digestCanonical(prepareFounding(forced)),
    invalidAllWater,
    canonical: canonicalJson({ z: 'é', a: [-0, true, null], nested: { '\uE000': 2, '😀': 1 } }),
    streams: ['terrain', 'weather', 'demographics'].map((name) => {
      const initial = deriveStream('RIVERSIDE', name as StreamName);
      return { initial, next: nextUint32(initial) };
    }),
  };
}
