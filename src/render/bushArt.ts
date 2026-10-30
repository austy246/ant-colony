import { FINE } from './fine';
import type { Ctx2D } from './sprites';
import type { Bush } from '../sim/aphids';

const PX = 1 / FINE;
/** The bush is drawn this many times larger than its base pattern (about 300 x 270 art px), so it is easy to spot on a big map. */
const SCALE = 16;
/** The aphids are this many times larger than the base aphid (12 x 8 fine px): about twice an ant. */
const APHID_SCALE = 2;
/** Leafy blobs of the bush: [dx, dy, radius] in base units (times SCALE, in art px) around the bush position. */
const BLOBS: readonly (readonly [number, number, number])[] = [
  [-5, 1, 4.5], [0, -2, 5.5], [5, 1, 4.5], [-2, 4, 4], [3, 4.5, 3.8], [0, 1, 4],
];
const GREENS = ['#2f5a22', '#3e7a2c', '#4c8a34', '#5a9a3c'];
/** Where the aphids sit on the bush (base units times SCALE); the first `aphids` of them are drawn. */
const SPOTS: readonly (readonly [number, number])[] = [
  [-6, 1], [-3, -4], [2, -5], [6, 0], [-1, 5], [4, 5], [-4, 4], [0, -1], [7, 3], [-7, -2], [3, -2], [-2, 1], [5, -3], [1, 7], [-5, 6],
];

/** One aphid (12 x 8 fine px times APHID_SCALE): pear-shaped light green body, six thin legs, a pale shine, two feelers, an eye. */
function drawAphid(c: Ctx2D, x: number, y: number, i: number): void {
  const u = PX * APHID_SCALE;
  const left = i % 2 === 0;
  c.fillStyle = '#3f5a1c';
  for (const lx of [3, 6, 9]) {
    c.fillRect(x + lx * u, y - u, u, u);
    c.fillRect(x + lx * u, y + 8 * u, u, u);
  }
  c.fillRect(x + (left ? 0 : 11) * u, y + u, u, u);
  c.fillRect(x + (left ? 1 : 10) * u, y + 2 * u, u, u);
  for (let iy = 0; iy < 8; iy++) {
    for (let ix = 0; ix < 12; ix++) {
      // pear: wide at the back, narrower at the head end
      const a = (ix - (left ? 7 : 4)) / 5;
      const v = (iy - 3.5) / (3.5 - 0.5 * Math.abs(a) * 0.4 + (left ? -a : a) * 0.3);
      if (a * a + v * v > 1) continue;
      c.fillStyle = iy < 3 ? '#d4ec7a' : iy > 5 ? '#9cc040' : '#bde054';
      c.fillRect(x + ix * u, y + iy * u, u, u);
    }
  }
  c.fillStyle = '#e8f6b8';
  c.fillRect(x + 4 * u, y + 2 * u, 2 * u, u);
  c.fillStyle = '#1c2a0c';
  c.fillRect(x + (left ? 1 : 10) * u, y + 3 * u, u, u);
}

/** A big leafy bush with its aphids. The blobs are painted as one rectangle per fine row (cheap even at this size). */
export function drawBush(c: Ctx2D, bush: Bush, time: number): void {
  const cx = bush.x;
  const cy = bush.y;
  c.fillStyle = 'rgba(10,6,3,.3)';
  c.fillRect(cx - 7 * SCALE, cy + 7 * SCALE, 14 * SCALE, 2 * SCALE);
  for (let b = 0; b < BLOBS.length; b++) {
    const [dx, dy, r] = BLOBS[b];
    const bx = cx + dx * SCALE;
    const by = cy + dy * SCALE;
    const rf = r * SCALE * FINE;
    for (let iy = -Math.floor(rf); iy < Math.floor(rf); iy++) {
      const half = Math.sqrt(rf * rf - (iy + 0.5) * (iy + 0.5)) / FINE;
      c.fillStyle = GREENS[((iy + b) & 1) + (iy < -rf * 0.3 ? 2 : 0)];
      c.fillRect(bx - half, by + iy * PX, half * 2, PX);
    }
  }
  const n = Math.min(bush.aphids, SPOTS.length);
  for (let i = 0; i < n; i++) {
    const wob = Math.sin(time * 2 + i * 1.7) > 0.8 ? 1 : 0;
    const [dx, dy] = SPOTS[i];
    drawAphid(c, cx + dx * SCALE - 6 * PX * APHID_SCALE, cy + dy * SCALE + wob * 0.5 - 4 * PX * APHID_SCALE, i);
  }
}
