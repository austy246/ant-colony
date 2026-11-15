import { describe, expect, it } from 'vitest';
import { antRarity, idWithRarity, wheelChances, wheelRarity } from './collection';
import { WHEEL_EVERY } from './constants';
import { validateSave, worldFromSave, worldToSave } from './serialize';
import { World } from './world';

const EXTRA = { introDone: true, camera: { x: 0, y: 0, zoom: 1 } };

const make = (): World => {
  const w = World.create(5, 'normal');
  w.noSpider = true;
  w.noRaid = true;
  return w;
};

describe('wheel of fortune', () => {
  it('the chances sum to 1 and favour the rare ones more than the ordinary draw does', () => {
    const c = wheelChances();
    expect(c).toHaveLength(12);
    expect(c.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    for (let i = 1; i < c.length; i++) expect(c[i]).toBeLessThan(c[i - 1]);
    expect(c[11]).toBeGreaterThan(5 / 100000 * 200); // Rainbow: at least 200 times likelier than for a normally born ant
    expect(c[9] + c[10] + c[11]).toBeGreaterThan(0.04);
    expect(c[0]).toBeLessThan(0.25); // an Obyčejný ant is no longer the usual result
  });

  it('wheelRarity follows those chances, and is the same for the same seed and spin', () => {
    const n = 40000;
    const count = new Array(12).fill(0);
    for (let i = 0; i < n; i++) count[wheelRarity(3, i)]++;
    const c = wheelChances();
    for (let r = 0; r < 6; r++) expect(Math.abs(count[r] / n - c[r])).toBeLessThan(0.01);
    expect(wheelRarity(3, 17)).toBe(wheelRarity(3, 17));
  });

  it('finds an id with the wanted rarity', () => {
    for (let r = 0; r < 10; r++) {
      const id = idWithRarity(5, 100, r)!;
      expect(id).toBeGreaterThanOrEqual(100);
      expect(antRarity(5, { id })).toBe(r);
    }
  });

  it('every WHEEL_EVERY births charge one spin, and the spin brings one ant of the rarity it landed on', () => {
    const w = make();
    w.addAnts(WHEEL_EVERY - 1);
    expect(w.wheels).toBe(0);
    expect(w.spinWheel()).toBeNull();
    w.addAnts(1);
    expect(w.wheels).toBe(1);
    const before = w.ants.length;
    const out = w.spinWheel()!;
    expect(out).not.toBeNull();
    expect(w.ants).toHaveLength(before + 1);
    expect(w.ants).toContain(out.ant);
    expect(out.rarity).toBe(antRarity(w.terrain.seed, out.ant));
    expect(out.rarity).toBe(wheelRarity(w.terrain.seed, 0));
    expect(w.wheels).toBe(0);
    expect(w.spins).toBe(1);
    // the wheel's ant does not charge a further spin
    w.addAnts(WHEEL_EVERY - 1);
    expect(w.wheels).toBe(0);
    w.addAnts(1);
    expect(w.wheels).toBe(1);
    // the ids stay unique and below nextId
    expect(new Set(w.ants.map((a) => a.id)).size).toBe(w.ants.length);
    for (const a of w.ants) expect(a.id).toBeLessThan(w.nextId);
  });

  it('spins in a row give the rarities the wheel drew', () => {
    const w = make();
    w.addAnts(100);
    expect(w.wheels).toBe(10);
    for (let i = 0; i < 10; i++) expect(w.spinWheel()!.rarity).toBe(wheelRarity(w.terrain.seed, i));
    expect(w.spinWheel()).toBeNull();
  });

  it('is saved, and a bad value is refused', () => {
    const w = make();
    w.addAnts(25);
    w.spinWheel();
    const save = JSON.parse(JSON.stringify(worldToSave(w, EXTRA)));
    expect(validateSave(save)).not.toBeNull();
    const b = worldFromSave(save);
    expect([b.births, b.wheels, b.spins]).toEqual([w.births, w.wheels, w.spins]);
    expect(validateSave({ ...save, wheels: -1 })).toBeNull();
  });
});
