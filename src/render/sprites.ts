import type { FoodKind } from '../sim/food';

export type Ctx2D = CanvasRenderingContext2D;

export const SHADOW = 'rgba(10,6,3,.38)';
const LEG_IDX = [-1, 0, 1];
const BERRY_PTS = [[0, 0], [3, -1], [-3, -1], [1, 3], [-2, 3], [4, 2], [0, -3]];

/** Single art pixel (or w x h block). */
export function px(c: Ctx2D, x: number, y: number, col: string, w = 1, h = 1): void {
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), w, h);
}

/** Filled pixel ellipse. */
export function ell(c: Ctx2D, cx: number, cy: number, rx: number, ry: number, col: string): void {
  c.fillStyle = col;
  const ex = Math.ceil(rx);
  const ey = Math.ceil(ry);
  for (let dy = -ey; dy <= ey; dy++) {
    for (let dx = -ex; dx <= ex; dx++) {
      if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1.02) {
        c.fillRect(Math.round(cx + dx), Math.round(cy + dy), 1, 1);
      }
    }
  }
}

/** Pixel line with thickness t. */
export function line(c: Ctx2D, x0: number, y0: number, x1: number, y1: number, col: string, t = 1): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  c.fillStyle = col;
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const y = y0 + ((y1 - y0) * i) / n;
    c.fillRect(Math.round(x - t / 2 + 0.5), Math.round(y - t / 2 + 0.5), t, t);
  }
}

function shadow(c: Ctx2D, x: number, y: number, rx: number, ry: number): void {
  ell(c, x + 1, y + 2, rx, ry, SHADOW);
}

/** Black ant, about 11x7 art pixels. `facing` 1 = right, -1 = left. */
export function drawAnt(c: Ctx2D, x: number, y: number, facing: 1 | -1, carrying: boolean): void {
  const s = facing;
  const L = '#1a1410';
  shadow(c, x, y, 5, 1.8);
  for (const i of LEG_IDX) {
    const bx = x + i * 1.6;
    line(c, bx, y, bx + i, y - 3, L);
    line(c, bx, y, bx + i, y + 3, L);
    px(c, bx + i + s, y - 3, L);
    px(c, bx + i + s, y + 3, L);
  }
  ell(c, x - s * 3.6, y, 3, 2.2, '#241a12');
  px(c, x - s * 4.6, y - 1, '#4e3d2e');
  px(c, x - s * 3.6, y - 1, '#3a2c20');
  ell(c, x, y, 1.8, 1.6, '#241a12');
  px(c, x, y - 1, '#4e3d2e');
  ell(c, x + s * 3, y, 2, 1.8, '#241a12');
  px(c, x + s * 3, y - 1, '#4e3d2e');
  px(c, x + s * 4, y, '#3a2c20');
  px(c, x + s * 5, y - 2, L);
  px(c, x + s * 6, y - 3, L);
  px(c, x + s * 5, y + 1, L);
  px(c, x + s * 6, y + 2, L);
  if (carrying) {
    ell(c, x + s * 6, y - 2, 1.6, 1.4, '#e8e0c8');
    px(c, x + s * 6, y - 3, '#fff');
  }
}

const clamp01 = (p: number): number => (Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0);

/** Radii of the hole the queen digs; starts at the nest crater's hole (7 x 3.6) and widens. */
export function queenHoleRadii(digProgress: number): { rx: number; ry: number } {
  const p = clamp01(digProgress);
  return { rx: 7 + 4 * p, ry: 3.6 + 2 * p };
}

const CRUMB_COLORS = ['#8d7152', '#6b5238', '#5a432c', '#7d6244'];
const CRUMB_COUNT = 7;

/** Deterministic dirt crumbs flung out of the hole (offsets from the nest); empty unless 0 < p < 1. */
export function queenCrumbs(digProgress: number): { dx: number; dy: number; color: string }[] {
  if (!Number.isFinite(digProgress) || digProgress <= 0 || digProgress >= 1) return [];
  const out: { dx: number; dy: number; color: string }[] = [];
  for (let i = 0; i < CRUMB_COUNT; i++) {
    // Each crumb loops through its own flight (phase 0..1): out and up, then back down.
    const phase = (digProgress * 5 + i / CRUMB_COUNT) % 1;
    const dir = (i % 2 === 0 ? 1 : -1) * (1 + (i % 3) * 0.6);
    const dx = dir * 4 + dir * phase * 8;
    const dy = -2 - Math.sin(phase * Math.PI) * (5 + (i % 3) * 2) + phase * 4;
    out.push({ dx, dy, color: CRUMB_COLORS[i % CRUMB_COLORS.length] });
  }
  return out;
}

/** Queen: a larger all-black ant (about 1.6x the worker), facing right. Drawn in world coordinates. */
export function drawQueen(c: Ctx2D, x: number, y: number, digProgress: number): void {
  const { rx, ry } = queenHoleRadii(digProgress);
  if (digProgress > 0) {
    ell(c, x, y, rx, ry, '#0e0805');
    ell(c, x + 1, y + 1, rx - 2, ry - 1, '#050302');
  }
  const L = '#1a1410';
  shadow(c, x, y, 9, 3.2);
  for (const i of LEG_IDX) {
    const bx = x + i * 2.6;
    line(c, bx, y, bx + i * 1.4, y - 5, L);
    line(c, bx, y, bx + i * 1.4, y + 5, L);
    px(c, bx + i * 1.4 + 1, y - 5, L);
    px(c, bx + i * 1.4 + 1, y + 5, L);
  }
  ell(c, x - 6, y, 5.6, 3.8, '#241a12');
  ell(c, x - 6, y - 1, 3.6, 2, '#3a2c20');
  px(c, x - 8, y - 2, '#4e3d2e', 2, 1);
  ell(c, x, y, 3, 2.6, '#241a12');
  px(c, x - 1, y - 1, '#4e3d2e', 2, 1);
  ell(c, x + 5, y, 3.4, 3, '#241a12');
  px(c, x + 4, y - 2, '#4e3d2e', 2, 1);
  px(c, x + 7, y, '#3a2c20');
  line(c, x + 8, y - 2, x + 11, y - 5, L);
  line(c, x + 8, y + 2, x + 11, y + 5, L);
  px(c, x + 11, y - 6, L);
  px(c, x + 11, y + 6, L);
  for (const k of queenCrumbs(digProgress)) px(c, x + k.dx, y + k.dy, k.color);
}

function beetle(c: Ctx2D, x: number, y: number): void {
  shadow(c, x, y, 7, 3.5);
  for (const i of LEG_IDX) {
    line(c, x + i * 2.4, y, x + i * 2.4 - 1, y - 4, '#0d1210');
    line(c, x + i * 2.4, y, x + i * 2.4 - 1, y + 4, '#0d1210');
  }
  ell(c, x, y, 6, 4.2, '#14201b');
  ell(c, x - 1, y - 1, 4.6, 2.6, '#2d5446');
  ell(c, x - 2, y - 2, 2.4, 1, '#6aa78f');
  line(c, x - 5, y, x + 4, y, '#0b130f');
  ell(c, x + 6.5, y, 2.2, 1.9, '#0f1814');
  line(c, x + 8, y - 1, x + 10, y - 3, '#0b130f');
  line(c, x + 8, y + 1, x + 10, y + 3, '#0b130f');
}

function caterpillar(c: Ctx2D, x: number, y: number): void {
  const n = 7;
  for (let i = 0; i < n; i++) shadow(c, x + i * 3, y + Math.sin(i * 0.8) * 1.4, 2.5, 1.5);
  for (let i = n - 1; i >= 0; i--) {
    const sx = x + i * 3;
    const sy = y + Math.sin(i * 0.8) * 1.4;
    ell(c, sx, sy, 2.7, 2.5, i % 2 ? '#79a93a' : '#8fc24a');
    px(c, sx - 1, sy - 2, '#c5e58a');
    px(c, sx, sy + 2, '#4f7022');
    if (i % 3 === 1) px(c, sx, sy, '#f0e27a');
  }
  ell(c, x - 2, y - 0.4, 2.4, 2.2, '#7a4a22');
  px(c, x - 3, y - 1, '#14100c');
  px(c, x - 3, y + 1, '#14100c');
}

function fly(c: Ctx2D, x: number, y: number): void {
  shadow(c, x, y, 6, 3);
  ell(c, x - 3, y - 3, 4, 1.6, 'rgba(200,225,240,.7)');
  ell(c, x - 3, y + 3, 4, 1.6, 'rgba(200,225,240,.7)');
  px(c, x - 5, y - 3, 'rgba(255,255,255,.8)', 3, 1);
  ell(c, x, y, 3.4, 2.4, '#34383b');
  px(c, x - 1, y - 1, '#5b6165', 2, 1);
  ell(c, x + 3.5, y, 2, 1.9, '#222629');
  px(c, x + 4, y - 1, '#a02a2a');
  px(c, x + 4, y + 1, '#a02a2a');
  line(c, x - 1, y - 2, x - 3, y - 5, '#16181a');
  line(c, x + 1, y - 2, x + 1, y - 5, '#16181a');
  line(c, x - 1, y + 2, x - 3, y + 5, '#16181a');
  line(c, x + 1, y + 2, x + 1, y + 5, '#16181a');
}

/** Larger dead insect (grasshopper-like husk) lying on its side. */
function carrion(c: Ctx2D, x: number, y: number): void {
  shadow(c, x, y, 9, 3.6);
  for (const i of LEG_IDX) {
    line(c, x + i * 3, y + 1, x + i * 3 - 2, y + 5, '#3b3226');
    line(c, x + i * 3, y - 1, x + i * 3 + 2, y - 5, '#3b3226');
  }
  ell(c, x, y, 8, 3.4, '#5a4a38');
  ell(c, x - 1, y - 1, 6.4, 2, '#7a6650');
  for (let k = -4; k <= 4; k += 2) px(c, x + k, y + 1, '#3b3226');
  px(c, x - 4, y - 2, '#a89476', 3, 1);
  ell(c, x + 8, y, 2.2, 2, '#4a3b2c');
  px(c, x + 9, y - 1, '#14100c');
}

function berry(c: Ctx2D, x: number, y: number): void {
  shadow(c, x, y, 5, 3);
  ell(c, x - 4, y - 4, 2.5, 1.4, '#3d6023');
  for (const p of BERRY_PTS) {
    ell(c, x + p[0], y + p[1], 2.1, 2.1, '#a81830');
    px(c, x + p[0] - 1, y + p[1] - 1, '#f06a7e');
  }
}

function mushroom(c: Ctx2D, x: number, y: number): void {
  shadow(c, x, y, 6, 2.5);
  ell(c, x, y + 2, 2, 2.2, '#eadfc3');
  px(c, x - 1, y + 1, '#fff8e6');
  ell(c, x, y - 1, 6, 3.4, '#8a5a2c');
  ell(c, x - 1, y - 2, 4.8, 2.2, '#b0773a');
  px(c, x - 3, y - 3, '#e0b070', 2, 1);
  px(c, x + 2, y - 2, '#f0e0c0');
  px(c, x - 1, y, '#f0e0c0');
}

export function drawFood(c: Ctx2D, kind: FoodKind, x: number, y: number): void {
  switch (kind) {
    case 'beetle':
      return beetle(c, x, y);
    case 'caterpillar':
      return caterpillar(c, x, y);
    case 'fly':
      return fly(c, x, y);
    case 'carrion':
      return carrion(c, x, y);
    case 'berry':
      return berry(c, x, y);
    case 'mushroom':
      return mushroom(c, x, y);
  }
}
