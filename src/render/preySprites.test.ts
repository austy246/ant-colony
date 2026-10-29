import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import type { FoodItem } from '../sim/food';
import { BEETLE_DIRS, BEETLE_FRAMES, FLY_DIRS, FLY_POSES, PREY_SIZE } from './preyAnim';
import { drawPreyItem, PreySprites } from './preySprites';
import type { CanvasLike } from './terrainRender';

function counting() {
  const state = { calls: 0 };
  const make = (w: number, h: number): CanvasLike => {
    state.calls++;
    return createCanvas(w, h) as unknown as CanvasLike;
  };
  return { state, make };
}

const W = 80;
const H = 80;

/** Draws one item on an 80x80 transparent canvas (world = canvas, 1 px = 1 art px) and returns the RGBA bytes. */
function shot(f: Partial<FoodItem> & Pick<FoodItem, 'kind'>, spr: PreySprites, time = 0, frame = 0): Uint8ClampedArray {
  const cv = createCanvas(W, H);
  const c = cv.getContext('2d') as unknown as CanvasRenderingContext2D;
  c.imageSmoothingEnabled = false;
  const item: FoodItem = { id: 1, x: 40, y: 40, piecesLeft: 6, ...f };
  drawPreyItem(c, spr, item, frame, time);
  return cv.getContext('2d').getImageData(0, 0, W, H).data as unknown as Uint8ClampedArray;
}
function hash(p: Uint8ClampedArray): number {
  let h = 2166136261;
  for (const v of p) h = Math.imul(h ^ v, 16777619) >>> 0;
  return h;
}
const count = (p: Uint8ClampedArray): number => {
  let n = 0;
  for (let i = 3; i < p.length; i += 4) if (p[i] > 0) n++;
  return n;
};
/** Number of painted pixels strictly above (y < limit). */
const paintedAbove = (p: Uint8ClampedArray, limit: number): number => {
  let n = 0;
  for (let y = 0; y < limit; y++) for (let x = 0; x < W; x++) if (p[(y * W + x) * 4 + 3] > 0) n++;
  return n;
};

describe('PreySprites cache', () => {
  it('builds the 64 beetle variants once, on first use, and never again', () => {
    const { state, make } = counting();
    const spr = new PreySprites(make);
    expect(state.calls).toBe(0);
    shot({ kind: 'beetle', alive: true, heading: 0 }, spr);
    expect(state.calls).toBe(BEETLE_DIRS * BEETLE_FRAMES);
    for (let i = 0; i < 20; i++) shot({ kind: 'beetle', alive: true, heading: i }, spr, 0, i % 4);
    expect(state.calls).toBe(BEETLE_DIRS * BEETLE_FRAMES);
  });

  it('builds fly variants + shadow once; corpses once; the groups are independent', () => {
    const { state, make } = counting();
    const spr = new PreySprites(make);
    shot({ kind: 'fly', alive: true, heading: 1 }, spr);
    const afterFly = state.calls;
    expect(afterFly).toBe(FLY_DIRS * FLY_POSES + 1);
    for (let i = 0; i < 10; i++) shot({ kind: 'fly', alive: true, heading: i }, spr, i * 0.3);
    expect(state.calls).toBe(afterFly);
    shot({ kind: 'carrion', corpseOf: 'beetle', heading: 2 }, spr);
    expect(state.calls).toBe(afterFly + FLY_DIRS);
    shot({ kind: 'carrion', corpseOf: 'fly', heading: 2 }, spr);
    expect(state.calls).toBe(afterFly + 2 * FLY_DIRS);
    shot({ kind: 'carrion', corpseOf: 'beetle', heading: 5 }, spr);
    shot({ kind: 'carrion', corpseOf: 'fly', heading: 5 }, spr);
    expect(state.calls).toBe(afterFly + 2 * FLY_DIRS);
  });

  it('plain food kinds use no prey canvases at all', () => {
    const { state, make } = counting();
    const spr = new PreySprites(make);
    for (const kind of ['berry', 'mushroom', 'caterpillar', 'carrion', 'beetle', 'fly'] as const) shot({ kind }, spr);
    expect(state.calls).toBe(0);
  });
});

describe('drawPreyItem', () => {
  it('living beetle, beetle corpse, plain carrion and a not-alive "beetle" all differ', () => {
    const spr = new PreySprites((w, h) => createCanvas(w, h) as unknown as CanvasLike);
    const live = shot({ kind: 'beetle', alive: true, heading: 0 }, spr);
    const dead = shot({ kind: 'carrion', corpseOf: 'beetle', heading: 0 }, spr);
    const carrion = shot({ kind: 'carrion' }, spr);
    const staticBeetle = shot({ kind: 'beetle' }, spr);
    expect(new Set([hash(live), hash(dead), hash(carrion), hash(staticBeetle)]).size).toBe(4);
    for (const p of [live, dead, carrion, staticBeetle]) expect(count(p)).toBeGreaterThan(60); // 1 canvas px = 1 art px = 2x2 fine px
  });

  it('living fly, fly corpse and carrion differ', () => {
    const spr = new PreySprites((w, h) => createCanvas(w, h) as unknown as CanvasLike);
    const live = shot({ kind: 'fly', alive: true, heading: 0 }, spr);
    const dead = shot({ kind: 'carrion', corpseOf: 'fly', heading: 0 }, spr);
    const carrion = shot({ kind: 'carrion' }, spr);
    expect(new Set([hash(live), hash(dead), hash(carrion)]).size).toBe(3);
    expect(count(live)).toBeGreaterThan(40);
    expect(count(dead)).toBeGreaterThan(40);
  });

  it('beetle direction and frame change the picture', () => {
    const spr = new PreySprites((w, h) => createCanvas(w, h) as unknown as CanvasLike);
    const a = shot({ kind: 'beetle', alive: true, heading: 0 }, spr, 0, 0);
    expect(hash(shot({ kind: 'beetle', alive: true, heading: Math.PI / 2 }, spr, 0, 0))).not.toBe(hash(a));
    expect(hash(shot({ kind: 'beetle', alive: true, heading: 0 }, spr, 0, 1))).not.toBe(hash(a));
  });

  it('a hopping fly is drawn lifted by the parabola, its shadow stays on the ground', () => {
    const spr = new PreySprites((w, h) => createCanvas(w, h) as unknown as CanvasLike);
    const hop = (t: number) => ({ fromX: 30, fromY: 40, toX: 50, toY: 40, t, dur: 0.4 });
    const ground = shot({ kind: 'fly', alive: true, heading: 0 }, spr);
    const start = shot({ kind: 'fly', alive: true, heading: 0, hop: hop(0) }, spr);
    const mid = shot({ kind: 'fly', alive: true, heading: 0, hop: hop(0.2) }, spr);
    const end = shot({ kind: 'fly', alive: true, heading: 0, hop: hop(0.4) }, spr);
    const aboveLimit = 40 - 7; // the grounded fly (incl. wings) reaches ~6.5 art px above its centre at most
    // Lifted 8 px at the apex: lots of fly above y = 33; at the ends (lift 0) there is hardly anything.
    expect(paintedAbove(mid, aboveLimit)).toBeGreaterThan(20);
    expect(paintedAbove(ground, aboveLimit)).toBeLessThan(3);
    expect(paintedAbove(start, aboveLimit)).toBeLessThan(6);
    expect(paintedAbove(end, aboveLimit)).toBeLessThan(6);
    // The shadow: a soft translucent patch near the ground point (x+1.5, y+2), also when the fly is high up.
    const alphaAt = (p: Uint8ClampedArray, x: number, y: number): number => p[(y * W + x) * 4 + 3];
    expect(alphaAt(mid, 42, 42)).toBeGreaterThan(40);
    expect(alphaAt(mid, 42, 42)).toBeLessThan(200);
    expect(alphaAt(mid, 30, 42)).toBe(0);
  });

  it('draws at half-art-pixel positions: sub-fine x offsets do not change the picture', () => {
    const spr = new PreySprites((w, h) => createCanvas(w, h) as unknown as CanvasLike);
    const a = shot({ kind: 'beetle', alive: true, heading: 0, x: 40.1, y: 40.1 }, spr);
    const b = shot({ kind: 'beetle', alive: true, heading: 0, x: 40.2, y: 40.2 }, spr);
    expect(hash(a)).toBe(hash(b));
    const c = shot({ kind: 'beetle', alive: true, heading: 0, x: 40.5, y: 40.5 }, spr);
    expect(hash(c)).not.toBe(hash(a));
  });

  it('fits the sprite canvas size', () => {
    expect(PREY_SIZE).toBeLessThanOrEqual(57);
  });
});
