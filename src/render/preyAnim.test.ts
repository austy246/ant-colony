import { describe, expect, it, vi } from 'vitest';
import {
  BEETLE_DIRS,
  BEETLE_FRAMES,
  deadBeetlePixels,
  deadFlyPixels,
  FLY_DIRS,
  FLY_POSES,
  beetlePixels,
  flyHopPose,
  flyIdlePose,
  flyLift,
  flyPixels,
  flyShadowPixels,
  preyDirection,
  PREY_CENTER,
  PREY_SIZE,
  puffFrame,
  FLY_LIFT_ART_PX,
} from './preyAnim';

const N = PREY_SIZE;
const alphaAt = (p: Uint8ClampedArray, x: number, y: number): number => (x < 0 || y < 0 || x >= N || y >= N ? 0 : p[(y * N + x) * 4 + 3]);
const opaque = (p: Uint8ClampedArray): number => {
  let n = 0;
  for (let i = 3; i < p.length; i += 4) if (p[i] >= 200) n++;
  return n;
};
const visible = (p: Uint8ClampedArray): number => {
  let n = 0;
  for (let i = 3; i < p.length; i += 4) if (p[i] > 0) n++;
  return n;
};
function hash(p: Uint8ClampedArray): number {
  let h = 2166136261;
  for (const v of p) h = Math.imul(h ^ v, 16777619) >>> 0;
  return h;
}

interface Variant {
  name: string;
  px: Uint8ClampedArray;
  min: number;
  max: number;
}

function allVariants(): Variant[] {
  const out: Variant[] = [];
  for (let d = 0; d < BEETLE_DIRS; d++) for (let f = 0; f < BEETLE_FRAMES; f++) out.push({ name: `beetle d${d} f${f}`, px: beetlePixels(d, f), min: 250, max: 650 });
  for (let d = 0; d < FLY_DIRS; d++) {
    for (let p = 0; p < FLY_POSES; p++) out.push({ name: `fly d${d} pose${p}`, px: flyPixels(d, p), min: 150, max: 450 });
    out.push({ name: `deadBeetle d${d}`, px: deadBeetlePixels(d), min: 250, max: 650 });
    out.push({ name: `deadFly d${d}`, px: deadFlyPixels(d), min: 150, max: 450 });
  }
  return out;
}

describe('preyDirection', () => {
  it('quantises headings (0 = right, positive = down) into n sectors', () => {
    expect(preyDirection(0, 16)).toBe(0);
    expect(preyDirection(Math.PI / 2, 16)).toBe(4);
    expect(preyDirection(Math.PI, 16)).toBe(8);
    expect(preyDirection(-Math.PI / 2, 16)).toBe(12);
    expect(preyDirection(Math.PI / 4, 8)).toBe(1);
    expect(preyDirection(Math.PI / 2, 8)).toBe(2);
    expect(preyDirection(-Math.PI / 2, 8)).toBe(6);
    expect(preyDirection(-0.001, 8)).toBe(0);
    expect(preyDirection(NaN, 8)).toBe(0);
    expect(preyDirection(undefined, 8)).toBe(0);
    expect(preyDirection(-100, 16)).toBeGreaterThanOrEqual(0);
    expect(preyDirection(-100, 16)).toBeLessThan(16);
  });
});

describe('prey sprite pixels', () => {
  it('uses one odd-sized RGBA grid for all variants (centre pixel = anchor)', () => {
    expect(PREY_SIZE % 2).toBe(1);
    expect(PREY_CENTER).toBe((PREY_SIZE - 1) / 2);
    expect(beetlePixels(0, 0)).toHaveLength(N * N * 4);
  });

  it('every variant paints a plausible number of solid pixels and keeps a 1 px empty margin', () => {
    for (const v of allVariants()) {
      const n = opaque(v.px);
      expect(n, v.name).toBeGreaterThanOrEqual(v.min);
      expect(n, v.name).toBeLessThanOrEqual(v.max);
      for (let i = 0; i < N; i++) {
        for (const e of [0, N - 1]) {
          expect(alphaAt(v.px, i, e) + alphaAt(v.px, e, i), `edge ${v.name}`).toBe(0);
        }
      }
    }
  });

  it('no sprite paints farther than 14 art px (28 fine px) from its anchor', () => {
    for (const v of allVariants()) {
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          if (alphaAt(v.px, x, y) === 0) continue;
          expect(Math.abs(x - PREY_CENTER), `${v.name} x`).toBeLessThanOrEqual(28);
          expect(Math.abs(y - PREY_CENTER), `${v.name} y`).toBeLessThanOrEqual(28);
        }
      }
    }
  });

  it('is deterministic: a freshly loaded module builds exactly the same pixels', async () => {
    const before = allVariants().map((v) => hash(v.px));
    vi.resetModules();
    const fresh = await import('./preyAnim');
    const again: number[] = [];
    for (let d = 0; d < fresh.BEETLE_DIRS; d++) for (let f = 0; f < fresh.BEETLE_FRAMES; f++) again.push(hash(fresh.beetlePixels(d, f)));
    for (let d = 0; d < fresh.FLY_DIRS; d++) {
      for (let p = 0; p < fresh.FLY_POSES; p++) again.push(hash(fresh.flyPixels(d, p)));
      again.push(hash(fresh.deadBeetlePixels(d)));
      again.push(hash(fresh.deadFlyPixels(d)));
    }
    expect(again).toEqual(before);
  });

  it('wraps directions like the ants do', () => {
    expect(beetlePixels(16, 0)).toBe(beetlePixels(0, 0));
    expect(beetlePixels(-1, 2)).toBe(beetlePixels(15, 2));
    expect(flyPixels(8, 1)).toBe(flyPixels(0, 1));
  });
});

describe('beetle', () => {
  it('all 16 directions look different from each other (frame 0), and the quarter turns clearly so', () => {
    const hs = new Set<number>();
    for (let d = 0; d < BEETLE_DIRS; d++) hs.add(hash(beetlePixels(d, 0)));
    expect(hs.size).toBe(16);
    // Rotating by 90 degrees moves the mass: the right-facing shell is much wider than tall, the down-facing one is the opposite.
    const extent = (p: Uint8ClampedArray): { w: number; h: number } => {
      let x0 = N;
      let x1 = 0;
      let y0 = N;
      let y1 = 0;
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          if (alphaAt(p, x, y) < 200) continue;
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
      }
      return { w: x1 - x0, h: y1 - y0 };
    };
    const right = extent(beetlePixels(0, 0));
    const down = extent(beetlePixels(4, 0));
    expect(right.w).toBeGreaterThan(right.h + 6);
    expect(down.h).toBeGreaterThan(down.w + 6);
  });

  it('left-facing variants mirror the right-facing ones (silhouette within a few pixels)', () => {
    for (let k = 1; k <= 3; k++) {
      for (let f = 0; f < BEETLE_FRAMES; f++) {
        const a = beetlePixels(k, f);
        const b = beetlePixels(8 - k, f);
        let diff = 0;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (alphaAt(a, x, y) >= 200 !== alphaAt(b, N - 1 - x, y) >= 200) diff++;
        expect(diff, `dir ${k} vs ${8 - k} frame ${f}`).toBeLessThanOrEqual(20);
      }
    }
  });

  it('the four walk frames differ within a direction while the body mass stays about the same', () => {
    for (let d = 0; d < BEETLE_DIRS; d++) {
      const hs = new Set<number>();
      const counts: number[] = [];
      for (let f = 0; f < BEETLE_FRAMES; f++) {
        hs.add(hash(beetlePixels(d, f)));
        counts.push(opaque(beetlePixels(d, f)));
      }
      expect(hs.size, `dir ${d}`).toBe(BEETLE_FRAMES);
      expect(Math.max(...counts) - Math.min(...counts), `dir ${d}`).toBeLessThanOrEqual(0.1 * Math.min(...counts));
    }
  });

  it('has a soft ground shadow (translucent pixels) and shining shell pixels', () => {
    const p = beetlePixels(0, 0);
    let soft = 0;
    let bright = 0;
    for (let i = 0; i < N * N; i++) {
      const a = p[i * 4 + 3];
      if (a > 0 && a < 200) soft++;
      if (a === 255 && p[i * 4 + 1] > 150) bright++;
    }
    expect(soft).toBeGreaterThan(20);
    expect(bright).toBeGreaterThanOrEqual(2);
  });
});

describe('fly', () => {
  it('has 8 directions x 4 poses (folded, fidget, two wing-beat frames), all different', () => {
    expect(FLY_DIRS).toBe(8);
    expect(FLY_POSES).toBe(4);
    const hs = new Set<number>();
    for (let d = 0; d < FLY_DIRS; d++) for (let p = 0; p < FLY_POSES; p++) hs.add(hash(flyPixels(d, p)));
    expect(hs.size).toBe(FLY_DIRS * FLY_POSES);
  });

  it('wings spread while airborne: clearly more translucent pixels than the folded wings', () => {
    const translucent = (p: Uint8ClampedArray): number => {
      let n = 0;
      for (let i = 3; i < p.length; i += 4) if (p[i] > 0 && p[i] < 200) n++;
      return n;
    };
    expect(translucent(flyPixels(0, 2))).toBeGreaterThan(translucent(flyPixels(0, 0)) + 30);
    expect(translucent(flyPixels(0, 3))).toBeGreaterThan(translucent(flyPixels(0, 0)) + 12);
  });

  it('the fly sprite itself carries no ground shadow (the shadow is separate so it can stay on the ground)', () => {
    const body = flyPixels(0, 0);
    // The folded fly has no semi-transparent pixel below-right of its lowest solid pixel row.
    let lowestSolid = 0;
    let lowestAny = 0;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (alphaAt(body, x, y) >= 200) lowestSolid = y;
        if (alphaAt(body, x, y) > 0) lowestAny = y;
      }
    }
    expect(lowestAny).toBe(lowestSolid);
    const sh = flyShadowPixels();
    expect(visible(sh)).toBeGreaterThan(60);
    expect(opaque(sh)).toBe(0);
  });

  it('idle fidget is brief and the hop wing-beat alternates', () => {
    let fidget = 0;
    for (let i = 0; i < 1000; i++) if (flyIdlePose(i * 0.01, 7) === 1) fidget++;
    expect(fidget).toBeGreaterThan(50); // about 1 in 7
    expect(fidget).toBeLessThan(250);
    expect(flyIdlePose(0.5, 3)).toBeGreaterThanOrEqual(0);
    expect(new Set([flyHopPose(0), flyHopPose(0.05), flyHopPose(0.1)]).size).toBeLessThanOrEqual(2);
    expect(flyHopPose(0)).not.toBe(flyHopPose(0.07));
    for (const t of [0, 0.03, 0.2, 0.5, 1.9]) expect([2, 3]).toContain(flyHopPose(t));
  });
});

describe('flyLift', () => {
  it('is a parabola: 0 at both ends, maximal 8 art px in the middle', () => {
    expect(FLY_LIFT_ART_PX).toBe(8);
    expect(flyLift(0)).toBe(0);
    expect(flyLift(1)).toBe(0);
    expect(flyLift(0.5)).toBeCloseTo(8, 12);
    expect(flyLift(0.25)).toBeCloseTo(6, 12);
    expect(flyLift(0.75)).toBeCloseTo(6, 12);
    for (let i = 0; i <= 20; i++) expect(flyLift(i / 20)).toBeLessThanOrEqual(flyLift(0.5) + 1e-12);
  });

  it('is tolerant of out-of-range and non-finite input', () => {
    expect(flyLift(-0.5)).toBe(0);
    expect(flyLift(1.5)).toBe(0);
    expect(flyLift(NaN)).toBe(0);
  });
});

describe('dead creatures', () => {
  it('beetle corpse and fly corpse look different from their living selves and from each other', () => {
    const hs = new Set([hash(beetlePixels(0, 0)), hash(deadBeetlePixels(0)), hash(flyPixels(0, 0)), hash(deadFlyPixels(0))]);
    expect(hs.size).toBe(4);
  });

  it('turn with the 8 directions', () => {
    const b = new Set<number>();
    const f = new Set<number>();
    for (let d = 0; d < 8; d++) {
      b.add(hash(deadBeetlePixels(d)));
      f.add(hash(deadFlyPixels(d)));
    }
    expect(b.size).toBe(8);
    expect(f.size).toBe(8);
  });

  it('the dead beetle is dimmer than the living one (slightly dimmer palette)', () => {
    const mean = (p: Uint8ClampedArray): number => {
      let s = 0;
      let n = 0;
      for (let i = 0; i < p.length; i += 4) {
        if (p[i + 3] < 200) continue;
        s += p[i] + p[i + 1] + p[i + 2];
        n++;
      }
      return s / n;
    };
    // The belly is lighter than the shell in absolute terms, but the shine and bright pixels of the living one are gone.
    let maxLiving = 0;
    let maxDead = 0;
    const live = beetlePixels(0, 0);
    const dead = deadBeetlePixels(0);
    for (let i = 0; i < N * N; i++) {
      if (live[i * 4 + 3] === 255) maxLiving = Math.max(maxLiving, live[i * 4] + live[i * 4 + 1] + live[i * 4 + 2]);
      if (dead[i * 4 + 3] === 255) maxDead = Math.max(maxDead, dead[i * 4] + dead[i * 4 + 1] + dead[i * 4 + 2]);
    }
    expect(maxDead).toBeLessThan(maxLiving);
    expect(mean(dead)).toBeGreaterThan(0);
  });
});

describe('puffFrame', () => {
  it('is a 3-frame dust puff for 0.4 s, then gone', () => {
    expect(puffFrame(0)).toBe(0);
    expect(puffFrame(0.13)).toBe(0);
    expect(puffFrame(0.14)).toBe(1);
    expect(puffFrame(0.27)).toBe(2);
    expect(puffFrame(0.399)).toBe(2);
    expect(puffFrame(0.4)).toBe(-1);
    expect(puffFrame(-0.1)).toBe(-1);
    expect(puffFrame(NaN)).toBe(-1);
  });
});
