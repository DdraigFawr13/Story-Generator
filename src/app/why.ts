// Evaluates the inspector's "why" rules (content/map-why.ts) for one cell.

import {
  WHY_FALLBACK,
  WHY_MAX_LINES,
  WHY_RULES,
  type WhyCondition,
  type WhyRule,
} from '../content/map-why';
import { windDirection, type WorldCells } from '../engine';

export type WhyCells = Pick<
  WorldCells,
  | 'width'
  | 'height'
  | 'elevation'
  | 'water'
  | 'rainfall'
  | 'seaDistance'
  | 'floodplain'
  | 'wildness'
  | 'tempSummer'
>;

export interface WhyLine {
  id: string;
  lead: string;
  text: string;
  /** Layer the "show" button switches to; null for the fallback line. */
  layer: string | null;
}

interface Hit {
  /** The rule's number (distance in cells). */
  distance: number;
}

function check(cells: WhyCells, x: number, y: number, when: WhyCondition): Hit | null {
  const i = y * cells.width + x;
  if (when.kind === 'below') return cells[when.field][i]! < when.value ? { distance: 0 } : null;
  if (when.kind === 'atLeast') return cells[when.field][i]! >= when.value ? { distance: 0 } : null;
  if (when.kind === 'flag') return cells[when.field][i] === 1 ? { distance: 0 } : null;

  const step = -windDirection(y, cells.height); // toward the side the wind comes from
  const here = cells.elevation[i]!;
  if (when.kind === 'windward') {
    if (cells.rainfall[i]! <= when.rainAbove) return null;
    for (let d = 1; d <= when.reach; d += 1) {
      const ux = x + step * d;
      if (ux < 0 || ux >= cells.width) break;
      if (cells.elevation[y * cells.width + ux]! < here) return { distance: d };
    }
    return null;
  }
  // rainShadow: the highest qualifying land within reach (nearest on ties).
  if (cells.rainfall[i]! >= when.rainBelow) return null;
  let best = 0;
  let bestHeight = -Infinity;
  for (let d = 1; d <= when.reach; d += 1) {
    const ux = x + step * d;
    if (ux < 0 || ux >= cells.width) break;
    const j = y * cells.width + ux;
    const height = cells.elevation[j]!;
    if (cells.water[j] === 3 || height <= 0 || height - here < when.rise) continue;
    if (height > bestHeight) {
      bestHeight = height;
      best = d;
    }
  }
  return best > 0 ? { distance: best } : null;
}

function fill(rule: WhyRule, cells: WhyCells, x: number, y: number, hit: Hit): string {
  const i = y * cells.width + x;
  let n = 0;
  if (rule.number === 'distance') n = hit.distance;
  else if (rule.number === 'seaDistance') n = cells.seaDistance[i]!;
  else if (rule.number === 'elevation') n = Math.round(cells.elevation[i]! / 100) * 100;
  const dir = windDirection(y, cells.height) === 1 ? 'west' : 'east';
  return rule.text
    .replace('{n}', n.toLocaleString('en-US'))
    .replace('{s}', n === 1 ? '' : 's')
    .replace('{dir}', dir);
}

/** Up to WHY_MAX_LINES reasons this cell is the way it is, in rule-table order. */
export function explainCell(
  cells: WhyCells,
  x: number,
  y: number,
  rules: readonly WhyRule[] = WHY_RULES,
): WhyLine[] {
  const lines: WhyLine[] = [];
  for (const rule of rules) {
    if (lines.length >= WHY_MAX_LINES) break;
    const hit = check(cells, x, y, rule.when);
    if (hit)
      lines.push({
        id: rule.id,
        lead: rule.lead,
        text: fill(rule, cells, x, y, hit),
        layer: rule.layer,
      });
  }
  if (lines.length === 0) lines.push({ id: 'temperate', ...WHY_FALLBACK, layer: null });
  return lines;
}
