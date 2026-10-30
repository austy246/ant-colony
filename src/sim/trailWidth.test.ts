import { expect, it } from 'vitest';
import { NEST, STEP_S } from './constants';
import { Surface } from './terrain';
import { World } from './world';
// Measured over 6 seeds (20 foragers walking a 150 px route and back, 120 s): the lateral spread of walkers around the
// nest-food line was 7.5 px rms before the weave was reduced, 3.5 px after (returning carriers are also drawn to the trail). A bit narrower than before, but not a single file.
it('foragers walk in a fairly tight file between nest and food (not a wide braid)', () => {
  const rs: number[] = [];
  for (let seed = 1; seed <= 6; seed++) {
    const w = World.create(seed);
    w.noSpider = true; w.stock = 0;
    w.terrain.surface.fill(Surface.Ground); w.terrain.speed.fill(1);
    const fx = NEST.x + 150, fy = NEST.y;
    const f = w.placeFood('berry', fx, fy)!; f.piecesLeft = 100000;
    for (let i = 0; i < 20; i++) { const a = w.spawnAnt(true); a.timer = 0.05 + i * 2; a.targetFood = f.id; a.nestKind = 'unload'; }
    let s = 0, n = 0;
    for (let t = 0; t < 120 / STEP_S; t++) {
      w.step(STEP_S);
      for (const a of w.ants) if ((a.state === 'carry' || a.state === 'toFood') && a.x > NEST.x + 10 && a.x < fx - 10) { s += (a.y - NEST.y) ** 2; n++; }
    }
    rs.push(Math.sqrt(s / Math.max(1, n)));
  }
  const mean = rs.reduce((a, b) => a + b) / rs.length;
  expect(mean).toBeLessThan(5);
  expect(mean).toBeGreaterThan(2); // still a living, wavy trail
});
