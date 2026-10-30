import { describe, expect, it } from 'vitest';
import {
  FOOD_PER_ANT, HATCH_INTERVAL_S, HATCH_STAY_S, MAX_ANTS, NEST, RESCUE_AFTER_S, STEP_S, UNLOAD_S,
} from './constants';
import { validateSave, worldFromSave, worldToSave, type SaveV1 } from './serialize';
import { Surface } from './terrain';
import { World } from './world';

const EXTRA = { introDone: true, camera: { x: 0, y: 0, zoom: 1 } };

/** Flat ground, empty larder. */
function flatWorld(seed = 1): World {
  const w = World.create(seed);
  w.noSpider = true; // these tests place ants anywhere; the spider has its own tests
  w.stock = 0;
  w.terrain.surface.fill(Surface.Ground);
  w.terrain.speed.fill(1);
  return w;
}

function run(w: World, seconds: number): void {
  const n = Math.round(seconds / STEP_S);
  for (let i = 0; i < n; i++) w.step(STEP_S);
}

/** Steps until `done()` or `limit` seconds; returns elapsed seconds. */
function until(w: World, done: () => boolean, limit: number): number {
  let t = 0;
  while (!done() && t < limit) {
    w.step(STEP_S);
    t += STEP_S;
  }
  return t;
}

describe('nest time: constants and spawning', () => {
  it('constants', () => {
    expect(HATCH_STAY_S).toBe(30);
    expect(UNLOAD_S).toBe(5);
  });

  it('spawnAnt() defaults to the surface (wander, forager); spawnAnt(true) puts the ant into the nest as a hatchling', () => {
    const w = flatWorld(1);
    const s = w.spawnAnt();
    expect(s.state).toBe('wander');
    expect(s.role).toBe('forager');
    expect(s.nestKind).toBeUndefined();
    const h = w.spawnAnt(true);
    expect(h.state).toBe('nest');
    expect(h.nestKind).toBe('hatch');
    expect(h.role).toBe('forager');
    expect(h.timer).toBeGreaterThanOrEqual(HATCH_STAY_S * 0.85);
    expect(h.timer).toBeLessThanOrEqual(HATCH_STAY_S * 1.15);
    expect(Math.hypot(h.x - NEST.x, h.y - NEST.y)).toBeLessThanOrEqual(3);
    expect(w.started).toBe(true);
  });

  it('the rescue ant appears on the surface immediately', () => {
    const w = flatWorld(2);
    w.spawnAnt();
    w.ants.length = 0;
    until(w, () => w.ants.length > 0, RESCUE_AFTER_S + 5);
    expect(w.ants).toHaveLength(1);
    expect(w.ants[0].state).toBe('wander');
  });

  it('a colony that holds only ants inside the nest is not empty: no rescue ant', () => {
    const w = flatWorld(3);
    const h = w.spawnAnt(true);
    h.timer = 1e6;
    run(w, RESCUE_AFTER_S * 3);
    expect(w.ants).toHaveLength(1);
  });
});

describe('hatchlings stay in the nest', () => {
  it('a hatched ant is in state nest for 25.5-34.5 s, then wanders at the entrance (12 seeds)', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const w = flatWorld(seed);
      w.spawnAnt();
      w.stock = FOOD_PER_ANT;
      until(w, () => w.ants.length === 2, HATCH_INTERVAL_S * 1.2 + 1); // the cycle is jittered: 8-12 s
      const h = w.ants[1];
      expect(h.state, `seed ${seed}`).toBe('nest');
      expect(h.nestKind).toBe('hatch');
      const inside = until(w, () => h.state !== 'nest', 40);
      expect(inside, `seed ${seed}`).toBeGreaterThanOrEqual(25.5 - 0.1);
      expect(inside, `seed ${seed}`).toBeLessThanOrEqual(34.5 + 0.1);
      expect(h.state).toBe('wander');
      expect(h.nestKind).toBeUndefined();
      expect(h.role).toBe('forager');
      expect(Math.hypot(h.x - NEST.x, h.y - NEST.y), `seed ${seed}`).toBeLessThanOrEqual(5);
    }
  });

  it('the stay times vary between ants', () => {
    const w = flatWorld(9);
    const ants = Array.from({ length: 12 }, () => w.spawnAnt(true));
    expect(new Set(ants.map((a) => a.timer)).size).toBeGreaterThan(6);
  });

  it('a hatched ant never moves on the surface while inside', () => {
    const w = flatWorld(4);
    const h = w.spawnAnt(true);
    h.timer = 20;
    const { x, y, heading } = h;
    run(w, 15);
    expect(h.state).toBe('nest');
    expect(h.x).toBe(x);
    expect(h.y).toBe(y);
    expect(h.heading).toBe(heading);
    expect(h.timer).toBeCloseTo(5, 1);
  });

  it('ants in the nest deposit no pheromone and mark nothing as explored', () => {
    const w = flatWorld(5);
    for (let i = 0; i < 5; i++) w.spawnAnt(true).timer = 1e6;
    run(w, 10);
    expect(w.pher.data.reduce((s, v) => s + v, 0)).toBe(0);
    expect(w.explored.reduce((s, v) => s + v, 0)).toBe(0);
  });

  it('antsOnSurface + antsInNest === ants.length at every second of a growing colony', () => {
    const w = flatWorld(6);
    for (let i = 0; i < 3; i++) w.spawnAnt();
    w.stock = 40;
    for (let sec = 0; sec < 60; sec++) {
      run(w, 1);
      expect(w.antsOnSurface + w.antsInNest).toBe(w.ants.length);
      expect(w.antsInNest).toBe(w.ants.filter((a) => a.state === 'nest').length);
    }
    expect(w.antsInNest).toBeGreaterThan(0);
    expect(w.antsOnSurface).toBeGreaterThanOrEqual(3);
  });

  it('ants inside the nest count against MAX_ANTS', () => {
    const w = flatWorld(7);
    for (let i = 0; i < MAX_ANTS - 1; i++) w.spawnAnt(true).timer = 1e6;
    w.spawnAnt();
    w.stock = 50;
    run(w, 2 * HATCH_INTERVAL_S);
    expect(w.ants).toHaveLength(MAX_ANTS);
    expect(w.stock).toBe(50);
  });
});

describe('prey ignores ants inside the nest', () => {
  it('an ant in state nest at a living beetle is not touched, killed or counted', () => {
    const w = flatWorld(8);
    const b = w.placeFood('beetle', 150, 100)!;
    b.wanderT = 1e6;
    const h = w.spawnAnt(true);
    h.timer = 1e6;
    h.x = b.x;
    h.y = b.y;
    run(w, 3);
    expect(b.touches).toBe(0);
    expect(w.ants).toEqual([h]);
    expect(w.antsKilled).toBe(0);
  });
});

describe('delivering foragers unload inside the nest', () => {
  /** A loaded forager next to the nest, heading for a (far) berry it would continue to. */
  function courier(seed: number): { w: World; a: ReturnType<World['spawnAnt']>; foodId: number } {
    const w = flatWorld(seed);
    const f = w.placeFood('berry', NEST.x + 120, NEST.y)!;
    const a = w.spawnAnt();
    a.state = 'carry';
    a.carry = 1;
    a.targetFood = f.id;
    a.x = NEST.x + NEST.r + 4;
    a.y = NEST.y;
    a.heading = Math.PI;
    return { w, a, foodId: f.id };
  }

  it('delivery adds stock / totalDelivered / deliveryCount as before, then the ant is inside for 4-6 s and goes on to its food (10 seeds)', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { w, a, foodId } = courier(seed);
      until(w, () => a.state === 'nest', 10);
      expect(a.state, `seed ${seed}`).toBe('nest');
      expect(a.nestKind).toBe('unload');
      expect(a.carry).toBe(0);
      expect(w.stock).toBe(1);
      expect(w.totalDelivered).toBe(1);
      expect(w.deliveryCount).toBe(1);
      expect(a.targetFood).toBe(foodId);
      const inside = until(w, () => a.state !== 'nest', 8);
      expect(inside, `seed ${seed}`).toBeGreaterThanOrEqual(4 - 0.1);
      expect(inside, `seed ${seed}`).toBeLessThanOrEqual(6 + 0.1);
      expect(a.state).toBe('toFood');
      expect(a.targetFood).toBe(foodId);
      expect(a.nestKind).toBeUndefined();
      expect(Math.hypot(a.x - NEST.x, a.y - NEST.y)).toBeLessThanOrEqual(5);
      expect(w.deliveryCount).toBe(1);
    }
  });

  it('without a food target (or when it is gone) the ant wanders after unloading', () => {
    const { w, a } = courier(3);
    a.targetFood = null;
    until(w, () => a.state === 'nest', 10);
    expect(a.targetFood).toBeNull();
    until(w, () => a.state !== 'nest', 8);
    expect(a.state).toBe('wander');

    const c = courier(4);
    until(c.w, () => c.a.state === 'nest', 10);
    expect(c.a.targetFood).toBe(c.foodId);
    run(c.w, 1);
    c.w.removeFood(c.foodId); // gone while the ant is inside: its unload clock must not be reset
    expect(c.a.state).toBe('nest');
    expect(c.a.targetFood).toBeNull();
    expect(c.a.timer).toBeGreaterThan(2);
    until(c.w, () => c.a.state !== 'nest', 8);
    expect(c.a.state).toBe('wander');
  });

  it('a multi-piece food is carried on repeated trips with the 5 s pause in between', () => {
    const w = flatWorld(11);
    const f = w.placeFood('carrion', NEST.x + 20, NEST.y)!;
    f.corpseOf = 'fly';
    f.piecesLeft = 6; // the run below is timed for 6 trips (a fly now has 18 pieces)
    const a = w.spawnAnt();
    a.state = 'toFood';
    a.targetFood = f.id;
    let deliveries = 0;
    let wasCarrying = false;
    for (let i = 0; i < 1500; i++) {
      w.step(0.1);
      const carrying = a.carry > 0;
      if (wasCarrying && !carrying) deliveries++;
      wasCarrying = carrying;
    }
    expect(deliveries).toBe(6);
    expect(w.deliveryCount).toBe(6);
    expect(w.food).toHaveLength(0);
    expect(a.state).toBe('wander');
  });
});

describe('save: nest ants', () => {
  function nestWorld(): World {
    const w = flatWorld(21);
    for (let i = 0; i < 3; i++) w.spawnAnt();
    const hatch = w.spawnAnt(true);
    hatch.timer = 17.5;
    const unload = w.spawnAnt(true);
    unload.nestKind = 'unload';
    unload.timer = 3.25;
    const f = w.placeFood('berry', 150, 100)!;
    unload.targetFood = f.id;
    const nurse = w.spawnAnt(true);
    nurse.role = 'nurse';
    nurse.nestKind = 'nurse';
    nurse.timer = 0;
    return w;
  }

  it('round-trips state nest, nestKind, role and timer through JSON and validateSave', () => {
    const w = nestWorld();
    const s = JSON.parse(JSON.stringify(worldToSave(w, EXTRA))) as SaveV1;
    expect(s.version).toBe(1);
    const v = validateSave(s);
    expect(v).not.toBeNull();
    const r = worldFromSave(v!);
    expect(r.ants).toEqual(w.ants);
    expect(r.antsInNest).toBe(3);
    expect(r.ants.map((a) => a.role)).toEqual(w.ants.map((a) => a.role));
    expect(r.ants.map((a) => a.nestKind)).toEqual([undefined, undefined, undefined, 'hatch', 'unload', 'nurse']);
    expect(r.ants[3].timer).toBe(17.5);
    expect(r.ants[4].timer).toBe(3.25);
  });

  it('a restored colony keeps going: hatchlings emerge on schedule', () => {
    const w = nestWorld();
    const r = worldFromSave(validateSave(JSON.parse(JSON.stringify(worldToSave(w, EXTRA))))!);
    r.explored.set(w.explored);
    run(w, 20);
    run(r, 20);
    const hw = w.ants[3];
    const hr = r.ants[3];
    expect(hw.state).toBe('wander');
    expect(hr.state).toBe('wander');
  });

  it('old ants: state nest without nestKind loads as hatch; ants without role load as forager', () => {
    const w = nestWorld();
    const s = JSON.parse(JSON.stringify(worldToSave(w, EXTRA))) as { ants: Record<string, unknown>[] };
    for (const a of s.ants) {
      delete a.role;
      delete a.nestKind;
    }
    const v = validateSave(s);
    expect(v).not.toBeNull();
    const r = worldFromSave(v!);
    expect(r.ants.every((a) => a.role === 'forager')).toBe(true);
    expect(r.ants.filter((a) => a.state === 'nest').every((a) => a.nestKind === 'hatch')).toBe(true);
  });

  it('the validator rejects unknown nestKind / role values', () => {
    const w = nestWorld();
    const g = JSON.parse(JSON.stringify(worldToSave(w, EXTRA))) as { ants: Record<string, unknown>[] };
    const ant = g.ants[3];
    expect(validateSave({ ...g, ants: [{ ...ant, nestKind: 'sleep' }] })).toBeNull();
    expect(validateSave({ ...g, ants: [{ ...ant, nestKind: 5 }] })).toBeNull();
    expect(validateSave({ ...g, ants: [{ ...ant, role: 'queen' }] })).toBeNull();
    expect(validateSave({ ...g, ants: [{ ...ant, role: null }] })).toBeNull();
    expect(validateSave({ ...g, ants: [{ ...ant, state: 'nest', nestKind: 'nurse', role: 'nurse' }] })).not.toBeNull();
  });
});

describe('peakAnts', () => {
  it('starts at 0 and never decreases when ants disappear', () => {
    const w = flatWorld();
    expect(w.peakAnts).toBe(0);
    for (let i = 0; i < 5; i++) w.spawnAnt();
    run(w, 0.5);
    expect(w.peakAnts).toBe(5);
    w.ants.length = 2;
    run(w, 0.5);
    expect(w.peakAnts).toBe(5);
  });
});
