import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { NEST, WORLD_H, WORLD_W } from '../sim/constants';
import { generateTerrain, Surface, type Feature } from '../sim/terrain';
import { FINE } from './fine';
import { renderTerrain, type CanvasLike } from './terrainRender';

const make = (w: number, h: number): CanvasLike => createCanvas(w, h) as unknown as CanvasLike;
const FW = WORLD_W * FINE;
const FH = WORLD_H * FINE;

function pixels(c: CanvasLike): Uint8ClampedArray {
  return c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
}

function hash(d: Uint8ClampedArray): number {
  let h = 2166136261;
  for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619) >>> 0;
  return h;
}

const rgbAt = (d: Uint8ClampedArray, fx: number, fy: number): [number, number, number] => {
  const i = (fy * FW + fx) * 4;
  return [d[i], d[i + 1], d[i + 2]];
};

describe('renderTerrain', () => {
  it('returns a canvas on the fine grid: WORLD_W*FINE x WORLD_H*FINE (640 x 400)', () => {
    const c = renderTerrain(generateTerrain(1), make);
    expect(FINE).toBe(2);
    expect(c.width).toBe(WORLD_W * FINE);
    expect(c.height).toBe(WORLD_H * FINE);
    expect([c.width, c.height]).toEqual([640, 400]);
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

  it('is fully opaque (the ground covers every fine pixel)', () => {
    const d = pixels(renderTerrain(generateTerrain(3), make));
    for (let i = 3; i < d.length; i += 4) if (d[i] !== 255) throw new Error(`transparent pixel at index ${(i - 3) / 4}`);
  });

  // Palette sanity. Sample a 3-fine-pixel grid (~28 000 pixels, nest hole area excluded from the black/white
  // check). Every pixel must be forest-like (not blue-dominant, not near-white / near-black) and at least
  // MIN_NEAR of them must lie within 24 per RGB channel of a declared palette colour (shadow, blend and shading
  // results make up the remainder). MIN_NEAR = 0.97 sits ~3 points below the 0.997 measured on seed 5 (the old art-grid renderer measured ~0.9 against 0.85).
  const PALETTE = [
    '#4a3524', '#54402c', '#3e2c1d', '#5f4a33', '#352517', '#6b5238', '#2a1c11', // ground + specks
    '#4f7a2e', '#3d6023', '#68964a', '#2f4c1b', '#86b35f', // moss / grass
    '#7a4a22', '#9a6130', '#6a3d1c', '#a8703a', // leaves
    '#5d5f5b', '#797b76', '#93958f', '#c4c6c0', '#44463f', // stones
    '#4c3320', '#6b4a2c', '#8a6339', '#2e1d10', '#b79a6a', '#7a5733', // twigs
    '#c9822f', '#9b5d22', '#6d8f2f', '#4f7022', // needles
    '#7d6244', '#8d7152', '#5a432c', // crater
  ].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  const MIN_NEAR = 0.97;

  function forestStats(d: Uint8ClampedArray): { total: number; near: number; blue: number; blackWhite: number } {
    let total = 0;
    let near = 0;
    let blue = 0;
    let blackWhite = 0;
    for (let y = 0; y < FH; y += 3) {
      for (let x = 0; x < FW; x += 3) {
        const [r, g, b] = rgbAt(d, x, y);
        total++;
        if (b > r + 20) blue++;
        const inHole = Math.hypot(x / FINE - NEST.x, y / FINE - NEST.y) < 14;
        if (!inHole && !(r + g + b > 15 && r + g + b < 700)) blackWhite++;
        if (PALETTE.some((p) => Math.abs(p[0] - r) <= 24 && Math.abs(p[1] - g) <= 24 && Math.abs(p[2] - b) <= 24)) near++;
      }
    }
    return { total, near, blue, blackWhite };
  }

  it('ground pixels stay within the forest palette', () => {
    const s = forestStats(pixels(renderTerrain(generateTerrain(5), make)));
    expect(s.blue, 'blue-dominant pixels').toBe(0);
    expect(s.blackWhite, 'black / white pixels outside the hole').toBe(0);
    expect(s.near / s.total).toBeGreaterThanOrEqual(MIN_NEAR);
  });

  it('the palette check is not vacuous: off-palette pollution is rejected by the same thresholds', () => {
    const d = pixels(renderTerrain(generateTerrain(5), make)).slice();
    // Control: paint ~25 % of the sampled pixels vivid blue and ~5 % flat grey (far from every palette colour).
    for (let y = 0; y < FH; y += 3) {
      for (let x = 0; x < FW; x += 3) {
        const k = ((x / 3) * 7 + (y / 3) * 13) % 20;
        const i = (y * FW + x) * 4;
        if (k < 5) [d[i], d[i + 1], d[i + 2]] = [40, 90, 220];
        else if (k < 6) [d[i], d[i + 1], d[i + 2]] = [128, 128, 128];
      }
    }
    const s = forestStats(d);
    expect(s.blue).toBeGreaterThan(0);
    expect(s.near / s.total).toBeLessThan(MIN_NEAR);
  });

  it('draws a dark nest hole at the nest position scaled to the fine grid', () => {
    const d = pixels(renderTerrain(generateTerrain(7), make));
    const [r, g, b] = rgbAt(d, Math.round(NEST.x * FINE), Math.round(NEST.y * FINE));
    expect(r + g + b).toBeLessThan(60);
    // The rim around the hole is lighter dirt.
    const [rr, rg, rb] = rgbAt(d, Math.round(NEST.x * FINE), Math.round(NEST.y * FINE) - 10);
    expect(rr + rg + rb).toBeGreaterThan(150);
  });

  it('draws finer detail than the art grid: horizontal neighbours inside one art pixel often differ', () => {
    const d = pixels(renderTerrain(generateTerrain(5), make));
    let differing = 0;
    let pairs = 0;
    for (let y = 0; y < FH; y += 2) {
      for (let x = 0; x < FW; x += 2) {
        const a = rgbAt(d, x, y);
        const b = rgbAt(d, x + 1, y);
        pairs++;
        if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]) differing++;
      }
    }
    expect(differing / pairs).toBeGreaterThan(0.25);
  });
});

describe('terrain features map 1:1 onto the fine grid', () => {
  const t = generateTerrain(5);
  const d = pixels(renderTerrain(t, make));
  const near = (f: { x: number; y: number }, x: number, y: number, r: number): boolean => Math.hypot(f.x - x, f.y - y) < r;
  const grass = t.features.filter((f): f is Extract<Feature, { kind: 'grass' }> => f.kind === 'grass');

  it('the centre of every stone feature (x*FINE, y*FINE) is grey', () => {
    const stones = t.features.filter((f): f is Extract<Feature, { kind: 'stone' }> => f.kind === 'stone');
    expect(stones.length).toBeGreaterThanOrEqual(7);
    let checked = 0;
    for (const s of stones) {
      // grass blades are drawn above stones; skip the (rare) stone with a tuft right on its centre
      if (grass.some((g) => near(g, s.x, s.y, 5))) continue;
      const [r, g, b] = rgbAt(d, Math.floor(s.x * FINE), Math.floor(s.y * FINE));
      const msg = `stone at ${s.x.toFixed(1)},${s.y.toFixed(1)} rgb ${r},${g},${b}`;
      expect(Math.abs(r - g), msg).toBeLessThan(25);
      expect(Math.abs(g - b), msg).toBeLessThan(25);
      expect(r + g + b, msg).toBeGreaterThan(150);
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(5);
  });

  it('the centreline of every big twig is brown (r > g > b) at its fine-grid position', () => {
    const twigs = t.features.filter((f): f is Extract<Feature, { kind: 'twig' }> => f.kind === 'twig' && f.t >= 4);
    expect(twigs.length).toBeGreaterThanOrEqual(2);
    let checked = 0;
    for (const w of twigs) {
      for (const u of [0.25, 0.5, 0.75]) {
        const x = w.x0 + (w.x1 - w.x0) * u;
        const y = w.y0 + (w.y1 - w.y0) * u;
        // only where the sim itself says "big twig" (a stone may sit on top)
        if (t.surface[Math.round(y) * t.w + Math.round(x)] !== Surface.BigTwig) continue;
        if (grass.some((g) => near(g, x, y, 4))) continue;
        const [r, g, b] = rgbAt(d, Math.floor(x * FINE), Math.floor(y * FINE));
        expect(r > g && g > b, `twig at ${x.toFixed(1)},${y.toFixed(1)} rgb ${r},${g},${b}`).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(3);
  });

  it('most sim stone cells are drawn grey and most big-twig cells brown (rendering matches the speed map)', () => {
    let stoneCells = 0;
    let greyCells = 0;
    let twigCells = 0;
    let brownCells = 0;
    for (let y = 0; y < t.h; y++) {
      for (let x = 0; x < t.w; x++) {
        const s = t.surface[y * t.w + x];
        if (s !== Surface.Stone && s !== Surface.BigTwig) continue;
        const [r, g, b] = rgbAt(d, x * FINE + 1, y * FINE + 1);
        if (s === Surface.Stone) {
          stoneCells++;
          if (Math.abs(r - g) < 25 && Math.abs(g - b) < 25) greyCells++;
        } else {
          twigCells++;
          if (r > g && g >= b) brownCells++;
        }
      }
    }
    expect(greyCells / stoneCells).toBeGreaterThan(0.8);
    expect(brownCells / twigCells).toBeGreaterThan(0.8);
  });
});
