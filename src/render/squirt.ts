import { SPRAY_ANIM_S } from '../sim/constants';
import type { RedAnt } from '../sim/raid';
import type { Ctx2D } from './sprites';

const snap = (v: number): number => Math.round(v * 2) / 2;

/**
 * A red ant squirting acid: it cocks its abdomen up (a little green drop at its rear, pulsing), then a short chain of green
 * drops flies in an arc to the black ant in front of it (`r.sprayTo`). Drawn over the red ant while `r.sprayT` runs.
 */
export function drawSquirt(c: Ctx2D, r: RedAnt): void {
  if (r.sprayT === undefined || !r.sprayTo) return;
  const t = Math.max(0, Math.min(1, 1 - r.sprayT / SPRAY_ANIM_S)); // 0 at the start of the flick, 1 at its end
  const hx = Math.cos(r.heading);
  const hy = Math.sin(r.heading);
  // the abdomen: a lifted green tip behind the ant that pulses
  const lift = 1 + Math.abs(Math.sin(t * Math.PI * 4)) * 2;
  const bx = r.x - hx * 3.5;
  const by = r.y - hy * 3.5 - lift;
  c.fillStyle = '#a6d82c';
  c.fillRect(snap(bx) - 0.5, snap(by) - 0.5, 1.5, 1.5);
  c.fillStyle = '#e0f58a';
  c.fillRect(snap(bx), snap(by) - 0.5, 0.5, 0.5);
  // the squirt flies from t = 0.35 on: a few drops strung along an arc to the target
  if (t < 0.35) return;
  const k = (t - 0.35) / 0.65;
  const sx = r.x + hx * 1.5;
  const sy = r.y + hy * 1.5 - 1;
  const ex = r.sprayTo.x;
  const ey = r.sprayTo.y;
  for (let i = 0; i < 5; i++) {
    const u = Math.min(1, Math.max(0, k * 1.2 - i * 0.09));
    if (u <= 0) continue;
    const x = sx + (ex - sx) * u;
    const y = sy + (ey - sy) * u - Math.sin(u * Math.PI) * 3;
    c.fillStyle = i % 2 === 0 ? '#a6d82c' : '#d4f06a';
    c.fillRect(snap(x), snap(y), 1, 1);
  }
}
