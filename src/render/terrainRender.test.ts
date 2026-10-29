import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { NEST, WORLD_H, WORLD_W } from '../sim/constants';
import type { FoodKind } from '../sim/food';
import { createRng } from '../sim/rng';
import { generateTerrain } from '../sim/terrain';
import { drawAnt, drawFood, type Ctx2D } from './sprites';
import { renderTerrain, type CanvasLike } from './terrainRender';

const make = (w: number, h: number): CanvasLike => createCanvas(w, h) as unknown as CanvasLike;

function pixels(c: CanvasLike): Uint8ClampedArray {
  return c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
}

function hash(d: Uint8ClampedArray): number {
  let h = 2166136261;
  for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619) >>> 0;
  return h;
}

describe('renderTerrain', () => {
  it('returns canvas sized WORLD_W x WORLD_H', () => {
    const c = renderTerrain(generateTerrain(1), make);
    expect(c.width).toBe(WORLD_W);
    expect(c.height).toBe(WORLD_H);
  });

  it('is deterministic for the same seed', () => {
    const a = pixels(renderTerrain(generateTerrain(42), make));
    const b = pixels(renderTerrain(generateTerrain(42), make));
    expect(hash(a)).toBe(hash(b));
  });

  it('differs for different seeds', () => {
    const a = pixels(renderTerrain(generateTerrain(1), make));
    const b = pixels(renderTerrain(generateTerrain(2), make));
    expect(hash(a)).not.toBe(hash(b));
  });

  it('draws a dark nest hole and is fully opaque over 500 random cells', () => {
    const c = renderTerrain(generateTerrain(7), make);
    const d = pixels(c);
    const at = (x: number, y: number) => {
      const i = (Math.round(y) * WORLD_W + Math.round(x)) * 4;
      return { r: d[i], g: d[i + 1], b: d[i + 2], a: d[i + 3] };
    };
    const n = at(NEST.x, NEST.y);
    expect(n.r + n.g + n.b).toBeLessThan(60);
    const rnd = createRng(99);
    for (let i = 0; i < 500; i++) {
      const p = at(rnd() * (WORLD_W - 1), rnd() * (WORLD_H - 1));
      expect(p.a).toBe(255);
    }
  });
});

describe('sprites', () => {
  function draw(fn: (c: Ctx2D) => void): Uint8ClampedArray {
    const cv = createCanvas(40, 40);
    const ctx = cv.getContext('2d') as unknown as Ctx2D;
    fn(ctx);
    return cv.getContext('2d').getImageData(0, 0, 40, 40).data;
  }

  it('drawAnt paints pixels and none is red-dominant when not carrying', () => {
    for (const facing of [1, -1] as const) {
      const d = draw((c) => drawAnt(c, 20, 20, facing, false));
      let painted = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;
        painted++;
        expect(d[i] > d[i + 1] + 40 && d[i] > d[i + 2] + 40).toBe(false);
      }
      expect(painted).toBeGreaterThan(10);
    }
  });

  it('drawAnt carrying adds a pale crumb', () => {
    const plain = draw((c) => drawAnt(c, 20, 20, 1, false));
    const carry = draw((c) => drawAnt(c, 20, 20, 1, true));
    expect(hash(plain)).not.toBe(hash(carry));
  });

  it('drawFood paints every kind', () => {
    const kinds: FoodKind[] = ['beetle', 'caterpillar', 'fly', 'carrion', 'berry', 'mushroom'];
    for (const k of kinds) {
      const d = draw((c) => drawFood(c, k, 20, 20));
      let painted = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) painted++;
      expect(painted, k).toBeGreaterThan(10);
    }
  });
});
