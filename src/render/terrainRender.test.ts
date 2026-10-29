import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { NEST, WORLD_H, WORLD_W } from '../sim/constants';
import type { FoodKind } from '../sim/food';
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

  // Palette sanity. Thresholds: sample a 3px grid (~7000 pixels, nest hole area excluded from the
  // black/white check). Every pixel must be "forest-like" (not blue-dominant: b > r + 20 fails; not
  // near-white or near-black), and >= 85% must lie within 24 per RGB channel of a declared palette colour
  // (shadow/blend results make up the remainder).
  it('ground pixels stay within the forest palette', () => {
    const PALETTE = [
      '#4a3524', '#54402c', '#3e2c1d', '#5f4a33', '#352517', '#6b5238', '#2a1c11', // ground + specks
      '#4f7a2e', '#3d6023', '#68964a', // moss / grass
      '#7a4a22', '#9a6130', '#6a3d1c', '#a8703a', // leaves
      '#5d5f5b', '#797b76', '#93958f', '#c4c6c0', // stones
      '#4c3320', '#6b4a2c', '#8a6339', '#2e1d10', '#b79a6a', '#7a5733', // twigs
      '#c9822f', '#9b5d22', '#6d8f2f', '#4f7022', // needles
      '#7d6244', '#8d7152', '#5a432c', // crater
    ].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
    const d = pixels(renderTerrain(generateTerrain(5), make));
    let total = 0;
    let near = 0;
    for (let y = 0; y < WORLD_H; y += 3) {
      for (let x = 0; x < WORLD_W; x += 3) {
        const i = (y * WORLD_W + x) * 4;
        const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
        total++;
        expect(b > r + 20, `blue-dominant at ${x},${y}`).toBe(false);
        const inHole = Math.hypot(x - NEST.x, y - NEST.y) < 14;
        if (!inHole) {
          expect(r + g + b > 15 && r + g + b < 700, `black/white at ${x},${y}`).toBe(true);
        }
        if (PALETTE.some((p) => Math.abs(p[0] - r) <= 24 && Math.abs(p[1] - g) <= 24 && Math.abs(p[2] - b) <= 24)) near++;
      }
    }
    expect(near / total).toBeGreaterThanOrEqual(0.85);
  });

  it('draws a dark nest hole', () => {
    const d = pixels(renderTerrain(generateTerrain(7), make));
    const i = (Math.round(NEST.y) * WORLD_W + Math.round(NEST.x)) * 4;
    expect(d[i] + d[i + 1] + d[i + 2]).toBeLessThan(60);
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

  it('drawAnt flips horizontally with facing', () => {
    const a = draw((c) => drawAnt(c, 20, 20, 1, false));
    const b = draw((c) => drawAnt(c, 20, 20, -1, false));
    // mirror axis: legs/body are centred on x=20 (pixel column 20 maps to itself); allow +-1 rounding column
    let diff = 0;
    for (let y = 10; y < 30; y++) {
      for (let x = 8; x < 33; x++) {
        const i = (y * 40 + x) * 4 + 3;
        const j = (y * 40 + (40 - x)) * 4 + 3;
        if ((a[i] > 0) !== (b[j] > 0)) diff++;
      }
    }
    expect(diff).toBeLessThan(25);
    expect(hash(a)).not.toBe(hash(b));
  });

  it('crumb #e8e0c8 appears only when carrying, on the head side', () => {
    const crumbXs = (d: Uint8ClampedArray): number[] => {
      const xs: number[] = [];
      for (let y = 0; y < 40; y++) {
        for (let x = 0; x < 40; x++) {
          const i = (y * 40 + x) * 4;
          if (d[i] === 0xe8 && d[i + 1] === 0xe0 && d[i + 2] === 0xc8 && d[i + 3] === 255) xs.push(x);
        }
      }
      return xs;
    };
    expect(crumbXs(draw((c) => drawAnt(c, 20, 20, 1, false)))).toHaveLength(0);
    expect(crumbXs(draw((c) => drawAnt(c, 20, 20, -1, false)))).toHaveLength(0);
    const right = crumbXs(draw((c) => drawAnt(c, 20, 20, 1, true)));
    const left = crumbXs(draw((c) => drawAnt(c, 20, 20, -1, true)));
    expect(right.length).toBeGreaterThan(0);
    expect(left.length).toBeGreaterThan(0);
    expect(right.every((x) => x > 20)).toBe(true);
    expect(left.every((x) => x < 20)).toBe(true);
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
