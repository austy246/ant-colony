import { FINE } from './fine';
import type { Ctx2D } from './sprites';
import type { Bush } from '../sim/aphids';

const PX = 1 / FINE;
/** The bush (and its aphids) is drawn this many times larger than the pattern below, so it is easy to spot on a big map. */
const SCALE = 2;
/** Leafy blobs of the bush: [dx, dy, radius] in art px around the bush position. */
const BLOBS: readonly (readonly [number, number, number])[] = [
  [-5, 1, 4.5], [0, -2, 5.5], [5, 1, 4.5], [-2, 4, 4], [3, 4.5, 3.8], [0, 1, 4],
];
const GREENS = ['#2f5a22', '#3e7a2c', '#4c8a34', '#5a9a3c'];
/** Where the aphids sit on the bush (art px offsets); the first `aphids` of them are drawn. */
const SPOTS: readonly (readonly [number, number])[] = [
  [-6, 1], [-3, -4], [2, -5], [6, 0], [-1, 5], [4, 5], [-4, 4], [0, -1], [7, 3], [-7, -2], [3, -2], [-2, 1], [5, -3], [1, 7], [-5, 6],
];

/** A small leafy bush with its aphids (little green dots with a pale shine) on the fine grid. */
export function drawBush(c: Ctx2D, bush: Bush, time: number): void {
  const cx = Math.floor(bush.x * FINE);
  const cy = Math.floor(bush.y * FINE);
  c.fillStyle = 'rgba(10,6,3,.35)';
  c.fillRect((cx - 9 * SCALE * FINE) * PX, (cy + 5 * SCALE * FINE) * PX, 18 * SCALE, 2 * SCALE);
  for (let b = 0; b < BLOBS.length; b++) {
    const [dx, dy, r] = BLOBS[b];
    const rf = r * FINE * SCALE;
    for (let iy = -Math.ceil(rf); iy <= Math.ceil(rf); iy++) {
      for (let ix = -Math.ceil(rf); ix <= Math.ceil(rf); ix++) {
        if (ix * ix + iy * iy > rf * rf) continue;
        c.fillStyle = GREENS[((ix + iy + b) & 1) + (iy < -rf * 0.3 ? 2 : 0)];
        c.fillRect((cx + dx * FINE * SCALE + ix) * PX, (cy + dy * FINE * SCALE + iy) * PX, PX, PX);
      }
    }
  }
  const n = Math.min(bush.aphids, SPOTS.length);
  for (let i = 0; i < n; i++) {
    const wob = Math.sin(time * 2 + i * 1.7) > 0.8 ? 1 : 0;
    const [dx, dy] = SPOTS[i];
    const x = (cx + dx * FINE * SCALE) * PX;
    const y = (cy + (dy + wob * 0.5) * FINE * SCALE) * PX;
    c.fillStyle = '#a8d060';
    c.fillRect(x, y, 3 * PX, 3 * PX);
    c.fillStyle = '#e2f2a8';
    c.fillRect(x, y, PX, PX);
  }
}
