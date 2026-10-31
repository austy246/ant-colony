import { describe, expect, it } from 'vitest';
import { BUSH_H, BUSH_W, bushPixels } from './bushArt';

describe('bushPixels', () => {
  const px = bushPixels();
  const at = (x: number, y: number): number[] => Array.from(px.slice((y * BUSH_W + x) * 4, (y * BUSH_W + x) * 4 + 4));

  it('is deterministic', () => {
    expect(Array.from(bushPixels().slice(0, 4000))).toEqual(Array.from(px.slice(0, 4000)));
  });

  it('is a leafy green bush: opaque green in the middle, transparent in the corners, lighter on top than at the bottom', () => {
    const mid = at(BUSH_W / 2, Math.round(BUSH_H * 0.46));
    expect(mid[3]).toBe(255);
    expect(mid[1]).toBeGreaterThan(mid[0]); // green, not red
    expect(mid[1]).toBeGreaterThan(mid[2]);
    expect(at(2, 2)[3]).toBe(0);
    expect(at(BUSH_W - 3, BUSH_H - 3)[3]).toBe(0);
    const lum = (y: number): number => {
      let s = 0;
      let n = 0;
      for (let x = BUSH_W / 2 - 60; x < BUSH_W / 2 + 60; x++) {
        const p = at(x, y);
        if (p[3] === 255) { s += p[1]; n++; }
      }
      return n ? s / n : 0;
    };
    expect(lum(Math.round(BUSH_H * 0.22))).toBeGreaterThan(lum(Math.round(BUSH_H * 0.78)) + 15);
  });

  it('has varied leaf shades (not a flat fill)', () => {
    const shades = new Set<number>();
    for (let x = BUSH_W / 2 - 40; x < BUSH_W / 2 + 40; x++) shades.add(at(x, Math.round(BUSH_H * 0.4))[1]);
    expect(shades.size).toBeGreaterThan(4);
  });
});
