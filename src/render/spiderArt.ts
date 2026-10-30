import { FINE } from './fine';
import type { Ctx2D } from './sprites';

/** Web thread colour: light and semi-transparent, the ground and the ants show through. */
const WEB = 'rgba(235,230,215,0.35)';
const BODY = '#1a1410';
const BACK = '#6b2a1d';

const PX = 1 / FINE;
const SPOKES = 12;
/** Rings at these fractions of the radius (the last one is the rim). */
const RINGS = [0.28, 0.5, 0.72, 0.96];
/** How far a ring sags towards the centre midway between two spokes (fraction of its radius). */
const SAG = 0.07;

/**
 * Pixel-art web of radius `r` (art px) around (x, y): thin spokes and sagging concentric arcs, one fine pixel thick, every
 * fine pixel painted once (so crossings do not get more opaque). `time` makes the outer rings sway very slowly. Nothing is
 * painted farther than r from the centre (to a fine pixel).
 */
export function drawWeb(c: Ctx2D, x: number, y: number, r: number, time: number): void {
  const seen = new Set<number>();
  const cx = Math.floor(x * FINE);
  const cy = Math.floor(y * FINE);
  const rf = r * FINE;
  c.fillStyle = WEB;
  const plot = (px: number, py: number): void => {
    const ix = Math.floor(px * FINE);
    const iy = Math.floor(py * FINE);
    // The circle test uses the exact (unfloored) centre so the web is round; the dedupe key only needs a stable cell index,
    // hence the floored centre.
    if (Math.hypot(ix + 0.5 - x * FINE, iy + 0.5 - y * FINE) > rf) return;
    const key = (iy - cy + 4096) * 8192 + (ix - cx + 4096);
    if (seen.has(key)) return;
    seen.add(key);
    c.fillRect(ix * PX, iy * PX, PX, PX);
  };
  const rot = 0.17;
  for (let i = 0; i < SPOKES; i++) {
    const a = rot + (i / SPOKES) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (let d = PX; d <= r; d += PX / 2) plot(x + ca * d, y + sa * d);
  }
  const seg = (Math.PI * 2) / SPOKES;
  for (let k = 0; k < RINGS.length; k++) {
    const sway = k === RINGS.length - 1 ? Math.sin(time * 0.7 + k) * 0.2 : Math.sin(time * 0.5 + k) * 0.1;
    const base = r * RINGS[k];
    const steps = Math.ceil((Math.PI * 2 * base) / (PX / 2));
    for (let s = 0; s < steps; s++) {
      const a = (s / steps) * Math.PI * 2;
      const f = (((a - rot) / seg) % 1 + 1) % 1; // 0 at a spoke, 0.5 midway
      const rad = base * (1 - SAG * Math.sin(Math.PI * f)) + (k === RINGS.length - 1 ? 0 : sway);
      plot(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
  }
}

/** Legs, body and back dots on the fine grid ('#' body, 'r' red dot); the centre is column 7, row 4. */
const SPIDER = [
  '##...........##',
  '..##.......##..',
  '...#..###..#...',
  '####.#####.####',
  '....#######....',
  '####.#r#r#.####',
  '...#.#####.#...',
  '..#...###...#..',
  '.#...........#.',
];

/** Dark pixel-art spider (8 legs, two dark-red dots on the back), 15 x 9 fine pixels, centred on (x, y). Static. */
export function drawSpider(c: Ctx2D, x: number, y: number): void {
  const ox = Math.floor(x * FINE) - 7;
  const oy = Math.floor(y * FINE) - 4;
  for (let row = 0; row < SPIDER.length; row++) {
    const line = SPIDER[row];
    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      if (ch === '.') continue;
      c.fillStyle = ch === 'r' ? BACK : BODY;
      c.fillRect((ox + col) * PX, (oy + row) * PX, PX, PX);
    }
  }
}
