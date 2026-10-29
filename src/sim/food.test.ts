import { describe, expect, it } from 'vitest';
import { FOOD_TABLE, resolvePlacement } from './food';
import { generateTerrain, Surface, type Terrain } from './terrain';
import { NEST } from './constants';

function cellAt(t: Terrain, x: number, y: number): number {
  return t.surface[Math.floor(y) * t.w + Math.floor(x)];
}

function findStone(t: Terrain): { x: number; y: number } {
  for (let y = 0; y < t.h; y++) {
    for (let x = 0; x < t.w; x++) {
      if (t.surface[y * t.w + x] === Surface.Stone) return { x, y };
    }
  }
  throw new Error('no stone found');
}

describe('resolvePlacement', () => {
  it('point inside map on ground is unchanged', () => {
    const t = generateTerrain(1);
    let found: { x: number; y: number } | null = null;
    for (let y = 0; y < t.h && !found; y++) {
      for (let x = 0; x < t.w; x++) {
        if (t.surface[y * t.w + x] === Surface.Ground && Math.hypot(x + 0.3 - NEST.x, y + 0.7 - NEST.y) >= NEST.r + 4) {
          found = { x: x + 0.3, y: y + 0.7 };
          break;
        }
      }
    }
    expect(found).not.toBeNull();
    expect(resolvePlacement(t, found!.x, found!.y)).toEqual(found);
  });

  it('point outside map returns null', () => {
    const t = generateTerrain(1);
    expect(resolvePlacement(t, -1, 10)).toBeNull();
    expect(resolvePlacement(t, 10, -0.5)).toBeNull();
    expect(resolvePlacement(t, t.w, 10)).toBeNull();
    expect(resolvePlacement(t, 10, t.h)).toBeNull();
    expect(resolvePlacement(t, NaN, 10)).toBeNull();
    expect(resolvePlacement(t, 10, Infinity)).toBeNull();
  });

  it('point on stone is moved to nearest ground cell within 12', () => {
    const t = generateTerrain(1);
    const s = findStone(t);
    const r = resolvePlacement(t, s.x + 0.5, s.y + 0.5);
    expect(r).not.toBeNull();
    const surf = cellAt(t, r!.x, r!.y);
    expect(surf).not.toBe(Surface.Stone);
    expect(surf).not.toBe(Surface.BigTwig);
    expect(Math.max(Math.abs(Math.floor(r!.x) - s.x), Math.abs(Math.floor(r!.y) - s.y))).toBeLessThanOrEqual(12);
    expect(r!.x % 1).toBeCloseTo(0.5);
    expect(r!.y % 1).toBeCloseTo(0.5);
  });

  it('point in nest radius is moved out of it', () => {
    const t = generateTerrain(1);
    const r = resolvePlacement(t, NEST.x + 1, NEST.y + 1);
    expect(r).not.toBeNull();
    expect(Math.hypot(r!.x - NEST.x, r!.y - NEST.y)).toBeGreaterThanOrEqual(NEST.r + 4);
    expect(Math.hypot(r!.x - (NEST.x + 1), r!.y - (NEST.y + 1))).toBeLessThanOrEqual(13 * Math.SQRT2);
  });

  it('point surrounded by stone with no free cell within 12 returns null', () => {
    const w = 60;
    const h = 60;
    const surface = new Uint8Array(w * h).fill(Surface.Stone);
    const t: Terrain = { seed: 0, w, h, surface, speed: new Float32Array(w * h), features: [] };
    expect(resolvePlacement(t, 30, 30)).toBeNull();
  });
});

describe('FOOD_TABLE', () => {
  it('has exactly the six forest kinds', () => {
    expect(Object.keys(FOOD_TABLE).sort()).toEqual(['beetle', 'berry', 'carrion', 'caterpillar', 'fly', 'mushroom']);
    expect(FOOD_TABLE.beetle).toEqual({ pieces: 18, value: 2 / 3 });
    expect(FOOD_TABLE.caterpillar).toEqual({ pieces: 12, value: 2 / 3 });
    expect(FOOD_TABLE.fly).toEqual({ pieces: 6, value: 2 / 3 });
    expect(FOOD_TABLE.carrion).toEqual({ pieces: 24, value: 2 / 3 });
    expect(FOOD_TABLE.berry).toEqual({ pieces: 3, value: 1 });
    expect(FOOD_TABLE.mushroom).toEqual({ pieces: 3, value: 1 });
  });

  it('total food per item is unchanged by the smaller-pieces split (pieces x value)', () => {
    const total = (k: keyof typeof FOOD_TABLE) => FOOD_TABLE[k].pieces * FOOD_TABLE[k].value;
    expect(total('beetle')).toBeCloseTo(12, 9);
    expect(total('caterpillar')).toBeCloseTo(8, 9);
    expect(total('fly')).toBeCloseTo(4, 9);
    expect(total('carrion')).toBeCloseTo(16, 9);
    expect(total('berry')).toBeCloseTo(3, 9);
    expect(total('mushroom')).toBeCloseTo(3, 9);
  });
});
