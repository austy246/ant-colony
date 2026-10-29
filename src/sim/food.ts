import { NEST } from './constants';
import { Surface, type Terrain } from './terrain';

export type FoodKind = 'beetle' | 'caterpillar' | 'fly' | 'carrion' | 'berry' | 'mushroom';

/** pieces = number of carryable pieces; value = food per piece. */
export const FOOD_TABLE: Record<FoodKind, { pieces: number; value: number }> = {
  beetle: { pieces: 6, value: 2 },
  caterpillar: { pieces: 4, value: 2 },
  fly: { pieces: 2, value: 2 },
  carrion: { pieces: 8, value: 2 },
  berry: { pieces: 1, value: 3 },
  mushroom: { pieces: 1, value: 3 },
};

export interface FoodItem {
  id: number;
  kind: FoodKind;
  x: number;
  y: number;
  piecesLeft: number;
}

const MAX_SEARCH_RADIUS = 12;
const MIN_NEST_DIST = NEST.r + 4;

function isValidCell(t: Terrain, cx: number, cy: number): boolean {
  if (cx < 0 || cy < 0 || cx >= t.w || cy >= t.h) return false;
  const s = t.surface[cy * t.w + cx];
  if (s === Surface.Stone || s === Surface.BigTwig) return false;
  return Math.hypot(cx + 0.5 - NEST.x, cy + 0.5 - NEST.y) >= MIN_NEST_DIST;
}

export function resolvePlacement(t: Terrain, x: number, y: number): { x: number; y: number } | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || y < 0 || x >= t.w || y >= t.h) return null;

  const px = Math.floor(x);
  const py = Math.floor(y);
  const nestOk = Math.hypot(x - NEST.x, y - NEST.y) >= MIN_NEST_DIST;
  if (nestOk && isValidCell(t, px, py)) return { x, y };

  for (let r = 1; r <= MAX_SEARCH_RADIUS; r++) {
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const cx = px + dx;
        const cy = py + dy;
        if (!isValidCell(t, cx, cy)) continue;
        const d = Math.hypot(cx + 0.5 - x, cy + 0.5 - y);
        if (d < bestD) {
          bestD = d;
          best = { x: cx + 0.5, y: cy + 0.5 };
        }
      }
    }
    if (best) return best;
  }
  return null;
}
