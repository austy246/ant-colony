import { describe, it, expect } from 'vitest';
import { generateTerrain, speedAt, Surface } from './terrain';
import { NEST, WORLD_W, WORLD_H } from './constants';

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
