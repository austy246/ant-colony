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

/** The ant the player has selected: the same sprites with a slight green cast. Same layout as ANT_RGBA; the crumb and the shadow are unchanged. */
export const SELECTED_RGBA: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 0, 0],
  [0x24, 0x40, 0x1a, 255],
  [0x4a, 0x7c, 0x34, 255],
  [0x34, 0x5c, 0x26, 255],
  [0x18, 0x30, 0x12, 255],
  [0xe8, 0xe0, 0xc8, 255],
  [10, 6, 3, 97],
];

/** A black ant covered in the red ants' acid: the same sprites with a sickly bright green, clearly different from the player's selection. */
export const ACID_RGBA: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 0, 0],
  [0x4a, 0x7a, 0x12, 255],
  [0xa6, 0xd8, 0x2c, 255],
  [0x78, 0xb0, 0x1c, 255],
  [0x34, 0x58, 0x0c, 255],
  [0xe8, 0xe0, 0xc8, 255],
  [10, 6, 3, 97],
];

/** A red ant covered in the black ants' acid: the red sprites gone a sickly olive. */
export const ACID_RED_RGBA: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 0, 0],
  [0x6a, 0x5a, 0x14, 255],
  [0x9a, 0x92, 0x24, 255],
  [0x7c, 0x6e, 0x1a, 255],
  [0x4a, 0x40, 0x0c, 255],
  [0xe8, 0xe0, 0xc8, 255],
  [10, 6, 3, 97],
];

/** Red raiding ant: the same sprites in reds. Same layout as ANT_RGBA; the crumb and the shadow are unchanged. */
export const RED_RGBA: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 0, 0],
  [0x8a, 0x1c, 0x10, 255],
  [0xb8, 0x32, 0x1c, 255],
  [0x6e, 0x14, 0x0c, 255],
  [0x4a, 0x0c, 0x08, 255],
  [0xe8, 0xe0, 0xc8, 255],
  [10, 6, 3, 97],
];

/**
 * Callow (freshly hatched) ant: the same sprites in a lighter greyish brown, the chitin has not hardened and darkened yet.
 * Same layout as ANT_RGBA; the crumb and the shadow are unchanged. Nothing red-dominant.
 */
export const CALLOW_RGBA: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 0, 0],
  [0x4a, 0x40, 0x38, 255],
  [0x5e, 0x53, 0x48, 255],
  [0x40, 0x36, 0x2e, 255],
  [0x30, 0x28, 0x22, 255],
  [0xe8, 0xe0, 0xc8, 255],
  [10, 6, 3, 97],
];


/** Side of one major (big-headed soldier) sprite in fine pixels, and its centre pixel. Majors are drawn in their own, larger art. */
export const MAJOR_ANT_SIZE = 31;
export const MAJOR_ANT_CENTER = 15;

/** Sector (0..15) for a heading in radians (0 = right, positive = down on screen). */
export function antDirection(heading: number): number {
  if (!Number.isFinite(heading)) return 0;
  const k = Math.round((heading * ANT_DIRS) / (2 * Math.PI));
  return ((k % ANT_DIRS) + ANT_DIRS) % ANT_DIRS;
}

// ---- right-facing models ------------------------------------------------------------------------------------------

type Pt = readonly [number, number];
interface Px {
  dx: number;
  dy: number;
  c: number;
}

/** Everything that differs between a worker and a major: the size of the grid and the shapes drawn on it. */
interface Spec {
  n: number;
  c: number;
  body(): Px[];
  crumb(): Px[];
  legs(frame: number): Pt[][];
  antennae(frame: number): Pt[][];
  /** Thin parts at the front of the head (the major's mandibles). */
  jaws(): Pt[][];
}

/** Solid parts of a worker: bulbous abdomen, slim thorax, small head. */
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

const WORKER: Spec = { n: ANT_SIZE, c: ANT_CENTER, body: bodyModel, crumb: crumbModel, legs: legLines, antennae: antennaLines, jaws: () => [] };

// The major: a big square head with eyes and open mandibles, a heavy thorax and a long striped abdomen on thick legs (about 20 fine px long).

/** Fills the ellipse (cx, cy, rx, ry) with whatever `pick` returns for each pixel (0 = leave empty). */
function ellipse(out: Px[], cx: number, cy: number, rx: number, ry: number, pick: (dx: number, dy: number) => number): void {
  for (let dx = Math.floor(cx - rx); dx <= Math.ceil(cx + rx); dx++) {
    for (let dy = Math.floor(cy - ry); dy <= Math.ceil(cy + ry); dy++) {
      if (((dx - cx) / rx) ** 2 + ((dy - cy) / ry) ** 2 > 1) continue;
      const c = pick(dx, dy);
      if (c !== 0) out.push({ dx, dy, c });
    }
  }
}

function majorBody(): Px[] {
  const out: Px[] = [];
  // abdomen: a segmented egg shape, a sheen along the upper side, a shaded lower side and tip
  ellipse(out, -7.5, 0, 4.2, 3.2, (dx, dy) => {
    if (dx === -8 || dx === -5) return dy <= -2 ? C_HIGH : C_SHADE; // the segment bands
    if (dy === -2 && dx >= -10 && dx <= -6) return C_HIGH;
    if (dy >= 2 || dx <= -11) return C_SHADE;
    return C_BODY;
  });
  // thorax: heavy, with a ridge of light along the back
  ellipse(out, -0.5, 0, 3.2, 2.4, (dx, dy) => {
    if (dy === -1 && dx >= -2 && dx <= 1) return C_HIGH;
    if (dy === 0 && (dx === -1 || dx === 0)) return C_HIGH;
    return dy >= 2 ? C_SHADE : C_BODY;
  });
  // head: big and rounded, a bright eye on each side and a glint on the crown
  ellipse(out, 5, 0, 3.6, 3.4, (dx, dy) => {
    if (dx === 6 && (dy === -2 || dy === 2)) return C_HIGH; // eyes
    if (dy === -1 && dx >= 3 && dx <= 5) return C_HIGH;
    return dx >= 8 || dy >= 3 ? C_SHADE : C_BODY;
  });
  return out;
}

function majorCrumb(): Px[] {
  const out: Px[] = [];
  for (let dx = 11; dx <= 13; dx++) for (let dy = -2; dy <= 2; dy++) out.push({ dx, dy, c: C_CRUMB });
  return out;
}

const MAJOR_ATTACH = [1, -1, -3];
const MAJOR_KNEE = [2, 0, -2];
const MAJOR_FOOT = [5, 0, -5];
const MAJOR_SWING_A = [2, 0, -2, 0];
const MAJOR_SWING_B = [-2, 0, 2, 0];

function majorLegs(frame: number): Pt[][] {
  const out: Pt[][] = [];
  for (let pair = 0; pair < 3; pair++) {
    for (const side of [-1, 1]) {
      const a = MAJOR_ATTACH[pair];
      const swing = IN_TRIPOD_A(pair, side) ? MAJOR_SWING_A[frame] : MAJOR_SWING_B[frame];
      out.push([
        [a, 2 * side],
        [a + MAJOR_KNEE[pair], 5 * side],
        [a + MAJOR_FOOT[pair] + swing, 7 * side],
      ]);
    }
  }
  return out;
}

function majorAntennae(frame: number): Pt[][] {
  const mid: Pt = frame === 3 ? [10, 4] : [10, 5];
  const tip: Pt = frame === 1 ? [12, 6] : [12, 5];
  return [-1, 1].map((s) => [
    [7, 3 * s],
    [mid[0], mid[1] * s],
    [tip[0], tip[1] * s],
  ]);
}

/** Two curved jaws that meet at the front of the head. */
function majorJaws(): Pt[][] {
  return [-1, 1].map((s) => [
    [8, 2 * s],
    [10, 2 * s],
    [11, 0],
  ]);
}

const MAJOR: Spec = { n: MAJOR_ANT_SIZE, c: MAJOR_ANT_CENTER, body: majorBody, crumb: majorCrumb, legs: majorLegs, antennae: majorAntennae, jaws: majorJaws };

// ---- rotation -------------------------------------------------------------------------------------------------------

/** Round half away from zero, so the rotation is symmetric about the centre pixel. */
const rnd = (v: number): number => (v < 0 ? -Math.round(-v) : Math.round(v));

function line(s: Spec, g: Uint8Array, x0: number, y0: number, x1: number, y1: number, c: number): void {
  const N = s.n;
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
function strokes(s: Spec, g: Uint8Array, lines: readonly (readonly Pt[])[], cos: number, sin: number, c: number): void {
  const C = s.c;
  for (const l of lines) {
    for (let i = 0; i + 1 < l.length; i++) {
      const [ax, ay] = l[i];
      const [bx, by] = l[i + 1];
      line(s, g, C + rnd(ax * cos - ay * sin), C + rnd(ax * sin + ay * cos), C + rnd(bx * cos - by * sin), C + rnd(bx * sin + by * cos), c);
    }
  }
}

/** Solid parts: for every destination pixel look up the model pixel under its centre (leaves no holes). */
function solids(s: Spec, g: Uint8Array, model: readonly Px[], cos: number, sin: number): void {
  const N = s.n;
  const C = s.c;
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
function tidy(N: number, g: Uint8Array, hole: number): void {
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

function build(s: Spec, dir: number, frame: number, carrying: boolean): Uint8Array {
  const N = s.n;
  const a = (dir * 2 * Math.PI) / ANT_DIRS;
  // exact values at the quarter turns, so those are pure integer rotations
  const cos = dir % 4 === 0 ? [1, 0, -1, 0][dir / 4] : Math.cos(a);
  const sin = dir % 4 === 0 ? [0, 1, 0, -1][dir / 4] : Math.sin(a);
  // 1. the solid body on its own (so its mass never depends on the gait)
  const body = new Uint8Array(N * N);
  solids(s, body, s.body(), cos, sin);
  tidy(N, body, C_BODY);
  const g = new Uint8Array(N * N);
  // 2. soft drop shadow: the body silhouette two fine pixels lower (everything else is painted over it)
  for (let y = 0; y < N - 2; y++) for (let x = 0; x < N; x++) if (body[y * N + x] !== 0) g[(y + 2) * N + x] = C_SHADOW;
  // 3. legs, then the body over them, then the antennae, the jaws and the crumb
  strokes(s, g, s.legs(frame), cos, sin, C_LEG);
  for (let i = 0; i < g.length; i++) if (body[i] !== 0) g[i] = body[i];
  strokes(s, g, s.antennae(frame), cos, sin, C_LEG);
  strokes(s, g, s.jaws(), cos, sin, C_SHADE);
  for (let i = 0; i < g.length; i++) if (body[i] !== 0) g[i] = body[i];
  if (carrying) solids(s, g, s.crumb(), cos, sin);
  tidy(N, g, C_BODY);
  return g;
}

function mirror(N: number, src: Uint8Array): Uint8Array {
  const out = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) out[y * N + (N - 1 - x)] = src[y * N + x];
  return out;
}

const cache = new Map<number, Uint8Array>();

/**
 * Palette indices (row-major, ANT_SIZE x ANT_SIZE; MAJOR_ANT_SIZE squared for a major) of one variant. Directions facing left
 * are exact mirror images of the right-facing ones (dir k mirrors dir 8 - k). The returned array is shared: do not modify it.
 */
export function antPixels(dir: number, frame: number, carrying: boolean, major = false): Uint8Array {
  const d = ((dir % ANT_DIRS) + ANT_DIRS) % ANT_DIRS;
  const key = (major ? 10000 : 0) + (carrying ? 1 : 0) * 1000 + frame * 100 + d;
  let p = cache.get(key);
  if (!p) {
    const s = major ? MAJOR : WORKER;
    p = d >= 5 && d <= 11 ? mirror(s.n, antPixels(8 - d, frame, carrying, major)) : build(s, d, frame, carrying);
    cache.set(key, p);
  }
  return p;
}
