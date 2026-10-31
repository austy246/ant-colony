import { FINE } from './fine';
import type { Ctx2D } from './sprites';
import type { CanvasFactory, CanvasLike } from './terrainRender';
import { APHID_SPOTS, BUSH_SCALE, aphidCenter, type Bush } from '../sim/aphids';

const PX = 1 / FINE;
/** The bush is drawn this many times larger than its base pattern (about 300 x 270 art px), so it is easy to spot on a big map. */
const SCALE = BUSH_SCALE;
/** The aphids are this many times larger than the base aphid (12 x 8 fine px): about twice an ant. */
const APHID_SCALE = 2;
/** Leafy lobes of the bush: [dx, dy, radius] in base units (times SCALE, in art px) around the bush position. */
const BLOBS: readonly (readonly [number, number, number])[] = [
  [-5, 1, 4.5], [0, -2, 5.5], [5, 1, 4.5], [-2, 4, 4], [3, 4.5, 3.8], [0, 1, 4],
];

/** Size of the pre-rendered bush (fine px) and where the bush's centre lies in it. */
export const BUSH_W = 340 * FINE;
export const BUSH_H = 300 * FINE;
const CX = BUSH_W / 2;
const CY = Math.round(BUSH_H * 0.46);

/** Greens from the shadow under the bush to its sunlit leaf tips. */
const LEAF: readonly (readonly [number, number, number])[] = [
  [0x10, 0x2c, 0x16], [0x1a, 0x45, 0x1e], [0x25, 0x5c, 0x24], [0x36, 0x74, 0x26], [0x4d, 0x8c, 0x2a], [0x6a, 0xa4, 0x30], [0x8c, 0xbe, 0x3a], [0xb0, 0xd6, 0x4c],
];

/** Small integer hash -> 0..1 (deterministic: the bush looks the same every time). */
function hash(x: number, y: number, s = 0): number {
  let h = (Math.imul(x | 0, 0x9e3779b1) ^ Math.imul(y | 0, 0x85ebca6b) ^ Math.imul(s | 0, 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Is the fine pixel (px, py) (relative to the bush's centre) inside the ragged union of the lobes? Returns how deep (>= 0 inside, the edge at 0), or -1. */
function depthAt(px: number, py: number): number {
  let best = -1;
  for (let b = 0; b < BLOBS.length; b++) {
    const [dx, dy, r] = BLOBS[b];
    const ddx = px - dx * SCALE * FINE;
    const ddy = py - dy * SCALE * FINE;
    const ang = Math.atan2(ddy, ddx);
    // ragged edge: a few sine waves per lobe make leaf clusters poke out
    const wob = 1 + 0.07 * Math.sin(ang * 7 + b * 2.1) + 0.05 * Math.sin(ang * 13 + b) + 0.03 * Math.sin(ang * 23 + b * 3);
    const rr = r * SCALE * FINE * wob;
    const d = (rr - Math.hypot(ddx, ddy)) / (SCALE * FINE);
    if (d > best) best = d;
  }
  return best >= 0 ? best : -1;
}

/**
 * The bush as RGBA pixels (BUSH_W x BUSH_H fine px): leafy foliage lit from above left, dark underneath, with leaf-sized
 * speckles of light and dark, a ragged outline, a shadow under it and a few fallen leaves on the ground.
 */
export function bushPixels(): Uint8ClampedArray {
  const out = new Uint8ClampedArray(BUSH_W * BUSH_H * 4);
  const put = (x: number, y: number, r: number, g: number, b: number, a = 255): void => {
    if (x < 0 || y < 0 || x >= BUSH_W || y >= BUSH_H) return;
    const i = (y * BUSH_W + x) * 4;
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = a;
  };
  // vertical extent of the foliage (for the light-to-dark gradient)
  const top = -7.5 * SCALE * FINE;
  const bottom = 8.5 * SCALE * FINE;
  // soft shadow on the ground under the bush
  for (let y = CY + 6 * SCALE * FINE; y < CY + 9.5 * SCALE * FINE; y++) {
    const v = (y - (CY + 7.7 * SCALE * FINE)) / (1.8 * SCALE * FINE);
    const half = 9 * SCALE * FINE * Math.sqrt(Math.max(0, 1 - v * v));
    for (let x = Math.floor(CX - half); x < CX + half; x++) put(x, Math.floor(y), 10, 6, 3, 80);
  }
  for (let y = 0; y < BUSH_H; y++) {
    for (let x = 0; x < BUSH_W; x++) {
      const px = x - CX;
      const py = y - CY;
      const d = depthAt(px, py);
      if (d < 0) continue;
      // light: from above and a little from the left; the lower the darker
      const h = Math.min(1, Math.max(0, (py - top) / (bottom - top)));
      let light = 0.82 - 0.7 * h - 0.18 * ((px / (9.5 * SCALE * FINE)) * 0.5 + 0.5);
      // leaf texture: slanted leaf-sized cells (about 6 x 4 fine px), each its own shade, lighter at its top edge and darker at its
      // bottom edge, so the foliage reads as overlapping leaves; plus a coarser clumping of lighter and darker twigs
      const u = x * 0.92 + y * 0.4;
      const v = y * 0.92 - x * 0.2;
      const cu = Math.floor(u / 6);
      const cv = Math.floor(v / 4);
      const cell = hash(cu, cv, 1);
      const t = v / 4 - cv;
      light += (cell - 0.5) * 0.6 + (0.5 - t) * 0.34;
      light += (hash(Math.floor(x / 16), Math.floor(y / 12), 2) - 0.5) * 0.3;
      // lobes overlap: the rim of each lobe shades the one behind
      light -= Math.max(0, 0.9 - d) * 0.22;
      // the very bottom is in shadow
      if (h > 0.84) light -= (h - 0.84) * 3;
      const k = Math.max(0, Math.min(LEAF.length - 1, Math.round(light * (LEAF.length - 1))));
      const [r, g, b] = LEAF[k];
      put(x, y, r, g, b);
      // a bright leaf tip here and there on the sunlit side
      if (h < 0.7 && hash(x, y, 3) > 0.985) put(x, y, 0xc8, 0xe4, 0x6a);
    }
  }
  // dark outline on the lower half of the edge, bright on the upper half
  const copy = out.slice();
  const solid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < BUSH_W && y < BUSH_H && copy[(y * BUSH_W + x) * 4 + 3] === 255;
  for (let y = 1; y < BUSH_H - 1; y++) {
    for (let x = 1; x < BUSH_W - 1; x++) {
      if (!solid(x, y)) continue;
      if (solid(x - 1, y) && solid(x + 1, y) && solid(x, y - 1) && solid(x, y + 1)) continue;
      if (y > CY) put(x, y, 0x0c, 0x24, 0x12);
      else if (hash(x, y, 4) > 0.55) put(x, y, 0x9a, 0xc8, 0x40);
    }
  }
  // fallen leaves and dark clumps on the ground just below the bush
  for (let i = 0; i < 26; i++) {
    const lx = Math.floor(CX + (hash(i, 7, 5) - 0.5) * 17 * SCALE * FINE);
    const ly = Math.floor(CY + 8.4 * SCALE * FINE + hash(i, 8, 5) * 1.4 * SCALE * FINE);
    const w = 3 + Math.floor(hash(i, 9, 5) * 5);
    const c = LEAF[1 + Math.floor(hash(i, 10, 5) * 2)];
    for (let k = 0; k < w; k++) put(lx + k, ly + (k > w / 2 ? 1 : 0), c[0], c[1], c[2]);
  }
  return out;
}

/** The pre-rendered bush on a small offscreen canvas (built once, on first use, through the injectable canvas factory). */
export class BushSprite {
  private canvas: CanvasLike | null = null;

  constructor(private make: CanvasFactory) {}

  get(): CanvasLike {
    if (!this.canvas) {
      const cv = this.make(BUSH_W, BUSH_H);
      const ctx = cv.getContext('2d');
      if (ctx) {
        const img = ctx.createImageData(BUSH_W, BUSH_H);
        img.data.set(bushPixels());
        ctx.putImageData(img, 0, 0);
      }
      this.canvas = cv;
    }
    return this.canvas;
  }
}

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

/** The bush (the pre-rendered sprite, drawn at the bush's position) with its aphids on top. */
export function drawBush(c: Ctx2D, bush: Bush, time: number, sprite: BushSprite): void {
  if (c.imageSmoothingEnabled) c.imageSmoothingEnabled = false;
  c.drawImage(sprite.get() as unknown as CanvasImageSource, bush.x - CX / FINE, bush.y - CY / FINE, BUSH_W / FINE, BUSH_H / FINE);
  const n = Math.min(bush.aphids, APHID_SPOTS.length);
  for (let i = 0; i < n; i++) {
    const wob = Math.sin(time * 2 + i * 1.7) > 0.8 ? 1 : 0;
    const p = aphidCenter(bush, i);
    drawAphid(c, p.x - 6 * PX * APHID_SCALE, p.y + wob * 0.5 - 4 * PX * APHID_SCALE, i);
  }
}
