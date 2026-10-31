import { describe, expect, it, vi } from 'vitest';
import { FOOD_PER_ANT, SUPER_CARRY_PIECES, SUPER_MAJOR_EVERY, SUPER_WIN_P, STEP_S, ULTRA_CARRY_PIECES, ULTRA_MAJOR_EVERY, ULTRA_WIN_P } from './constants';
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

describe('ultra majors', () => {
  it('one ultra major hatches for every ULTRA_MAJOR_EVERY ants (and never a second one before the next thousand)', () => {
    const w = colonyOf(5, ULTRA_MAJOR_EVERY - 4);
    expect(w.ultras).toBe(0);
    let guard = 0;
    while (w.ants.length < ULTRA_MAJOR_EVERY + 6 && guard++ < 4000) w.step(0.5);
    expect(w.ants.length).toBeGreaterThanOrEqual(ULTRA_MAJOR_EVERY);
    expect(w.ultras).toBe(1);
    const u = w.ants.find((a) => a.ultraMajor)!;
    expect(u.major).toBe(true);
    expect(u.superMajor).toBeUndefined(); // an ultra major is not also a super major
  });

  it('an ultra major carries ULTRA_CARRY_PIECES pieces and almost never loses a duel', () => {
    const w = colonyOf(6, 1);
    const food = w.placeFood('berry', 150, 100)!;
    food.piecesLeft = 30;
    const a = w.ants[0];
    a.major = true;
    a.ultraMajor = true;
    a.x = 150;
    a.y = 100;
    a.state = 'gnaw';
    a.targetFood = food.id;
    a.timer = 0;
    w.step(0.1);
    expect(a.carry).toBeCloseTo(ULTRA_CARRY_PIECES * 1, 6);
    let wins = 0;
    const n = 80;
    for (let seed = 1; seed <= n; seed++) {
      const v = colonyOf(seed, 1);
      v.noRaid = false;
      const b = v.ants[0];
      b.major = true;
      b.ultraMajor = true;
      b.x = 150;
      b.y = 100;
      v.reds.push({ id: 9000, x: 152, y: 100, heading: 0 });
      run(v, 4);
      if (v.ants.includes(b)) wins++;
    }
    expect(ULTRA_WIN_P).toBeGreaterThan(SUPER_WIN_P);
    expect(wins / n).toBeGreaterThan(0.97);
  });

  it('an ultra major alone overpowers the spider', () => {
    const w = World.create(7, 'normal');
    w.noRaid = true;
    w.spawnTimer = 1e9;
    w.stock = 100;
    const a = w.spawnAnt();
    w.step(STEP_S); // the spider appears
    a.major = true;
    a.ultraMajor = true;
    a.x = w.spider!.x + 3;
    a.y = w.spider!.y;
    w.step(STEP_S);
    expect(w.spider!.alive).toBe(false);
  });

  it('ultra majors survive a save; they must be majors and not super majors', () => {
    const w = colonyOf(8, 3);
    w.ants[0].major = true;
    w.ants[0].ultraMajor = true;
    const save = JSON.parse(JSON.stringify(worldToSave(w, { introDone: true, camera: { x: 0, y: 0, zoom: 4 } })));
    const v = validateSave(save);
    expect(v).not.toBeNull();
    expect(worldFromSave(v!).ants[0].ultraMajor).toBe(true);
    save.ants[0].superMajor = true;
    expect(validateSave(save)).toBeNull();
  });
});
