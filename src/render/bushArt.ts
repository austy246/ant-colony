import { FINE } from './fine';
import type { Ctx2D } from './sprites';
import type { Bush } from '../sim/aphids';

const PX = 1 / FINE;
/** The bush (and its aphids) is drawn this many times larger than the pattern below, so it is easy to spot on a big map. */
const SCALE = 4;
/** Leafy blobs of the bush: [dx, dy, radius] in art px around the bush position. */
const BLOBS: readonly (readonly [number, number, number])[] = [
  [-5, 1, 4.5], [0, -2, 5.5], [5, 1, 4.5], [-2, 4, 4], [3, 4.5, 3.8], [0, 1, 4],
];
const GREENS = ['#2f5a22', '#3e7a2c', '#4c8a34', '#5a9a3c'];
/** Where the aphids sit on the bush (art px offsets); the first `aphids` of them are drawn. */
const SPOTS: readonly (readonly [number, number])[] = [
  [-6, 1], [-3, -4], [2, -5], [6, 0], [-1, 5], [4, 5], [-4, 4], [0, -1], [7, 3], [-7, -2], [3, -2], [-2, 1], [5, -3], [1, 7], [-5, 6],
];

/** One aphid, about as big as an ant (12 x 8 fine px): pear-shaped green body, six thin legs, a pale shine, two feelers. */
function drawAphid(c: Ctx2D, x: number, y: number, i: number): void {
  const left = i % 2 === 0;
  // legs and feelers first, the body overlaps them
  c.fillStyle = '#3f5a1c';
  for (const lx of [3, 6, 9]) {
    c.fillRect(x + lx * PX, y - PX, PX, PX);
    c.fillRect(x + lx * PX, y + 8 * PX, PX, PX);
  }
  c.fillRect(x + (left ? 0 : 11) * PX, y + 1 * PX, PX, PX);
  c.fillRect(x + (left ? 1 : 10) * PX, y + 2 * PX, PX, PX);
  for (let iy = 0; iy < 8; iy++) {
    for (let ix = 0; ix < 12; ix++) {
      // pear: wide at the back, narrower at the head end
      const u = (ix - (left ? 7 : 4)) / (left ? 5 : 5);
      const v = (iy - 3.5) / (3.5 - 0.5 * Math.abs(u) * 0.4 + (left ? -u : u) * 0.3);
      if (u * u + v * v > 1) continue;
      c.fillStyle = iy < 3 ? '#d4ec7a' : iy > 5 ? '#9cc040' : '#bde054';
      c.fillRect(x + ix * PX, y + iy * PX, PX, PX);
    }
  }
  c.fillStyle = '#e8f6b8';
  c.fillRect(x + 4 * PX, y + 2 * PX, 2 * PX, PX);
  c.fillStyle = '#1c2a0c';
  c.fillRect(x + (left ? 1 : 10) * PX, y + 3 * PX, PX, PX); // eye
}

/** A small leafy bush with its aphids (little green dots with a pale shine) on the fine grid. */
export function drawBush(c: Ctx2D, bush: Bush, time: number): void {
  const cx = Math.floor(bush.x * FINE);
  const cy = Math.floor(bush.y * FINE);
  c.fillStyle = 'rgba(10,6,3,.3)';
  c.fillRect((cx - 7 * SCALE * FINE) * PX, (cy + 7 * SCALE * FINE) * PX, 14 * SCALE, 2 * SCALE);
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
    drawAphid(c, x, y, i);
  }
}
