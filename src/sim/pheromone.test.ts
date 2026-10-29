import { describe, it, expect } from 'vitest';
import { PheromoneField, homeGlow } from './pheromone';
import { MAX_PHEROMONE, NEST, STEP_S } from './constants';

describe('PheromoneField', () => {
  it('deposit then sample returns amount', () => {
    const f = new PheromoneField(20, 20);
    f.deposit(5.5, 6.2, 1.5);
    expect(f.sample(5.1, 6.9)).toBeCloseTo(1.5);
  });

  it('value is clamped to MAX_PHEROMONE', () => {
    const f = new PheromoneField(20, 20);
    f.deposit(3, 3, 4);
    f.deposit(3, 3, 4);
    expect(f.sample(3, 3)).toBe(MAX_PHEROMONE);
  });

  it('after 25 s of steps value halves (±5 %)', () => {
    const f = new PheromoneField(20, 20);
    f.data.fill(2);
    for (let i = 0; i < 25 * 30; i++) f.step(STEP_S);
    expect(f.sample(10, 10)).toBeGreaterThan(0.95);
    expect(f.sample(10, 10)).toBeLessThan(1.05);
  });

  it('decay is dt-independent', () => {
    const a = new PheromoneField(8, 8);
    const b = new PheromoneField(8, 8);
    a.data.fill(2);
    b.data.fill(2);
    a.step(10);
    for (let i = 0; i < 10; i++) b.step(1);
    expect(a.sample(4, 4)).toBeCloseTo(b.sample(4, 4), 4);
  });

  it('values below 0.01 become 0', () => {
    const f = new PheromoneField(10, 10);
    f.deposit(5, 5, 0.005);
    f.step(STEP_S);
    expect(f.sample(5, 5)).toBe(0);
  });

  it('diffusion spreads to neighbour but conserves roughly total', () => {
    const f = new PheromoneField(10, 10);
    f.deposit(5, 5, 4);
    const before = f.data.reduce((s, v) => s + v, 0);
    f.step(0);
    expect(f.sample(6, 5)).toBeGreaterThan(0);
    expect(f.sample(5, 4)).toBeGreaterThan(0);
    expect(f.sample(5, 5)).toBeLessThan(4);
    const after = f.data.reduce((s, v) => s + v, 0);
    expect(after).toBeCloseTo(before, 3);
  });

  it('sample outside returns 0', () => {
    const f = new PheromoneField(10, 10);
    f.data.fill(1);
    expect(f.sample(-1, 5)).toBe(0);
    expect(f.sample(10, 5)).toBe(0);
    expect(f.sample(5, 10)).toBe(0);
    expect(f.sample(NaN, 5)).toBe(0);
    f.deposit(-3, 2, 1);
    f.deposit(NaN, 2, 1);
    f.deposit(2, 2, NaN);
    expect(f.data.every((v) => Number.isFinite(v) && v <= MAX_PHEROMONE)).toBe(true);
  });
});

describe('homeGlow', () => {
  it('is 1 at nest and 0 at distance 40', () => {
    expect(homeGlow(NEST.x, NEST.y)).toBe(1);
    expect(homeGlow(NEST.x + 40, NEST.y)).toBe(0);
    expect(homeGlow(NEST.x + 100, NEST.y)).toBe(0);
    expect(homeGlow(NEST.x + 20, NEST.y)).toBeCloseTo(0.5);
  });
});
