import { describe, expect, it } from 'vitest';
import { HATCH_INTERVAL_S, MAX_PHEROMONE, SPIDER_RESPAWN_S, STEP_S, SUGAR_BOOST_S, SUGAR_COOLDOWN_S, WORLD_H, WORLD_W } from './constants';
import { terrainSize } from './terrain';
import { validateSave, worldFromSave, worldToSave, type SaveV1 } from './serialize';
import { FOOD_TABLE } from './food';
import { World } from './world';

const MAX_PIECES = Math.max(...Object.values(FOOD_TABLE).map((f) => f.pieces));
const EXTRA = { introDone: true, camera: { x: 10, y: 20, zoom: 2 } };

/**
 * Drops the transient steering state (weave, strays, lost episodes) of every ant. A save never holds it, so a world that is
 * compared with its own restored copy must not carry any either (the restored ant starts with a fresh weave of 0).
 */
function calm(w: World): World {
  for (const a of w.ants) {
    delete a.strayT;
    delete a.strayH;
    delete a.lostT;
    delete a.lostH;
    delete a.weave;
  }
  return w;
}

function busyWorld(): World {
  const w = World.create(1234);
  for (let i = 0; i < 12; i++) w.spawnAnt();
  const dead = w.placeFood('carrion', 80, 140)!; // a dead beetle: living creatures hold transient state that is not saved
  dead.corpseOf = 'beetle';
  dead.piecesLeft = FOOD_TABLE.beetle.pieces;
  w.placeFood('berry', 120, 100);
  w.stock = 12; // enough for an ant, so hatchProgress keeps running (1 s * 3 = 3.25 s after the loop below)
  w.hatchProgress = 0.25;
  w.pher.deposit(60, 140, 2);
  w.pher.deposit(61, 141, 4.9);
  // Whole STEP_S multiples keep the private substep accumulator ~0 (it is intentionally not saved).
  for (let i = 0; i < 90; i++) w.step(STEP_S);
  return calm(w);
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
    // The explored grid is transient (not saved): copy it so the ants decide exactly as in the original.
    r.explored.set(w.explored);
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
    calm(w);
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
  it('totalDelivered round-trips; an old save without it derives stock + ants * FOOD_PER_ANT', () => {
    const w = busyWorld();
    w.totalDelivered = 234.5;
    const s = JSON.parse(JSON.stringify(worldToSave(w, EXTRA))) as SaveV1;
    expect(s.totalDelivered).toBe(234.5);
    expect(worldFromSave(validateSave(s)!).totalDelivered).toBe(234.5);
    expect(worldFromSave(validateSave(s)!).queens).toBe(3);
    const old = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    delete old.totalDelivered;
    const r = worldFromSave(validateSave(old)!);
    expect(r.totalDelivered).toBeCloseTo(w.stock + w.ants.length * 5, 9);
    for (const bad of [-1, NaN, Infinity, '5', null]) {
      expect(validateSave({ ...(JSON.parse(JSON.stringify(s)) as object), totalDelivered: bad }), String(bad)).toBeNull();
    }
  });
  it('hatchProgress is clamped to the effective interval on restore (2 queens: below 5 s)', () => {
    const w = worldFromSave(validateSave({ ...good(), totalDelivered: 100, hatchProgress: 9 })!);
    expect(w.queens).toBe(2);
    expect(w.hatchProgress).toBeLessThan(5);
    expect(w.hatchFraction).toBeLessThan(1);
  });
  describe('living prey', () => {
    function preyWorld(): { w: World; beetle: ReturnType<World['placeFood']>; corpse: ReturnType<World['placeFood']> } {
      const w = World.create(99);
      const beetle = w.placeFood('beetle', 150, 100)!;
      beetle.touches = 1;
      beetle.cooldown = 0.5; // transient
      beetle.wanderT = 1.5; // transient
      const fly = w.placeFood('fly', 200, 100)!;
      fly.hop = { fromX: 200, fromY: 100, toX: 220, toY: 100, t: 0.1, dur: 0.35 }; // transient
      const corpse = w.placeFood('carrion', 100, 60)!;
      corpse.corpseOf = 'fly';
      corpse.piecesLeft = 5;
      return { w, beetle, corpse };
    }

    it('an alive beetle with touches 1 and a corpse round-trip; transient fields are not saved', () => {
      const { w, beetle, corpse } = preyWorld();
      const s = JSON.parse(JSON.stringify(worldToSave(w, EXTRA))) as SaveV1;
      expect(validateSave(s)).not.toBeNull();
      const sb = s.food.find((f) => f.id === beetle!.id)!;
      expect(sb).toEqual({
        id: beetle!.id, kind: 'beetle', x: beetle!.x, y: beetle!.y, piecesLeft: 18, alive: true, touches: 1, heading: beetle!.heading,
        speedMul: beetle!.speedMul,
      });
      expect(beetle!.speedMul).toBeGreaterThan(0);
      for (const f of s.food) {
        expect('cooldown' in f).toBe(false);
        expect('hop' in f).toBe(false);
        expect('wanderT' in f).toBe(false);
      }
      const r = worldFromSave(validateSave(s)!);
      const rb = r.food.find((f) => f.id === beetle!.id)!;
      expect(rb.alive).toBe(true);
      expect(rb.touches).toBe(1);
      expect(rb.heading).toBe(beetle!.heading);
      expect(rb.cooldown).toBeUndefined();
      expect(rb.wanderT).toBeUndefined();
      const rc = r.food.find((f) => f.id === corpse!.id)!;
      expect(rc.kind).toBe('carrion');
      expect(rc.corpseOf).toBe('fly');
      expect(rc.piecesLeft).toBe(5);
      expect(rc.alive).toBeUndefined();
      expect(r.food.find((f) => f.kind === 'fly')!.hop).toBeUndefined();
    });

    it('a restored living beetle keeps living: it walks, and the second touch still kills it', () => {
      const { w, beetle } = preyWorld();
      const r = worldFromSave(validateSave(JSON.parse(JSON.stringify(worldToSave(w, EXTRA))))!);
      const rb = r.food.find((f) => f.id === beetle!.id)!;
      const { x, y } = rb;
      for (let i = 0; i < 300; i++) r.step(STEP_S);
      expect(Math.hypot(rb.x - x, rb.y - y)).toBeGreaterThan(1);
      expect(rb.touches).toBe(1);
      const a = r.spawnAnt();
      a.x = rb.x + 2;
      a.y = rb.y;
      for (let i = 0; i < 3; i++) r.step(STEP_S);
      expect(rb.alive).toBe(false);
      expect(rb.corpseOf).toBe('beetle');
    });

    it('the validator checks the optional creature fields', () => {
      const g = good();
      const food = (g.food as Record<string, unknown>[])[0];
      const ok: Record<string, unknown>[] = [
        { alive: true, touches: 0, heading: 1.5 },
        { alive: true, touches: 2, heading: -3 },
        { alive: false, corpseOf: 'beetle' },
        { corpseOf: 'fly' },
      ];
      for (const patch of ok) expect(validateSave({ ...g, food: [{ ...food, ...patch }] }), JSON.stringify(patch)).not.toBeNull();
      const bad: Record<string, unknown>[] = [
        { touches: 5 },
        { touches: 3 },
        { touches: -1 },
        { touches: 1.5 },
        { touches: '1' },
        { alive: 'yes' },
        { alive: 1 },
        { alive: null },
        { heading: NaN },
        { heading: Infinity },
        { heading: '1' },
        { corpseOf: 'cat' },
        { corpseOf: 'carrion' },
        { corpseOf: true },
      ];
      for (const patch of bad) expect(validateSave({ ...g, food: [{ ...food, ...patch }] }), JSON.stringify(patch)).toBeNull();
    });

    it('old saves without the creature fields load: a beetle without `alive` is plain, gnawable food', () => {
      const g = good();
      const food = (g.food as Record<string, unknown>[]).map((f) => ({ ...f }));
      for (const f of food) {
        delete f.alive;
        delete f.touches;
        delete f.heading;
        delete f.corpseOf;
      }
      const r = worldFromSave(validateSave({ ...g, food })!);
      expect(r.food.length).toBeGreaterThan(0);
      for (const f of r.food) expect(f.alive).toBeUndefined();
      const beetle = r.food.find((f) => f.kind === 'beetle');
      if (beetle) expect(beetle.piecesLeft).toBeGreaterThan(0);
    });
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

describe('normal mode fields', () => {
  function normalWorld(step: number): World {
    const w = World.create(77, 'normal');
    w.growMapTo(step);
    for (let i = 0; i < 5; i++) w.spawnAnt();
    w.ants[0].major = true;
    w.ants[1].carrySugar = true;
    w.ants[1].state = 'carry';
    w.time = 100; // cooldown and boost lie within one SUGAR_COOLDOWN_S / SUGAR_BOOST_S from now (else clamped on load)
    w.sugarReadyAt = 123.5;
    w.boostUntil = 77.25;
    w.spawnTimer = 4.5;
    w.peakAnts = 40;
    return w;
  }
  const json = (s: SaveV1) => JSON.parse(JSON.stringify(s)) as Record<string, unknown>;

  it('round trip keeps mode, mapStep, sugar cooldown, boost and majors', () => {
    const w = normalWorld(2);
    const r = worldFromSave(validateSave(json(worldToSave(w, EXTRA)))!);
    expect(r.mode).toBe('normal');
    expect(r.mapStep).toBe(2);
    expect(r.pher.data.length).toBe(terrainSize(2).w * terrainSize(2).h);
    expect(r.sugarReadyAt).toBe(123.5);
    expect(r.boostUntil).toBe(77.25);
    expect(r.spawnTimer).toBe(4.5);
    expect(r.peakAnts).toBe(40);
    expect(r.ants[0].major).toBe(true);
    expect(r.ants[1].carrySugar).toBe(true);
    expect(r.ants[2].major).toBeUndefined();
  });

  it('a corrupt far-future sugar cooldown / boost is clamped to one full cooldown / boost from now', () => {
    const w = normalWorld(0);
    const s = worldToSave(w, EXTRA);
    s.sugarReadyAt = s.time + 1e9;
    s.boostUntil = s.time + 1e9;
    const r = worldFromSave(validateSave(json(s))!);
    expect(r.sugarReadyAt).toBe(s.time + SUGAR_COOLDOWN_S);
    expect(r.boostUntil).toBe(s.time + SUGAR_BOOST_S);
    expect(r.sugarCooldownLeft).toBe(SUGAR_COOLDOWN_S);
  });

  it('peakAnts is restored as at least the ant count', () => {
    const w = normalWorld(0);
    const s = worldToSave(w, EXTRA);
    s.peakAnts = 1;
    expect(worldFromSave(s).peakAnts).toBe(5);
    delete s.peakAnts;
    expect(worldFromSave(s).peakAnts).toBe(5);
  });

  it('old save without new fields loads as sandbox 320x200', () => {
    const s = json(worldToSave(busyWorld(), EXTRA));
    for (const k of ['mode', 'mapStep', 'peakAnts', 'sugarReadyAt', 'boostUntil', 'spawnTimer']) delete s[k];
    const r = worldFromSave(validateSave(s)!);
    expect(r.mode).toBe('sandbox');
    expect(r.mapStep).toBe(0);
    expect(r.terrain.w).toBe(WORLD_W);
    expect(r.terrain.h).toBe(WORLD_H);
    expect(r.sugarReadyAt).toBe(0);
    expect(r.boostUntil).toBe(0);
    expect(r.spawnTimer).toBe(0);
  });

  it('save with mapStep 3 restores terrain of size terrainSize(3) identical to extend steps', () => {
    const w = normalWorld(3);
    const r = worldFromSave(validateSave(json(worldToSave(w, EXTRA)))!);
    expect(r.terrain.w).toBe(terrainSize(3).w);
    expect(r.terrain.h).toBe(terrainSize(3).h);
    expect(Array.from(r.terrain.surface)).toEqual(Array.from(w.terrain.surface));
    expect(r.terrain.features).toEqual(w.terrain.features);
  });

  it('pheromone size mismatch for the saved mapStep is rejected', () => {
    const s = json(worldToSave(normalWorld(2), EXTRA));
    expect(validateSave({ ...s, mapStep: 0 })).toBeNull();
    expect(validateSave({ ...s, mapStep: 3 })).toBeNull();
    const base = json(worldToSave(busyWorld(), EXTRA));
    expect(validateSave({ ...base, mapStep: 1 })).toBeNull();
  });

  it('ant coordinates beyond the saved map are rejected', () => {
    const s = json(worldToSave(normalWorld(0), EXTRA));
    const ant = (s.ants as Record<string, unknown>[])[0];
    expect(validateSave({ ...s, ants: [{ ...ant, x: WORLD_W + 10 }] })).toBeNull();
    const g = json(worldToSave(normalWorld(2), EXTRA));
    const ga = (g.ants as Record<string, unknown>[])[0];
    expect(validateSave({ ...g, ants: [{ ...ga, x: terrainSize(2).w - 1, y: terrainSize(2).h - 1 }] })).not.toBeNull();
    expect(validateSave({ ...g, ants: [{ ...ga, x: terrainSize(2).w + 1 }] })).toBeNull();
    const food = { id: 1, kind: 'berry', x: terrainSize(2).w + 1, y: 5, piecesLeft: 1 };
    expect(validateSave({ ...g, nextId: 100, food: [food] })).toBeNull();
  });

  it('invalid mapStep (negative, 9, fraction) is rejected', () => {
    const s = json(worldToSave(busyWorld(), EXTRA));
    for (const m of [-1, 9, 1.5, NaN, '1']) expect(validateSave({ ...s, mapStep: m }), String(m)).toBeNull();
  });

  it('rejects bad types of the other new fields', () => {
    const s = json(worldToSave(normalWorld(0), EXTRA));
    const ant = (s.ants as Record<string, unknown>[])[0];
    const bad: Record<string, unknown>[] = [
      { mode: 'hard' }, { mode: 1 }, { peakAnts: -1 }, { peakAnts: NaN }, { sugarReadyAt: Infinity }, { boostUntil: '1' }, { spawnTimer: NaN },
      { ants: [{ ...ant, major: false }] }, { ants: [{ ...ant, carrySugar: 1 }] },
    ];
    for (const patch of bad) expect(validateSave({ ...s, ...patch }), JSON.stringify(patch)).toBeNull();
  });
});

describe('spider fields', () => {
  const json = (s: SaveV1) => JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
  function spiderSave(): World {
    const w = World.create(21, 'normal');
    for (let i = 0; i < 4; i++) w.spawnAnt();
    w.spawnTimer = 1e9;
    w.step(STEP_S);
    w.spider!.eatT = 2.5;
    w.ants[1].x = w.spider!.x;
    w.ants[1].y = w.spider!.y;
    w.ants[1].caughtT = 3.25;
    return w;
  }

  it('round trip keeps spider state and caughtT', () => {
    const w = spiderSave();
    const r = worldFromSave(validateSave(json(worldToSave(w, EXTRA)))!);
    expect(r.spider).toEqual(w.spider);
    expect(r.ants[1].caughtT).toBe(3.25);
    expect(r.ants[0].caughtT).toBeUndefined();
  });

  it('round trip keeps a dead spider with its respawn clock', () => {
    const w = spiderSave();
    w.spider!.alive = false;
    w.spider!.respawnT = 321;
    for (const a of w.ants) delete a.caughtT;
    const r = worldFromSave(validateSave(json(worldToSave(w, EXTRA)))!);
    expect(r.spider).toEqual({ ...w.spider });
    expect(r.spider!.alive).toBe(false);
  });

  it('old save without spider loads fine (no spider yet, nobody caught)', () => {
    const w = spiderSave();
    const s = json(worldToSave(w, EXTRA));
    delete s.spider;
    for (const a of s.ants as Record<string, unknown>[]) delete a.caughtT;
    const r = worldFromSave(validateSave(s)!);
    expect(r.spider).toBeNull();
    expect(r.ants.every((a) => a.caughtT === undefined)).toBe(true);
    r.step(STEP_S);
    expect(r.spider).not.toBeNull();
  });

  it('a sandbox save has no spider; caughtT is dropped when there is no live spider', () => {
    const sb = World.create(3);
    sb.spawnAnt();
    sb.ants[0].caughtT = 1;
    const r = worldFromSave(validateSave(json(worldToSave(sb, EXTRA)))!);
    expect(r.spider).toBeNull();
    expect(r.ants[0].caughtT).toBeUndefined();
  });

  it('clamps a restored respawn clock to one full respawn', () => {
    const w = spiderSave();
    w.spider!.alive = false;
    w.spider!.respawnT = 1e9;
    for (const a of w.ants) delete a.caughtT;
    const r = worldFromSave(validateSave(json(worldToSave(w, EXTRA)))!);
    expect(r.spider!.respawnT).toBe(SPIDER_RESPAWN_S);
  });

  it('drops caughtT from ants that are inside the nest', () => {
    const w = spiderSave();
    w.ants[2].state = 'nest';
    w.ants[2].caughtT = 1;
    const r = worldFromSave(validateSave(json(worldToSave(w, EXTRA)))!);
    expect(r.ants[2].caughtT).toBeUndefined();
    expect(r.ants[1].caughtT).toBe(3.25);
  });

  it('invalid spider field is rejected', () => {
    const s = json(worldToSave(spiderSave(), EXTRA));
    const sp = s.spider as Record<string, unknown>;
    const bad: Record<string, unknown>[] = [
      { spider: null }, { spider: 5 }, { spider: { ...sp, x: NaN } }, { spider: { ...sp, y: -1 } }, { spider: { ...sp, x: WORLD_W + 1 } },
      { spider: { ...sp, alive: 1 } }, { spider: { ...sp, eatT: -1 } }, { spider: { ...sp, eatT: Infinity } },
      { spider: { ...sp, respawnT: '1' } }, { spider: { ...sp, corner: 2 } }, { spider: { ...sp, corner: 0.5 } },
    ];
    for (const patch of bad) expect(validateSave({ ...s, ...patch }), JSON.stringify(patch)).toBeNull();
    const ant = (s.ants as Record<string, unknown>[])[1];
    for (const caughtT of [-1, NaN, '1', null]) {
      expect(validateSave({ ...s, ants: [{ ...ant, caughtT }] }), String(caughtT)).toBeNull();
    }
  });
});
