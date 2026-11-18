import type { Bee, Hive } from '../sim/hive';

/** Half the base width and the height (art px) of the straw hive. */
const HALF_W = 14;
const HEIGHT = 26;
const BAND = 4;
/** Straw bands from light to dark, lit from the upper left. */
const STRAW: readonly string[] = ['#e8c15a', '#d6a843', '#c0902f', '#a77a26'];

type Ctx = CanvasRenderingContext2D;

/** A straw skep: a dome of straw bands on a wooden slab, with a dark entrance at its foot. (x, y) is the middle of its base. */
export function drawHive(c: Ctx, hive: Hive): void {
  const { x, y } = hive;
  c.fillStyle = 'rgba(10,6,2,.35)';
  c.beginPath();
  c.ellipse(x + 2, y + 2, HALF_W + 3, 4, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#5a3d20'; // the slab it stands on
  c.fillRect(Math.round(x - HALF_W - 2), Math.round(y - 1), HALF_W * 2 + 4, 3);
  c.fillStyle = '#3a2814';
  c.fillRect(Math.round(x - HALF_W - 2), Math.round(y + 1), HALF_W * 2 + 4, 1);
  for (let r = 0; r < HEIGHT; r++) {
    const t = (HEIGHT - r) / HEIGHT; // 1 at the base, 0 at the top
    const half = Math.round(HALF_W * Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t))));
    if (half <= 0) continue;
    const yy = Math.round(y - 1 - r);
    const band = Math.floor(r / BAND) % 2 === 0;
    const left = Math.round(x - half);
    const w = half * 2;
    c.fillStyle = band ? STRAW[2] : STRAW[3];
    c.fillRect(left, yy, w, 1);
    c.fillStyle = band ? STRAW[0] : STRAW[1]; // the lit left side
    c.fillRect(left, yy, Math.max(1, Math.round(w * 0.35)), 1);
    c.fillStyle = '#7a5a1c'; // a dark seam between the bands
    if (r % BAND === 0) c.fillRect(left, yy, w, 1);
  }
  c.fillStyle = '#e8c15a';
  c.fillRect(Math.round(x - 2), Math.round(y - HEIGHT - 2), 4, 2); // the knob on top
  c.fillStyle = '#1a0f06'; // the entrance
  c.fillRect(Math.round(x - 3), Math.round(y - 5), 6, 4);
  c.fillRect(Math.round(x - 2), Math.round(y - 6), 4, 1);
}

/** The guard bees: a yellow and black body with two wings that blur. Asleep they sit still in the mouth of the hive. */
export function drawBees(c: Ctx, bees: readonly Bee[], time: number, asleep: boolean): void {
  for (const b of bees) {
    const x = Math.round(b.x);
    const y = Math.round(b.y);
    if (!asleep && Math.floor(time * 30 + b.id) % 2 === 0) {
      c.fillStyle = 'rgba(235,245,255,.75)';
      c.fillRect(x - 1, y - 2, 1, 1);
      c.fillRect(x + 1, y - 2, 1, 1);
    } else if (!asleep) {
      c.fillStyle = 'rgba(235,245,255,.75)';
      c.fillRect(x - 2, y - 1, 1, 1);
      c.fillRect(x + 2, y - 1, 1, 1);
    }
    c.fillStyle = '#f2c230';
    c.fillRect(x - 1, y, 3, 2);
    c.fillStyle = '#1a1208';
    c.fillRect(x, y, 1, 2);
  }
}
