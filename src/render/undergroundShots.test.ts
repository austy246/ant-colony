// @ts-nocheck -- node-only helper (fs / process); skipped unless ANT_SHOTS is set, so it never runs in the normal suite.
/**
 * Reproducible screenshots of the underground view in node (no browser):
 *   ANT_SHOTS=docs/design npx vitest run src/render/undergroundShots.test.ts
 * writes screenshot-underground.png (mid game, 1280 x 800 = zoom 4) plus underground-day1.png and underground-late.png.
 * The world is seeded and nothing is random, so the output is the same on every run.
 */
import { createCanvas } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { World } from '../sim/world';
import type { CanvasLike } from './terrainRender';
import { UndergroundView } from './underground';

const dir = process.env.ANT_SHOTS;
const make = (w: number, h: number): CanvasLike => createCanvas(w, h) as unknown as CanvasLike;

function colony(ants: number, stock: number, queens: number): World {
  const w = World.create(5);
  for (let i = 0; i < ants; i++) w.spawnAnt();
  w.stock = stock;
  w.totalDelivered = (queens - 1) * 100;
  w.hatchProgress = w.hatchInterval * 0.6;
  return w;
}

function shot(world: World, carrier = false): Buffer {
  const canvas = createCanvas(1, 1);
  Object.assign(canvas, { clientWidth: 1280, clientHeight: 800 });
  const view = new UndergroundView(canvas as unknown as HTMLCanvasElement, world, make);
  view.draw(0);
  for (let i = 0; i < 40; i++) view.draw(0.05);
  if (carrier) {
    world.deliveryCount += 3;
    world.spawnAnt();
    for (let i = 0; i < 44; i++) view.draw(0.05);
  }
  return canvas.toBuffer('image/png');
}

describe.skipIf(!dir)('underground screenshots', () => {
  beforeEach(() => vi.stubGlobal('window', { devicePixelRatio: 1, innerWidth: 1280, innerHeight: 800 }));
  afterEach(() => vi.unstubAllGlobals());

  it('writes the PNGs', () => {
    mkdirSync(dir, { recursive: true });
    const day1 = shot(colony(1, 10, 1));
    const mid = shot(colony(40, 40, 2), true);
    const late = shot(colony(300, 500, 8));
    expect(mid.length).toBeGreaterThan(1000);
    writeFileSync(`${dir}/underground-day1.png`, day1);
    writeFileSync(`${dir}/screenshot-underground.png`, mid);
    writeFileSync(`${dir}/underground-late.png`, late);
  });
});
