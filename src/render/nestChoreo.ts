/**
 * Choreography of the ants that are inside the nest ("Podzemí" view). Everything here is a PURE function of the ant
 * (id, nest kind / role, seconds left), the current NestLayout and the simulation time: no per-ant state is stored, so
 * the picture is right right after a load and two frames at the same time are identical.
 *
 * Units are layout units (= fine pixels of the 320 x 200 underground picture); 2 of them are one art pixel, so the walking
 * limit MAX_NEST_WALK = 80 units/s is 40 art px/s.
 *
 *  - hatch   a callow (young) ant: loiters among the larvae in a stop-and-go shuffle until 5 s are left, then walks the
 *            tunnels to the entrance and is there exactly when the timer reaches 0 (the simulation puts it on the surface)
 *  - unload  a returning forager: carrying a crumb down the shaft to the pantry, stands there unloading, walks back up and
 *            is at the entrance when the timer reaches 0. The phases are keyed to the REMAINING time (a stay lasts 4 to 6 s),
 *            so a longer stay simply waits at the entrance first; a pantry too far away for the speed limit is not reached
 *  - nurse   a permanent worker with a repeating 24 s cycle shifted by its id: crumb from the pantry to a queen and feed her,
 *            take an egg from the queen's pile to the larvae chamber, put it down, tend the larvae, walk back to the pantry
 */
import { antDirection } from './antArt';
import type { Chamber, NestLayout, Pt } from './nestLayout';
import { hash2 } from './raster';

/** The shaft starts this far above the entrance (the open mouth in the mound); ants appear / disappear there. */
export const MOUTH_RISE = 5;
/** Hard limit of the walking speed in layout units per second (= 40 art px/s). */
export const MAX_NEST_WALK = 80;
/** Seconds of one nurse cycle. */
export const NURSE_CYCLE_S = 24;
/** A hatchling starts its walk to the entrance when this many seconds are left. */
export const HATCH_LEAVE_S = 5;
/** Nominal stay of an unloading forager (the simulation randomises it by +-20 %). */
export const UNLOAD_NOMINAL_S = 5;
/** Layout units walked per full gait cycle (the four frames). */
export const GAIT_UNITS = 6;

export type NestCarry = 'crumb' | 'egg' | null;
export type NestPoseKind = 'walk' | 'stand' | 'feed' | 'tend';

/** What the choreography needs to know about an ant (a structural subset of the simulation's Ant). */
export interface NestAntLike {
  id: number;
  nestKind?: 'hatch' | 'unload' | 'nurse';
  role?: 'forager' | 'nurse';
  timer: number;
}

export interface NestPose {
  x: number;
  y: number;
  /** Sprite direction 0..15 (0 = right, 4 = down, 8 = left, 12 = up). */
  dir16: number;
  /** Gait frame 0..3 (walking: from the distance walked; standing: the antennae twitch between 1 and 3). */
  frame: number;
  carrying: NestCarry;
  pose: NestPoseKind;
  /** Draw with the callow (young ant) palette. */
  callow: boolean;
  /** Index of the queen a nurse works for (id mod queens), -1 for everybody else. */
  queen: number;
}

// ---- routes -------------------------------------------------------------------------------------------------------------

interface Route {
  pts: Pt[];
  cum: number[];
  len: number;
}

function mkRoute(src: readonly Pt[]): Route {
  const pts: Pt[] = [];
  for (const p of src) {
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1e-6) pts.push({ x: p.x, y: p.y });
  }
  if (pts.length === 1) pts.push({ x: pts[0].x, y: pts[0].y + 0.001 });
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { pts, cum, len: cum[cum.length - 1] };
}

const reversed = (p: readonly Pt[]): Pt[] => p.slice().reverse();

interface Sample {
  x: number;
  y: number;
  /** Heading (radians) of the segment at that distance. */
  h: number;
}

/** Point and heading at distance d along a route (clamped). */
function sampleRoute(r: Route, d: number, o: Sample): void {
  const dd = Math.max(0, Math.min(r.len, Number.isFinite(d) ? d : 0));
  let i = 1;
  while (i < r.cum.length - 1 && r.cum[i] < dd) i++;
  const a = r.pts[i - 1];
  const b = r.pts[i];
  const seg = r.cum[i] - r.cum[i - 1] || 1;
  const t = Math.max(0, Math.min(1, (dd - r.cum[i - 1]) / seg));
  o.x = a.x + (b.x - a.x) * t;
  o.y = a.y + (b.y - a.y) * t;
  o.h = Math.atan2(b.y - a.y, b.x - a.x);
}

const same = (a: Pt, b: Pt): boolean => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;

/**
 * Walkable polyline from the centre of chamber A to the centre of chamber B, given the two tunnels (entrance -> centre) that
 * serve them: the shared trunk is walked only once (no detour up to the entrance and back down).
 */
function joinTunnels(a: readonly Pt[], b: readonly Pt[]): Pt[] {
  let i = 0;
  while (i + 1 < a.length - 1 && i + 1 < b.length - 1 && same(a[i + 1], b[i + 1])) i++;
  const ua = { x: a[i + 1].x - a[i].x, y: a[i + 1].y - a[i].y };
  const ub = { x: b[i + 1].x - b[i].x, y: b[i + 1].y - b[i].y };
  const cross = ua.x * ub.y - ua.y * ub.x;
  const dot = ua.x * ub.x + ua.y * ub.y;
  const la = Math.hypot(ua.x, ua.y);
  const lb = Math.hypot(ub.x, ub.y);
  const collinear = Math.abs(cross) < 1e-6 * Math.max(1, la * lb) && dot > 0;
  if (collinear && la <= lb) {
    // the end of A's first segment lies on B's: that is where the two ways part
    return [...reversed(a.slice(i + 1)), ...b.slice(i + 1)];
  }
  if (collinear) return [...reversed([b[i + 1], ...a.slice(i + 1)]), ...b.slice(i + 1)];
  return [...reversed(a.slice(i)), ...b.slice(i + 1)];
}

const norm = (c: Chamber, p: Pt): number => Math.hypot((p.x - c.cx) / c.rx, (p.y - c.cy) / c.ry);

/** The route cut where it first enters the chamber's ellipse scaled by `depth` (the last segment ends in the centre). */
function cutInside(pts: readonly Pt[], c: Chamber, depth: number): Pt[] {
  const out = pts.slice();
  const n = out.length;
  const a = out[n - 2];
  const b = out[n - 1];
  for (let s = 0; s <= 48; s++) {
    const t = s / 48;
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (norm(c, p) <= depth) {
      out[n - 1] = p;
      return out;
    }
  }
  return out;
}

interface Routes {
  sig: number[];
  mouth: Pt;
  pantry: Chamber;
  larvae: Chamber;
  queens: Chamber[];
  /** mouth -> a spot inside the pantry. */
  unload: Route;
  /** larvae centre -> mouth. */
  hatchOut: Route;
  /** pantry centre -> head spot of each queen, head spot -> larvae centre, larvae centre -> pantry centre. */
  toQueen: Route[];
  eggRun: Route[];
  home: Route;
  headSpot: Pt[];
}

let cachedRoutes: Routes | null = null;

function sameSig(l: NestLayout, sig: number[]): boolean {
  if (sig.length !== 3 + l.chambers.length * 4) return false;
  if (sig[0] !== l.entrance.x || sig[1] !== l.entrance.y || sig[2] !== l.chambers.length) return false;
  for (let i = 0; i < l.chambers.length; i++) {
    const c = l.chambers[i];
    const o = 3 + i * 4;
    if (sig[o] !== c.cx || sig[o + 1] !== c.cy || sig[o + 2] !== c.rx || sig[o + 3] !== c.ry) return false;
  }
  return true;
}

/** Where a nurse stands to feed the queen: face to face with her, in front of her head (the queen faces right, every second one is mirrored). */
export function queenHeadSpot(c: Chamber, index: number): Pt {
  const s = index % 2 === 1 ? -1 : 1;
  return { x: c.cx + s * c.rx * 0.86, y: c.cy - c.ry * 0.25 };
}

function buildRoutes(l: NestLayout): Routes | null {
  const pantry = l.chambers.find((c) => c.kind === 'pantry');
  const larvae = l.chambers.find((c) => c.kind === 'larvae');
  if (!pantry || !larvae) return null;
  const tunnelOf = (c: Chamber): Pt[] => l.tunnels.find((t) => t.to === c.id)?.points ?? [l.entrance, { x: c.cx, y: c.cy }];
  const mouth = { x: l.entrance.x, y: l.entrance.y - MOUTH_RISE };
  const tp = tunnelOf(pantry);
  const tl = tunnelOf(larvae);
  const queens = l.chambers.filter((c) => c.kind === 'queen');

  const sig: number[] = [l.entrance.x, l.entrance.y, l.chambers.length];
  for (const c of l.chambers) sig.push(c.cx, c.cy, c.rx, c.ry);

  // the way into a queen chamber ends where the tunnel enters the ellipse; from there it is a short step to her head
  const pq = queens.map((q, i) => mkRoute([...cutInside(joinTunnels(tp, tunnelOf(q)), q, 0.9), queenHeadSpot(q, i)]));
  const ql = queens.map((q, i) => mkRoute([queenHeadSpot(q, i), ...reversed(cutInside(joinTunnels(tl, tunnelOf(q)), q, 0.9))]));
  return {
    sig,
    mouth,
    pantry,
    larvae,
    queens,
    unload: mkRoute(cutInside([mouth, ...tp], pantry, 0.75)),
    hatchOut: mkRoute([...reversed(tl), mouth]),
    toQueen: pq,
    eggRun: ql,
    home: mkRoute(joinTunnels(tl, tp)),
    headSpot: queens.map((q, i) => queenHeadSpot(q, i)),
  };
}

function routesFor(l: NestLayout): Routes | null {
  if (cachedRoutes && sameSig(l, cachedRoutes.sig)) return cachedRoutes;
  cachedRoutes = buildRoutes(l);
  return cachedRoutes;
}

// ---- small helpers ---------------------------------------------------------------------------------------------------------

const S: Sample = { x: 0, y: 0, h: 0 };
const OFF_FADE = 14;

/** Gait frame from a distance walked. */
const gait = (d: number): number => {
  const ph = d / GAIT_UNITS;
  return Math.floor((ph - Math.floor(ph)) * 4) & 3;
};

/** Standing ants twitch their antennae between frames 1 and 3. */
const standFrame = (id: number, time: number): number => (Math.floor(time / 0.4 + id * 0.37) & 1 ? 3 : 1);

/** A short head nod used while feeding / tending: the facing swings a little to one side and the other. */
const nod = (id: number, time: number): number => (Math.floor(time * 3.5 + id * 0.21) & 1 ? 0.4 : -0.4);

/** Small per-id displacement (layout units) so ants of the same job never stand on exactly the same pixels. */
const offX = (id: number, k: number): number => (hash2(id, k, 11) - 0.5) * 6;
const offY = (id: number, k: number): number => (hash2(id, k, 12) - 0.5) * 4;

const fade = (dist: number): number => Math.max(0, 1 - dist / OFF_FADE);

function put(
  out: NestPose,
  x: number,
  y: number,
  heading: number,
  frame: number,
  carrying: NestCarry,
  pose: NestPoseKind,
  callow: boolean,
  queen: number,
): NestPose {
  out.x = x;
  out.y = y;
  out.dir16 = antDirection(heading);
  out.frame = frame;
  out.carrying = carrying;
  out.pose = pose;
  out.callow = callow;
  out.queen = queen;
  return out;
}

const blank = (): NestPose => ({ x: 0, y: 0, dir16: 0, frame: 0, carrying: null, pose: 'stand', callow: false, queen: -1 });

/** Walks `r` at distance d with the start / end offsets faded in over the first / last OFF_FADE units. */
function onRoute(r: Route, d: number, sx: number, sy: number, ex: number, ey: number, o: Sample): void {
  sampleRoute(r, d, o);
  const w0 = fade(d);
  const w1 = fade(r.len - d);
  o.x += sx * w0 + ex * w1;
  o.y += sy * w0 + ey * w1;
}

// ---- hatchlings -------------------------------------------------------------------------------------------------------------

const LOITER_SEG_S = 3.4;
const LOITER_SPEED = 10;

interface Loiter {
  x: number;
  y: number;
  h: number;
  moving: boolean;
  walked: number;
}
const L: Loiter = { x: 0, y: 0, h: 0, moving: false, walked: 0 };

/** Stop-and-go shuffle inside the larvae chamber: closed form, so it can be evaluated at any time. */
function loiter(id: number, time: number, c: Chamber): void {
  const t = time + id * 1.93;
  const k = Math.floor(t / LOITER_SEG_S);
  const tau = t - k * LOITER_SEG_S;
  const ax = c.rx * 0.55;
  const ay = c.ry * 0.45;
  const wx = (n: number): number => c.cx + (hash2(n, id, 31) - 0.5) * 2 * ax;
  const wy = (n: number): number => c.cy + 2 + (hash2(n, id, 32) - 0.5) * 2 * ay;
  const x0 = wx(k);
  const y0 = wy(k);
  const x1 = wx(k + 1);
  const y1 = wy(k + 1);
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const dur = Math.min(dist / LOITER_SPEED, 2.8);
  L.h = dist > 1e-6 ? Math.atan2(y1 - y0, x1 - x0) : 0;
  if (dur > 0 && tau < dur) {
    const u = tau / dur;
    L.x = x0 + (x1 - x0) * u;
    L.y = y0 + (y1 - y0) * u;
    L.moving = true;
    L.walked = dist * u;
  } else {
    L.x = x1;
    L.y = y1;
    L.moving = false;
    L.walked = 0;
  }
}

function hatchPose(ant: NestAntLike, rt: Routes, time: number, out: NestPose): NestPose {
  const timer = Number.isFinite(ant.timer) ? ant.timer : 0;
  if (timer > HATCH_LEAVE_S) {
    loiter(ant.id, time, rt.larvae);
    return put(out, L.x, L.y, L.h, L.moving ? gait(L.walked) : standFrame(ant.id, time), null, L.moving ? 'walk' : 'stand', true, -1);
  }
  const r = rt.hatchOut;
  const left = Math.max(0, timer);
  // the position the ant had when its last 5 s began fades out while it enters the tunnel
  loiter(ant.id, time + left - HATCH_LEAVE_S, rt.larvae);
  const sx = L.x - r.pts[0].x;
  const sy = L.y - r.pts[0].y;
  const speed = Math.min(MAX_NEST_WALK, r.len / HATCH_LEAVE_S);
  const d = Math.max(0, r.len - speed * left);
  sampleRoute(r, d, S);
  const w = fade(d);
  return put(out, S.x + sx * w, S.y + sy * w, S.h, gait(d), null, 'walk', true, -1);
}

// ---- unloading foragers -------------------------------------------------------------------------------------------------------

/** Shortest stay (the walk is keyed to the remaining time: down while > UP + STAND, then unload, then up). */
const UNLOAD_MIN_S = 4;
const UNLOAD_UP_S = 1.6;
const UNLOAD_STAND_S = 0.7;

function unloadPose(ant: NestAntLike, rt: Routes, time: number, out: NestPose): NestPose {
  const r = rt.unload;
  const tm = Number.isFinite(ant.timer) ? ant.timer : 0;
  const downEnd = UNLOAD_UP_S + UNLOAD_STAND_S;
  const tDown = UNLOAD_MIN_S - downEnd;
  const dTurn = Math.min(r.len, MAX_NEST_WALK * Math.min(tDown, UNLOAD_UP_S));
  if (tm > UNLOAD_MIN_S) {
    sampleRoute(r, 0, S);
    return put(out, S.x, S.y, S.h, standFrame(ant.id, time), 'crumb', 'stand', false, -1);
  }
  if (tm > downEnd) {
    const d = dTurn * ((UNLOAD_MIN_S - tm) / tDown);
    sampleRoute(r, d, S);
    return put(out, S.x, S.y, S.h, gait(d), 'crumb', 'walk', false, -1);
  }
  if (tm > UNLOAD_UP_S) {
    sampleRoute(r, dTurn, S);
    return put(out, S.x, S.y, S.h, standFrame(ant.id, time), null, 'stand', false, -1);
  }
  const d = dTurn * (Math.max(0, tm) / UNLOAD_UP_S);
  sampleRoute(r, d, S);
  return put(out, S.x, S.y, S.h + Math.PI, gait(d), null, 'walk', false, -1);
}

// ---- nurses -----------------------------------------------------------------------------------------------------------------------

const STAND_PICK_S = 1;
const FEED_S = 3;
const FEED_CRUMB_S = 2;
const EGG_PICK_S = 0.6;
const EGG_PLACE_S = 1.2;
const TEND_S = 4;
const STANDS_S = STAND_PICK_S + FEED_S + EGG_PICK_S + EGG_PLACE_S + TEND_S;
const PHASE_SHIFT_S = 5.37;

function nursePose(ant: NestAntLike, rt: Routes, time: number, out: NestPose): NestPose {
  const id = ant.id;
  const nq = rt.queens.length;
  if (nq === 0) {
    loiter(id, time, rt.larvae);
    return put(out, L.x, L.y, L.h, standFrame(id, time), null, 'tend', false, -1);
  }
  const qi = ((id % nq) + nq) % nq;
  const q = rt.queens[qi];
  const toQ = rt.toQueen[qi];
  const egg = rt.eggRun[qi];
  const home = rt.home;
  const walkBudget = NURSE_CYCLE_S - STANDS_S;
  const total = toQ.len + egg.len + home.len;
  const w1 = (walkBudget * toQ.len) / total;
  const w2 = (walkBudget * egg.len) / total;
  const w3 = walkBudget - w1 - w2;

  let t = (time + id * PHASE_SHIFT_S) % NURSE_CYCLE_S;
  if (t < 0) t += NURSE_CYCLE_S;

  // offsets at the three stations: pantry, queen, larvae
  const pX = offX(id, 1);
  const pY = offY(id, 1);
  const qX = offX(id, 2) * 0.7;
  const qY = offY(id, 2) * 0.7;
  const lX = offX(id, 3) * 1.6;
  const lY = offY(id, 3) * 1.6;

  const at = (r: Route, d: number, a: number, b: number, c2: number, e: number): void => onRoute(r, d, a, b, c2, e, S);
  const aim = (heading: number): number => heading + nod(id, time);
  const faceTo = (cx: number, cy: number, dflt: number): number => {
    const dx = cx - S.x;
    const dy = cy - S.y;
    return Math.hypot(dx, dy) < 0.5 ? dflt : Math.atan2(dy, dx);
  };

  // 0: pick up a crumb at the pantry
  if (t < STAND_PICK_S) {
    at(toQ, 0, pX, pY, qX, qY);
    return put(out, S.x, S.y, faceTo(rt.pantry.cx, rt.pantry.cy, S.h), standFrame(id, time), null, 'stand', false, qi);
  }
  t -= STAND_PICK_S;
  // 1: carry it to the queen
  if (t < w1) {
    const d = (t / w1) * toQ.len;
    at(toQ, d, pX, pY, qX, qY);
    return put(out, S.x, S.y, S.h, gait(d), 'crumb', 'walk', false, qi);
  }
  t -= w1;
  // 2: feed her (the crumb is gone for the last second)
  if (t < FEED_S) {
    at(toQ, toQ.len, pX, pY, qX, qY);
    return put(out, S.x, S.y, aim(faceTo(q.cx + (qi % 2 ? -1 : 1) * q.rx * 0.75, q.cy - q.ry * 0.12, S.h)), standFrame(id, time), t < FEED_CRUMB_S ? 'crumb' : null, 'feed', false, qi);
  }
  t -= FEED_S;
  // 3: take an egg from her pile
  if (t < EGG_PICK_S) {
    at(egg, 0, qX, qY, lX, lY);
    return put(out, S.x, S.y, faceTo(q.cx, q.cy + q.ry * 0.5, S.h), standFrame(id, time), 'egg', 'stand', false, qi);
  }
  t -= EGG_PICK_S;
  // 4: carry it to the larvae chamber
  if (t < w2) {
    const d = (t / w2) * egg.len;
    at(egg, d, qX, qY, lX, lY);
    return put(out, S.x, S.y, S.h, gait(d), 'egg', 'walk', false, qi);
  }
  t -= w2;
  // 5: put it down among the larvae
  if (t < EGG_PLACE_S) {
    at(egg, egg.len, qX, qY, lX, lY);
    return put(out, S.x, S.y, aim(faceTo(rt.larvae.cx, rt.larvae.cy + rt.larvae.ry * 0.4, Math.PI / 2)), standFrame(id, time), t < EGG_PICK_S ? 'egg' : null, 'tend', false, qi);
  }
  t -= EGG_PLACE_S;
  // 6: tend the larvae
  if (t < TEND_S) {
    at(egg, egg.len, qX, qY, lX, lY);
    return put(out, S.x, S.y, aim(faceTo(rt.larvae.cx, rt.larvae.cy + rt.larvae.ry * 0.4, Math.PI / 2)), standFrame(id, time), null, 'tend', false, qi);
  }
  t -= TEND_S;
  // 7: back to the pantry
  const d = Math.min(1, t / w3) * home.len;
  at(home, d, lX, lY, pX, pY);
  return put(out, S.x, S.y, S.h, gait(d), null, 'walk', false, qi);
}

// ---- entry point --------------------------------------------------------------------------------------------------------------------

/**
 * Pose of one nest ant at simulation time `time` (seconds). Pass `out` to reuse an object (nothing else is allocated).
 * An ant without a recognised kind is treated as an unloading forager; a layout without pantry and larvae chamber
 * parks everybody at the mouth of the shaft.
 */
export function nestAntPose(ant: NestAntLike, layout: NestLayout, time: number, out: NestPose = blank()): NestPose {
  const rt = routesFor(layout);
  const tm = Number.isFinite(time) ? time : 0;
  if (!rt) return put(out, layout.entrance.x, layout.entrance.y - MOUTH_RISE, Math.PI / 2, 0, null, 'stand', false, -1);
  if (ant.role === 'nurse' || ant.nestKind === 'nurse') return nursePose(ant, rt, tm, out);
  if (ant.nestKind === 'hatch') return hatchPose(ant, rt, tm, out);
  return unloadPose(ant, rt, tm, out);
}
