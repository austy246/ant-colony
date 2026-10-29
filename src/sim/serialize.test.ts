import { describe, expect, it } from 'vitest';
import { HATCH_INTERVAL_S, MAX_PHEROMONE, STEP_S } from './constants';
import { validateSave, worldFromSave, worldToSave, type SaveV1 } from './serialize';
import { FOOD_TABLE } from './food';
import { World } from './world';

const MAX_PIECES = Math.max(...Object.values(FOOD_TABLE).map((f) => f.pieces));
const EXTRA = { introDone: true, camera: { x: 10, y: 20, zoom: 2 } };

function busyWorld(): World {
  const w = World.create(1234);
  for (let i = 0; i < 12; i++) w.spawnAnt();
  w.placeFood('beetle', 80, 140);
  w.placeFood('berry', 120, 100);
  w.stock = 12; // enough for an ant, so hatchProgress keeps running (1 s * 3 = 3.25 s after the loop below)
  w.hatchProgress = 0.25;
  w.pher.deposit(60, 140, 2);
  w.pher.deposit(61, 141, 4.9);
  // Whole STEP_S multiples keep the private substep accumulator ~0 (it is intentionally not saved).
  for (let i = 0; i < 90; i++) w.step(STEP_S);
  return w;
}

describe('serialize', () => {
  it('roundtrip preserves ants, food, stock and pheromone within 1/255*MAX', () => {
    const w = busyWorld();
    const r = worldFromSave(JSON.parse(JSON.stringify(worldToSave(w, EXTRA))) as SaveV1);
    expect(r.ants).toEqual(w.ants);
    expect(r.food).toEqual(w.food);
    expect(r.stock).toBe(w.stock);
    expect(w.hatchProgress).toBeGreaterThan(3);
    expect(r.hatchProgress).toBe(w.hatchProgress);
    expect(r.deliveryCount).toBe(0); // transient, not saved
    expect(r.time).toBe(w.time);
    expect(r.nextId).toBe(w.nextId);
    expect(r.rng.state).toBe(w.rng.state);
    expect(r.pher.data.length).toBe(w.pher.data.length);
    let max = 0;
    let nonZero = 0;
    for (let i = 0; i < w.pher.data.length; i++) {
      max = Math.max(max, Math.abs(r.pher.data[i] - w.pher.data[i]));
      if (w.pher.data[i] > 0) nonZero++;
    }
    expect(nonZero).toBeGreaterThan(0);
    expect(max).toBeLessThanOrEqual(MAX_PHEROMONE / 255);
  });

  it('loading restores terrain from seed identical to original', () => {
    const w = busyWorld();
    const r = worldFromSave(worldToSave(w, EXTRA));
    expect(r.seed).toBe(w.seed);
    expect(r.terrain).toEqual(w.terrain);
  });

  it('restored ants and food are deep copies', () => {
    const w = busyWorld();
    const s = worldToSave(w, EXTRA);
    const r = worldFromSave(s);
    r.ants[0].x += 100;
    expect(s.ants[0].x).not.toBe(r.ants[0].x);
  });

  it('restored world evolves identically to the original', () => {
    const w = busyWorld();
    const r = worldFromSave(worldToSave(w, EXTRA));
    // 300 substeps = 10 s: crosses the hatch at 10 s (progress 3.25 + 10 > 10), so hatching after restore is covered too.
    for (let i = 0; i < 300; i++) {
      w.step(STEP_S);
      r.step(STEP_S);
    }
    expect(w.ants.length).toBeGreaterThan(12);
    expect(r.ants.map((a) => [a.id, a.x, a.y])).toEqual(w.ants.map((a) => [a.id, a.x, a.y]));
    expect(r.stock).toBe(w.stock);
    expect(r.hatchProgress).toBe(w.hatchProgress);
  });

  it('pheromone with wrong length is invalid', () => {
    const s = worldToSave(busyWorld(), EXTRA);
    s.pheromone = btoa('abc');
    expect(() => worldFromSave(s)).toThrow();
  });

  it('roundtrip keeps a gnawing ant (state and timer) and the game goes on identically', () => {
    const w = World.create(77);
    const f = w.placeFood('carrion', 150, 100)!;
    const a = w.spawnAnt();
    a.x = f.x;
    a.y = f.y;
    a.state = 'toFood';
    a.targetFood = f.id;
    for (let i = 0; i < 60; i++) w.step(STEP_S); // 2 s: arrived and halfway through the bite
    expect(a.state).toBe('gnaw');
    expect(a.timer).toBeGreaterThan(0.5);
    const s = JSON.parse(JSON.stringify(worldToSave(w, EXTRA))) as SaveV1;
    expect(validateSave(s)).not.toBeNull();
    const r = worldFromSave(validateSave(s)!);
    expect(r.ants[0].state).toBe('gnaw');
    expect(r.ants[0].timer).toBe(a.timer);
    expect(r.ants).toEqual(w.ants);
    for (let i = 0; i < 150; i++) {
      w.step(STEP_S);
      r.step(STEP_S);
    }
    expect(w.ants[0].state).toBe('carry'); // bite ended within 5 s, so both took the piece
    expect(r.ants[0].state).toBe('carry');
    expect(r.ants[0].carry).toBe(w.ants[0].carry);
    expect(r.food[0].piecesLeft).toBe(w.food[0].piecesLeft);
    expect(r.ants.map((x) => [x.x, x.y, x.timer])).toEqual(w.ants.map((x) => [x.x, x.y, x.timer]));
  });
});

describe('validateSave', () => {
  const good = () => JSON.parse(JSON.stringify(worldToSave(busyWorld(), EXTRA))) as Record<string, unknown>;

  it('accepts a good save', () => {
    expect(validateSave(good())).not.toBeNull();
  });
  it('rejects non-objects, wrong version, missing ants', () => {
    expect(validateSave(null)).toBeNull();
    expect(validateSave('x')).toBeNull();
    expect(validateSave({ ...good(), version: 2 })).toBeNull();
    const g = good();
    delete g.ants;
    expect(validateSave(g)).toBeNull();
  });
  it('accepts the gnaw state with a timer, and old ants without a timer load with timer 0', () => {
    const g = good();
    const ant = (g.ants as Record<string, unknown>[])[0];
    for (const timer of [0, 0.5, 4.99]) {
      expect(validateSave({ ...g, ants: [{ ...ant, state: 'gnaw', timer }] }), String(timer)).not.toBeNull();
    }
    const noTimer = { ...ant, state: 'gnaw' } as Record<string, unknown>;
    delete noTimer.timer;
    const loaded = worldFromSave(validateSave({ ...g, ants: [noTimer] })!);
    expect(loaded.ants[0].state).toBe('gnaw');
    expect(loaded.ants[0].timer).toBe(0);
    const old = JSON.parse(JSON.stringify(g)) as { ants: Record<string, unknown>[] };
    for (const a of old.ants) delete a.timer;
    const w = worldFromSave(validateSave(old)!);
    expect(w.ants.every((a) => a.timer === 0)).toBe(true);
  });
  it('rejects a negative, non-finite or non-numeric ant timer, and unknown states', () => {
    const g = good();
    const ant = (g.ants as Record<string, unknown>[])[0];
    for (const timer of [-0.001, -5, NaN, Infinity, -Infinity, '2', null, {}]) {
      expect(validateSave({ ...g, ants: [{ ...ant, state: 'gnaw', timer }] }), String(timer)).toBeNull();
    }
    expect(validateSave({ ...g, ants: [{ ...ant, state: 'Gnaw' }] })).toBeNull();
  });
  it('piecesLeft accepts 0 up to the largest piece count in FOOD_TABLE (old saves hold smaller values)', () => {
    const g = good();
    const food = (g.food as Record<string, unknown>[])[0];
    expect(MAX_PIECES).toBe(24);
    for (const piecesLeft of [0, 2, 6, 20, MAX_PIECES]) {
      expect(validateSave({ ...g, food: [{ ...food, piecesLeft }] }), String(piecesLeft)).not.toBeNull();
    }
  });
  it('rejects NaN / non-finite numeric fields', () => {
    expect(validateSave({ ...good(), stock: NaN })).toBeNull();
    expect(validateSave({ ...good(), time: Infinity })).toBeNull();
    expect(validateSave({ ...good(), camera: { x: 0, y: 0, zoom: NaN } })).toBeNull();
  });
  it('rejects malformed ants and food', () => {
    const g = good();
    expect(validateSave({ ...g, ants: [{ ...(g.ants as object[])[0], state: 'dance' }] })).toBeNull();
    expect(validateSave({ ...g, ants: [{ ...(g.ants as object[])[0], x: NaN }] })).toBeNull();
    expect(validateSave({ ...g, ants: [{ ...(g.ants as object[])[0], targetFood: 'a' }] })).toBeNull();
    expect(validateSave({ ...g, food: [{ ...(g.food as object[])[0], kind: 'pizza' }] })).toBeNull();
    expect(validateSave({ ...g, food: [{ id: 1 }] })).toBeNull();
  });
  it('roundtrip keeps the started flag; old saves without it default from ants/time', () => {
    const w = busyWorld();
    expect(w.started).toBe(true);
    const s = JSON.parse(JSON.stringify(worldToSave(w, EXTRA))) as SaveV1;
    expect(s.started).toBe(true);
    expect(worldFromSave(s).started).toBe(true);

    const fresh = World.create(3);
    const fs = JSON.parse(JSON.stringify(worldToSave(fresh, EXTRA))) as SaveV1;
    expect(fs.started).toBe(false);
    expect(worldFromSave(fs).started).toBe(false);

    // Old save format: no `started` field at all.
    const old = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    delete old.started;
    expect(validateSave(old)).not.toBeNull();
    expect(worldFromSave(validateSave(old)!).started).toBe(true); // has ants
    const oldEmptyEarly = JSON.parse(JSON.stringify(fs)) as Record<string, unknown>;
    delete oldEmptyEarly.started;
    expect(worldFromSave(validateSave(oldEmptyEarly)!).started).toBe(false); // no ants, time 0
    const oldEmptyLate = { ...oldEmptyEarly, time: 100 };
    expect(worldFromSave(validateSave(oldEmptyLate)!).started).toBe(true); // time > 30
    expect(validateSave({ ...s, started: 'yes' })).toBeNull();
  });
  it('hatchProgress: valid range is [0, HATCH_INTERVAL_S]; legacy values up to 15 (old colony floor) load, clamped below the interval', () => {
    const g = good();
    expect(validateSave({ ...g, hatchProgress: 0 })).not.toBeNull();
    expect(validateSave({ ...g, hatchProgress: HATCH_INTERVAL_S })).not.toBeNull();
    for (const bad of [-0.1, NaN, Infinity, 15.5, 100, '3']) {
      expect(validateSave({ ...g, hatchProgress: bad }), String(bad)).toBeNull();
    }
    const old = validateSave({ ...g, hatchProgress: 12.5 });
    expect(old).not.toBeNull();
    const w = worldFromSave(old!);
    expect(w.hatchProgress).toBeGreaterThan(HATCH_INTERVAL_S - 1);
    expect(w.hatchProgress).toBeLessThan(HATCH_INTERVAL_S);
    expect(w.hatchFraction).toBeLessThan(1);
    expect(worldFromSave(validateSave({ ...g, hatchProgress: HATCH_INTERVAL_S })!).hatchProgress).toBeLessThan(HATCH_INTERVAL_S);
    expect(worldFromSave(validateSave({ ...g, hatchProgress: 7.5 })!).hatchProgress).toBe(7.5);
  });
  it('a restored legacy hatchProgress finishes the cycle instead of overflowing it', () => {
    const w = worldFromSave(validateSave({ ...good(), hatchProgress: 14, stock: 5, ants: [], started: true })!);
    for (let i = 0; i < 5; i++) w.step(STEP_S);
    expect(w.ants).toHaveLength(1);
    expect(w.stock).toBe(0);
    expect(w.hatchProgress).toBeLessThan(HATCH_INTERVAL_S);
  });
  it('old saves with an ant lifespan still load (ignored, dropped); saves without it are valid', () => {
    const g = good();
    const ants = (g.ants as Record<string, unknown>[]).map((a) => ({ ...a, lifespan: 600 }));
    const w = worldFromSave(validateSave({ ...g, ants })!);
    expect(w.ants).toHaveLength(ants.length);
    expect(w.ants.every((a) => !('lifespan' in a))).toBe(true);
    expect((worldToSave(w, EXTRA).ants[0] as Record<string, unknown>).lifespan).toBeUndefined();
    expect(validateSave(good())).not.toBeNull();
  });
  it('rejects non-string pheromone and non-boolean introDone', () => {
    expect(validateSave({ ...good(), pheromone: 5 })).toBeNull();
    expect(validateSave({ ...good(), introDone: 'yes' })).toBeNull();
  });
  it('rejects invalid base64 and wrong-length pheromone', () => {
    expect(validateSave({ ...good(), pheromone: '!!!not base64!!!' })).toBeNull();
    expect(validateSave({ ...good(), pheromone: btoa('abc') })).toBeNull();
    expect(validateSave({ ...good(), pheromone: '' })).toBeNull();
  });
  it('rejects out-of-range values (table)', () => {
    const g = good();
    const ant = (g.ants as Record<string, unknown>[])[0];
    const food = (g.food as Record<string, unknown>[])[0];
    const bad: Record<string, unknown>[] = [
      { ants: [{ ...ant, age: -1 }] },
      { ants: [{ ...ant, x: -1 }] },
      { ants: [{ ...ant, y: 100000 }] },
      { ants: [{ ...ant, heading: Infinity }] },
      { ants: [{ ...ant, id: 1.5 }] },
      { food: [{ ...food, piecesLeft: -1 }] },
      { food: [{ ...food, piecesLeft: MAX_PIECES + 1 }] },
      { food: [{ ...food, piecesLeft: 1.5 }] },
      { food: [{ ...food, x: 1e6 }] },
      { ants: Array.from({ length: 2001 }, () => ({ ...ant })) },
      { food: Array.from({ length: 2001 }, () => ({ ...food })) },
      { nextId: 1 },
      { nextId: 2.5 },
      { camera: { x: 0, y: 0, zoom: 0 } },
      { stock: -1 },
      { time: -1 },
    ];
    for (const patch of bad) expect(validateSave({ ...g, ...patch }), JSON.stringify(Object.keys(patch))).toBeNull();
  });
});
