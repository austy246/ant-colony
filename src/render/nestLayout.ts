/**
 * Pure geometry of the underground "řez" (cross-section) view, in layout units (= fine pixels of the picture).
 *
 * The nest is dug at random but the same way for the same colony: `seed` fixes a complete plan of up to 18 chambers
 * (8 queens, 6 pantries, 4 larvae chambers), each placed one after the other in CHAMBER_ORDER by a seeded random process
 * (random branching point on the tunnel network, random digging direction and length, a curved tunnel, rejection sampling
 * against everything dug before it). A layout shows only as many of them as the colony needs, so chamber k always lies where
 * it lies and adding chamber k + 1 never moves anything. A chamber may branch only from the shaft or from tunnels that exist
 * whenever it exists (the first queen / larvae chamber / pantry and the chambers of its own kind with a lower index), so
 * every subset is connected. The size of a chamber follows its own load (ants, food in that pantry, larvae in that chamber);
 * its largest size is reserved when it is placed, so chambers never overlap however big they grow.
 * There is no bedroom: ants live on the surface and only walk through.
 *
 * Normal mode (`unbounded`) has no 6 / 4 limit: pantries and larvae chambers beyond the plan are dug into NEW area to the
 * right of and below the base picture, which grows by whole steps of NEST_STEP_W x NEST_STEP_H (see nestSceneSize). The new
 * area is a grid of NEST_STEP_W x NEST_STEP_H cells, one chamber per cell, handed out shell by shell (two pantries, then a
 * larvae chamber: the colony needs them in that ratio), so chamber k of a kind always gets the same cell however many of the
 * other kind there are. A "trunk" leaves the shaft through soil that the whole plan leaves free, down to the main gallery
 * below the base picture; straight, gently waving galleries run along the top and left edges of the cells and every new
 * chamber hangs from the gallery of its row. It sits in the rest of its cell, so nothing overlaps and nothing dug ever moves.
 */
import { createRng } from '../sim/rng';
import {
  LARVAE_PER_CHAMBER, MAX_LARVAE_CHAMBERS, MAX_NORMAL_LARVAE_CHAMBERS, MAX_NORMAL_PANTRIES, MAX_PANTRIES, PANTRY_CAPACITY,
} from '../sim/constants';
import type { Pt } from './nestGraph';

export type { Pt } from './nestGraph';
export type ChamberKind = 'queen' | 'larvae' | 'pantry';

/** One harmonic of the outline: radius factor += a * cos(k * angle + ph). */
export interface Lobe {
  k: number;
  a: number;
  ph: number;
}

/** Anything with an irregular outline: a base ellipse (rx, ry) times 1 + sum of the lobes, with a flat floor. */
export interface Blob {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  lobes: readonly Lobe[];
}

export interface Chamber extends Blob {
  id: string;
  kind: ChamberKind;
  /** Index within its kind (queen0, queen1, ...). */
  index: number;
  /** The largest size, reserved when the chamber was placed. */
  rxMax: number;
  ryMax: number;
  /** What drives the size: ants (queen), food in this pantry, larvae in this chamber. */
  load: number;
}

export interface Tunnel {
  /** Id of the chamber at the end, 'shaft' for the entrance shaft. */
  to: string;
  /** Mean width. */
  width: number;
  /** Polyline from the branching point (a point of another tunnel) to the centre of the chamber `to`, a point every ~2 units. */
  points: Pt[];
  /** Width (3..5) at each point. */
  widths: number[];
}

export interface NestLoads {
  ants: number;
  /** Food in each pantry (0..PANTRY_CAPACITY). */
  pantry: readonly number[];
  /** Larvae in each larvae chamber (0..LARVAE_PER_CHAMBER). */
  larvae: readonly number[];
}

export interface NestInput {
  seed: number;
  queens: number;
  pantries: number;
  larvaeChambers: number;
  loads: NestLoads;
  /** Loads that size the chambers (the peaks, so they never shrink); defaults to `loads`. `Chamber.load` always follows `loads`. */
  sizeLoads?: NestLoads;
  /** The base picture (320 x 200 in the game); a normal-mode nest grows beyond it, see `NestLayout.width / height`. */
  width: number;
  height: number;
  /**
   * Normal mode: any number of pantries and larvae chambers (up to the safety caps MAX_NORMAL_PANTRIES /
   * MAX_NORMAL_LARVAE_CHAMBERS); the ones beyond the plan are dug into new area and the scene grows (nestSceneSize).
   * Without it the counts are clamped to the plan (6 pantries, 4 larvae chambers) as in sandbox.
   */
  unbounded?: boolean;
}

export interface NestLayout {
  /** Size of the scene: the base picture, grown by whole steps in normal mode (nestSceneSize). */
  width: number;
  height: number;
  seed: number;
  /** Identifies the geometry (seed, area, counts); equal keys mean equal tunnels and chamber positions. */
  key: string;
  /** y of the ground line (everything above is surface). */
  surfaceY: number;
  entrance: Pt;
  chambers: Chamber[];
  /** The entrance shaft and the tunnel of every chamber: a tree rooted at the entrance. */
  tunnels: Tunnel[];
}

export const NEST_W = 320;
export const NEST_H = 200;
export const MAX_NEST_QUEENS = 8;
export const MAX_NEST_PANTRIES = MAX_PANTRIES;
export const MAX_NEST_LARVAE = MAX_LARVAE_CHAMBERS;
/** Larvae drawn in one chamber at most. */
export const MAX_SHOWN_LARVAE = LARVAE_PER_CHAMBER;
/** The scene of a normal-mode nest grows by whole steps of this many layout units (one shell of cells; 8 : 5 like the picture). */
export const NEST_STEP_W = 80;
export const NEST_STEP_H = 50;
/** Position of the flat floor relative to the centre, in units of ry. */
export const FLOOR = 0.68;

/**
 * Fixed generation order of the whole plan: the first queen, larvae chamber and pantry (every nest has them), then the other
 * queens (the biggest rooms get their space while there is plenty), then the rest of the pantries and larvae chambers in order
 * of need. The plan does not depend on how many chambers are needed right now, so the order only decides who finds room first.
 */
export const CHAMBER_ORDER: readonly { kind: ChamberKind; index: number }[] = (
  [
    ['queen', 0], ['larvae', 0], ['pantry', 0],
    ['larvae', 1], ['queen', 1], ['larvae', 2], ['queen', 2], ['larvae', 3], ['queen', 3], ['queen', 4], ['queen', 5], ['queen', 6], ['queen', 7],
    ['pantry', 1], ['pantry', 2], ['pantry', 3], ['pantry', 4], ['pantry', 5],
  ] as const
).map(([kind, index]) => ({ kind, index }));

const SURFACE_Y = 24;
/** Longest way (layout units) from the entrance to a chamber centre: a hatchling must walk it in 5 s at 80 units/s. */
const PATH_CAP = 300;
const FIRST_PANTRY_CAP = 105;
const NEAR_PANTRY_CAP = 125;

// ---- outline ---------------------------------------------------------------------------------------------------------------

const ampSum = (lobes: readonly Lobe[]): number => lobes.reduce((s, l) => s + Math.abs(l.a), 0);

/** Outline radius factor at an angle. */
export function lobeRadius(lobes: readonly Lobe[], angle: number): number {
  let r = 1;
  for (const l of lobes) r += l.a * Math.cos(l.k * angle + l.ph);
  return r;
}

/** True when (x, y) lies inside the blob grown by `pad` layout units. */
export function insideChamber(b: Blob, x: number, y: number, pad = 0): boolean {
  const dy = y - b.cy;
  if (dy > FLOOR * b.ry + pad) return false;
  const nx = (x - b.cx) / (b.rx + pad);
  const ny = dy / (b.ry + pad);
  const rho2 = nx * nx + ny * ny;
  const sum = ampSum(b.lobes);
  const hi = 1 + sum;
  if (rho2 > hi * hi) return false;
  const lo = 1 - sum;
  if (lo > 0 && rho2 < lo * lo) return true;
  const r = lobeRadius(b.lobes, Math.atan2(ny, nx));
  return rho2 <= r * r;
}

/** Half sizes of the box that holds the blob at its largest size. */
export function maxExtent(c: Blob & { rxMax?: number; ryMax?: number }): { rx: number; ry: number } {
  const a = 1 + ampSum(c.lobes);
  return { rx: (c.rxMax ?? c.rx) * a, ry: (c.ryMax ?? c.ry) * a };
}

// ---- the plan of the nest (depends on the seed only) -----------------------------------------------------------------------

interface Slot {
  id: string;
  kind: ChamberKind;
  index: number;
  cx: number;
  cy: number;
  rxMax: number;
  ryMax: number;
  rxMin: number;
  ryMin: number;
  lobes: Lobe[];
  tunnel: Tunnel;
  /** Owner of the tunnel it branches from (1 = the shaft) and the index of the branching point in it. */
  parentOwner: number;
  parentIdx: number;
}

interface Geometry {
  width: number;
  height: number;
  entrance: Pt;
  shaft: Tunnel;
  /** In CHAMBER_ORDER. */
  slots: Slot[];
}

interface Node {
  x: number;
  y: number;
  /** Way from the entrance along the tunnels. */
  d: number;
  owner: number;
  /** Index of the tunnel's slot in the plan (-1 for the shaft) and of this point in the tunnel. */
  slot: number;
  idx: number;
}

const mix = (seed: number, k: number): number => (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(k + 1, 0x85ebca6b)) >>> 0;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Wanted size of chamber `index` of a kind at full size (earlier chambers may be bigger: there is more room). */
function wantedSize(kind: ChamberKind, index: number, rng: () => number): { rx: number; ry: number; rxMin: number; ryMin: number } {
  let rx: number;
  let min: number;
  let lo: number;
  let hi: number;
  if (kind === 'queen') {
    rx = 27.5 - 0.3 * index;
    min = rx - 2.5;
    [lo, hi] = [0.58, 0.64];
  } else if (kind === 'pantry') {
    rx = 17.5 - 0.4 * index;
    min = rx * 0.6;
    [lo, hi] = [0.58, 0.7];
  } else {
    rx = 25.5 - 0.7 * index;
    min = rx * 0.68;
    [lo, hi] = [0.58, 0.66];
  }
  const aspect = lo + (hi - lo) * rng();
  return { rx, ry: rx * aspect, rxMin: min, ryMin: min * aspect };
}

function makeLobes(rng: () => number, small = false, gain = 1): Lobe[] {
  const ks = [1, 2, 3, 4];
  const n = 2 + (rng() < 0.45 ? 1 : 0);
  const out: Lobe[] = [];
  for (let i = 0; i < n; i++) {
    const k = ks.splice(Math.floor(rng() * ks.length), 1)[0];
    const a = (small ? 0.05 : 0.04 + 0.05 * rng()) * gain;
    out.push({ k, a: (a / Math.sqrt(k)) * (rng() < 0.5 ? -1 : 1), ph: rng() * Math.PI * 2 });
  }
  return out;
}

/** Catmull-Rom curve through the control points, resampled every ~2 units (first and last point exact). */
function curve(ctrl: readonly Pt[]): Pt[] {
  const dense: Pt[] = [];
  const n = ctrl.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)];
    const p1 = ctrl[i];
    const p2 = ctrl[i + 1];
    const p3 = ctrl[Math.min(n - 1, i + 2)];
    for (let s = 0; s < 14; s++) {
      const t = s / 14;
      const t2 = t * t;
      const t3 = t2 * t;
      dense.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  dense.push({ x: ctrl[n - 1].x, y: ctrl[n - 1].y });
  const out: Pt[] = [{ x: ctrl[0].x, y: ctrl[0].y }];
  const step = 2;
  let carried = 0;
  for (let i = 1; i < dense.length; i++) {
    let a = dense[i - 1];
    const b = dense[i];
    let seg = Math.hypot(b.x - a.x, b.y - a.y);
    while (seg > 1e-9 && carried + seg >= step) {
      const u = (step - carried) / seg;
      const p = { x: Math.round((a.x + (b.x - a.x) * u) * 100) / 100, y: Math.round((a.y + (b.y - a.y) * u) * 100) / 100 };
      out.push(p);
      a = p;
      seg = Math.hypot(b.x - a.x, b.y - a.y);
      carried = 0;
    }
    carried += seg;
  }
  const last = ctrl[n - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last.x - tail.x, last.y - tail.y) > 0.8) out.push({ x: last.x, y: last.y });
  else out[out.length - 1] = { x: last.x, y: last.y };
  return out;
}

/** Width 3..5 along a tunnel: a slow swell plus a small wiggle (half pixel steps). */
function widthsFor(n: number, base: number, ph1: number, ph2: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(clamp(Math.round((base + 0.75 * Math.sin(i / 3.4 + ph1) + 0.45 * Math.sin(i / 1.3 + ph2)) * 2) / 2, 3, 5));
  return out;
}

const meanOf = (a: readonly number[]): number => a.reduce((s, v) => s + v, 0) / a.length;

/** One try at the whole plan; throws when some chamber finds no room (the caller then tries again with another salt). */
/** Flag in the occupancy map: the cell belongs to a room (tunnel cells are plain owner numbers). */
const ROOM = 0x80;

function generateOnce(seed: number, W: number, H: number, salt: number): Geometry {
  const occ = new Uint8Array(W * H);
  const at = (x: number, y: number): number => {
    const ix = Math.round(x);
    const iy = Math.round(y);
    return ix < 0 || iy < 0 || ix >= W || iy >= H ? 255 : occ[iy * W + ix];
  };
  const stampDisc = (x: number, y: number, r: number, o: number): void => {
    for (let yy = Math.floor(y - r); yy <= Math.ceil(y + r); yy++) {
      for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H || (xx - x) ** 2 + (yy - y) ** 2 > r * r) continue;
        if (occ[yy * W + xx] === 0) occ[yy * W + xx] = o;
      }
    }
  };
  /** Stamps the blob grown by `pad`. */
  const stampBlob = (b: Blob, pad: number, o: number): void => {
    const e = maxExtent(b);
    for (let yy = Math.floor(b.cy - e.ry - pad); yy <= Math.ceil(b.cy + e.ry + pad); yy++) {
      for (let xx = Math.floor(b.cx - e.rx - pad); xx <= Math.ceil(b.cx + e.rx + pad); xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H || !insideChamber(b, xx + 0.5, yy + 0.5, pad)) continue;
        if (occ[yy * W + xx] === 0) occ[yy * W + xx] = o | ROOM;
      }
    }
  };
  /** Is the area under the blob unclaimed (and inside the nest)? */
  const blobFree = (b: Blob): boolean => {
    const e = maxExtent(b);
    if (b.cx - e.rx < 5 || b.cx + e.rx > W - 5 || b.cy - e.ry < SURFACE_Y + 12 || b.cy + e.ry > H - 5) return false;
    // quick rejects first: the centre and eight points around it
    if (at(b.cx, b.cy) !== 0) return false;
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      if (at(b.cx + Math.cos(a) * b.rx * 0.8, b.cy + Math.sin(a) * b.ry * 0.8) !== 0) return false;
    }
    for (let yy = Math.floor(b.cy - e.ry); yy <= Math.ceil(b.cy + e.ry); yy++) {
      for (let xx = Math.floor(b.cx - e.rx); xx <= Math.ceil(b.cx + e.rx); xx++) {
        if (insideChamber(b, xx + 0.5, yy + 0.5, 0.5) && at(xx, yy) !== 0) return false;
      }
    }
    return true;
  };
  const nodes: Node[] = [];
  const nodeKeys = new Set<string>();
  const keyOf = (p: Pt): string => `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`;
  const entrance: Pt = { x: Math.round(W / 2), y: SURFACE_Y };

  /** Can the tunnel be dug? Every point (and the walls beside it) must be unclaimed, except near its start inside the parent's own zone. */
  const tunnelFree = (pts: readonly Pt[], ws: readonly number[], parentOwner: number, minY: number): boolean => {
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.x < 5 || p.x > W - 5 || p.y < minY || p.y > H - 5) return false;
      const r = ws[i] / 2 + 1.2;
      const near = i * 2 <= 16;
      for (let k = 0; k < 5; k++) {
        const v = k === 0 ? at(p.x, p.y) : at(p.x + (k === 1 ? r : k === 2 ? -r : 0), p.y + (k === 3 ? r : k === 4 ? -r : 0));
        if (v !== 0 && !(near && (v & ROOM) === 0 && (v === parentOwner || (p.x - pts[0].x) ** 2 + (p.y - pts[0].y) ** 2 < 49))) return false;
      }
    }
    return true;
  };

  /** Control points of a curved tunnel from P to C: 2..4 points pushed sideways by a random amount. */
  const bend = (rng: () => number, P: Pt, C: Pt, many: number): Pt[] => {
    const L = Math.hypot(C.x - P.x, C.y - P.y) || 1;
    const nx = -(C.y - P.y) / L;
    const ny = (C.x - P.x) / L;
    const n = Math.min(4, many + Math.floor(rng() * 2));
    const ctrl: Pt[] = [P];
    let sign = rng() < 0.5 ? -1 : 1;
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      const off = sign * (0.35 + 0.65 * rng()) * Math.min(7, 0.12 * L) * Math.sin(Math.PI * t);
      if (rng() < 0.7) sign = -sign;
      ctrl.push({ x: P.x + (C.x - P.x) * t + nx * off, y: P.y + (C.y - P.y) * t + ny * off });
    }
    ctrl.push(C);
    return ctrl;
  };

  const lengthOf = (pts: readonly Pt[]): number => {
    let s = 0;
    for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return s;
  };

  const addNodes = (pts: readonly Pt[], d0: number, owner: number, slot: number, skip: (p: Pt) => boolean): void => {
    let d = d0;
    for (let i = 0; i < pts.length; i++) {
      if (i > 0) d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (i > 0) nodeKeys.add(keyOf(pts[i]));
      if (i > 0 && !skip(pts[i])) nodes.push({ x: pts[i].x, y: pts[i].y, d, owner, slot, idx: i });
    }
  };

  // ---- the shaft
  const srng = createRng(mix(seed, 1 + salt * 1000));
  // the shaft is a long winding main gallery; only the part that the needed chambers branch from is shown
  const bottom = 150 + Math.floor(srng() * 30);
  const shaftCtrl: Pt[] = [{ x: entrance.x, y: SURFACE_Y }, { x: entrance.x + Math.round((srng() - 0.5) * 8), y: SURFACE_Y + 24 }];
  const legs = 5;
  let sx = entrance.x;
  for (let i = 1; i <= legs; i++) {
    sx = clamp(sx + Math.round((srng() - 0.5) * 110), 40, W - 40);
    shaftCtrl.push({ x: sx, y: Math.round(SURFACE_Y + 24 + ((bottom - SURFACE_Y - 24) * i) / legs) });
  }
  const shaftPts = curve(shaftCtrl);
  const shaftW = widthsFor(shaftPts.length, 4.4, srng() * 6, srng() * 6).map((w) => clamp(w + 0.5, 4, 5));
  const shaft: Tunnel = { to: 'shaft', width: meanOf(shaftW), points: shaftPts, widths: shaftW };
  const SHAFT_OWNER = 1;
  shaftPts.forEach((p, i) => stampDisc(p.x, p.y, shaftW[i] / 2 + 1.2, SHAFT_OWNER));
  shaftPts.forEach((p, i) => i === 0 && nodes.push({ x: p.x, y: p.y, d: 0, owner: SHAFT_OWNER, slot: -1, idx: 0 }));
  addNodes(shaftPts, 0, SHAFT_OWNER, -1, () => false);

  const slotOwner = (s: number): number => 2 + s;
  const slots: Slot[] = [];

  // ---- the chambers
  const SCALES = [1, 0.94, 0.88, 0.82, 0.76, 0.7, 0.64, 0.58, 0.52];
  CHAMBER_ORDER.forEach((spec, s) => {
    const rng = createRng(mix(seed, 100 + s + salt * 1000));
    const owner = slotOwner(s);
    const lobes = makeLobes(rng, false, spec.kind === 'queen' ? 0.7 : 1);
    const want = wantedSize(spec.kind, spec.index, rng);
    const amp = 1 + ampSum(lobes);
    // a chamber may branch only from tunnels that exist whenever it exists: the shaft, the first three chambers, its own kind's earlier ones
    const allowed = new Set<number>([SHAFT_OWNER, slotOwner(0), slotOwner(1), slotOwner(2)]);
    CHAMBER_ORDER.forEach((o, k) => {
      if (k < s && o.kind === spec.kind) allowed.add(slotOwner(k));
    });
    const parents = nodes.filter((n) => allowed.has(n.owner) && n.y >= SURFACE_Y + 14);
    type Cand = { cx: number; cy: number; scale: number; pts: Pt[]; ws: number[]; par: Node; score: number };
    let placed: Cand | null = null;
    let found = 0;
    let wanted = 8;

    /** Builds the tunnel to a candidate spot; a valid one is scored by how snugly it sits among what is already dug. */
    const attempt = (scale: number, par0: Node, th: number, L: number, cap: number): boolean => {
      const cx = Math.round(par0.x + Math.cos(th) * L);
      const cy = Math.round(par0.y + Math.sin(th) * L);
      const blob = { cx, cy, rx: want.rx * scale, ry: want.ry * scale, lobes };
      if (!blobFree(blob)) return false;
      // dig from one of the galleries nearest to the spot
      const near: { n: Node; d: number }[] = [];
      for (const n of parents) {
        const d = (n.x - cx) ** 2 + (n.y - cy) ** 2;
        if (d < 90000) near.push({ n, d });
      }
      near.sort((u, v) => u.d - v.d);
      const tried: Node[] = [];
      for (const { n: par } of near) {
        if (insideChamber(blob, par.x, par.y, 3)) continue;
        // one try per gallery (nodes are every 2 units: skip the neighbours of a node already tried)
        if (tried.some((t) => (t.x - par.x) ** 2 + (t.y - par.y) ** 2 < 100 && t.owner === par.owner)) continue;
        tried.push(par);
        if (tried.length > 3) break;
        // keep a branching point clear of other tunnels
        let clear = true;
        for (let k = 0; k < 8 && clear; k++) {
          const v = at(par.x + Math.cos(k * 0.785) * 5, par.y + Math.sin(k * 0.785) * 5);
          if (v !== 0 && (v & ROOM) === 0 && v !== par.owner) clear = false;
        }
        if (!clear) continue;
        const P = { x: par.x, y: par.y };
        const pts = curve(bend(rng, P, { x: cx, y: cy }, 2));
        const len = lengthOf(pts);
        if (par.d + len > cap) continue;
        const ws = widthsFor(pts.length, 3.2 + rng() * 1.6, rng() * 6, rng() * 6);
        if (!tunnelFree(pts, ws, par.owner, SURFACE_Y + 10)) continue;
        if (pts.some((pt, i) => i > 0 && nodeKeys.has(keyOf(pt)))) continue;
        const score = -len + rng() * 6;
        found++;
        if (!placed || score > placed.score) placed = { cx, cy, scale, pts, ws, par, score };
        return found >= wanted;
      }
      return false;
    };

    const capFor = (scaleIdx: number): number => {
      if (spec.kind !== 'pantry') return spec.kind === 'larvae' ? PATH_CAP - 15 : PATH_CAP - 5;
      if (scaleIdx <= 1) return spec.index === 0 ? FIRST_PANTRY_CAP : NEAR_PANTRY_CAP;
      return spec.index === 0 ? FIRST_PANTRY_CAP + 25 : PATH_CAP - 15;
    };

    outer: for (let si = 0; si < SCALES.length; si++) {
      const scale = SCALES[si];
      const cap = capFor(si);
      wanted = 8;
      for (let a = 0; a < 60; a++) {
        const par = parents[Math.floor(rng() * parents.length)];
        const th = Math.PI * (rng() * 1.15 - 0.075);
        const rad = Math.hypot(want.rx * Math.cos(th), want.ry * Math.sin(th)) * scale * amp;
        const L = rad + 5 + rng() * rng() * 90;
        if (attempt(scale, par, th, L, cap)) break outer;
      }
      if (placed) break;
    }
    if (!placed) {
      const err = new Error(`nestLayout: no room for ${spec.kind}${spec.index} (seed ${seed})`);
      throw err;
    }
    const pl = placed as Cand;

    const rxMax = want.rx * pl.scale;
    const ryMax = want.ry * pl.scale;
    const id = `${spec.kind}${spec.index}`;
    const tunnel: Tunnel = { to: id, width: meanOf(pl.ws), points: pl.pts, widths: pl.ws };
    slots.push({
      id,
      kind: spec.kind,
      index: spec.index,
      cx: pl.cx,
      cy: pl.cy,
      rxMax,
      ryMax,
      rxMin: Math.min(want.rxMin, rxMax * 0.9),
      ryMin: Math.min(want.ryMin, ryMax * 0.9),
      lobes,
      tunnel,
      parentOwner: pl.par.owner,
      parentIdx: pl.par.idx,
    });
    const ex = rxMax * amp + 1;
    const ey = ryMax * amp + 1;
    pl.pts.forEach((p, i) => stampDisc(p.x, p.y, pl.ws[i] / 2 + 1.2, owner));
    stampBlob({ cx: pl.cx, cy: pl.cy, rx: rxMax, ry: ryMax, lobes }, 2.2, owner);
    addNodes(pl.pts, pl.par.d, owner, s, (p) => ((p.x - pl.cx) / ex) ** 2 + ((p.y - pl.cy) / ey) ** 2 <= 1);
  });

  return { width: W, height: H, entrance, shaft, slots };
}

function generate(seed: number, W: number, H: number): Geometry {
  for (let salt = 0; ; salt++) {
    try {
      return generateOnce(seed, W, H, salt);
    } catch (e) {
      if (salt >= 200) throw e;
    }
  }
}

// ---- memoised plans and subsets ---------------------------------------------------------------------------------------------

const planCache = new Map<string, Geometry>();
function plan(seed: number, W: number, H: number): Geometry {
  const key = `${seed}|${W}x${H}`;
  let g = planCache.get(key);
  if (!g) {
    g = generate(seed, W, H);
    if (planCache.size >= 300) planCache.delete(planCache.keys().next().value as string);
    planCache.set(key, g);
  }
  return g;
}

interface Subset {
  key: string;
  slots: Slot[];
  tunnels: Tunnel[];
}
const subsetCache = new Map<string, Subset>();

const whole = (v: number, def: number): number => (Number.isFinite(v) ? Math.round(v) : def);
const num = (v: number | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0);

// ---- normal mode: the nest grows into new area -------------------------------------------------------------------------------

/**
 * The grid of the new area, in cells of NEST_STEP_W x NEST_STEP_H: cell (j, r) has its top-left corner at
 * (baseW + j * NEST_STEP_W, baseH + r * NEST_STEP_H). The base picture is j < 0 and r < 0; the cells right of it (j >= 0,
 * r < 0) start at y >= 50, well below the soil line. Shell s (s >= 1) is everything with max(j, r) = s - 1, and the scene
 * after s steps is (baseW + s * NEST_STEP_W) x (baseH + s * NEST_STEP_H).
 */
interface Grid {
  baseW: number;
  baseH: number;
  /** Columns below the base picture (j = -left .. -1) and rows right of it (r = -up .. -1). */
  left: number;
  up: number;
}

const gridOf = (baseW: number, baseH: number): Grid => ({
  baseW,
  baseH,
  left: Math.floor(baseW / NEST_STEP_W),
  up: Math.max(0, Math.floor((baseH - 50) / NEST_STEP_H)),
});

/** The new area needs at least one column below the base picture (the trunk comes down there). */
const canGrow = (g: Grid): boolean => g.left >= 1;

/** Cells of shell s: the new column (top to bottom), then the new row (right to left). */
const shellCells = (g: Grid, s: number): number => 2 * s + g.up + g.left - 1;

/** Cell and shell of the n-th cell of the new area (shell by shell). */
function cellAt(gr: Grid, n: number): { j: number; r: number; shell: number } {
  let s = 1;
  let k = n;
  while (k >= shellCells(gr, s)) k -= shellCells(gr, s++);
  const column = s + gr.up;
  if (k < column) return { j: s - 1, r: -gr.up + k, shell: s };
  return { j: s - 2 - (k - column), r: s - 1, shell: s };
}

type Grown = 'pantry' | 'larvae';

/** Index of the cell of a new chamber (`extra` = its index minus the planned ones): pantries get two cells of every three. */
const cellIndex = (kind: Grown, extra: number): number => (kind === 'larvae' ? 3 * extra + 2 : 3 * Math.floor(extra / 2) + (extra % 2));

const countIn = (v: number, max: number): number => clamp(whole(v, 1), 1, max);

/**
 * Size of the scene of a normal-mode nest with this many pantries and larvae chambers: the base picture grown by `step`
 * whole steps of NEST_STEP_W x NEST_STEP_H, just enough for the cells of every chamber beyond the plan. Never shrinks when a
 * count grows. Counts are clamped as nestLayout clamps them.
 */
export function nestSceneSize(pantries: number, larvaeChambers: number, baseW = NEST_W, baseH = NEST_H): { width: number; height: number; step: number } {
  const gr = gridOf(baseW, baseH);
  if (!canGrow(gr)) return { width: baseW, height: baseH, step: 0 };
  const pe = countIn(pantries, MAX_NORMAL_PANTRIES) - MAX_NEST_PANTRIES;
  const le = countIn(larvaeChambers, MAX_NORMAL_LARVAE_CHAMBERS) - MAX_NEST_LARVAE;
  const last = Math.max(pe > 0 ? cellIndex('pantry', pe - 1) : -1, le > 0 ? cellIndex('larvae', le - 1) : -1);
  const step = last < 0 ? 0 : cellAt(gr, last).shell;
  return { width: baseW + step * NEST_STEP_W, height: baseH + step * NEST_STEP_H, step };
}

interface Extension {
  /** From point `from` of the shaft to the main gallery, ending at (xE, baseH + 6). */
  trunk: Pt[];
  from: number;
  xE: number;
  /** The new chambers of each kind, made on demand and in order (chamber index = MAX_NEST_* + position). */
  slots: Record<Grown, Slot[]>;
  /** Keys of every point on the ways to the new chambers made so far, per kind (a new chamber branches from them). */
  seen: Record<Grown, Set<string>>;
}

const extCache = new Map<string, Extension>();
const ptKey = (p: Pt): string => `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`;

/** Points every ~2 units along straight segments through the control points (every control point is kept exactly). */
function straight(ctrl: readonly Pt[]): Pt[] {
  const out: Pt[] = [{ x: ctrl[0].x, y: ctrl[0].y }];
  for (let i = 1; i < ctrl.length; i++) {
    const a = ctrl[i - 1];
    const b = ctrl[i];
    const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 2));
    for (let k = 1; k < n; k++) out.push({ x: Math.round((a.x + ((b.x - a.x) * k) / n) * 100) / 100, y: Math.round((a.y + ((b.y - a.y) * k) / n) * 100) / 100 });
    out.push({ x: b.x, y: b.y });
  }
  return out;
}

/**
 * The trunk from the shaft to the main gallery: a shortest way (BFS) through soil that no chamber or tunnel of the WHOLE plan
 * claims (so no chamber that appears later is in its way). It leaves the base picture straight down a "chute" at the left
 * edge of one of the cell columns below it. Depends on the plan only.
 */
function digTrunk(g: Geometry, gr: Grid): { pts: Pt[]; from: number; xE: number } {
  const W = gr.baseW;
  const H = gr.baseH;
  const HB = H + 7;
  const occ = new Uint8Array(W * HB);
  const mark = (x: number, y: number, v: number): void => {
    if (x >= 0 && y >= 0 && x < W && y < HB && occ[y * W + x] === 0) occ[y * W + x] = v;
  };
  const disc = (p: Pt, r: number, v: number): void => {
    for (let yy = Math.floor(p.y - r); yy <= Math.ceil(p.y + r); yy++) {
      for (let xx = Math.floor(p.x - r); xx <= Math.ceil(p.x + r); xx++) if ((xx - p.x) ** 2 + (yy - p.y) ** 2 <= r * r) mark(xx, yy, v);
    }
  };
  // 3 = a room (at its largest size, with the gap the plan keeps), 1 = the shaft, 2 = another tunnel
  for (const s of g.slots) {
    const b = { cx: s.cx, cy: s.cy, rx: s.rxMax, ry: s.ryMax, lobes: s.lobes };
    const e = maxExtent(b);
    for (let yy = Math.floor(b.cy - e.ry - 3); yy <= Math.ceil(b.cy + e.ry + 3); yy++) {
      for (let xx = Math.floor(b.cx - e.rx - 3); xx <= Math.ceil(b.cx + e.rx + 3); xx++) if (insideChamber(b, xx + 0.5, yy + 0.5, 2.2)) mark(xx, yy, 3);
    }
  }
  g.shaft.points.forEach((p, i) => disc(p, g.shaft.widths[i] / 2 + 1.2, 1));
  for (const s of g.slots) s.tunnel.points.forEach((p, i) => disc(p, s.tunnel.widths[i] / 2 + 1.2, 2));
  const chutes: number[] = [];
  for (let j = -gr.left; j < 0; j++) chutes.push(W + j * NEST_STEP_W + 5);
  const inChute = (x: number): boolean => chutes.some((c) => Math.abs(x - c) <= 1);
  /** 1 where the trunk's centre may not be: closer than `pad` to a room (and to any tunnel unless `tunnels` is false). */
  const blockedMap = (pad: number, tunnels: boolean): Uint8Array => {
    const out = new Uint8Array(W * HB);
    for (let y = 0; y < HB; y++) {
      for (let x = 0; x < W; x++) {
        const v = occ[y * W + x];
        if (v === 0 || (!tunnels && v !== 3)) continue;
        for (let yy = Math.max(0, y - pad); yy <= Math.min(HB - 1, y + pad); yy++) out.fill(1, yy * W + Math.max(0, x - pad), yy * W + Math.min(W - 1, x + pad) + 1);
      }
    }
    return out;
  };
  // where the trunk may join the shaft: within 7 units of a shaft point deep enough (the deepest such point wins)
  const join = new Int32Array(W * HB).fill(-1);
  g.shaft.points.forEach((p, i) => {
    if (i < 3 || p.y < SURFACE_Y + 20) return;
    for (let yy = Math.floor(p.y - 7); yy <= Math.ceil(p.y + 7); yy++) {
      for (let xx = Math.floor(p.x - 7); xx <= Math.ceil(p.x + 7); xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= HB || (xx - p.x) ** 2 + (yy - p.y) ** 2 > 49) continue;
        if (join[yy * W + xx] < i) join[yy * W + xx] = i;
      }
    }
  });
  /** The straight hop from a cell to its shaft point crosses nothing but the shaft. */
  const hopFree = (x: number, y: number, p: Pt): boolean => {
    const n = Math.max(1, Math.ceil(Math.hypot(p.x - x, p.y - y)));
    for (let k = 0; k <= n; k++) {
      const v = occ[Math.round(y + ((p.y - y) * k) / n) * W + Math.round(x + ((p.x - x) * k) / n)];
      if (v !== 0 && v !== 1) return false;
    }
    return true;
  };
  const search = (blocked: Uint8Array): { pts: Pt[]; from: number; xE: number } | null => {
    const prev = new Int32Array(W * HB).fill(-2);
    const queue: number[] = [];
    for (const c of chutes) {
      prev[(H + 6) * W + c] = -1;
      queue.push((H + 6) * W + c);
    }
    const free = (x: number, y: number): boolean => {
      if (x < 3 || x >= W - 3 || y < SURFACE_Y + 12 || y >= HB) return false;
      if (y >= H - 4) return inChute(x) && (y >= H || blocked[y * W + x] === 0);
      return blocked[y * W + x] === 0;
    };
    for (let qi = 0; qi < queue.length; qi++) {
      const i = queue[qi];
      const x = i % W;
      const y = (i - x) / W;
      const at = join[i];
      if (at >= 0 && y < H - 4 && hopFree(x, y, g.shaft.points[at])) {
        // walk back to the chute; pull the staircase of cells tight (the farthest cell in sight, again and again)
        const cells: Pt[] = [];
        for (let k = i; k >= 0; k = prev[k]) cells.push({ x: k % W, y: Math.floor(k / W) });
        const sight = (a: Pt, b: Pt): boolean => {
          const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2);
          for (let k = 1; k < n; k++) if (!free(Math.round(a.x + ((b.x - a.x) * k) / n), Math.round(a.y + ((b.y - a.y) * k) / n))) return false;
          return true;
        };
        const ctrl: Pt[] = [g.shaft.points[at], cells[0]];
        for (let a = 0; a < cells.length - 1; ) {
          let b = cells.length - 1;
          while (b > a + 1 && !sight(cells[a], cells[b])) b--;
          ctrl.push(cells[b]);
          a = b;
        }
        // a smooth curve through the corners when it stays in the free soil, else the straight pieces
        const smooth = curve(ctrl);
        const ok = smooth.every((p, k) => k < 4 || free(Math.round(p.x), Math.round(p.y)));
        const end = cells[cells.length - 1];
        return { pts: ok ? smooth : straight(ctrl), from: at, xE: end.x };
      }
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (!free(nx, ny) || prev[ny * W + nx] !== -2) continue;
        prev[ny * W + nx] = i;
        queue.push(ny * W + nx);
      }
    }
    return null;
  };
  const found = search(blockedMap(4, true)) ?? search(blockedMap(2, true)) ?? search(blockedMap(3, false));
  if (found) return found;
  // no free way at all (never seen): straight down from the bottom of the shaft to the nearest chute
  const last = g.shaft.points.length - 1;
  const p = g.shaft.points[last];
  const xE = chutes.reduce((b, c) => (Math.abs(c - p.x) < Math.abs(b - p.x) ? c : b), chutes[0]);
  return { pts: straight([p, { x: xE, y: p.y }, { x: xE, y: H + 6 }]), from: last, xE };
}

function extensionFor(seed: number, g: Geometry, gr: Grid): Extension {
  const key = `${seed}|${gr.baseW}x${gr.baseH}`;
  let e = extCache.get(key);
  if (!e) {
    const t = digTrunk(g, gr);
    e = { trunk: t.pts, from: t.from, xE: t.xE, slots: { pantry: [], larvae: [] }, seen: { pantry: new Set(), larvae: new Set() } };
    if (extCache.size >= 40) extCache.delete(extCache.keys().next().value as string);
    extCache.set(key, e);
  }
  return e;
}

/** Width of a gallery at a point (3.5..5, a slow swell): the same for every way that passes that point. */
const galleryWidth = (p: Pt, ph: number): number => clamp(Math.round((4.3 + 0.6 * Math.sin(p.x / 4.1 + p.y / 6.3 + ph)) * 2) / 2, 3.5, 5);

/** Control points of the short drop from a gallery into a chamber: the middle pushed a little sideways. */
function dropCtrl(rng: () => number, P: Pt, C: Pt): Pt[] {
  const L = Math.hypot(C.x - P.x, C.y - P.y) || 1;
  const off = (rng() - 0.5) * Math.min(4, 0.12 * L);
  return [P, { x: Math.round((P.x + C.x) / 2 - ((C.y - P.y) / L) * off), y: Math.round((P.y + C.y) / 2 + ((C.x - P.x) / L) * off) }, C];
}

/** Makes the next new chamber of a kind (in order: each one may branch from the ways to the earlier ones of its kind). */
function growSlot(seed: number, gr: Grid, e: Extension, kind: Grown): void {
  const list = e.slots[kind];
  const extra = list.length;
  const index = (kind === 'pantry' ? MAX_NEST_PANTRIES : MAX_NEST_LARVAE) + extra;
  const n = cellIndex(kind, extra);
  const cell = cellAt(gr, n);
  const x0 = gr.baseW + cell.j * NEST_STEP_W;
  const y0 = gr.baseH + cell.r * NEST_STEP_H;
  const rng = createRng(mix(seed, 100000 + n));
  const lobes = makeLobes(rng);
  // a little smaller than the planned chambers: the cell is the limit
  const rxMax = kind === 'larvae' ? 21 : 15;
  const [lo, hi] = kind === 'larvae' ? [0.58, 0.66] : [0.58, 0.7];
  const aspect = lo + (hi - lo) * rng();
  const ryMax = rxMax * aspect;
  const minF = kind === 'larvae' ? 0.68 : 0.6;
  const amp = 1 + ampSum(lobes);
  // the room and its rim keep clear of the galleries along the top and left edges of its cell and of the next cells
  const ex = rxMax * amp + 2.5;
  const pick = (a: number, b: number): number => Math.round(b < a ? (a + b) / 2 : a + (b - a) * rng());
  const cx = pick(Math.ceil(x0 + 13 + ex), Math.floor(x0 + NEST_STEP_W - 2 - ex));
  const cy = pick(Math.ceil(y0 + 14 + ryMax * amp + 2.5), Math.floor(y0 + NEST_STEP_H - 2 - FLOOR * ryMax - 2.5));

  // the way: trunk, main gallery, the gallery of the row (down / up a side gallery first), then the drop into the chamber
  const yG = gr.baseH + 6;
  const xE = e.xE;
  const xR = gr.baseW + 5;
  // gentle waves (at most 2 units, within the edge bands of the cells) that are 0 at every junction, so the ways to
  // different chambers share their points exactly
  const hy = (row: number, x: number): number => {
    const u = x - xE;
    return gr.baseH + row * NEST_STEP_H + 6 + Math.round(2.2 * Math.sin((Math.PI * u) / 40) * (0.6 + 0.4 * Math.sin(u / 89 + row * 1.7 + seed)));
  };
  const vx = (xc: number, y: number): number => {
    const v = y - yG;
    return xc + Math.round(1.8 * Math.sin((Math.PI * v) / 25) * (0.6 + 0.4 * Math.sin(v / 37 + xc + seed)));
  };
  const path: Pt[] = [...e.trunk];
  const add = (p: Pt): void => {
    const last = path[path.length - 1];
    if (last.x !== p.x || last.y !== p.y) path.push(p);
  };
  const along = (row: number, from: number, to: number): void => {
    for (let x = from; ; x += to > from ? 2 : -2) {
      add({ x, y: hy(row, x) });
      if (x === to) break;
    }
  };
  const vertical = (xc: number, from: number, to: number): void => {
    for (let y = from; ; y += to > from ? 2 : -2) {
      add({ x: vx(xc, y), y });
      if (y === to) break;
    }
  };
  const xd = xE + 2 * Math.round((cx - xE) / 2);
  const yRow = gr.baseH + cell.r * NEST_STEP_H + 6;
  if (cell.r === 0) along(0, xE, xd);
  else if (cell.r > 0) {
    vertical(xE, yG, yRow);
    along(cell.r, xE, xd);
  } else {
    along(0, xE, xR);
    vertical(xR, yG, yRow);
    along(cell.r, xR, xd);
  }
  const gallery = path.length;
  const drop = curve(dropCtrl(rng, path[gallery - 1], { x: cx, y: cy }));
  for (let i = 1; i < drop.length; i++) path.push(drop[i]);
  const ph = (Math.abs(seed) % 1000) / 159;
  const dw = widthsFor(drop.length, 3.4 + rng() * 1.2, rng() * 6, rng() * 6);
  const widths = path.map((p, i) => (i < gallery ? galleryWidth(p, ph) : dw[i - gallery + 1]));

  // branch from the deepest point that the ways to the earlier new chambers of this kind reach (the first one: the shaft)
  const seen = e.seen[kind];
  let k = 0;
  while (k + 1 < path.length && seen.has(ptKey(path[k + 1]))) k++;
  for (const p of path) seen.add(ptKey(p));
  const pts = path.slice(k);
  const ws = widths.slice(k);
  const id = `${kind}${index}`;
  list.push({
    id,
    kind,
    index,
    cx,
    cy,
    rxMax,
    ryMax,
    rxMin: rxMax * minF,
    ryMin: ryMax * minF,
    lobes,
    tunnel: { to: id, width: meanOf(ws), points: pts, widths: ws },
    parentOwner: k === 0 ? 1 : 0,
    parentIdx: k === 0 ? e.from : -1,
  });
}

export function nestLayout(inp: NestInput): NestLayout {
  const W = Number.isFinite(inp.width) && inp.width > 0 ? inp.width : NEST_W;
  const H = Number.isFinite(inp.height) && inp.height > 0 ? inp.height : NEST_H;
  const seed = Number.isFinite(inp.seed) ? inp.seed | 0 : 0;
  const gr = gridOf(W, H);
  const grows = inp.unbounded === true && canGrow(gr);
  const q = clamp(whole(inp.queens, 1), 1, MAX_NEST_QUEENS);
  const p = countIn(inp.pantries, grows ? MAX_NORMAL_PANTRIES : MAX_NEST_PANTRIES);
  const l = countIn(inp.larvaeChambers, grows ? MAX_NORMAL_LARVAE_CHAMBERS : MAX_NEST_LARVAE);
  const g = plan(seed, W, H);
  const scene = grows ? nestSceneSize(p, l, W, H) : { width: W, height: H, step: 0 };
  // the scene size is part of the key once the nest grew (before, it is the base picture that the key names already)
  const key = `${seed}|${W}x${H}|${q}.${p}.${l}${scene.step > 0 ? `|${scene.width}x${scene.height}` : ''}`;
  let sub = subsetCache.get(key);
  if (!sub) {
    const slots = g.slots.filter((x) => x.index < (x.kind === 'queen' ? q : x.kind === 'pantry' ? p : l));
    if (p > MAX_NEST_PANTRIES || l > MAX_NEST_LARVAE) {
      const e = extensionFor(seed, g, gr);
      while (e.slots.pantry.length < p - MAX_NEST_PANTRIES) growSlot(seed, gr, e, 'pantry');
      while (e.slots.larvae.length < l - MAX_NEST_LARVAE) growSlot(seed, gr, e, 'larvae');
      slots.push(...e.slots.pantry.slice(0, Math.max(0, p - MAX_NEST_PANTRIES)), ...e.slots.larvae.slice(0, Math.max(0, l - MAX_NEST_LARVAE)));
    }
    // the shaft is dug only as deep as the deepest branching point of a needed chamber
    let deep = 1;
    for (const x of slots) if (x.parentOwner === 1) deep = Math.max(deep, x.parentIdx);
    const shaft: Tunnel = { ...g.shaft, points: g.shaft.points.slice(0, deep + 1), widths: g.shaft.widths.slice(0, deep + 1) };
    sub = { key, slots, tunnels: [shaft, ...slots.map((x) => x.tunnel)] };
    if (subsetCache.size >= 40) subsetCache.delete(subsetCache.keys().next().value as string);
    subsetCache.set(key, sub);
  }
  const ants = num(inp.loads?.ants);
  const sz = inp.sizeLoads ?? inp.loads;
  const antF = Math.min(1, Math.sqrt(num(sz?.ants)) / 12);
  const chambers: Chamber[] = sub.slots.map((s) => {
    let load: number;
    let f: number;
    if (s.kind === 'queen') {
      load = ants;
      f = antF;
    } else if (s.kind === 'pantry') {
      load = Math.min(PANTRY_CAPACITY, num(inp.loads?.pantry?.[s.index]));
      f = Math.sqrt(Math.min(PANTRY_CAPACITY, num(sz?.pantry?.[s.index])) / PANTRY_CAPACITY);
    } else {
      load = Math.min(LARVAE_PER_CHAMBER, num(inp.loads?.larvae?.[s.index]));
      f = Math.sqrt(Math.min(LARVAE_PER_CHAMBER, num(sz?.larvae?.[s.index])) / LARVAE_PER_CHAMBER);
    }
    return {
      id: s.id,
      kind: s.kind,
      index: s.index,
      cx: s.cx,
      cy: s.cy,
      rx: s.rxMin + (s.rxMax - s.rxMin) * f,
      ry: s.ryMin + (s.ryMax - s.ryMin) * f,
      rxMax: s.rxMax,
      ryMax: s.ryMax,
      lobes: s.lobes,
      load,
    };
  });
  return { width: scene.width, height: scene.height, seed, key: sub.key, surfaceY: SURFACE_Y, entrance: g.entrance, chambers, tunnels: sub.tunnels,  };
}

/**
 * Exponential smoothing step: moves `current` towards `target` by 1 - e^(-rate*dt). Never overshoots, dt = 0 stays,
 * a huge dt is clamped, and non-finite input degrades to the nearest sane value instead of poisoning the display.
 */
export function smoothToward(current: number, target: number, dt: number, rate: number): number {
  if (!Number.isFinite(target)) return Number.isFinite(current) ? current : 0;
  if (!Number.isFinite(current)) return target;
  const d = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 10) : 0;
  const r = Number.isFinite(rate) ? Math.min(Math.max(rate, 0), 1e3) : 1e3;
  const k = 1 - Math.exp(-r * d);
  const v = current + (target - current) * k;
  return Math.abs(target - v) < 1e-3 ? target : v;
}
