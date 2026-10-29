import { describe, expect, it } from 'vitest';
import { COLONY_FLOOR, FLOOR_HATCH_S, FOOD_PER_ANT, LIFESPAN_S, MAX_ANTS, NEST, STEP_S, WORLD_H, WORLD_W } from './constants';
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

  // Single-ant discovery rate (25 px away, 120 s, seeds 1-20) measured while tuning:
  //   before edge reflection (heading slid along walls): 13/20 (65 %)
  //   after edge reflection:                             16/20 (80 %)
  // 4 ants (beetle 30 px, seeds 1-60): 55/60 (92 %), and only 8/10 on seeds 1-10, so the colony tests use 8 ants.
  // Jitter and turn-rate tuning (0.6-4 rad jitter, 3-20 rad/s) did not move the rate beyond noise, so the spec values stay.
  it('8 wandering ants find food ~30 px away and deliver it to the nest in at least 9 of 10 seeds', () => {
    let success = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const w = flatWorld(seed);
      w.placeFood('beetle', NEST.x + 30, NEST.y);
      for (let i = 0; i < 8; i++) w.spawnAnt().lifespan = 1e6;
      run(w, 120);
      if (delivered(w, 8) > 0) success++;
    }
    expect(success).toBeGreaterThanOrEqual(9);
  }, 30_000);

  it('a single carried piece is added to stock when the ant reaches the nest', () => {
    const w = flatWorld(1);
    const f = w.placeFood('berry', NEST.x + 20, NEST.y)!;
    const a = w.spawnAnt();
    a.lifespan = 1e6;
    a.state = 'toFood';
    a.targetFood = f.id;
    run(w, 12); // shorter than FLOOR_HATCH_S, so no floor egg muddies the delivery accounting
    expect(delivered(w, 1)).toBe(3);
    expect(w.food).toHaveLength(0);
  });

  it('piece count reaching 0 removes the food, and a multi-piece item is carried on a second trip', () => {
    const w = flatWorld(2);
    const f = w.placeFood('fly', NEST.x + 20, NEST.y)!;
    const a = w.spawnAnt();
    a.lifespan = 1e6;
    a.state = 'toFood';
    a.targetFood = f.id;
    let deliveries = 0;
    let wasCarrying = false;
    for (let i = 0; i < 600; i++) {
      w.step(0.1);
      const carrying = a.carry > 0;
      if (wasCarrying && !carrying) deliveries++;
      wasCarrying = carrying;
      if (i === 150) expect(f.piecesLeft).toBeGreaterThanOrEqual(0);
    }
    expect(deliveries).toBe(2);
    expect(f.piecesLeft).toBe(0);
    expect(w.food).toHaveLength(0);
    expect(a.state).toBe('wander');
    expect(a.targetFood).toBeNull();
  });

  it('ants and food arrays keep their identity across a step with a death and a food removal', () => {
    const w = flatWorld(3);
    const ants = w.ants;
    const food = w.food;
    const f = w.placeFood('berry', 150, 100)!;
    const picker = w.spawnAnt();
    picker.x = f.x;
    picker.y = f.y;
    picker.state = 'toFood';
    picker.targetFood = f.id;
    picker.lifespan = 1e6;
    const doomed = w.spawnAnt();
    doomed.lifespan = 0.01;
    expect(ants).toHaveLength(2);
    w.step(STEP_S * 2);
    expect(w.ants).toBe(ants);
    expect(w.food).toBe(food);
    expect(ants).toHaveLength(1);
    expect(ants[0]).toBe(picker);
    expect(food).toHaveLength(0);
    expect(picker.state).toBe('carry');
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

  it('queen survives: a world that never started stays empty and keeps running 1000 s without throwing', () => {
    const w = World.create(7);
    expect(w.started).toBe(false);
    expect(() => {
      for (let i = 0; i < 2000; i++) w.step(0.5);
    }).not.toThrow();
    expect(w.ants).toHaveLength(0);
    expect(w.time).toBeGreaterThan(900);
  });

  it('queen survives: a started colony with zero ants and zero stock recovers to the floor', () => {
    const w = flatWorld(7);
    w.spawnAnt().lifespan = 0.01;
    run(w, 1);
    expect(w.started).toBe(true);
    expect(w.ants).toHaveLength(0);
    expect(w.stock).toBe(0);
    expect(() => run(w, 200)).not.toThrow();
    expect(w.ants).toHaveLength(COLONY_FLOOR);
  });

  describe('colony floor (queen keeps laying a few eggs)', () => {
    function startedEmpty(seed = 21): World {
      const w = flatWorld(seed);
      w.spawnAnt().lifespan = 0.01;
      run(w, 0.5);
      expect(w.ants).toHaveLength(0);
      expect(w.hatchProgress).toBeLessThan(1);
      w.hatchProgress = 0;
      return w;
    }

    it('spawnAnt marks the colony as started', () => {
      const w = World.create(1);
      expect(w.started).toBe(false);
      w.spawnAnt();
      expect(w.started).toBe(true);
    });

    it('hatches one ant after FLOOR_HATCH_S and five after about five times that, then stops', () => {
      expect(FLOOR_HATCH_S).toBe(15);
      expect(COLONY_FLOOR).toBe(5);
      const w = startedEmpty();
      run(w, FLOOR_HATCH_S - 1);
      expect(w.ants).toHaveLength(0);
      run(w, 2);
      expect(w.ants).toHaveLength(1);
      run(w, 15);
      expect(w.ants).toHaveLength(2);
      run(w, 15 * 3 + 1);
      expect(w.ants).toHaveLength(5);
      run(w, 150);
      expect(w.ants).toHaveLength(5);
      expect(w.hatchProgress).toBe(0);
    });

    it('does not run for a world that has not started', () => {
      const w = flatWorld(22);
      run(w, 100);
      expect(w.ants).toHaveLength(0);
      expect(w.hatchProgress).toBe(0);
    });

    it('respects MAX_ANTS', () => {
      const w = startedEmpty(23);
      for (let i = 0; i < MAX_ANTS; i++) w.spawnAnt();
      run(w, 60);
      expect(w.ants.length).toBeLessThanOrEqual(MAX_ANTS);
    });
  });

  it('dt of 3600 s is clamped and does not produce NaN positions', () => {
    const w = World.create(8);
    for (let i = 0; i < 5; i++) w.spawnAnt();
    w.placeFood('fly', NEST.x + 30, NEST.y);
    const t0 = w.time;
    const start = w.ants.map((a) => ({ x: a.x, y: a.y }));
    w.step(3600);
    expect(w.time - t0).toBeLessThanOrEqual(0.5 + 1e-6);
    expect(w.time - t0).toBeGreaterThan(0.4);
    w.ants.forEach((a, i) => {
      expect(Math.hypot(a.x - start[i].x, a.y - start[i].y)).toBeLessThanOrEqual(12 * 0.5 + 1);
    });
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

  // First-minute discovery (seeds 1-30, flat ground, one beetle 40 px from the nest at a fixed angle, ONE ant, 60 s).
  // The colony floor is switched off (started = false) so only the ant's own sensing/tether is measured.
  // Reviewer's 100-seed measurement at 40 px / 70 px: before sense 10, no tether: 1 ant 35 % / 10 %, 5 ants 95 % / 39 %.
  // After (sense 16 + tether, floor off): 1 ant 72 % / 25 %, 5 ants 100 % / 46 %; with the colony floor on, 1 ant 98 % / 42 %.
  // ("found" = some ant left wander within 60 s; this test counts actual deliveries, 13/30 before, and requires >= 15/30.)
  it('a single ant delivers food placed 40 px from the nest in at least half of 30 seeds within 60 s', () => {
    let success = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const w = flatWorld(seed);
      const ang = ((seed * 37) % 360) * (Math.PI / 180);
      w.placeFood('beetle', NEST.x + Math.cos(ang) * 40, NEST.y + Math.sin(ang) * 40);
      w.spawnAnt().lifespan = 1e6;
      w.started = false;
      run(w, 60);
      if (delivered(w, 1) > 0) success++;
    }
    expect(success).toBeGreaterThanOrEqual(15);
  }, 30_000);

  // Boldness: seeds 1-10, flat ground, 5 ants, no food, 40 s; mean distance from the nest of all ants over the
  // last 20 s (sampled every second). Measured with the tuned constants: 90.4 px (before tuning, tether 60 /
  // jitter 0.6, no outbound push: 46.2 px on this flat setup). Threshold 70 px = ~77 % of the measured mean.
  it('scouts are bold: with no food 5 ants average at least 70 px from the nest over seconds 20-40', () => {
    let sum = 0;
    let n = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const w = flatWorld(seed);
      for (let i = 0; i < 5; i++) w.spawnAnt().lifespan = 1e6;
      for (let sec = 1; sec <= 40; sec++) {
        run(w, 1);
        if (sec <= 20) continue;
        let m = 0;
        for (const a of w.ants) m += Math.hypot(a.x - NEST.x, a.y - NEST.y);
        sum += m / w.ants.length;
        n++;
      }
    }
    expect(sum / n).toBeGreaterThanOrEqual(70);
  }, 30_000);

  it('trail forms: pheromone along the food-nest line exceeds the sum 15 px off the line', () => {
    const w = flatWorld(9);
    const food = w.placeFood('beetle', NEST.x + 60, NEST.y);
    expect(food).not.toBeNull();
    for (let i = 0; i < 5; i++) {
      const a = w.spawnAnt();
      a.lifespan = 1e6;
    }
    // With the 6 s half-life the trail only lives while ants keep carrying (beetle is eaten up by ~35 s; 90 s
    // would measure an already evaporated trail). At 30 s measured: on-line sum ~59 vs 0 off the line.
    run(w, 30);
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
    let success = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const w = flatWorld(seed);
      const a = w.spawnAnt();
      a.lifespan = 0.5;
      run(w, 1);
      expect(w.ants).toHaveLength(0);
      expect(w.stock).toBe(0);
      w.placeFood('fly', NEST.x + 25, NEST.y);
      for (let i = 0; i < 8; i++) {
        const n = w.spawnAnt();
        n.lifespan = 1e6;
        expect(n.id).not.toBe(a.id);
      }
      run(w, 120);
      if (delivered(w, 8) > 0) success++;
    }
    expect(success).toBeGreaterThanOrEqual(9);
  });
});
