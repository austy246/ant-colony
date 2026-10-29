import { createCanvas } from '@napi-rs/canvas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FoodItem } from '../sim/food';
import { World } from '../sim/world';
import { Camera } from '../ui/camera';
import {
  CATERPILLAR_DIRS,
  CATERPILLAR_FRAMES,
  caterpillarPixels,
  deadCaterpillarPixels,
  PREY_CENTER,
  PREY_SIZE,
} from './preyAnim';
import { drawPreyItem, PreySprites } from './preySprites';
import { Renderer } from './renderer';
import type { CanvasLike } from './terrainRender';

const N = PREY_SIZE;
const make = (w: number, h: number): CanvasLike => createCanvas(w, h) as unknown as CanvasLike;

function hash(p: Uint8ClampedArray): number {
  let h = 2166136261;
  for (const v of p) h = Math.imul(h ^ v, 16777619) >>> 0;
  return h;
}
const solid = (p: Uint8ClampedArray): number => {
  let n = 0;
  for (let i = 3; i < p.length; i += 4) if (p[i] >= 200) n++;
  return n;
};
function extent(p: Uint8ClampedArray): { w: number; h: number } {
  let x0 = N;
  let x1 = 0;
  let y0 = N;
  let y1 = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (p[(y * N + x) * 4 + 3] < 200) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  return { w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
/** Opaque pixels in the droplet colour (pale yellow #e4d98a, or its highlight #fff3b0). The living caterpillar's yellow spots are warmer. */
const droplets = (p: Uint8ClampedArray): number => {
  let n = 0;
  const near = (v: number, t: number): boolean => Math.abs(v - t) <= 10;
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] < 200) continue;
    if ((near(p[i], 228) && near(p[i + 1], 217) && near(p[i + 2], 138)) || (near(p[i], 255) && near(p[i + 1], 243) && near(p[i + 2], 176))) n++;
  }
  return n;
};
const greenish = (p: Uint8ClampedArray): number => {
  let n = 0;
  for (let i = 0; i < p.length; i += 4) if (p[i + 3] > 200 && p[i + 1] > p[i] + 12 && p[i + 1] > p[i + 2] + 25) n++;
  return n;
};

describe('caterpillar pixels', () => {
  it('has 16 directions x 4 frames, calm and fleeing sets, on the common prey grid', () => {
    expect(CATERPILLAR_DIRS).toBe(16);
    expect(CATERPILLAR_FRAMES).toBe(4);
    expect(caterpillarPixels(0, 0, false)).toHaveLength(N * N * 4);
    expect(PREY_CENTER).toBe(21);
  });

  it('every variant is non-empty, green, about 19 art px long and stays within 14 art px of the anchor', () => {
    for (let d = 0; d < CATERPILLAR_DIRS; d++) {
      for (let f = 0; f < CATERPILLAR_FRAMES; f++) {
        for (const flee of [false, true]) {
          const p = caterpillarPixels(d, f, flee);
          const n = solid(p);
          expect(n, `d${d} f${f} flee${flee}`).toBeGreaterThan(220);
          expect(n, `d${d} f${f} flee${flee}`).toBeLessThan(560);
          expect(greenish(p), `green d${d} f${f}`).toBeGreaterThan(80);
          for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
              if (p[(y * N + x) * 4 + 3] === 0) continue;
              expect(Math.abs(x - PREY_CENTER)).toBeLessThanOrEqual(28);
              expect(Math.abs(y - PREY_CENTER)).toBeLessThanOrEqual(28);
              // the solid body never touches the border of the grid (only the soft shadow may)
              if (p[(y * N + x) * 4 + 3] >= 200) expect(x > 0 && y > 0 && x < N - 1 && y < N - 1, `d${d} f${f} ${x},${y}`).toBe(true);
            }
          }
        }
      }
    }
    const right = extent(caterpillarPixels(0, 0, false));
    expect(right.w).toBeGreaterThanOrEqual(28);
    expect(right.w).toBeLessThanOrEqual(46);
    expect(right.h).toBeLessThanOrEqual(18);
    const down = extent(caterpillarPixels(4, 0, false));
    expect(down.h).toBeGreaterThan(down.w + 12);
  });

  it('is deterministic and shared per variant, and wraps directions', () => {
    expect(caterpillarPixels(3, 2, false)).toBe(caterpillarPixels(3, 2, false));
    expect(caterpillarPixels(16, 1, true)).toBe(caterpillarPixels(0, 1, true));
    expect(caterpillarPixels(-1, 5, false)).toBe(caterpillarPixels(15, 1, false));
  });

  it('all 16 directions look different from each other', () => {
    const hs = new Set<number>();
    for (let d = 0; d < CATERPILLAR_DIRS; d++) hs.add(hash(caterpillarPixels(d, 0, false)));
    expect(hs.size).toBe(16);
  });

  it('the four wave frames differ within a direction', () => {
    for (let d = 0; d < CATERPILLAR_DIRS; d++) {
      const hs = new Set<number>();
      for (let f = 0; f < CATERPILLAR_FRAMES; f++) hs.add(hash(caterpillarPixels(d, f, false)));
      expect(hs.size, `dir ${d}`).toBe(CATERPILLAR_FRAMES);
    }
  });

  it('fleeing frames differ from the calm ones and are stretched out a little', () => {
    for (let f = 0; f < CATERPILLAR_FRAMES; f++) {
      expect(hash(caterpillarPixels(0, f, true))).not.toBe(hash(caterpillarPixels(0, f, false)));
    }
    const calm = Math.max(...[0, 1, 2, 3].map((f) => extent(caterpillarPixels(0, f, false)).w));
    const flee = Math.max(...[0, 1, 2, 3].map((f) => extent(caterpillarPixels(0, f, true)).w));
    expect(flee).toBeGreaterThan(calm);
  });

  it('the dead caterpillar is curled (compact), dull and has pale-yellow droplets; the living one has none', () => {
    const living = caterpillarPixels(0, 0, false);
    const dead = deadCaterpillarPixels(0);
    const e = extent(dead);
    expect(Math.max(e.w, e.h)).toBeLessThan(extent(living).w - 8);
    expect(solid(dead)).toBeGreaterThan(160);
    expect(solid(dead)).toBeLessThan(520);
    expect(droplets(dead)).toBeGreaterThanOrEqual(3);
    expect(droplets(living)).toBe(0);
    // dull: far fewer bright green pixels than the living one
    expect(greenish(dead)).toBeLessThan(greenish(living) * 0.5);
    expect(hash(dead)).not.toBe(hash(living));
    expect(deadCaterpillarPixels(8)).toBe(deadCaterpillarPixels(0));
    const hs = new Set<number>();
    for (let d = 0; d < 8; d++) hs.add(hash(deadCaterpillarPixels(d)));
    expect(hs.size).toBe(8);
  });
});

const W = 80;
function shot(f: Partial<FoodItem> & { fleeT?: number }, spr: PreySprites, frame = 0, time = 0): Uint8ClampedArray {
  const cv = createCanvas(W, W);
  const c = cv.getContext('2d') as unknown as CanvasRenderingContext2D;
  c.imageSmoothingEnabled = false;
  c.scale(2, 2); // one fine pixel = one canvas pixel
  const item = { id: 1, kind: 'caterpillar', x: 20, y: 20, piecesLeft: 12, ...f } as FoodItem;
  drawPreyItem(c, spr, item, frame, time);
  return cv.getContext('2d').getImageData(0, 0, W, W).data as unknown as Uint8ClampedArray;
}
const painted = (p: Uint8ClampedArray): number => {
  let n = 0;
  for (let i = 3; i < p.length; i += 4) if (p[i] > 0) n++;
  return n;
};

describe('PreySprites + drawPreyItem with the caterpillar', () => {
  it('draws a living caterpillar: direction, frame and fleeing change the picture; the static sprite is not used', () => {
    const spr = new PreySprites(make);
    const alive = { alive: true, heading: 0 };
    const a = shot(alive, spr, 0);
    expect(painted(a)).toBeGreaterThan(300);
    expect(hash(shot({ ...alive, heading: 1.2 }, spr, 0))).not.toBe(hash(a));
    expect(hash(shot(alive, spr, 2))).not.toBe(hash(a));
    expect(hash(shot({ ...alive, fleeT: 1.5 }, spr, 0))).not.toBe(hash(a));
    expect(hash(shot({ ...alive, fleeT: 0 }, spr, 0))).toBe(hash(a));
    const staticOne = shot({}, spr, 0);
    expect(hash(staticOne)).not.toBe(hash(a));
  });

  it('draws the corpse of a caterpillar (carrion with corpseOf caterpillar) differently from a living one and from plain carrion', () => {
    const spr = new PreySprites(make);
    const dead = shot({ kind: 'carrion', corpseOf: 'caterpillar' as never, heading: 0.3 }, spr);
    const living = shot({ alive: true, heading: 0.3 }, spr);
    const plain = shot({ kind: 'carrion' }, spr);
    expect(hash(dead)).not.toBe(hash(living));
    expect(hash(dead)).not.toBe(hash(plain));
    expect(painted(dead)).toBeGreaterThan(150);
    expect(droplets(dead)).toBeGreaterThanOrEqual(3);
  });

  it('builds the 16 x 4 x 2 living sprites lazily, once', () => {
    let calls = 0;
    const spr = new PreySprites((w, h) => {
      calls++;
      return createCanvas(w, h) as unknown as CanvasLike;
    });
    expect(calls).toBe(0);
    shot({ alive: true, heading: 0 }, spr);
    expect(calls).toBe(16 * 4 * 2);
    shot({ alive: true, heading: 1 }, spr, 3);
    expect(calls).toBe(16 * 4 * 2);
  });
});

describe('Renderer with a living caterpillar', () => {
  beforeEach(() => vi.stubGlobal('window', { devicePixelRatio: 1, innerWidth: 400, innerHeight: 300 }));
  afterEach(() => vi.unstubAllGlobals());

  function setup() {
    const canvas = createCanvas(1, 1);
    Object.assign(canvas, { clientWidth: 400, clientHeight: 300 });
    const world = World.create(7);
    world.food.length = 0;
    world.ants.length = 0;
    const camera = new Camera(400, 300);
    camera.zoom = 4;
    camera.x = 150;
    camera.y = 100;
    const r = new Renderer(canvas as unknown as HTMLCanvasElement, world, camera, make);
    const data = (): Uint8ClampedArray => canvas.getContext('2d').getImageData(0, 0, 400, 300).data as unknown as Uint8ClampedArray;
    return { world, r, data };
  }
  const diff = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => {
    let n = 0;
    for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 45) n++;
    return n;
  };
  const cat = (extra: object = {}): FoodItem =>
    ({ id: 9, kind: 'caterpillar', alive: true, heading: 0, x: 150, y: 100, piecesLeft: 12, ...extra }) as FoodItem;

  it('walking animates the wave (distance driven); standing does not; fleeing runs the wave at double speed', () => {
    const { world, r, data } = setup();
    const c = cat();
    world.food.push(c);
    r.draw();
    const still0 = data();
    r.draw();
    expect(diff(still0, data())).toBe(0);
    c.x += 1.5;
    r.draw();
    expect(diff(still0, data())).toBeGreaterThan(40);
    // calm vs fleeing: the same 1.5 px walk advances the phase twice as far, so the frames differ
    const calm = setup();
    const flee = setup();
    const cc = cat();
    const ff = cat({ fleeT: 1 });
    calm.world.food.push(cc);
    flee.world.food.push(ff);
    calm.r.draw();
    flee.r.draw();
    cc.x += 1.5;
    ff.x += 1.5;
    calm.r.draw();
    flee.r.draw();
    expect(diff(calm.data(), flee.data())).toBeGreaterThan(40);
  });

  it('pheromone view shows a living caterpillar as the same dot as other food', () => {
    const a = setup();
    a.r.setView('pheromone');
    a.r.draw();
    const empty = a.data();
    a.world.food.push(cat({ heading: 1 }));
    a.r.draw();
    const withCat = a.data();
    const b = setup();
    b.r.setView('pheromone');
    b.world.food.push({ id: 3, kind: 'berry', x: 150, y: 100, piecesLeft: 3 } as FoodItem);
    b.r.draw();
    expect(diff(empty, withCat)).toBeGreaterThan(10);
    expect(diff(withCat, b.data())).toBe(0);
  });
});
