// @ts-nocheck -- node-only helper (fs / process); skipped unless ANT_SHOTS is set, so it never runs in the normal suite.
/**
 * Reproducible screenshots of the underground view in node (no browser):
 *   ANT_SHOTS=docs/design npx vitest run src/render/undergroundShots.test.ts
 * writes screenshot-underground.png (mid game, 1280 x 800 = zoom 4) plus underground-day1.png and underground-late.png
 * (nurses, callow hatchlings and unloading foragers are real nest ants of the simulation).
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

/** Lets the colony live for a while (nurses are appointed from the hatchlings), then sends a few more ants inside. */
function lived(w: World, seconds: number, hatch: number, unload: number): World {
  w.started = true;
  for (let i = 0; i < Math.round(seconds / 0.05); i++) w.step(0.05);
  for (let i = 0; i < hatch; i++) w.spawnAnt(true).timer = 8 + i * 4.5;
  const surface = w.ants.filter((a) => a.state !== 'nest' && a.role === 'forager');
  for (let i = 0; i < unload && i < surface.length; i++) {
    surface[i].state = 'nest';
    surface[i].nestKind = 'unload';
    surface[i].timer = 2.2 + i * 0.9;
  }
  return w;
}

function shot(world: World): Buffer {
  const canvas = createCanvas(1, 1);
  Object.assign(canvas, { clientWidth: 1280, clientHeight: 800 });
  const view = new UndergroundView(canvas as unknown as HTMLCanvasElement, world, make);
  view.draw(0);
  for (let i = 0; i < 40; i++) view.draw(0.05);
  return canvas.toBuffer('image/png');
}

describe.skipIf(!dir)('underground screenshots', () => {
  beforeEach(() => vi.stubGlobal('window', { devicePixelRatio: 1, innerWidth: 1280, innerHeight: 800 }));
  afterEach(() => vi.unstubAllGlobals());

  it('writes the PNGs', () => {
    mkdirSync(dir, { recursive: true });
    const day1 = shot(lived(colony(2, 10, 1), 20, 2, 1));
    const mid = shot(lived(colony(40, 40, 2), 22, 3, 2));
    const late = shot(lived(colony(300, 500, 8), 30, 12, 8));
    expect(mid.length).toBeGreaterThan(1000);
    writeFileSync(`${dir}/underground-day1.png`, day1);
    writeFileSync(`${dir}/screenshot-underground.png`, mid);
    writeFileSync(`${dir}/underground-late.png`, late);
  });
});
