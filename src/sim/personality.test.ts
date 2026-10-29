import { describe, expect, it } from 'vitest';
import {
  CURIOSITY_MAX, CURIOSITY_MIN, HATCH_INTERVAL_S, MAX_PHEROMONE, NEST, SPEED_MUL_MAX, SPEED_MUL_MIN, STEP_S,
  STUBBORNNESS_MAX, STUBBORNNESS_MIN, WORLD_H, WORLD_W,
} from './constants';
import { validateSave, worldFromSave, worldToSave, type SaveV1 } from './serialize';
import { Surface } from './terrain';
import { World, type Ant } from './world';

const EXTRA = { introDone: true, camera: { x: 0, y: 0, zoom: 1 } };

/** Obstacle-free ground (speed 1 everywhere) and an empty larder (nothing hatches, no free rescue ant while ants exist). */
function flatWorld(seed = 1): World {
  const w = World.create(seed);
  w.stock = 0;
  w.terrain.surface.fill(Surface.Ground);
  w.terrain.speed.fill(1);
  return w;
}

function run(w: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / STEP_S); i++) w.step(STEP_S);
}

/** A carrying ant of average personality at (x, y), heading for the nest. */
function carrier(w: World, x: number, y: number, curiosity = 1): Ant {
  const a = w.spawnAnt();
  w.started = false;
  a.x = x;
  a.y = y;
  a.state = 'carry';
  a.carry = 1;
  a.speedMul = 1;
  a.curiosity = curiosity;
  a.stubbornness = 1;
  a.heading = Math.atan2(NEST.y - y, NEST.x - x);
  return a;
}

describe('ant personalities', () => {
  it('every new ant draws speedMul / curiosity / stubbornness within its range, and they differ between ants', () => {
    const w = flatWorld(11);
    const ants = Array.from({ length: 200 }, () => w.spawnAnt());
    for (const a of ants) {
      expect(a.speedMul).toBeGreaterThanOrEqual(SPEED_MUL_MIN);
      expect(a.speedMul).toBeLessThanOrEqual(SPEED_MUL_MAX);
      expect(a.curiosity).toBeGreaterThanOrEqual(CURIOSITY_MIN);
      expect(a.curiosity).toBeLessThanOrEqual(CURIOSITY_MAX);
      expect(a.stubbornness).toBeGreaterThanOrEqual(STUBBORNNESS_MIN);
      expect(a.stubbornness).toBeLessThanOrEqual(STUBBORNNESS_MAX);
    }
    for (const key of ['speedMul', 'curiosity', 'stubbornness'] as const) {
      expect(new Set(ants.map((a) => a[key])).size).toBeGreaterThan(150);
    }
    const mean = (k: 'speedMul' | 'curiosity' | 'stubbornness') => ants.reduce((s, a) => s + a[k], 0) / ants.length;
    expect(mean('speedMul')).toBeGreaterThan(0.97);
    expect(mean('speedMul')).toBeLessThan(1.03);
    expect(mean('curiosity')).toBeGreaterThan(1.0);
    expect(mean('curiosity')).toBeLessThan(1.2);
  });

  it('the ranges are the agreed ones', () => {
    expect([SPEED_MUL_MIN, SPEED_MUL_MAX]).toEqual([0.88, 1.12]);
    expect([CURIOSITY_MIN, CURIOSITY_MAX]).toEqual([0.6, 1.6]);
    expect([STUBBORNNESS_MIN, STUBBORNNESS_MAX]).toEqual([0.5, 1.5]);
  });

  it('a faster ant covers more ground (speedMul scales the walking speed)', () => {
    const dist = (mul: number): number => {
      const w = flatWorld(12);
      const a = w.spawnAnt();
      w.started = false;
      a.x = 160;
      a.y = 100;
      a.age = 1000;
      a.speedMul = mul;
      a.curiosity = 1;
      let len = 0;
      let px = a.x;
      let py = a.y;
      for (let i = 0; i < 90; i++) {
        w.step(STEP_S);
        len += Math.hypot(a.x - px, a.y - py);
        px = a.x;
        py = a.y;
      }
      return len;
    };
    expect(dist(1.12) / dist(0.88)).toBeCloseTo(1.12 / 0.88, 1);
  });

  it('traits survive a save round trip (JSON), transient state does not get saved', () => {
    const w = flatWorld(13);
    for (let i = 0; i < 6; i++) w.spawnAnt();
    const a = w.ants[0];
    a.strayT = 3;
    a.strayH = 1;
    a.lostT = 2;
    a.lostH = 2;
    a.weave = 0.3;
    const s = JSON.parse(JSON.stringify(worldToSave(w, EXTRA))) as SaveV1;
    for (const sa of s.ants) {
      expect(sa).not.toHaveProperty('strayT');
      expect(sa).not.toHaveProperty('strayH');
      expect(sa).not.toHaveProperty('lostT');
      expect(sa).not.toHaveProperty('lostH');
      expect(sa).not.toHaveProperty('weave');
    }
    const r = worldFromSave(s);
    r.ants.forEach((ra, i) => {
      expect(ra.speedMul).toBe(w.ants[i].speedMul);
      expect(ra.curiosity).toBe(w.ants[i].curiosity);
      expect(ra.stubbornness).toBe(w.ants[i].stubbornness);
      expect(ra.strayT).toBeUndefined();
    });
  });

  it('ants from an old save (no traits) load with the neutral 1.0', () => {
    const w = flatWorld(14);
    for (let i = 0; i < 3; i++) w.spawnAnt();
    const s = JSON.parse(JSON.stringify(worldToSave(w, EXTRA))) as SaveV1;
    for (const a of s.ants) {
      delete a.speedMul;
      delete a.curiosity;
      delete a.stubbornness;
    }
    expect(validateSave(s)).not.toBeNull();
    const r = worldFromSave(s);
    for (const a of r.ants) {
      expect(a.speedMul).toBe(1);
      expect(a.curiosity).toBe(1);
      expect(a.stubbornness).toBe(1);
    }
  });

  it('validateSave range-checks the traits (0.3 to 3) and rejects non-numbers', () => {
    const w = flatWorld(15);
    w.spawnAnt();
    const s = JSON.parse(JSON.stringify(worldToSave(w, EXTRA))) as SaveV1;
    for (const key of ['speedMul', 'curiosity', 'stubbornness'] as const) {
      for (const ok of [0.3, 1, 3]) {
        expect(validateSave({ ...s, ants: [{ ...s.ants[0], [key]: ok }] }), `${key}=${ok}`).not.toBeNull();
      }
      for (const bad of [0.29, 3.01, 0, -1, NaN, Infinity, '1']) {
        expect(validateSave({ ...s, ants: [{ ...s.ants[0], [key]: bad }] }), `${key}=${String(bad)}`).toBeNull();
      }
    }
  });
});

describe('straying off a trail', () => {
  /** Counts distraction episodes (strayT rises from 0) per ant while a uniform, permanently fresh trail pulls every ant. */
  function strayEpisodes(seed: number, ants: number, seconds: number, curiosity: number, stubbornness: number) {
    const w = flatWorld(seed);
    const list: Ant[] = [];
    for (let i = 0; i < ants; i++) {
      const a = w.spawnAnt();
      a.age = 1000;
      a.x = 40 + (i % 8) * 30;
      a.y = 40 + Math.floor(i / 8) * 20;
      a.curiosity = curiosity;
      a.stubbornness = stubbornness;
      a.speedMul = 1;
      list.push(a);
    }
    w.started = false;
    const starts: number[] = list.map(() => 0);
    const open: (number | null)[] = list.map(() => null);
    const prev: number[] = list.map(() => 0);
    const durations: number[] = [];
    for (let i = 0; i < Math.round(seconds / STEP_S); i++) {
      w.pher.data.fill(MAX_PHEROMONE);
      w.step(STEP_S);
      list.forEach((a, k) => {
        const on = (a.strayT ?? 0) > 0;
        const fresh = on && (a.strayT as number) > prev[k]; // strayT only rises when a new distraction starts
        prev[k] = a.strayT ?? 0;
        if (open[k] !== null && fresh) {
          durations.push(w.time - STEP_S - (open[k] as number)); // a new one began the very step the old one ended
          open[k] = null;
        }
        if (on && open[k] === null) {
          open[k] = w.time;
          starts[k]++;
          expect(a.strayT).toBeGreaterThanOrEqual(2 - 1e-6);
          expect(a.strayT).toBeLessThanOrEqual(6 + 1e-6);
        } else if (!on && open[k] !== null) {
          durations.push(w.time - (open[k] as number));
          open[k] = null;
        }
      });
    }
    return { starts, durations };
  }

  it('a pulled wanderer (curiosity 1, stubbornness 1) is distracted about once per 12 s: 3.3-6.5 times in 60 s on average', () => {
    const { starts } = strayEpisodes(21, 40, 60, 1, 1);
    const mean = starts.reduce((s, v) => s + v, 0) / starts.length;
    // Expected cycle: 1 / (0.004 * 30) = 8.3 s pulled + 4 s distracted -> ~4.9 per minute.
    expect(mean).toBeGreaterThan(3.3);
    expect(mean).toBeLessThan(6.5);
  });

  it('curious ants stray more than stubborn ones', () => {
    const curious = strayEpisodes(22, 40, 60, 1.6, 0.5).starts.reduce((s, v) => s + v, 0);
    const stubborn = strayEpisodes(22, 40, 60, 0.6, 1.5).starts.reduce((s, v) => s + v, 0);
    expect(curious).toBeGreaterThan(stubborn * 1.5);
  });

  it('every distraction lasts 2 to 6 s and then the ant is pulled by the trail again (and can stray again)', () => {
    const { starts, durations } = strayEpisodes(23, 30, 90, 1, 1);
    expect(durations.length).toBeGreaterThan(50);
    for (const d of durations) {
      expect(d).toBeGreaterThanOrEqual(2 - 0.05);
      expect(d).toBeLessThanOrEqual(6 + 0.05);
    }
    expect(starts.filter((n) => n >= 2).length).toBeGreaterThan(20); // resumes following and gets distracted anew
    const mean = durations.reduce((s, v) => s + v, 0) / durations.length;
    expect(mean).toBeGreaterThan(3.5);
    expect(mean).toBeLessThan(4.5);
  });

  it('a wanderer without any trail never strays (no pull, no distraction)', () => {
    const w = flatWorld(24);
    for (let i = 0; i < 20; i++) {
      const a = w.spawnAnt();
      a.age = 1000;
      a.curiosity = 1.6;
      a.stubbornness = 0.5;
    }
    w.started = false;
    for (let i = 0; i < 900; i++) {
      w.step(STEP_S);
      for (const a of w.ants) expect(a.strayT ?? 0).toBe(0);
    }
  });

  it('a distracted ant ignores a strong trail for its strayT seconds, then follows it again', () => {
    const arrange = (strayT: number) => {
      const w = flatWorld(25);
      // A strong trail runs along the north side of the ant's path (y 90-97), the whole way east.
      for (let y = 90; y <= 97; y++) for (let x = 150; x < WORLD_W; x++) w.pher.data[y * w.pher.w + x] = MAX_PHEROMONE;
      const a = w.spawnAnt();
      w.started = false;
      a.x = 160;
      a.y = 100;
      a.heading = 0;
      a.age = 1000;
      a.speedMul = 1;
      a.curiosity = 0.6;
      a.stubbornness = 1.5;
      if (strayT > 0) {
        a.strayT = strayT;
        a.strayH = 0;
      }
      return { w, a };
    };
    const free = arrange(0);
    run(free.w, 1);
    expect(free.a.y).toBeLessThan(98.5); // pulled north by the trail

    const distracted = arrange(1);
    run(distracted.w, 0.9);
    expect(distracted.a.strayT ?? 0).toBeGreaterThan(0);
    expect(distracted.a.y).toBeGreaterThan(99); // the free ant was at < 98.5 after 1 s
    run(distracted.w, 0.3); // strayT expired at 1 s: the trail pulls again
    expect(distracted.a.strayT ?? 0).toBe(0);
    const yAfter = distracted.a.y;
    run(distracted.w, 1.5);
    expect(distracted.a.y).toBeLessThan(yAfter - 1);
  });
});

describe('returning carriers: weave and getting lost', () => {
  it('the path of a carrier is wavy: lateral deviation from the straight line has std >= 1.5 px over a 40 px leg (20 seeds)', () => {
    const stds: number[] = [];
    for (let seed = 1; seed <= 20; seed++) {
      const w = flatWorld(seed);
      const a = carrier(w, NEST.x + 46, NEST.y);
      const dev: number[] = [];
      for (let i = 0; i < 600 && a.state === 'carry'; i++) {
        w.step(STEP_S);
        if (a.state === 'carry') dev.push(a.y - NEST.y);
      }
      expect(dev.length).toBeGreaterThan(100);
      const m = dev.reduce((s, v) => s + v, 0) / dev.length;
      stds.push(Math.sqrt(dev.reduce((s, v) => s + (v - m) ** 2, 0) / dev.length));
    }
    const mean = stds.reduce((s, v) => s + v, 0) / stds.length;
    expect(mean).toBeGreaterThanOrEqual(1.5);
    expect(stds.filter((s) => s >= 0.8).length).toBeGreaterThanOrEqual(15); // most trips are visibly wavy, not just a few
  });

  it('a carrier with curiosity 1.6 weaves more than one with 0.6', () => {
    const spread = (curiosity: number): number => {
      let sum = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const w = flatWorld(seed);
        const a = carrier(w, NEST.x + 46, NEST.y, curiosity);
        let s2 = 0;
        let n = 0;
        for (let i = 0; i < 600 && a.state === 'carry'; i++) {
          w.step(STEP_S);
          s2 += (a.y - NEST.y) ** 2;
          n++;
        }
        sum += Math.sqrt(s2 / n);
      }
      return sum / 20;
    };
    expect(spread(1.6)).toBeGreaterThan(spread(0.6));
  });

  it('all carriers still deliver: 20 seeds x 5 carriers from far away on flat ground, within 120 s', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const w = flatWorld(seed);
      const carriers = [0, 1, 2, 3, 4].map((i) => carrier(w, 120 + i * 40, 30 + i * 30, 0.6 + i * 0.25));
      run(w, 120);
      expect(w.deliveryCount, `seed ${seed}`).toBe(5);
      for (const a of carriers) expect(a.carry, `seed ${seed}`).toBe(0);
    }
  }, 60_000);

  it('a carrier starting at the very edge of the world delivers too (reflection + weave)', () => {
    for (const [x, y] of [[WORLD_W - 1, WORLD_H - 1], [WORLD_W - 1, 1], [1, 1], [300, 100]]) {
      const w = flatWorld(7);
      carrier(w, x, y, 1.6);
      run(w, 120);
      expect(w.deliveryCount).toBe(1);
    }
  });

  it('getting lost: episodes happen, last 1.5-3 s, end, and the carrier then homes in on the nest', () => {
    const w = flatWorld(31);
    const cs = Array.from({ length: 60 }, (_, i) => carrier(w, 240 + (i % 6) * 8, 20 + i * 2.5, 1));
    const open: (number | null)[] = cs.map(() => null);
    const durations: number[] = [];
    let episodes = 0;
    for (let i = 0; i < Math.round(30 / STEP_S); i++) {
      w.step(STEP_S);
      cs.forEach((a, k) => {
        const on = (a.lostT ?? 0) > 0;
        if (on && open[k] === null) {
          open[k] = w.time;
          episodes++;
          expect(a.lostT).toBeGreaterThanOrEqual(1.5 - 1e-6);
          expect(a.lostT).toBeLessThanOrEqual(3 + 1e-6);
        } else if (!on && open[k] !== null) {
          durations.push(w.time - (open[k] as number));
          open[k] = null;
        }
      });
    }
    // 60 carriers * ~25 s each * 0.01 / s ~ 15 expected.
    expect(episodes).toBeGreaterThanOrEqual(5);
    expect(durations.length).toBeGreaterThanOrEqual(episodes - 3); // they end (a few may still be running at 30 s)
    for (const d of durations) {
      expect(d).toBeGreaterThanOrEqual(1.5 - 0.05);
      expect(d).toBeLessThanOrEqual(3 + 0.05);
    }
    run(w, 150);
    expect(w.deliveryCount).toBe(60);
  }, 30_000);

  it('a lost carrier ignores the nest direction while lost (it walks along lostH)', () => {
    const w = flatWorld(32);
    const a = carrier(w, 200, 150);
    a.lostT = 2;
    a.lostH = Math.PI / 2; // straight south, nest is due west
    a.curiosity = 0.6;
    run(w, 1.5);
    expect(a.y).toBeGreaterThan(150 + 6);
    expect(a.x).toBeGreaterThan(190);
    run(w, 0.8); // lostT expired
    expect(a.lostT ?? 0).toBe(0);
  });

  it('an arrived carrier clears its lost state on delivery', () => {
    const w = flatWorld(33);
    const a = carrier(w, NEST.x + 3, NEST.y);
    a.lostT = 0.01;
    a.lostH = 0;
    run(w, 3);
    expect(a.state).toBe('nest');
    expect(a.lostT).toBeUndefined();
  });
});

describe('approaching food', () => {
  it('an ant walking to food takes a slightly curved path (not a ruler line) and still arrives', () => {
    let totalDev = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const w = flatWorld(seed);
      const f = w.placeFood('carrion', NEST.x + 80, NEST.y)!;
      const a = w.spawnAnt();
      w.started = false;
      a.x = NEST.x;
      a.y = NEST.y;
      a.speedMul = 1;
      a.curiosity = 1;
      a.state = 'toFood';
      a.targetFood = f.id;
      a.heading = 0;
      let dev = 0;
      let n = 0;
      for (let i = 0; i < 600 && a.state === 'toFood'; i++) {
        w.step(STEP_S);
        dev += (a.y - NEST.y) ** 2;
        n++;
      }
      expect(a.state, `seed ${seed}`).toBe('gnaw');
      totalDev += Math.sqrt(dev / n);
    }
    expect(totalDev / 20).toBeGreaterThan(0.5);
  });
});

describe('prey speed variation', () => {
  it('each placed beetle / caterpillar gets its own speedMul within 1 +- 15 %', () => {
    const w = flatWorld(41);
    const muls: number[] = [];
    for (let i = 0; i < 60; i++) {
      const f = w.placeFood(i % 2 ? 'beetle' : 'caterpillar', 100 + (i % 10) * 15, 60 + Math.floor(i / 10) * 15)!;
      expect(f.speedMul).toBeGreaterThanOrEqual(0.85);
      expect(f.speedMul).toBeLessThanOrEqual(1.15);
      muls.push(f.speedMul as number);
    }
    expect(new Set(muls).size).toBeGreaterThan(50);
  });

  it('a faster beetle covers proportionally more ground (same seed, same pauses)', () => {
    const dist = (mul: number): number => {
      const w = flatWorld(42);
      const f = w.placeFood('beetle', 200, 100)!;
      f.speedMul = mul;
      f.heading = 0;
      let len = 0;
      let px = f.x;
      let py = f.y;
      for (let i = 0; i < 300; i++) {
        w.step(STEP_S);
        len += Math.hypot(f.x - px, f.y - py);
        px = f.x;
        py = f.y;
      }
      return len;
    };
    expect(dist(1.15) / dist(0.85)).toBeCloseTo(1.15 / 0.85, 1);
  });

  it('speedMul of a creature is saved and restored; old saves without it load as absent (= 1)', () => {
    const w = flatWorld(43);
    const f = w.placeFood('beetle', 150, 100)!;
    f.speedMul = 1.07;
    const s = JSON.parse(JSON.stringify(worldToSave(w, EXTRA))) as SaveV1;
    expect(s.food[0].speedMul).toBe(1.07);
    expect(worldFromSave(s).food[0].speedMul).toBe(1.07);
    delete s.food[0].speedMul;
    expect(validateSave(s)).not.toBeNull();
    expect(worldFromSave(s).food[0].speedMul).toBeUndefined();
    for (const bad of [0.2, 3.5, NaN, '1']) {
      expect(validateSave({ ...s, food: [{ ...s.food[0], speedMul: bad }] })).toBeNull();
    }
  });
});

describe('hatch interval jitter', () => {
  /** Seconds between consecutive hatches while the larder stays full. */
  function hatchGaps(w: World, seconds: number): number[] {
    const times: number[] = [];
    let n = w.ants.length;
    for (let i = 0; i < Math.round(seconds / STEP_S); i++) {
      w.step(STEP_S);
      if (w.ants.length > n) {
        times.push(w.time);
        n = w.ants.length;
      }
    }
    return times.map((t, i) => t - (i ? times[i - 1] : 0));
  }

  it('each cycle lasts interval * (0.8 .. 1.2): mean 10 s +- 1, min >= 8, max <= 12 (+ one substep)', () => {
    const w = flatWorld(51);
    w.spawnAnt();
    w.stock = 500; // 100 larvae; one queen: nominal cycle 10 s
    const gaps = hatchGaps(w, 1000);
    expect(gaps.length).toBeGreaterThan(80);
    const mean = gaps.reduce((s, v) => s + v, 0) / gaps.length;
    expect(HATCH_INTERVAL_S).toBe(10);
    expect(mean).toBeGreaterThan(9);
    expect(mean).toBeLessThan(11);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(8 - 1e-6);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(12 + STEP_S + 1e-6);
    const sd = Math.sqrt(gaps.reduce((s, v) => s + (v - mean) ** 2, 0) / gaps.length);
    expect(sd).toBeGreaterThan(0.8); // uniform over 4 s has std 1.15: clearly not a fixed 10 s
  }, 60_000);

  it('hatchFraction stays in [0, 1] and restarts at every new (jittered) cycle', () => {
    const w = flatWorld(52);
    w.spawnAnt();
    w.stock = 20;
    let prev = 0;
    let resets = 0;
    for (let i = 0; i < 700; i++) {
      w.step(STEP_S);
      expect(w.hatchFraction).toBeGreaterThanOrEqual(0);
      expect(w.hatchFraction).toBeLessThanOrEqual(1);
      if (w.hatchFraction < prev) resets++;
      prev = w.hatchFraction;
    }
    expect(resets).toBeGreaterThanOrEqual(1);
  });

  it('with more queens the jittered cycle shrinks in proportion (3 queens: ~3.3 s)', () => {
    const w = flatWorld(53);
    w.spawnAnt();
    w.stock = 500;
    w.totalDelivered = 200;
    expect(w.queens).toBe(3);
    const gaps = hatchGaps(w, 200);
    const mean = gaps.reduce((s, v) => s + v, 0) / gaps.length;
    expect(mean).toBeGreaterThan(3.0);
    expect(mean).toBeLessThan(3.7);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual((10 / 3) * 0.8 - 1e-6);
  });
});

describe('the first minute is not hurt by the variation (regression thresholds)', () => {
  /** Share (%) of 100 real-terrain seeds in which ONE ant finds a berry `dist` px from the nest within 60 s. */
  function discoveryPercent(dist: number): number {
    let found = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const w = World.create(seed);
      w.stock = 0;
      const ang = ((seed * 37) % 360) * (Math.PI / 180);
      if (!w.placeFood('berry', NEST.x + Math.cos(ang) * dist, NEST.y + Math.sin(ang) * dist)) continue;
      const a = w.spawnAnt();
      w.started = false;
      for (let i = 0; i < Math.round(60 / STEP_S); i++) {
        w.step(STEP_S);
        if (a.state === 'toFood' || a.state === 'gnaw' || a.state === 'carry') {
          found++;
          break;
        }
      }
    }
    return found;
  }

  // Before the variation (same harness, 100 seeds): 40 px 70 %, 70 px 32 %; after: 64 % / 35 % (400 seeds: 66 -> 64, 33.75 -> 34).
  // Thresholds: about 5 percentage points below the old numbers (the harness of the earlier tuning measured 40 px at 63-65 %).
  it('one ant finds a berry 40 px away in at least 60 % and one 70 px away in at least 27 % of 100 real-terrain seeds', () => {
    expect(discoveryPercent(40)).toBeGreaterThanOrEqual(60);
    expect(discoveryPercent(70)).toBeGreaterThanOrEqual(27);
  }, 60_000);
});
