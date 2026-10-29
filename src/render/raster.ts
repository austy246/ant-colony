/**
 * Tiny software rasteriser for pixel art on the fine grid: integer pixels, no anti-aliasing, straight-alpha
 * "over" blending, fully deterministic (no canvas state, no Math.random). Terrain and sprites are painted here
 * once and then blitted (terrain via putImageData, sprites as colour-grouped fillRect runs).
 */

export type Rgba = readonly [number, number, number, number];

const colorCache = new Map<string, Rgba>();

/** Parses '#rrggbb' or 'rgba(r,g,b,a)' / 'rgb(r,g,b)'; alpha is 0..1. */
export function parseColor(s: string): Rgba {
  let v = colorCache.get(s);
  if (v) return v;
  if (s[0] === '#') {
    v = [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 1];
  } else {
    const m = /^rgba?\(([^)]+)\)$/.exec(s);
    if (!m) throw new Error(`bad colour ${s}`);
    const p = m[1].split(',').map((q) => parseFloat(q));
    v = [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  colorCache.set(s, v);
  return v;
}

const hex2 = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/** Multiplies the RGB channels (f < 1 darkens, f > 1 lightens towards white). */
export function shade(col: string, f: number): string {
  const [r, g, b] = parseColor(col);
  const m = (v: number): number => (f <= 1 ? v * f : v + (255 - v) * (f - 1));
  return `#${hex2(m(r))}${hex2(m(g))}${hex2(m(b))}`;
}

/** Deterministic integer-lattice hash in [0, 1). */
export function hash2(x: number, y: number, s = 0): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1) with feature size `scale` (fine px). */
export function vnoise(x: number, y: number, scale: number, s: number): number {
  const fx = x / scale;
  const fy = y / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  let tx = fx - x0;
  let ty = fy - y0;
  tx = tx * tx * (3 - 2 * tx);
  ty = ty * ty * (3 - 2 * ty);
  const a = hash2(x0, y0, s);
  const b = hash2(x0 + 1, y0, s);
  const c = hash2(x0, y0 + 1, s);
  const d = hash2(x0 + 1, y0 + 1, s);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

export interface DomeOpts {
  /** Shifts the lit/dark balance (-0.5 darker .. +0.5 lighter). */
  bias?: number;
  /** Stretches the tone range around the middle (1 = plain, > 1 = harder light/shadow separation). */
  contrast?: number;
  /** Random +- jitter of the tone (0..1) for a grainy surface. */
  jitter?: number;
  /** Extra tone term per pixel (receives the pixel integer coordinates, local to the raster origin). */
  noise?: (x: number, y: number) => number;
  seed?: number;
  alpha?: number;
}

const LX = -0.5;
const LY = -0.62;
const LZ = 0.6;
const LN = Math.hypot(LX, LY, LZ);

export interface SpriteGroup {
  style: string;
  /** x, y, w, h quadruples in fine px relative to the anchor. */
  rects: Int16Array;
}

export class Raster {
  readonly data: Uint8ClampedArray;

  /** (ox, oy) = where local (0, 0) lies in the raster, so sprites can be drawn around their anchor. */
  constructor(
    readonly w: number,
    readonly h: number,
    readonly ox = 0,
    readonly oy = 0,
  ) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  /** Fills every pixel opaque with one colour. */
  fill(col: string): void {
    const [r, g, b] = parseColor(col);
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = r;
      this.data[i + 1] = g;
      this.data[i + 2] = b;
      this.data[i + 3] = 255;
    }
  }

  /** Sets one pixel (local integer coordinates), blending `col` (with its own alpha times `alpha`) over it. */
  px(x: number, y: number, col: string, alpha = 1): void {
    const ix = Math.floor(x) + this.ox;
    const iy = Math.floor(y) + this.oy;
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return;
    const [r, g, b, a0] = parseColor(col);
    const a = a0 * alpha;
    if (a <= 0) return;
    const d = this.data;
    const i = (iy * this.w + ix) * 4;
    if (a >= 0.999) {
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
      return;
    }
    const da = d[i + 3] / 255;
    const oa = a + da * (1 - a);
    d[i] = (r * a + d[i] * da * (1 - a)) / oa;
    d[i + 1] = (g * a + d[i + 1] * da * (1 - a)) / oa;
    d[i + 2] = (b * a + d[i + 2] * da * (1 - a)) / oa;
    d[i + 3] = oa * 255;
  }

  /** RGBA of a pixel (local coordinates); transparent outside. */
  get(x: number, y: number): [number, number, number, number] {
    const ix = Math.floor(x) + this.ox;
    const iy = Math.floor(y) + this.oy;
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return [0, 0, 0, 0];
    const i = (iy * this.w + ix) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  rect(x: number, y: number, w: number, h: number, col: string, alpha = 1): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, col, alpha);
  }

  /** Calls `cb` for every pixel whose centre lies inside the ellipse (continuous centre, radii in fine px). */
  eachInEllipse(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    cb: (ix: number, iy: number, nx: number, ny: number) => void,
  ): void {
    const x0 = Math.floor(cx - rx);
    const x1 = Math.ceil(cx + rx);
    const y0 = Math.floor(cy - ry);
    const y1 = Math.ceil(cy + ry);
    for (let iy = y0; iy <= y1; iy++) {
      for (let ix = x0; ix <= x1; ix++) {
        const nx = (ix + 0.5 - cx) / rx;
        const ny = (iy + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1) cb(ix, iy, nx, ny);
      }
    }
  }

  ell(cx: number, cy: number, rx: number, ry: number, col: string, alpha = 1): void {
    this.eachInEllipse(cx, cy, rx, ry, (ix, iy) => this.px(ix, iy, col, alpha));
  }

  /** Ellipse shaded like a lit dome (light from the upper left): `ramp` runs dark -> light. */
  dome(cx: number, cy: number, rx: number, ry: number, ramp: readonly string[], o: DomeOpts = {}): void {
    const n = ramp.length;
    const bias = o.bias ?? 0;
    const jit = o.jitter ?? 0;
    const seed = o.seed ?? 0;
    this.eachInEllipse(cx, cy, rx, ry, (ix, iy, nx, ny) => {
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const l = (nx * LX + ny * LY + nz * LZ) / LN; // -1 .. 1
      let t = (l * 0.5 + 0.5 - 0.5) * (o.contrast ?? 1) + 0.5 + bias;
      if (jit) t += (hash2(ix, iy, seed) - 0.5) * jit;
      if (o.noise) t += o.noise(ix, iy);
      this.px(ix, iy, ramp[Math.max(0, Math.min(n - 1, Math.floor(t * n)))], o.alpha ?? 1);
    });
  }

  /** 8-connected line; thickness t = square brush of t x t pixels centred on the line. */
  line(x0: number, y0: number, x1: number, y1: number, col: string, t = 1, alpha = 1): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    const half = Math.floor((t - 1) / 2);
    for (let i = 0; i <= n; i++) {
      const x = Math.floor(x0 + ((x1 - x0) * i) / n);
      const y = Math.floor(y0 + ((y1 - y0) * i) / n);
      for (let j = 0; j < t; j++) for (let k = 0; k < t; k++) this.px(x - half + k, y - half + j, col, alpha);
    }
  }

  /** Bounding box (raster px, end exclusive) of the opaque pixels, i.e. ignoring soft shadows and translucent bits. */
  solidBounds(): { x0: number; y0: number; x1: number; y1: number } {
    let x0 = this.w;
    let y0 = this.h;
    let x1 = 0;
    let y1 = 0;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.data[(y * this.w + x) * 4 + 3] < 250) continue;
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x + 1);
        y1 = Math.max(y1, y + 1);
      }
    }
    return { x0, y0, x1, y1 };
  }

  /**
   * Horizontal runs of equal colour, grouped per colour: used to draw sprites as few fillRects. Rect coordinates are
   * relative to the anchor, which is the centre of the opaque pixels' bounding box (rounded to a pixel boundary).
   */
  toRuns(): SpriteGroup[] {
    const b = this.solidBounds();
    const ax = Math.round((b.x0 + b.x1) / 2);
    const ay = Math.round((b.y0 + b.y1) / 2);
    const groups = new Map<number, { style: string; rects: number[] }>();
    const d = this.data;
    for (let y = 0; y < this.h; y++) {
      let x = 0;
      while (x < this.w) {
        const i = (y * this.w + x) * 4;
        const a = d[i + 3];
        if (a === 0) {
          x++;
          continue;
        }
        let x1 = x;
        while (x1 + 1 < this.w) {
          const j = (y * this.w + x1 + 1) * 4;
          if (d[j] !== d[i] || d[j + 1] !== d[i + 1] || d[j + 2] !== d[i + 2] || d[j + 3] !== a) break;
          x1++;
        }
        const key = ((d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | a) >>> 0;
        let g = groups.get(key);
        if (!g) {
          const style =
            a === 255
              ? `rgb(${d[i]},${d[i + 1]},${d[i + 2]})`
              : `rgba(${d[i]},${d[i + 1]},${d[i + 2]},${(a / 255).toFixed(3)})`;
          g = { style, rects: [] };
          groups.set(key, g);
        }
        g.rects.push(x - ax, y - ay, x1 - x + 1, 1);
        x = x1 + 1;
      }
    }
    return [...groups.values()].map((g) => ({ style: g.style, rects: Int16Array.from(g.rects) }));
  }
}
