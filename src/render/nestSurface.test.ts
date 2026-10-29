import { createCanvas } from '@napi-rs/canvas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { World, type Ant } from '../sim/world';
import { Camera } from '../ui/camera';
import { Renderer, type View } from './renderer';
import type { CanvasLike } from './terrainRender';

const make = (w: number, h: number): CanvasLike => createCanvas(w, h) as unknown as CanvasLike;

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

const ant = (id: number, x: number, y: number, extra: Partial<Ant> = {}): Ant =>
  ({ id, x, y, heading: 0.3, state: 'wander', age: 0, carry: 0, targetFood: null, timer: 0, role: 'forager', ...extra }) as Ant;
const inNest = (id: number, x: number, y: number): Ant => ant(id, x, y, { state: 'nest', nestKind: 'unload', timer: 3 });

const same = (a: Uint8ClampedArray, b: Uint8ClampedArray): boolean => a.length === b.length && a.every((v, i) => v === b[i]);
const diff = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 45) n++;
  return n;
};

describe('surface renderer and ants in the nest', () => {
  for (const view of ['normal', 'pheromone', 'terrain'] as View[]) {
    it(`${view} view: a world with only nest ants draws no ant pixels`, () => {
      const empty = setup();
      empty.r.setView(view);
      empty.r.draw();
      const e = empty.data();
      const t = setup();
      t.r.setView(view);
      t.world.ants.push(inNest(1, 150, 100), inNest(2, 154, 102), inNest(3, 140, 96));
      t.r.draw();
      expect(same(e, t.data())).toBe(true);
      // the same ants on the surface do show
      t.world.ants.forEach((a) => (a.state = 'wander'));
      t.r.draw();
      expect(diff(e, t.data())).toBeGreaterThan(5);
    });

    it(`${view} view: surface ants next to nest ants are drawn exactly as without them`, () => {
      const a = setup();
      a.r.setView(view);
      a.world.ants.push(ant(1, 150, 100));
      a.r.draw();
      const b = setup();
      b.r.setView(view);
      b.world.ants.push(ant(1, 150, 100), inNest(2, 151, 101), inNest(3, 149, 99));
      b.r.draw();
      expect(same(a.data(), b.data())).toBe(true);
    });
  }

  it('an ant that comes out of the nest starts its gait afresh (no spin of the animation, no stale stride entry)', () => {
    // reference: a fresh renderer that sees the ant for the first time at the entrance
    const ref = setup();
    ref.world.ants.push(ant(1, 150, 100));
    ref.r.draw();
    const fresh = ref.data();

    const t = setup();
    const a = ant(1, 60, 100);
    t.world.ants.push(a);
    t.r.draw();
    for (let i = 1; i <= 7; i++) {
      a.x = 60 + i * 1.7; // walking: the gait advances
      t.r.draw();
    }
    a.state = 'nest';
    a.nestKind = 'unload';
    a.x = 150;
    a.y = 100;
    t.r.draw();
    t.r.draw();
    a.state = 'wander';
    delete a.nestKind;
    t.r.draw();
    expect(same(fresh, t.data())).toBe(true);
  });

  it('does not leave stride entries behind for ants in the nest and does not puff for them', () => {
    const t = setup();
    const a = ant(1, 60, 100);
    t.world.ants.push(a);
    t.r.draw();
    a.state = 'nest';
    t.world.antsKilled = 5; // a kill happened elsewhere: an ant that went into the nest is not a casualty
    t.world.food.push({ id: 9, kind: 'beetle', alive: true, heading: 0, x: 62, y: 100, piecesLeft: 6 } as never);
    t.r.draw();
    const withNest = t.data();
    const u = setup();
    u.world.food.push({ id: 9, kind: 'beetle', alive: true, heading: 0, x: 62, y: 100, piecesLeft: 6 } as never);
    u.world.antsKilled = 5;
    u.r.draw();
    expect(same(withNest, u.data())).toBe(true);
  });
});
