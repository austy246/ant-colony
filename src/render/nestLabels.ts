/**
 * Labels of the chambers ("Královna", "Larvy", "Spíž", numbered when there are several of a kind). Pure geometry: every label gets
 * a solid plate that is centred above its chamber when there is room; a plate that would sit on another plate, on a tunnel
 * or outside the picture moves (up, aside, below, then a scan of the whole picture), always the same way for the same layout.
 * Placement looks at the chambers as they are drawn now (a plate follows the top of its chamber while it grows).
 */
import { insideChamber, type Chamber, type Tunnel } from './nestLayout';

/** Width of a text in the 3 x 5 bitmap font (4 px per character, 1 px gap). */
const textW = (s: string): number => Math.max(0, s.length * 4 - 1);

export interface Plate {
  id: string;
  text: string;
  /** Top-left corner and size of the dark plate in layout units. */
  x: number;
  y: number;
  w: number;
  h: number;
}

const NAMES = { queen: 'Královna', larvae: 'Larvy', pantry: 'Spíž' } as const;

/** The label of a chamber; `several` adds the number (1-based) of the chamber within its kind. */
export function chamberLabel(c: Pick<Chamber, 'kind' | 'index'>, several: boolean): string {
  return several ? `${NAMES[c.kind]} ${c.index + 1}` : NAMES[c.kind];
}

export const PLATE_H = 9;

const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, pad: number): boolean =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

export function labelPlates(
  chambers: readonly Chamber[],
  tunnels: readonly Tunnel[],
  width: number,
  height: number,
  surfaceY: number,
): Plate[] {
  const counts = { queen: 0, larvae: 0, pantry: 0 };
  for (const c of chambers) counts[c.kind]++;
  const rooms = chambers;
  const pts: { x: number; y: number; r: number }[] = [];
  for (const t of tunnels) t.points.forEach((p, i) => pts.push({ x: p.x, y: p.y, r: t.widths[i] / 2 + 2 }));
  const placed: Plate[] = [];

  const cost = (r: Plate, self: number): number => {
    let k = 0;
    if (r.x < 1 || r.y < surfaceY + 1 || r.x + r.w > width - 1 || r.y + r.h > height - 1) k += 100000;
    for (const p of placed) if (overlap(r, p, 1)) k += 1000000;
    for (const p of pts) if (p.x > r.x - p.r && p.x < r.x + r.w + p.r && p.y > r.y - p.r && p.y < r.y + r.h + p.r) k += 12;
    for (let i = 0; i < rooms.length; i++) {
      if (i === self) continue;
      // other chambers: count the plate's corners and middle that fall inside one
      for (const [qx, qy] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h], [r.x + r.w / 2, r.y + r.h / 2]]) {
        if (insideChamber(rooms[i], qx, qy, 2)) k += 40;
      }
    }
    return k;
  };

  chambers.forEach((c, i) => {
    const text = chamberLabel(c, counts[c.kind] > 1);
    const w = textW(text) + 4;
    const e = { rx: c.rx * (1 + c.lobes.reduce((a, l) => a + Math.abs(l.a), 0)), ry: c.ry * (1 + c.lobes.reduce((a, l) => a + Math.abs(l.a), 0)) };
    const mk = (x: number, y: number): Plate => ({ id: c.id, text, x: Math.round(x), y: Math.round(y), w, h: PLATE_H });
    const cands: Plate[] = [];
    const top = c.cy - e.ry - PLATE_H - 2;
    const cx = c.cx - w / 2;
    for (const dy of [0, -10, -20, -30]) cands.push(mk(cx, top + dy));
    for (const dx of [-1, 1]) for (const dy of [0, -10, -20]) cands.push(mk(cx + dx * (w / 2 + 4), top + dy));
    cands.push(mk(cx, c.cy + e.ry + 3), mk(cx, c.cy + e.ry + 13));
    cands.push(mk(c.cx + e.rx + 2, c.cy - PLATE_H / 2), mk(c.cx - e.rx - 2 - w, c.cy - PLATE_H / 2));
    let best = cands[0];
    let bc = Infinity;
    for (const r of cands) {
      const k = cost(r, i);
      if (k < bc) {
        bc = k;
        best = r;
      }
      if (k === 0) break;
    }
    if (bc >= 100000) {
      // nothing near is free: scan the whole picture for the free spot closest to the chamber
      let bd = Infinity;
      for (let y = surfaceY + 2; y + PLATE_H < height - 1; y += 3) {
        for (let x = 2; x + w < width - 1; x += 3) {
          const r = mk(x, y);
          const k = cost(r, i);
          if (k >= 100000) continue;
          const d = k * 50 + Math.hypot(r.x + w / 2 - c.cx, r.y - c.cy);
          if (d < bd) {
            bd = d;
            best = r;
          }
        }
      }
    }
    placed.push(best);
  });
  return placed;
}
