import { describe, expect, it } from 'vitest';
import {
  CARRY_SPEED_MUL, FOOD_PER_ANT, GNAW_S, HATCH_INTERVAL_S, MAX_ANTS, NEST, RESCUE_AFTER_S, STARTER_STOCK, STEP_S, WORLD_H, WORLD_W,
} from './constants';
import { FOOD_TABLE, type FoodItem } from './food';
import { Surface } from './terrain';
import { World } from './world';

/** World with an obstacle-free ground (speed 1 everywhere) and an empty larder (no starter stock, so nothing hatches by itself). */
function flatWorld(seed = 1): World {
  const w = World.create(seed);
  w.stock = 0;
  w.terrain.surface.fill(Surface.Ground);
  w.terrain.speed.fill(1);
  return w;
}

/**
 * Food delivered to the nest = stock plus the food spent on hatched ants (beyond `initial` ants).
 * Valid for flatWorld worlds (stock 0) in which no ant dies and the free rescue ant never triggers.
 * Ants inside the nest (hatchlings, unloading foragers) are part of `ants.length`, so the formula holds unchanged.
 */
function delivered(w: World, initial: number): number {
  return w.stock + (w.ants.length - initial) * FOOD_PER_ANT;
}

/**
 * A creature that is already dead: plain carrion with the meat of a beetle / fly (the placed beetle and fly are alive now
 * and cannot be gnawed until two ants have touched them; prey.test.ts covers that).
 */
function deadFood(w: World, kind: 'beetle' | 'fly', x: number, y: number): FoodItem | null {
  const f = w.placeFood('carrion', x, y);
  if (!f) return null;
  f.corpseOf = kind;
  f.piecesLeft = FOOD_TABLE[kind].pieces;
  return f;
}

/** A started colony (ants that live forever, wandering with no food in sight) on flat ground with the given stock. */
function startedColony(seed: number, stock: number, ants = 1): World {
  const w = flatWorld(seed);
  for (let i = 0; i < ants; i++) w.spawnAnt();
  w.stock = stock;
  return w;
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
  it('create starts with no ants, the starter stock and no hatching progress', () => {
    const w = World.create(5);
    expect(w.ants).toHaveLength(0);
    expect(STARTER_STOCK).toBe(10);
    expect(w.stock).toBe(STARTER_STOCK);
    expect(w.hatchProgress).toBe(0);
    expect(w.deliveryCount).toBe(0);
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
      deadFood(w, 'beetle', NEST.x + 30, NEST.y);
      for (let i = 0; i < 8; i++) w.spawnAnt();
      run(w, 120);
      if (delivered(w, 8) > 0) success++;
    }
    expect(success).toBeGreaterThanOrEqual(9);
  }, 30_000);

  it('every carried piece is added to stock when the ant reaches the nest (berry: 3 pieces of value 1)', () => {
    const w = flatWorld(1);
    const f = w.placeFood('berry', NEST.x + 20, NEST.y)!;
    const a = w.spawnAnt();
    a.state = 'toFood';
    a.targetFood = f.id;
    run(w, 40); // 3 trips with gnawing; delivered stock (3) stays below FOOD_PER_ANT, so nothing hatches
    expect(delivered(w, 1)).toBeCloseTo(3, 9);
    expect(w.food).toHaveLength(0);
    expect(w.deliveryCount).toBe(3);
  });

  it('piece count reaching 0 removes the food, and a multi-piece item is carried on repeated trips', () => {
    const w = flatWorld(2);
    const f = deadFood(w, 'fly', NEST.x + 20, NEST.y)!;
    const a = w.spawnAnt();
    a.state = 'toFood';
    a.targetFood = f.id;
    let deliveries = 0;
    let wasCarrying = false;
    // Every trip now ends with ~5 s of unloading inside the nest (6 trips ~ 75 s), so run 120 s instead of the former 60 s.
    for (let i = 0; i < 1200; i++) {
      w.step(0.1);
      const carrying = a.carry > 0;
      if (wasCarrying && !carrying) deliveries++;
      wasCarrying = carrying;
      if (i === 150) expect(f.piecesLeft).toBeGreaterThanOrEqual(0);
    }
    expect(deliveries).toBe(6);
    expect(w.deliveryCount).toBe(6);
    expect(f.piecesLeft).toBe(0);
    expect(w.food).toHaveLength(0);
    expect(a.state).toBe('wander');
    expect(a.targetFood).toBeNull();
  });

  it('ants and food arrays keep their identity across a step with a food removal', () => {
    const w = flatWorld(3);
    const ants = w.ants;
    const food = w.food;
    const f = w.placeFood('berry', 150, 100)!;
    f.piecesLeft = 1; // the last piece: taking it removes the item
    const picker = w.spawnAnt();
    picker.x = f.x;
    picker.y = f.y;
    picker.state = 'gnaw'; // finishing its bite on the last piece
    picker.timer = STEP_S;
    picker.targetFood = f.id;
    expect(ants).toHaveLength(1);
    w.step(STEP_S * 2);
    expect(w.ants).toBe(ants);
    expect(w.food).toBe(food);
    expect(ants).toHaveLength(1);
    expect(ants[0]).toBe(picker);
    expect(food).toHaveLength(0);
    expect(picker.state).toBe('carry');
  });

  it('a started colony with stock for exactly one ant hatches it, leaves stock 0 and spawns it at the nest', () => {
    const w = startedColony(4, FOOD_PER_ANT);
    run(w, HATCH_INTERVAL_S + 0.5);
    expect(w.ants).toHaveLength(2);
    expect(w.stock).toBe(0);
    const a = w.ants[1];
    expect(a.age).toBeLessThan(1);
    expect(a.state).toBe('nest'); // hatched ants spend HATCH_STAY_S underground first
    expect(a.nestKind).toBe('hatch');
  });

  it('ants never exceed MAX_ANTS (300 ants, stock 50: nothing hatches, stock untouched, progress resets to 0)', () => {
    const w = flatWorld(5);
    for (let i = 0; i < MAX_ANTS - 1; i++) w.spawnAnt();
    w.stock = 50;
    run(w, 3); // 299 ants: a cycle builds up so the later reset is observable
    expect(w.hatchProgress).toBeGreaterThan(2.5);
    w.spawnAnt(); // 300 ants
    run(w, 2 * HATCH_INTERVAL_S);
    expect(w.ants).toHaveLength(MAX_ANTS);
    expect(w.stock).toBe(50);
    expect(w.hatchProgress).toBe(0);
  });

  it('ants do not die of old age: after 800 s (past the old maximum lifespan) the ant is alive, age counts up and has no lifespan', () => {
    const w = flatWorld(6);
    const a = w.spawnAnt();
    run(w, 800, 0.5);
    expect(w.ants).toEqual([a]);
    expect(a.age).toBeGreaterThan(799);
    expect('lifespan' in a).toBe(false);
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

  it('spawnAnt marks the colony as started', () => {
    const w = World.create(1);
    expect(w.started).toBe(false);
    w.spawnAnt();
    expect(w.started).toBe(true);
  });

  it('queen survives: a started colony with zero ants and zero stock gets a free ant and keeps running without throwing', () => {
    const w = flatWorld(7);
    w.spawnAnt();
    w.ants.length = 0;
    run(w, 1);
    expect(w.started).toBe(true);
    expect(w.ants).toHaveLength(0);
    expect(w.stock).toBe(0);
    expect(() => run(w, 200)).not.toThrow();
    expect(w.ants.length).toBeGreaterThanOrEqual(1);
  });

  describe('hatching (one ant per HATCH_INTERVAL_S while the queen has FOOD_PER_ANT food)', () => {
    /** Steps in STEP_S increments and returns the colony size after every whole second (index 0 = at t=0). */
    function antsPerSecond(w: World, seconds: number): number[] {
      const out = [w.ants.length];
      for (let sec = 1; sec <= seconds; sec++) {
        for (let i = 0; i < 30; i++) w.step(STEP_S);
        out.push(w.ants.length);
      }
      return out;
    }

    it('constants: 5 food per ant, one hatch every 10 s', () => {
      expect(FOOD_PER_ANT).toBe(5);
      expect(HATCH_INTERVAL_S).toBe(10);
    });

    it('stock 10 and 1 ant: ant #2 hatches at 10 s, #3 at 20 s, stock ends 0, no 4th ant without food', () => {
      const w = startedColony(41, 2 * FOOD_PER_ANT);
      const n = antsPerSecond(w, 40);
      expect(n[9]).toBe(1);
      expect(n[10]).toBe(2); // at the 10 s mark (substep granularity 1/30 s, well within 0.1 s)
      expect(n[19]).toBe(2);
      expect(n[20]).toBe(3);
      expect(n[40]).toBe(3);
      expect(w.stock).toBe(0);
      expect(w.hatchProgress).toBe(0);
      expect(w.ants.map((a) => a.id)).toEqual([1, 2, 3]);
    });

    it('stock 4 (below FOOD_PER_ANT): nothing hatches in 60 s and hatchProgress stays 0', () => {
      const w = startedColony(42, FOOD_PER_ANT - 1);
      for (let sec = 0; sec < 60; sec++) {
        run(w, 1);
        expect(w.hatchProgress).toBe(0);
      }
      expect(w.ants).toHaveLength(1);
      expect(w.stock).toBe(FOOD_PER_ANT - 1);
    });

    it('stock 5: hatchFraction rises linearly to 1 and the ant hatches at the 10 s mark; stock below 5 resets the cycle', () => {
      const w = startedColony(43, FOOD_PER_ANT);
      expect(w.hatchFraction).toBe(0);
      for (let i = 0; i < 150; i++) w.step(STEP_S); // 5 s
      expect(w.hatchFraction).toBeCloseTo(0.5, 6);
      expect(w.hatchProgress).toBeCloseTo(5, 6);
      w.stock = FOOD_PER_ANT - 1; // food taken away mid-cycle
      w.step(STEP_S);
      expect(w.hatchProgress).toBe(0);
      expect(w.hatchFraction).toBe(0);
      expect(w.ants).toHaveLength(1);
      w.stock = FOOD_PER_ANT; // restart: the full 10 s are needed again
      let prev = 0;
      for (let i = 1; i < 300; i++) {
        w.step(STEP_S);
        expect(w.hatchFraction).toBeCloseTo(i / 300, 6);
        expect(w.hatchFraction).toBeGreaterThan(prev);
        prev = w.hatchFraction;
        expect(w.ants).toHaveLength(1);
      }
      w.step(STEP_S); // the 300th substep completes the cycle
      expect(w.ants).toHaveLength(2);
      expect(w.stock).toBe(0);
      expect(w.hatchProgress).toBe(0);
    });

    it('larvae = floor(stock / FOOD_PER_ANT), hatchFraction stays within [0, 1]', () => {
      const w = flatWorld(44);
      for (const [stock, larvae] of [[0, 0], [4, 0], [5, 1], [14, 2]] as const) {
        w.stock = stock;
        expect(w.larvae).toBe(larvae);
      }
      w.spawnAnt();
      w.stock = 100;
      for (let i = 0; i < 700; i++) {
        w.step(STEP_S);
        expect(w.hatchFraction).toBeGreaterThanOrEqual(0);
        expect(w.hatchFraction).toBeLessThanOrEqual(1);
      }
      w.hatchProgress = 123;
      expect(w.hatchFraction).toBe(1);
      w.hatchProgress = -4;
      expect(w.hatchFraction).toBe(0);
    });

    it('a big dt does not burst-hatch: one hatch per cycle even with a large stock', () => {
      const w = startedColony(45, 50);
      for (let i = 0; i < 40; i++) w.step(0.5); // 20 s of game time in coarse steps
      expect(w.ants).toHaveLength(3);
      expect(w.stock).toBe(40);
    });

    it('does not run for a world that has not started, even with the starter stock', () => {
      const w = flatWorld(46);
      w.stock = STARTER_STOCK;
      run(w, 100);
      expect(w.ants).toHaveLength(0);
      expect(w.stock).toBe(STARTER_STOCK);
      expect(w.hatchProgress).toBe(0);
    });
  });

  describe('rescue (a started colony with no ants and no food for an ant gets one free ant)', () => {
    function emptyStarted(seed: number): World {
      const w = flatWorld(seed);
      w.spawnAnt();
      w.ants.length = 0;
      expect(w.started).toBe(true);
      return w;
    }

    /** Steps until an ant exists (max 40 s) and returns the elapsed seconds. */
    function secondsUntilAnt(w: World): number {
      let t = 0;
      while (w.ants.length === 0 && t < 40) {
        w.step(STEP_S);
        t += STEP_S;
      }
      return t;
    }

    it('RESCUE_AFTER_S is 15', () => {
      expect(RESCUE_AFTER_S).toBe(15);
    });

    it('exactly one ant appears after 15 s (+-0.1), and again after another 15 s only if the colony is empty again', () => {
      const w = emptyStarted(51);
      let t = secondsUntilAnt(w);
      expect(Math.abs(t - RESCUE_AFTER_S)).toBeLessThan(0.1);
      expect(w.ants).toHaveLength(1);
      expect(w.stock).toBe(0);
      // A living ant means no further rescue, however long we wait.
      run(w, 40);
      expect(w.ants).toHaveLength(1);
      // Kill it: a fresh 15 s timer starts.
      w.ants.length = 0;
      t = secondsUntilAnt(w);
      expect(Math.abs(t - RESCUE_AFTER_S)).toBeLessThan(0.1);
      expect(w.ants).toHaveLength(1);
    });

    it('the timer resets when the condition breaks (enough stock for an ant)', () => {
      const w = emptyStarted(52);
      run(w, 10);
      w.stock = FOOD_PER_ANT; // hatching takes over; the rescue clock must restart from 0
      w.step(STEP_S);
      w.stock = 0;
      run(w, 10);
      expect(w.ants).toHaveLength(0); // only ~10 s since the reset, not 20
      run(w, 6);
      expect(w.ants).toHaveLength(1);
    });

    it('a colony with no ants but food for an ant hatches normally instead of getting a free one', () => {
      const w = emptyStarted(53);
      w.stock = FOOD_PER_ANT;
      run(w, HATCH_INTERVAL_S - 1);
      expect(w.ants).toHaveLength(0);
      run(w, 2);
      expect(w.ants).toHaveLength(1);
      expect(w.stock).toBe(0);
    });

    it('does nothing for a world that has not started', () => {
      const w = flatWorld(54);
      run(w, 60);
      expect(w.ants).toHaveLength(0);
    });
  });

  it('dt of 3600 s is clamped and does not produce NaN positions', () => {
    const w = World.create(8);
    for (let i = 0; i < 5; i++) w.spawnAnt();
    deadFood(w, 'fly', NEST.x + 30, NEST.y);
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
  // Hatching/rescue are switched off (stock 0, started = false) so only the ant's own sensing/tether is measured.
  // Reviewer's 100-seed measurement at 40 px / 70 px: before sense 10, no tether: 1 ant 35 % / 10 %, 5 ants 95 % / 39 %.
  // After (sense 16 + tether, floor off): 1 ant 72 % / 25 %, 5 ants 100 % / 46 %; with the old colony floor on, 1 ant 98 % / 42 %.
  // ("found" = some ant left wander within 60 s; this test counts actual deliveries, 13/30 before, and requires >= 15/30.)
  it('a single ant delivers food placed 40 px from the nest in at least half of 30 seeds within 60 s', () => {
    let success = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const w = flatWorld(seed);
      const ang = ((seed * 37) % 360) * (Math.PI / 180);
      deadFood(w, 'beetle', NEST.x + Math.cos(ang) * 40, NEST.y + Math.sin(ang) * 40);
      w.spawnAnt();
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
      for (let i = 0; i < 5; i++) w.spawnAnt();
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
    const food = deadFood(w, 'beetle', NEST.x + 60, NEST.y);
    expect(food).not.toBeNull();
    for (let i = 0; i < 5; i++) w.spawnAnt();
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
    deadFood(w, 'beetle', NEST.x + 50, NEST.y);
    for (let i = 0; i < 5; i++) w.spawnAnt();
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
    const f = deadFood(w, 'fly', 150, 100)!;
    expect(f.piecesLeft).toBe(6);
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
      w.ants.length = 0;
      run(w, 1);
      expect(w.ants).toHaveLength(0);
      expect(w.stock).toBe(0);
      deadFood(w, 'fly', NEST.x + 25, NEST.y);
      for (let i = 0; i < 8; i++) {
        const n = w.spawnAnt();
        expect(n.id).not.toBe(a.id);
      }
      run(w, 120);
      if (delivered(w, 8) > 0) success++;
    }
    expect(success).toBeGreaterThanOrEqual(9);
  });

  describe('gnawing (an ant at its food bites for ~GNAW_S seconds before it takes a piece)', () => {
    /** An ant standing exactly on the food, already heading for it. */
    function antAt(w: World, f: { id: number; x: number; y: number }): ReturnType<World['spawnAnt']> {
      const a = w.spawnAnt();
      a.x = f.x;
      a.y = f.y;
      a.state = 'toFood';
      a.targetFood = f.id;
      return a;
    }

    it('constants: GNAW_S is 4 s, loaded ants walk at 0.8x speed; new ants have timer 0', () => {
      expect(GNAW_S).toBe(4);
      expect(CARRY_SPEED_MUL).toBe(0.8);
      expect(flatWorld(1).spawnAnt().timer).toBe(0);
    });

    it('an ant standing at a berry takes its piece no earlier than 3 s after arriving, about 4 s on average (20 ants)', () => {
      const w = flatWorld(21);
      const f = w.placeFood('carrion', 150, 100)!; // 24 pieces: enough for all 20 ants
      const ants = Array.from({ length: 20 }, () => antAt(w, f));
      const tCarry = new Map<number, number>();
      for (let i = 1; i <= 8 * 30; i++) {
        w.step(STEP_S);
        for (const a of ants) if (a.state === 'carry' && !tCarry.has(a.id)) tCarry.set(a.id, i * STEP_S);
      }
      expect(tCarry.size).toBe(20);
      const ts = [...tCarry.values()];
      // GNAW_S * (0.75 + 0.5 * r) is in [3, 5)
      expect(Math.min(...ts)).toBeGreaterThanOrEqual(3);
      expect(Math.max(...ts)).toBeLessThanOrEqual(5 + 0.1);
      const mean = ts.reduce((s, t) => s + t, 0) / ts.length;
      expect(mean).toBeGreaterThan(3.5);
      expect(mean).toBeLessThan(4.5);
      expect(new Set(ts).size).toBeGreaterThan(5); // durations differ per ant
    });

    it('the piece is taken only when the bite ends: piecesLeft--, carry = value, state carry, timer 0', () => {
      const w = flatWorld(22);
      const f = deadFood(w, 'beetle', 150, 100)!;
      const a = antAt(w, f);
      w.step(STEP_S);
      expect(a.state).toBe('gnaw');
      expect(a.timer).toBeGreaterThan(2.9);
      expect(a.timer).toBeLessThanOrEqual(5);
      expect(a.carry).toBe(0);
      expect(f.piecesLeft).toBe(FOOD_TABLE.beetle.pieces);
      a.timer = STEP_S;
      w.step(STEP_S);
      expect(a.state).toBe('carry');
      expect(a.carry).toBeCloseTo(FOOD_TABLE.beetle.value, 9);
      expect(a.timer).toBe(0);
      expect(f.piecesLeft).toBe(FOOD_TABLE.beetle.pieces - 1);
    });

    it('a gnawing ant does not move or turn, and its timer counts down in seconds', () => {
      const w = flatWorld(23);
      const f = deadFood(w, 'beetle', 150, 100)!;
      const a = antAt(w, f);
      a.x -= 1; // within pickup distance, but not exactly on the food
      a.heading = 1.234;
      w.step(STEP_S); // arrives and starts gnawing
      expect(a.state).toBe('gnaw');
      const { x, y, heading } = a;
      const t0 = a.timer;
      for (let i = 0; i < 60; i++) w.step(STEP_S); // 2 s, still below the 3 s minimum bite
      expect(a.state).toBe('gnaw');
      expect(a.x).toBe(x);
      expect(a.y).toBe(y);
      expect(a.heading).toBe(heading);
      expect(a.timer).toBeCloseTo(t0 - 2, 6);
    });

    it('an ant walking to food stops and starts gnawing when it arrives', () => {
      const w = flatWorld(24);
      const f = deadFood(w, 'beetle', 150, 100)!;
      const a = antAt(w, f);
      a.x = f.x - 15;
      a.heading = 0;
      let i = 0;
      while (a.state === 'toFood' && i++ < 300) w.step(STEP_S);
      expect(a.state).toBe('gnaw');
      expect(a.targetFood).toBe(f.id);
      expect(Math.hypot(a.x - f.x, a.y - f.y)).toBeLessThan(2);
      expect(f.piecesLeft).toBe(FOOD_TABLE.beetle.pieces);
    });

    it('food removed while gnawing sends the ant to wander (no piece, no carry)', () => {
      const w = flatWorld(25);
      const f = deadFood(w, 'beetle', 150, 100)!;
      const ants = [antAt(w, f), antAt(w, f)];
      run(w, 1);
      expect(ants.every((a) => a.state === 'gnaw')).toBe(true);
      w.removeFood(f.id);
      for (const a of ants) {
        expect(a.state).toBe('wander');
        expect(a.targetFood).toBeNull();
        expect(a.timer).toBe(0);
        expect(a.carry).toBe(0);
      }
      run(w, 6);
      for (const a of ants) expect(a.state).not.toBe('carry');
    });

    it('food that vanishes from the array while gnawing also sends the ant to wander on the next step', () => {
      const w = flatWorld(26);
      const f = deadFood(w, 'beetle', 150, 100)!;
      const a = antAt(w, f);
      run(w, 1);
      expect(a.state).toBe('gnaw');
      w.food.length = 0; // e.g. a save edited behind the world's back
      w.step(STEP_S);
      expect(a.state).toBe('wander');
      expect(a.carry).toBe(0);
      expect(a.timer).toBe(0);
    });

    it('the last piece taken mid-gnaw sends the other gnawers to wander; they get nothing', () => {
      const w = flatWorld(27);
      const f = deadFood(w, 'beetle', 150, 100)!;
      f.piecesLeft = 1;
      const [first, second, third] = [antAt(w, f), antAt(w, f), antAt(w, f)];
      w.step(STEP_S); // all three start gnawing
      expect([first.state, second.state, third.state]).toEqual(['gnaw', 'gnaw', 'gnaw']);
      first.timer = STEP_S;
      second.timer = 3;
      third.timer = 3;
      w.step(STEP_S);
      expect(first.state).toBe('carry');
      expect(first.carry).toBeCloseTo(FOOD_TABLE.beetle.value, 9);
      expect(w.food).toHaveLength(0);
      w.step(STEP_S);
      for (const a of [second, third]) {
        expect(a.state).toBe('wander');
        expect(a.targetFood).toBeNull();
        expect(a.timer).toBe(0);
        expect(a.carry).toBe(0);
      }
      expect(f.piecesLeft).toBe(0);
    });

    it('a loaded ant (carry) moves at 0.8x the speed of an unloaded one', () => {
      const dist = (state: 'toFood' | 'carry'): number => {
        const w = flatWorld(28);
        const far = w.placeFood('carrion', 280, 150)!; // far away: the ant keeps walking toward it
        const a = w.spawnAnt();
        a.x = 200;
        a.y = 150;
        a.state = state;
        a.targetFood = far.id;
        if (state === 'carry') a.carry = 1;
        a.heading = state === 'carry' ? Math.PI : 0; // straight at its goal (the nest is to the west)
        const x0 = a.x;
        const y0 = a.y;
        let len = 0;
        let px = x0;
        let py = y0;
        for (let i = 0; i < 60; i++) { // 2 s
          w.step(STEP_S);
          len += Math.hypot(a.x - px, a.y - py);
          px = a.x;
          py = a.y;
        }
        expect(a.state).toBe(state);
        return len;
      };
      const free = dist('toFood');
      const loaded = dist('carry');
      expect(free).toBeCloseTo(24, 0); // 12 px/s * 2 s
      expect(loaded / free).toBeCloseTo(CARRY_SPEED_MUL, 2);
    });
  });
});
