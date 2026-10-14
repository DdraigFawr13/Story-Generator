// Pure layout rules for the Tales room: where the map sits in the stage, where the pause card
// sits over it, and which cell a mark snaps to. No DOM.

export interface MapBox {
  /** Land box in pixels at the atlas scale (width and height) and its top-left corner. */
  w: number;
  h: number;
  x0: number;
  y0: number;
}

/** Phone width and below. */
export const PHONE_MAX = 600;

/**
 * Fits the land box inside the stage and returns the scale and the offset of the whole atlas
 * square. On a phone the box keeps a small side margin and is centred between the mode row above
 * and the controls below; elsewhere it is centred in the stage.
 */
export function fitMap(
  stage: { w: number; h: number },
  box: MapBox,
  atlasSize: number,
): { size: number; left: number; top: number; s: number } {
  const phone = stage.w <= PHONE_MAX;
  const sideMargin = phone ? 12 : 0;
  const topReserve = phone ? 52 : 0;
  const bottomReserve = phone ? 52 : 0;
  const freeW = Math.max(1, stage.w - sideMargin * 2);
  const freeH = Math.max(1, stage.h - topReserve - bottomReserve);
  const s = Math.min(freeW / box.w, freeH / box.h);
  return {
    s,
    size: atlasSize * s,
    left: (stage.w - box.w * s) / 2 - box.x0 * s,
    top: topReserve + (freeH - box.h * s) / 2 - box.y0 * s,
  };
}

export type CardSide = 'left' | 'right' | 'mid';

/** Pixel size of the desktop pause card, with the gap to the stage edge. */
export const CARD = { w: 360, h: 300, edge: 28 };

/**
 * Where the pause card goes on a wide screen. It must not cover the ring; of the places left it
 * takes the one with the least land under it. The two sides get a small head start so the card
 * does not jump to the middle for a marginal gain.
 */
export function cardSide(
  stage: { w: number; h: number },
  /** Land cells' pixel positions are asked for through this: land share under a pixel rectangle. */
  landUnder: (x0: number, y0: number, x1: number, y1: number) => number,
  ring: { x: number; y: number } | null,
): CardSide {
  const y1 = stage.h - CARD.edge;
  const y0 = y1 - CARD.h;
  const spots: [CardSide, number][] = [
    ['left', CARD.edge],
    ['right', stage.w - CARD.edge - CARD.w],
    ['mid', (stage.w - CARD.w) / 2],
  ];
  let best: CardSide = 'left';
  let bestScore = Infinity;
  for (const [side, x0] of spots) {
    const covers =
      ring !== null && ring.x > x0 - 30 && ring.x < x0 + CARD.w + 30 && ring.y > y0 - 30;
    if (covers) continue;
    const score = landUnder(x0, y0, x0 + CARD.w, y1) + (side === 'mid' ? 0.06 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = side;
    }
  }
  if (bestScore === Infinity) return ring && ring.x > stage.w / 2 ? 'left' : 'right';
  return best;
}

/**
 * The nearest cell to `cell` that `ok` accepts, searched in growing rings (ties: the first found
 * in row order). Returns `cell` itself when it is fine or nothing is found within `reach` cells.
 */
export function nearestCell(
  cell: number,
  width: number,
  height: number,
  ok: (cell: number) => boolean,
  reach = 30,
): number {
  if (ok(cell)) return cell;
  const cx = cell % width;
  const cy = Math.floor(cell / width);
  let best = -1;
  let bestD = Infinity;
  for (let r = 1; r <= reach && r * r <= bestD; r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD && ok(y * width + x)) {
          bestD = d;
          best = y * width + x;
        }
      }
    }
  }
  return best < 0 ? cell : best;
}
