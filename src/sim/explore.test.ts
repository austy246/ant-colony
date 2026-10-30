import { describe, expect, it } from 'vitest';
import { EXPLORE_CAP, EXPLORE_CELL, EXPLORE_HALF_LIFE_S, MAX_PHEROMONE, NEST, STEP_S, WORLD_H, WORLD_W } from './constants';
import { worldFromSave, worldToSave } from './serialize';
import { Surface } from './terrain';
import { World } from './world';

const CW = Math.ceil(WORLD_W / EXPLORE_CELL);
const CH = Math.ceil(WORLD_H / EXPLORE_CELL);

/** Obstacle-free ground (speed 1 everywhere), empty larder (nothing hatches), no free rescue ant. */
function flatWorld(seed: number): World {
  const w = World.create(seed);
  w.noSpider = true; // these tests place ants anywhere; the spider has its own tests
  w.stock = 0;
  w.terrain.surface.fill(Surface.Ground);
  w.terrain.speed.fill(1);
  return w;
}

function run(w: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / STEP_S); i++) w.step(STEP_S);
}

/** A single old wandering ant (age far beyond the young-ant range) at (x, y) with the given heading. */
function oldAnt(w: World, x: number, y: number, heading: number, curiosity = 1) {
  const a = w.spawnAnt();
  a.speedMul = 1; // neutral personality (curiosity as given) so the geometry below is exact
  a.curiosity = curiosity;
  a.stubbornness = 1;
  w.started = false;
  a.x = x;
  a.y = y;
  a.heading = heading;
  a.age = 1000;
  return a;
}

const total = (w: World): number => w.explored.reduce((s, v) => s + v, 0);

describe('exploration', () => {
  it('the explored grid has one cell per EXPLORE_CELL px and starts empty', () => {
    const w = World.create(1);
    expect(CW).toBe(40);
    expect(CH).toBe(25);
    expect(w.explored.length).toBe(CW * CH);
    expect(w.explored.every((v) => v === 0)).toBe(true);
  });

  // 8 ants, no food, flat ground, 120 s, seeds 1-10: share of the 40 x 25 cells ever visited by an ant.
  // Measured (20 other seeds): flat 85 %, real terrain 80 % (before: tether 120 + plain random walk: 38 %).
  it('8 ants visit at least 60 % of all grid cells within 120 s', () => {
    let sum = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const w = flatWorld(seed);
      for (let i = 0; i < 8; i++) w.spawnAnt();
      w.started = false;
      const seen = new Uint8Array(CW * CH);
      for (let i = 0; i < Math.round(120 / STEP_S); i++) {
        w.step(STEP_S);
        for (const a of w.ants) {
          seen[Math.min(CH - 1, Math.floor(a.y / EXPLORE_CELL)) * CW + Math.min(CW - 1, Math.floor(a.x / EXPLORE_CELL))] = 1;
        }
      }
      sum += seen.reduce((s, v) => s + v, 0) / seen.length;
    }
    expect(sum / 10).toBeGreaterThanOrEqual(0.6);
  }, 60_000);

  // Same setup: mean distance of the ants from the nest over seconds 60-120 (sampled every second).
  // Measured: ~159 px flat (before: 91 px). Threshold 120 px.
  it('ants roam far from the nest: mean distance over seconds 60-120 is at least 120 px', () => {
    let sum = 0;
    let n = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const w = flatWorld(seed);
      for (let i = 0; i < 8; i++) w.spawnAnt();
      w.started = false;
      for (let sec = 1; sec <= 120; sec++) {
        run(w, 1);
        if (sec <= 60) continue;
        let m = 0;
        for (const a of w.ants) m += Math.hypot(a.x - NEST.x, a.y - NEST.y);
        sum += m / w.ants.length;
        n++;
      }
    }
    expect(sum / n).toBeGreaterThanOrEqual(120);
  }, 60_000);

  it('ants are not trapped: the median ant moves at least 60 px in its last 20 s (real terrain)', () => {
    const disp: number[] = [];
    for (let seed = 1; seed <= 5; seed++) {
      const w = World.create(seed);
      w.stock = 0;
      for (let i = 0; i < 8; i++) w.spawnAnt();
      w.started = false;
      run(w, 100);
      const p = w.ants.map((a) => [a.x, a.y]);
      run(w, 20);
      w.ants.forEach((a, i) => disp.push(Math.hypot(a.x - p[i][0], a.y - p[i][1])));
    }
    disp.sort((a, b) => a - b);
    expect(disp[Math.floor(disp.length / 2)]).toBeGreaterThanOrEqual(60);
  }, 60_000);

  it('a wandering ant deposits about STEP_S per substep into its cell', () => {
    const w = flatWorld(3);
    const a = oldAnt(w, 100, 100, 0);
    run(w, 1);
    expect(total(w)).toBeGreaterThan(0.9); // about 1 s of deposit, minus a little decay
    expect(total(w)).toBeLessThan(1.05);
    expect(w.explored[Math.floor(a.y / EXPLORE_CELL) * CW + Math.floor(a.x / EXPLORE_CELL)]).toBeGreaterThan(0);
  });

  it('ants that gnaw or carry do not deposit', () => {
    for (const state of ['gnaw', 'carry'] as const) {
      const w = flatWorld(4);
      const a = oldAnt(w, 100, 100, 0);
      const f = w.placeFood('carrion', 100, 100)!;
      a.state = state;
      if (state === 'gnaw') {
        a.targetFood = f.id;
        a.timer = 100; // keeps gnawing for the whole test
      } else {
        a.carry = 1;
        a.targetFood = null;
        a.heading = Math.atan2(NEST.y - a.y, NEST.x - a.x);
      }
      run(w, 1);
      expect(a.state).toBe(state);
      expect(total(w)).toBe(0);
    }
  });

  it('values decay with a half-life of EXPLORE_HALF_LIFE_S', () => {
    const w = flatWorld(5);
    w.explored[100] = 4;
    run(w, EXPLORE_HALF_LIFE_S);
    expect(w.explored[100]).toBeCloseTo(2, 1);
  });

  it('values never exceed EXPLORE_CAP', () => {
    const w = flatWorld(6);
    const a = oldAnt(w, 100, 100, 0);
    const i = Math.floor(a.y / EXPLORE_CELL) * CW + Math.floor(a.x / EXPLORE_CELL);
    w.explored[i] = EXPLORE_CAP;
    w.step(STEP_S);
    for (let k = 0; k < CW * CH; k++) expect(w.explored[k]).toBeLessThanOrEqual(EXPLORE_CAP);
  });

  it('a wanderer turns toward the empty side when the ground ahead is explored', () => {
    // North half (y < 100) empty, south half heavily explored; the ant walks east along the border.
    const north = flatWorld(7);
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) north.explored[y * CW + x] = y * EXPLORE_CELL < 100 ? 0 : 6;
    const a = oldAnt(north, 160, 100, 0);
    run(north, 1);
    expect(a.y).toBeLessThan(98.5); // y grows downward: north = smaller y

    // Mirrored: empty south, explored north -> turns south.
    const south = flatWorld(7);
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) south.explored[y * CW + x] = y * EXPLORE_CELL < 100 ? 6 : 0;
    const b = oldAnt(south, 160, 100, 0);
    run(south, 1);
    expect(b.y).toBeGreaterThan(101.5);
  });

  it('a pheromone trail still wins over exploration, even through explored ground', () => {
    const arrange = (withTrail: boolean, curiosity = 1): number => {
      const w = flatWorld(8);
      // Rows above y = 96 (the trail side) are explored, everything south of them is empty.
      for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) w.explored[y * CW + x] = y * EXPLORE_CELL < 96 ? 6 : 0;
      if (withTrail) {
        for (let y = 90; y <= 97; y++) for (let x = 158; x <= 200; x++) w.pher.data[y * w.pher.w + x] = MAX_PHEROMONE;
      }
      const a = oldAnt(w, 160, 100, 0, curiosity);
      run(w, 1);
      return a.y;
    };
    expect(arrange(true)).toBeLessThan(99.2); // follows the trail north into explored ground
    // The most curious ant (curiosity 1.6) still prefers a fresh trail to unexplored ground.
    // (the same rng stream with and without the trail, so only the trail differs.)
    expect(arrange(true, 1.6)).toBeLessThan(arrange(false, 1.6) - 2);
    expect(arrange(false)).toBeGreaterThan(100.5); // without the trail it avoids the explored side
  });

  it('food in sight still wins over exploration', () => {
    const w = flatWorld(9);
    w.explored.fill(EXPLORE_CAP);
    w.placeFood('berry', 160, 115);
    const a = oldAnt(w, 160, 100, 0);
    run(w, 6);
    expect(a.state === 'gnaw' || a.state === 'carry').toBe(true);
  });

  it('a world restored from a save starts with an empty grid and keeps working', () => {
    const w = flatWorld(10);
    for (let i = 0; i < 4; i++) w.spawnAnt();
    run(w, 20);
    expect(total(w)).toBeGreaterThan(0);
    const r = worldFromSave(worldToSave(w, { introDone: true, camera: { x: 0, y: 0, zoom: 1 } }));
    expect(r.explored.length).toBe(CW * CH);
    expect(total(r)).toBe(0);
    run(r, 30);
    expect(total(r)).toBeGreaterThan(0);
    expect(r.explored.every((v) => Number.isFinite(v) && v >= 0 && v <= EXPLORE_CAP)).toBe(true);
    for (const a of r.ants) expect(Number.isFinite(a.x + a.y + a.heading)).toBe(true);
  });
});
