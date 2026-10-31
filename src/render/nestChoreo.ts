/**
 * Choreography of the ants that are inside the nest ("Podzemí" view). Everything here is a PURE function of the ant
 * (id, nest kind / role, seconds left), the current NestLayout and the simulation time: no per-ant state is stored, so
 * the picture is right right after a load and two frames at the same time are identical.
 *
 * Ants walk ONLY along the tunnels: every route is a shortest path over the tunnel graph (see nestGraph.ts), cut where it enters
 * a chamber and continued to a standing spot on the floor of that chamber. Small per-ant offsets exist only inside chambers
 * (they fade to nothing before the tunnel starts), so a walker is always on a tunnel centre line or inside a chamber.
 *
 * Units are layout units (= fine pixels of the underground picture, 320 x 200 or grown in normal mode); 2 of them are one
 * art pixel, so the walking limit MAX_NEST_WALK = 80 units/s is 40 art px/s.
 *
 * A grown normal-mode nest has hundreds of chambers, many of them far away: hatchlings then wait only in the larvae chambers
 * from which the entrance can be reached in their last 5 s, and unloading foragers only look at the pantries near enough.
 *
 *  - hatch   a callow (young) ant: loiters on the floor of a larvae chamber (by id) until 5 s are left, then walks the
 *            tunnels to the entrance and is there exactly when the timer reaches 0 (the simulation puts it on the surface)
 *  - unload  a returning forager: carrying a crumb down the shaft to the pantry with the most free room that it can reach,
 *            stands there unloading, walks back up and is at the entrance when the timer reaches 0. The phases are keyed to the
 *            REMAINING time (a stay lasts 4 to 6 s); a pantry too far away for the speed limit is not reached
 *  - nurse   a permanent worker with a repeating cycle shifted by its id: crumb from one of the two nearest pantries to the queen
 *            chamber (id mod queens) and feed her, take an egg to the nearest larvae chamber, put it down, tend the larvae of
 *            the chamber picked by id, walk back to the pantry
 */
import { antDirection } from './antArt';
import { buildGraph, distancesFrom, nearestNode, pathFrom, type Distances, type Graph } from './nestGraph';
import { floorY } from './nestArt';
import { insideChamber, type Chamber, type NestLayout, type Pt } from './nestLayout';
import { MAX_LARVAE_CHAMBERS, MAX_PANTRIES, PANTRY_CAPACITY } from '../sim/constants';
import { hash2 } from './raster';

/** The shaft starts this far above the entrance (the open mouth in the mound); ants appear / disappear there. */
export const MOUTH_RISE = 5;
/** Hard limit of the walking speed in layout units per second (= 40 art px/s). */
export const MAX_NEST_WALK = 80;
/** Seconds of one nurse cycle (longer in a very wide nest: the walking speed limit wins). */
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
  role?: 'forager' | 'nurse' | 'guard';
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
  /** Length of the part inside a chamber at the start / end of the route (small per-ant offsets fade out over it). */
  lead: number;
  tail: number;
}

/** `leadPts` / `tailPts`: how many points at the start / end are standing spots inside a chamber (0 = the mouth of the shaft). */
function mkRoute(src: readonly Pt[], leadPts: number, tailPts: number): Route {
  const raw = [0];
  for (let i = 1; i < src.length; i++) raw.push(raw[i - 1] + Math.hypot(src[i].x - src[i - 1].x, src[i].y - src[i - 1].y));
  const lead = leadPts > 0 && leadPts < src.length ? raw[leadPts] : 0;
  const tail = tailPts > 0 && tailPts < src.length ? raw[raw.length - 1] - raw[src.length - 1 - tailPts] : 0;
  const pts: Pt[] = [];
  for (const p of src) {
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1e-6) pts.push({ x: p.x, y: p.y });
  }
  if (pts.length === 1) pts.push({ x: pts[0].x, y: pts[0].y + 0.001 });
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { pts, cum, len: cum[cum.length - 1], lead, tail };
}

interface Sample {
  x: number;
  y: number;
  /** Heading (radians) of the segment at that distance. */
  h: number;
}

/** Point and heading at distance d along a route (clamped). */
function sampleRoute(r: Route, d: number, o: Sample): void {
  const dd = Math.max(0, Math.min(r.len, Number.isFinite(d) ? d : 0));
  let lo = 1;
  let hi = r.cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (r.cum[mid] < dd) lo = mid + 1;
    else hi = mid;
  }
  const a = r.pts[lo - 1];
  const b = r.pts[lo];
  const seg = r.cum[lo] - r.cum[lo - 1] || 1;
  const t = Math.max(0, Math.min(1, (dd - r.cum[lo - 1]) / seg));
  o.x = a.x + (b.x - a.x) * t;
  o.y = a.y + (b.y - a.y) * t;
  o.h = Math.atan2(b.y - a.y, b.x - a.x);
}

// ---- the tunnel network of a layout -----------------------------------------------------------------------------------------

/** A path point counts as "inside" a chamber when it is within this fraction of the chamber's size. */
const DEEP = 0.88;

const deep = (c: Chamber, p: Pt, f = DEEP): boolean => insideChamber({ cx: c.cx, cy: c.cy, rx: c.rx * f, ry: c.ry * f, lobes: c.lobes }, p.x, p.y);

interface Net {
  graph: Graph;
  mouth: Pt;
  entrance: number;
  centre: Map<string, number>;
  dist: Map<number, Distances>;
  routes: Map<string, { sig: string; route: Route }>;
  ranks: Map<string, number[]>;
  /** Indices (into the chambers of a kind) of those whose centre is at most this far from the entrance, by kind and distance. */
  near: Map<string, number[]>;
}

const nets = new Map<string, Net>();

function netFor(l: NestLayout): Net | null {
  let n = nets.get(l.key);
  if (n) return n;
  if (!l.tunnels.length) return null;
  const graph = buildGraph(l.tunnels.map((t) => t.points));
  const centre = new Map<string, number>();
  for (const c of l.chambers) centre.set(c.id, nearestNode(graph, { x: c.cx, y: c.cy }));
  n = {
    graph,
    mouth: { x: l.entrance.x, y: l.entrance.y - MOUTH_RISE },
    entrance: nearestNode(graph, l.entrance),
    centre,
    dist: new Map(),
    routes: new Map(),
    ranks: new Map(),
    near: new Map(),
  };
  if (nets.size >= 8) nets.delete(nets.keys().next().value as string);
  nets.set(l.key, n);
  return n;
}

function distFrom(n: Net, node: number): Distances {
  let d = n.dist.get(node);
  if (!d) {
    d = distancesFrom(n.graph, node);
    n.dist.set(node, d);
  }
  return d;
}

const nodeOf = (n: Net, c: Chamber | null): number => (c ? (n.centre.get(c.id) as number) : n.entrance);

/** Indices of the chambers of `list` whose centre is at most `limit` from the entrance along the tunnels (all, when none is). */
function nearEntrance(n: Net, key: string, list: readonly Chamber[], limit: number): number[] {
  const k = `${key}:${limit}`;
  let r = n.near.get(k);
  if (!r) {
    const d = distFrom(n, n.entrance).dist;
    r = [];
    list.forEach((c, i) => d[nodeOf(n, c)] <= limit && r!.push(i));
    if (!r.length) r = list.map((_, i) => i);
    n.near.set(k, r);
  }
  return r;
}

/** The tunnel path between the centres of two chambers (or the entrance, `null`). */
const pathOf = (n: Net, a: Chamber | null, b: Chamber | null): Pt[] => pathFrom(n.graph, distFrom(n, nodeOf(n, a)), nodeOf(n, b)) ?? [];

/** Floor spots of a chamber: slot 0 left, 1 right, 2 middle. Every one is inside the chamber, on its floor line. */
export function standSpot(c: Chamber, slot: number): Pt {
  const f = slot === 0 ? -0.5 : slot === 1 ? 0.5 : 0;
  return { x: c.cx + f * c.rx, y: floorY(c, c.ry) - 2 };
}

/** Where a nurse stands to feed the queen: face to face with her, in front of her head (the queen faces right, every second one is mirrored). */
export function queenHeadSpot(c: Chamber, index: number): Pt {
  const s = index % 2 === 1 ? -1 : 1;
  const p = { x: c.cx + s * c.rx * 0.8, y: c.cy - c.ry * 0.2 };
  for (let k = 0; k < 6 && !deep(c, p, 0.92); k++) {
    p.x = c.cx + (p.x - c.cx) * 0.9;
    p.y = c.cy + (p.y - c.cy) * 0.9;
  }
  return p;
}

/** Points of a centre-to-centre path without the stretch inside the chambers at its start and at its end. */
function outside(path: readonly Pt[], from: Chamber | null, to: Chamber | null): Pt[] {
  let a = 0;
  let b = path.length;
  if (from) while (a < b - 1 && deep(from, path[a])) a++;
  if (to) while (b > a + 1 && deep(to, path[b - 1])) b--;
  return path.slice(a, b);
}

/** Route from a standing spot in `from` (or the mouth) to a spot in `to` (or the mouth) along the tunnels. */
function legRoute(n: Net, from: Chamber | null, fromPt: Pt | null, to: Chamber | null, toPt: Pt | null): Route {
  const mid = outside(pathOf(n, from, to), from, to);
  const pts: Pt[] = [];
  if (fromPt) pts.push(fromPt);
  else pts.push(n.mouth);
  pts.push(...mid);
  if (toPt) pts.push(toPt);
  else pts.push(n.mouth);
  return mkRoute(pts, fromPt ? 1 : 0, toPt ? 1 : 0);
}

function memoRoute(n: Net, key: string, cs: readonly Chamber[], build: () => Route): Route {
  const sig = cs.map((c) => `${Math.round(c.rx * 2)}/${Math.round(c.ry * 2)}`).join(',');
  const hit = n.routes.get(key);
  if (hit && hit.sig === sig) return hit.route;
  const route = build();
  n.routes.set(key, { sig, route });
  return route;
}

/** Indices of `list` ordered by the tunnel distance to `from` (stable). */
function rank(n: Net, key: string, from: Chamber, list: readonly Chamber[]): number[] {
  const k = `${key}:${from.id}`;
  let r = n.ranks.get(k);
  if (!r) {
    const d = distFrom(n, nodeOf(n, from)).dist;
    const o = list.map((c, i) => ({ i, d: d[nodeOf(n, c)] }));
    o.sort((a, b) => a.d - b.d || a.i - b.i);
    r = o.map((x) => x.i);
    n.ranks.set(k, r);
  }
  return r;
}

interface Crew {
  net: Net;
  queens: Chamber[];
  pantries: Chamber[];
  larvae: Chamber[];
}

const mod = (a: number, m: number): number => ((a % m) + m) % m;

function crewFor(l: NestLayout): Crew | null {
  const pantries = l.chambers.filter((c) => c.kind === 'pantry');
  const larvae = l.chambers.filter((c) => c.kind === 'larvae');
  if (!pantries.length || !larvae.length) return null;
  const net = netFor(l);
  if (!net) return null;
  return { net, queens: l.chambers.filter((c) => c.kind === 'queen'), pantries, larvae };
}

// ---- small helpers ---------------------------------------------------------------------------------------------------------

const S: Sample = { x: 0, y: 0, h: 0 };

/** Gait frame from a distance walked. */
const gait = (d: number): number => {
  const ph = d / GAIT_UNITS;
  return Math.floor((ph - Math.floor(ph)) * 4) & 3;
};

/** Standing ants twitch their antennae between frames 1 and 3. */
const standFrame = (id: number, time: number): number => (Math.floor(time / 0.4 + id * 0.37) & 1 ? 3 : 1);

/** A short head nod used while feeding / tending: the facing swings a little to one side and the other. */
const nod = (id: number, time: number): number => (Math.floor(time * 3.5 + id * 0.21) & 1 ? 0.4 : -0.4);

/** Small per-id displacement (layout units, never more than 1.8) inside chambers so ants of one job do not stand on the same pixels. */
const offX = (id: number, k: number): number => (hash2(id, k, 11) - 0.5) * 3;
const offY = (id: number, k: number): number => (hash2(id, k, 12) - 0.5) * 2;

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

/** Walks `r` at distance d with the start / end offsets faded out over the stretch of the route that lies inside a chamber. */
function onRoute(r: Route, d: number, sx: number, sy: number, ex: number, ey: number, o: Sample): void {
  sampleRoute(r, d, o);
  const w0 = r.lead > 1e-6 ? Math.max(0, 1 - d / r.lead) : d <= 1e-6 && r.lead > -1 ? 1 : 0;
  const w1 = r.tail > 1e-6 ? Math.max(0, 1 - (r.len - d) / r.tail) : r.len - d <= 1e-6 ? 1 : 0;
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

/** Stop-and-go shuffle along the floor of a larvae chamber: closed form, so it can be evaluated at any time. */
function loiter(id: number, time: number, c: Chamber): void {
  const t = time + id * 1.93;
  const k = Math.floor(t / LOITER_SEG_S);
  const tau = t - k * LOITER_SEG_S;
  const fy = floorY(c, c.ry) - 2;
  const wx = (n: number): number => c.cx + (hash2(n, id, 31) - 0.5) * 2 * c.rx * 0.62;
  const wy = (n: number): number => fy - hash2(n, id, 32) * 1.5;
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

function hatchPose(ant: NestAntLike, cr: Crew, time: number, out: NestPose): NestPose {
  const timer = Number.isFinite(ant.timer) ? ant.timer : 0;
  // a grown nest: only the larvae chambers from which the walk out fits in the last 5 s at full speed
  const pool = cr.larvae.length > MAX_LARVAE_CHAMBERS ? nearEntrance(cr.net, 'larvae', cr.larvae, MAX_NEST_WALK * HATCH_LEAVE_S - 20) : null;
  const c = pool ? cr.larvae[pool[mod(ant.id, pool.length)]] : cr.larvae[mod(ant.id, cr.larvae.length)];
  if (timer > HATCH_LEAVE_S) {
    loiter(ant.id, time, c);
    return put(out, L.x, L.y, L.h, L.moving ? gait(L.walked) : standFrame(ant.id, time), null, L.moving ? 'walk' : 'stand', true, -1);
  }
  const r = memoRoute(cr.net, `hatch:${c.id}`, [c], () => legRoute(cr.net, c, standSpot(c, 2), null, null));
  const left = Math.max(0, timer);
  // the position the ant had when its last 5 s began fades out while it walks out of the chamber
  loiter(ant.id, time + left - HATCH_LEAVE_S, c);
  const speed = Math.min(MAX_NEST_WALK, r.len / HATCH_LEAVE_S);
  const d = Math.max(0, r.len - speed * left);
  onRoute(r, d, L.x - r.pts[0].x, L.y - r.pts[0].y, 0, 0, S);
  return put(out, S.x, S.y, S.h, gait(d), null, 'walk', true, -1);
}

// ---- unloading foragers -------------------------------------------------------------------------------------------------------

/** Shortest stay (the walk is keyed to the remaining time: down while > UP + STAND, then unload, then up). */
const UNLOAD_MIN_S = 4;
const UNLOAD_UP_S = 1.6;
const UNLOAD_STAND_S = 0.7;

/** The way to the pantry with the most free room among those that can be reached in time (quantised free room, lower index on ties). */
function unloadRoute(cr: Crew): Route {
  const reach = MAX_NEST_WALK * Math.min(UNLOAD_MIN_S - UNLOAD_UP_S - UNLOAD_STAND_S, UNLOAD_UP_S) + 1;
  // a grown nest: only the pantries whose centre is near enough for the way in to be within reach (it ends inside the pantry)
  const pantries = cr.pantries.length > MAX_PANTRIES ? nearEntrance(cr.net, 'pantries', cr.pantries, reach + 40).map((i) => cr.pantries[i]) : cr.pantries;
  const routes = pantries.map((p) =>
    memoRoute(cr.net, `unload:${p.id}`, [p], () => {
      const pts: Pt[] = [cr.net.mouth, ...pathOf(cr.net, null, p)];
      // the way in ends where it is well inside the pantry
      let end = pts.length;
      while (end > 2 && deep(p, pts[end - 1], 0.75)) end--;
      return mkRoute(end < pts.length ? pts.slice(0, end + 1) : pts, 0, 0);
    }),
  );
  let best = -1;
  let bestFree = -1;
  routes.forEach((r, i) => {
    if (r.len > reach) return;
    const free = Math.floor(Math.max(0, PANTRY_CAPACITY - pantries[i].load) / 2.5);
    if (free > bestFree) {
      bestFree = free;
      best = i;
    }
  });
  if (best < 0) routes.forEach((r, i) => (best < 0 || r.len < routes[best].len) && (best = i));
  return routes[best];
}

function unloadPose(ant: NestAntLike, cr: Crew, time: number, out: NestPose): NestPose {
  const r = unloadRoute(cr);
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

interface Plan {
  q: Chamber;
  qi: number;
  pantry: Chamber;
  egg: Chamber;
  tend: Chamber;
  toQ: Route;
  eggRun: Route;
  between: Route;
  home: Route;
  cycle: number;
}

/** Everything one nurse needs (routes are cached per queen, pantry and chambers): the routes and the length of her cycle. */
function planFor(ant: NestAntLike, cr: Crew): Plan {
  const nq = cr.queens.length;
  const qi = mod(ant.id, nq);
  const q = cr.queens[qi];
  const n = cr.net;
  const near = rank(n, 'pantries', q, cr.pantries);
  const pantry = cr.pantries[near[Math.floor(mod(ant.id, 1 << 20) / nq) % Math.min(2, near.length)]];
  const egg = cr.larvae[rank(n, 'larvae', q, cr.larvae)[0]];
  const tend = cr.larvae[mod(ant.id, cr.larvae.length)];
  const head = queenHeadSpot(q, qi);
  const toQ = memoRoute(n, `toq:${pantry.id}:${q.id}`, [pantry, q], () => legRoute(n, pantry, standSpot(pantry, 0), q, head));
  const eggRun = memoRoute(n, `egg:${q.id}:${egg.id}`, [q, egg], () => legRoute(n, q, head, egg, standSpot(egg, 0)));
  const between = memoRoute(n, `between:${egg.id}:${tend.id}`, [egg, tend], () =>
    egg === tend ? mkRoute([standSpot(egg, 0), standSpot(egg, 1)], 1, 1) : legRoute(n, egg, standSpot(egg, 0), tend, standSpot(tend, 1)),
  );
  const home = memoRoute(n, `home:${tend.id}:${pantry.id}`, [tend, pantry], () => legRoute(n, tend, standSpot(tend, 1), pantry, standSpot(pantry, 0)));
  const total = toQ.len + eggRun.len + between.len + home.len;
  const cycle = Math.max(NURSE_CYCLE_S, STANDS_S + total / (MAX_NEST_WALK * 0.85));
  return { q, qi, pantry, egg, tend, toQ, eggRun, between, home, cycle };
}

/** Seconds of the cycle of a nurse in this layout (24 s unless the tunnels are so long that the walking speed limit needs more). */
export function nurseCycleS(ant: NestAntLike, layout: NestLayout): number {
  const cr = crewFor(layout);
  return cr && cr.queens.length ? planFor(ant, cr).cycle : NURSE_CYCLE_S;
}

function nursePose(ant: NestAntLike, cr: Crew, time: number, out: NestPose): NestPose {
  const id = ant.id;
  if (cr.queens.length === 0) {
    const c = cr.larvae[mod(id, cr.larvae.length)];
    loiter(id, time, c);
    return put(out, L.x, L.y, L.h, standFrame(id, time), null, 'tend', false, -1);
  }
  const pl = planFor(ant, cr);
  const { q, qi, toQ, eggRun, between, home } = pl;
  const walkBudget = pl.cycle - STANDS_S;
  const total = toQ.len + eggRun.len + between.len + home.len || 1;
  const w1 = (walkBudget * toQ.len) / total;
  const w2 = (walkBudget * eggRun.len) / total;
  const w2b = (walkBudget * between.len) / total;
  const w3 = walkBudget - w1 - w2 - w2b;

  let t = (time + id * PHASE_SHIFT_S) % pl.cycle;
  if (t < 0) t += pl.cycle;

  // offsets at the stations: pantry, queen, egg spot, tending spot
  const pX = offX(id, 1);
  const pY = offY(id, 1);
  const qX = offX(id, 2) * 0.7;
  const qY = offY(id, 2) * 0.7;
  const lX = offX(id, 3);
  const lY = offY(id, 3);
  const mX = offX(id, 4);
  const mY = offY(id, 4);

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
    return put(out, S.x, S.y, faceTo(pl.pantry.cx, pl.pantry.cy, S.h), standFrame(id, time), null, 'stand', false, qi);
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
    return put(out, S.x, S.y, aim(faceTo(q.cx + (qi % 2 ? -1 : 1) * q.rx * 0.5, q.cy - q.ry * 0.12, S.h)), standFrame(id, time), t < FEED_CRUMB_S ? 'crumb' : null, 'feed', false, qi);
  }
  t -= FEED_S;
  // 3: take an egg from her pile
  if (t < EGG_PICK_S) {
    at(eggRun, 0, qX, qY, lX, lY);
    return put(out, S.x, S.y, faceTo(q.cx, q.cy + q.ry * 0.5, S.h), standFrame(id, time), 'egg', 'stand', false, qi);
  }
  t -= EGG_PICK_S;
  // 4: carry it to the nearest larvae chamber
  if (t < w2) {
    const d = (t / w2) * eggRun.len;
    at(eggRun, d, qX, qY, lX, lY);
    return put(out, S.x, S.y, S.h, gait(d), 'egg', 'walk', false, qi);
  }
  t -= w2;
  // 5: put it down among the larvae
  if (t < EGG_PLACE_S) {
    at(eggRun, eggRun.len, qX, qY, lX, lY);
    return put(out, S.x, S.y, aim(faceTo(pl.egg.cx, pl.egg.cy - pl.egg.ry * 0.2, Math.PI / 2)), standFrame(id, time), t < EGG_PICK_S ? 'egg' : null, 'tend', false, qi);
  }
  t -= EGG_PLACE_S;
  // 5b: on to the spot where she tends the larvae (the other end of the same chamber when it is the same one)
  if (t < w2b) {
    const d = (t / w2b) * between.len;
    at(between, d, lX, lY, mX, mY);
    return put(out, S.x, S.y, S.h, gait(d), null, 'walk', false, qi);
  }
  t -= w2b;
  // 6: tend the larvae
  if (t < TEND_S) {
    at(between, between.len, lX, lY, mX, mY);
    return put(out, S.x, S.y, aim(faceTo(pl.tend.cx, pl.tend.cy - pl.tend.ry * 0.2, Math.PI / 2)), standFrame(id, time), null, 'tend', false, qi);
  }
  t -= TEND_S;
  // 7: back to the pantry
  const d = w3 > 0 ? Math.min(1, t / w3) * home.len : home.len;
  at(home, d, mX, mY, pX, pY);
  return put(out, S.x, S.y, S.h, gait(d), null, 'walk', false, qi);
}

// ---- entry point --------------------------------------------------------------------------------------------------------------------

/**
 * Pose of one nest ant at simulation time `time` (seconds). Pass `out` to reuse an object (nothing else is allocated).
 * An ant without a recognised kind is treated as an unloading forager; a layout without pantry and larvae chamber
 * parks everybody at the mouth of the shaft.
 */
export function nestAntPose(ant: NestAntLike, layout: NestLayout, time: number, out: NestPose = blank()): NestPose {
  const cr = crewFor(layout);
  const tm = Number.isFinite(time) ? time : 0;
  if (!cr) return put(out, layout.entrance.x, layout.entrance.y - MOUTH_RISE, Math.PI / 2, 0, null, 'stand', false, -1);
  if (ant.role === 'nurse' || ant.nestKind === 'nurse') return nursePose(ant, cr, tm, out);
  if (ant.nestKind === 'hatch') return hatchPose(ant, cr, tm, out);
  return unloadPose(ant, cr, tm, out);
}
