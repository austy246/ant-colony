import { describe, expect, it } from 'vitest';
import { FOOD_PER_ANT, LIFESPAN_S, MAX_ANTS, NEST, STEP_S, WORLD_H, WORLD_W } from './constants';
import { Surface } from './terrain';
import { World } from './world';

/** World with an obstacle-free ground (speed 1 everywhere). */
function flatWorld(seed = 1): World {
  const w = World.create(seed);
  w.terrain.surface.fill(Surface.Ground);
  w.terrain.speed.fill(1);
  return w;
}

/** Food delivered to the nest = stock plus the food spent on hatched ants (beyond `initial` ants). */
function delivered(w: World, initial: number): number {
  return w.stock + (w.ants.length - initial) * FOOD_PER_ANT;
}

function run(w: World, seconds: number, dt = 0.1): void {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) w.step(dt);
}

function pathLength(w: World, seconds: number): number {
  const a = w.ants[0];
  let len = 0;
  let px = a.x;
  let py = a.y;
  for (let i = 0; i < Math.round(seconds / STEP_S); i++) {
    w.step(STEP_S);
    len += Math.hypot(a.x - px, a.y - py);
    px = a.x;
    py = a.y;
  }
  return len;
}

describe('World', () => {
  it('create starts with no ants and empty stock', () => {
    const w = World.create(5);
    expect(w.ants).toHaveLength(0);
    expect(w.stock).toBe(0);
    expect(w.hatchProgress).toBe(0);
    expect(w.seed).toBe(5);
  });

  it('ant on stone moves slower than on ground', () => {
    const ground = flatWorld(2);
    ground.spawnAnt();
    const stone = flatWorld(2);
    stone.terrain.surface.fill(Surface.Stone);
    stone.terrain.speed.fill(0.15);
    stone.spawnAnt();
    // Same start/heading (same seed), both in the open: path length ratio ~ speed ratio.
    for (const w of [ground, stone]) {
      w.ants[0].x = 160;
      w.ants[0].y = 100;
      w.ants[0].lifespan = 1e6;
    }
    const lg = pathLength(ground, 4);
    const ls = pathLength(stone, 4);
    expect(lg).toBeGreaterThan(30);
    expect(ls / lg).toBeGreaterThan(0.1);
    expect(ls / lg).toBeLessThan(0.2);
  });

  it('wandering ant finds food placed within 30 px and carries a piece to the nest', () => {
    const w = flatWorld(3);
    w.placeFood('beetle', NEST.x + 30, NEST.y);
    w.spawnAnt();
    w.ants[0].lifespan = 1e6;
    run(w, 120);
    expect(delivered(w, 1)).toBeGreaterThan(0);
  });

  it('food stock of 3 hatches exactly one new ant and leaves stock 0', () => {
    const w = flatWorld(4);
    w.stock = FOOD_PER_ANT;
    w.step(STEP_S);
    expect(w.ants).toHaveLength(1);
    expect(w.stock).toBe(0);
    const a = w.ants[0];
    expect(Math.hypot(a.x - NEST.x, a.y - NEST.y)).toBeLessThan(NEST.r);
    expect(a.lifespan).toBeGreaterThanOrEqual(LIFESPAN_S * 0.8);
    expect(a.lifespan).toBeLessThanOrEqual(LIFESPAN_S * 1.2);
  });

  it('ants never exceed MAX_ANTS', () => {
    const w = flatWorld(5);
    for (let i = 0; i < MAX_ANTS; i++) w.spawnAnt();
    w.stock = 100;
    run(w, 2);
    expect(w.ants.length).toBeLessThanOrEqual(MAX_ANTS);
    expect(w.ants).toHaveLength(MAX_ANTS);
    expect(w.stock).toBe(100);
  });

  it('ant dies when age reaches lifespan', () => {
    const w = flatWorld(6);
    const a = w.spawnAnt();
    a.lifespan = 1;
    run(w, 0.8);
    expect(w.ants).toHaveLength(1);
    run(w, 0.4);
    expect(w.ants).toHaveLength(0);
  });

  it('queen survives: world with no ants and no food keeps running 1000 s without throwing', () => {
    const w = World.create(7);
    expect(() => {
      for (let i = 0; i < 2000; i++) w.step(0.5);
    }).not.toThrow();
    expect(w.ants).toHaveLength(0);
    expect(w.time).toBeGreaterThan(900);
  });

  it('dt of 3600 s is clamped and does not produce NaN positions', () => {
    const w = World.create(8);
    for (let i = 0; i < 5; i++) w.spawnAnt();
    w.placeFood('fly', NEST.x + 30, NEST.y);
    const t0 = w.time;
    w.step(3600);
    expect(w.time - t0).toBeLessThanOrEqual(0.5 + 1e-6);
    for (const a of w.ants) {
      expect(Number.isFinite(a.x)).toBe(true);
      expect(Number.isFinite(a.y)).toBe(true);
      expect(Number.isFinite(a.heading)).toBe(true);
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.x).toBeLessThanOrEqual(WORLD_W);
      expect(a.y).toBeGreaterThanOrEqual(0);
      expect(a.y).toBeLessThanOrEqual(WORLD_H);
    }
    const before = w.time;
    w.step(NaN);
    w.step(-5);
    w.step(Infinity);
    expect(w.time).toBe(before);
  });

  it('trail forms: pheromone along the food-nest line exceeds the sum 15 px off the line', () => {
    const w = flatWorld(9);
    const food = w.placeFood('beetle', NEST.x + 60, NEST.y);
    expect(food).not.toBeNull();
    for (let i = 0; i < 5; i++) {
      const a = w.spawnAnt();
      a.lifespan = 1e6;
    }
    run(w, 90);
    const sumRow = (y: number) => {
      let s = 0;
      for (let x = NEST.x + 8; x <= NEST.x + 52; x++) {
        for (let dy = -1; dy <= 1; dy++) s += w.pher.sample(x, y + dy);
      }
      return s;
    };
    const onLine = sumRow(NEST.y);
    const off = sumRow(NEST.y - 15) + sumRow(NEST.y + 15);
    expect(onLine).toBeGreaterThan(off);
    expect(onLine).toBeGreaterThan(1);
  });

  it('deleted food clears targetFood so ants return to wander', () => {
    const w = flatWorld(10);
    const f = w.placeFood('carrion', NEST.x + 40, NEST.y)!;
    const a = w.spawnAnt();
    a.state = 'toFood';
    a.targetFood = f.id;
    w.removeFood(f.id);
    expect(a.targetFood).toBeNull();
    expect(a.state).toBe('wander');
    expect(w.food).toHaveLength(0);
  });

  it('removeFood leaves carrying ants carrying', () => {
    const w = flatWorld(11);
    const f = w.placeFood('carrion', NEST.x + 40, NEST.y)!;
    const a = w.spawnAnt();
    a.state = 'carry';
    a.carry = 2;
    a.targetFood = f.id;
    w.removeFood(f.id);
    expect(a.state).toBe('carry');
    expect(a.carry).toBe(2);
    expect(a.targetFood).toBeNull();
  });

  it('trail evaporates when food is gone', () => {
    const w = flatWorld(12);
    w.placeFood('beetle', NEST.x + 50, NEST.y);
    for (let i = 0; i < 5; i++) w.spawnAnt().lifespan = 1e6;
    run(w, 60);
    const sum = () => w.pher.data.reduce((s, v) => s + v, 0);
    const peak = sum();
    expect(peak).toBeGreaterThan(0);
    for (const f of [...w.food]) w.removeFood(f.id);
    w.ants.length = 0;
    run(w, 120);
    expect(sum()).toBeLessThan(peak * 0.05);
  });

  it('placeFood returns null for point on stone beyond reach', () => {
    const w = World.create(13);
    const t = w.terrain;
    for (let y = 80; y < 140; y++) for (let x = 150; x < 230; x++) t.surface[y * t.w + x] = Surface.Stone;
    expect(w.placeFood('fly', 190, 110)).toBeNull();
    expect(w.food).toHaveLength(0);
  });

  it('moveFood relocates a piece, removeFood deletes it', () => {
    const w = flatWorld(14);
    const f = w.placeFood('fly', 150, 100)!;
    expect(f.piecesLeft).toBe(2);
    expect(w.moveFood(f.id, 200, 60)).toBe(true);
    expect(f.x).toBe(200);
    expect(f.y).toBe(60);
    expect(w.moveFood(9999, 10, 10)).toBe(false);
    w.removeFood(f.id);
    expect(w.food).toHaveLength(0);
    expect(w.moveFood(f.id, 10, 10)).toBe(false);
  });

  it('after all ants died and stock is 0, new food and spawnAnt keep the game consistent', () => {
    const w = flatWorld(11);
    const a = w.spawnAnt();
    a.lifespan = 0.5;
    run(w, 1);
    expect(w.ants).toHaveLength(0);
    expect(w.stock).toBe(0);
    w.placeFood('fly', NEST.x + 25, NEST.y);
    const n = w.spawnAnt();
    n.lifespan = 1e6;
    expect(n.id).not.toBe(a.id);
    run(w, 120);
    expect(delivered(w, 1)).toBeGreaterThan(0);
  });
});
