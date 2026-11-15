import { describe, expect, it } from 'vitest';
import { antKind, antRarity, RARITY_NAMES } from './collection';
import { TERRARIUM_MAX } from './constants';
import { validateSave, worldFromSave, worldToSave } from './serialize';
import { World } from './world';

const plain = (id: number) => ({ id });

describe('ant collection: rarity and names', () => {
  it('has ten rarities', () => {
    expect(RARITY_NAMES).toHaveLength(10);
  });

  it('is the same for the same id and seed, and differs between seeds', () => {
    for (let id = 1; id < 50; id++) expect(antRarity(7, plain(id))).toBe(antRarity(7, plain(id)));
    const a = Array.from({ length: 200 }, (_, i) => antRarity(1, plain(i)));
    const b = Array.from({ length: 200 }, (_, i) => antRarity(2, plain(i)));
    expect(a).not.toEqual(b);
  });

  it('common ants are common and the top rarity is very rare', () => {
    const n = 20000;
    const count = new Array(10).fill(0);
    for (let id = 0; id < n; id++) count[antRarity(42, plain(id))]++;
    for (let r = 1; r < 10; r++) expect(count[r]).toBeLessThan(count[r - 1] * 1.25); // falling, with noise
    expect(count[0] / n).toBeGreaterThan(0.25);
    expect(count[9] / n).toBeLessThan(0.006);
    expect(count[9]).toBeGreaterThan(0);
  });

  it('majors and super majors are better, and never above the top', () => {
    let w = 0;
    let m = 0;
    let s = 0;
    for (let id = 0; id < 5000; id++) {
      w += antRarity(3, plain(id));
      m += antRarity(3, { id, major: true });
      s += antRarity(3, { id, major: true, superMajor: true });
      expect(antRarity(3, { id, major: true, superMajor: true })).toBeLessThanOrEqual(9);
    }
    expect(m).toBeGreaterThan(w + 5000);
    expect(s).toBeGreaterThan(m + 5000);
    expect(antKind({})).toBe('Dělnice');
    expect(antKind({ major: true })).toBe('Major');
    expect(antKind({ major: true, superMajor: true })).toBe('Super major');
  });
});

describe('terrarium', () => {
  const world = (n: number): World => {
    const w = World.create(5, 'normal');
    w.noSpider = true;
    w.noRaid = true;
    w.addAnts(n);
    return w;
  };

  it('stores an ant out of the colony and lets it out again, unchanged', () => {
    const w = world(10);
    const a = w.ants[3];
    a.major = true;
    a.age = 123;
    const id = a.id;
    const speed = a.speedMul;
    w.selectedAntId = id;
    expect(w.storeAnt(id)).toBe(true);
    expect(w.ants.some((x) => x.id === id)).toBe(false);
    expect(w.ants).toHaveLength(9);
    expect(w.terrarium).toHaveLength(1);
    expect(w.selectedAntId).toBeNull();
    expect(w.storeAnt(id)).toBe(false); // already gone
    expect(w.releaseAnt(id)).toBe(true);
    const back = w.ants.find((x) => x.id === id)!;
    expect(back.major).toBe(true);
    expect(back.age).toBe(123);
    expect(back.speedMul).toBe(speed);
    expect(back.state).toBe('wander');
    expect(w.terrarium).toHaveLength(0);
    expect(w.releaseAnt(id)).toBe(false);
  });

  it('holds at most TERRARIUM_MAX ants', () => {
    const w = world(TERRARIUM_MAX + 5);
    for (let i = 0; i < TERRARIUM_MAX; i++) expect(w.storeAnt(w.ants[0].id)).toBe(true);
    expect(w.terrarium).toHaveLength(TERRARIUM_MAX);
    expect(w.storeAnt(w.ants[0].id)).toBe(false);
    expect(w.ants).toHaveLength(5);
  });

  it('does not take an ant that is in a duel', () => {
    const w = world(3);
    w.ants[0].duelT = 2;
    expect(w.storeAnt(w.ants[0].id)).toBe(false);
  });

  it('is saved and loaded, and a bad entry is refused', () => {
    const w = world(8);
    w.ants[0].major = true;
    const id = w.ants[0].id;
    w.storeAnt(id);
    const save = JSON.parse(JSON.stringify(worldToSave(w, { introDone: true, camera: { x: 0, y: 0, zoom: 1 } })));
    expect(save.terrarium).toHaveLength(1);
    const back = worldFromSave(save);
    expect(back.terrarium).toEqual(w.terrarium);
    expect(back.ants).toHaveLength(7);
    expect(validateSave({ ...save, terrarium: [{ id: 1 }] })).toBeNull();
  });
});
