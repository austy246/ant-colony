import { describe, expect, it } from 'vitest';
import { MAX_ANTS, MAX_ANTS_NORMAL } from './constants';
import { World } from './world';

describe('large colony', () => {
  // Smoke test with a generous bound for slow CI machines, not a benchmark.
  it('normal world with 2000 ants steps 10 simulated seconds under 8 s', () => {
    const w = World.create(7, 'normal');
    for (let i = 0; i < 2000; i++) w.spawnAnt();
    w.stock = 400;
    w.placeFood('berry', 120, 100);
    w.placeFood('beetle', 200, 60);
    w.placeFood('caterpillar', 160, 140);
    w.placeFood('fly', 90, 120);
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) w.step(0.5);
    const ms = performance.now() - t0;
    expect(w.ants.length).toBe(2000);
    expect(ms).toBeLessThan(8000);
  }, 60000);

  it('normal hatch() passes 300 ants and stops at 2000', () => {
    const w = World.create(3, 'normal');
    w.noSpider = true; // a spider eating an ant would make the exact counts below flaky
    for (let i = 0; i < 299; i++) w.spawnAnt();
    w.stock = 1e6;
    let guard = 0;
    while (w.ants.length < MAX_ANTS + 5 && guard++ < 4000) w.step(0.5);
    expect(w.ants.length).toBeGreaterThan(MAX_ANTS);

    while (w.ants.length < MAX_ANTS_NORMAL - 1) w.spawnAnt();
    guard = 0;
    while (w.ants.length < MAX_ANTS_NORMAL && guard++ < 4000) w.step(0.5);
    expect(w.ants.length).toBe(MAX_ANTS_NORMAL);
    for (let i = 0; i < 60; i++) w.step(0.5);
    expect(w.ants.length).toBe(MAX_ANTS_NORMAL);
  }, 180000);
});
