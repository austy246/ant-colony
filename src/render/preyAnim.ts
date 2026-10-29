/**
 * Pixel art of the living prey and their corpses, on the fine grid (FINE = 2 fine pixels per art pixel).
 *
 * Every creature is a right-facing model (+x is the way it looks, +y its right-hand side on screen, in fine pixels)
 * rendered into one PREY_SIZE x PREY_SIZE RGBA grid per (direction x frame): solid parts are sampled at the destination
 * pixel centres (so rotated shapes never get holes and the light always comes from the upper left of the SCREEN),
 * thin parts (legs, antennae, wing veins) are rotated vertex by vertex to the nearest pixel and joined with lines -
 * the same technique as the worker ant (antArt.ts). No canvas rotate(), everything is crisp and deterministic.
 *
 * Variants (each built lazily, once):
 *   - beetle        16 directions x 4 walk frames (tripod gait, twitching antennae), with its soft ground shadow
 *   - fly           8 directions x 4 poses: 0 folded, 1 fidget, 2/3 airborne wing-beat; WITHOUT shadow (see flyShadowPixels)
 *   - dead beetle   8 directions, on its back, curled legs
 *   - dead fly      8 directions, on its back, curled legs, splayed wings
 *   - caterpillar   16 directions x 4 wave frames x {calm, fleeing}: seven green segments with a travelling body wave, tiny feet
 *   - dead caterpillar  8 directions, curled on its side, dull colours, a few pale-yellow droplets
 */
import { hash2, parseColor, type Rgba } from './raster';

export const PREY_SIZE = 43;
export const PREY_CENTER = 21;
export const BEETLE_DIRS = 16;
export const BEETLE_FRAMES = 4;
export const FLY_DIRS = 8;
export const FLY_POSES = 4;
export const CATERPILLAR_DIRS = 16;
export const CATERPILLAR_FRAMES = 4;
export const CATERPILLAR_CORPSE_DIRS = 8;
/** Art pixels a calm caterpillar crawls per full body-wave cycle (a fleeing one runs the wave at twice the speed). */
export const CATERPILLAR_STRIDE_ART_PX = 3;
/** Apex height of a fly hop in art pixels. */
export const FLY_LIFT_ART_PX = 8;
/** Art pixels a beetle walks per full leg cycle. */
export const BEETLE_STRIDE_ART_PX = 4;

const N = PREY_SIZE;
const C = PREY_CENTER;

// ---- small pure helpers ----------------------------------------------------------------------------------------------

/** Sector (0..n-1) of a heading in radians (0 = right, positive = down on screen); 0 for a missing/non-finite heading. */
export function preyDirection(heading: number | undefined, n: number): number {
  if (heading === undefined || !Number.isFinite(heading)) return 0;
  const k = Math.round((heading * n) / (2 * Math.PI));
  return ((k % n) + n) % n;
}

/** Height (art px) of a hopping fly at hop progress u = t / dur: a parabola, 0 at both ends. */
export function flyLift(u: number): number {
  if (!Number.isFinite(u) || u <= 0 || u >= 1) return 0;
  return FLY_LIFT_ART_PX * 4 * u * (1 - u);
}

/** Pose of a grounded fly: a brief fidget (pose 1) about once a second, shifted per fly so they do not twitch in unison. */
export function flyIdlePose(time: number, id: number): number {
  const ph = (((time + id * 0.37) % 1) + 1) % 1;
  return ph < 0.14 ? 1 : 0;
}

/** Wing-beat frame (2 or 3) of an airborne fly, alternating every 0.06 s. */
export function flyHopPose(hopT: number): number {
  const k = Number.isFinite(hopT) && hopT > 0 ? Math.floor(hopT / 0.06) : 0;
  return 2 + (k & 1);
}

/** Dust puff frame (0..2) for an age in seconds, -1 when it is over (or not yet there). The puff lasts 0.4 s. */
export function puffFrame(age: number): number {
  if (!Number.isFinite(age) || age < 0 || age >= 0.4) return -1;
  return Math.min(2, Math.floor((age / 0.4) * 3));
}

// ---- tiny rotated pixel painter ------------------------------------------------------------------------------------------

type Pt = readonly [number, number];
type Deco = readonly [string, number?];

/** Round half away from zero, so rotation is symmetric about the centre pixel. */
const rnd = (v: number): number => (v < 0 ? -Math.round(-v) : Math.round(v));

const LX = -0.5;
const LY = -0.62;
const LZ = 0.6;
const LN = Math.hypot(LX, LY, LZ);

const SHADOW_RGBA = 'rgba(10,6,3,.38)';

const ramp = (cols: readonly string[]): Rgba[] => cols.map(parseColor);

interface BlobOpts {
  id: number;
  seed?: number;
  jitter?: number;
  bias?: number;
  contrast?: number;
  alpha?: number;
  /** Per-pixel override: (model x, model y rounded to the model pixel, dest offset x, dest offset y). */
  deco?: (mx: number, my: number, ox: number, oy: number) => Deco | undefined;
}

class Pix {
  readonly d = new Uint8ClampedArray(N * N * 4);
  readonly ids = new Uint8Array(N * N);

  /** (mox, moy): model point that lies on the sprite centre. */
  constructor(
    readonly cos: number,
    readonly sin: number,
    readonly mox = 0,
    readonly moy = 0,
  ) {}

  /** Destination offset (from the centre pixel) of a model point. */
  ox(mx: number, my: number): number {
    return (mx - this.mox) * this.cos - (my - this.moy) * this.sin;
  }
  oy(mx: number, my: number): number {
    return (mx - this.mox) * this.sin + (my - this.moy) * this.cos;
  }
  /** Model coordinates under a destination offset. */
  mx(ox: number, oy: number): number {
    return ox * this.cos + oy * this.sin + this.mox;
  }
  my(ox: number, oy: number): number {
    return -ox * this.sin + oy * this.cos + this.moy;
  }

  /** Blends one pixel (destination offsets from the centre); `only` restricts it to pixels already owned by that part id. */
  put(dx: number, dy: number, colour: string | Rgba, alpha = 1, id = 0, only = -1): void {
    const x = C + dx;
    const y = C + dy;
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    const i = y * N + x;
    if (only >= 0 && this.ids[i] !== only) return;
    const [r, g, b, a0] = typeof colour === 'string' ? parseColor(colour) : colour;
    const a = a0 * alpha;
    if (a <= 0) return;
    const d = this.d;
    const o = i * 4;
    if (a >= 0.999) {
      d[o] = r;
      d[o + 1] = g;
      d[o + 2] = b;
      d[o + 3] = 255;
    } else {
      const da = d[o + 3] / 255;
      const oa = a + da * (1 - a);
      d[o] = (r * a + d[o] * da * (1 - a)) / oa;
      d[o + 1] = (g * a + d[o + 1] * da * (1 - a)) / oa;
      d[o + 2] = (b * a + d[o + 2] * da * (1 - a)) / oa;
      d[o + 3] = oa * 255;
    }
    this.ids[i] = id;
  }

  /** One model pixel, rotated to the nearest destination pixel. */
  dot(mx: number, my: number, colour: string, id: number, alpha = 1, only = -1): void {
    this.put(rnd(this.ox(mx, my)), rnd(this.oy(mx, my)), colour, alpha, id, only);
  }

  /** Polyline through model vertices: every vertex rotated to the nearest pixel, consecutive ones joined by a line. */
  stroke(pts: readonly Pt[], colour: string, id: number, alpha = 1, only = -1): void {
    for (let i = 0; i + 1 < pts.length; i++) {
      let x0 = rnd(this.ox(pts[i][0], pts[i][1]));
      let y0 = rnd(this.oy(pts[i][0], pts[i][1]));
      let x1 = rnd(this.ox(pts[i + 1][0], pts[i + 1][1]));
      let y1 = rnd(this.oy(pts[i + 1][0], pts[i + 1][1]));
      // always walk from the upper end, so a left/right mirrored line is the exact mirror (no Bresenham tie differences)
      if (y0 > y1 || (y0 === y1 && x0 > x1)) {
        [x0, x1] = [x1, x0];
        [y0, y1] = [y1, y0];
      }
      const dx = Math.abs(x1 - x0);
      const dy = Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      let err = dx - dy;
      for (;;) {
        this.put(x0, y0, colour, alpha, id, only);
        if (x0 === x1 && y0 === y1) break;
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
  }

  /** Ellipse (model coordinates) shaded like a lit dome, light from the upper left of the screen; `cols` runs dark -> light. */
  blob(cx: number, cy: number, rx: number, ry: number, cols: readonly Rgba[], o: BlobOpts): void {
    const n = cols.length;
    for (let y = -C; y <= C; y++) {
      for (let x = -C; x <= C; x++) {
        const mx = this.mx(x, y);
        const my = this.my(x, y);
        const nx = (mx - cx) / rx;
        const ny = (my - cy) / ry;
        if (nx * nx + ny * ny > 1) continue;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const snx = nx * this.cos - ny * this.sin;
        const sny = nx * this.sin + ny * this.cos;
        const l = (snx * LX + sny * LY + nz * LZ) / LN;
        let t = l * 0.5 * (o.contrast ?? 1) + 0.5 + (o.bias ?? 0);
        if (o.jitter) t += (hash2(Math.round(mx), Math.round(my), o.seed ?? 0) - 0.5) * o.jitter;
        this.put(x, y, cols[Math.max(0, Math.min(n - 1, Math.floor(t * n)))], o.alpha ?? 1, o.id);
        const deco = o.deco?.(Math.round(mx - this.mox), Math.round(my - this.moy), x, y);
        if (deco) this.put(x, y, deco[0], deco[1] ?? 1, o.id); // over the dome colour, so a translucent mark never opens a hole
      }
    }
  }

  /** Pointed oval ("lens", e.g. a wing) of half length L, half width Wd, axis rotated by `ang` in the model; fn gets (u, v, edge distance). */
  lens(cx: number, cy: number, L: number, Wd: number, ang: number, fn: (u: number, v: number, e: number) => Deco | undefined, id: number): void {
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    for (let y = -C; y <= C; y++) {
      for (let x = -C; x <= C; x++) {
        const dx = this.mx(x, y) - cx;
        const dy = this.my(x, y) - cy;
        const u = dx * ca + dy * sa;
        const v = -dx * sa + dy * ca;
        if (Math.abs(u) > L) continue;
        const hw = Wd * (1 - Math.pow(Math.abs(u) / L, 1.7));
        if (Math.abs(v) > hw) continue;
        const col = fn(u, v, hw - Math.abs(v));
        if (col) this.put(x, y, col[0], col[1] ?? 1, id);
      }
    }
  }

  /** Soft ground shadow: the silhouette of the parts in `mask` (bit per part id) moved by (dx, dy), only where nothing else is. */
  shadow(dx: number, dy: number, mask: number): void {
    const add: number[] = [];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        if (this.d[i * 4 + 3] === 0 || ((1 << this.ids[i]) & mask) === 0) continue;
        const tx = x + dx;
        const ty = y + dy;
        if (tx < 0 || ty < 0 || tx >= N || ty >= N) continue;
        add.push(ty * N + tx);
      }
    }
    const [r, g, b, a] = parseColor(SHADOW_RGBA);
    for (const j of add) {
      if (this.d[j * 4 + 3] !== 0) continue;
      this.d[j * 4] = r;
      this.d[j * 4 + 1] = g;
      this.d[j * 4 + 2] = b;
      this.d[j * 4 + 3] = Math.round(a * 255);
    }
  }
}

function rotation(dir: number, dirs: number): [number, number] {
  const a = (dir * 2 * Math.PI) / dirs;
  const q = (dirs / 4) | 0;
  // exact values at the quarter turns, so those are pure integer rotations
  if (dir % q === 0) return [[1, 0, -1, 0][dir / q], [0, 1, 0, -1][dir / q]];
  return [Math.cos(a), Math.sin(a)];
}

const wrapDir = (d: number, n: number): number => ((d % n) + n) % n;

// part ids
const ID_SHELL = 1;
const ID_PRON = 2;
const ID_HEAD = 3;
const ID_THIN = 4;
const ID_WING = 5;
const ID_EYE = 6;
const ID_BODY = 7;
const ID_THORAX = 8;

// ---- beetle -----------------------------------------------------------------------------------------------------------

const BEETLE_RAMP = ramp(['#0b1512', '#14201b', '#1f3a2f', '#2d5446', '#3f7461']);
const PRON_RAMP = ramp(['#08100d', '#101b16', '#1a2f26', '#26443a']);
const HEAD_RAMP = ramp(['#0b1410', '#15241d', '#203a2f', '#2f5547']);

/** Tripod A = front-left, middle-right, rear-left; B = the other three (as for the ant). */
const inTripodA = (pair: number, side: number): boolean => (pair === 1 ? side === 1 : side === -1);
const SWING_A = [2, 0, -2, 0];
const SWING_B = [-2, 0, 2, 0];
const BEETLE_LEGS: readonly (readonly [number, number])[] = [
  [5, 1],
  [0, 0],
  [-6, -1],
];
const ANTENNA_TIP = [6, 7, 6, 5];

function buildBeetle(dir: number, frame: number): Uint8ClampedArray {
  const [cos, sin] = rotation(dir, BEETLE_DIRS);
  const p = new Pix(cos, sin, 4, 0);
  const LEG = '#0b130f';
  // 1. six jointed legs, the swing of the tripods shifts the feet
  // Gait and twitch are keyed by the SCREEN side (gs), so a left-facing beetle is the mirror image of a right-facing one.
  const flip = cos < -1e-9 ? -1 : 1;
  BEETLE_LEGS.forEach(([xi, k], pair) => {
    for (const s of [-1, 1]) {
      const sw = (inTripodA(pair, s * flip) ? SWING_A : SWING_B)[frame];
      const kx = xi + k * 2 + 1 + Math.trunc(sw / 2);
      p.stroke(
        [
          [xi, s * 3],
          [kx, s * 9],
          [kx + k * 2 + sw, s * 11],
        ],
        LEG,
        ID_THIN,
      );
      p.dot(kx, s * 9, '#26382f', ID_THIN);
    }
  });
  // 2. elytra: dome with a seam and dashed striae; the screen-space sheen sits on the upper left of the shell
  const shx = p.ox(-3, 0) - 3.5;
  const shy = p.oy(-3, 0) - 4;
  p.blob(-3, 0, 10.5, 7.2, BEETLE_RAMP, {
    id: ID_SHELL,
    seed: 11,
    jitter: 0.1,
    bias: 0.02,
    deco: (mx, my, ox, oy) => {
      const e = ((ox - shx) / 3.2) ** 2 + ((oy - shy) / 1.3) ** 2;
      if (e <= 1) return Math.abs(oy - shy) < 0.6 && ox - shx < -1.4 ? ['#e6f6ee'] : ['#8fc9b2', 0.75];
      if (Math.abs(ox - (shx + 2.2)) < 0.8 && Math.abs(oy - (shy + 1.8)) < 0.8) return ['#6aa78f'];
      if (my === 0) return ['#0a1511'];
      if (Math.abs(my) === 4 && (mx + 40) % 3 !== 0) return ['#0d1a15', 0.85];
      return undefined;
    },
  });
  // 3. pronotum, head, eyes, mandibles
  p.blob(7, 0, 4.4, 5.4, PRON_RAMP, { id: ID_PRON, seed: 5, jitter: 0.08 });
  p.blob(12.5, 0, 3.4, 3.4, HEAD_RAMP, { id: ID_HEAD, seed: 3 });
  for (const s of [-1, 1]) {
    p.dot(13, s * 2, '#d6e2dc', ID_HEAD);
    p.dot(14, s * 2, '#030504', ID_HEAD);
    p.stroke(
      [
        [15, s],
        [17, s * 2],
      ],
      LEG,
      ID_THIN,
    );
  }
  // 4. antennae with club ends; the two twitch out of step
  for (const s of [-1, 1]) {
    const tipY = ANTENNA_TIP[(frame + (s * flip > 0 ? 0 : 2)) % 4];
    p.stroke(
      [
        [14, s * 3],
        [17, s * tipY],
        [20, s * tipY],
      ],
      LEG,
      ID_THIN,
    );
    p.dot(20, s * (tipY + 1), '#1a2a23', ID_THIN);
    p.dot(21, s * tipY, '#1a2a23', ID_THIN);
  }
  p.shadow(2, 3, (1 << ID_SHELL) | (1 << ID_PRON) | (1 << ID_HEAD));
  return p.d;
}

// ---- fly --------------------------------------------------------------------------------------------------------------------

const FLY_RAMP = ramp(['#0f1214', '#1c1f22', '#2b3033', '#3e4549', '#5b6165']);
const FLY_HEAD = ramp(['#0f1214', '#1c1f22', '#2b3033', '#3e4549']);
const EYE_RAMP = ramp(['#4a0c0c', '#7a1414', '#a02a2a', '#c04545']);
const FLY_LEGS: readonly (readonly [number, number])[] = [
  [4, 1],
  [0, 0],
  [-4, -1],
];

function wingColour(u: number, v: number, e: number, fill: string, edge: string, vein: string): Deco | undefined {
  if (e < 0.95) return [edge];
  if (Math.abs(v) < 0.5) return [vein];
  if (Math.abs(Math.abs(v) - 1.7) < 0.5 && u > -4 && u < 3) return [vein, 0.75];
  if (u > 1 && u < 4 && v < -0.4) return ['rgba(250,253,255,.5)'];
  return [fill];
}

function buildFly(dir: number, pose: number): Uint8ClampedArray {
  const [cos, sin] = rotation(dir, FLY_DIRS);
  const p = new Pix(cos, sin, 0, 0);
  const air = pose >= 2;
  const LEG = '#16181a';
  // 1. airborne: spread, translucent wings behind the body (two wing-beat frames)
  if (air) {
    for (const s of [-1, 1]) {
      const up = pose === 3;
      const ang = up ? Math.atan2(s * 0.95, -0.45) : Math.atan2(s * 0.64, -0.76);
      p.lens(up ? -6 : -8, s * (up ? 9 : 8), up ? 7.4 : 8.2, up ? 3 : 3.5, ang, (u, v, e) => wingColour(u, v * s, e, 'rgba(214,232,246,.42)', 'rgba(140,160,176,.8)', 'rgba(120,142,158,.8)'), ID_WING);
    }
  }
  // 2. legs: standing, rubbing the front pair (fidget) or trailing behind (airborne)
  FLY_LEGS.forEach(([xi, k], pair) => {
    for (const s of [-1, 1]) {
      let knee: Pt;
      let foot: Pt;
      if (air) {
        knee = [xi - 1, s * 6];
        foot = [xi - 4, s * 7];
      } else if (pose === 1 && pair === 0) {
        knee = [8, s * 6];
        foot = [11, s * 3];
      } else {
        knee = [xi + k * 3, s * 7];
        foot = [knee[0] + k * 3 + 1, s * 9];
      }
      p.stroke([[xi, s * 3], knee, foot], LEG, ID_THIN);
      p.dot(knee[0] + 1, knee[1], '#3e4549', ID_THIN);
    }
  });
  // 3. abdomen with dark bands, thorax with two stripes, head with big red eyes
  p.blob(-6, 0, 6.6, 4.8, FLY_RAMP, {
    id: ID_BODY,
    seed: 31,
    jitter: 0.1,
    bias: -0.04,
    deco: (mx) => (mx === -9 || mx === -5 || mx === -2 ? ['#0a0c0d', 0.75] : undefined),
  });
  const thx = p.ox(1.5, 0) - 2;
  const thy = p.oy(1.5, 0) - 3;
  p.blob(1.5, 0, 4.8, 4.4, FLY_RAMP, {
    id: ID_THORAX,
    seed: 32,
    jitter: 0.1,
    bias: 0.04,
    deco: (mx, my, ox, oy) => {
      if (Math.abs(oy - thy) < 0.6 && ox - thx > -1 && ox - thx < 2) return ['#8d949a'];
      if (Math.abs(my) === 1 && mx >= -1 && mx <= 4) return ['#16191b', 0.8];
      return undefined;
    },
  });
  p.blob(7, 0, 3.2, 3.6, FLY_HEAD, { id: ID_HEAD, seed: 33 });
  for (const s of [-1, 1]) {
    p.blob(7.5, s * 2.6, 2.3, 2.0, EYE_RAMP, { id: ID_EYE, seed: 34, jitter: 0.1 });
    p.put(rnd(p.ox(7.5, s * 2.6) - 1), rnd(p.oy(7.5, s * 2.6) - 1), '#f2a0a0', 1, ID_EYE, ID_EYE);
  }
  p.dot(10, 0, LEG, ID_THIN);
  p.dot(11, 0, LEG, ID_THIN);
  if (pose === 1) p.dot(12, 0, LEG, ID_THIN);
  // 4. grounded: translucent wings folded over the back (the fidget lifts their tips a little)
  if (!air) {
    for (const s of [-1, 1]) {
      const ang = pose === 1 ? -s * 0.14 : 0;
      p.lens(-4.5, s * 2, 9.5, 2.6, ang, (u, v, e) => wingColour(u, v, e, 'rgba(214,232,246,.36)', 'rgba(140,160,176,.7)', 'rgba(120,142,158,.7)'), ID_WING);
    }
  }
  return p.d;
}

/** The fly's ground shadow on its own (the airborne fly keeps it on the ground while the body is lifted). */
function buildFlyShadow(): Uint8ClampedArray {
  const p = new Pix(1, 0, 0, 0);
  p.blob(3, 4, 10, 5.5, [parseColor(SHADOW_RGBA)], { id: ID_BODY });
  return p.d;
}

// ---- corpses ------------------------------------------------------------------------------------------------------------

const DEAD_RIM = ramp(['#0c1210', '#121a16', '#1a2b24', '#244035']);
const DEAD_BEETLE_BELLY = ramp(['#1d221c', '#2b3229', '#3c4538', '#4f5a49', '#66725c']);
const DEAD_BEETLE_HEAD = ramp(['#101410', '#1b211a', '#2b3328', '#3c4638']);

function buildDeadBeetle(dir: number): Uint8ClampedArray {
  const [cos, sin] = rotation(dir, FLY_DIRS);
  const p = new Pix(cos, sin, 3, 0);
  // the dull edge of the elytra under the belly, belly plates on top
  p.blob(-2, 0, 11.8, 8, DEAD_RIM, { id: ID_SHELL, seed: 21, jitter: 0.08 });
  p.blob(-2, 0, 10.6, 6.7, DEAD_BEETLE_BELLY, {
    id: ID_BODY,
    seed: 22,
    jitter: 0.08,
    bias: -0.06,
    deco: (mx, my) => {
      const bx = mx + 3; // model x relative to the body origin shifted back
      for (const plate of [-9, -5, -1, 3, 7]) {
        if (bx === plate) return ['#161a14', 0.9];
        if (bx === plate + 1 && Math.abs(my) < 6) return ['#7a8670', 0.45];
      }
      if (my === 0 && bx > -13 && bx < 9) return ['#161a14', 0.6];
      return undefined;
    },
  });
  p.blob(13.5, 0, 3.6, 3.6, DEAD_BEETLE_HEAD, { id: ID_HEAD, seed: 23 });
  p.dot(14, -2, '#0c0f0b', ID_HEAD);
  p.dot(14, 2, '#0c0f0b', ID_HEAD);
  const LEG = '#3a4537';
  // six legs curled up over the belly: femur out, tibia curling back in, lit joints
  for (const [xi, k] of [
    [5, 1],
    [-1, 0],
    [-7, -1],
  ] as const) {
    for (const s of [-1, 1]) {
      const kx = xi + k * 3 + (k === 0 ? 1 : 0);
      const leg: Pt[] = [
        [xi, s * 5],
        [kx, s * 9],
        [kx + k * 2 - 1, s * 10],
        [kx + k - 2, s * 7],
      ];
      p.stroke(leg, LEG, ID_THIN);
      p.stroke([[xi + 1, s * 5], [kx + 1, s * 9]], LEG, ID_THIN); // thick femur
      p.dot(kx, s * 9, '#7f8c76', ID_THIN);
      p.dot(kx + k - 2, s * 7, '#161a14', ID_THIN);
    }
  }
  for (const [mx, my] of [[-4, 3], [3, -3], [-9, 2], [1, 2]]) p.dot(mx, my, '#b4bca4', ID_BODY, 0.8, ID_BODY); // dry mould specks
  // limp mandibles and antennae
  for (const s of [-1, 1]) {
    p.stroke(
      [
        [16, s * 2],
        [19, s * 3],
      ],
      '#101410',
      ID_THIN,
    );
    p.stroke(
      [
        [15, s * 4],
        [18, s * 7],
        [21, s * 6],
      ],
      '#3c4638',
      ID_THIN,
    );
  }
  p.shadow(2, 3, (1 << ID_SHELL) | (1 << ID_BODY) | (1 << ID_HEAD));
  return p.d;
}

const DEAD_FLY_BELLY = ramp(['#34322e', '#4b4841', '#69645a', '#868071', '#a39b88']);
const DEAD_FLY_HEAD = ramp(['#1e1e1c', '#2e2d2a', '#403e39', '#58554d']);
const DEAD_EYE = ramp(['#241212', '#341a1a', '#4a2626', '#5e3434']);

function buildDeadFly(dir: number): Uint8ClampedArray {
  const [cos, sin] = rotation(dir, FLY_DIRS);
  const p = new Pix(cos, sin, 0, 0);
  // wings splayed flat to the sides, dry and faint (one a little more bent than the other)
  for (const s of [-1, 1]) {
    const ang = Math.atan2(s * 0.55, -0.83) + (s > 0 ? 0.18 : 0);
    p.lens(-4, s * 8, 8, 3.2, ang, (u, v, e) => wingColour(u, v * s, e, 'rgba(200,214,226,.28)', 'rgba(120,134,148,.65)', 'rgba(110,124,138,.6)'), ID_WING);
  }
  p.blob(-6, 0, 6.6, 4.8, DEAD_FLY_BELLY, {
    id: ID_BODY,
    seed: 41,
    jitter: 0.08,
    bias: -0.05,
    deco: (mx) => (mx === -10 || mx === -7 || mx === -4 ? ['#2a2824', 0.8] : undefined),
  });
  p.blob(1.5, 0, 4.8, 4.4, DEAD_FLY_BELLY, { id: ID_THORAX, seed: 42, jitter: 0.08, bias: -0.12 });
  p.blob(7, 0, 3.2, 3.6, DEAD_FLY_HEAD, { id: ID_HEAD, seed: 43 });
  for (const s of [-1, 1]) p.blob(7.5, s * 2.6, 2.3, 2.0, DEAD_EYE, { id: ID_EYE, seed: 44, jitter: 0.08 });
  p.dot(10, 0, '#2a2824', ID_THIN);
  p.dot(11, 0, '#2a2824', ID_THIN);
  // six legs drawn up over the belly, curled in
  const LEG = '#242220';
  for (const [xi, k] of [
    [4, 1],
    [0, 0],
    [-4, -1],
  ] as const) {
    for (const s of [-1, 1]) {
      p.stroke(
        [
          [xi, s * 3],
          [xi + k * 3, s * 7],
          [xi + k * 3 + k * 2, s * 6],
          [xi + k * 2, s * 4],
        ],
        LEG,
        ID_THIN,
      );
      p.dot(xi + k * 3, s * 7, '#6b6558', ID_THIN);
    }
  }
  p.shadow(2, 3, (1 << ID_BODY) | (1 << ID_THORAX) | (1 << ID_HEAD));
  return p.d;
}


// ---- caterpillar ------------------------------------------------------------------------------------------------------

const CAT_RAMP = ramp(['#3a5a1a', '#4f7022', '#79a93a', '#8fc24a', '#c5e58a']);
const CAT_HEAD_RAMP = ramp(['#3a1f0c', '#5a3416', '#7a4a22', '#9a6130', '#b57a44']);
const CAT_SEGMENTS = 7;

/**
 * Living caterpillar: seven segments with a body wave running from the head to the tail (4 frames, one quarter of a cycle
 * each). Every segment is shifted sideways by the wave and a little along the body (the hump travels), the tiny feet
 * alternate. The fleeing set is stretched out (wider spacing, bigger swing).
 */
function buildCaterpillar(dir: number, frame: number, flee: boolean): Uint8ClampedArray {
  const [cos, sin] = rotation(dir, CATERPILLAR_DIRS);
  const p = new Pix(cos, sin, 0, 0);
  const spacing = flee ? 4.3 : 3.9;
  const amp = flee ? 1.9 : 1.4;
  const ph = (frame * Math.PI) / 2;
  const at = (i: number): { x: number; y: number } => ({
    x: (i - 3) * spacing - 2.2 + 0.6 * Math.cos(i * 0.95 - ph),
    y: amp * Math.sin(i * 0.95 - ph),
  });
  const FOOT = '#2c4212';
  for (let i = 0; i < CAT_SEGMENTS; i++) {
    const { x, y } = at(i);
    const ry = 3.1 + 0.5 * Math.sin((Math.PI * i) / (CAT_SEGMENTS - 1));
    // tiny feet on both flanks, the two sets swap with the wave
    const fx = (i + frame) % 2 === 0 ? -1 : 1;
    for (const s of [-1, 1]) {
      p.dot(x + fx, y + s * (ry + 0.8), FOOT, ID_THIN);
      p.dot(x + fx + 2, y + s * (ry + 0.8), FOOT, ID_THIN);
    }
    const cx = Math.round(x);
    p.blob(x, y, 3.3, ry, CAT_RAMP, {
      id: ID_BODY,
      seed: 20 + i,
      jitter: 0.06,
      bias: i % 2 ? -0.2 : -0.1,
      // the segment crease on the tail-side edge
      deco: (mx, my) => (mx - cx <= -3 && Math.abs(my - Math.round(y)) < 4 ? ['#2f4a14', 0.9] : undefined),
    });
    p.dot(x - 0.5, y - 0.5, '#d9f0a0', ID_BODY, 0.9, ID_BODY);
    p.dot(x + 0.5, y - 0.5, '#b4d870', ID_BODY, 0.9, ID_BODY);
    if (i % 3 === 1) {
      p.dot(x, y + 1, '#f0e27a', ID_BODY, 1, ID_BODY);
      p.dot(x + 1, y + 1, '#f0e27a', ID_BODY, 1, ID_BODY);
    }
    p.dot(x + 1.5, y + ry * 0.55, FOOT, ID_BODY, 1, ID_BODY);
  }
  // head: brown dome, black eyes with a white speck, mandibles and two short feelers
  const hx = at(CAT_SEGMENTS - 1).x + spacing + 0.6;
  const hy = at(CAT_SEGMENTS).y * 0.8;
  p.blob(hx, hy, 3.2, 3.2, CAT_HEAD_RAMP, { id: ID_HEAD, seed: 7, jitter: 0.06 });
  for (const s of [-1, 1]) {
    p.dot(hx + 1.6, hy + s * 1.7, '#14100c', ID_HEAD);
    p.dot(hx + 1.1, hy + s * 1.9, '#f2ede0', ID_HEAD, 0.9, ID_HEAD);
    p.dot(hx + 3, hy + s * 0.7, '#2a1a0c', ID_THIN);
    p.stroke(
      [
        [hx + 1.5, hy + s * 3],
        [hx + 3, hy + s * 4.5],
      ],
      '#2a1a0c',
      ID_THIN,
    );
  }
  p.shadow(2, 3, (1 << ID_BODY) | (1 << ID_HEAD));
  return p.d;
}

const DEAD_CAT_RAMP = ramp(['#25271d', '#33362a', '#454839', '#5a5d48', '#706f58']);
const DEAD_CAT_HEAD = ramp(['#1f1812', '#2e231a', '#42332a', '#574539']);
const DEAD_CAT_RIM = ramp(['#14160f', '#1c1f15']);

/** Dead caterpillar: curled on its side like a 'C', dull olive-grey, tiny pins of legs on the inner side, a few pale-yellow droplets. */
function buildDeadCaterpillar(dir: number): Uint8ClampedArray {
  const [cos, sin] = rotation(dir, CATERPILLAR_CORPSE_DIRS);
  const p = new Pix(cos, sin, 0, 0);
  const R = 7.6;
  const a = (i: number): number => 0.6 + i * 0.66;
  const xy = (i: number, r: number): [number, number] => [r * Math.cos(a(i)), r * Math.sin(a(i))];
  // dull edge under the body first, then the segments
  for (let i = 0; i < CAT_SEGMENTS; i++) {
    const [x, y] = xy(i, R);
    p.blob(x, y, 4.1, 4.1, DEAD_CAT_RIM, { id: ID_SHELL, seed: 50 + i });
  }
  for (let i = 0; i < CAT_SEGMENTS; i++) {
    const [x, y] = xy(i, R);
    const [ix, iy] = xy(i, R - 3.6);
    p.blob(x, y, 3.4, 3.4, DEAD_CAT_RAMP, {
      id: ID_BODY,
      seed: 60 + i,
      jitter: 0.08,
      bias: -0.05,
      deco: (mx, my) => {
        // a dark crease across every segment (along the radius of the curl), dashed
        const t = Math.abs((mx - x) * -Math.sin(a(i)) + (my - y) * Math.cos(a(i)));
        return t < 0.55 && ((mx + my) & 1) === 0 ? ['#171910', 0.8] : undefined;
      },
    });
    // two pins of legs on the inner side of the curl
    p.dot(ix, iy, '#26281c', ID_THIN);
    const [jx, jy] = xy(i, R - 4.6);
    p.dot(jx, jy, '#1b1c14', ID_THIN);
  }
  const [hx, hy] = xy(CAT_SEGMENTS, R);
  p.blob(hx, hy, 3.3, 3.3, DEAD_CAT_HEAD, { id: ID_HEAD, seed: 77 });
  const [ex, ey] = xy(CAT_SEGMENTS, R - 1.3);
  p.dot(ex, ey, '#0c0907', ID_HEAD);
  // pale-yellow droplets: two bigger ones near the head and the middle, two single specks
  const drop = (x: number, y: number, big: boolean): void => {
    p.dot(x, y, '#e4d98a', ID_THIN);
    if (big) {
      p.dot(x + 1, y, '#e4d98a', ID_THIN);
      p.dot(x, y + 1, '#e4d98a', ID_THIN);
      p.dot(x + 1, y + 1, '#b8a85a', ID_THIN);
      p.dot(x, y, '#fff3b0', ID_THIN);
    }
  };
  const [d1x, d1y] = xy(CAT_SEGMENTS, R + 5.2);
  drop(d1x, d1y, true);
  const [d2x, d2y] = xy(3, R + 5);
  drop(d2x, d2y, true);
  const [d3x, d3y] = xy(5, R - 6.2);
  drop(d3x, d3y, false);
  const [d4x, d4y] = xy(1, R + 6.4);
  drop(d4x, d4y, false);
  p.shadow(2, 3, (1 << ID_SHELL) | (1 << ID_BODY) | (1 << ID_HEAD));
  return p.d;
}

// ---- caches ---------------------------------------------------------------------------------------------------------------------

const cache = new Map<number, Uint8ClampedArray>();

function cached(key: number, build: () => Uint8ClampedArray): Uint8ClampedArray {
  let v = cache.get(key);
  if (!v) {
    v = build();
    cache.set(key, v);
  }
  return v;
}

/** RGBA (PREY_SIZE x PREY_SIZE, row-major) of one living-beetle variant. The array is shared: do not modify it. */
export function beetlePixels(dir: number, frame: number): Uint8ClampedArray {
  const d = wrapDir(dir, BEETLE_DIRS);
  const f = wrapDir(frame, BEETLE_FRAMES);
  return cached(d * 10 + f, () => buildBeetle(d, f));
}

/** RGBA of one living-fly variant (pose 0 folded, 1 fidget, 2/3 airborne wing-beat), without shadow. Shared array. */
export function flyPixels(dir: number, pose: number): Uint8ClampedArray {
  const d = wrapDir(dir, FLY_DIRS);
  const q = wrapDir(pose, FLY_POSES);
  return cached(1000 + d * 10 + q, () => buildFly(d, q));
}

export function flyShadowPixels(): Uint8ClampedArray {
  return cached(2000, buildFlyShadow);
}

export function deadBeetlePixels(dir: number): Uint8ClampedArray {
  const d = wrapDir(dir, FLY_DIRS);
  return cached(3000 + d, () => buildDeadBeetle(d));
}

export function deadFlyPixels(dir: number): Uint8ClampedArray {
  const d = wrapDir(dir, FLY_DIRS);
  return cached(4000 + d, () => buildDeadFly(d));
}

/** RGBA of one living-caterpillar variant: direction (16), wave frame (4) and whether it is fleeing (stretched). Shared array. */
export function caterpillarPixels(dir: number, frame: number, flee: boolean): Uint8ClampedArray {
  const d = wrapDir(dir, CATERPILLAR_DIRS);
  const f = wrapDir(frame, CATERPILLAR_FRAMES);
  return cached(5000 + (flee ? 500 : 0) + d * 10 + f, () => buildCaterpillar(d, f, flee));
}

/** RGBA of the curled corpse of a caterpillar (8 directions). Shared array. */
export function deadCaterpillarPixels(dir: number): Uint8ClampedArray {
  const d = wrapDir(dir, CATERPILLAR_CORPSE_DIRS);
  return cached(6000 + d, () => buildDeadCaterpillar(d));
}
