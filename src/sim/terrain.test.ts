import { describe, it, expect } from 'vitest';
import { extendTerrain, generateTerrain, speedAt, Surface, terrainSize, type Feature, type Terrain } from './terrain';
import { MAP_STEP_H, MAP_STEP_W, MAX_MAP_STEP, NEST, WORLD_W, WORLD_H } from './constants';

describe('terrain', () => {
  it('same seed gives identical terrain', () => {
    const a = generateTerrain(123);
    const b = generateTerrain(123);
    expect(Array.from(a.surface)).toEqual(Array.from(b.surface));
    expect(a.features).toEqual(b.features);
  });

  it('nest area is free of stones and twigs', () => {
    for (const seed of [1, 2, 3, 42, 999]) {
      const t = generateTerrain(seed);
      const R = NEST.r + 8;
      for (let y = 0; y < WORLD_H; y++) {
        for (let x = 0; x < WORLD_W; x++) {
          if ((x - NEST.x) ** 2 + (y - NEST.y) ** 2 <= R * R) {
            const s = t.surface[y * WORLD_W + x];
            expect([Surface.Ground, Surface.Needle]).toContain(s);
          }
        }
      }
    }
  });

  it('stone cells have speed 0.15 and ground 1', () => {
    const t = generateTerrain(7);
    let stones = 0;
    let ground = 0;
    for (let i = 0; i < t.surface.length; i++) {
      if (t.surface[i] === Surface.Stone) {
        stones++;
        expect(t.speed[i]).toBeCloseTo(0.15);
      } else if (t.surface[i] === Surface.Ground) {
        ground++;
        expect(t.speed[i]).toBeCloseTo(1);
      }
    }
    expect(stones).toBeGreaterThan(0);
    expect(ground).toBeGreaterThan(0);
  });

  it('speedAt outside map returns 0', () => {
    const t = generateTerrain(7);
    expect(speedAt(t, -1, 5)).toBe(0);
    expect(speedAt(t, 5, -1)).toBe(0);
    expect(speedAt(t, WORLD_W, 5)).toBe(0);
    expect(speedAt(t, 5, WORLD_H)).toBe(0);
    expect(speedAt(t, 1000, 1000)).toBe(0);
  });

  it('terrain contains at least 5 stones and 4 twigs', () => {
    for (const seed of [1, 2, 3, 42, 999]) {
      const t = generateTerrain(seed);
      expect(t.features.filter((f) => f.kind === 'stone').length).toBeGreaterThanOrEqual(5);
      expect(t.features.filter((f) => f.kind === 'twig').length).toBeGreaterThanOrEqual(4);
    }
  });
});

/** Terrain of seed grown step by step up to `step`. */
function grownTerrain(seed: number, step: number): Terrain {
  let t = generateTerrain(seed);
  for (let s = 1; s <= step; s++) t = extendTerrain(t, s);
  return t;
}

/** A point that identifies where a feature sits (its centre / base point). */
function featureCenter(f: Feature): { x: number; y: number } {
  return f.kind === 'twig' ? { x: (f.x0 + f.x1) / 2, y: (f.y0 + f.y1) / 2 } : { x: f.x, y: f.y };
}

describe('map growth terrain', () => {
  it('terrainSize grows by MAP_STEP_W x MAP_STEP_H per step and is clamped', () => {
    expect(terrainSize(0)).toEqual({ w: WORLD_W, h: WORLD_H });
    expect(terrainSize(3)).toEqual({ w: WORLD_W + 3 * MAP_STEP_W, h: WORLD_H + 3 * MAP_STEP_H });
    expect(terrainSize(MAX_MAP_STEP + 5)).toEqual(terrainSize(MAX_MAP_STEP));
    expect(terrainSize(-2)).toEqual(terrainSize(0));
  });

  it('extendTerrain keeps every old cell and feature', () => {
    for (const seed of [1, 42]) {
      for (const step of [1, 2, 5]) {
        const old = grownTerrain(seed, step - 1);
        const t = extendTerrain(old, step);
        const { w, h } = terrainSize(step);
        expect(t.w).toBe(w);
        expect(t.h).toBe(h);
        expect(t.seed).toBe(seed);
        expect(t.surface.length).toBe(w * h);
        expect(t.speed.length).toBe(w * h);
        let diffs = 0;
        for (let y = 0; y < old.h; y++) {
          for (let x = 0; x < old.w; x++) {
            if (t.surface[y * w + x] !== old.surface[y * old.w + x]) diffs++;
            if (t.speed[y * w + x] !== old.speed[y * old.w + x]) diffs++;
          }
        }
        expect(diffs).toBe(0);
        expect(t.features.slice(0, old.features.length)).toEqual(old.features);
        expect(t.features.length).toBeGreaterThan(old.features.length);
        expect(t).not.toBe(old);
      }
    }
  });

  it('extendTerrain is deterministic', () => {
    const a = grownTerrain(7, 3);
    const b = grownTerrain(7, 3);
    expect(Array.from(a.surface)).toEqual(Array.from(b.surface));
    expect(Array.from(a.speed)).toEqual(Array.from(b.speed));
    expect(a.features).toEqual(b.features);
  });

  it('extendTerrain adds features in the new area only', () => {
    for (const seed of [1, 2, 3, 42, 999]) {
      let t = generateTerrain(seed);
      for (let step = 1; step <= MAX_MAP_STEP; step++) {
        const old = t;
        t = extendTerrain(old, step);
        const added = t.features.slice(old.features.length);
        expect(added.some((f) => f.kind === 'stone')).toBe(true);
        expect(added.some((f) => f.kind === 'twig')).toBe(true);
        for (const f of added) {
          const c = featureCenter(f);
          expect(c.x >= old.w || c.y >= old.h).toBe(true);
          expect(c.x).toBeLessThan(t.w);
          expect(c.y).toBeLessThan(t.h);
        }
      }
    }
  });

  it('terrain stays passable near the nest', () => {
    const t = grownTerrain(3, MAX_MAP_STEP);
    const R = NEST.r + 8;
    let blocked = 0;
    for (let y = 0; y < t.h; y++) {
      for (let x = 0; x < t.w; x++) {
        const s = t.surface[y * t.w + x];
        if ((x - NEST.x) ** 2 + (y - NEST.y) ** 2 <= R * R && s !== Surface.Ground && s !== Surface.Needle) blocked++;
      }
    }
    expect(blocked).toBe(0);
    for (const f of t.features) {
      if (f.kind === 'stone') expect(Math.hypot(f.x - NEST.x, f.y - NEST.y)).toBeGreaterThan(R);
    }
  });
});

function fnv1a(bytes: Uint8Array): number {
  let h = 0x811c9dc5;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// GOLDEN VALUES: saved games store only the seed and regenerate the terrain from it on load.
// Changing generateTerrain (and so these literals) silently invalidates all saved games.
describe('terrain golden values', () => {
  it('generateTerrain(42) is stable', () => {
    const t = generateTerrain(42);
    expect(fnv1a(t.surface)).toBe(644848548);
    expect(t.speed.length).toBe(64000);
    expect(fnv1a(new Uint8Array(t.speed.buffer, t.speed.byteOffset, t.speed.byteLength))).toBe(2567583242);
    expect(t.features.length).toBe(182);
  });
});
