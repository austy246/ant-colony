import { NEST } from './constants';
import { Surface, type Terrain } from './terrain';

export type FoodKind = 'beetle' | 'caterpillar' | 'fly' | 'carrion' | 'berry' | 'mushroom' | 'sugar' | 'leaf';

/** Every source is FOOD_SIZE_MUL times larger than the base size, so it lasts longer and food does not keep popping up. */
const FOOD_SIZE_MUL = 3;
/** pieces = number of carryable pieces; value = food per piece (pieces x value is the total food of an item). */
export const FOOD_TABLE: Record<FoodKind, { pieces: number; value: number }> = {
  beetle: { pieces: 18 * FOOD_SIZE_MUL, value: 2 / 3 },
  caterpillar: { pieces: 12 * FOOD_SIZE_MUL, value: 2 / 3 },
  fly: { pieces: 6 * FOOD_SIZE_MUL, value: 2 / 3 },
  carrion: { pieces: 24 * FOOD_SIZE_MUL, value: 2 / 3 },
  berry: { pieces: 3 * FOOD_SIZE_MUL, value: 1 },
  mushroom: { pieces: 3 * FOOD_SIZE_MUL, value: 1 },
  sugar: { pieces: 1 * FOOD_SIZE_MUL, value: 1 },
  /** Leaves are only eaten by caterpillars: pieces = leaf units left, ants never take any (value 0). */
  leaf: { pieces: 24, value: 0 },
};

/** Kinds that exist as living creatures until they die. */
export type PreyKind = 'beetle' | 'fly' | 'caterpillar';

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
  /** True for a placed, living `beetle` / `fly` / `caterpillar` (nothing can be taken from it); absent/false for all other food. */
  alive?: boolean;
  /** How many times ants have touched this living creature (0..2; the second touch kills it). */
  touches?: number;
  /** Facing of a living creature in radians (a beetle / caterpillar walks that way; a fly's is its last hop direction). */
  heading?: number;
  /** Walking-speed factor of a beetle / caterpillar (1 +- PREY_SPEED_VAR, drawn when placed; absent = 1). Saved. */
  speedMul?: number;
  /** Set when a living creature died: `kind` is then 'carrion' and this says what it was. */
  corpseOf?: PreyKind;
  /** TRANSIENT (not saved): seconds until the creature can be touched again (absent = 0). */
  cooldown?: number;
  /** TRANSIENT (not saved): present while a fly is in the air. */
  hop?: Hop;
  /** TRANSIENT (not saved): seconds a beetle / caterpillar still pauses (absent / <= 0 = walking). */
  wanderT?: number;
  /** TRANSIENT (not saved): a fly stuck in the web of the spider (it does not move; ants leave it alone). */
  stuck?: boolean;
  /** TRANSIENT (not saved): seconds the spider has been eating this stuck fly. */
  eatT?: number;
  /** TRANSIENT (not saved): seconds a caterpillar has been chewing its current leaf unit. */
  biteT?: number;
  /** TRANSIENT (not saved): seconds a touched caterpillar still hurries away (absent / <= 0 = normal pace). */
  fleeT?: number;
}

/** True for a living beetle, fly or caterpillar. */
export function isAlive(f: FoodItem): boolean {
  return f.alive === true && (f.kind === 'beetle' || f.kind === 'fly' || f.kind === 'caterpillar');
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
