import type { FoodKind } from '../sim/food';
import { FINE } from './fine';
import { preySprite, queenSprite, type Sprite } from './preyArt';

export type Ctx2D = CanvasRenderingContext2D;

export const SHADOW = 'rgba(10,6,3,.38)';

/** Snaps a world coordinate to the fine grid (half art pixels), so sprites do not wobble while moving sub-pixel. */
const snap = (v: number): number => Math.round(v * FINE) / FINE;

/** Draws a prebuilt fine-grid sprite as colour-grouped integer fillRects around the (snapped) world position. */
function blit(c: Ctx2D, spr: Sprite, x: number, y: number): void {
  c.save();
  c.translate(snap(x), snap(y));
  c.scale(1 / FINE, 1 / FINE);
  for (const g of spr.groups) {
    c.fillStyle = g.style;
    const r = g.rects;
    for (let i = 0; i < r.length; i += 4) c.fillRect(r[i], r[i + 1], r[i + 2], r[i + 3]);
  }
  c.restore();
}

/**
 * Worker ant sprite on a 2x finer pixel grid than the terrain (one ant pixel = half an art pixel), 14x8 ant pixels
 * = about 7x4 art pixels, facing right. Legend: B body, H highlight, D shade, L legs/antennae, . empty.
 * Column 7 is the horizontal centre (so the left-facing mirror is exact); row 4 is the vertical centre.
 */
const ANT_ROWS = [
  '...L..L..L...L',
  '....L.L.L...L.',
  '.BHB.LLL.B.L..',
  'DBBHBBHBBBD...',
  'DBBBBBBBBBD...',
  '.DBD.LLL.B.L..',
  '....L.L.L...L.',
  '...L..L..L...L',
];
const ANT_COLORS: Record<string, string> = { B: '#241a12', H: '#4e3d2e', D: '#3a2c20', L: '#1a1410' };
const ANT_CRUMB = '#e8e0c8';
/** Horizontal runs of equal colour per row: [row, firstCol, lastCol, colour]. */
const ANT_RUNS: [number, number, number, string][] = [];
ANT_ROWS.forEach((row, r) => {
  let c0 = 0;
  while (c0 < row.length) {
    const ch = row[c0];
    let c1 = c0;
    while (c1 + 1 < row.length && row[c1 + 1] === ch) c1++;
    if (ch !== '.') ANT_RUNS.push([r, c0, c1, ANT_COLORS[ch]]);
    c0 = c1 + 1;
  }
});

/** Black ant, about 7x4 art pixels drawn with 2x finer pixels. `facing` 1 = right, -1 = left. */
export function drawAnt(c: Ctx2D, x: number, y: number, facing: 1 | -1, carrying: boolean): void {
  // Snap to the half-art-pixel grid so the sprite does not wobble while the ant moves sub-pixel.
  const sx = Math.round(x * 2) / 2;
  const sy = Math.round(y * 2) / 2;
  const right = facing === 1;
  c.save();
  c.translate(sx, sy);
  c.scale(0.5, 0.5);
  // Everything below is in ant pixels (integer rects); column col spans [col - 7, col - 6) facing right.
  const fx = (c0: number, c1: number): number => (right ? c0 - 7 : 6 - c1);
  c.fillStyle = SHADOW;
  c.fillRect(fx(2, 10), 2, 9, 1);
  for (const [r, c0, c1, col] of ANT_RUNS) {
    c.fillStyle = col;
    c.fillRect(fx(c0, c1), r - 4, c1 - c0 + 1, 1);
  }
  if (carrying) {
    c.fillStyle = ANT_CRUMB;
    c.fillRect(fx(12, 13), -1, 2, 2);
  }
  c.restore();
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

/**
 * Queen: about 3x the worker (44 x 26 fine px), all black with subtle highlights, facing right, on the fine grid.
 * Drawn in world coordinates; the dig hole and flying crumbs are scaled to the fine grid as well.
 */
export function drawQueen(c: Ctx2D, x: number, y: number, digProgress: number): void {
  c.save();
  c.translate(snap(x), snap(y));
  c.scale(1 / FINE, 1 / FINE);
  if (digProgress > 0) {
    const { rx, ry } = queenHoleRadii(digProgress);
    hole(c, rx * FINE, ry * FINE);
  }
  c.restore();
  blit(c, queenSprite(), x, y);
  const crumbs = queenCrumbs(digProgress);
  if (crumbs.length > 0) {
    c.save();
    c.translate(snap(x), snap(y));
    c.scale(1 / FINE, 1 / FINE);
    for (const k of crumbs) {
      c.fillStyle = k.color;
      c.fillRect(Math.round(k.dx * FINE), Math.round(k.dy * FINE), 2, 2);
    }
    c.restore();
  }
}

/** [x scale, y scale, x add, y add, colour] of the dig hole's concentric layers (module constant: no per-frame allocation). */
const HOLE_LAYERS: readonly (readonly [number, number, number, number, string])[] = [
  [1, 1, 2, 1.5, '#3a2a1b'],
  [1, 1, 0, 0, '#1b110a'],
  [0.82, 0.8, 0, 0, '#0e0805'],
  [0.55, 0.52, 0, 0, '#050302'],
];

/** Dark dig hole (fine px units, centred on the origin): scanline ellipses, rim to black. */
function hole(c: Ctx2D, rx: number, ry: number): void {
  for (const [sx, sy, ax, ay, col] of HOLE_LAYERS) {
    const lx = rx * sx + ax;
    const ly = ry * sy + ay;
    c.fillStyle = col;
    for (let dy = -Math.ceil(ly); dy < Math.ceil(ly); dy++) {
      const ny = (dy + 0.5) / ly;
      if (Math.abs(ny) > 1) continue;
      const half = Math.round(lx * Math.sqrt(1 - ny * ny));
      if (half > 0) c.fillRect(-half, dy, half * 2, 1);
    }
  }
}

export function drawFood(c: Ctx2D, kind: FoodKind, x: number, y: number): void {
  blit(c, preySprite(kind), x, y);
}
