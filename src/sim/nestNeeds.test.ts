import { describe, expect, it } from 'vitest';
import {
  FOOD_PER_ANT, LARVAE_PER_CHAMBER, MAX_LARVAE_CHAMBERS, MAX_NORMAL_LARVAE_CHAMBERS, MAX_NORMAL_PANTRIES, MAX_PANTRIES,
  MAX_QUEENS, PANTRY_CAPACITY, STEP_S,
} from './constants';
import { chamberFills, larvaeChambersNeeded, pantriesNeeded } from './nestNeeds';
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

describe('nest need constants', () => {
  it('25 food per pantry, 10 larvae per brood chamber, at most 6 pantries and 4 brood chambers', () => {
    expect(PANTRY_CAPACITY).toBe(25);
    expect(LARVAE_PER_CHAMBER).toBe(10);
    expect(MAX_PANTRIES).toBe(6);
    expect(MAX_LARVAE_CHAMBERS).toBe(4);
  });
});

describe('pantriesNeeded / larvaeChambersNeeded', () => {
  it('pantries: always at least 1, ceil(peak / 25), capped at 6 (edge cases 0, 25, 26, 150, 1e9)', () => {
    expect(pantriesNeeded(0)).toBe(1);
    expect(pantriesNeeded(1)).toBe(1);
    expect(pantriesNeeded(25)).toBe(1);
    expect(pantriesNeeded(26)).toBe(2);
    expect(pantriesNeeded(50)).toBe(2);
    expect(pantriesNeeded(51)).toBe(3);
    expect(pantriesNeeded(150)).toBe(6);
    expect(pantriesNeeded(151)).toBe(6);
    expect(pantriesNeeded(1e9)).toBe(6);
  });

  it('brood chambers: at least 1, ceil(peak / 10), capped at 4 (edge cases 0, 10, 11, 40, 1e9)', () => {
    expect(larvaeChambersNeeded(0)).toBe(1);
    expect(larvaeChambersNeeded(10)).toBe(1);
    expect(larvaeChambersNeeded(11)).toBe(2);
    expect(larvaeChambersNeeded(40)).toBe(4);
    expect(larvaeChambersNeeded(41)).toBe(4);
    expect(larvaeChambersNeeded(1e9)).toBe(4);
  });

  it('both are monotonic non-decreasing in the peak', () => {
    let p = 0;
    let l = 0;
    for (let v = 0; v <= 400; v++) {
      expect(pantriesNeeded(v)).toBeGreaterThanOrEqual(p);
      expect(larvaeChambersNeeded(v)).toBeGreaterThanOrEqual(l);
      p = pantriesNeeded(v);
      l = larvaeChambersNeeded(v);
    }
  });
});

describe('pantriesNeeded / larvaeChambersNeeded in normal mode', () => {
  it('normal pantriesNeeded has no upper limit', () => {
    expect(pantriesNeeded(25 * 40, 'normal')).toBe(40);
    expect(pantriesNeeded(0, 'normal')).toBe(1);
    expect(pantriesNeeded(151, 'normal')).toBe(7);
    expect(pantriesNeeded(25 * 40)).toBe(6);
    expect(pantriesNeeded(25 * 40, 'sandbox')).toBe(6);
  });

  it('normal larvaeChambersNeeded has no upper limit', () => {
    expect(larvaeChambersNeeded(10 * 30, 'normal')).toBe(30);
    expect(larvaeChambersNeeded(0, 'normal')).toBe(1);
    expect(larvaeChambersNeeded(41, 'normal')).toBe(5);
    expect(larvaeChambersNeeded(10 * 30)).toBe(4);
    expect(larvaeChambersNeeded(10 * 30, 'sandbox')).toBe(4);
  });

  it('normal mode stops only at the safety cap (with the queens at most 400 chambers), also for nonsense peaks', () => {
    expect(MAX_NORMAL_PANTRIES + MAX_NORMAL_LARVAE_CHAMBERS + MAX_QUEENS).toBeLessThanOrEqual(400);
    expect(pantriesNeeded(1e9, 'normal')).toBe(MAX_NORMAL_PANTRIES);
    expect(larvaeChambersNeeded(1e9, 'normal')).toBe(MAX_NORMAL_LARVAE_CHAMBERS);
    expect(pantriesNeeded(NaN, 'normal')).toBe(1);
    expect(larvaeChambersNeeded(-5, 'normal')).toBe(1);
  });

  it('World.nestNeeds uses the mode of the world', () => {
    const w = World.create(3, 'normal');
    w.peakStock = 25 * 40;
    w.peakLarvae = 10 * 30;
    expect(w.nestNeeds).toEqual({ queens: 1, pantries: 40, larvaeChambers: 30 });
    const s = World.create(3);
    s.peakStock = 25 * 40;
    s.peakLarvae = 10 * 30;
    expect(s.nestNeeds).toEqual({ queens: 1, pantries: 6, larvaeChambers: 4 });
  });
});

describe('chamberFills', () => {
  it('fills the first chambers first', () => {
    expect(chamberFills(30, 3, 25)).toEqual([25, 5, 0]);
    expect(chamberFills(0, 3, 25)).toEqual([0, 0, 0]);
    expect(chamberFills(25, 2, 25)).toEqual([25, 0]);
    expect(chamberFills(26, 2, 25)).toEqual([25, 1]);
    expect(chamberFills(7.5, 1, 25)).toEqual([7.5]);
  });

  it('the fills sum to min(total, chambers * capacity); more than fits is capped', () => {
    for (const [total, chambers] of [[0, 1], [10, 1], [60, 2], [60, 3], [1e9, 6], [24.5, 4]] as const) {
      const fills = chamberFills(total, chambers, 25);
      expect(fills).toHaveLength(chambers);
      expect(fills.reduce((s, v) => s + v, 0)).toBeCloseTo(Math.min(total, chambers * 25), 9);
      for (const f of fills) {
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThanOrEqual(25);
      }
    }
  });

  it('a negative or non-finite total gives empty chambers, zero chambers gives an empty list', () => {
    expect(chamberFills(-5, 2, 25)).toEqual([0, 0]);
    expect(chamberFills(NaN, 2, 25)).toEqual([0, 0]);
    expect(chamberFills(10, 0, 25)).toEqual([]);
  });
});

describe('peakStock / peakLarvae / nestNeeds', () => {
  it('a new world starts with the peaks of its starter stock', () => {
    const w = World.create(1);
    expect(w.peakStock).toBe(w.stock);
    expect(w.peakLarvae).toBe(w.larvae);
  });

  it('peaks follow the stock upward and never fall back (deliveries, then hatching spends the stock)', () => {
    const w = flatWorld(2);
    w.spawnAnt();
    w.started = true;
    w.stock = 40;
    w.step(STEP_S);
    expect(w.peakStock).toBe(40);
    expect(w.peakLarvae).toBe(8);
    let ps = w.peakStock;
    let pl = w.peakLarvae;
    for (let i = 0; i < 600; i++) {
      if (i === 100) w.stock = 3; // food taken away
      if (i === 300) w.stock = 55; // a bigger delivery
      w.step(STEP_S);
      expect(w.peakStock).toBeGreaterThanOrEqual(ps);
      expect(w.peakLarvae).toBeGreaterThanOrEqual(pl);
      ps = w.peakStock;
      pl = w.peakLarvae;
    }
    expect(w.peakStock).toBe(55);
    expect(w.peakLarvae).toBe(11);
  });

  it('nestNeeds combines the queen count with the chambers wanted for the peaks', () => {
    const w = flatWorld(3);
    expect(w.nestNeeds).toEqual({ queens: 1, pantries: 1, larvaeChambers: 1 });
    w.spawnAnt();
    w.stock = 130; // 26 larvae
    w.totalDelivered = 250;
    w.step(STEP_S);
    expect(w.nestNeeds).toEqual({ queens: 3, pantries: 6, larvaeChambers: 3 });
    w.stock = 0;
    for (let i = 0; i < 30; i++) w.step(STEP_S);
    expect(w.nestNeeds.pantries).toBe(6); // peaks, not current stock
  });

  it('the peaks are saved and restored', () => {
    const w = flatWorld(4);
    w.spawnAnt();
    w.stock = 90;
    w.step(STEP_S);
    w.stock = 5;
    const r = worldFromSave(JSON.parse(JSON.stringify(worldToSave(w, EXTRA))) as SaveV1);
    expect(r.peakStock).toBe(90);
    expect(r.peakLarvae).toBe(18);
    expect(r.nestNeeds).toEqual(w.nestNeeds);
  });

  it('an old save without peaks starts them at the current stock / larvae; a peak below the stock is lifted to it', () => {
    const w = flatWorld(5);
    w.spawnAnt();
    w.stock = 60;
    const s = worldToSave(w, EXTRA);
    delete s.peakStock;
    delete s.peakLarvae;
    expect(validateSave(JSON.parse(JSON.stringify(s)))).not.toBeNull();
    const r = worldFromSave(s);
    expect(r.peakStock).toBe(60);
    expect(r.peakLarvae).toBe(12);
    const low = worldToSave(w, EXTRA);
    low.peakStock = 3;
    low.peakLarvae = 0;
    const r2 = worldFromSave(low);
    expect(r2.peakStock).toBe(60);
    expect(r2.peakLarvae).toBe(12);
  });

  it('validateSave rejects non-finite or negative peaks', () => {
    const s = worldToSave(flatWorld(6), EXTRA);
    for (const bad of [-1, NaN, Infinity, '5' as unknown as number]) {
      expect(validateSave({ ...s, peakStock: bad })).toBeNull();
      expect(validateSave({ ...s, peakLarvae: bad })).toBeNull();
    }
    expect(validateSave({ ...s, peakStock: 0, peakLarvae: 0 })).not.toBeNull();
    expect(FOOD_PER_ANT).toBe(5);
  });
});
