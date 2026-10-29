import { createCanvas } from '@napi-rs/canvas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FoodItem } from '../sim/food';
import { World } from '../sim/world';
import { Camera } from '../ui/camera';
import { Renderer } from './renderer';
import type { CanvasLike } from './terrainRender';

const make = (w: number, h: number): CanvasLike => createCanvas(w, h) as unknown as CanvasLike;

beforeEach(() => vi.stubGlobal('window', { devicePixelRatio: 1, innerWidth: 400, innerHeight: 300 }));
afterEach(() => vi.unstubAllGlobals());

const FX = 150;
const FY = 100;

function setup(factory = make) {
  const canvas = createCanvas(1, 1);
  Object.assign(canvas, { clientWidth: 400, clientHeight: 300 });
  const world = World.create(7);
  world.food.length = 0;
  world.ants.length = 0;
  const camera = new Camera(400, 300);
  camera.zoom = 4;
  camera.x = FX;
  camera.y = FY;
  const r = new Renderer(canvas as unknown as HTMLCanvasElement, world, camera, factory);
  const data = (): Uint8ClampedArray => canvas.getContext('2d').getImageData(0, 0, 400, 300).data as unknown as Uint8ClampedArray;
  /** world (x, y) -> screen pixel centre */
  const s = (wx: number, wy: number): [number, number] => {
    const p = camera.worldToScreen(wx, wy);
    return [Math.floor(p.x), Math.floor(p.y)];
  };
  return { world, r, canvas, camera, data, s };
}

const put = (world: World, f: Partial<FoodItem> & Pick<FoodItem, 'kind'>): FoodItem => {
  const item: FoodItem = { id: 1000 + world.food.length, x: FX, y: FY, piecesLeft: 6, ...f };
  world.food.push(item);
  return item;
};

/** Number of screen pixels in the world rectangle [x0,x1) x [y0,y1) that differ strongly between two frames. */
function diffCount(a: Uint8ClampedArray, b: Uint8ClampedArray, s: (x: number, y: number) => [number, number], x0: number, y0: number, x1: number, y1: number, thr = 45): number {
  const [sx0, sy0] = s(x0, y0);
  const [sx1, sy1] = s(x1, y1);
  let n = 0;
  for (let y = sy0; y < sy1; y++) {
    for (let x = sx0; x < sx1; x++) {
      const i = (y * 400 + x) * 4;
      const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      if (d > thr) n++;
    }
  }
  return n;
}

const same = (a: Uint8ClampedArray, b: Uint8ClampedArray): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

describe('Renderer living prey', () => {
  it('draws a hopping fly lifted: the body is up in the air, only its shadow is left on the ground', () => {
    const { world, r, data, s } = setup();
    r.draw();
    const empty = data();
    put(world, { kind: 'fly', alive: true, heading: 0 });
    r.draw();
    const grounded = data();
    world.food.length = 0;
    put(world, { kind: 'fly', alive: true, heading: 0, hop: { fromX: FX - 10, fromY: FY, toX: FX + 10, toY: FY, t: 0.2, dur: 0.4 } });
    r.draw();
    const hopping = data();
    // Upper strip (y in -15..-8 above the fly's centre): empty when grounded, full of fly when 8 px up.
    const up = (a: Uint8ClampedArray): number => diffCount(a, empty, s, FX - 8, FY - 15, FX + 8, FY - 8);
    expect(up(grounded)).toBeLessThan(15);
    expect(up(hopping)).toBeGreaterThan(150);
    // Ground band at the centre line: the grounded fly's dark body is there, the hopping one has only the faint shadow.
    const body = (a: Uint8ClampedArray): number => diffCount(a, empty, s, FX, FY - 3, FX + 4, FY - 1.5, 120);
    expect(body(grounded)).toBeGreaterThan(20);
    expect(body(hopping)).toBeLessThan(10);
    // The shadow itself is on the ground at the interpolated position, a soft darkening.
    const [sx, sy] = s(FX + 1.5, FY + 2);
    const i = (sy * 400 + sx) * 4;
    expect(hopping[i] + hopping[i + 1] + hopping[i + 2]).toBeLessThan(empty[i] + empty[i + 1] + empty[i + 2] - 20);
  });

  it('a hopping fly is drawn on top of other food (second pass)', () => {
    const { world, r, data, s } = setup();
    put(world, { kind: 'fly', alive: true, heading: 0, x: FX, y: FY, hop: { fromX: FX - 4, fromY: FY, toX: FX + 4, toY: FY, t: 0.2, dur: 0.4 } });
    put(world, { kind: 'mushroom', x: FX, y: FY - 8 }); // later in the list, but must not cover the airborne fly
    r.draw();
    const withBoth = data();
    world.food.length = 0;
    put(world, { kind: 'mushroom', x: FX, y: FY - 8 });
    r.draw();
    const mushroomOnly = data();
    expect(diffCount(withBoth, mushroomOnly, s, FX - 6, FY - 14, FX + 6, FY - 2)).toBeGreaterThan(100);
  });

  it('walks the beetle: pausing keeps the frame, walking cycles through the 4 frames, one stride state per id', () => {
    const { world, r, data } = setup();
    const b = put(world, { id: 77, kind: 'beetle', alive: true, heading: 0, x: FX, y: FY });
    r.draw();
    const still = data();
    r.draw();
    expect(same(data(), still)).toBe(true);
    const strides = (r as unknown as { foodStrides: Map<number, { phase: number }> }).foodStrides;
    const st0 = strides.get(77);
    expect(st0).toBeDefined();
    // The picture of the beetle only: the camera is fixed, so a window around it shows the leg frame.
    const seen = new Set<number>();
    for (let i = 0; i < 23; i++) {
      b.x += 0.5; // walks half an art pixel per frame
      r.draw();
      let h = 7;
      for (const v of data()) h = (Math.imul(h, 31) + v) >>> 0;
      seen.add(h);
    }
    expect(strides.get(77)).toBe(st0); // the same state object is reused, nothing is allocated per frame
    expect(st0!.phase).toBeGreaterThan(0);
    expect(seen.size).toBeGreaterThanOrEqual(8); // moving + 4 frames
  });

  it('drops the stride state of a beetle that died (and of one that is gone)', () => {
    const { world, r } = setup();
    const b = put(world, { id: 5, kind: 'beetle', alive: true, heading: 0 });
    r.draw();
    const strides = (r as unknown as { foodStrides: Map<number, unknown> }).foodStrides;
    expect(strides.has(5)).toBe(true);
    b.alive = false;
    b.kind = 'carrion';
    b.corpseOf = 'beetle';
    r.draw();
    expect(strides.has(5)).toBe(false);
  });

  it('turns the beetle to its heading', () => {
    const { world, r, data } = setup();
    const b = put(world, { kind: 'beetle', alive: true, heading: 0 });
    r.draw();
    const right = data().slice();
    b.heading = Math.PI / 2;
    r.draw();
    expect(same(data(), right)).toBe(false);
  });

  it('builds the beetle sprites once through the injected factory (no canvases per frame)', () => {
    let calls = 0;
    const { world, r } = setup((w, h) => {
      calls++;
      return make(w, h);
    });
    put(world, { kind: 'beetle', alive: true, heading: 0.3 });
    put(world, { kind: 'fly', alive: true, heading: 0.3, x: FX + 20 });
    r.draw();
    const after = calls;
    for (let i = 0; i < 10; i++) r.draw();
    expect(calls).toBe(after);
  });

  it('shows living prey and corpses as the light dot in the pheromone view, for every kind', () => {
    const { world, r, data, s } = setup();
    r.setView('pheromone');
    r.draw();
    const empty = data();
    put(world, { kind: 'beetle', alive: true, heading: 0, x: FX - 30 });
    put(world, { kind: 'fly', alive: true, heading: 0, x: FX - 10 });
    put(world, { kind: 'carrion', corpseOf: 'fly', x: FX + 10 });
    put(world, { kind: 'carrion', corpseOf: 'beetle', x: FX + 30 });
    r.draw();
    const withFood = data();
    for (const dx of [-30, -10, 10, 30]) {
      expect(diffCount(withFood, empty, s, FX + dx - 2, FY - 2, FX + dx + 2, FY + 2, 150), `dot at ${dx}`).toBeGreaterThan(10);
    }
  });

  it('puffs a little dust where an ant was killed next to a living beetle', () => {
    const { world, r, data, s } = setup();
    put(world, { kind: 'beetle', alive: true, heading: 0, x: FX, y: FY });
    r.draw();
    const base = data().slice();
    world.ants.push({ id: 900, x: FX + 8, y: FY, heading: 3, carry: 0, state: 'wander', timer: 0, targetFood: null } as never);
    r.draw();
    // the beetle kills the ant (the sim removes it and counts it)
    world.ants.length = 0;
    world.antsKilled++;
    world.time += 0.05;
    r.draw();
    expect(diffCount(data(), base, s, FX + 4, FY - 5, FX + 12, FY + 5, 20)).toBeGreaterThan(8);
    // the puff is over after 0.4 s
    world.time += 0.5;
    r.draw();
    expect(diffCount(data(), base, s, FX + 4, FY - 5, FX + 12, FY + 5, 20)).toBeLessThan(4);
  });

  it('shows no puff when ants simply vanish without a recorded kill', () => {
    const { world, r, data, s } = setup();
    put(world, { kind: 'beetle', alive: true, heading: 0, x: FX, y: FY });
    world.ants.push({ id: 901, x: FX + 8, y: FY, heading: 3, carry: 0, state: 'wander', timer: 0, targetFood: null } as never);
    r.draw();
    world.ants.length = 0;
    r.draw();
    const gone = data();
    world.ants.length = 0;
    r.draw();
    expect(diffCount(gone, data(), s, FX + 4, FY - 5, FX + 12, FY + 5, 20)).toBe(0);
  });
});
