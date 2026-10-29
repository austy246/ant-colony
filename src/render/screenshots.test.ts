// @ts-nocheck -- node-only helper (fs / process); skipped unless ANT_SHOTS is set, so it never runs in the normal suite.
/**
 * Reproducible screenshots from the real Renderer in node (no browser, no HTML toolbar):
 *   ANT_SHOTS=docs/design npx vitest run src/render/screenshots.test.ts
 * writes screenshot-normal.png and screenshot-pheromone.png (800 x 335, zoom 4) plus nest-zoom4.png (1200 x 800, zoom 4).
 * The world is seeded and stepped deterministically, so the output is the same on every run.
 */
import { createCanvas } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { World } from '../sim/world';
import { Camera } from '../ui/camera';
import { Renderer, type View } from './renderer';
import type { CanvasLike } from './terrainRender';

const dir = process.env.ANT_SHOTS;
const make = (w: number, h: number): CanvasLike => createCanvas(w, h) as unknown as CanvasLike;

function shot(world: World, w: number, h: number, cx: number, cy: number, view: View, queen = false): Buffer {
  const canvas = createCanvas(1, 1);
  Object.assign(canvas, { clientWidth: w, clientHeight: h });
  const camera = new Camera(w, h);
  camera.zoom = 4;
  camera.x = cx;
  camera.y = cy;
  const r = new Renderer(canvas as unknown as HTMLCanvasElement, world, camera, make);
  r.setView(view);
  if (queen) r.setQueen({ visible: true, x: 40, y: 150, digProgress: 0 });
  r.draw();
  return canvas.toBuffer('image/png');
}

describe.skipIf(!dir)('screenshots', () => {
  beforeEach(() => vi.stubGlobal('window', { devicePixelRatio: 1, innerWidth: 800, innerHeight: 335 }));
  afterEach(() => vi.unstubAllGlobals());

  it('writes the PNGs', () => {
    mkdirSync(dir, { recursive: true });
    const world = World.create(5);
    world.placeFood('beetle', 100, 105);
    world.placeFood('caterpillar', 118, 128);
    world.placeFood('fly', 84, 98);
    world.placeFood('berry', 120, 150);
    world.placeFood('mushroom', 70, 160);
    world.placeFood('carrion', 90, 178);
    for (let i = 0; i < 14; i++) world.spawnAnt();
    for (let i = 0; i < 120; i++) world.step(0.1);
    // fresh food on top of what the ants have already started to carry away
    world.placeFood('beetle', 104, 142);
    world.placeFood('berry', 128, 136);
    world.placeFood('fly', 92, 126);
    world.placeFood('mushroom', 138, 118);
    world.placeFood('carrion', 112, 168);
    world.placeFood('caterpillar', 70, 130);
    for (let i = 0; i < 20; i++) world.step(0.1);
    expect(world.ants.length).toBeGreaterThan(5);
    // a few ants on the food and on the way back, so every sprite meets an ant in the picture
    world.ants.slice(0, 10).forEach((a, i) => {
      a.x = 60 + (i % 5) * 17 + (i >= 5 ? 6 : 0);
      a.y = 118 + Math.floor(i / 5) * 24 + (i % 3) * 3;
      a.heading = i % 2 ? 0.4 : Math.PI - 0.3;
      a.carry = i % 3 === 0 ? 1 : 0;
    });
    writeFileSync(`${dir}/screenshot-normal.png`, shot(world, 800, 335, 100, 138, 'normal'));
    writeFileSync(`${dir}/screenshot-pheromone.png`, shot(world, 800, 335, 100, 138, 'pheromone'));
    writeFileSync(`${dir}/nest-zoom4.png`, shot(world, 1200, 800, 150, 100, 'normal'));
  });
});
