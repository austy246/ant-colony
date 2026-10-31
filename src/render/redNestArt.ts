import { FINE } from './fine';
import type { Ctx2D } from './sprites';
import type { RedNest } from '../sim/raid';

const PX = 1 / FINE;
/** Half-width / half-height (art px) of the crater and of the mound around it. */
const RX = 15;
const RY = 9;

/** Fills an ellipse one fine row at a time (cheap, pixel-art edges). */
function ellipse(c: Ctx2D, cx: number, cy: number, rx: number, ry: number, color: string): void {
  c.fillStyle = color;
  const rows = Math.round(ry * 2 * FINE);
  for (let i = 0; i < rows; i++) {
    const v = (i + 0.5) / (ry * FINE) - 1;
    const half = rx * Math.sqrt(Math.max(0, 1 - v * v));
    c.fillRect(cx - half, cy - ry + i * PX, half * 2, PX);
  }
}

/**
 * The red ants' nest: a mound of reddish earth with a dark entrance hole. Once the black ants have taken it (owner 'black')
 * it is a nest of the colony: the same mound in dark brown, and the hole is ringed with pale larva-white grains.
 */
export function drawRedNest(c: Ctx2D, nest: RedNest, time: number): void {
  const red = nest.owner === 'red';
  ellipse(c, nest.x + 1, nest.y + 3, RX + 1, RY, 'rgba(10,6,3,.35)');
  ellipse(c, nest.x, nest.y, RX, RY, red ? '#7a2a1c' : '#4e3d2e');
  ellipse(c, nest.x, nest.y - 1.5, RX * 0.8, RY * 0.7, red ? '#9a3a26' : '#6b5238');
  ellipse(c, nest.x, nest.y - 0.5, RX * 0.4, RY * 0.4, '#140d08');
  const dots = red ? '#c4472e' : '#e8e0c8';
  c.fillStyle = dots;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + (red ? 0 : time * 0.1);
    c.fillRect(nest.x + Math.cos(a) * RX * 0.62 - PX, nest.y - 0.5 + Math.sin(a) * RY * 0.55, 2 * PX, 2 * PX);
  }
}
