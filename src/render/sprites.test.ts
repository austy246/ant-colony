import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import type { FoodKind } from '../sim/food';
import { FINE } from './fine';
import { ANT_SIZE } from './antArt';
import { AntSprites, drawAnt, drawFood, drawQueen, MAJOR_SCALE, type Ctx2D } from './sprites';
import type { CanvasLike } from './terrainRender';

const makeCanvas = (w: number, h: number): CanvasLike => createCanvas(w, h) as unknown as CanvasLike;
const ZOOM = 4; // the game's default zoom: 1 fine pixel = ZOOM / FINE = 2 screen px
const CELL = ZOOM / FINE;
const ART = 80; // art pixels per test canvas side, anchor in the middle
const SIZE = ART * ZOOM;
const AX = ART / 2;

function hash(d: Uint8ClampedArray): number {
  let h = 2166136261;
  for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619) >>> 0;
  return h;
}

function render(fn: (c: Ctx2D) => void, zoom = ZOOM): Uint8ClampedArray {
  const cv = createCanvas(ART * zoom, ART * zoom);
  const ctx = cv.getContext('2d') as unknown as Ctx2D;
  ctx.scale(zoom, zoom);
  fn(ctx);
  return cv.getContext('2d').getImageData(0, 0, ART * zoom, ART * zoom).data as unknown as Uint8ClampedArray;
}

const alphaAt = (d: Uint8ClampedArray, x: number, y: number): number => d[(y * SIZE + x) * 4 + 3];

function bounds(d: Uint8ClampedArray, minAlpha = 1): { x0: number; x1: number; y0: number; y1: number } {
  let x0 = SIZE;
  let x1 = -1;
  let y0 = SIZE;
  let y1 = -1;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (alphaAt(d, x, y) < minAlpha) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  return { x0, x1, y0, y1 };
}

/** Opaque pixels in fine-pixel units. */
function opaqueFine(d: Uint8ClampedArray): number {
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] === 255) n++;
  return n / (CELL * CELL);
}

function anyPainted(d: Uint8ClampedArray): number {
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
  return n / (CELL * CELL);
}

const KINDS: FoodKind[] = ['beetle', 'caterpillar', 'fly', 'carrion', 'berry', 'mushroom', 'sugar', 'leaf'];

describe('worker ant (fine grid)', () => {
  const sprites = new AntSprites(makeCanvas);
  const ant = (dir: number, carrying: boolean, x = AX, y = AX, frame = 0): Uint8ClampedArray =>
    render((c) => drawAnt(c, sprites, x, y, dir, frame, carrying));
  const BLACKS = new Set(['241a12', '4e3d2e', '3a2c20', '1a1410']);

  it('is fully black (fixed palette, no red, no pale pixels) when not carrying, in every direction and frame', () => {
    for (let dir = 0; dir < 16; dir++) {
      for (let frame = 0; frame < 4; frame++) {
        const d = ant(dir, false, AX, AX, frame);
        let opaque = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] === 0) continue;
          expect(d[i] > d[i + 1] + 40 && d[i] > d[i + 2] + 40).toBe(false);
          if (d[i + 3] === 255) {
            opaque++;
            const hex = [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
            expect(BLACKS.has(hex), `dir ${dir} ${hex}`).toBe(true);
          } else {
            expect(Math.max(d[i], d[i + 1], d[i + 2])).toBeLessThan(40); // soft shadow only
          }
        }
        expect(opaque / (CELL * CELL), `dir ${dir} frame ${frame}`).toBeGreaterThan(25);
        expect(opaque / (CELL * CELL)).toBeLessThan(90);
      }
    }
  });

  it('footprint facing right is about 13-14 fine px (6.5-7 art px) wide and 9-10 fine px tall', () => {
    const b = bounds(ant(0, false), 255);
    expect((b.x1 - b.x0 + 1) / CELL).toBeGreaterThanOrEqual(12);
    expect((b.x1 - b.x0 + 1) / CELL).toBeLessThanOrEqual(15);
    expect((b.y1 - b.y0 + 1) / CELL).toBeGreaterThanOrEqual(8);
    expect((b.y1 - b.y0 + 1) / CELL).toBeLessThanOrEqual(11);
  });

  it('carrying adds a pale crumb', () => {
    expect(hash(ant(0, false))).not.toBe(hash(ant(0, true)));
  });

  it('facing left (dir 8) is the exact mirror image of facing right (dir 0) about the ant centre', () => {
    const a = ant(0, false);
    const b = ant(8, false);
    const cx = AX * ZOOM; // screen column of the centre; pixel column x mirrors to 2 * cx - 1 - x (+ half a fine pixel)
    const shift = CELL; // the centre fine pixel starts at the anchor, so the mirror axis is one fine pixel right of it
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const mx = 2 * cx + shift - 1 - x;
        if (mx < 0 || mx >= SIZE) continue;
        expect(alphaAt(a, x, y) > 0, `${x},${y}`).toBe(alphaAt(b, mx, y) > 0);
      }
    }
    expect(hash(a)).not.toBe(hash(b));
  });

  it('a heading of pi/2 (dir 4) and 0 (dir 0) look different; all 16 directions differ from each other', () => {
    const hs = Array.from({ length: 16 }, (_, k) => hash(ant(k, false)));
    expect(new Set(hs).size).toBe(16);
  });

  it('crumb #e8e0c8 appears only when carrying, on the head side (right for dir 0, left for dir 8, below for dir 4)', () => {
    const crumbs = (d: Uint8ClampedArray): [number, number][] => {
      const xs: [number, number][] = [];
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const i = (y * SIZE + x) * 4;
          if (d[i] === 0xe8 && d[i + 1] === 0xe0 && d[i + 2] === 0xc8 && d[i + 3] === 255) xs.push([x, y]);
        }
      }
      return xs;
    };
    expect(crumbs(ant(0, false))).toHaveLength(0);
    expect(crumbs(ant(8, false))).toHaveLength(0);
    const right = crumbs(ant(0, true));
    const left = crumbs(ant(8, true));
    const down = crumbs(ant(4, true));
    expect(right).toHaveLength(6 * CELL * CELL); // 2 x 3 fine pixels
    expect(left).toHaveLength(6 * CELL * CELL);
    expect(right.every(([x]) => x > AX * ZOOM)).toBe(true);
    expect(left.every(([x]) => x < AX * ZOOM)).toBe(true);
    expect(down.every(([, y]) => y > AX * ZOOM)).toBe(true);
  });

  it('snaps to the half-art-pixel grid: fractional coordinates render like the nearest half pixel', () => {
    const small = (fn: (c: Ctx2D) => void): number[] => Array.from(render(fn, 2));
    for (const carrying of [false, true]) {
      for (const dir of [0, 3, 8]) {
        const d = (x: number, y: number) => small((c) => drawAnt(c, sprites, x, y, dir, 1, carrying));
        expect(d(20.4, 10.4)).toEqual(d(20.5, 10.5));
        expect(d(20.2, 10.2)).toEqual(d(20, 10));
      }
    }
    const d = (x: number, y: number) => small((c) => drawAnt(c, sprites, x, y, 0, 0, false));
    expect(d(20.4, 10.4)).not.toEqual(d(22, 10));
    expect(d(20, 10)).not.toEqual(d(20.5, 10));
  });

  it('is drawn on the fine grid (pixel for pixel), with smoothing off', () => {
    const d = ant(3, true, AX, AX, 2);
    for (let y = 0; y < SIZE; y += 2) {
      for (let x = 0; x < SIZE; x += 2) {
        const i = (y * SIZE + x) * 4;
        expect(Array.from(d.slice(i, i + 4))).toEqual(Array.from(d.slice(i + 4, i + 8)));
      }
    }
  });

  it('drawAnt with scale draws a larger image', () => {
    const calls: number[][] = [];
    const fake = {
      imageSmoothingEnabled: false,
      drawImage: (_i: unknown, ...a: number[]) => calls.push(a),
    } as unknown as Ctx2D;
    drawAnt(fake, sprites, 20, 10, 0, 0, false);
    drawAnt(fake, sprites, 20, 10, 0, 0, false, MAJOR_SCALE);
    const [x1, y1, w1, h1] = calls[0];
    const [x2, y2, w2, h2] = calls[1];
    expect(MAJOR_SCALE).toBe(1.6);
    expect(w1).toBe(ANT_SIZE / FINE);
    expect(w2).toBeCloseTo((ANT_SIZE / FINE) * MAJOR_SCALE);
    expect(h2).toBeCloseTo((ANT_SIZE / FINE) * MAJOR_SCALE);
    // the centre stays on the same point
    expect(x2 + w2 / 2).toBeCloseTo(x1 + w1 / 2);
    expect(y2 + h2 / 2).toBeCloseTo(y1 + h1 / 2);
  });

  it('builds its 128 sprites lazily, once: a second draw creates no canvases', () => {
    let made = 0;
    const counting = new AntSprites((w, h) => {
      made++;
      return makeCanvas(w, h);
    });
    expect(made).toBe(0);
    render((c) => drawAnt(c, counting, AX, AX, 0, 0, false));
    expect(made).toBe(16 * 4 * 2);
    render((c) => drawAnt(c, counting, AX, AX, 5, 3, true));
    render((c) => drawAnt(c, counting, AX + 3, AX, 9, 1, false));
    expect(made).toBe(128);
  });
});

describe('prey sprites (fine grid)', () => {
  // [min, max] of opaque fine pixels; the ranges bracket the measured areas (365 / 491 / 232 / 495 / 373 / 328) by about +-35 %.
  const AREA: Record<FoodKind, [number, number]> = {
    beetle: [250, 500],
    caterpillar: [350, 650],
    fly: [160, 320],
    carrion: [350, 650],
    berry: [260, 500],
    mushroom: [230, 440],
    sugar: [40, 220],
    leaf: [200, 450],
  };

  it.each(KINDS)('%s paints a plausible number of opaque pixels', (kind) => {
    const d = render((c) => drawFood(c, kind, AX, AX));
    const n = opaqueFine(d);
    expect(n, `${kind}: ${n}`).toBeGreaterThanOrEqual(AREA[kind][0]);
    expect(n, `${kind}: ${n}`).toBeLessThanOrEqual(AREA[kind][1]);
    // soft shadow / translucent extras come on top
    expect(anyPainted(d)).toBeGreaterThan(n);
  });

  it.each(KINDS)('%s is deterministic', (kind) => {
    const a = render((c) => drawFood(c, kind, AX, AX));
    const b = render((c) => drawFood(c, kind, AX, AX));
    expect(hash(a)).toBe(hash(b));
  });

  it.each(KINDS)('%s stays inside +-14 art px around its anchor and is roughly centred', (kind) => {
    const d = render((c) => drawFood(c, kind, AX, AX));
    const b = bounds(d);
    const cx = AX * ZOOM;
    const lim = 14 * ZOOM;
    expect(b.x0, `${kind} left`).toBeGreaterThanOrEqual(cx - lim);
    expect(b.x1, `${kind} right`).toBeLessThan(cx + lim);
    expect(b.y0, `${kind} top`).toBeGreaterThanOrEqual(cx - lim);
    expect(b.y1, `${kind} bottom`).toBeLessThan(cx + lim);
    const mid = (b.x0 + b.x1) / 2;
    expect(Math.abs(mid - cx), `${kind} centre`).toBeLessThan(6 * ZOOM);
  });

  it('sizes stay close to the old art-grid sprites (beetle about 12x8 art px)', () => {
    const b = bounds(render((c) => drawFood(c, 'beetle', AX, AX)), 250);
    const w = (b.x1 - b.x0 + 1) / ZOOM;
    const h = (b.y1 - b.y0 + 1) / ZOOM;
    expect(w).toBeGreaterThanOrEqual(11);
    expect(w).toBeLessThanOrEqual(19); // 12 art px of shell + head, plus the antennae
    expect(h).toBeGreaterThanOrEqual(7);
    expect(h).toBeLessThanOrEqual(11);
  });

  it('is drawn on the fine grid: no screen pixel pair inside one fine pixel differs', () => {
    // At zoom 4 one fine pixel is 2 screen px, so all colours change only on even screen coordinates.
    for (const kind of KINDS) {
      const d = render((c) => drawFood(c, kind, AX, AX));
      for (let y = 0; y < SIZE; y += 2) {
        for (let x = 0; x < SIZE; x += 2) {
          const a = d.slice((y * SIZE + x) * 4, (y * SIZE + x) * 4 + 4);
          const b = d.slice((y * SIZE + x + 1) * 4, (y * SIZE + x + 1) * 4 + 4);
          expect(Array.from(a), `${kind} at ${x},${y}`).toEqual(Array.from(b));
        }
      }
    }
  });

  it('drawFood sugar is not blank', () => {
    expect(anyPainted(render((c) => drawFood(c, 'sugar', AX, AX)))).toBeGreaterThan(0);
  });

  it('every kind looks different', () => {
    const hs = KINDS.map((k) => hash(render((c) => drawFood(c, k, AX, AX))));
    expect(new Set(hs).size).toBe(KINDS.length);
  });

  it('drawFood snaps fractional coordinates to the half art pixel', () => {
    const small = (fn: (c: Ctx2D) => void): number[] => Array.from(render(fn, 2));
    for (const kind of KINDS) {
      expect(small((c) => drawFood(c, kind, 24.4, 16.4))).toEqual(small((c) => drawFood(c, kind, 24.5, 16.5)));
      expect(small((c) => drawFood(c, kind, 24.1, 16.1))).toEqual(small((c) => drawFood(c, kind, 24, 16)));
      expect(small((c) => drawFood(c, kind, 24.5, 16))).not.toEqual(small((c) => drawFood(c, kind, 24, 16)));
    }
  });
});

describe('queen (fine grid)', () => {
  const queen = (dig = 0): Uint8ClampedArray => render((c) => drawQueen(c, AX, AX, dig));

  it('is fully black: no red-dominant opaque pixel, only dark browns', () => {
    const d = queen();
    let opaque = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] !== 255) continue;
      opaque++;
      expect(d[i] > d[i + 1] + 40 && d[i] > d[i + 2] + 40).toBe(false);
      expect(Math.max(d[i], d[i + 1], d[i + 2])).toBeLessThan(110);
    }
    expect(opaque / (CELL * CELL)).toBeGreaterThan(300);
  });

  it('is about 3 times the worker: 19 - 27 art px long', () => {
    const b = bounds(queen(), 250);
    const w = (b.x1 - b.x0 + 1) / ZOOM;
    const h = (b.y1 - b.y0 + 1) / ZOOM;
    expect(w).toBeGreaterThanOrEqual(19);
    expect(w).toBeLessThanOrEqual(27);
    expect(h).toBeGreaterThanOrEqual(9);
    expect(h).toBeLessThanOrEqual(16);
  });

  it('digging adds a dark hole and flying crumbs on the fine grid', () => {
    const none = queen(0);
    const dig = queen(0.5);
    expect(hash(dig)).not.toBe(hash(none));
    let newlyOpaque = 0;
    for (let i = 0; i < dig.length; i += 4) {
      if (dig[i + 3] === 255 && none[i + 3] !== 255) newlyOpaque++;
    }
    expect(newlyOpaque / (CELL * CELL)).toBeGreaterThan(200);
  });

  it('stays inside +-14 art px of its anchor when idle', () => {
    const b = bounds(queen());
    const cx = AX * ZOOM;
    expect(b.x0).toBeGreaterThanOrEqual(cx - 14 * ZOOM);
    expect(b.x1).toBeLessThan(cx + 14 * ZOOM);
  });
});
