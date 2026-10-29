import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { drawAnt, drawFood, type Ctx2D } from './sprites';

function pixels(draw: (c: Ctx2D) => void): Uint8ClampedArray {
  const cv = createCanvas(48, 32);
  const c = cv.getContext('2d') as unknown as Ctx2D;
  draw(c);
  return cv.getContext('2d').getImageData(0, 0, 48, 32).data as unknown as Uint8ClampedArray;
}

describe('sprite snapping', () => {
  it('drawAnt snaps to the half-art-pixel grid: fractional coordinates render like the nearest half pixel', () => {
    for (const carrying of [false, true]) {
      for (const facing of [1, -1] as const) {
        const a = pixels((c) => drawAnt(c, 20.4, 10.4, facing, carrying));
        const b = pixels((c) => drawAnt(c, 20.5, 10.5, facing, carrying));
        expect(Array.from(a)).toEqual(Array.from(b));
        const l1 = pixels((c) => drawAnt(c, 20.2, 10.2, facing, carrying));
        const l2 = pixels((c) => drawAnt(c, 20, 10, facing, carrying));
        expect(Array.from(l1)).toEqual(Array.from(l2));
      }
    }
    expect(Array.from(pixels((c) => drawAnt(c, 20.4, 10.4, 1, false)))).not.toEqual(
      Array.from(pixels((c) => drawAnt(c, 22, 10, 1, false))),
    );
    // half-pixel steps are distinct positions
    expect(Array.from(pixels((c) => drawAnt(c, 20, 10, 1, false)))).not.toEqual(
      Array.from(pixels((c) => drawAnt(c, 20.5, 10, 1, false))),
    );
  });

  it('drawFood at fractional coordinates renders the same pixels as at the rounded ones', () => {
    for (const kind of ['beetle', 'caterpillar', 'fly', 'carrion', 'berry', 'mushroom'] as const) {
      const a = pixels((c) => drawFood(c, kind, 24.4, 16.4));
      const b = pixels((c) => drawFood(c, kind, 24, 16));
      expect(Array.from(a)).toEqual(Array.from(b));
    }
  });
});
