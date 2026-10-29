import type { FoodKind } from '../sim/food';
import { ANT_CENTER, ANT_DIRS, ANT_FRAMES, ANT_RGBA, ANT_SIZE, antPixels } from './antArt';
import { FINE } from './fine';
import { preySprite, queenSprite, type Sprite } from './preyArt';
import type { CanvasFactory, CanvasLike } from './terrainRender';

export type Ctx2D = CanvasRenderingContext2D;

export const SHADOW = 'rgba(10,6,3,.38)';

/** Snaps a world coordinate to the fine grid (half art pixels), so sprites do not wobble while moving sub-pixel. */
const snap = (v: number): number => Math.round(v * FINE) / FINE;

/** Draws a prebuilt fine-grid sprite as colour-grouped integer fillRects around the (snapped) world position. */
function blit(c: Ctx2D, spr: Sprite, x: number, y: number): void {
  c.save();
  c.translate(snap(x), snap(y));
  c.scale(1 / FINE, 1 / FINE);
  for (const g of spr.groups) {
    c.fillStyle = g.style;
    const r = g.rects;
    for (let i = 0; i < r.length; i += 4) c.fillRect(r[i], r[i + 1], r[i + 2], r[i + 3]);
  }
  c.restore();
}

/**
 * Pre-rendered worker-ant sprites: every (carrying x frame x direction) variant, ANT_SIZE x ANT_SIZE fine pixels each,
 * built once (lazily, on first use) into small offscreen canvases through the injectable canvas factory.
 */
export class AntSprites {
  private cache: CanvasLike[] | null = null;

  constructor(private make: CanvasFactory) {}

  private build(): CanvasLike[] {
    const out: CanvasLike[] = [];
    for (const carrying of [false, true]) {
      for (let f = 0; f < ANT_FRAMES; f++) {
        for (let k = 0; k < ANT_DIRS; k++) {
          const cv = this.make(ANT_SIZE, ANT_SIZE);
          const ctx = cv.getContext('2d');
          if (ctx) {
            const img = ctx.createImageData(ANT_SIZE, ANT_SIZE);
            const px = antPixels(k, f, carrying);
            for (let i = 0; i < px.length; i++) {
              const [r, g, b, a] = ANT_RGBA[px[i]];
              img.data[i * 4] = r;
              img.data[i * 4 + 1] = g;
              img.data[i * 4 + 2] = b;
              img.data[i * 4 + 3] = a;
            }
            ctx.putImageData(img, 0, 0);
          }
          out.push(cv);
        }
      }
    }
    return out;
  }

  get(dir: number, frame: number, carrying: boolean): CanvasLike {
    this.cache ??= this.build();
    return this.cache[((carrying ? ANT_FRAMES : 0) + frame) * ANT_DIRS + dir];
  }
}

/** Draws one pre-rendered ant with a single drawImage at the (snapped) world position, smoothing off. */
export function drawAnt(c: Ctx2D, sprites: AntSprites, x: number, y: number, dir: number, frame: number, carrying: boolean): void {
  if (c.imageSmoothingEnabled) c.imageSmoothingEnabled = false;
  c.drawImage(
    sprites.get(dir, frame, carrying) as unknown as CanvasImageSource,
    snap(x) - ANT_CENTER / FINE,
    snap(y) - ANT_CENTER / FINE,
    ANT_SIZE / FINE,
    ANT_SIZE / FINE,
  );
}

const clamp01 = (p: number): number => (Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0);

/** Radii of the hole the queen digs; starts at the nest crater's hole (7 x 3.6) and widens. */
export function queenHoleRadii(digProgress: number): { rx: number; ry: number } {
  const p = clamp01(digProgress);
  return { rx: 7 + 4 * p, ry: 3.6 + 2 * p };
}

const CRUMB_COLORS = ['#8d7152', '#6b5238', '#5a432c', '#7d6244'];
const CRUMB_COUNT = 7;

/** Deterministic dirt crumbs flung out of the hole (offsets from the nest); empty unless 0 < p < 1. */
export function queenCrumbs(digProgress: number): { dx: number; dy: number; color: string }[] {
  if (!Number.isFinite(digProgress) || digProgress <= 0 || digProgress >= 1) return [];
  const out: { dx: number; dy: number; color: string }[] = [];
  for (let i = 0; i < CRUMB_COUNT; i++) {
    // Each crumb loops through its own flight (phase 0..1): out and up, then back down.
    const phase = (digProgress * 5 + i / CRUMB_COUNT) % 1;
    const dir = (i % 2 === 0 ? 1 : -1) * (1 + (i % 3) * 0.6);
    const dx = dir * 4 + dir * phase * 8;
    const dy = -2 - Math.sin(phase * Math.PI) * (5 + (i % 3) * 2) + phase * 4;
    out.push({ dx, dy, color: CRUMB_COLORS[i % CRUMB_COLORS.length] });
  }
  return out;
}

/**
 * Queen: about 3x the worker (44 x 26 fine px), all black with subtle highlights, facing right, on the fine grid.
 * Drawn in world coordinates; the dig hole and flying crumbs are scaled to the fine grid as well.
 */
export function drawQueen(c: Ctx2D, x: number, y: number, digProgress: number): void {
  c.save();
  c.translate(snap(x), snap(y));
  c.scale(1 / FINE, 1 / FINE);
  if (digProgress > 0) {
    const { rx, ry } = queenHoleRadii(digProgress);
    hole(c, rx * FINE, ry * FINE);
  }
  c.restore();
  blit(c, queenSprite(), x, y);
  const crumbs = queenCrumbs(digProgress);
  if (crumbs.length > 0) {
    c.save();
    c.translate(snap(x), snap(y));
    c.scale(1 / FINE, 1 / FINE);
    for (const k of crumbs) {
      c.fillStyle = k.color;
      c.fillRect(Math.round(k.dx * FINE), Math.round(k.dy * FINE), 2, 2);
    }
    c.restore();
  }
}

/** [x scale, y scale, x add, y add, colour] of the dig hole's concentric layers (module constant: no per-frame allocation). */
const HOLE_LAYERS: readonly (readonly [number, number, number, number, string])[] = [
  [1, 1, 2, 1.5, '#3a2a1b'],
  [1, 1, 0, 0, '#1b110a'],
  [0.82, 0.8, 0, 0, '#0e0805'],
  [0.55, 0.52, 0, 0, '#050302'],
];

/** Dark dig hole (fine px units, centred on the origin): scanline ellipses, rim to black. */
function hole(c: Ctx2D, rx: number, ry: number): void {
  for (const [sx, sy, ax, ay, col] of HOLE_LAYERS) {
    const lx = rx * sx + ax;
    const ly = ry * sy + ay;
    c.fillStyle = col;
    for (let dy = -Math.ceil(ly); dy < Math.ceil(ly); dy++) {
      const ny = (dy + 0.5) / ly;
      if (Math.abs(ny) > 1) continue;
      const half = Math.round(lx * Math.sqrt(1 - ny * ny));
      if (half > 0) c.fillRect(-half, dy, half * 2, 1);
    }
  }
}

export function drawFood(c: Ctx2D, kind: FoodKind, x: number, y: number): void {
  blit(c, preySprite(kind), x, y);
}
