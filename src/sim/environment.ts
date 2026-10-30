import {
  SPAWN_MAX_BEETLES_BASE, SPAWN_MAX_FOOD_BASE, SPAWN_MAX_FOOD_PER_STEP, SPAWN_MAX_S, SPAWN_MIN_S, SPAWN_WEIGHTS, STEP_S,
} from './constants';
import { isAlive, resolvePlacement, type FoodKind } from './food';
import type { Rng } from './rng';
import { inWeb } from './spider';
import type { World } from './world';

type SpawnKind = Exclude<FoodKind, 'sugar' | 'honeydew' | 'redant'>;

/** One weighted draw (a single rng call). */
export function pickSpawnKind(rng: Rng, weights: Record<SpawnKind, number> = SPAWN_WEIGHTS): SpawnKind {
  const kinds = Object.keys(weights) as SpawnKind[];
  let total = 0;
  for (const k of kinds) total += weights[k];
  let r = rng.next() * total;
  for (const k of kinds) {
    r -= weights[k];
    if (r < 0) return k;
  }
  return kinds[kinds.length - 1];
}

/** A random point of the whole current map, resolved to a free spot (null if none was found nearby or it lies in the spider's web). */
export function pickSpawnSpot(world: World): { x: number; y: number } | null {
  const x = world.rng.next() * world.terrain.w;
  const y = world.rng.next() * world.terrain.h;
  const spot = resolvePlacement(world.terrain, x, y);
  return spot && !inWeb(world.spider, spot.x, spot.y) ? spot : null;
}

/** Normal mode, once per substep: counts the wait down and, at zero, lets one prey / food item appear on its own. */
export function updateEnvironment(world: World): void {
  world.spawnTimer -= STEP_S;
  if (world.spawnTimer > 0) return;
  const rng = world.rng;
  world.spawnTimer = SPAWN_MIN_S + (SPAWN_MAX_S - SPAWN_MIN_S) * rng.next();
  const kind = pickSpawnKind(rng);
  if (world.food.length >= SPAWN_MAX_FOOD_BASE + SPAWN_MAX_FOOD_PER_STEP * world.mapStep) return;
  if (kind === 'beetle') {
    let beetles = 0;
    for (const f of world.food) if (f.kind === 'beetle' && isAlive(f)) beetles++;
    if (beetles >= SPAWN_MAX_BEETLES_BASE + world.mapStep) return;
  }
  const spot = pickSpawnSpot(world);
  if (spot) world.placeFood(kind, spot.x, spot.y);
}
