// Armies on the road: a breadth-first path over the road cells, and a point along it. Pure.

export interface RoadGrid {
  width: number;
  height: number;
  /** Routes using each cell; above 0 is a road. */
  roads: ArrayLike<number>;
}

/**
 * A path of cells from `from` to `to` along roads. Either end may be off the road: it joins the
 * nearest road cell within `reach` cells. Falls back to the straight two-point path when the
 * roads do not connect them.
 */
export function roadPath(grid: RoadGrid, from: number, to: number, reach = 2): number[] {
  if (from === to) return [from];
  const { width, height, roads } = grid;
  const onRoad = (i: number) => roads[i]! > 0;
  const near = (cell: number): number[] => {
    const x = cell % width;
    const y = Math.floor(cell / width);
    const out: number[] = [];
    for (let dy = -reach; dy <= reach; dy += 1) {
      for (let dx = -reach; dx <= reach; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const j = ny * width + nx;
        if (onRoad(j)) out.push(j);
      }
    }
    return out;
  };
  const goalSet = new Set(near(to));
  if (onRoad(to)) goalSet.add(to);
  const prev = new Map<number, number>();
  let queue: number[] = [];
  for (const j of [...near(from), ...(onRoad(from) ? [from] : [])]) {
    if (!prev.has(j)) {
      prev.set(j, from);
      queue.push(j);
    }
  }
  prev.set(from, -1);
  let hit = -1;
  while (queue.length && hit < 0) {
    const next: number[] = [];
    for (const cell of queue) {
      if (goalSet.has(cell)) {
        hit = cell;
        break;
      }
      const x = cell % width;
      const y = Math.floor(cell / width);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const j = ny * width + nx;
          if (prev.has(j) || !onRoad(j)) continue;
          prev.set(j, cell);
          next.push(j);
        }
      }
    }
    queue = next;
  }
  if (hit < 0) return [from, to];
  const path: number[] = [];
  for (let c = hit; c !== -1; c = prev.get(c)!) path.push(c);
  path.reverse();
  if (path[path.length - 1] !== to) path.push(to);
  return path;
}

/** The point `p` (0 to 1) of the way along a path of cells, in cell units (cell centres). */
export function pointAlong(
  path: readonly number[],
  width: number,
  p: number,
): { x: number; y: number; upTo: [number, number][] } {
  const pts = path.map((c): [number, number] => [(c % width) + 0.5, Math.floor(c / width) + 0.5]);
  if (pts.length === 1) return { x: pts[0]![0], y: pts[0]![1], upTo: [pts[0]!] };
  const lens: number[] = [0];
  for (let k = 1; k < pts.length; k += 1) {
    lens.push(lens[k - 1]! + Math.hypot(pts[k]![0] - pts[k - 1]![0], pts[k]![1] - pts[k - 1]![1]));
  }
  const total = lens[lens.length - 1]!;
  const want = Math.max(0, Math.min(1, p)) * total;
  let k = 1;
  while (k < lens.length - 1 && lens[k]! < want) k += 1;
  const span = lens[k]! - lens[k - 1]! || 1;
  const f = Math.max(0, Math.min(1, (want - lens[k - 1]!) / span));
  const x = pts[k - 1]![0] + (pts[k]![0] - pts[k - 1]![0]) * f;
  const y = pts[k - 1]![1] + (pts[k]![1] - pts[k - 1]![1]) * f;
  return { x, y, upTo: [...pts.slice(0, k), [x, y]] };
}
