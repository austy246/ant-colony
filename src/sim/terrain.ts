import { createRng } from './rng';
import { MAP_STEP_H, MAP_STEP_W, MAX_MAP_STEP, NEST, WORLD_H, WORLD_W } from './constants';

export const Surface = { Ground: 0, Needle: 1, SmallTwig: 2, BigTwig: 3, Stone: 4 } as const;

export const SPEED: Record<number, number> = {
  [Surface.Ground]: 1,
  [Surface.Needle]: 0.9,
  [Surface.SmallTwig]: 0.6,
  [Surface.BigTwig]: 0.3,
  [Surface.Stone]: 0.15,
};

export type Feature =
  | { kind: 'stone'; x: number; y: number; rx: number; ry: number }
  | { kind: 'twig'; x0: number; y0: number; x1: number; y1: number; t: number }
  | { kind: 'needle'; x: number; y: number; a: number; len: number }
  | { kind: 'moss'; x: number; y: number }
  | { kind: 'leaf'; x: number; y: number; c: number }
  | { kind: 'grass'; x: number; y: number };

export interface Terrain {
  seed: number;
  w: number;
  h: number;
  surface: Uint8Array;
  speed: Float32Array;
  features: Feature[];
}

const CLEAR_R = NEST.r + 8;

function distToSegment(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  let u = l2 === 0 ? 0 : ((px - x0) * dx + (py - y0) * dy) / l2;
  u = Math.max(0, Math.min(1, u));
  return Math.hypot(px - (x0 + u * dx), py - (y0 + u * dy));
}

function inClearZone(x: number, y: number): boolean {
  return (x - NEST.x) ** 2 + (y - NEST.y) ** 2 <= CLEAR_R * CLEAR_R;
}

export function generateTerrain(seed: number): Terrain {
  const rnd = createRng(seed);
  const range = (a: number, b: number) => a + rnd() * (b - a);
  const int = (a: number, b: number) => Math.floor(range(a, b + 1));
  const features: Feature[] = [];

  // Stones (ellipses), kept clear of the nest.
  const stoneCount = int(7, 10);
  for (let n = 0, tries = 0; n < stoneCount && tries < 500; tries++) {
    const rx = range(4, 11);
    const ry = range(3, 8);
    const x = range(rx + 1, WORLD_W - rx - 1);
    const y = range(ry + 1, WORLD_H - ry - 1);
    if (Math.hypot(x - NEST.x, y - NEST.y) < CLEAR_R + Math.max(rx, ry) + 2) continue;
    features.push({ kind: 'stone', x, y, rx, ry });
    n++;
  }

  // Twigs (segments); at least 2 are big (t >= 4).
  const twigCount = int(6, 9);
  for (let n = 0, tries = 0; n < twigCount && tries < 500; tries++) {
    const x0 = range(5, WORLD_W - 5);
    const y0 = range(5, WORLD_H - 5);
    const ang = range(0, Math.PI * 2);
    const len = range(25, 70);
    const x1 = Math.max(0, Math.min(WORLD_W - 1, x0 + Math.cos(ang) * len));
    const y1 = Math.max(0, Math.min(WORLD_H - 1, y0 + Math.sin(ang) * len));
    const t = n < 2 ? int(4, 6) : int(1, 6);
    if (distToSegment(NEST.x, NEST.y, x0, y0, x1, y1) < CLEAR_R + t / 2 + 2) continue;
    features.push({ kind: 'twig', x0, y0, x1, y1, t });
    n++;
  }

  // Needle pairs: two needles from one base point (allowed near nest).
  const pairCount = int(40, 50);
  for (let n = 0; n < pairCount; n++) {
    const x = range(2, WORLD_W - 2);
    const y = range(2, WORLD_H - 2);
    const a = range(0, Math.PI * 2);
    const spread = range(0.15, 0.4);
    const len = range(6, 14);
    features.push({ kind: 'needle', x, y, a, len });
    features.push({ kind: 'needle', x, y, a: a + spread, len: len * range(0.8, 1.1) });
  }

  // Decoration (no effect on speed), skipped near the nest.
  const decor = (count: number, make: (x: number, y: number) => Feature) => {
    for (let n = 0; n < count; n++) {
      const x = range(0, WORLD_W - 1);
      const y = range(0, WORLD_H - 1);
      if (inClearZone(x, y)) continue;
      features.push(make(x, y));
    }
  };
  decor(int(12, 20), (x, y) => ({ kind: 'moss', x, y }));
  decor(int(15, 25), (x, y) => ({ kind: 'leaf', x, y, c: int(0, 3) }));
  decor(int(30, 50), (x, y) => ({ kind: 'grass', x, y }));

  const surface = new Uint8Array(WORLD_W * WORLD_H);
  rasterize(features, surface, WORLD_W, WORLD_H);

  const speed = new Float32Array(surface.length);
  for (let i = 0; i < surface.length; i++) speed[i] = SPEED[surface[i]];

  return { seed, w: WORLD_W, h: WORLD_H, surface, speed, features };
}

/**
 * Rasterize features into a w x h surface: needle < twig < stone. Cells for which `skip(ix, iy)` is true are left
 * untouched (map growth only draws into the new area).
 */
function rasterize(features: Feature[], surface: Uint8Array, w: number, h: number, skip?: (ix: number, iy: number) => boolean): void {
  const set = (x: number, y: number, s: number) => {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= w || iy >= h) return;
    if (skip && skip(ix, iy)) return;
    const i = iy * w + ix;
    if (s > surface[i]) surface[i] = s;
  };

  for (const f of features) {
    if (f.kind !== 'needle') continue;
    const steps = Math.ceil(f.len);
    for (let s = 0; s <= steps; s++) {
      const d = (s / steps) * f.len;
      set(f.x + Math.cos(f.a) * d, f.y + Math.sin(f.a) * d, Surface.Needle);
    }
  }
  for (const f of features) {
    if (f.kind !== 'twig') continue;
    const s = f.t >= 4 ? Surface.BigTwig : Surface.SmallTwig;
    const r = f.t / 2;
    const steps = Math.ceil(Math.hypot(f.x1 - f.x0, f.y1 - f.y0));
    for (let k = 0; k <= steps; k++) {
      const u = steps === 0 ? 0 : k / steps;
      const cx = f.x0 + (f.x1 - f.x0) * u;
      const cy = f.y0 + (f.y1 - f.y0) * u;
      for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
        for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
          if (dx * dx + dy * dy <= Math.max(r * r, 0.25)) set(cx + dx, cy + dy, s);
        }
      }
    }
  }
  for (const f of features) {
    if (f.kind !== 'stone') continue;
    for (let y = Math.floor(f.y - f.ry); y <= Math.ceil(f.y + f.ry); y++) {
      for (let x = Math.floor(f.x - f.rx); x <= Math.ceil(f.x + f.rx); x++) {
        if (((x - f.x) / f.rx) ** 2 + ((y - f.y) / f.ry) ** 2 <= 1) set(x, y, Surface.Stone);
      }
    }
  }
}

/** Map size at growth step `step` (clamped to 0..MAX_MAP_STEP): the base map plus MAP_STEP_W x MAP_STEP_H per step. */
export function terrainSize(step: number): { w: number; h: number } {
  const s = Math.max(0, Math.min(MAX_MAP_STEP, Math.floor(step)));
  return { w: WORLD_W + MAP_STEP_W * s, h: WORLD_H + MAP_STEP_H * s };
}

/**
 * Grows terrain `t` (of size terrainSize(step - 1)) to terrainSize(step). The map grows to the right and down, so
 * every old coordinate stays valid: old cells and features are kept as they are, new features are drawn only for the
 * new L-shaped area (everything outside the old rectangle) and rasterized only into its cells. Feature counts follow
 * the ranges of generateTerrain scaled by new area / base area. Deterministic in (t.seed, step).
 */
export function extendTerrain(t: Terrain, step: number): Terrain {
  const prev = terrainSize(step - 1);
  if (step < 1 || step > MAX_MAP_STEP || t.w !== prev.w || t.h !== prev.h) {
    throw new Error(`extendTerrain: terrain ${t.w}x${t.h} cannot grow to step ${step}`);
  }
  const { w, h } = terrainSize(step);
  const ow = t.w;
  const oh = t.h;
  const rnd = createRng((t.seed ^ Math.imul(step, 0x9e3779b1)) >>> 0);
  const range = (a: number, b: number) => a + rnd() * (b - a);
  const int = (a: number, b: number) => Math.floor(range(a, b + 1));
  const k = (w * h - ow * oh) / (WORLD_W * WORLD_H);
  const count = (a: number, b: number, min = 0) => Math.max(min, Math.round(int(a, b) * k));
  const inOld = (x: number, y: number) => x < ow && y < oh;
  // A uniform point of the new area: the right strip (full height) or the bottom strip (old width), by area.
  const rightArea = (w - ow) * h;
  const bottomArea = ow * (h - oh);
  const point = (): { x: number; y: number } =>
    rnd() * (rightArea + bottomArea) < rightArea
      ? { x: range(ow, w), y: range(0, h) }
      : { x: range(0, ow), y: range(oh, h) };
  /** True if any point of the segment (sampled every px) lies within `margin` of the old rectangle. */
  const segmentTouchesOld = (x0: number, y0: number, x1: number, y1: number, margin: number) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      if (inOld(x0 + (x1 - x0) * u - margin, y0 + (y1 - y0) * u - margin)) return true;
    }
    return false;
  };
  const features: Feature[] = [];

  // Stones, wholly in the new area and inside the map.
  const stoneCount = count(7, 10, 1);
  for (let n = 0, tries = 0; n < stoneCount && tries < 500; tries++) {
    const rx = range(4, 11);
    const ry = range(3, 8);
    const { x, y } = point();
    if (x < rx + 1 || x > w - rx - 1 || y < ry + 1 || y > h - ry - 1) continue;
    if (inOld(x - rx - 1, y - ry - 1)) continue;
    if (Math.hypot(x - NEST.x, y - NEST.y) < CLEAR_R + Math.max(rx, ry) + 2) continue;
    features.push({ kind: 'stone', x, y, rx, ry });
    n++;
  }

  // Twigs, wholly in the new area; the first is big (as in generateTerrain, scaled).
  const twigCount = count(6, 9, 1);
  const bigTwigs = Math.max(1, Math.min(2, Math.round(2 * k)));
  for (let n = 0, tries = 0; n < twigCount && tries < 500; tries++) {
    const { x: x0, y: y0 } = point();
    const ang = range(0, Math.PI * 2);
    const len = range(25, 70);
    const x1 = Math.max(0, Math.min(w - 1, x0 + Math.cos(ang) * len));
    const y1 = Math.max(0, Math.min(h - 1, y0 + Math.sin(ang) * len));
    const tk = n < bigTwigs ? int(4, 6) : int(1, 6);
    if (segmentTouchesOld(x0, y0, x1, y1, tk / 2 + 1)) continue;
    if (distToSegment(NEST.x, NEST.y, x0, y0, x1, y1) < CLEAR_R + tk / 2 + 2) continue;
    features.push({ kind: 'twig', x0, y0, x1, y1, t: tk });
    n++;
  }

  // Needle pairs, base point in the new area, needles not reaching into the old area.
  const pairCount = count(40, 50);
  for (let n = 0, tries = 0; n < pairCount && tries < 2000; tries++) {
    const { x, y } = point();
    const a = range(0, Math.PI * 2);
    const spread = range(0.15, 0.4);
    const len = range(6, 14);
    const len2 = len * range(0.8, 1.1);
    if (segmentTouchesOld(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 0)) continue;
    if (segmentTouchesOld(x, y, x + Math.cos(a + spread) * len2, y + Math.sin(a + spread) * len2, 0)) continue;
    features.push({ kind: 'needle', x, y, a, len });
    features.push({ kind: 'needle', x, y, a: a + spread, len: len2 });
    n++;
  }

  // Decoration, skipped near the nest.
  const decor = (n: number, make: (x: number, y: number) => Feature) => {
    for (let i = 0; i < n; i++) {
      const p = point();
      const x = Math.min(p.x, w - 1);
      const y = Math.min(p.y, h - 1);
      if (inClearZone(x, y)) continue;
      features.push(make(x, y));
    }
  };
  decor(count(12, 20), (x, y) => ({ kind: 'moss', x, y }));
  decor(count(15, 25), (x, y) => ({ kind: 'leaf', x, y, c: int(0, 3) }));
  decor(count(30, 50), (x, y) => ({ kind: 'grass', x, y }));

  // Old cells copied row by row, new features drawn into the new cells only.
  const surface = new Uint8Array(w * h);
  const speed = new Float32Array(w * h);
  for (let y = 0; y < oh; y++) {
    surface.set(t.surface.subarray(y * ow, (y + 1) * ow), y * w);
    speed.set(t.speed.subarray(y * ow, (y + 1) * ow), y * w);
  }
  rasterize(features, surface, w, h, inOld);
  for (let y = 0; y < h; y++) {
    for (let x = y < oh ? ow : 0; x < w; x++) speed[y * w + x] = SPEED[surface[y * w + x]];
  }

  return { seed: t.seed, w, h, surface, speed, features: [...t.features, ...features] };
}

export function speedAt(t: Terrain, x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= t.w || iy >= t.h) return 0;
  return t.speed[iy * t.w + ix];
}
