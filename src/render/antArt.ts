/**
 * Worker-ant art: a right-facing fine-pixel model rotated into 16 directions (22.5 degree steps) and 4 walking frames,
 * all rasterised with nearest-pixel rounding (no canvas rotate(), so the pixels stay crisp).
 *
 * Model coordinates (dx, dy): +x is the way the ant looks, +y is its right-hand side on screen (down when facing right),
 * the origin is the centre pixel of the sprite. Facing right it is 14 x 9 fine pixels (about 7 x 4.5 art pixels).
 */

export const ANT_DIRS = 16;
export const ANT_FRAMES = 4;
/** Side of one sprite in fine pixels (odd, so that the centre is a pixel). */
export const ANT_SIZE = 25;
/** Index of the centre pixel (the ant's world position is the top-left corner of this pixel). */
export const ANT_CENTER = 12;

export const C_BODY = 1;
export const C_HIGH = 2;
export const C_SHADE = 3;
export const C_LEG = 4;
export const C_CRUMB = 5;
export const C_SHADOW = 6;

/** RGBA per colour index (0 = transparent). Everything is black-brown except the carried crumb. */
export const ANT_RGBA: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 0, 0],
  [0x24, 0x1a, 0x12, 255],
  [0x4e, 0x3d, 0x2e, 255],
  [0x3a, 0x2c, 0x20, 255],
  [0x1a, 0x14, 0x10, 255],
  [0xe8, 0xe0, 0xc8, 255],
  [10, 6, 3, 97], // rgba(10,6,3,.38)
];

const N = ANT_SIZE;
const C = ANT_CENTER;

/** Sector (0..15) for a heading in radians (0 = right, positive = down on screen). */
export function antDirection(heading: number): number {
  if (!Number.isFinite(heading)) return 0;
  const k = Math.round((heading * ANT_DIRS) / (2 * Math.PI));
  return ((k % ANT_DIRS) + ANT_DIRS) % ANT_DIRS;
}

// ---- right-facing model -------------------------------------------------------------------------------------------

type Pt = readonly [number, number];
interface Px {
  dx: number;
  dy: number;
  c: number;
}

/** Solid parts: bulbous abdomen, slim thorax, small head. */
function bodyModel(): Px[] {
  const out: Px[] = [];
  const put = (dx: number, dy: number, c = C_BODY): void => void out.push({ dx, dy, c });
  for (let dx = -6; dx <= -3; dx++) {
    const h = dx === -6 || dx === -3 ? 1 : 2;
    for (let dy = -h; dy <= h; dy++) put(dx, dy, dx === -6 && dy === 0 ? C_SHADE : (dx === -5 || dx === -4) && dy === 0 ? C_HIGH : C_BODY);
  }
  for (let dx = -2; dx <= 2; dx++) {
    const h = Math.abs(dx) === 2 ? 0 : 1;
    for (let dy = -h; dy <= h; dy++) put(dx, dy, dx === 0 && dy === 0 ? C_HIGH : C_BODY);
  }
  for (let dx = 3; dx <= 4; dx++) for (let dy = -1; dy <= 1; dy++) put(dx, dy, dx === 4 && dy === 0 ? C_SHADE : C_BODY);
  return out;
}

/** Carried crumb: 2 x 3 fine pixels in front of the head. */
function crumbModel(): Px[] {
  const out: Px[] = [];
  for (let dx = 5; dx <= 6; dx++) for (let dy = -1; dy <= 1; dy++) out.push({ dx, dy, c: C_CRUMB });
  return out;
}

const LEG_ATTACH = [2, 0, -2]; // front, middle, rear pair: x of the first leg pixel
/** Leg lean per pair: x offsets of the knee and the foot relative to the attachment (front leans forward, rear back). */
const LEG_KNEE = [1, 0, -1];
const LEG_FOOT = [3, 0, -3];
/** Tripod A = front-left, middle-right, rear-left; tripod B = the other three. */
const IN_TRIPOD_A = (pair: number, side: number): boolean => (pair === 1 ? side === 1 : side === -1);
const SWING_A = [1, 0, -1, 0];
const SWING_B = [-1, 0, 1, 0];

/** Leg polylines (3 vertices each, joined by straight lines) for a gait frame. */
function legLines(frame: number): Pt[][] {
  const out: Pt[][] = [];
  for (let pair = 0; pair < 3; pair++) {
    for (const side of [-1, 1]) {
      const a = LEG_ATTACH[pair];
      const swing = IN_TRIPOD_A(pair, side) ? SWING_A[frame] : SWING_B[frame];
      out.push([
        [a, 2 * side],
        [a + LEG_KNEE[pair], 3 * side],
        [a + LEG_FOOT[pair] + swing, 4 * side],
      ]);
    }
  }
  return out;
}

/** Antenna polylines: mid (frames 0, 2), wide (1) and narrow (3) - the twitch. */
function antennaLines(frame: number): Pt[][] {
  const mid: Pt = frame === 3 ? [5, 2] : [5, 3];
  const tip: Pt = frame === 1 ? [6, 4] : [6, 3];
  return [-1, 1].map((s) => [
    [4, 2 * s],
    [mid[0], mid[1] * s],
    [tip[0], tip[1] * s],
  ]);
}

// ---- rotation -------------------------------------------------------------------------------------------------------

/** Round half away from zero, so the rotation is symmetric about the centre pixel. */
const rnd = (v: number): number => (v < 0 ? -Math.round(-v) : Math.round(v));

function line(g: Uint8Array, x0: number, y0: number, x1: number, y1: number, c: number): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    if (x0 >= 0 && y0 >= 0 && x0 < N && y0 < N) g[y0 * N + x0] = c;
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** Thin parts: rotate every vertex to the nearest pixel and join consecutive vertices, so legs never break up. */
function strokes(g: Uint8Array, lines: readonly (readonly Pt[])[], cos: number, sin: number, c: number): void {
  for (const l of lines) {
    for (let i = 0; i + 1 < l.length; i++) {
      const [ax, ay] = l[i];
      const [bx, by] = l[i + 1];
      line(
        g,
        C + rnd(ax * cos - ay * sin),
        C + rnd(ax * sin + ay * cos),
        C + rnd(bx * cos - by * sin),
        C + rnd(bx * sin + by * cos),
        c,
      );
    }
  }
}

/** Solid parts: for every destination pixel look up the model pixel under its centre (leaves no holes). */
function solids(g: Uint8Array, model: readonly Px[], cos: number, sin: number): void {
  const m = new Map<number, number>();
  for (const p of model) m.set((p.dy + C) * N + p.dx + C, p.c);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const ox = x - C;
      const oy = y - C;
      const sx = rnd(ox * cos + oy * sin);
      const sy = rnd(-ox * sin + oy * cos);
      const c = m.get((sy + C) * N + sx + C);
      if (c !== undefined && Math.abs(sx) <= C && Math.abs(sy) <= C) g[y * N + x] = c;
    }
  }
}

const solid = (v: number): boolean => v !== 0 && v !== C_SHADOW;
const isBody = (v: number): boolean => v >= C_BODY && v <= C_SHADE;

/** Fills one-pixel holes in the body (pockets with three body neighbours; gaps between legs stay open) and drops stray pixels, so the ant reads as one solid shape at every angle. */
function tidy(g: Uint8Array, hole: number): void {
  for (let pass = 0; pass < 6; pass++) {
    const fill: number[] = [];
    for (let y = 1; y < N - 1; y++) {
      for (let x = 1; x < N - 1; x++) {
        if (solid(g[y * N + x])) continue;
        let n = 0;
        if (isBody(g[y * N + x - 1])) n++;
        if (isBody(g[y * N + x + 1])) n++;
        if (isBody(g[(y - 1) * N + x])) n++;
        if (isBody(g[(y + 1) * N + x])) n++;
        if (n >= 3) fill.push(y * N + x);
      }
    }
    if (fill.length === 0) break;
    for (const i of fill) g[i] = hole;
  }
  for (let y = 1; y < N - 1; y++) {
    for (let x = 1; x < N - 1; x++) {
      if (!solid(g[y * N + x])) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && solid(g[(y + dy) * N + x + dx])) n++;
      if (n === 0) g[y * N + x] = 0;
    }
  }
}

function build(dir: number, frame: number, carrying: boolean): Uint8Array {
  const a = (dir * 2 * Math.PI) / ANT_DIRS;
  // exact values at the quarter turns, so those are pure integer rotations
  const cos = dir % 4 === 0 ? [1, 0, -1, 0][dir / 4] : Math.cos(a);
  const sin = dir % 4 === 0 ? [0, 1, 0, -1][dir / 4] : Math.sin(a);
  // 1. the solid body on its own (so its mass never depends on the gait)
  const body = new Uint8Array(N * N);
  solids(body, bodyModel(), cos, sin);
  tidy(body, C_BODY);
  const g = new Uint8Array(N * N);
  // 2. soft drop shadow: the body silhouette two fine pixels lower (everything else is painted over it)
  for (let y = 0; y < N - 2; y++) for (let x = 0; x < N; x++) if (body[y * N + x] !== 0) g[(y + 2) * N + x] = C_SHADOW;
  // 3. legs, then the body over them, then the antennae and the crumb
  strokes(g, legLines(frame), cos, sin, C_LEG);
  for (let i = 0; i < g.length; i++) if (body[i] !== 0) g[i] = body[i];
  strokes(g, antennaLines(frame), cos, sin, C_LEG);
  for (let i = 0; i < g.length; i++) if (body[i] !== 0) g[i] = body[i];
  if (carrying) solids(g, crumbModel(), cos, sin);
  tidy(g, C_BODY);
  return g;
}

function mirror(src: Uint8Array): Uint8Array {
  const out = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) out[y * N + (N - 1 - x)] = src[y * N + x];
  return out;
}

const cache = new Map<number, Uint8Array>();

/**
 * Palette indices (row-major, ANT_SIZE x ANT_SIZE) of one variant. Directions facing left are exact mirror images of
 * the right-facing ones (dir k mirrors dir 8 - k). The returned array is shared: do not modify it.
 */
export function antPixels(dir: number, frame: number, carrying: boolean): Uint8Array {
  const d = ((dir % ANT_DIRS) + ANT_DIRS) % ANT_DIRS;
  const key = (carrying ? 1 : 0) * 1000 + frame * 100 + d;
  let p = cache.get(key);
  if (!p) {
    p = d >= 5 && d <= 11 ? mirror(antPixels(8 - d, frame, carrying)) : build(d, frame, carrying);
    cache.set(key, p);
  }
  return p;
}
