import { NEST } from '../sim/constants';
import { createRng } from '../sim/rng';
import type { Feature, Terrain } from '../sim/terrain';
import { FINE as F } from './fine';
import { hash2, Raster, shade, vnoise } from './raster';
import { SHADOW, type Ctx2D } from './sprites';

/** Minimal canvas surface used by the renderer (HTMLCanvasElement, OffscreenCanvas-like, @napi-rs/canvas). */
export interface CanvasLike {
  width: number;
  height: number;
  getContext(id: '2d'): Ctx2D | null;
}

export type CanvasFactory = (w: number, h: number) => CanvasLike;

const defaultMake: CanvasFactory = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

// Palette (see the design spec); a few intermediate shades per family were added for the finer grid.
const SOIL = ['#352517', '#3e2c1d', '#4a3524', '#54402c', '#5f4a33'];
const CLOD = ['#3a2a1b', '#4a3524', '#5a4430', '#6b5238'];
const MOSS = { deep: '#2f4c1b', dark: '#3d6023', mid: '#4f7a2e', light: '#68964a', tip: '#86b35f' };
const LEAVES = ['#7a4a22', '#9a6130', '#6a3d1c', '#a8703a'];
const GRASS = ['#4f7a2e', '#68964a', '#3d6023'];
const STONE = ['#44463f', '#5d5f5b', '#6b6d68', '#797b76', '#93958f'];
const BARK = { shade: '#2e1d10', under: '#3a2517', base: '#4c3320', mid: '#6b4a2c', lit: '#8a6339', fleck: '#7a5733', cut: '#b79a6a' };
const RIM = ['#4b3a28', '#5f4a33', '#6b5238', '#7d6244', '#8d7152'];
const PEBBLE = ['#4a4036', '#645a4c', '#7d7262', '#968a76'];

function paintGround(R: Raster, r: () => number, seed: number): void {
  const s1 = (seed * 7 + 1) | 0;
  const s2 = (seed * 13 + 2) | 0;
  const s3 = (seed * 29 + 3) | 0;
  const s4 = (seed * 31 + 4) | 0;
  const s5 = (seed * 37 + 5) | 0;
  const W = R.w;
  const H = R.h;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Soft patches of lighter / darker soil (three octaves of value noise), dithered at the band borders.
      const n = 0.45 * vnoise(x, y, 70, s1) + 0.33 * vnoise(x, y, 26, s2) + 0.22 * vnoise(x, y, 9, s3);
      const v = n + (hash2(x, y, s4) - 0.5) * 0.09;
      let col = v < 0.3 ? SOIL[0] : v < 0.4 ? SOIL[1] : v < 0.6 ? SOIL[2] : v < 0.7 ? SOIL[3] : SOIL[4];
      const h = hash2(x, y, s5);
      if (h < 0.028) col = v < 0.5 ? SOIL[3] : '#6b5238';
      else if (h > 0.975) col = v > 0.55 ? SOIL[1] : '#2a1c11';
      R.px(x, y, col);
    }
  }
  // Clods: small shaded lumps of earth.
  for (let i = 0; i < 1500; i++) {
    const cx = r() * W;
    const cy = r() * H;
    const rx = 1.3 + r() * 2.1;
    const ry = 1 + r() * 1.3;
    R.ell(cx + 1, cy + 1, rx, ry, '#1c120a', 0.3);
    R.dome(cx, cy, rx, ry, CLOD, { jitter: 0.25, seed: i, bias: (r() - 0.5) * 0.18 });
  }
  // Tiny pebbles with a lit corner and a contact shadow.
  for (let i = 0; i < 240; i++) {
    const cx = r() * W;
    const cy = r() * H;
    const rx = 1.2 + r() * 0.9;
    const ry = 0.9 + r() * 0.6;
    R.ell(cx + 1, cy + 1, rx, ry, '#1a1008', 0.5);
    R.dome(cx, cy, rx, ry, PEBBLE, { jitter: 0.2, seed: i + 9 });
  }
  // Hairline cracks / root scratches.
  for (let i = 0; i < 110; i++) {
    let x = r() * W;
    let y = r() * H;
    let a = r() * 6.28;
    const len = 5 + r() * 9;
    for (let k = 0; k < len; k++) {
      R.px(x, y, '#2a1c11', 0.55);
      a += (r() - 0.5) * 0.7;
      x += Math.cos(a);
      y += Math.sin(a) * 0.6;
    }
  }
}

function paintMoss(R: Raster, cx: number, cy: number, k: number): void {
  const RX = 30;
  const RY = 15;
  for (let iy = Math.floor(cy - RY * 1.6); iy <= Math.ceil(cy + RY * 1.6); iy++) {
    for (let ix = Math.floor(cx - RX * 1.6); ix <= Math.ceil(cx + RX * 1.6); ix++) {
      const dx = (ix + 0.5 - cx) / RX;
      const dy = (iy + 0.5 - cy) / RY;
      const wob = (vnoise(ix, iy, 10, k) - 0.5) * 0.6 + (vnoise(ix, iy, 4, k + 7) - 0.5) * 0.3;
      const q = Math.hypot(dx, dy) + wob;
      if (q > 1.2) continue;
      if (q > 1.0) {
        if (hash2(ix, iy, k + 5) < 0.28) R.px(ix, iy, '#2a2412', 0.5); // damp dark soil halo
        continue;
      }
      const dens = q < 0.55 ? 1 : (1 - q) / 0.45;
      if (hash2(ix, iy, k + 1) > dens + 0.04) continue;
      const t = vnoise(ix, iy, 3, k + 3) * 0.55 + hash2(ix, iy, k + 4) * 0.45 - dx * 0.1 - dy * 0.16;
      const col = t < 0.34 ? MOSS.deep : t < 0.54 ? MOSS.dark : t < 0.78 ? MOSS.mid : t < 0.93 ? MOSS.light : MOSS.tip;
      R.px(ix, iy, col);
    }
  }
  // Tiny sprouts (1 px wide stalks with a bright tip and a shadow pixel).
  for (let i = 0; i < 16; i++) {
    const a = hash2(i, 3, k) * 6.28;
    const d = Math.sqrt(hash2(i, 4, k)) * 0.7;
    const sx = Math.floor(cx + Math.cos(a) * d * RX);
    const sy = Math.floor(cy + Math.sin(a) * d * RY);
    const h = 2 + ((hash2(i, 5, k) * 2) | 0);
    R.px(sx + 1, sy, SHADOW, 0.6);
    for (let j = 0; j < h; j++) R.px(sx, sy - j, j === h - 1 ? MOSS.tip : j === 0 ? MOSS.dark : MOSS.mid);
  }
}

function paintLeaf(R: Raster, cx: number, cy: number, base: string, ang: number, k: number): void {
  const L = 9 + hash2(k, 1, 7) * 2.5;
  const Wd = 4.6 + hash2(k, 2, 7) * 0.8;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const curve = (hash2(k, 3, 7) - 0.5) * 0.45;
  const frame = (ix: number, iy: number, ox: number, oy: number): { u: number; v: number; hw: number } => {
    const dx = ix + 0.5 - cx - ox;
    const dy = iy + 0.5 - cy - oy;
    const u = dx * ca + dy * sa;
    const v0 = -dx * sa + dy * ca;
    const v = v0 - (curve * u * u) / L;
    const hw = Wd * (1 - Math.pow(Math.min(1, Math.abs(u) / L), 1.7));
    return { u, v, hw };
  };
  const ext = Math.ceil(L + 4);
  const dark = shade(base, 0.62);
  const vein = shade(base, 0.8);
  const curl = shade(base, 1.28);
  const under = shade(base, 0.55);
  for (let iy = Math.floor(cy) - ext; iy <= Math.ceil(cy) + ext; iy++) {
    for (let ix = Math.floor(cx) - ext; ix <= Math.ceil(cx) + ext; ix++) {
      const s = frame(ix, iy, 2, 2);
      if (Math.abs(s.u) <= L && Math.abs(s.v) <= s.hw + 0.4) R.px(ix, iy, SHADOW);
    }
  }
  for (let iy = Math.floor(cy) - ext; iy <= Math.ceil(cy) + ext; iy++) {
    for (let ix = Math.floor(cx) - ext; ix <= Math.ceil(cx) + ext; ix++) {
      const { u, v, hw } = frame(ix, iy, 0, 0);
      if (Math.abs(u) > L || Math.abs(v) > hw) continue;
      const e = hw - Math.abs(v);
      let col = base;
      const h = hash2(ix, iy, k);
      if (h < 0.14) col = shade(base, 0.9);
      else if (h > 0.9) col = shade(base, 1.1);
      if (Math.abs(v) < 0.55 && Math.abs(u) < L - 1) col = dark;
      else {
        const ph = (Math.abs(u) - Math.abs(v) * 1.15) / 3.3;
        if (e > 0.8 && Math.abs(v) > 0.8 && ph - Math.floor(ph) < 0.2 && Math.abs(u) < L - 2) col = vein;
      }
      if (e < 1) col = v < 0 ? curl : under; // curled upper edge catches light, lower edge is in shade
      R.px(ix, iy, col);
    }
  }
}

function paintNeedle(R: Raster, x: number, y: number, a: number, len: number, main: string, tip: string, base: string): void {
  const x1 = x + Math.cos(a) * len;
  const y1 = y + Math.sin(a) * len;
  R.line(x + 1, y + 1, x1 + 1, y1 + 1, SHADOW, 1, 0.8);
  R.line(x, y, x1, y1, main);
  R.px(x1, y1, tip);
  R.px(Math.floor(x1 - Math.cos(a)), Math.floor(y1 - Math.sin(a)), tip, 0.55);
  R.px(x, y, base);
}

type Twig = Extract<Feature, { kind: 'twig' }>;

function paintTwig(R: Raster, w: Twig, k: number): void {
  const x0 = w.x0 * F;
  const y0 = w.y0 * F;
  const x1 = w.x1 * F;
  const y1 = w.y1 * F;
  const hw0 = (w.t * F) / 2; // half thickness in fine px (same footprint as the sim's twig of thickness t)
  const dx = x1 - x0;
  const dy = y1 - y0;
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  let nx = -uy;
  let ny = ux;
  if (nx * -0.6 + ny * -0.8 < 0) {
    nx = -nx;
    ny = -ny;
  } // normal pointing towards the light (up-left)
  const pad = Math.ceil(hw0) + 4;
  const bx0 = Math.floor(Math.min(x0, x1)) - pad;
  const bx1 = Math.ceil(Math.max(x0, x1)) + pad;
  const by0 = Math.floor(Math.min(y0, y1)) - pad;
  const by1 = Math.ceil(Math.max(y0, y1)) + pad;
  const hwAt = (s: number): number => hw0 * (0.9 + 0.1 * Math.sin(s * 0.11 + k));
  const probe = (px: number, py: number): { s: number; v: number; hw: number; d: number } => {
    const rx = px - x0;
    const ry = py - y0;
    const s = Math.max(0, Math.min(L, rx * ux + ry * uy));
    const qx = rx - ux * s;
    const qy = ry - uy * s;
    return { s, v: rx * nx + ry * ny, hw: hwAt(s), d: Math.hypot(qx, qy) };
  };
  // Contact shadow (down-right).
  for (let iy = by0; iy <= by1; iy++) {
    for (let ix = bx0; ix <= bx1; ix++) {
      const p = probe(ix + 0.5 - 1, iy + 0.5 - 2);
      if (p.d <= p.hw + 0.6) R.px(ix, iy, SHADOW);
    }
  }
  const thin = hw0 <= 1.6;
  for (let iy = by0; iy <= by1; iy++) {
    for (let ix = bx0; ix <= bx1; ix++) {
      const p = probe(ix + 0.5, iy + 0.5);
      if (p.d > p.hw) continue;
      const rel = p.d === 0 ? 0 : Math.max(-1, Math.min(1, p.v / p.hw)); // +1 = lit edge, -1 = shaded edge
      let col: string;
      if (thin) col = rel > 0.1 ? BARK.mid : BARK.base;
      else col = rel > 0.74 ? BARK.lit : rel > 0.3 ? BARK.mid : rel > -0.4 ? BARK.base : rel > -0.82 ? BARK.under : BARK.shade;
      if (!thin) {
        // Bark grooves: dark dashes along the length on a few lanes, plus a few pale flecks.
        const lane = Math.floor(p.v + hw0);
        if (lane % 3 === 1 && rel > -0.8 && rel < 0.75 && hash2(Math.floor(p.s / 4), lane, k) < 0.5) col = BARK.shade;
        else if (hash2(ix, iy, k + 11) > 0.965) col = BARK.fleck;
        else if (rel > 0.5 && hash2(ix, iy, k + 12) < 0.045) col = hash2(ix, iy, k + 13) < 0.5 ? MOSS.mid : MOSS.light; // moss on the lit side
      }
      R.px(ix, iy, col);
    }
  }
  // Knots.
  if (hw0 >= 3) {
    const nk = 1 + (hash2(k, 21, 3) < 0.5 ? 1 : 0);
    for (let i = 0; i < nk; i++) {
      const s = L * (0.2 + hash2(k, 22 + i, 3) * 0.6);
      const v = (hash2(k, 24 + i, 3) - 0.5) * hw0 * 0.9;
      const kx = x0 + ux * s + nx * v;
      const ky = y0 + uy * s + ny * v;
      const kr = Math.max(1.3, hw0 * 0.34);
      R.ell(kx, ky, kr + 0.8, kr * 0.8 + 0.6, BARK.under);
      R.ell(kx, ky, kr, kr * 0.75, BARK.shade);
      R.px(kx - kr * 0.4, ky - kr * 0.5, BARK.lit);
    }
  }
  // Side shoots with pale cut ends.
  if (hw0 >= 3) {
    const n = 1 + (hash2(k, 31, 3) < 0.55 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const s = L * (0.25 + hash2(k, 32 + i, 3) * 0.5);
      const side = hash2(k, 34 + i, 3) < 0.5 ? 1 : -1;
      const ang = Math.atan2(uy, ux) + side * (0.55 + hash2(k, 36 + i, 3) * 0.45);
      const len = 9 + hash2(k, 38 + i, 3) * 9;
      const sx = x0 + ux * s;
      const sy = y0 + uy * s;
      const ex = sx + Math.cos(ang) * len;
      const ey = sy + Math.sin(ang) * len;
      const th = hw0 >= 5 ? 3 : 2;
      R.line(sx + 1, sy + 2, ex + 1, ey + 2, SHADOW, th);
      R.line(sx, sy, ex, ey, BARK.base, th);
      R.line(sx - 1, sy - 1, ex - 1, ey - 1, BARK.lit, 1);
      R.line(sx, sy, ex, ey, BARK.under, 1);
      R.ell(ex, ey, th / 2 + 0.5, th / 2 + 0.5, BARK.cut);
    }
  }
  // Pale cut end with growth rings at (x1, y1).
  const cr = Math.max(hw0 * 0.85, 1.2);
  R.ell(x1, y1, cr + 0.6, cr + 0.6, BARK.under);
  R.ell(x1, y1, cr, cr, BARK.cut);
  if (cr >= 2.4) {
    R.eachInEllipse(x1, y1, cr * 0.9, cr * 0.9, (ix, iy, ex, ey) => {
      const q = Math.hypot(ex, ey);
      if (q > 0.6 && q <= 0.75) R.px(ix, iy, '#8f7650');
    });
    R.px(x1 - 0.4, y1 - 0.4, '#d6c394');
  } else {
    R.px(x1 - 0.5, y1 - 0.5, '#d6c394');
  }
}

type Stone = Extract<Feature, { kind: 'stone' }>;

function paintStone(R: Raster, s: Stone, k: number, r: () => number): void {
  const cx = s.x * F;
  const cy = s.y * F;
  const rx = s.rx * F;
  const ry = s.ry * F;
  // Ground darkening + contact shadow.
  R.ell(cx + 1, cy + 2, rx + 3, ry + 2.5, SHADOW, 0.35);
  R.ell(cx + 2, cy + 3, rx + 1.2, ry + 0.8, SHADOW);
  R.dome(cx, cy, rx, ry, STONE, {
    jitter: 0.2,
    seed: k,
    bias: -0.28,
    contrast: 1.45,
    noise: (x, y) => (vnoise(x, y, 6, k) - 0.5) * 0.3,
  });
  // Dark lower rim (touching the ground) and a thin lit upper-left rim.
  R.eachInEllipse(cx, cy, rx, ry, (ix, iy, nx, ny) => {
    const q = Math.hypot(nx, ny);
    if (q > 0.84 && ny > 0.15 && nx > -0.7) R.px(ix, iy, '#34362f', q > 0.92 ? 0.95 : 0.6);
    else if (q > 0.9 && nx + ny < -0.85) R.px(ix, iy, '#a9aba5', 0.8);
  });
  // Cracks walking inwards from the rim, never reaching the centre.
  const cracks = 1 + ((r() * 2) | 0);
  for (let c = 0; c < cracks; c++) {
    const a = r() * 6.28;
    let x = cx + Math.cos(a) * rx * 0.92;
    let y = cy + Math.sin(a) * ry * 0.92;
    for (let step = 0; step < 14; step++) {
      const nxn = (x - cx) / rx;
      const nyn = (y - cy) / ry;
      if (Math.hypot(nxn, nyn) < 0.5) break;
      R.px(x, y, '#2f312c');
      R.px(x + 1, y + 1, '#8d8f89', 0.45);
      const ta = Math.atan2(cy - y, cx - x) + (r() - 0.5) * 1.6;
      x += Math.cos(ta);
      y += Math.sin(ta) * 0.9;
    }
  }
  // Specular highlights (1 fine px).
  const hx = cx - rx * 0.42;
  const hy = cy - ry * 0.5;
  R.px(hx, hy, '#c4c6c0');
  R.px(hx + 1, hy, '#c4c6c0');
  R.px(hx - 1, hy + 1, '#aeb0aa');
  if (rx >= 10) R.px(cx + rx * 0.25, cy - ry * 0.55, '#b4b6b0');
  // Moss and lichen on the upper rim (kept off the centre).
  const tufts = 2 + ((r() * 3) | 0);
  for (let i = 0; i < tufts; i++) {
    const a = -Math.PI * (0.1 + r() * 0.8);
    const d = 0.58 + r() * 0.3;
    const tx = cx + Math.cos(a) * rx * d;
    const ty = cy + Math.sin(a) * ry * d;
    const n = 4 + ((r() * 7) | 0);
    for (let j = 0; j < n; j++) {
      const px = tx + (r() - 0.5) * 6;
      const py = ty + (r() - 0.5) * 3;
      const q = Math.hypot((px - cx) / rx, (py - cy) / ry);
      if (q > 0.96 || q < 0.5) continue;
      R.px(px, py, r() < 0.45 ? MOSS.mid : r() < 0.5 ? MOSS.dark : MOSS.light);
    }
  }
  for (let i = 0; i < 7; i++) {
    const a = r() * 6.28;
    const d = 0.55 + r() * 0.38;
    R.px(cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, r() < 0.5 ? '#b0b08a' : '#8f9a6a', 0.85);
  }
}

function paintGrass(R: Raster, gx: number, gy: number, r: () => number): void {
  const x0 = Math.floor(gx * F);
  const y0 = Math.floor(gy * F);
  for (let b = 0; b < 6; b++) {
    const bx = x0 + Math.round((b - 2.5) * 1.5);
    const lean = (r() - 0.5) * 9;
    const h = 7 + r() * 8;
    const col = GRASS[(r() * 3) | 0];
    const dark = shade(col, 0.72);
    R.px(bx + 1, y0, SHADOW, 0.7);
    for (let j = 0; j <= h; j++) {
      const t = j / h;
      const x = bx + lean * t * t;
      R.px(x, y0 - j, j <= h * 0.3 ? dark : j >= h - 1 ? shade(col, 1.25) : col);
    }
  }
}

function paintCrater(R: Raster, r: () => number): void {
  const cx = NEST.x * F;
  const cy = NEST.y * F;
  const RX = 24;
  const RY = 13;
  R.ell(cx + 2, cy + 3, RX + 2, RY + 1, SHADOW);
  // Dirt rim with a crumbling edge.
  for (let iy = Math.floor(cy - RY - 4); iy <= Math.ceil(cy + RY + 4); iy++) {
    for (let ix = Math.floor(cx - RX - 4); ix <= Math.ceil(cx + RX + 4); ix++) {
      const nx = (ix + 0.5 - cx) / RX;
      const ny = (iy + 0.5 - cy) / RY;
      const q = Math.hypot(nx, ny) + (vnoise(ix, iy, 4, 77) - 0.5) * 0.22;
      if (q > 1) {
        if (q < 1.14 && hash2(ix, iy, 78) < 0.3) R.px(ix, iy, hash2(ix, iy, 79) < 0.5 ? '#5a432c' : '#6b5238'); // fallen crumbs
        continue;
      }
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny * 0.8));
      const l = (nx * -0.45 + ny * -0.65 + nz * 0.6) * 0.5 + 0.5 + (hash2(ix, iy, 80) - 0.5) * 0.3;
      R.px(ix, iy, RIM[Math.max(0, Math.min(4, Math.floor(l * 5.2 - 0.3)))]);
    }
  }
  // Pebbles on the rim.
  for (let i = 0; i < 16; i++) {
    const a = r() * 6.28;
    const d = 0.62 + r() * 0.3;
    const px = cx + Math.cos(a) * RX * d;
    const py = cy + Math.sin(a) * RY * d;
    if (Math.hypot((px - cx) / 14, (py - cy) / 7.6) < 1.02) continue;
    R.ell(px + 1, py + 1, 1.6, 1.1, '#1a1008', 0.5);
    R.dome(px, py, 1.6 + r() * 0.8, 1.1 + r() * 0.5, PEBBLE, { jitter: 0.2, seed: i + 300 });
  }
  // Dark gradient hole: pale inner lip on the far side, then deepening to black.
  R.eachInEllipse(cx, cy, 14, 7.4, (ix, iy, nx, ny) => {
    const q = Math.hypot(nx, ny) + (hash2(ix, iy, 81) - 0.5) * 0.12;
    let col = q > 0.86 ? '#2a1c11' : q > 0.68 ? '#1b110a' : q > 0.42 ? '#0e0805' : '#050302';
    if (ny < -0.25 && q > 0.74) col = '#3a2a1b'; // far wall catches a little light
    R.px(ix, iy, col);
  });
}

/**
 * Prerenders the whole ground (soil texture, stones, twigs, needles, leaf litter, moss, grass, nest crater) into
 * one t.w*FINE x t.h*FINE canvas (fine pixels = half art pixels), pixel by pixel in a software raster.
 * A feature at (x, y) in art pixels lies at (x*FINE, y*FINE) here, sizes scale by FINE, so what is drawn matches the
 * simulation's speed map exactly; only the amount of detail differs. Deterministic for a given terrain (seed ^ 0x51ed).
 */
export function renderTerrain(t: Terrain, make: CanvasFactory = defaultMake): CanvasLike {
  const W = t.w * F;
  const H = t.h * F;
  const R = new Raster(W, H);
  const r = createRng(t.seed ^ 0x51ed);
  const sk = t.seed & 255;
  paintGround(R, r, t.seed);

  const of = <K extends Feature['kind']>(kind: K) =>
    t.features.filter((f): f is Extract<Feature, { kind: K }> => f.kind === kind);

  for (const [i, m] of of('moss').entries()) paintMoss(R, m.x * F, m.y * F, 100 + i * 17 + sk);

  for (const [i, l] of of('leaf').entries()) {
    paintLeaf(R, l.x * F, l.y * F, LEAVES[l.c % LEAVES.length], r() * Math.PI * 2, 200 + i * 5 + sk);
  }

  // Needle pairs: consecutive needles sharing a base point.
  let baseX = NaN;
  let baseY = NaN;
  let green = false;
  let second = false;
  for (const n of of('needle')) {
    if (n.x === baseX && n.y === baseY) {
      second = true;
    } else {
      baseX = n.x;
      baseY = n.y;
      green = r() < 0.18;
      second = false;
    }
    const main = green ? (second ? '#4f7022' : '#6d8f2f') : second ? '#9b5d22' : '#c9822f';
    const tip = green ? '#9fc24a' : second ? '#c98a45' : '#e8a64e';
    paintNeedle(R, n.x * F, n.y * F, n.a, n.len * F, main, tip, second ? '#4c3320' : '#6b4a2c');
  }

  for (const [i, w] of of('twig').entries()) paintTwig(R, w, 300 + i * 3 + sk);
  for (const [i, s] of of('stone').entries()) paintStone(R, s, 400 + i * 3 + sk, r);
  for (const g of of('grass')) paintGrass(R, g.x, g.y, r);
  paintCrater(R, r);

  const canvas = make(W, H);
  const c = canvas.getContext('2d');
  if (!c) throw new Error('2d context unavailable');
  const img = c.createImageData(W, H);
  img.data.set(R.data);
  c.putImageData(img, 0, 0);
  return canvas;
}
