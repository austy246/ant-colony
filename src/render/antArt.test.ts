import { describe, expect, it } from 'vitest';
import {
  ANT_CENTER,
  ANT_DIRS,
  ANT_FRAMES,
  ANT_SIZE,
  antDirection,
  antPixels,
  C_CRUMB,
  C_LEG,
  C_SHADOW,
} from './antArt';

const N = ANT_SIZE;
const at = (p: Uint8Array, x: number, y: number): number => (x < 0 || y < 0 || x >= N || y >= N ? 0 : p[y * N + x]);
const solid = (v: number): boolean => v !== 0 && v !== C_SHADOW;
const ALL: [number, number, boolean][] = [];
for (const carrying of [false, true]) for (let f = 0; f < ANT_FRAMES; f++) for (let k = 0; k < ANT_DIRS; k++) ALL.push([k, f, carrying]);

function hash(p: Uint8Array): number {
  let h = 2166136261;
  for (const v of p) h = Math.imul(h ^ v, 16777619) >>> 0;
  return h;
}
const count = (p: Uint8Array): number => p.reduce((n, v) => n + (solid(v) ? 1 : 0), 0);

describe('antDirection', () => {
  it('maps headings (0 = right, positive = down) to 16 sectors of 22.5 degrees', () => {
    expect(antDirection(0)).toBe(0);
    expect(antDirection(Math.PI / 2)).toBe(4);
    expect(antDirection(Math.PI)).toBe(8);
    expect(antDirection(-Math.PI / 2)).toBe(12);
    expect(antDirection(-Math.PI)).toBe(8);
    expect(antDirection(Math.PI / 8)).toBe(1);
    expect(antDirection(Math.PI / 16 - 0.001)).toBe(0);
    expect(antDirection(Math.PI / 16 + 0.001)).toBe(1);
    expect(antDirection(-0.001)).toBe(0);
    expect(antDirection(Math.PI * 2 + 0.01)).toBe(0);
    expect(antDirection(-100)).toBeGreaterThanOrEqual(0);
    expect(antDirection(-100)).toBeLessThan(16);
    expect(antDirection(NaN)).toBe(0);
  });
});

describe('ant sprite pixels', () => {
  it('has 16 directions x 4 frames on a 25x25 fine-pixel grid', () => {
    expect(ANT_DIRS).toBe(16);
    expect(ANT_FRAMES).toBe(4);
    expect(ANT_SIZE).toBe(25);
    expect(antPixels(0, 0, false)).toHaveLength(25 * 25);
  });

  it('every variant paints between 25 and 90 solid pixels, and stays inside the grid with a margin', () => {
    for (const [k, f, c] of ALL) {
      const p = antPixels(k, f, c);
      const n = count(p);
      expect(n, `dir ${k} frame ${f} carry ${c}`).toBeGreaterThanOrEqual(25);
      expect(n, `dir ${k} frame ${f} carry ${c}`).toBeLessThanOrEqual(90);
      for (let i = 0; i < N; i++) {
        for (const e of [0, N - 1]) {
          expect(solid(at(p, i, e)) || solid(at(p, e, i)), `edge dir ${k} frame ${f}`).toBe(false);
        }
      }
    }
  });

  it('only uses the black palette (+ crumb only when carrying, + soft shadow)', () => {
    for (const [k, f, c] of ALL) {
      const p = antPixels(k, f, c);
      let crumbs = 0;
      for (const v of p) {
        expect(v >= 0 && v <= C_SHADOW, `value ${v}`).toBe(true);
        if (v === C_CRUMB) crumbs++;
      }
      if (c) expect(crumbs, `dir ${k} frame ${f}`).toBeGreaterThanOrEqual(4);
      else expect(crumbs).toBe(0);
    }
  });

  it('left-facing is the exact mirror image of right-facing (dir k vs 8 - k)', () => {
    for (const carrying of [false, true]) {
      for (let f = 0; f < ANT_FRAMES; f++) {
        for (let k = 0; k < ANT_DIRS; k++) {
          const a = antPixels(k, f, carrying);
          const b = antPixels((8 - k + ANT_DIRS) % ANT_DIRS, f, carrying);
          let diff = 0;
          for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
              const u = at(a, x, y);
              const w = at(b, N - 1 - x, y);
              if (u !== w && !(k % 8 === 4 && (u === C_LEG || w === C_LEG))) diff++;
            }
          }
          // (Straight up / down - dir 4, 12 - is its own mirror direction, but the tripod gait is not left/right
          // symmetric there, so legs and antennae are left out of that comparison.)
          expect(diff, `dir ${k} frame ${f}`).toBe(0);
        }
      }
    }
  });

  it('down (dir 4) and up (dir 12) are quarter turns of right (dir 0), within a few pixels', () => {
    const c = ANT_CENTER;
    for (let f = 0; f < ANT_FRAMES; f++) {
      for (const carrying of [false, true]) {
        const right = antPixels(0, f, carrying);
        for (const [dir, turn] of [
          [4, 1],
          [12, -1],
        ] as const) {
          const got = antPixels(dir, f, carrying);
          let diff = 0;
          for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
              // rotate the right-facing pixel (x, y) by turn * 90 degrees (positive = clockwise on screen) about the centre
              const dx = x - c;
              const dy = y - c;
              const rx = c - turn * dy;
              const ry = c + turn * dx;
              if (solid(at(right, x, y)) !== solid(at(got, rx, ry))) diff++;
            }
          }
          expect(diff, `dir ${dir} frame ${f}`).toBeLessThanOrEqual(4);
        }
      }
    }
  });

  it('a pixel is never isolated and has no one-pixel holes (reads as one solid ant)', () => {
    for (const [k, f, c] of ALL) {
      const p = antPixels(k, f, c);
      for (let y = 1; y < N - 1; y++) {
        for (let x = 1; x < N - 1; x++) {
          const v = at(p, x, y);
          const n4 = [at(p, x - 1, y), at(p, x + 1, y), at(p, x, y - 1), at(p, x, y + 1)].filter(solid).length;
          if (solid(v)) {
            let n8 = n4;
            for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) if (solid(at(p, x + dx, y + dy))) n8++;
            expect(n8, `isolated pixel dir ${k} frame ${f} at ${x},${y}`).toBeGreaterThan(0);
          } else {
            const nb = [at(p, x - 1, y), at(p, x + 1, y), at(p, x, y - 1), at(p, x, y + 1)].filter((u) => u >= 1 && u <= 3).length;
            expect(nb, `hole dir ${k} frame ${f} at ${x},${y}`).toBeLessThan(3);
          }
        }
      }
    }
  });

  it('is one 8-connected blob (legs and antennae stay attached) in every variant', () => {
    for (const [k, f, c] of ALL) {
      const p = antPixels(k, f, c);
      const seen = new Uint8Array(N * N);
      const stack: number[] = [];
      let total = 0;
      for (let i = 0; i < N * N; i++) if (solid(p[i])) total++;
      const start = ANT_CENTER * N + ANT_CENTER;
      expect(solid(p[start]), `centre dir ${k}`).toBe(true);
      stack.push(start);
      seen[start] = 1;
      let reached = 0;
      while (stack.length) {
        const i = stack.pop()!;
        reached++;
        const x = i % N;
        const y = (i / N) | 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const j = (y + dy) * N + x + dx;
            if (x + dx < 0 || x + dx >= N || y + dy < 0 || y + dy >= N || seen[j] || !solid(p[j])) continue;
            seen[j] = 1;
            stack.push(j);
          }
        }
      }
      expect(reached, `dir ${k} frame ${f} carry ${c}`).toBe(total);
    }
  });

  it('the 4 frames differ (at least 3 distinct) in every direction and the body mass stays within +-2 pixels', () => {
    for (let k = 0; k < ANT_DIRS; k++) {
      for (const carrying of [false, true]) {
        const frames = Array.from({ length: ANT_FRAMES }, (_, f) => antPixels(k, f, carrying));
        expect(new Set(frames.map(hash)).size, `dir ${k}`).toBeGreaterThanOrEqual(3);
        // body mass (body, head, crumb pixels) is constant: legs and antennae only move around it
        const mass = frames.map((p) => p.reduce((n, v) => n + (v >= 1 && v <= 3 ? 1 : 0), 0));
        expect(Math.max(...mass) - Math.min(...mass), `dir ${k} body: ${mass}`).toBeLessThanOrEqual(2);
        // ...and the whole ant (legs included) does not visibly swell or shrink either
        const counts = frames.map(count);
        expect(Math.max(...counts) - Math.min(...counts), `dir ${k}: ${counts}`).toBeLessThanOrEqual(8);
      }
    }
  });

  it('the legs swap in an alternating tripod gait: frames 0 and 2 are different poses, 1 and 3 are transitions', () => {
    // facing right the six legs live left and right of the body axis; the tripod groups swap forward/back
    const f0 = antPixels(0, 0, false);
    const f2 = antPixels(0, 2, false);
    let diff = 0;
    for (let i = 0; i < f0.length; i++) if (solid(f0[i]) !== solid(f2[i])) diff++;
    expect(diff).toBeGreaterThanOrEqual(6);
  });

  it('the carried crumb is on the head side for each of the 16 directions', () => {
    for (let k = 0; k < ANT_DIRS; k++) {
      for (let f = 0; f < ANT_FRAMES; f++) {
        const p = antPixels(k, f, true);
        const a = (k * Math.PI) / 8;
        const hx = ANT_CENTER + Math.cos(a) * 3;
        const hy = ANT_CENTER + Math.sin(a) * 3;
        const bx = ANT_CENTER - Math.cos(a) * 5;
        const by = ANT_CENTER - Math.sin(a) * 5;
        let sx = 0;
        let sy = 0;
        let n = 0;
        for (let y = 0; y < N; y++) {
          for (let x = 0; x < N; x++) {
            if (at(p, x, y) !== C_CRUMB) continue;
            sx += x;
            sy += y;
            n++;
          }
        }
        expect(n).toBeGreaterThanOrEqual(4);
        const cx = sx / n;
        const cy = sy / n;
        expect(Math.hypot(cx - hx, cy - hy), `dir ${k} frame ${f}`).toBeLessThan(Math.hypot(cx - bx, cy - by));
      }
    }
  });

  it('is deterministic and the variants are cached copies of the same data', () => {
    expect(hash(antPixels(5, 2, true))).toBe(hash(antPixels(5, 2, true)));
    expect(hash(antPixels(5, 2, true))).not.toBe(hash(antPixels(5, 2, false)));
    expect(hash(antPixels(0, 0, false))).not.toBe(hash(antPixels(4, 0, false)));
  });
});
