import { describe, expect, it } from 'vitest';
import { smoothToward } from './nestLayout';

describe('smoothToward', () => {
  it('moves towards the target without overshooting', () => {
    let v = 10;
    let prev = v;
    for (let i = 0; i < 200; i++) {
      v = smoothToward(v, 50, 1 / 60, 3.5);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeLessThanOrEqual(50);
      prev = v;
    }
    expect(v).toBeCloseTo(50, 1);
  });

  it('works downwards too', () => {
    let v = 50;
    for (let i = 0; i < 200; i++) {
      const n = smoothToward(v, 10, 1 / 60, 3.5);
      expect(n).toBeLessThanOrEqual(v);
      expect(n).toBeGreaterThanOrEqual(10);
      v = n;
    }
    expect(v).toBeCloseTo(10, 1);
  });

  it('does not snap in one small step and settles in about two seconds', () => {
    const one = smoothToward(0, 100, 1 / 60, 3.5);
    expect(one).toBeGreaterThan(0);
    expect(one).toBeLessThan(10);
    let v = 0;
    for (let i = 0; i < 120; i++) v = smoothToward(v, 100, 1 / 60, 3.5);
    expect(v).toBeGreaterThan(95);
  });

  it('dt = 0 stays', () => {
    expect(smoothToward(7, 40, 0, 3.5)).toBe(7);
  });

  it('a huge dt clamps to the target, never beyond', () => {
    expect(smoothToward(7, 40, 1e9, 3.5)).toBeCloseTo(40, 3);
    expect(smoothToward(7, 40, 1e9, 3.5)).toBeLessThanOrEqual(40);
    expect(smoothToward(40, 7, 1e9, 3.5)).toBeGreaterThanOrEqual(7);
  });

  it('survives NaN and Infinity', () => {
    expect(smoothToward(NaN, 5, 0.1, 3)).toBe(5);
    expect(smoothToward(3, NaN, 0.1, 3)).toBe(3);
    expect(Number.isFinite(smoothToward(3, 9, NaN, 3))).toBe(true);
    expect(Number.isFinite(smoothToward(3, 9, 0.1, Infinity))).toBe(true);
    expect(smoothToward(3, 9, -1, 3)).toBe(3);
  });
});
