import { describe, it, expect } from 'vitest';
import { World } from '../sim/world';
import { pickFood } from './input';

describe('pickFood', () => {
  const w = World.create(1);
  w.food.length = 0;
  const a = w.placeFood('berry', 30, 30)!;
  const b = w.placeFood('fly', 34, 30)!;

  it('returns nearest within radius', () => {
    expect(pickFood(w, a.x + 1, a.y, 8)?.id).toBe(a.id);
    expect(pickFood(w, b.x - 1, b.y, 8)?.id).toBe(b.id);
  });
  it('returns null outside radius', () => {
    expect(pickFood(w, 100, 100, 8)).toBeNull();
  });
  it('radius is inclusive', () => {
    expect(pickFood(w, a.x - 8, a.y, 8)?.id).toBe(a.id);
    expect(pickFood(w, a.x - 8.01, a.y, 8)).toBeNull();
  });
  it('non-finite input gives null', () => {
    expect(pickFood(w, NaN, 1, 8)).toBeNull();
    expect(pickFood(w, 1, Infinity, 8)).toBeNull();
    expect(pickFood(w, 1, 1, NaN)).toBeNull();
  });
});
