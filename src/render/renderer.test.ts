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

describe('Renderer queen', () => {
  const Q = { x: 100, y: 100, digProgress: 0 };

  it('visible queen paints dark body pixels; invisible paints nothing extra', () => {
    const { r, px } = setup();
    r.draw();
    const before = px(Q.x, Q.y);
    r.setQueen({ visible: false, ...Q });
    r.draw();
    expect(px(Q.x, Q.y)).toEqual(before);
    r.setQueen(null);
    r.draw();
    expect(px(Q.x, Q.y)).toEqual(before);
    r.setQueen({ visible: true, ...Q });
    r.draw();
    const after = px(Q.x, Q.y);
    expect(after).not.toEqual(before);
    expect(Math.max(...after)).toBeLessThan(70);
    expect(after[0] - after[2]).toBeLessThan(30);
  });

  it('digging grows a dark hole around the queen', () => {
    const { r, px } = setup();
    r.setQueen({ visible: true, x: 100, y: 100, digProgress: 0 });
    r.draw();
    const small = px(100 + 7, 100 + 3);
    r.setQueen({ visible: true, x: 100, y: 100, digProgress: 0.9 });
    r.draw();
    const big = px(100 + 7, 100 + 3);
    expect(Math.max(...big)).toBeLessThan(40);
    expect(big[0] + big[1] + big[2]).toBeLessThan(small[0] + small[1] + small[2]);
  });
});
