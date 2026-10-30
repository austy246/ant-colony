import { describe, expect, it } from 'vitest';
import { FOOD_PER_ANT, MAX_ANTS, MAX_ANTS_NORMAL, RESCUE_AFTER_S, STEP_S } from './constants';
import { World } from './world';

/** A started colony with no ants and too little food to hatch one. */
function emptyColony(mode?: 'sandbox' | 'normal'): World {
  const w = World.create(1, mode);
  w.spawnAnt();
  w.ants.length = 0;
  w.stock = 0;
  return w;
}

describe('world mode', () => {
  it('sandbox keeps MAX_ANTS 300', () => {
    const w = World.create(1);
    expect(w.mode).toBe('sandbox');
    expect(w.maxAnts).toBe(MAX_ANTS);
    expect(MAX_ANTS).toBe(300);
  });

  it('normal maxAnts is 2000', () => {
    const w = World.create(1, 'normal');
    expect(w.mode).toBe('normal');
    expect(MAX_ANTS_NORMAL).toBe(2000);
    expect(w.maxAnts).toBe(2000);
  });

  it('normal colony with 0 ants and stock below FOOD_PER_ANT is extinct', () => {
    const w = emptyColony('normal');
    expect(w.stock).toBeLessThan(FOOD_PER_ANT);
    expect(w.extinct).toBe(true);
    w.stock = FOOD_PER_ANT;
    expect(w.extinct).toBe(false);
  });

  it('sandbox is never extinct', () => {
    expect(emptyColony('sandbox').extinct).toBe(false);
  });

  it('world before first ant is not extinct', () => {
    const w = World.create(1, 'normal');
    w.stock = 0;
    expect(w.started).toBe(false);
    expect(w.extinct).toBe(false);
  });

  it('normal rescue does not spawn an ant after RESCUE_AFTER_S (sandbox does)', () => {
    const n = emptyColony('normal');
    const s = emptyColony('sandbox');
    for (let t = 0; t < RESCUE_AFTER_S + 2; t += STEP_S) {
      n.step(STEP_S);
      s.step(STEP_S);
    }
    expect(n.ants.length).toBe(0);
    expect(s.ants.length).toBeGreaterThan(0);
  });
});
