import { describe, expect, it } from 'vitest';
import {
  MAJOR_CARRY_PIECES, MAJOR_CHANCE, MAJOR_MAX_FRACTION, MAJOR_MIN_ANTS, STEP_S, TOUCH_DIST,
} from './constants';
import { FOOD_TABLE } from './food';
import { Surface } from './terrain';
import { World, type Ant } from './world';

function flatWorld(seed = 1, mode: 'sandbox' | 'normal' = 'sandbox'): World {
  const w = World.create(seed, mode);
  w.stock = 0;
  w.terrain.surface.fill(Surface.Ground);
  w.terrain.speed.fill(1);
  return w;
}

/** Force exactly one hatch now (plenty of food, cycle already complete). */
function hatchOnce(w: World): void {
  w.started = true;
  w.stock = 1000;
  w.hatchProgress = 1e9;
  (w as unknown as { hatch(): void }).hatch();
}

function antAt(w: World, x: number, y: number, d = 2, angle = 0): Ant {
  const a = w.spawnAnt();
  a.x = x + Math.cos(angle) * d;
  a.y = y + Math.sin(angle) * d;
  a.heading = angle + Math.PI;
  return a;
}

function majorAt(w: World, x: number, y: number, d = 2, angle = 0): Ant {
  const a = antAt(w, x, y, d, angle);
  a.major = true;
  return a;
}

describe('major ants: constants', () => {
  it('constants', () => {
    expect(MAJOR_MIN_ANTS).toBe(50);
    expect(MAJOR_CHANCE).toBe(0.08);
    expect(MAJOR_MAX_FRACTION).toBe(0.1);
    expect(MAJOR_CARRY_PIECES).toBe(2);
  });
});

describe('major ants: hatching', () => {
  it('no major hatches below 50 ants', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const w = flatWorld(seed, 'normal');
      for (let i = 0; i < 300 && w.ants.length < MAJOR_MIN_ANTS - 1; i++) hatchOnce(w);
      expect(w.ants.length).toBe(MAJOR_MIN_ANTS - 1);
      expect(w.majors).toBe(0);
    }
  });

  it('majors appear from 50 ants and never exceed MAJOR_MAX_FRACTION', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const w = flatWorld(seed, 'normal');
      while (w.ants.length < 400) {
        hatchOnce(w);
        expect(w.majors).toBeLessThanOrEqual(Math.ceil(w.ants.length * MAJOR_MAX_FRACTION));
      }
      expect(w.majors).toBeGreaterThan(0);
      for (const a of w.ants) if (a.major) expect(w.ants.indexOf(a)).toBeGreaterThanOrEqual(MAJOR_MIN_ANTS - 1);
    }
  });
});

describe('major ants: touching prey', () => {
  it('major kills a beetle on first touch and survives', () => {
    const w = flatWorld(1);
    const b = w.placeFood('beetle', 150, 100)!;
    b.touches = 0;
    const m = majorAt(w, b.x, b.y);
    w.step(STEP_S);
    expect(b.kind).toBe('carrion');
    expect(b.corpseOf).toBe('beetle');
    expect(w.ants).toContain(m);
    expect(w.antsKilled).toBe(0);
  });

  it('major kills a fly and a caterpillar on first touch', () => {
    for (const kind of ['fly', 'caterpillar'] as const) {
      const w = flatWorld(1);
      const f = w.placeFood(kind, 150, 100)!;
      const m = majorAt(w, f.x, f.y);
      w.step(STEP_S);
      expect(f.kind).toBe('carrion');
      expect(f.corpseOf).toBe(kind);
      expect(f.piecesLeft).toBe(FOOD_TABLE[kind].pieces);
      expect(m.state).toBe('toFood');
      expect(m.targetFood).toBe(f.id);
    }
  });

  it('major touches through a touch cooldown', () => {
    const w = flatWorld(1);
    const b = w.placeFood('beetle', 150, 100)!;
    b.cooldown = 0.5;
    majorAt(w, b.x, b.y);
    w.step(STEP_S);
    expect(b.kind).toBe('carrion');
    expect(b.corpseOf).toBe('beetle');
  });

  it('major wins a simultaneous touch', () => {
    const w = flatWorld(1);
    const b = w.placeFood('beetle', 150, 100)!;
    const ordinary = antAt(w, b.x, b.y, 1, 0);
    const m = majorAt(w, b.x, b.y, 1.5, 1);
    expect(w.ants.indexOf(ordinary)).toBeLessThan(w.ants.indexOf(m));
    expect(Math.hypot(ordinary.x - b.x, ordinary.y - b.y)).toBeLessThanOrEqual(TOUCH_DIST);
    w.step(STEP_S);
    expect(w.ants).toContain(ordinary);
    expect(w.antsKilled).toBe(0);
    expect(b.kind).toBe('carrion');
  });
});

describe('major ants: carrying', () => {
  function gnawing(w: World, ant: Ant, piecesLeft: number) {
    const f = w.placeFood('carrion', 150, 100)!;
    f.piecesLeft = piecesLeft;
    ant.state = 'gnaw';
    ant.targetFood = f.id;
    ant.timer = 0;
    return f;
  }

  it('major carries two pieces', () => {
    const w = flatWorld(1);
    const m = majorAt(w, 150, 100, 0);
    const f = gnawing(w, m, 10);
    w.step(STEP_S);
    expect(m.state).toBe('carry');
    expect(m.carry).toBeCloseTo(2 * FOOD_TABLE.carrion.value);
    expect(f.piecesLeft).toBe(8);
  });

  it('with one piece left a major takes only one; ordinary ant takes one', () => {
    const w = flatWorld(1);
    const m = majorAt(w, 150, 100, 0);
    const f = gnawing(w, m, 1);
    w.step(STEP_S);
    expect(m.carry).toBeCloseTo(FOOD_TABLE.carrion.value);
    expect(w.food).not.toContain(f);

    const w2 = flatWorld(1);
    const a = antAt(w2, 150, 100, 0);
    const f2 = gnawing(w2, a, 10);
    w2.step(STEP_S);
    expect(a.carry).toBeCloseTo(FOOD_TABLE.carrion.value);
    expect(f2.piecesLeft).toBe(9);
  });
});
