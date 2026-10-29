import { describe, expect, it } from 'vitest';
import { MAX_PHEROMONE } from '../sim/constants';
import { Surface } from '../sim/terrain';
import { pheromoneAlpha, surfaceOverlayColor } from './views';

describe('pheromoneAlpha', () => {
  it('is 0 below the 0.02 threshold and visible at it', () => {
    expect(pheromoneAlpha(0)).toBe(0);
    expect(pheromoneAlpha(0.0199)).toBe(0);
    expect(pheromoneAlpha(-1)).toBe(0);
    expect(pheromoneAlpha(0.02)).toBeGreaterThanOrEqual(0.35);
  });
  it('is monotonic non-decreasing over a sweep', () => {
    let prev = 0;
    for (let v = 0; v <= MAX_PHEROMONE * 1.5; v += 0.005) {
      const a = pheromoneAlpha(v);
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
  });
  it('is capped at 0.95', () => {
    expect(pheromoneAlpha(MAX_PHEROMONE)).toBeLessThanOrEqual(0.95);
    expect(pheromoneAlpha(1e9)).toBeLessThanOrEqual(0.95);
    expect(pheromoneAlpha(Infinity)).toBeLessThanOrEqual(0.95);
  });
  it('returns 0 for non-finite input', () => {
    expect(pheromoneAlpha(NaN)).toBe(0);
    expect(pheromoneAlpha(-Infinity)).toBe(0);
  });
});

describe('surfaceOverlayColor', () => {
  it('maps every Surface', () => {
    expect(surfaceOverlayColor(Surface.Ground)).toBeNull();
    expect(surfaceOverlayColor(Surface.Needle)).toBe('rgba(255,224,102,.55)');
    expect(surfaceOverlayColor(Surface.SmallTwig)).toBe('#ff9d2e');
    expect(surfaceOverlayColor(Surface.BigTwig)).toBe('#ff9d2e');
    expect(surfaceOverlayColor(Surface.Stone)).toBe('#ff4040');
  });
  it('returns null for unknown values', () => {
    expect(surfaceOverlayColor(99)).toBeNull();
    expect(surfaceOverlayColor(NaN)).toBeNull();
  });
});
