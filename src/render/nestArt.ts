/**
 * Pixel art of the underground cross-section, all on the fine grid (one unit = one fine pixel, deterministic):
 * the static soil backdrop, chamber/tunnel painting helpers, larva sprites, crumb piles, eggs and a tiny 3 x 5 bitmap font.
 * Nothing here touches the world; underground.ts composes it every frame.
 */
import { createRng } from '../sim/rng';
import { hash2, Raster, shade, vnoise } from './raster';
import type { Ctx2D } from './sprites';
import { nestLayout, type Chamber, type Pt, type Tunnel } from './nestLayout';

// ---- palette (consistent with the surface: same soil / stone / needle / moss families) ---------------------------------

export const VOID_COLOR = '#120b06';
/** Topsoil (light) to deep soil (dark). */
const SOIL = ['#7a5f3e', '#6b5236', '#5c4630', '#4d3a28', '#40301f', '#33251a', '#2a1d13', '#21160e'];
const STONE = ['#44463f', '#5d5f5b', '#6b6d68', '#797b76', '#93958f'];
const PEBBLE = ['#4a4036', '#645a4c', '#7d7262', '#968a76'];
const MOSS = ['#2f4c1b', '#3d6023', '#4f7a2e', '#68964a'];
const NEEDLE = ['#c9822f', '#9b5d22'];
const ROOT = { dark: '#3a2517', mid: '#6b4a2c', lit: '#8a6339' };
const CREAM = { body: '#f1e6c4', light: '#faf3da', seg: '#d9c79a', under: '#bda677', head: '#d4a65e', eye: '#4a3524' };

// ---- backdrop ---------------------------------------------------------------------------------------------------------

/** Rough clearance map (true = free): stones, pebbles and roots keep away from every tunnel and from the smallest chambers. */
function clearance(): (x: number, y: number, r: number) => boolean {
  const l = nestLayout({ ants: 0, stock: 0, larvae: 0, queens: 8, width: 320, height: 200 });
  const segs: { a: Pt; b: Pt; w: number }[] = [];
  for (const t of l.tunnels) for (let i = 0; i + 1 < t.points.length; i++) segs.push({ a: t.points[i], b: t.points[i + 1], w: t.width });
  return (x, y, r) => {
    for (const c of l.chambers) {
      const nx = (x - c.cx) / (c.rx + r + 3);
      const ny = (y - c.cy) / (c.ry + r + 3);
      if (nx * nx + ny * ny < 1) return false;
    }
    for (const s of segs) {
      const dx = s.b.x - s.a.x;
      const dy = s.b.y - s.a.y;
      const L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - s.a.x) * dx + (y - s.a.y) * dy) / L2));
      if (Math.hypot(x - (s.a.x + dx * t), y - (s.a.y + dy * t)) < s.w / 2 + r + 2) return false;
    }
    return true;
  };
}

export const GROUND_Y = 25;

/** y of the ground line at column x (a gentle swell plus the nest mound around the entrance). */
export function groundY(x: number, seed: number): number {
  let y = GROUND_Y + Math.round(vnoise(x, 0, 14, seed + 5) * 3 - 1.5);
  const d = Math.abs(x - 160);
  if (d < 24) y -= Math.round(9 * (1 - (d / 24) ** 1.7) - 4 * Math.max(0, 1 - d / 8));
  return y;
}

function setRgb(R: Raster, x: number, y: number, col: string): void {
  R.px(x, y, col);
}

export function renderBackdrop(w: number, h: number, seed: number): Raster {
  const R = new Raster(w, h);
  const free = clearance();
  const rng = createRng((seed ^ 0x5eed) >>> 0);
  const gy: number[] = [];
  for (let x = 0; x < w; x++) gy.push(groundY(x, seed));

  // 1. sky of the forest floor (dim, greenish shade) and soil with dithered depth bands
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const g = gy[x];
      if (y < g) {
        const t = y / GROUND_Y;
        const n = hash2(x, y, seed + 11);
        const base = t < 0.35 ? '#10170c' : t < 0.65 ? '#162010' : t < 0.85 ? '#1d2b14' : '#243718';
        setRgb(R, x, y, n > 0.985 ? shade(base, 1.5) : n < 0.03 ? shade(base, 0.85) : base);
        continue;
      }
      const d = y - g;
      const warp = vnoise(x, y, 22, seed + 3) * 9 - 4.5 + vnoise(x, y, 7, seed + 9) * 4 - 2;
      const t = ((d + warp) / (h - GROUND_Y)) * 7.4 + (hash2(x, y, seed + 17) - 0.5) * 0.9;
      let k = Math.max(0, Math.min(SOIL.length - 1, Math.floor(t)));
      const n = hash2(x >> 0, y >> 0, seed + 23);
      if (n > 0.955) k = Math.max(0, k - 1);
      else if (n < 0.04) k = Math.min(SOIL.length - 1, k + 1);
      // dark humus right under the grass
      setRgb(R, x, y, d < 2 ? '#3e2c1d' : d < 4 && n < 0.5 ? '#4a3524' : SOIL[k]);
    }
  }

  // 2. stones (domes with a dark under-edge)
  let placed = 0;
  for (let tries = 0; tries < 800 && placed < 13; tries++) {
    const rx = 3 + Math.floor(rng() * 6);
    const ry = Math.max(2, Math.round(rx * (0.55 + rng() * 0.2)));
    const x = Math.floor(rx + 2 + rng() * (w - 2 * rx - 4));
    const y = Math.floor(GROUND_Y + 12 + ry + rng() * (h - GROUND_Y - 14 - 2 * ry));
    if (!free(x, y, Math.max(rx, ry))) continue;
    placed++;
    R.ell(x + 1, y + 1, rx + 1, ry + 1, '#1c120a', 0.55);
    R.dome(x, y, rx, ry, STONE, { contrast: 1.5, jitter: 0.25, seed: placed });
    if (rng() < 0.4) R.px(x - Math.floor(rx / 3), y - Math.floor(ry / 2), STONE[4]);
  }

  // 3. pebbles
  for (let i = 0, p = 0; i < 400 && p < 70; i++) {
    const x = Math.floor(rng() * w);
    const y = Math.floor(GROUND_Y + 6 + rng() * (h - GROUND_Y - 8));
    if (!free(x, y, 2)) continue;
    p++;
    const c = PEBBLE[Math.floor(rng() * PEBBLE.length)];
    R.px(x, y, c);
    R.px(x + 1, y, c);
    if (rng() < 0.5) R.px(x, y + 1, PEBBLE[0]);
    if (rng() < 0.35) R.px(x, y - 1, PEBBLE[3]);
  }

  // 4. roots hanging from the surface, wiggling down and branching
  const rootAt = [22, 52, 93, 128, 205, 238, 276, 304];
  for (const sx of rootAt) {
    let x = sx + rng() * 6;
    let y = gy[Math.min(w - 1, Math.floor(x))] + 1;
    let dir = (rng() - 0.5) * 0.7;
    const len = 26 + Math.floor(rng() * 34);
    for (let i = 0; i < len; i++) {
      dir += (rng() - 0.5) * 0.45;
      dir = Math.max(-1.1, Math.min(1.1, dir));
      x += Math.sin(dir);
      y += Math.cos(dir) * 0.9 + 0.35;
      if (!free(x, y, 1)) break;
      const thick = i < len * 0.45 ? 2 : 1;
      R.px(x, y, ROOT.mid);
      if (thick === 2) {
        R.px(x + 1, y, ROOT.dark);
        R.px(x - 1, y, ROOT.lit);
      }
      if (i > 8 && i % 11 === 0 && rng() < 0.7) {
        // side root
        let bx = x;
        let by = y;
        const bd = (rng() < 0.5 ? -1 : 1) * (0.9 + rng() * 0.5);
        for (let j = 0; j < 8 + Math.floor(rng() * 9); j++) {
          bx += Math.sin(bd + (rng() - 0.5) * 0.5);
          by += Math.cos(bd) * 0.5 + 0.3;
          if (!free(bx, by, 1)) break;
          R.px(bx, by, j % 3 === 0 ? ROOT.lit : ROOT.mid);
        }
      }
    }
  }

  // 5. worm-like cracks in the subsoil
  for (let i = 0, c = 0; i < 80 && c < 6; i++) {
    let x = rng() * w;
    let y = GROUND_Y + 40 + rng() * (h - GROUND_Y - 60);
    if (!free(x, y, 2)) continue;
    c++;
    let a = rng() * Math.PI * 2;
    for (let j = 0; j < 14 + Math.floor(rng() * 14); j++) {
      a += (rng() - 0.5) * 1.1;
      x += Math.cos(a);
      y += Math.sin(a) * 0.6;
      if (!free(x, y, 1)) break;
      R.px(x, y, '#1c120a', 0.7);
      if (j % 4 === 0) R.px(x + 1, y + 1, '#7d6244', 0.25);
    }
  }

  // 6. surface: grass blades, moss clumps, needles in pairs
  for (let x = 0; x < w; x++) {
    const g = gy[x];
    const hh = Math.floor(hash2(x, 3, seed + 31) * 4.2);
    const top = hash2(x, 5, seed + 37) < 0.3;
    for (let j = 1; j <= hh; j++) setRgb(R, x, g - j, j === hh ? MOSS[3] : j > 1 ? MOSS[2] : MOSS[1]);
    if (top) setRgb(R, x, g - hh - 1, MOSS[3]);
    setRgb(R, x, g, hash2(x, 8, seed) < 0.5 ? MOSS[1] : MOSS[0]);
  }
  for (const [mx, mr] of [[18, 7], [64, 6], [112, 8], [208, 7], [262, 8], [300, 6]] as const) {
    const my = gy[mx];
    R.dome(mx, my - 1, mr, Math.round(mr * 0.45), [...MOSS, '#86b35f'], { contrast: 1.4, jitter: 0.3, seed: mx });
  }
  const needleAt: [number, number, number][] = [[34, 2, 7], [47, -1, 6], [78, 1, 7], [95, -2, 6], [126, 1, 6], [194, 2, 7], [226, -1, 6], [247, 1, 7], [286, -2, 6]];
  needleAt.forEach(([nx, slope, len], i) => {
    const y0 = gy[nx] - 2;
    const col = NEEDLE[i % 2];
    R.line(nx, y0, nx + len, y0 + slope, col);
    R.line(nx + 1, y0 + 2, nx + len + 1, y0 + 2 + slope, NEEDLE[(i + 1) % 2]);
  });

  // 7. the nest mound: soil crumbs on its flanks (the shaft itself is carved by the tunnel layer)
  for (let x = 160 - 24; x <= 160 + 24; x++) {
    const g = gy[x];
    for (let j = 0; j < 3; j++) setRgb(R, x, g + j, j === 0 ? '#7d6244' : j === 1 ? '#6b5238' : '#5f4a33');
    if (hash2(x, 41, seed) < 0.25) setRgb(R, x, g - 1, '#8d7152');
  }
  return R;
}

// ---- painting helpers (fillRect based; the context is in fine pixels) ------------------------------------------------

export function ellipseRows(cx: number, cy: number, rx: number, ry: number, cb: (y: number, x0: number, w: number) => void): void {
  if (!(rx > 0 && ry > 0)) return;
  const y0 = Math.floor(cy - ry);
  const y1 = Math.ceil(cy + ry);
  for (let y = y0; y < y1; y++) {
    const ny = (y + 0.5 - cy) / ry;
    if (ny <= -1 || ny >= 1) continue;
    const half = rx * Math.sqrt(1 - ny * ny);
    const a = Math.round(cx - half);
    const b = Math.round(cx + half);
    if (b > a) cb(y, a, b - a);
  }
}

const RIM_OUT = '#1d130a';
const RIM_LIT = '#7a5f40';
const RIM_MID = '#5f4a33';
const RIM_DARK = '#46341f';

/** Rim of a chamber: dark outline, lit edge on the upper half (light from the upper left), darker edge below. */
export function paintChamberRim(c: Ctx2D, ch: Chamber, rx: number, ry: number): void {
  c.fillStyle = RIM_OUT;
  ellipseRows(ch.cx, ch.cy, rx + 2.3, ry + 2.3, (y, x, w) => c.fillRect(x, y, w, 1));
  ellipseRows(ch.cx, ch.cy, rx + 1.3, ry + 1.3, (y, x, w) => {
    const t = (y + 0.5 - ch.cy) / ry;
    c.fillStyle = t < -0.35 ? RIM_LIT : t < 0.2 ? RIM_MID : RIM_DARK;
    c.fillRect(x, y, w, 1);
  });
}

const ROOMS = ['#3a2616', '#46301b', '#533821', '#614327', '#6d4a2b'];

/** Warm dim inside of a chamber: dark ceiling, a faint glow, a lighter packed floor. */
export function paintChamberInterior(c: Ctx2D, ch: Chamber, rx: number, ry: number): void {
  ellipseRows(ch.cx, ch.cy, rx, ry, (y, x, w) => {
    const t = (y + 0.5 - ch.cy) / ry;
    c.fillStyle = t < -0.6 ? ROOMS[0] : t < -0.25 ? ROOMS[1] : t < 0.05 ? ROOMS[2] : t < 0.35 ? ROOMS[3] : t < 0.62 ? ROOMS[4] : '#7d5833';
    c.fillRect(x, y, w, 1);
  });
  // glow
  for (const [k, a] of [[0.8, 0.07], [0.55, 0.09], [0.32, 0.1]] as const) {
    c.fillStyle = `rgba(224,150,64,${a})`;
    ellipseRows(ch.cx, ch.cy + ry * 0.18, rx * k, ry * k * 0.85, (y, x, w) => c.fillRect(x, y, w, 1));
  }
  // floor line (lit edge of the packed floor) and dark base
  const fy = Math.round(ch.cy + ry * 0.62);
  ellipseRows(ch.cx, ch.cy, rx, ry, (y, x, w) => {
    if (y === fy) {
      c.fillStyle = 'rgba(150,100,50,.55)';
      c.fillRect(x + 2, y, Math.max(0, w - 4), 1);
    } else if (y >= Math.round(ch.cy + ry) - 2) {
      c.fillStyle = 'rgba(12,7,3,.45)';
      c.fillRect(x, y, w, 1);
    }
  });
}

/** Axis-aligned segments become single rects; diagonals are stamped pixel by pixel. */
function strokeSeg(c: Ctx2D, a: Pt, b: Pt, w: number): void {
  const h = w / 2;
  if (a.x === b.x) {
    c.fillRect(Math.round(a.x - h), Math.round(Math.min(a.y, b.y) - h), Math.round(w), Math.round(Math.abs(b.y - a.y) + w));
  } else if (a.y === b.y) {
    c.fillRect(Math.round(Math.min(a.x, b.x) - h), Math.round(a.y - h), Math.round(Math.abs(b.x - a.x) + w), Math.round(w));
  } else {
    const n = Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)));
    for (let i = 0; i <= n; i++) {
      const x = a.x + ((b.x - a.x) * i) / n;
      const y = a.y + ((b.y - a.y) * i) / n;
      c.fillRect(Math.round(x - h), Math.round(y - h), Math.round(w), Math.round(w));
    }
  }
}

/** Points of a tunnel as painted: the shaft starts above the mound top so the entrance is an open hole. */
export function paintedPoints(t: Tunnel, mouthY: number): Pt[] {
  return [{ x: t.points[0].x, y: mouthY }, ...t.points];
}

export function paintTunnelRims(c: Ctx2D, tunnels: readonly Tunnel[], mouthY: number): void {
  for (const t of tunnels) {
    const p = paintedPoints(t, mouthY);
    c.fillStyle = RIM_OUT;
    for (let i = 0; i + 1 < p.length; i++) strokeSeg(c, p[i], p[i + 1], t.width + 4);
  }
  for (const t of tunnels) {
    const p = paintedPoints(t, mouthY);
    c.fillStyle = RIM_MID;
    for (let i = 0; i + 1 < p.length; i++) strokeSeg(c, p[i], p[i + 1], t.width + 2);
  }
}

export function paintTunnelInteriors(c: Ctx2D, tunnels: readonly Tunnel[], mouthY: number): void {
  for (const t of tunnels) {
    const p = paintedPoints(t, mouthY);
    c.fillStyle = '#523823';
    for (let i = 0; i + 1 < p.length; i++) strokeSeg(c, p[i], p[i + 1], t.width);
  }
  // darker ceiling edge and lit floor on the horizontal / sloping parts
  for (const t of tunnels) {
    const p = paintedPoints(t, mouthY);
    for (let i = 0; i + 1 < p.length; i++) {
      const a = p[i];
      const b = p[i + 1];
      if (a.x === b.x) {
        c.fillStyle = 'rgba(20,10,4,.38)';
        c.fillRect(Math.round(a.x - t.width / 2), Math.round(Math.min(a.y, b.y)), 2, Math.round(Math.abs(b.y - a.y)));
        c.fillStyle = 'rgba(200,150,90,.22)';
        c.fillRect(Math.round(a.x + t.width / 2) - 2, Math.round(Math.min(a.y, b.y)), 2, Math.round(Math.abs(b.y - a.y)));
      } else {
        c.fillStyle = 'rgba(200,150,90,.4)';
        const n = Math.ceil(Math.abs(b.x - a.x));
        for (let k = 0; k <= n; k++) {
          const x = a.x + ((b.x - a.x) * k) / n;
          const y = a.y + ((b.y - a.y) * k) / n;
          c.fillRect(Math.round(x), Math.round(y + t.width / 2) - 1, 1, 1);
        }
      }
    }
  }
}

// ---- bitmap font (3 x 5, upper case, Czech accents above the letter) --------------------------------------------------

const GLYPHS: Record<string, string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  N: ['###', '#.#', '#.#', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  Z: ['###', '..#', '.#.', '#..', '###'],
};
/** Accent pixels (x, y relative to the glyph top; negative = above). */
const ACCENT: Record<string, [number, number][]> = {
  Á: [[2, -2], [1, -1]],
  Í: [[2, -2], [1, -1]],
  Ž: [[0, -2], [2, -2], [1, -1]],
};
const BASE: Record<string, string> = { Á: 'A', Í: 'I', Ž: 'Z' };
const ADVANCE = 4;

export function textWidth(s: string): number {
  return Math.max(0, s.length * ADVANCE - 1);
}

/** Draws `s` (upper-cased) with its top-left glyph pixel at (x, y); an optional 1 px drop shadow keeps it readable. */
export function drawText(c: Ctx2D, s: string, x: number, y: number, color: string, shadow?: string): void {
  const up = s.toUpperCase();
  for (const pass of shadow ? [1, 0] : [0]) {
    c.fillStyle = pass ? shadow! : color;
    for (let i = 0; i < up.length; i++) {
      const ch = up[i];
      const g = GLYPHS[BASE[ch] ?? ch];
      if (!g) continue;
      const gx = x + i * ADVANCE + pass;
      const gy = y + pass;
      for (let r = 0; r < 5; r++) for (let q = 0; q < 3; q++) if (g[r][q] === '#') c.fillRect(gx + q, gy + r, 1, 1);
      for (const [ax, ay] of ACCENT[ch] ?? []) c.fillRect(gx + ax, gy + ay, 1, 1);
    }
  }
}

// ---- larvae ---------------------------------------------------------------------------------------------------------

export const LARVA_VARIANTS = 3;
export const LARVA_FRAMES = 2;
export const LARVA_GROW = 4;
export const LARVA_SIZE = 16;

/** Opening direction (rad) of the C per variant; the second frame rocks it a little (the wriggle). */
const MOUTH = [0, 0.75, -0.75];

/** A cream C-shaped grub; `grow` (0..3) makes it fatter and bigger (the larva that hatches next). */
export function larvaRaster(variant: number, frame: number, grow: number): Raster {
  const R = new Raster(LARVA_SIZE, LARVA_SIZE, LARVA_SIZE / 2, LARVA_SIZE / 2);
  const g = Math.max(0, Math.min(LARVA_GROW - 1, Math.round(grow)));
  const mean = 2.35 + g * 0.45;
  const half = 1.45 + g * 0.22;
  const mouth = MOUTH[variant % LARVA_VARIANTS] + (frame % 2 ? 0.28 : -0.12);
  const gap = 0.95;
  const segW = 0.62;
  const cells = new Map<string, { seg: number; head: boolean; lit: boolean }>();
  for (let iy = -8; iy < 8; iy++) {
    for (let ix = -8; ix < 8; ix++) {
      const dx = ix + 0.5;
      const dy = iy + 0.5;
      const r = Math.hypot(dx, dy);
      if (Math.abs(r - mean) > half) continue;
      let d = Math.atan2(dy, dx) - mouth;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) < gap) continue;
      const along = d > 0 ? d - gap : -(d + gap); // distance along the body from the head end
      cells.set(`${ix},${iy}`, { seg: Math.floor(Math.abs(d) / segW), head: d > 0 && along < 0.55, lit: dy < -mean * 0.25 });
    }
  }
  const has = (x: number, y: number): boolean => cells.has(`${x},${y}`);
  for (const [k, v] of cells) {
    const [ix, iy] = k.split(',').map(Number);
    let col = v.lit ? CREAM.light : CREAM.body;
    if (v.seg % 2 === 1) col = v.lit ? CREAM.body : CREAM.seg;
    if (!has(ix, iy + 1) || !has(ix + 1, iy)) col = CREAM.under;
    if (v.head) col = CREAM.head;
    R.px(ix, iy, col);
  }
  return R;
}

/** Stable positions (fine px relative to the chamber centre) of the larvae: a staggered lattice, nearest to the middle first. */
export function larvaSlots(count: number): { dx: number; dy: number; variant: number }[] {
  const all: { dx: number; dy: number; variant: number; d: number }[] = [];
  const sx = 10.5;
  const sy = 7;
  for (let j = -6; j <= 6; j++) {
    for (let i = -7; i <= 7; i++) {
      const dx = i * sx + (Math.abs(j) % 2) * (sx / 2) + (hash2(i, j, 71) - 0.5) * 2.2;
      const dy = j * sy + (hash2(i, j, 72) - 0.5) * 1.6 + 2;
      const lenX = dx / 1.0;
      const lenY = dy / 0.62;
      all.push({ dx: Math.round(dx), dy: Math.round(dy), variant: Math.floor(hash2(i, j, 73) * LARVA_VARIANTS), d: Math.hypot(lenX, lenY) });
    }
  }
  all.sort((a, b) => a.d - b.d || a.dx - b.dx);
  return all.slice(0, Math.max(0, Math.min(count, all.length))).map(({ dx, dy, variant }) => ({ dx, dy, variant }));
}

// ---- pantry crumbs -------------------------------------------------------------------------------------------------

export interface Crumb {
  /** column of the heap (0 = middle) and row above the floor. */
  col: number;
  row: number;
  /** jitter in fine px. */
  jx: number;
  jy: number;
  w: number;
  color: string;
  light: string;
}

const CRUMB_COLORS: [string, string][] = [
  ['#e9e1c6', '#fbf6e4'],
  ['#d8cba0', '#efe6c4'],
  ['#e9e1c6', '#fbf6e4'],
  ['#7a5230', '#9a6e44'],
  ['#5c3b20', '#7a5230'],
  ['#a8472f', '#c9654a'],
  ['#c0583a', '#e07a58'],
];

export const MAX_CRUMBS = 200;
const HEAP_COLS = 14;
const CELL_W = 2.7;
const CELL_H = 2.2;
/** Height of the heap (rows) over column c: a rounded mound. */
const heapRows = (c: number): number => Math.max(1, Math.round(12 * (1 - (c / (HEAP_COLS + 1)) ** 2)));

let heap: Crumb[] | null = null;

/**
 * The heap of food crumbs: crumb `i` is always the same crumb, and the heap fills from the floor and the middle outward
 * (low rows first), so more stock means a wider and taller mound. At most MAX_CRUMBS.
 */
export function pantryCrumbs(count: number): Crumb[] {
  if (!heap) {
    const cells: { c: number; r: number; key: number }[] = [];
    for (let c = -HEAP_COLS; c <= HEAP_COLS; c++) {
      for (let r = 0; r < heapRows(c); r++) cells.push({ c, r, key: r * 0.85 + Math.abs(c) * 0.5 + hash2(c, r, 6) * 1.9 });
    }
    cells.sort((p, q) => p.key - q.key || p.c - q.c);
    heap = cells.slice(0, MAX_CRUMBS).map(({ c, r }, i) => {
      const [color, light] = CRUMB_COLORS[Math.floor(hash2(i, 91, 5) * CRUMB_COLORS.length)];
      return {
        col: c,
        row: r,
        jx: Math.round((hash2(c, r, 7) - 0.5) * 1.8),
        jy: Math.round((hash2(c, r, 8) - 0.5) * 1.2),
        w: hash2(c, r, 9) < 0.4 ? 3 : 2,
        color,
        light,
      };
    });
  }
  const n = Math.max(0, Math.min(MAX_CRUMBS, Math.floor(Number.isFinite(count) ? count : 0)));
  return heap.slice(0, n);
}

/** y of the pantry floor line (the lit edge painted by paintChamberInterior). */
export const floorY = (ch: Chamber, ry: number): number => Math.round(ch.cy + ry * 0.62);

/** Paints the pantry's crumb heap inside chamber `ch` at its displayed radii (crumbs outside the walls are skipped). */
export function paintCrumbs(c: Ctx2D, ch: Chamber, rx: number, ry: number, crumbs: readonly Crumb[]): void {
  const base = floorY(ch, ry);
  for (const k of crumbs) {
    const x = Math.round(ch.cx + k.col * CELL_W + k.jx);
    const y = Math.round(base - 2 - k.row * CELL_H + k.jy);
    const nx = (x - ch.cx) / rx;
    const ny = (y - ch.cy) / ry;
    if (nx * nx + ny * ny > 0.86) continue;
    c.fillStyle = k.color;
    c.fillRect(x, y, k.w, 2);
    c.fillStyle = k.light;
    c.fillRect(x, y, 1, 1);
  }
}
/** Fly remains next to the food (decoration only): a translucent wing pair and a few legs. */
export function paintFlyRemains(c: Ctx2D, ch: Chamber, rx: number, ry: number): void {
  const x = Math.round(ch.cx + rx * 0.05);
  const y = Math.round(ch.cy + ry * 0.55);
  c.fillStyle = 'rgba(205,218,214,.55)';
  c.fillRect(x, y, 5, 1);
  c.fillRect(x + 1, y + 1, 4, 1);
  c.fillStyle = 'rgba(205,218,214,.3)';
  c.fillRect(x + 6, y - 1, 3, 1);
  c.fillStyle = '#1a1410';
  c.fillRect(x - 2, y + 1, 2, 1);
  c.fillRect(x - 3, y + 2, 1, 1);
  c.fillRect(x + 9, y, 1, 2);
}

// ---- eggs ------------------------------------------------------------------------------------------------------------

export function paintEggs(c: Ctx2D, x: number, y: number, extra: boolean): void {
  const egg = (ex: number, ey: number): void => {
    c.fillStyle = '#efe6c9';
    c.fillRect(ex, ey, 2, 2);
    c.fillStyle = '#b9a67c';
    c.fillRect(ex, ey + 2, 2, 1);
    c.fillStyle = '#fffaf0';
    c.fillRect(ex, ey, 1, 1);
  };
  egg(x, y);
  egg(x + 4, y + 1);
  egg(x + 8, y);
  if (extra) egg(x + 2, y - 3);
}

/** Fixed positions (fine px) of the eggs of a pile, in the order they appear. */
const EGG_SLOTS: readonly (readonly [number, number])[] = [[0, 0], [4, 1], [8, 0], [2, -3], [6, -3], [10, -2]];

/** A pile of `count` eggs (0..6) at (x, y); the first slots are always the same ones, so a pile only ever loses its last egg. */
export function paintEggPile(c: Ctx2D, x: number, y: number, count: number): void {
  const n = Math.max(0, Math.min(EGG_SLOTS.length, Math.floor(Number.isFinite(count) ? count : 0)));
  for (let i = 0; i < n; i++) {
    const [dx, dy] = EGG_SLOTS[i];
    const ex = x + dx;
    const ey = y + dy;
    c.fillStyle = '#efe6c9';
    c.fillRect(ex, ey, 2, 2);
    c.fillStyle = '#b9a67c';
    c.fillRect(ex, ey + 2, 2, 1);
    c.fillStyle = '#fffaf0';
    c.fillRect(ex, ey, 1, 1);
  }
}

// ---- vignette -------------------------------------------------------------------------------------------------------

/** RGBA pixels (w x h) of a faint, quantised dark vignette (no grid, a handful of alpha steps). */
export function vignettePixels(w: number, h: number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x + 0.5 - w / 2) / (w / 2);
      const ny = (y + 0.5 - h / 2) / (h / 2);
      const r = Math.hypot(nx * 0.95, ny);
      const t = Math.max(0, Math.min(1, (r - 0.55) / 0.75));
      const a = Math.round(t * t * 7) / 7;
      const i = (y * w + x) * 4;
      d[i] = 8;
      d[i + 1] = 5;
      d[i + 2] = 2;
      d[i + 3] = Math.round(a * 0.5 * 255);
    }
  }
  return d;
}
