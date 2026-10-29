import { MAX_PHEROMONE, WORLD_H, WORLD_W } from '../sim/constants';
import { homeGlow } from '../sim/pheromone';
import { Surface, type Terrain } from '../sim/terrain';
import type { CanvasFactory, CanvasLike } from './terrainRender';

export const PHEROMONE_MIN = 0.02;
export const PHEROMONE_DARK = 'rgba(6,8,14,.80)';
export const TERRAIN_DARK = 'rgba(10,10,10,.68)';

/** Alpha of a trail cell: 0 below the threshold, monotonic, capped at 0.95. */
export function pheromoneAlpha(value: number): number {
  if (!Number.isFinite(value) || value < PHEROMONE_MIN) return 0;
  return Math.min(0.95, 0.35 + (0.6 * value) / MAX_PHEROMONE);
}

export function surfaceOverlayColor(s: number): string | null {
  switch (s) {
    case Surface.Needle:
      return 'rgba(255,224,102,.55)';
    case Surface.SmallTwig:
    case Surface.BigTwig:
      return '#ff9d2e';
    case Surface.Stone:
      return '#ff4040';
    default:
      return null;
  }
}

const LEVELS = 32;

/** 32 pre-built fillStyle strings for alpha-quantised trail cells; index 0 is unused (no draw). */
export const TRAIL_STYLES: readonly string[] = Array.from(
  { length: LEVELS + 1 },
  (_, i) => `rgba(127,209,255,${(i / LEVELS).toFixed(3)})`,
);

/** Quantised style index for a pheromone value, 0 = skip. */
export function trailLevel(value: number): number {
  const a = pheromoneAlpha(value);
  return a > 0 ? Math.max(1, Math.round(a * LEVELS)) : 0;
}

/** Soft orange radial glow around the nest, WORLD_W x WORLD_H, built from homeGlow. */
export function buildHomeGlowCanvas(make: CanvasFactory): CanvasLike {
  const canvas = make(WORLD_W, WORLD_H);
  const c = canvas.getContext('2d');
  if (!c) throw new Error('2d context unavailable');
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const g = homeGlow(x + 0.5, y + 0.5);
      if (g <= 0) continue;
      c.fillStyle = `rgba(255,150,60,${(0.35 * g * g).toFixed(3)})`;
      c.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
}

/** Per-cell terrain-cost overlay (stones red, twigs orange, needles yellow), WORLD_W x WORLD_H. */
export function buildSurfaceOverlayCanvas(t: Terrain, make: CanvasFactory): CanvasLike {
  const canvas = make(WORLD_W, WORLD_H);
  const c = canvas.getContext('2d');
  if (!c) throw new Error('2d context unavailable');
  for (let y = 0; y < t.h; y++) {
    for (let x = 0; x < t.w; x++) {
      const col = surfaceOverlayColor(t.surface[y * t.w + x]);
      if (!col) continue;
      c.fillStyle = col;
      c.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
}
