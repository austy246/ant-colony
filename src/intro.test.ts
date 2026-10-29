import { describe, it, expect } from 'vitest';
import { Intro, INTRO_DURATIONS, INTRO_TOTAL_S } from './intro';
import { NEST, WORLD_W, WORLD_H } from './sim/constants';

const at = (t: number): Intro => {
  const i = new Intro();
  i.update(t);
  return i;
};

describe('Intro', () => {
  it('has stated durations', () => {
    expect(INTRO_DURATIONS).toEqual({ wide: 2, zoom: 3, dig: 3, hidden: 1, spawn: 1 });
    expect(INTRO_TOTAL_S).toBe(10);
  });

  it('phases advance in order with the stated durations', () => {
    const i = new Intro();
    expect(i.t).toBe(0);
    expect(i.phase).toBe('wide');
    expect(at(1.999).phase).toBe('wide');
    expect(at(2).phase).toBe('zoom');
    expect(at(4.999).phase).toBe('zoom');
    expect(at(5).phase).toBe('dig');
    expect(at(7.999).phase).toBe('dig');
    expect(at(8).phase).toBe('hidden');
    expect(at(8.999).phase).toBe('hidden');
    expect(at(9).phase).toBe('spawn');
    expect(at(9.999).phase).toBe('spawn');
    expect(at(10).phase).toBe('done');
    expect(at(10).done).toBe(true);
    expect(at(9.9).done).toBe(false);
  });

  it('camera at t=0 shows the whole world and at end of zoom is on the nest at zoom 10', () => {
    const c0 = new Intro().cameraAt(1280, 720);
    expect(c0.x).toBe(WORLD_W / 2);
    expect(c0.y).toBe(WORLD_H / 2);
    expect(c0.zoom).toBeCloseTo(Math.min(1280 / WORLD_W, 720 / WORLD_H));
    const d = new Intro().cameraAt();
    expect(d.zoom).toBeCloseTo(Math.min(1280 / WORLD_W, 720 / WORLD_H));
    const c1 = at(5).cameraAt(1280, 720);
    expect(c1).toEqual({ x: NEST.x, y: NEST.y, zoom: 10 });
    const c2 = at(9.5).cameraAt(1280, 720);
    expect(c2).toEqual({ x: NEST.x, y: NEST.y, zoom: 10 });
    expect(at(10).cameraAt(1280, 720)).toEqual({ x: NEST.x, y: NEST.y, zoom: 10 });
  });

  it('wide phase keeps the whole-world camera', () => {
    const c = at(1.5).cameraAt(800, 600);
    expect(c.x).toBe(WORLD_W / 2);
    expect(c.zoom).toBeCloseTo(Math.min(800 / WORLD_W, 600 / WORLD_H));
  });

  it('zoom curve is monotonic non-decreasing and finite across the zoom phase', () => {
    let prev = -Infinity;
    let prevX = Infinity;
    for (let t = 2; t <= 5; t += 0.05) {
      const c = at(t).cameraAt(1280, 720);
      expect(Number.isFinite(c.x + c.y + c.zoom)).toBe(true);
      expect(c.zoom).toBeGreaterThanOrEqual(prev - 1e-12);
      expect(c.x).toBeLessThanOrEqual(prevX + 1e-12);
      prev = c.zoom;
      prevX = c.x;
    }
  });

  it('queen is visible until dig ends, invisible after', () => {
    const q = (t: number) => at(t).queen();
    expect(q(0).visible).toBe(true);
    expect(q(0)).toMatchObject({ x: NEST.x, y: NEST.y, digProgress: 0 });
    expect(q(3).visible).toBe(true);
    expect(q(3).digProgress).toBe(0);
    expect(q(7.999).visible).toBe(true);
    expect(q(8).visible).toBe(false);
    expect(q(8.5).visible).toBe(false);
    expect(q(9.5).visible).toBe(false);
    expect(q(10).visible).toBe(false);
  });

  it('digProgress is linear 0..1 in the dig phase and 1 after', () => {
    expect(at(5).queen().digProgress).toBe(0);
    expect(at(6.5).queen().digProgress).toBeCloseTo(0.5);
    expect(at(5.75).queen().digProgress).toBeCloseTo(0.25);
    expect(at(8).queen().digProgress).toBe(1);
    expect(at(10).queen().digProgress).toBe(1);
  });

  it('skip() sets done and phase done, idempotent', () => {
    const i = new Intro();
    i.skip();
    expect(i.done).toBe(true);
    expect(i.phase).toBe('done');
    expect(i.t).toBe(INTRO_TOTAL_S);
    i.skip();
    expect(i.done).toBe(true);
    expect(i.t).toBe(INTRO_TOTAL_S);
  });

  it('update after done does nothing', () => {
    const i = at(10);
    i.update(5);
    expect(i.t).toBe(10);
    expect(i.phase).toBe('done');
  });

  it('huge dt clamps to total', () => {
    const i = new Intro();
    i.update(1e9);
    expect(i.t).toBe(INTRO_TOTAL_S);
    expect(i.phase).toBe('done');
  });

  it('ignores non-finite or non-positive dt; t never negative', () => {
    const i = new Intro();
    i.update(-1);
    i.update(0);
    i.update(NaN);
    i.update(Infinity);
    i.update(-Infinity);
    expect(i.t).toBe(0);
    expect(i.phase).toBe('wide');
  });

  it('consumeSpawn returns true exactly once at spawn start', () => {
    const i = new Intro();
    i.update(8.9);
    expect(i.consumeSpawn()).toBe(false);
    i.update(0.1);
    expect(i.consumeSpawn()).toBe(true);
    expect(i.consumeSpawn()).toBe(false);
    i.update(5);
    expect(i.consumeSpawn()).toBe(false);
  });

  it('consumeSpawn fires once even if a huge dt jumps over spawn', () => {
    const i = new Intro();
    i.update(1000);
    expect(i.consumeSpawn()).toBe(true);
    expect(i.consumeSpawn()).toBe(false);
  });

  it('consumeSpawn fires once after skip() from t=0', () => {
    const i = new Intro();
    expect(i.consumeSpawn()).toBe(false);
    i.skip();
    expect(i.consumeSpawn()).toBe(true);
    expect(i.consumeSpawn()).toBe(false);
    i.skip();
    expect(i.consumeSpawn()).toBe(false);
  });
});
