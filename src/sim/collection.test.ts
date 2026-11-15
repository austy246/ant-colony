import { describe, expect, it } from 'vitest';
import { antKind, antRarity, rarityBonus, RARITY_NAMES } from './collection';
import { CURIOSITY_MIN, RARITY_STAT_STEP, SPEED_MUL_MAX, SPEED_MUL_MIN, STUBBORNNESS_MAX, TERRARIUM_MAX } from './constants';
import { validateSave, worldFromSave, worldToSave } from './serialize';
import { World } from './world';

const plain = (id: number) => ({ id });

describe('ant collection: rarity', () => {
  it('has twelve rarities, the last being Rainbow', () => {
    expect(RARITY_NAMES).toHaveLength(12);
    expect(RARITY_NAMES[11]).toBe('Rainbow');
  });

  it('is the same for the same id and seed, and differs between seeds', () => {
    for (let id = 1; id < 50; id++) expect(antRarity(7, plain(id))).toBe(antRarity(7, plain(id)));
    const a = Array.from({ length: 200 }, (_, i) => antRarity(1, plain(i)));
    const b = Array.from({ length: 200 }, (_, i) => antRarity(2, plain(i)));
    expect(a).not.toEqual(b);
  });

  it('common ants are common and the top rarities are very rare', () => {
    const n = 400000;
    const count = new Array(12).fill(0);
    for (let id = 0; id < n; id++) count[antRarity(42, plain(id))]++;
    for (let r = 1; r < 8; r++) expect(count[r]).toBeLessThan(count[r - 1]); // falling
    expect(count[0] / n).toBeGreaterThan(0.33);
    expect((count[9] + count[10] + count[11]) / n).toBeLessThan(0.0015); // Božský and above together: well under 1 in 600
    expect(count[11]).toBeLessThan(count[10] + 6);
    expect(count[11] / n).toBeLessThan(0.0002);
  });

  it('a major or super major has no advantage', () => {
    for (let id = 0; id < 500; id++) {
      expect(antRarity(3, plain(id))).toBe(antRarity(3, plain(id)));
    }
    expect(antKind({})).toBe('Dělnice');
    expect(antKind({ major: true })).toBe('Major');
    expect(antKind({ major: true, superMajor: true })).toBe('Super major');
  });

  it('every rank adds RARITY_STAT_STEP to the stats: Obyčejný none, Rainbow the most', () => {
    expect(rarityBonus(0)).toBe(1);
    expect(rarityBonus(11)).toBeCloseTo(1 + 11 * RARITY_STAT_STEP, 9);
    for (let r = 1; r < 12; r++) expect(rarityBonus(r)).toBeGreaterThan(rarityBonus(r - 1));
  });

  it('a newborn ant has its stats multiplied by the bonus of its own rarity', () => {
    const w = World.create(5, 'normal');
    w.noSpider = true;
    w.noRaid = true;
    w.addAnts(300);
    for (const a of w.ants) {
      const b = rarityBonus(antRarity(w.terrain.seed, a));
      expect(a.speedMul).toBeGreaterThanOrEqual(SPEED_MUL_MIN * b - 1e-9);
      expect(a.speedMul).toBeLessThanOrEqual(SPEED_MUL_MAX * b + 1e-9);
      expect(a.curiosity).toBeGreaterThanOrEqual(CURIOSITY_MIN * b - 1e-9);
      expect(a.stubbornness).toBeLessThanOrEqual(STUBBORNNESS_MAX * b + 1e-9);
    }
    const best = Math.max(...w.ants.map((a) => antRarity(w.terrain.seed, a)));
    expect(best).toBeGreaterThan(3);
  });

  it('an older save gets the bonus once when loaded, not again after the next save', () => {
    const w = World.create(5, 'normal');
    w.noSpider = true;
    w.noRaid = true;
    w.addAnts(60);
    const before = w.ants.map((a) => a.speedMul);
    const save = JSON.parse(JSON.stringify(worldToSave(w, { introDone: true, camera: { x: 0, y: 0, zoom: 1 } })));
    // as an old save: no flag, so the (already bonused) speeds get the bonus again
    delete save.raritiesApplied;
    const once = worldFromSave(JSON.parse(JSON.stringify(save)));
    for (let i = 0; i < before.length; i++) {
      expect(once.ants[i].speedMul).toBeCloseTo(Math.min(3, before[i] * rarityBonus(antRarity(once.terrain.seed, once.ants[i]))), 9);
    }
    const resaved = JSON.parse(JSON.stringify(worldToSave(once, { introDone: true, camera: { x: 0, y: 0, zoom: 1 } })));
    expect(resaved.raritiesApplied).toBe(true);
    const twice = worldFromSave(resaved);
    for (let i = 0; i < before.length; i++) expect(twice.ants[i].speedMul).toBeCloseTo(once.ants[i].speedMul, 9);
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
