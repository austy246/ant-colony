import { describe, expect, it } from 'vitest';
import { queenCrumbs, queenHoleRadii } from './sprites';

describe('queenHoleRadii', () => {
  it('starts at crater size, grows monotonically and stays finite', () => {
    const a = queenHoleRadii(0);
    expect(a).toEqual({ rx: 7, ry: 3.6 });
    let prev = a;
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const r = queenHoleRadii(p);
      expect(Number.isFinite(r.rx + r.ry)).toBe(true);
      expect(r.rx).toBeGreaterThanOrEqual(prev.rx);
      expect(r.ry).toBeGreaterThanOrEqual(prev.ry);
      prev = r;
    }
    expect(queenHoleRadii(1).rx).toBeGreaterThan(a.rx);
  });

  it('clamps out-of-range and NaN progress', () => {
    expect(queenHoleRadii(-1)).toEqual(queenHoleRadii(0));
    expect(queenHoleRadii(5)).toEqual(queenHoleRadii(1));
    expect(queenHoleRadii(NaN)).toEqual(queenHoleRadii(0));
  });
});

describe('queenCrumbs', () => {
  it('is empty outside (0, 1)', () => {
    expect(queenCrumbs(0)).toEqual([]);
    expect(queenCrumbs(1)).toEqual([]);
    expect(queenCrumbs(NaN)).toEqual([]);
  });

  it('is deterministic, finite and non-empty while digging', () => {
    const a = queenCrumbs(0.4);
    expect(a.length).toBeGreaterThan(0);
    expect(queenCrumbs(0.4)).toEqual(a);
    for (const c of a) {
      expect(Number.isFinite(c.dx + c.dy)).toBe(true);
      expect(c.color).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(queenCrumbs(0.41)).not.toEqual(a);
  });
});
