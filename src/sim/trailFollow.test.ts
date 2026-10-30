import { describe, expect, it } from 'vitest';
import { NEST, STEP_S } from './constants';
import { Surface } from './terrain';
import { World } from './world';

interface TrailResult { onTrail: number; reached: number; n: number }

/** Fresh ants emerge from the nest onto a ready-made trail (refreshed every substep) leading to food; counts how many catch it. */
function trailExperiment(seed: number, opts: { n?: number; seconds?: number; dist?: number; angle?: number; near?: number; far?: number } = {}): TrailResult {
  const n = opts.n ?? 40;
  const seconds = opts.seconds ?? 60;
  const dist = opts.dist ?? 90;
  const angle = opts.angle ?? 0;
  const near = opts.near ?? 0.3;
  const far = opts.far ?? 3;
  const w = World.create(seed);
  w.stock = 0;
  w.terrain.surface.fill(Surface.Ground);
  w.terrain.speed.fill(1);
  const fx = NEST.x + Math.cos(angle) * dist;
  const fy = NEST.y + Math.sin(angle) * dist;
  const food = w.placeFood('berry', fx, fy)!;
  food.piecesLeft = 1000;
  const ants = [];
  for (let i = 0; i < n; i++) { const a = w.spawnAnt(true); a.timer = 0.05; ants.push(a); }
  const onTrail = new Set<number>();
  const reached = new Set<number>();
  const lay = () => {
    for (let d = NEST.r; d < dist; d += 0.5) {
      const v = near + (far - near) * Math.min(1, d / dist);
      const x = NEST.x + Math.cos(angle) * d;
      const y = NEST.y + Math.sin(angle) * d;
      w.pher.data[Math.floor(y) * w.pher.w + Math.floor(x)] = v;
    }
  };
  for (let t = 0; t < seconds / STEP_S; t++) {
    lay();
    w.step(STEP_S);
    for (const a of ants) {
      if (w.pher.sampleMax(a.x, a.y, 1) > 0 && a.state === 'wander') onTrail.add(a.id);
      if (a.state === 'gnaw' || a.state === 'carry') reached.add(a.id);
    }
  }
  return { onTrail: onTrail.size, reached: reached.size, n };
}

describe('following a trail out of the nest', () => {
  // Measured on 12 seeds x 40 ants, trail 150 px long (weak at the nest, strong further out), 20 s:
  // before the fix 0.20 reached the food (no better than the 0.20 without any trail), after it about 0.47.
  it('most fresh ants catch the trail and reach the food at its end', () => {
    let reached = 0;
    let n = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const r = trailExperiment(seed, { near: 0.3, far: 3, seconds: 20, dist: 150 });
      reached += r.reached;
      n += r.n;
    }
    expect(reached / n).toBeGreaterThan(0.38);
  }, 60000);

  it('without a trail the heading stays random (no herd)', () => {
    const w = World.create(5);
    w.terrain.surface.fill(Surface.Ground);
    const hs = [];
    for (let i = 0; i < 40; i++) { const a = w.spawnAnt(true); a.timer = 0.05; hs.push(a); }
    for (let i = 0; i < 3; i++) w.step(STEP_S);
    const mx = hs.reduce((s, a) => s + Math.cos(a.heading), 0) / hs.length;
    const my = hs.reduce((s, a) => s + Math.sin(a.heading), 0) / hs.length;
    expect(Math.hypot(mx, my)).toBeLessThan(0.4);
    expect(NEST.r).toBeGreaterThan(0);
  });
});
