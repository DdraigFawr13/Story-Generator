import { describe, expect, it } from 'vitest';
import { checkWorldCells, generateWorld, type WorldCells } from '../../src/engine';

const SMALL = { width: 96, height: 96 };

function copyCells(cells: WorldCells): WorldCells {
  return {
    ...cells,
    elevation: cells.elevation.slice(),
    flowDir: cells.flowDir.slice(),
    water: cells.water.slice(),
    risk: { ...cells.risk, drought: cells.risk.drought.slice() },
  };
}

describe('checkWorldCells', () => {
  for (const seed of ['A', 'B', 'C']) {
    it(`accepts a generated world (seed ${seed})`, () => {
      expect(checkWorldCells(generateWorld(seed, SMALL).cells!)).toEqual([]);
    });
  }

  it('reports a risk out of range', () => {
    const cells = copyCells(generateWorld('A', SMALL).cells!);
    cells.risk.drought[10] = 150;
    expect(checkWorldCells(cells).join('\n')).toMatch(/risk\.drought\[10\] = 150/);
  });

  it('reports a flow loop', () => {
    const cells = copyCells(generateWorld('A', SMALL).cells!);
    const land = cells.water.findIndex((w, i) => w === 0 && cells.water[i + 1] === 0);
    cells.flowDir[land] = 2; // east
    cells.flowDir[land + 1] = 6; // back west
    expect(checkWorldCells(cells).join('\n')).toMatch(/loops/);
  });

  it('reports sea above sea level and a short layer', () => {
    const cells = copyCells(generateWorld('A', SMALL).cells!);
    const sea = cells.water.indexOf(3);
    cells.elevation[sea] = 50;
    expect(checkWorldCells(cells).join('\n')).toMatch(/sea cell/);
    expect(checkWorldCells({ ...cells, plate: new Uint8Array(3) })[0]).toMatch(/plate has 3/);
  });
});
