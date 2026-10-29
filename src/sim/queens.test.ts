import { describe, expect, it } from 'vitest';
import { FOOD_PER_ANT, FOOD_PER_QUEEN, HATCH_INTERVAL_S, MAX_QUEENS, STEP_S } from './constants';
import { Surface } from './terrain';
import { World } from './world';

function flatWorld(seed = 1): World {
  const w = World.create(seed);
  w.stock = 0;
  w.terrain.surface.fill(Surface.Ground);
  w.terrain.speed.fill(1);
  return w;
}

function startedColony(seed: number, stock: number, totalDelivered: number): World {
  const w = flatWorld(seed);
  w.spawnAnt();
  w.stock = stock;
  w.totalDelivered = totalDelivered;
  return w;
}

/** Seconds (substep resolution) until the colony has `count` ants, or `limit` if it never does. */
function secondsUntilAnts(w: World, count: number, limit: number): number {
  for (let i = 1; i <= Math.round(limit / STEP_S); i++) {
    w.step(STEP_S);
    if (w.ants.length >= count) return i * STEP_S;
  }
  return limit;
}

describe('queens (every FOOD_PER_QUEEN food delivered adds a queen, hatching speeds up proportionally)', () => {
  it('constants: 100 food per queen, at most 8 queens', () => {
    expect(FOOD_PER_QUEEN).toBe(100);
    expect(MAX_QUEENS).toBe(8);
  });

  it('a new world has delivered nothing and has one queen', () => {
    const w = World.create(1);
    expect(w.totalDelivered).toBe(0);
    expect(w.queens).toBe(1);
  });

  it('queens: 0..99.99 delivered -> 1, 100 -> 2, 750 -> 8 (cap) and it stays 8', () => {
    const w = flatWorld();
    for (const d of [0, 1, 50, 99.99]) {
      w.totalDelivered = d;
      expect(w.queens, String(d)).toBe(1);
    }
    w.totalDelivered = 100;
    expect(w.queens).toBe(2);
    w.totalDelivered = 199.99;
    expect(w.queens).toBe(2);
    w.totalDelivered = 200;
    expect(w.queens).toBe(3);
    w.totalDelivered = 700;
    expect(w.queens).toBe(8);
    w.totalDelivered = 750;
    expect(w.queens).toBe(8);
    w.totalDelivered = 1e6;
    expect(w.queens).toBe(MAX_QUEENS);
  });

  it('a delivery adds the carried food to totalDelivered (and to stock)', () => {
    const w = flatWorld(3);
    const a = w.spawnAnt();
    a.state = 'carry';
    a.carry = 2 / 3;
    a.x = 60;
    a.y = 150;
    w.stock = 0;
    for (let i = 0; i < 300 && a.carry > 0; i++) w.step(STEP_S);
    expect(a.carry).toBe(0);
    expect(w.totalDelivered).toBeCloseTo(2 / 3, 9);
    expect(w.stock).toBeCloseTo(2 / 3, 9);
  });

  it('with 2 queens an ant hatches every 5 s (+-0.1) while stock allows, each hatch costs 5', () => {
    const w = startedColony(61, 3 * FOOD_PER_ANT, FOOD_PER_QUEEN);
    expect(w.queens).toBe(2);
    expect(secondsUntilAnts(w, 2, 20)).toBeCloseTo(HATCH_INTERVAL_S / 2, 1);
    expect(w.stock).toBe(2 * FOOD_PER_ANT);
    expect(secondsUntilAnts(w, 3, 20)).toBeCloseTo(HATCH_INTERVAL_S / 2, 1);
    expect(w.stock).toBe(FOOD_PER_ANT);
    expect(secondsUntilAnts(w, 4, 20)).toBeCloseTo(HATCH_INTERVAL_S / 2, 1);
    expect(w.stock).toBe(0);
    expect(secondsUntilAnts(w, 5, 30)).toBe(30); // no food, no ant
  });

  it('with 8 queens an ant hatches every 1.25 s', () => {
    const w = startedColony(62, 4 * FOOD_PER_ANT, 5000);
    expect(w.queens).toBe(MAX_QUEENS);
    const t = secondsUntilAnts(w, 5, 20);
    expect(t).toBeCloseTo(4 * (HATCH_INTERVAL_S / 8), 0);
    expect(w.stock).toBe(0);
  });

  it('hatchFraction uses the effective interval, hatchProgress stays in seconds', () => {
    const w = startedColony(63, 2 * FOOD_PER_ANT, FOOD_PER_QUEEN);
    for (let i = 0; i < 75; i++) w.step(STEP_S); // 2.5 s of a 5 s cycle
    expect(w.hatchProgress).toBeCloseTo(2.5, 6);
    expect(w.hatchFraction).toBeCloseTo(0.5, 6);
    w.totalDelivered = 0; // back to one queen: 2.5 s of a 10 s cycle
    expect(w.hatchFraction).toBeCloseTo(0.25, 6);
  });

  it('1 queen still hatches one ant per 10 s (unchanged)', () => {
    const w = startedColony(64, 2 * FOOD_PER_ANT, 0);
    expect(secondsUntilAnts(w, 2, 20)).toBeCloseTo(HATCH_INTERVAL_S, 1);
  });

  it('stock made of 2/3 pieces that sums to just below 10 still hatches two ants and ends at exactly 0', () => {
    const w = startedColony(65, 0, 0);
    for (let i = 0; i < 15; i++) w.stock += 2 / 3;
    expect(w.stock).toBeLessThan(2 * FOOD_PER_ANT); // 9.999999999999998
    expect(w.larvae).toBe(2);
    for (let i = 0; i < Math.round(25 / STEP_S); i++) w.step(STEP_S);
    expect(w.ants).toHaveLength(3);
    expect(w.stock).toBe(0);
  });

  it('three 5/3 pieces make exactly one hatch, no float residue left in stock', () => {
    const w = startedColony(66, 0, 0);
    w.stock = 5 / 3 + 5 / 3 + 5 / 3 + 1e-12 - 2e-12; // just below 5
    w.stock += 7 / 3;
    expect(secondsUntilAnts(w, 2, 12)).toBeCloseTo(10, 1);
    expect(w.stock).toBeCloseTo(7 / 3, 6);
    expect(Math.abs(w.stock * 1e6 - Math.round(w.stock * 1e6))).toBeLessThan(1e-6);
  });
});
