import { describe, it, expect } from 'vitest';
import { createRng, Rng } from './rng';

describe('rng', () => {
  it('same seed gives same sequence', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
  });

  it('different seeds differ', () => {
    const a = createRng(1);
    const b = createRng(2);
    const sa = Array.from({ length: 10 }, () => a());
    const sb = Array.from({ length: 10 }, () => b());
    expect(sa).not.toEqual(sb);
  });

  it('values are in [0,1)', () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('restoring state continues the same sequence', () => {
    const a = new Rng(123);
    for (let i = 0; i < 17; i++) a.next();
    const b = new Rng(0);
    b.state = a.state;
    for (let i = 0; i < 20; i++) expect(b.next()).toBe(a.next());
  });
});
