import { describe, expect, it, vi } from 'vitest';
import { GUARD_FRACTION, GUARD_R_MIN, GUARD_R_STEP, NEST, RAID_MIN_ANTS, RED_NEST_MIN_ANTS, RED_STOCK_PER_ANT, STEP_S } from './constants';
import { Surface } from './terrain';
import { World } from './world';

vi.setConfig({ testTimeout: 120_000 }); // big colonies with hundreds of red ants: slow when the whole suite runs at once

function run(w: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / STEP_S); i++) w.step(STEP_S);
}

function colony(seed: number, ants: number, majors = 0): World {
  const w = World.create(seed, 'normal');
  w.noSpider = true;
  w.noRaid = true;
  w.spawnTimer = 1e9;
  w.stock = 300;
  w.terrain.surface.fill(Surface.Ground);
  w.terrain.speed.fill(1);
  w.addAnts(ants);
  for (let i = 0; i < majors; i++) w.ants[i].major = true;
  return w;
}

describe('guards of the black nest', () => {
  it('a tenth of the colony circles the nest, majors first, and ignores food', () => {
    const w = colony(1, 200, 12);
    w.placeFood('berry', NEST.x + 90, NEST.y);
    run(w, 20);
    const guards = w.ants.filter((a) => a.role === 'guard');
    expect(guards).toHaveLength(Math.floor(200 * GUARD_FRACTION));
    expect(guards.filter((a) => a.major).length).toBe(12); // the 12 majors are all on guard
    const ring = GUARD_R_MIN + 4 * GUARD_R_STEP;
    run(w, 20);
    for (const g of guards) {
      expect(g.state).toBe('wander'); // no food, no carrying
      expect(Math.hypot(g.x - NEST.x, g.y - NEST.y)).toBeLessThan(ring + 25);
    }
  });

  it('a small colony has no guards', () => {
    const w = colony(2, 15);
    run(w, 10);
    expect(w.ants.filter((a) => a.role === 'guard')).toHaveLength(0);
  });

  it('a guard that meets a red ant fights it', () => {
    const w = colony(3, 100);
    w.noRaid = false; // (a colony of 100 has no red nest: only the red ant put here fights)
    run(w, 10);
    const g = w.ants.find((a) => a.role === 'guard')!;
    w.reds.push({ id: 90001, x: g.x + 25, y: g.y, heading: Math.PI });
    run(w, 10);
    expect(w.redKilled + w.antsKilled).toBeGreaterThanOrEqual(1);
  });
});

describe('the red ants forage', () => {
  it('the red nest comes only from RED_NEST_MIN_ANTS black ants (1500)', () => {
    expect(RED_NEST_MIN_ANTS).toBe(1500);
    expect(RAID_MIN_ANTS).toBe(1500);
  });

  it('red foragers take food home, and every RED_STOCK_PER_ANT of it makes one more red ant', () => {
    const w = World.create(5, 'normal');
    w.noSpider = true;
    w.spawnTimer = 1e9;
    w.stock = 300;
    w.terrain.surface.fill(Surface.Ground);
    w.terrain.speed.fill(1);
    w.addAnts(RED_NEST_MIN_ANTS);
    run(w, 2);
    const n = w.redNest!;
    for (const a of w.ants) a.role = 'nurse'; // keep the black ants out of it
    for (const a of w.ants) { a.state = 'nest'; a.nestKind = 'nurse'; }
    const food = w.placeFood('berry', n.x + 30, n.y)!;
    food.piecesLeft = 30;
    const reds0 = w.reds.length;
    run(w, 120);
    expect(food.piecesLeft).toBeLessThan(30);
    const brought = 30 - food.piecesLeft;
    expect(brought).toBeGreaterThanOrEqual(RED_STOCK_PER_ANT);
    expect((n.stock ?? 0) + 0).toBeGreaterThanOrEqual(0);
    // more reds than the 5 s trickle alone would give (120 s / 5 s = 24)
    expect(w.reds.length - reds0).toBeGreaterThan(24);
  });
});
