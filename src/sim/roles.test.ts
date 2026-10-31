import { describe, expect, it, vi } from 'vitest';
import { GUARD_FRACTION, GUARD_R_MIN, GUARD_R_STEP, NEST, RAID_MIN_ANTS, RED_FOOD_PER_ANT, RED_NEST_MIN_ANTS, RED_START_STOCK, RED_TRICKLE_S, STEP_S } from './constants';
import type { RedAnt } from './raid';
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

  function redWorld(seed: number): World {
    const w = World.create(seed, 'normal');
    w.noSpider = true;
    w.spawnTimer = 1e9;
    w.stock = 300;
    w.terrain.surface.fill(Surface.Ground);
    w.terrain.speed.fill(1);
    w.addAnts(RED_NEST_MIN_ANTS);
    run(w, 2);
    for (const a of w.ants) { a.role = 'nurse'; a.state = 'nest'; a.nestKind = 'nurse'; } // keep the black ants out of it
    return w;
  }

  it('the red nest starts with a stock of food; every new red ant costs RED_FOOD_PER_ANT of it', () => {
    const w = redWorld(5);
    const n = w.redNest!;
    expect(RED_START_STOCK).toBe(100);
    const before = (n.stock ?? 0) + 0;
    const reds0 = w.reds.length;
    run(w, RED_TRICKLE_S * 4 + 1);
    expect(w.reds.length - reds0).toBe(4);
    expect(before - (n.stock ?? 0)).toBeCloseTo(4 * RED_FOOD_PER_ANT, 6);
  });

  it('with no food in the stock no new red ant comes out', () => {
    const w = redWorld(6);
    const n = w.redNest!;
    n.stock = 0;
    const reds0 = w.reds.length;
    run(w, RED_TRICKLE_S * 3);
    expect(w.reds.length).toBe(reds0);
  });

  it('red foragers gnaw at the food, carry a piece home slowly, hand it over and the stock grows', () => {
    const w = redWorld(7);
    const n = w.redNest!;
    n.stock = 0; // nothing is spent while we watch
    const food = w.placeFood('berry', n.x + 30, n.y)!;
    food.piecesLeft = 30;
    // a single forager next to the food: it must stand and gnaw for a while before it takes a piece
    w.reds.splice(0, w.reds.length);
    const f: RedAnt = { id: 91000, x: food.x - 1, y: food.y, heading: 0, patrol: true, job: 'forager', spd: 1, tf: food.id };
    w.reds.push(f);
    let gnawed = 0;
    let carryAt = -1;
    for (let t = 0; t < 40 / STEP_S; t++) {
      w.step(STEP_S);
      if (f.gnawT !== undefined) gnawed++;
      if (carryAt < 0 && (f.carry ?? 0) > 0) carryAt = t * STEP_S;
    }
    expect(gnawed * STEP_S).toBeGreaterThan(2.5); // it gnawed for about GNAW_S seconds
    expect(carryAt).toBeGreaterThan(2.5);
    expect(food.piecesLeft).toBeLessThan(30);
    expect(n.delivered ?? 0).toBeGreaterThan(0);
    expect(n.stock ?? 0).toBeGreaterThan(0);
  });

  it('a red forager carrying food lays red pheromone on the way home, which other red foragers follow', () => {
    const w = redWorld(8);
    const n = w.redNest!;
    w.reds.splice(0, w.reds.length);
    expect(w.redPher.sampleMax(n.x + 40, n.y, 3)).toBe(0);
    w.reds.push({ id: 91001, x: n.x + 80, y: n.y, heading: Math.PI, patrol: true, job: 'forager', spd: 1, carry: 1 });
    run(w, 6);
    expect(w.redPher.sampleMax(n.x + 60, n.y, 30)).toBeGreaterThan(0.3);
    // a seeker that starts beside the trail turns onto it
    w.reds.push({ id: 91002, x: n.x + 90, y: n.y + 14, heading: -Math.PI / 2, patrol: true, job: 'forager', spd: 1 });
    const seeker = w.reds[w.reds.length - 1];
    const d0 = Math.abs(seeker.y - n.y);
    run(w, 2);
    expect(Math.abs(seeker.y - n.y)).toBeLessThan(d0 + 1);
  });

  function huntWorld(seed: number): World {
    const w = World.create(seed, 'normal');
    w.noSpider = true;
    w.spawnTimer = 1e9;
    w.stock = 300;
    w.terrain.surface.fill(Surface.Ground);
    w.terrain.speed.fill(1);
    w.addAnts(RED_NEST_MIN_ANTS);
    run(w, 2);
    for (const a of w.ants) { a.role = 'nurse'; a.state = 'nest'; a.nestKind = 'nurse'; }
    w.reds.splice(0, w.reds.length);
    w.redNest!.stock = 0;
    return w;
  }

  it('red foragers hunt a fly: the second touch kills it and it becomes carrion', () => {
    const w = huntWorld(9);
    const n = w.redNest!;
    const fly = w.placeFood('fly', n.x + 60, n.y)!;
    const f: RedAnt = { id: 92000, x: fly.x - 1, y: fly.y, heading: 0, patrol: true, job: 'forager', spd: 1, tf: fly.id };
    w.reds.push(f);
    run(w, 25);
    expect(fly.alive).toBeFalsy();
    expect(fly.corpseOf).toBe('fly');
  });

  it('a beetle kills the first red ant that touches it, and a group of them bring it down', () => {
    const w = huntWorld(10);
    const n = w.redNest!;
    const beetle = w.placeFood('beetle', n.x + 60, n.y)!;
    beetle.speedMul = 0.01; // (it hardly moves while the reds close in)
    for (let i = 0; i < 6; i++) {
      w.reds.push({ id: 92100 + i, x: beetle.x + (i - 2.5) * 0.4, y: beetle.y - 1.5 + i * 0.1, heading: 0, patrol: true, job: 'forager', spd: 1, tf: beetle.id });
    }
    run(w, 15);
    expect(w.redKilled).toBeGreaterThanOrEqual(1); // the beetle killed the first one that touched it
    expect(beetle.alive).toBeFalsy(); // the next touch (after the cooldown) killed the beetle
    expect(beetle.corpseOf).toBe('beetle');
  });

  it('red foragers chase a caterpillar too', () => {
    const w = huntWorld(11);
    const n = w.redNest!;
    const cat = w.placeFood('caterpillar', n.x + 60, n.y)!;
    w.reds.push({ id: 92200, x: cat.x - 1, y: cat.y, heading: 0, patrol: true, job: 'forager', spd: 1, tf: cat.id });
    run(w, 40);
    expect(cat.alive).toBeFalsy();
    expect(cat.corpseOf).toBe('caterpillar');
  });
});
