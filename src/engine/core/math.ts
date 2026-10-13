// Small pure helpers shared by every engine layer.

/** Orthogonal neighbour offsets, in the fixed order the flood fills walk them. */
export const ORTHO: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

export const manhattan = (ax: number, ay: number, bx: number, by: number) =>
  Math.abs(ax - bx) + Math.abs(ay - by);

/** Whether a circular epoch (centre `cell`, `radius`) covers the cell (x, y) of a `width`-wide grid. */
export function epochCovers(
  epoch: { cell: number; radius: number },
  x: number,
  y: number,
  width: number,
): boolean {
  const dx = x - (epoch.cell % width);
  const dy = y - Math.floor(epoch.cell / width);
  return dx * dx + dy * dy <= epoch.radius * epoch.radius;
}

/** Items in id order, as a new array. */
export const sortedById = <T extends { id: number }>(items: Iterable<T>): T[] =>
  [...items].sort((a, b) => a.id - b.id);

/** Sorts grid cells (indices into a `width`-wide grid) nearest first to (ox, oy), ties by index. */
export function sortByManhattan(cells: number[], width: number, ox: number, oy: number): number[] {
  const dist = (k: number) => manhattan(k % width, Math.floor(k / width), ox, oy);
  return cells.sort((a, b) => dist(a) - dist(b) || a - b);
}
