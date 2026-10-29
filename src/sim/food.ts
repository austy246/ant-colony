import { NEST } from './constants';
import { Surface, type Terrain } from './terrain';

export type FoodKind = 'beetle' | 'caterpillar' | 'fly' | 'carrion' | 'berry' | 'mushroom';

/** pieces = number of carryable pieces; value = food per piece (pieces x value is the total food of an item). */
export const FOOD_TABLE: Record<FoodKind, { pieces: number; value: number }> = {
  beetle: { pieces: 18, value: 2 / 3 },
  caterpillar: { pieces: 12, value: 2 / 3 },
  fly: { pieces: 6, value: 2 / 3 },
  carrion: { pieces: 24, value: 2 / 3 },
  berry: { pieces: 3, value: 1 },
  mushroom: { pieces: 3, value: 1 },
};

/** Kinds that exist as living creatures until they die. */
export type PreyKind = 'beetle' | 'fly';

/** State of one fly hop (transient, not saved). The creature moves linearly from -> to; the renderer draws the arc from t / dur. */
export interface Hop {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** Seconds since the hop began. */
  t: number;
  dur: number;
}

export interface FoodItem {
  id: number;
  kind: FoodKind;
  x: number;
  y: number;
  piecesLeft: number;
  /** True for a placed, living `beetle` / `fly` (nothing can be taken from it); absent/false for all other food. */
  alive?: boolean;
  /** How many times ants have touched this living creature (0..2; the second touch kills it). */
  touches?: number;
  /** Facing of a living creature in radians (a beetle walks that way; a fly's is its last hop direction). */
  heading?: number;
  /** Set when a living creature died: `kind` is then 'carrion' and this says what it was. */
  corpseOf?: PreyKind;
  /** TRANSIENT (not saved): seconds until the creature can be touched again (absent = 0). */
  cooldown?: number;
  /** TRANSIENT (not saved): present while a fly is in the air. */
  hop?: Hop;
  /** TRANSIENT (not saved): seconds a beetle still pauses (absent / <= 0 = walking). */
  wanderT?: number;
}

/** True for a living beetle or fly. */
export function isAlive(f: FoodItem): boolean {
  return f.alive === true && (f.kind === 'beetle' || f.kind === 'fly');
}

const MAX_SEARCH_RADIUS = 12;
const MIN_NEST_DIST = NEST.r + 4;

function isValidCell(t: Terrain, cx: number, cy: number): boolean {
  if (cx < 0 || cy < 0 || cx >= t.w || cy >= t.h) return false;
  const s = t.surface[cy * t.w + cx];
  if (s === Surface.Stone || s === Surface.BigTwig) return false;
  return Math.hypot(cx + 0.5 - NEST.x, cy + 0.5 - NEST.y) >= MIN_NEST_DIST;
}

/** Can a creature stand exactly at (x, y)? Inside the map, not on stone / big twig, outside the nest radius + 4. */
export function isFreeSpot(t: Terrain, x: number, y: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (x < 0 || y < 0 || x >= t.w || y >= t.h) return false;
  const s = t.surface[Math.floor(y) * t.w + Math.floor(x)];
  if (s === Surface.Stone || s === Surface.BigTwig) return false;
  return Math.hypot(x - NEST.x, y - NEST.y) >= MIN_NEST_DIST;
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
