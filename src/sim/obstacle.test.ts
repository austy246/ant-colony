import { expect, it } from 'vitest';
import { NEST, STEP_S } from './constants';
import { Surface } from './terrain';
import { World } from './world';

/** Ground with one disc of `surface` (radius r) on the straight line between the nest and a food source 100 px away. */
function world(seed: number, surface: number, r: number): { w: World; ix: number; iy: number } {
  const w = World.create(seed);
  w.noSpider = true;
  w.stock = 0;
  w.terrain.surface.fill(Surface.Ground);
  w.terrain.speed.fill(1);
  const cx = NEST.x + 50;
  const cy = NEST.y;
  const speed = surface === Surface.Stone ? 0.15 : surface === Surface.BigTwig ? 0.3 : 0.6;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) {
        w.terrain.surface[y * w.terrain.w + x] = surface;
        w.terrain.speed[y * w.terrain.w + x] = speed;
      }
    }
  }
  const food = w.placeFood('berry', NEST.x + 100, NEST.y)!;
  food.piecesLeft = 100000;
  for (let i = 0; i < 12; i++) {
    const a = w.spawnAnt(true);
    a.timer = 0.05 + i * 3;
    a.targetFood = food.id;
    a.nestKind = 'unload';
  }
  return { w, ix: cx, iy: cy };
}

/** Share of the walking steps (to the food and home) that lie on the obstacle, and deliveries made in 120 s. */
function measure(surface: number, r: number): { onObstacle: number; deliveries: number } {
  let steps = 0;
  let on = 0;
  let deliveries = 0;
  for (let seed = 1; seed <= 4; seed++) {
    const { w } = world(seed, surface, r);
    for (let t = 0; t < 120 / STEP_S; t++) {
      w.step(STEP_S);
      for (const a of w.ants) {
        if (a.state !== 'carry' && a.state !== 'toFood') continue;
        steps++;
        const ix = Math.floor(a.x);
        const iy = Math.floor(a.y);
        if (w.terrain.surface[iy * w.terrain.w + ix] === surface) on++;
      }
    }
    deliveries += w.deliveryCount;
  }
  return { onObstacle: on / Math.max(1, steps), deliveries };
}

it('ants walk around a stone instead of over it', () => {
  const m = measure(Surface.Stone, 7);
  // Measured (4 seeds x 12 ants, 120 s, a stone of radius 7 on the straight line): 36 % of the steps lay on the stone and
  // 94 deliveries were made before; 1.5 % and 136 deliveries after the ants look ahead along their path.
  expect(m.onObstacle).toBeLessThan(0.04);
  expect(m.deliveries).toBeGreaterThan(115);
});

it('a thin twig does not stop the traffic: deliveries stay high', () => {
  const m = measure(Surface.BigTwig, 1.2);
  expect(m.deliveries).toBeGreaterThan(110);
});
