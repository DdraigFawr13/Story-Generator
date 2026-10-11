import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import { deserializeWorld, generateWorld, serializeWorld, worldDigest } from '../../src/engine';

// The worker posts the world by structured clone and saves go through JSON.
describe('generated world transfer', () => {
  const world = generateWorld('TRANSFER', { width: 64, height: 64 }, DEFAULT_CONTENT);

  it('survives structured clone (typed arrays and the resources Map)', () => {
    const copy = structuredClone(world);
    expect(copy.cells!.resources).toBeInstanceOf(Map);
    expect(copy.cells!.resources.size).toBe(world.cells!.resources.size);
    expect(copy.cells!.elevation).toBeInstanceOf(Int16Array);
    expect(worldDigest(copy)).toBe(worldDigest(world));
  });

  it('round-trips through a save', () => {
    const loaded = deserializeWorld(serializeWorld(world));
    expect(loaded.cells!.resources).toBeInstanceOf(Map);
    expect([...loaded.cells!.resources.entries()]).toEqual([...world.cells!.resources.entries()]);
    expect(loaded.cells!.risk.drought).toBeInstanceOf(Uint8Array);
    expect(worldDigest(loaded)).toBe(worldDigest(world));
  });
});
