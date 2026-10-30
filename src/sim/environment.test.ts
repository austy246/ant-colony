import { describe, expect, it } from 'vitest';
import { SPAWN_MAX_BEETLES_BASE, SPAWN_MAX_FOOD_BASE, SPAWN_MAX_FOOD_PER_STEP, SPAWN_MAX_S, SPAWN_MIN_S, SPAWN_WEIGHTS, STEP_S } from './constants';
import { pickSpawnKind, updateEnvironment } from './environment';
import { isAlive, isFreeSpot } from './food';
import { Rng } from './rng';
import { World } from './world';

/** Forces `rounds` spawn rounds (timer set to 0 each time); `between` may tidy the world after each. */
function rounds(w: World, n: number, between?: () => void): void {
  for (let i = 0; i < n; i++) {
    w.spawnTimer = 0;
    updateEnvironment(w);
    between?.();
  }
}

const livingBeetles = (w: World): number => w.food.filter((f) => f.kind === 'beetle' && isAlive(f)).length;

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
    for (let i = 0; i < 120; i++) w.step(0.5);
    expect(w.food.length).toBe(0);
  });

  it('normal spawns food over time', () => {
    const w = World.create(3, 'normal');
    for (let i = 0; i < 600; i++) w.step(0.5);
    expect(w.food.length).toBeGreaterThan(0);
  });

  it('spawns are spaced SPAWN_MIN_S..SPAWN_MAX_S apart', () => {
    const w = World.create(4, 'normal');
    const times: number[] = [];
    let count = 0;
    for (let i = 0; i < 100 * 30 && times.length < 3; i++) {
      w.step(STEP_S);
      if (w.food.length > count) times.push(w.time);
      count = w.food.length;
    }
    expect(times.length).toBe(3);
    expect(times[0]).toBeLessThan(2 * STEP_S); // spawnTimer starts at 0: draw at once
    for (let i = 1; i < times.length; i++) {
      const gap = times[i] - times[i - 1];
      expect(gap).toBeGreaterThanOrEqual(SPAWN_MIN_S - 2 * STEP_S);
      expect(gap).toBeLessThanOrEqual(SPAWN_MAX_S + 2 * STEP_S);
    }
  });

  it('spawned food stays under the cap, and reaches it', () => {
    for (const mapStep of [0, 3]) {
      const w = World.create(5, 'normal');
      w.mapStep = mapStep;
      const cap = SPAWN_MAX_FOOD_BASE + SPAWN_MAX_FOOD_PER_STEP * mapStep;
      rounds(w, 400, () => expect(w.food.length).toBeLessThanOrEqual(cap));
      expect(w.food.length).toBe(cap);
    }
  });

  it('keeps living beetles within the cap, and does spawn them', () => {
    for (const mapStep of [0, 2]) {
      const w = World.create(1, 'normal');
      w.mapStep = mapStep;
      const cap = SPAWN_MAX_BEETLES_BASE + mapStep;
      let max = 0;
      // Drop everything but beetles after each round so the food cap never binds before the beetle cap.
      rounds(w, 1500, () => {
        w.food = w.food.filter((f) => f.kind === 'beetle');
        max = Math.max(max, livingBeetles(w));
        expect(livingBeetles(w)).toBeLessThanOrEqual(cap);
      });
      expect(max).toBe(cap);
    }
  });

  it('spawned food is on a free spot outside the nest radius', () => {
    const w = World.create(9, 'normal');
    rounds(w, 300, () => { w.food = w.food.slice(-20); });
    expect(w.food.length).toBeGreaterThan(0);
    for (const f of w.food) expect(isFreeSpot(w.terrain, f.x, f.y)).toBe(true);
  });
});
