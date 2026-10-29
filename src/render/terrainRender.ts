import { NEST, WORLD_H, WORLD_W } from '../sim/constants';
import { createRng } from '../sim/rng';
import type { Feature, Terrain } from '../sim/terrain';
import { ell, line, px, SHADOW, type Ctx2D } from './sprites';

/** Minimal canvas surface used by the renderer (HTMLCanvasElement, OffscreenCanvas-like, @napi-rs/canvas). */
export interface CanvasLike {
  width: number;
  height: number;
  getContext(id: '2d'): Ctx2D | null;
}

export type CanvasFactory = (w: number, h: number) => CanvasLike;

const defaultMake: CanvasFactory = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

const GROUND = ['#4a3524', '#54402c', '#3e2c1d', '#5f4a33', '#352517'];
const MOSS = ['#4f7a2e', '#3d6023', '#68964a'];
const LEAVES = ['#7a4a22', '#9a6130', '#6a3d1c', '#a8703a'];
const GRASS = ['#4f7a2e', '#68964a', '#3d6023'];

/**
 * Prerenders the whole ground (texture, stones, twigs, needles, leaf litter, moss, grass, nest crater)
 * into one WORLD_W x WORLD_H canvas. Deterministic for a given terrain (uses seed ^ 0x51ed).
 */
export function renderTerrain(t: Terrain, make: CanvasFactory = defaultMake): CanvasLike {
  const canvas = make(WORLD_W, WORLD_H);
  const c = canvas.getContext('2d');
  if (!c) throw new Error('2d context unavailable');
  const r = createRng(t.seed ^ 0x51ed);
  const W = WORLD_W;
  const H = WORLD_H;

  // Clumpy ground.
  c.fillStyle = GROUND[0];
  c.fillRect(0, 0, W, H);
  for (let i = 0; i < 4600; i++) {
    const k = r();
    px(c, r() * W, r() * H, GROUND[k < 0.4 ? 1 : k < 0.65 ? 2 : k < 0.85 ? 3 : 4], 1 + ((r() * 3) | 0), 1 + ((r() * 2) | 0));
  }
  for (let i = 0; i < 900; i++) px(c, r() * W, r() * H, r() < 0.5 ? '#6b5238' : '#2a1c11');

  const of = <K extends Feature['kind']>(kind: K) =>
    t.features.filter((f): f is Extract<Feature, { kind: K }> => f.kind === kind);

  // Moss patches.
  for (const m of of('moss')) {
    for (let j = 0; j < 110; j++) {
      const a = r() * 6.28;
      const d = Math.sqrt(r()) * 10;
      px(c, m.x + Math.cos(a) * d * 1.4, m.y + Math.sin(a) * d * 0.7, r() < 0.5 ? MOSS[0] : r() < 0.5 ? MOSS[1] : MOSS[2]);
    }
  }

  // Leaf litter.
  for (const l of of('leaf')) {
    const lc = LEAVES[l.c % LEAVES.length];
    ell(c, l.x + 1, l.y + 1, 4, 2.3, SHADOW);
    ell(c, l.x, l.y, 4, 2.3, lc);
    line(c, l.x - 3, l.y, l.x + 3, l.y, 'rgba(40,20,8,.6)');
    px(c, l.x - 1, l.y - 1, 'rgba(255,220,160,.25)', 2, 1);
  }

  // Stones with moss.
  for (const s of of('stone')) {
    const { x, y, rx, ry } = s;
    ell(c, x + 2, y + 3, rx + 1, ry, SHADOW);
    ell(c, x, y, rx, ry, '#5d5f5b');
    ell(c, x - 1, y - 1, Math.max(rx - 1.3, 1), Math.max(ry - 1, 1), '#797b76');
    ell(c, x - 2, y - 2, Math.max(rx - 3, 0.8), Math.max(ry - 2.4, 0.8), '#93958f');
    px(c, x - rx / 2, y - ry + 1, '#c4c6c0', 3, 1);
    for (let j = 0; j < 10; j++) {
      px(c, x - rx + r() * rx * 1.4, y - ry * 0.9 + r() * ry * 0.7, r() < 0.6 ? MOSS[0] : MOSS[2]);
    }
  }

  // Twigs with bark, shadow, light top edge, pale cut end.
  for (const w of of('twig')) {
    const { x0, y0, x1, y1, t: th } = w;
    line(c, x0 + 1, y0 + 2, x1 + 1, y1 + 2, SHADOW, th + 1);
    line(c, x0, y0, x1, y1, '#4c3320', th);
    line(c, x0, y0 - 1, x1, y1 - 1, '#6b4a2c', Math.max(th - 1, 1));
    line(c, x0, y0 - 1 - (th > 2 ? 1 : 0), x1, y1 - 1 - (th > 2 ? 1 : 0), '#8a6339', 1);
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i < n / 3; i++) {
      const k = r();
      px(c, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k + th / 2, '#2e1d10', 2, 1);
    }
    ell(c, x1, y1, th / 2 + 0.5, th / 2 + 0.5, '#b79a6a');
    if (th >= 4 && r() < 0.7) {
      const mx = x0 + (x1 - x0) * 0.45;
      const my = y0 + (y1 - y0) * 0.45;
      line(c, mx, my - 1, mx + 10, my - 12, '#4c3320', 2);
      line(c, mx, my - 2, mx + 10, my - 13, '#7a5733', 1);
      ell(c, mx + 10, my - 12, 1.2, 1.2, '#b79a6a');
    }
  }

  // Needle pairs: consecutive needles sharing a base point.
  let baseX = NaN;
  let baseY = NaN;
  let green = false;
  let second = false;
  for (const n of of('needle')) {
    if (n.x === baseX && n.y === baseY) {
      second = true;
    } else {
      baseX = n.x;
      baseY = n.y;
      green = r() < 0.18;
      second = false;
    }
    const x1 = n.x + Math.cos(n.a) * n.len;
    const y1 = n.y + Math.sin(n.a) * n.len;
    line(c, n.x + 1, n.y + 1, x1 + 1, y1 + 1, 'rgba(10,6,3,.3)');
    line(c, n.x, n.y, x1, y1, green ? (second ? '#4f7022' : '#6d8f2f') : second ? '#9b5d22' : '#c9822f');
    if (second) px(c, n.x, n.y, '#4c3320', 2, 2);
  }

  // Grass blades.
  for (const g of of('grass')) {
    for (let b = 0; b < 4; b++) {
      const lean = (r() - 0.5) * 4;
      const h = 4 + r() * 4;
      line(c, g.x + b, g.y, g.x + b + lean, g.y - h, GRASS[(r() * 3) | 0]);
    }
  }

  // Nest crater.
  const nx = NEST.x;
  const ny = NEST.y;
  ell(c, nx + 1, ny + 2, 13, 7, SHADOW);
  ell(c, nx, ny, 12, 6.5, '#6b5238');
  ell(c, nx, ny - 1, 10, 5, '#7d6244');
  ell(c, nx, ny, 7, 3.6, '#0e0805');
  ell(c, nx + 1, ny + 1, 5, 2.4, '#050302');
  for (let i = 0; i < 40; i++) {
    const sx = nx + (r() - 0.5) * 28;
    const sy = ny + (r() - 0.5) * 14;
    const col = r() < 0.5 ? '#8d7152' : '#5a432c';
    // keep the hole itself clean
    if (((sx - nx) / 8) ** 2 + ((sy - ny) / 4.4) ** 2 <= 1) continue;
    px(c, sx, sy, col);
  }

  return canvas;
}
