import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { drawSpider, drawWeb } from './spiderArt';
import type { Ctx2D } from './sprites';

const SCALE = 4;
const SIZE = 120;
const CENTRE = 15; // art px; the screen centre is CENTRE * SCALE

function paint(fn: (c: Ctx2D) => void): Uint8ClampedArray {
  const canvas = createCanvas(SIZE, SIZE);
  const c = canvas.getContext('2d');
  c.imageSmoothingEnabled = false;
  c.scale(SCALE, SCALE);
  fn(c as unknown as Ctx2D);
  return c.getImageData(0, 0, SIZE, SIZE).data as unknown as Uint8ClampedArray;
}

const painted = (d: Uint8ClampedArray): number => {
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
  return n;
};

describe('spiderArt', () => {
  it('drawWeb paints something and stays inside the circle', () => {
    const r = 12;
    const d = paint((c) => drawWeb(c, CENTRE, CENTRE, r, 3.7));
    expect(painted(d)).toBeGreaterThan(150);
    let far = 0;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (d[(y * SIZE + x) * 4 + 3] === 0) continue;
        if (Math.hypot(x + 0.5 - CENTRE * SCALE, y + 0.5 - CENTRE * SCALE) / SCALE > r + 1) far++;
      }
    }
    expect(far).toBe(0);
  });

  it('drawWeb is light and semi-transparent', () => {
    const d = paint((c) => drawWeb(c, CENTRE, CENTRE, 12, 0));
    let checked = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      checked++;
      expect(d[i]).toBeGreaterThan(200);
      expect(d[i + 3]).toBeLessThan(200);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('drawSpider is not blank and differs from the web', () => {
    const s = paint((c) => drawSpider(c, CENTRE, CENTRE));
    const w = paint((c) => drawWeb(c, CENTRE, CENTRE, 12, 0));
    expect(painted(s)).toBeGreaterThan(160); // the spider is twice the size
    expect(Array.from(s)).not.toEqual(Array.from(w));
    // a dark body pixel in the middle
    const mid = (CENTRE * SCALE * SIZE + CENTRE * SCALE) * 4;
    expect(Math.max(s[mid], s[mid + 1], s[mid + 2])).toBeLessThan(60);
    expect(s[mid + 3]).toBe(255);
  });
});
