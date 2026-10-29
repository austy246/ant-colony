import { describe, expect, it } from 'vitest';
import {
  CATERPILLAR_FLEE_MUL, CATERPILLAR_FLEE_S, CATERPILLAR_SPEED, NEST, STEP_S, TOUCH_COOLDOWN_S, WORLD_H, WORLD_W,
} from './constants';
import { FOOD_TABLE } from './food';
import { validateSave, worldFromSave, worldToSave, type SaveV1 } from './serialize';
import { Surface } from './terrain';
import { World } from './world';

const EXTRA = { introDone: true, camera: { x: 0, y: 0, zoom: 1 } };

function flatWorld(seed = 1): World {
  const w = World.create(seed);
  w.stock = 0;
  w.terrain.surface.fill(Surface.Ground);
  w.terrain.speed.fill(1);
  return w;
}

function run(w: World, seconds: number): void {
  const n = Math.round(seconds / STEP_S);
  for (let i = 0; i < n; i++) w.step(STEP_S);
}

/** A wandering ant `d` px from (x, y) in direction `angle`. */
function antAt(w: World, x: number, y: number, d = 2, angle = 0): ReturnType<World['spawnAnt']> {
  const a = w.spawnAnt();
  a.x = x + Math.cos(angle) * d;
  a.y = y + Math.sin(angle) * d;
  a.heading = angle + Math.PI;
  return a;
}

describe('caterpillar: constants and placement', () => {
  it('constants', () => {
    expect(CATERPILLAR_SPEED).toBe(2.5);
    expect(CATERPILLAR_FLEE_MUL).toBe(2.5);
    expect(CATERPILLAR_FLEE_S).toBe(5);
  });

  it('a placed caterpillar is alive with 0 touches, a heading and its 12 pieces', () => {
    const w = flatWorld(1);
    const c = w.placeFood('caterpillar', 150, 100)!;
    expect(c.alive).toBe(true);
    expect(c.touches).toBe(0);
    expect(Number.isFinite(c.heading)).toBe(true);
    expect(c.piecesLeft).toBe(FOOD_TABLE.caterpillar.pieces);
    expect(c.fleeT).toBeUndefined();
    expect(c.corpseOf).toBeUndefined();
  });
});

describe('caterpillar crawls', () => {
  it('moves at least 8 px away from its start within 20 s (5 seeds), never faster than CATERPILLAR_SPEED', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const w = flatWorld(seed);
      const c = w.placeFood('caterpillar', 200, 100)!;
      const { x: x0, y: y0 } = c;
      let far = 0;
      let px = c.x;
      let py = c.y;
      for (let i = 0; i < 20 / STEP_S; i++) {
        w.step(STEP_S);
        far = Math.max(far, Math.hypot(c.x - x0, c.y - y0));
        expect(Math.hypot(c.x - px, c.y - py)).toBeLessThanOrEqual(CATERPILLAR_SPEED * STEP_S + 1e-9);
        px = c.x;
        py = c.y;
      }
      expect(far, `seed ${seed}`).toBeGreaterThanOrEqual(8);
    }
  });

  it('is slowed by the ground like an ant (speedAt)', () => {
    const w = flatWorld(2);
    w.terrain.speed.fill(0.5);
    const c = w.placeFood('caterpillar', 200, 100)!;
    let len = 0;
    let px = c.x;
    let py = c.y;
    for (let i = 0; i < 10 / STEP_S; i++) {
      w.step(STEP_S);
      len += Math.hypot(c.x - px, c.y - py);
      px = c.x;
      py = c.y;
    }
    expect(len).toBeLessThanOrEqual(CATERPILLAR_SPEED * 0.5 * 10 + 0.01);
    expect(len).toBeGreaterThan(2);
  });

  it('pauses now and then (stands still for at least one second somewhere in 60 s)', () => {
    let paused = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const w = flatWorld(seed);
      const c = w.placeFood('caterpillar', 200, 100)!;
      let still = 0;
      let longest = 0;
      for (let i = 0; i < 60 / STEP_S; i++) {
        const { x, y } = c;
        w.step(STEP_S);
        still = c.x === x && c.y === y ? still + STEP_S : 0;
        longest = Math.max(longest, still);
      }
      if (longest >= 1 - 1e-6) paused++;
    }
    expect(paused).toBeGreaterThanOrEqual(4);
  });

  it('stays inside the map and never enters the nest radius + 4 in 60 s (5 seeds, started beside the nest and in corners)', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const w = flatWorld(seed);
      const near = w.placeFood('caterpillar', NEST.x + NEST.r + 5, NEST.y)!;
      const corner = w.placeFood('caterpillar', 1, 1)!;
      const edge = w.placeFood('caterpillar', WORLD_W - 1, WORLD_H - 1)!;
      for (let i = 0; i < 60 / STEP_S; i++) {
        w.step(STEP_S);
        for (const c of [near, corner, edge]) {
          expect(c.x).toBeGreaterThanOrEqual(0);
          expect(c.x).toBeLessThan(WORLD_W);
          expect(c.y).toBeGreaterThanOrEqual(0);
          expect(c.y).toBeLessThan(WORLD_H);
          expect(Math.hypot(c.x - NEST.x, c.y - NEST.y)).toBeGreaterThanOrEqual(NEST.r + 4 - 1e-9);
        }
      }
    }
  });

  it('never ends on a stone or big-twig cell (real terrain, 5 seeds)', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const w = World.create(seed);
      const t = w.terrain;
      const cats = [];
      for (let y = 0; y < t.h && cats.length < 12; y += 7) {
        for (let x = 0; x < t.w && cats.length < 12; x += 7) {
          const s = t.surface[y * t.w + x];
          if (s === Surface.Stone || s === Surface.BigTwig) {
            const c = w.placeFood('caterpillar', x + 6, y);
            if (c) cats.push(c);
          }
        }
      }
      expect(cats.length).toBeGreaterThan(0);
      for (let i = 0; i < 60 / STEP_S; i++) {
        w.step(STEP_S);
        for (const c of cats) {
          const s = t.surface[Math.floor(c.y) * t.w + Math.floor(c.x)];
          expect(s === Surface.Stone || s === Surface.BigTwig, `seed ${seed}`).toBe(false);
        }
      }
    }
  });
});

describe('first touch: the caterpillar speeds up', () => {
  it('fleeT is set, the touching ant is not hurt and keeps chasing the same caterpillar; the caterpillar lives with touches 1', () => {
    const w = flatWorld(3);
    const c = w.placeFood('caterpillar', 150, 100)!;
    const a = antAt(w, c.x, c.y);
    w.step(STEP_S);
    expect(c.touches).toBe(1);
    expect(c.alive).toBe(true);
    expect(c.kind).toBe('caterpillar');
    expect(c.fleeT).toBeCloseTo(CATERPILLAR_FLEE_S, 6);
    expect(w.ants).toEqual([a]);
    expect(w.antsKilled).toBe(0);
    expect(a.state).toBe('toFood');
    expect(a.targetFood).toBe(c.id);
    expect(c.piecesLeft).toBe(12);
  });

  it('the heading is turned away from the touching ant (dot product > 0.3, ants at 8 angles, caterpillar initially facing the ant)', () => {
    for (let k = 0; k < 8; k++) {
      const angle = (k / 8) * Math.PI * 2 - Math.PI;
      const w = flatWorld(10 + k);
      const c = w.placeFood('caterpillar', 150, 100)!;
      c.heading = angle; // walking straight at the ant that is about to touch it
      const a = antAt(w, c.x, c.y, 2, angle);
      w.step(STEP_S);
      expect(c.touches, `angle ${angle}`).toBe(1);
      const away = [-Math.cos(angle), -Math.sin(angle)];
      const dot = Math.cos(c.heading!) * away[0] + Math.sin(c.heading!) * away[1];
      expect(dot, `angle ${angle}`).toBeGreaterThan(0.3);
      expect(a.state).toBe('toFood');
    }
  });

  it('afterwards it crawls about CATERPILLAR_FLEE_MUL (2.5x) faster for the next 3 s than its normal speed', () => {
    const lengthOf = (touch: boolean): number => {
      const w = flatWorld(4);
      const c = w.placeFood('caterpillar', 150, 100)!;
      if (touch) {
        antAt(w, c.x, c.y);
        w.step(STEP_S);
        expect(c.fleeT).toBeGreaterThan(0);
        w.ants.length = 0; // nobody else interferes (the rescue ant comes after 15 s)
      }
      let len = 0;
      let px = c.x;
      let py = c.y;
      for (let i = 0; i < 3 / STEP_S; i++) {
        w.step(STEP_S);
        len += Math.hypot(c.x - px, c.y - py);
        px = c.x;
        py = c.y;
      }
      return len;
    };
    const normal = lengthOf(false);
    const fleeing = lengthOf(true);
    expect(normal).toBeLessThanOrEqual(CATERPILLAR_SPEED * 3 + 0.01);
    expect(fleeing / (CATERPILLAR_SPEED * 3)).toBeGreaterThan(CATERPILLAR_FLEE_MUL * 0.95);
    expect(fleeing / (CATERPILLAR_SPEED * 3)).toBeLessThanOrEqual(CATERPILLAR_FLEE_MUL + 1e-6);
    expect(fleeing).toBeGreaterThan(normal * 2);
  });

  it('the flight lasts CATERPILLAR_FLEE_S (5 s), then it crawls at the normal pace again; fleeT is not saved', () => {
    const w = flatWorld(5);
    const c = w.placeFood('caterpillar', 150, 100)!;
    antAt(w, c.x, c.y);
    w.step(STEP_S);
    w.ants.length = 0;
    run(w, 4.5);
    expect(c.fleeT).toBeGreaterThan(0);
    const s = JSON.parse(JSON.stringify(worldToSave(w, EXTRA))) as SaveV1;
    expect('fleeT' in s.food[0]).toBe(false);
    expect(worldFromSave(validateSave(s)!).food[0].fleeT).toBeUndefined();
    run(w, 0.7);
    expect(c.fleeT ?? 0).toBeLessThanOrEqual(0);
    let px = c.x;
    let py = c.y;
    for (let i = 0; i < 5 / STEP_S; i++) {
      w.step(STEP_S);
      expect(Math.hypot(c.x - px, c.y - py)).toBeLessThanOrEqual(CATERPILLAR_SPEED * STEP_S + 1e-9);
      px = c.x;
      py = c.y;
    }
  });

  it('two ants arriving in the same substep count as ONE touch; the second touch comes after the cooldown', () => {
    const w = flatWorld(6);
    const c = w.placeFood('caterpillar', 150, 100)!;
    antAt(w, c.x, c.y, 2, 0);
    antAt(w, c.x, c.y, 2.2, 0.3);
    w.step(STEP_S);
    expect(c.touches).toBe(1);
    expect(c.alive).toBe(true);
    run(w, TOUCH_COOLDOWN_S - 0.3); // still within the cooldown
    expect(c.touches).toBe(1);
    expect(w.ants).toHaveLength(2);
    for (let i = 0; i < 15 / STEP_S && c.alive; i++) w.step(STEP_S);
    expect(c.touches).toBe(2);
    expect(c.alive).toBe(false);
    expect(w.antsKilled).toBe(0);
    expect(w.ants).toHaveLength(2);
  });

  it('only wander / toFood ants touch it: a carrying ant standing on it does nothing', () => {
    const w = flatWorld(7);
    const c = w.placeFood('caterpillar', 150, 100)!;
    const a = antAt(w, c.x, c.y, 1);
    a.state = 'carry';
    a.carry = 1;
    w.step(STEP_S);
    expect(c.touches).toBe(0);
  });
});

describe('second touch: the caterpillar dies', () => {
  it('becomes carrion with corpseOf caterpillar and 12 pieces; the touching ant survives and goes for the corpse', () => {
    const w = flatWorld(8);
    const c = w.placeFood('caterpillar', 150, 100)!;
    antAt(w, c.x, c.y);
    w.step(STEP_S);
    w.ants.length = 0;
    run(w, 1); // cooldown over
    const second = antAt(w, c.x, c.y);
    w.step(STEP_S);
    expect(c.alive).toBe(false);
    expect(c.kind).toBe('carrion');
    expect(c.corpseOf).toBe('caterpillar');
    expect(c.piecesLeft).toBe(12);
    expect(c.touches).toBe(2);
    expect(c.fleeT).toBeUndefined();
    expect(w.ants).toEqual([second]);
    expect(second.state).toBe('toFood');
    expect(second.targetFood).toBe(c.id);
    expect(w.antsKilled).toBe(0);
  });

  it('the corpse does not move any more and can be gnawed and carried (4 ants, end to end)', () => {
    let delivered = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const w = flatWorld(seed);
      const c = w.placeFood('caterpillar', NEST.x + 30, NEST.y)!;
      for (let i = 0; i < 4; i++) w.spawnAnt();
      run(w, 150);
      if (!c.alive) {
        expect(c.corpseOf).toBe('caterpillar');
        if (w.totalDelivered > 0) delivered++;
      }
    }
    expect(delivered).toBeGreaterThanOrEqual(3);
  }, 30_000);
});

describe('save: caterpillar', () => {
  const base = (): { w: World; s: Record<string, unknown> } => {
    const w = World.create(5);
    w.spawnAnt();
    const c = w.placeFood('caterpillar', 150, 100)!;
    c.touches = 1;
    c.fleeT = 3; // transient
    return { w, s: JSON.parse(JSON.stringify(worldToSave(w, EXTRA))) as Record<string, unknown> };
  };

  it('an alive caterpillar round-trips (alive, touches, heading) without its transient fleeT, and keeps crawling', () => {
    const { w, s } = base();
    const r = worldFromSave(validateSave(s)!);
    const rc = r.food[0];
    expect(rc.kind).toBe('caterpillar');
    expect(rc.alive).toBe(true);
    expect(rc.touches).toBe(1);
    expect(rc.heading).toBe(w.food[0].heading);
    expect(rc.fleeT).toBeUndefined();
    const { x, y } = rc;
    run(r, 15);
    expect(Math.hypot(rc.x - x, rc.y - y)).toBeGreaterThan(1);
  });

  it('the validator accepts corpseOf caterpillar and rejects corpseOf berry', () => {
    const { s } = base();
    const food = (s.food as Record<string, unknown>[])[0];
    expect(validateSave({ ...s, food: [{ ...food, kind: 'carrion', alive: false, corpseOf: 'caterpillar' }] })).not.toBeNull();
    for (const bad of ['berry', 'mushroom', 'carrion', 'cat']) {
      expect(validateSave({ ...s, food: [{ ...food, kind: 'carrion', corpseOf: bad }] }), bad).toBeNull();
    }
    const r = worldFromSave(validateSave({ ...s, food: [{ ...food, kind: 'carrion', alive: false, corpseOf: 'caterpillar', piecesLeft: 7 }] })!);
    expect(r.food[0].corpseOf).toBe('caterpillar');
    expect(r.food[0].piecesLeft).toBe(7);
  });

  it('old saves hold a caterpillar without `alive`: plain, gnawable food (nothing walks, no touch)', () => {
    const { s } = base();
    const food = { ...(s.food as Record<string, unknown>[])[0] };
    delete food.alive;
    delete food.touches;
    delete food.heading;
    const r = worldFromSave(validateSave({ ...s, food: [food] })!);
    const rc = r.food[0];
    const { x, y } = rc;
    run(r, 20);
    expect(rc.x).toBe(x);
    expect(rc.y).toBe(y);
  });
});
