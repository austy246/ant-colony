import { describe, expect, it } from 'vitest';
import { MAX_PHEROMONE, STEP_S } from './constants';
import { validateSave, worldFromSave, worldToSave, type SaveV1 } from './serialize';
import { World } from './world';

const EXTRA = { introDone: true, camera: { x: 10, y: 20, zoom: 2 } };

function busyWorld(): World {
  const w = World.create(1234);
  for (let i = 0; i < 12; i++) w.spawnAnt();
  w.placeFood('beetle', 80, 140);
  w.placeFood('berry', 120, 100);
  w.stock = 4;
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
    expect(r.hatchProgress).toBe(w.hatchProgress);
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
    for (let i = 0; i < 150; i++) {
      w.step(STEP_S);
      r.step(STEP_S);
    }
    expect(r.ants.map((a) => [a.id, a.x, a.y])).toEqual(w.ants.map((a) => [a.id, a.x, a.y]));
  });

  it('pheromone with wrong length is invalid', () => {
    const s = worldToSave(busyWorld(), EXTRA);
    s.pheromone = btoa('abc');
    expect(() => worldFromSave(s)).toThrow();
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
      { ants: [{ ...ant, lifespan: 0 }] },
      { ants: [{ ...ant, age: -1 }] },
      { ants: [{ ...ant, x: -1 }] },
      { ants: [{ ...ant, y: 100000 }] },
      { ants: [{ ...ant, heading: Infinity }] },
      { ants: [{ ...ant, id: 1.5 }] },
      { food: [{ ...food, piecesLeft: -1 }] },
      { food: [{ ...food, piecesLeft: 21 }] },
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
