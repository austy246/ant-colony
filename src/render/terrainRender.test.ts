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

  // The worker ant is drawn on a 2x finer grid (1 ant pixel = 0.5 art pixel), so the ant tests render at 4x
  // (the game's default zoom): 160x160 canvas, ant at art (20, 20) = screen (80, 80), one ant pixel = 2 screen px.
  const ZOOM = 4;
  const SIZE = 40 * ZOOM;
  function drawAntZoomed(facing: 1 | -1, carrying: boolean, x = 20, y = 20): Uint8ClampedArray {
    const cv = createCanvas(SIZE, SIZE);
    const ctx = cv.getContext('2d') as unknown as Ctx2D;
    ctx.scale(ZOOM, ZOOM);
    drawAnt(ctx, x, y, facing, carrying);
    return cv.getContext('2d').getImageData(0, 0, SIZE, SIZE).data;
  }
  const alphaAt = (d: Uint8ClampedArray, x: number, y: number): number => d[(y * SIZE + x) * 4 + 3];
  const BLACKS = new Set(['241a12', '4e3d2e', '3a2c20', '1a1410']);

  it('drawAnt is fully black (fixed palette, no red, no pale pixels) when not carrying', () => {
    for (const facing of [1, -1] as const) {
      const d = drawAntZoomed(facing, false);
      let opaque = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;
        expect(d[i] > d[i + 1] + 40 && d[i] > d[i + 2] + 40).toBe(false);
        if (d[i + 3] === 255) {
          opaque++;
          const hex = [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
          expect(BLACKS.has(hex), hex).toBe(true);
        } else {
          expect(Math.max(d[i], d[i + 1], d[i + 2])).toBeLessThan(40); // soft shadow only
        }
      }
      expect(opaque).toBeGreaterThan(40);
    }
  });

  it('drawAnt footprint is about 7x4 art pixels (28x16 screen px at zoom 4), about 30 % smaller than before', () => {
    const d = drawAntZoomed(1, false);
    let x0 = SIZE, x1 = -1, y0 = SIZE, y1 = -1;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (alphaAt(d, x, y) === 0) continue;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x);
        y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
    expect(x1 - x0 + 1).toBe(28);
    expect(y1 - y0 + 1).toBeLessThanOrEqual(16);
    expect(y1 - y0 + 1).toBeGreaterThanOrEqual(14);
  });

  it('drawAnt carrying adds a pale crumb', () => {
    expect(hash(drawAntZoomed(1, false))).not.toBe(hash(drawAntZoomed(1, true)));
  });

  it('drawAnt flips horizontally with facing (exact mirror about the ant centre)', () => {
    const a = drawAntZoomed(1, false);
    const b = drawAntZoomed(-1, false);
    const cx = 20 * ZOOM; // screen column of the centre; pixel column x mirrors to 2 * cx - 1 - x
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const mx = 2 * cx - 1 - x;
        if (mx < 0 || mx >= SIZE) continue;
        expect(alphaAt(a, x, y) > 0, `${x},${y}`).toBe(alphaAt(b, mx, y) > 0);
      }
    }
    expect(hash(a)).not.toBe(hash(b));
  });

  it('crumb #e8e0c8 (2x2 ant pixels) appears only when carrying, on the head side', () => {
    const crumbXs = (d: Uint8ClampedArray): number[] => {
      const xs: number[] = [];
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const i = (y * SIZE + x) * 4;
          if (d[i] === 0xe8 && d[i + 1] === 0xe0 && d[i + 2] === 0xc8 && d[i + 3] === 255) xs.push(x);
        }
      }
      return xs;
    };
    expect(crumbXs(drawAntZoomed(1, false))).toHaveLength(0);
    expect(crumbXs(drawAntZoomed(-1, false))).toHaveLength(0);
    const right = crumbXs(drawAntZoomed(1, true));
    const left = crumbXs(drawAntZoomed(-1, true));
    expect(right).toHaveLength(2 * 2 * 2 * 2); // 2x2 ant pixels, each 2x2 screen px
    expect(left).toHaveLength(2 * 2 * 2 * 2);
    expect(right.every((x) => x > 20 * ZOOM)).toBe(true);
    expect(left.every((x) => x < 20 * ZOOM)).toBe(true);
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
