/**
 * Pure geometry of the underground "řez" (cross-section) view, in layout units (= fine pixels of the picture).
 * Chamber POSITIONS are fixed slots (they never move when something grows); only the radii follow the colony:
 * queen chambers with the ants, the larvae chamber with the fed larvae, the pantry with the food stock.
 * There is no bedroom: ants live on the surface and only walk through.
 */

export interface NestState {
  ants: number;
  stock: number;
  larvae: number;
  queens: number;
  width: number;
  height: number;
}

export type ChamberKind = 'queen' | 'larvae' | 'pantry';

export interface Chamber {
  id: string;
  kind: ChamberKind;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface Pt {
  x: number;
  y: number;
}

export interface Tunnel {
  /** id of the chamber at the end of the tunnel. */
  to: string;
  width: number;
  /** Polyline from the entrance to the centre of the chamber `to`. */
  points: Pt[];
}

export interface NestLayout {
  width: number;
  height: number;
  /** y of the ground line (everything above is surface). */
  surfaceY: number;
  entrance: Pt;
  chambers: Chamber[];
  tunnels: Tunnel[];
}

export const NEST_W = 320;
export const NEST_H = 200;
export const MAX_NEST_QUEENS = 8;
/** Larvae drawn (and used for sizing) at most. */
export const MAX_SHOWN_LARVAE = 40;

const SURFACE_Y = 24;
const TUNNEL_W = 8;
const TRUNK_X = 160;
const UPPER_Y = 62;
const BUS_Y = 100;
const ROW_Y = [124, 170];
const COL_SPACING = 78;
const COL_X = [-1.5, -0.5, 0.5, 1.5].map((k) => TRUNK_X + k * COL_SPACING);
/** Stable fill order of the 8 queen slots as [column, row]: centre columns first, upper row first. */
const SLOTS: readonly (readonly [number, number])[] = [
  [1, 0], [2, 0], [0, 0], [3, 0], [1, 1], [2, 1], [0, 1], [3, 1],
];
/** x of the vertical tunnel that serves the lower chamber of each column (it runs through the gaps). */
const GAP_X = [COL_X[0] + COL_SPACING / 2, TRUNK_X, TRUNK_X, COL_X[3] - COL_SPACING / 2];

const PANTRY_X = 66;
const LARVAE_X = 254;
const ASPECT = 0.6;

const num = (v: number, def = 0): number => (Number.isFinite(v) ? Math.max(0, v) : def);
const capped = (v: number, max: number): number => Math.min(max, v);

export const queenRadius = (ants: number): number => capped(27 + 0.35 * Math.sqrt(num(ants)), 32);
export const larvaeRadius = (larvae: number): number => capped(18 + 4.4 * Math.sqrt(Math.min(num(larvae), MAX_SHOWN_LARVAE)), 46);
export const pantryRadius = (stock: number): number => capped(17 + 1.35 * Math.sqrt(num(stock)), 46);

export function nestLayout(s: NestState): NestLayout {
  const width = Number.isFinite(s.width) && s.width > 0 ? s.width : NEST_W;
  const height = Number.isFinite(s.height) && s.height > 0 ? s.height : NEST_H;
  const queens = Math.max(1, Math.min(MAX_NEST_QUEENS, Math.round(Number.isFinite(s.queens) ? s.queens : 1)));
  const entrance: Pt = { x: TRUNK_X, y: SURFACE_Y };
  const chambers: Chamber[] = [];
  const tunnels: Tunnel[] = [];
  const dig = (c: Chamber, via: Pt[]): void => {
    chambers.push(c);
    tunnels.push({ to: c.id, width: TUNNEL_W, points: [entrance, ...via, { x: c.cx, y: c.cy }] });
  };
  const ell = (id: string, kind: ChamberKind, cx: number, cy: number, rx: number): Chamber => ({
    id, kind, cx, cy, rx, ry: rx * ASPECT,
  });

  dig(ell('pantry', 'pantry', PANTRY_X, UPPER_Y, pantryRadius(s.stock)), [
    { x: TRUNK_X, y: 54 },
    { x: 118, y: 58 },
  ]);
  dig(ell('larvae', 'larvae', LARVAE_X, UPPER_Y, larvaeRadius(s.larvae)), [
    { x: TRUNK_X, y: 54 },
    { x: 206, y: 58 },
  ]);

  const qr = queenRadius(s.ants);
  for (let i = 0; i < queens; i++) {
    const [col, row] = SLOTS[i];
    const x = COL_X[col];
    const y = ROW_Y[row];
    const via: Pt[] =
      row === 0
        ? [{ x: TRUNK_X, y: BUS_Y }, { x, y: BUS_Y }]
        : GAP_X[col] === TRUNK_X
          ? [{ x: TRUNK_X, y }]
          : [{ x: TRUNK_X, y: BUS_Y }, { x: GAP_X[col], y: BUS_Y }, { x: GAP_X[col], y }];
    dig(ell(`queen${i}`, 'queen', x, y, qr), via);
  }

  return { width, height, surfaceY: SURFACE_Y, entrance, chambers, tunnels };
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
