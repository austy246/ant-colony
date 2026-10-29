import { describe, expect, it } from 'vitest';
import { advanceStride, frameFor, STRIDE_ART_PX, TELEPORT_ART_PX } from './stride';

describe('advanceStride', () => {
  it('starts a new ant at phase 0 on its position', () => {
    const s = advanceStride(undefined, 10, 20);
    expect(s).toMatchObject({ x: 10, y: 20, phase: 0 });
  });

  it('a stationary ant keeps its phase (so it keeps its frame)', () => {
    let s = advanceStride(undefined, 10, 20);
    s.phase = 0.4;
    for (let i = 0; i < 50; i++) s = advanceStride(s, 10, 20);
    expect(s.phase).toBeCloseTo(0.4, 12);
  });

  it('advances in proportion to the distance walked, along any direction', () => {
    let s = advanceStride(undefined, 0, 0);
    s = advanceStride(s, STRIDE_ART_PX / 4, 0);
    expect(s.phase).toBeCloseTo(0.25, 9);
    s = advanceStride(s, STRIDE_ART_PX / 4, STRIDE_ART_PX / 4); // 1/4 stride straight down
    expect(s.phase).toBeCloseTo(0.5, 9);
    s = advanceStride(s, STRIDE_ART_PX / 4 + 0.3, STRIDE_ART_PX / 4 + 0.4); // 0.5 diagonal
    expect(s.phase).toBeCloseTo(0.5 + 0.5 / STRIDE_ART_PX, 9);
  });

  it('a teleport (save restore, pan) does not spin the animation, but re-anchors the position', () => {
    let s = advanceStride(undefined, 0, 0);
    s.phase = 0.3;
    s = advanceStride(s, TELEPORT_ART_PX + 5, 0);
    expect(s.phase).toBeCloseTo(0.3, 12);
    expect(s.x).toBe(TELEPORT_ART_PX + 5);
    s = advanceStride(s, TELEPORT_ART_PX + 5 + STRIDE_ART_PX / 2, 0);
    expect(s.phase).toBeCloseTo(0.8, 9);
  });

  it('the teleport limit is 20 art pixels', () => {
    expect(TELEPORT_ART_PX).toBe(20);
  });

  it('phase wraps into [0, 1) without precision loss over a long walk', () => {
    let s = advanceStride(undefined, 0, 0);
    let x = 0;
    for (let i = 0; i < 200_000; i++) {
      x += 0.2; // 40 000 art px: ~13 000 cycles
      s = advanceStride(s, x, 0);
      expect(s.phase).toBeGreaterThanOrEqual(0);
      expect(s.phase).toBeLessThan(1);
    }
  });
});

describe('frameFor', () => {
  it('maps phase 0..1 evenly onto the frames', () => {
    expect([0, 0.2, 0.25, 0.49, 0.5, 0.74, 0.75, 0.999].map((p) => frameFor(p, 4))).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
  it('never returns an out-of-range frame (even for phase 1 or negative drift)', () => {
    expect(frameFor(1, 4)).toBe(0);
    expect(frameFor(-0.1, 4)).toBe(3);
    expect(frameFor(0.9999999999, 4)).toBe(3);
  });
});

describe('advanceStride with its own stride length', () => {
  it('a longer stride advances the phase more slowly', () => {
    let s = advanceStride(undefined, 0, 0, 6);
    s = advanceStride(s, 3, 0, 6);
    expect(s.phase).toBeCloseTo(0.5, 9);
    let d = advanceStride(undefined, 0, 0);
    d = advanceStride(d, STRIDE_ART_PX / 2, 0);
    expect(d.phase).toBeCloseTo(0.5, 9);
  });
});
