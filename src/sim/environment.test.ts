import { describe, expect, it } from 'vitest';
import { SPAWN_MAX_BEETLES_BASE, SPAWN_MAX_FOOD_BASE, SPAWN_MAX_FOOD_PER_STEP, SPAWN_WEIGHTS } from './constants';
import { pickSpawnKind } from './environment';
import { isAlive, isFreeSpot } from './food';
import { Rng } from './rng';
import { World } from './world';

function run(w: World, seconds: number): void {
  for (let i = 0; i < seconds * 2; i++) w.step(0.5);
}

describe('spontaneous prey', () => {
  it('pickSpawnKind follows weights', () => {
    const rng = new Rng(7);
    const n = 10000;
    let berries = 0;
    for (let i = 0; i < n; i++) {
      const k = pickSpawnKind(rng, SPAWN_WEIGHTS);
      expect(k).not.toBe('sugar');
      if (k === 'berry') berries++;
    }
    expect(Math.abs(berries / n - 3 / 11)).toBeLessThan(0.03);
  });

  it('sandbox never spawns anything', () => {
    const w = World.create(3, 'sandbox');
    run(w, 3600);
    expect(w.food.length).toBe(0);
  }, 60000);

  it('normal spawns food over time', () => {
    const w = World.create(3, 'normal');
    run(w, 600);
    expect(w.food.length).toBeGreaterThan(0);
  });

  it('spawned food stays under the cap', () => {
    const w = World.create(5, 'normal');
    run(w, 1800);
    expect(w.food.length).toBeGreaterThan(0);
    expect(w.food.length).toBeLessThanOrEqual(SPAWN_MAX_FOOD_BASE + SPAWN_MAX_FOOD_PER_STEP * w.mapStep);
  }, 60000);

  it('keeps living beetles within the cap', () => {
    for (const seed of [1, 2]) {
      const w = World.create(seed, 'normal');
      for (let i = 0; i < 1800 * 2; i++) {
        w.step(0.5);
        if (i % 20 === 0) {
          const beetles = w.food.filter((f) => f.kind === 'beetle' && isAlive(f)).length;
          expect(beetles).toBeLessThanOrEqual(SPAWN_MAX_BEETLES_BASE + w.mapStep);
        }
      }
    }
  }, 60000);

  it('spawned food is on a free spot outside the nest radius', () => {
    const w = World.create(9, 'normal');
    run(w, 1200);
    expect(w.food.length).toBeGreaterThan(0);
    for (const f of w.food) expect(isFreeSpot(w.terrain, f.x, f.y)).toBe(true);
  });
});
