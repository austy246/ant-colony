import { describe, expect, it, vi } from 'vitest';
import { FOOD_PER_ANT, SUPER_CARRY_PIECES, SUPER_MAJOR_EVERY, SUPER_WIN_P, STEP_S } from './constants';
import { validateSave, worldFromSave, worldToSave } from './serialize';
import { Surface } from './terrain';
import { World } from './world';

vi.setConfig({ testTimeout: 120_000 });

function run(w: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / STEP_S); i++) w.step(STEP_S);
}

function colonyOf(seed: number, ants: number): World {
  const w = World.create(seed, 'normal');
  w.noSpider = true;
  w.noRaid = true;
  w.spawnTimer = 1e9;
  w.stock = 1e6;
  w.terrain.surface.fill(Surface.Ground);
  w.terrain.speed.fill(1);
  for (let i = 0; i < ants; i++) w.spawnAnt();
  return w;
}

describe('super majors', () => {
  it('one super major hatches for every SUPER_MAJOR_EVERY ants of the colony, and it is also a major', () => {
    const w = colonyOf(1, 2 * SUPER_MAJOR_EVERY - 5);
    expect(w.supers).toBe(0);
    let guard = 0;
    while (w.ants.length < 2 * SUPER_MAJOR_EVERY + 6 && guard++ < 4000) w.step(0.5);
    expect(w.ants.length).toBeGreaterThanOrEqual(2 * SUPER_MAJOR_EVERY + 1);
    expect(w.supers).toBe(Math.floor(w.ants.length / SUPER_MAJOR_EVERY));
    for (const a of w.ants) if (a.superMajor) expect(a.major).toBe(true);
    expect(FOOD_PER_ANT).toBeGreaterThan(0);
  });

  it('none in a small colony', () => {
    const w = colonyOf(2, 40);
    let guard = 0;
    while (w.ants.length < 90 && guard++ < 4000) w.step(0.5);
    expect(w.supers).toBe(0);
  });

  it('a super major takes SUPER_CARRY_PIECES pieces of food at once, a major only two', () => {
    const w = colonyOf(3, 2);
    const food = w.placeFood('berry', 150, 100)!;
    food.piecesLeft = 20;
    const [sup, maj] = w.ants;
    sup.major = true;
    sup.superMajor = true;
    maj.major = true;
    for (const [a, y] of [[sup, 100], [maj, 100]] as const) {
      a.x = 150;
      a.y = y;
      a.state = 'gnaw';
      a.targetFood = food.id;
      a.timer = 0;
    }
    w.step(0.1);
    expect(sup.carry).toBeCloseTo(SUPER_CARRY_PIECES * 1, 6);
    expect(maj.carry).toBeCloseTo(2, 6);
  });

  it('a super major wins a duel with a red ant almost always', () => {
    let wins = 0;
    const n = 80;
    for (let seed = 1; seed <= n; seed++) {
      const w = colonyOf(seed, 1);
      w.noRaid = false;
      const a = w.ants[0];
      a.major = true;
      a.superMajor = true;
      a.x = 150;
      a.y = 100;
      w.reds.push({ id: 9000, x: 152, y: 100, heading: 0 });
      run(w, 4);
      if (w.ants.includes(a)) wins++;
    }
    expect(SUPER_WIN_P).toBeGreaterThan(0.95);
    expect(wins / n).toBeGreaterThan(0.93);
  });

  it('super majors survive a save and a load', () => {
    const w = colonyOf(4, 3);
    w.ants[0].major = true;
    w.ants[0].superMajor = true;
    const save = JSON.parse(JSON.stringify(worldToSave(w, { introDone: true, camera: { x: 0, y: 0, zoom: 4 } })));
    const v = validateSave(save);
    expect(v).not.toBeNull();
    expect(worldFromSave(v!).ants[0].superMajor).toBe(true);
    save.ants[1].superMajor = true; // not a major: invalid
    expect(validateSave(save)).toBeNull();
  });
});
