import { createCanvas } from '@napi-rs/canvas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Surface } from '../sim/terrain';
import { World } from '../sim/world';
import { Camera } from '../ui/camera';
import { Renderer } from './renderer';
import type { CanvasLike } from './terrainRender';

const make = (w: number, h: number): CanvasLike => createCanvas(w, h) as unknown as CanvasLike;

function setup() {
  const canvas = createCanvas(1, 1);
  Object.assign(canvas, { clientWidth: 640, clientHeight: 400 });
  const world = World.create(7);
  const camera = new Camera(640, 400);
  camera.fitWorld(); // zoom 2, world centred: screen = (world - (160,100)) * 2 + (320,200)
  const r = new Renderer(canvas as unknown as HTMLCanvasElement, world, camera, make);
  const px = (wx: number, wy: number): [number, number, number] => {
    const s = camera.worldToScreen(wx, wy);
    const d = canvas.getContext('2d').getImageData(Math.floor(s.x), Math.floor(s.y), 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  return { world, r, px };
}

beforeEach(() => vi.stubGlobal('window', { devicePixelRatio: 1, innerWidth: 640, innerHeight: 400 }));
afterEach(() => vi.unstubAllGlobals());

describe('Renderer views', () => {
  it('pheromone view: deposited cell is bright blue, neighbour stays dark', () => {
    const { world, r, px } = setup();
    world.pher.deposit(200.5, 40.5, 5);
    r.setView('pheromone');
    r.draw();
    const hit = px(200.25, 40.25);
    const near = px(202.25, 40.25);
    expect(hit[2]).toBeGreaterThan(hit[0] + 40);
    expect(hit[0] + hit[1] + hit[2]).toBeGreaterThan(near[0] + near[1] + near[2] + 100);
    expect(Math.max(...near)).toBeLessThan(60);
  });

  it('terrain view: a stone cell is reddish', () => {
    const { world, r, px } = setup();
    const t = world.terrain;
    let i = t.surface.findIndex((s, k) => s === Surface.Stone && k % t.w > 60);
    expect(i).toBeGreaterThanOrEqual(0);
    r.setView('terrain');
    r.draw();
    const [red, green, blue] = px((i % t.w) + 0.25, Math.floor(i / t.w) + 0.25);
    expect(red).toBeGreaterThan(green + 50);
    expect(red).toBeGreaterThan(blue + 50);
  });

  it('normal view is unaffected by deposits', () => {
    const { world, r, px } = setup();
    r.draw();
    const before = px(200.25, 40.25);
    world.pher.deposit(200.5, 40.5, 5);
    r.draw();
    expect(px(200.25, 40.25)).toEqual(before);
  });
});
