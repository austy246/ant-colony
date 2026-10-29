/**
 * "Podzemí": the underground cross-section. The picture is a fixed 320 x 200 fine-pixel scene (see nestLayout.ts) that is
 * composed every frame from a cached soil backdrop, cached tunnel layers and chambers whose radii ease towards the
 * colony's size, then blitted to the canvas with an integer zoom, centred. The world is only read.
 */
import { FOOD_PER_ANT, FOOD_PER_QUEEN, MAX_ANTS, MAX_QUEENS } from '../sim/constants';
import type { World } from '../sim/world';
import { CALLOW_RGBA } from './antArt';
import {
  drawText, larvaRaster, larvaSlots, LARVA_FRAMES, LARVA_GROW, LARVA_SIZE, LARVA_VARIANTS, MAX_CRUMBS, paintChamberInterior,
  paintChamberRim, paintCrumbs, paintEggPile, paintFlyRemains, paintTunnelInteriors, paintTunnelRims, pantryCrumbs,
  renderBackdrop, textWidth, vignettePixels, VOID_COLOR, type Crumb,
} from './nestArt';
import { MOUTH_RISE, nestAntPose, type NestPose } from './nestChoreo';
import {
  MAX_SHOWN_LARVAE, nestLayout, NEST_H, NEST_W, smoothToward, type Chamber, type NestLayout,
} from './nestLayout';
import { queenSprite } from './preyArt';
import { AntSprites, type Ctx2D } from './sprites';
import type { CanvasFactory, CanvasLike } from './terrainRender';

const defaultMake: CanvasFactory = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

/** Chambers ease to their new size at this rate (1/s): about 1.5 s to settle. */
export const GROW_RATE = 3.2;
/** At most this many nest ants are drawn (the first ones by id); the rest of a big colony is implied. */
export const MAX_DRAWN_NEST_ANTS = 60;
const BOB = [0, 1, 0];
const BOB_PERIOD = 2.7;

export interface NestHud {
  line: string;
  /** Progress of the next hatch in [0, 1], or null when it is not running. */
  hatch: number | null;
  /** Shown instead of the progress bar when the queen has too little food. */
  wait: string | null;
  /** Food missing to the next queen, null at the maximum. */
  nextQueen: string | null;
}

/** Texts of the in-view HUD (Czech). */
export function nestHud(world: World): NestHud {
  const stock = Number.isFinite(world.stock) ? world.stock : 0;
  const ants = world.ants.length;
  const canHatch = stock >= FOOD_PER_ANT && ants < MAX_ANTS;
  const missing = Math.max(1, Math.ceil(FOOD_PER_QUEEN - (world.totalDelivered % FOOD_PER_QUEEN)));
  return {
    line: `Královny: ${world.queens} · Larvy: ${world.larvae} · Zásoba: ${stock.toFixed(1)} · Mravenci: ${ants}`,
    hatch: canHatch ? world.hatchFraction : null,
    wait: stock < FOOD_PER_ANT ? `Královna čeká na potravu (${FOOD_PER_ANT})` : null,
    nextQueen: world.queens < MAX_QUEENS ? `Další královna za ${missing} jídla` : null,
  };
}

const finite = (v: number, def = 0): number => (Number.isFinite(v) ? v : def);

export class UndergroundView {
  private ctx: CanvasRenderingContext2D;
  private cw = 1;
  private ch = 1;
  private zoom = 1;
  private ox = 0;
  private oy = 0;
  private t = 0;
  private scene: CanvasLike;
  private sceneCtx: Ctx2D;
  private backdrop: CanvasLike | null = null;
  private backdropSeed: number | null = null;
  private vignette: CanvasLike | null = null;
  private tunnelLayers: { queens: number; rim: CanvasLike; inner: CanvasLike } | null = null;
  private shown = new Map<string, { rx: number; ry: number }>();
  private drawnOnce = false;
  private crumbs: Crumb[] | null = null;
  private larvaSprites = new Map<number, CanvasLike>();
  private antSprites: AntSprites;
  private callowSprites: AntSprites;
  /** Reused per frame: the poses of the drawn nest ants (at most MAX_DRAWN_NEST_ANTS), their draw order and the egg bookkeeping. */
  private poses: NestPose[] = [];
  private order: number[] = [];
  private drawn = 0;
  private eggsTaken: number[] = [];
  private eggsShown: number[] = [];
  /** The layout with the EASED chamber sizes, as the ants walk in what is drawn (one object reused every frame). */
  private shownLayout: NestLayout | null = null;
  private layout: NestLayout | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private world: World,
    private make: CanvasFactory = defaultMake,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.scene = make(NEST_W, NEST_H);
    const sctx = this.scene.getContext('2d');
    if (!sctx) throw new Error('2d context unavailable');
    this.sceneCtx = sctx;
    this.antSprites = new AntSprites(make);
    this.callowSprites = new AntSprites(make, CALLOW_RGBA);
    this.resize();
  }

  /** Where the 320 x 200 scene lies on the canvas (device pixels), for tests and hit mapping. */
  get metrics(): { zoom: number; ox: number; oy: number; width: number; height: number } {
    return { zoom: this.zoom, ox: this.ox, oy: this.oy, width: NEST_W, height: NEST_H };
  }

  /** Number of nest ants drawn by the last draw() (at most MAX_DRAWN_NEST_ANTS). */
  walkerCount(): number {
    return this.drawn;
  }

  /** Eggs shown in the pile of queen `index` by the last draw() (after the ones nurses carry away). */
  queenEggs(index: number): number {
    return this.eggsShown[index] ?? 0;
  }

  /** Radii currently displayed for a chamber (they ease towards the layout's target sizes). */
  shownRadii(id: string): { rx: number; ry: number } | undefined {
    const s = this.shown.get(id);
    return s ? { rx: s.rx, ry: s.ry } : undefined;
  }

  /** Last computed layout (target sizes). */
  get currentLayout(): NestLayout | null {
    return this.layout;
  }

  /** Sizes the canvas to its CSS size x devicePixelRatio and picks the integer zoom. */
  resize(): void {
    const dpr = typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
    const css = (v: number | undefined, fallback: number | undefined): number => Math.max(0, finite(v || fallback || 0));
    const cssW = css(this.canvas.clientWidth, typeof window !== 'undefined' ? window.innerWidth : 0);
    const cssH = css(this.canvas.clientHeight, typeof window !== 'undefined' ? window.innerHeight : 0);
    this.canvas.width = this.cw = Math.round(cssW * dpr);
    this.canvas.height = this.ch = Math.round(cssH * dpr);
    this.zoom = Math.max(1, Math.floor(Math.min(this.cw / NEST_W, this.ch / NEST_H)));
    this.ox = Math.floor((this.cw - NEST_W * this.zoom) / 2);
    this.oy = Math.floor((this.ch - NEST_H * this.zoom) / 2);
  }

  /** Call when the view is shown again: snaps the chamber sizes (the ants need no catching up, they are a function of the time). */
  enter(): void {
    this.drawnOnce = false;
  }

  draw(dt: number): void {
    const step = Math.min(Math.max(finite(dt), 0), 0.25);
    this.t += step;
    const w = this.world;
    const layout = nestLayout({
      ants: w.ants.length,
      stock: finite(w.stock),
      larvae: finite(w.larvae),
      queens: finite(w.queens, 1),
      width: NEST_W,
      height: NEST_H,
    });
    this.layout = layout;

    const shown: Chamber[] = layout.chambers.map((c) => {
      let s = this.shown.get(c.id);
      if (!s) {
        s = this.drawnOnce ? { rx: c.rx * 0.25, ry: c.ry * 0.25 } : { rx: c.rx, ry: c.ry };
        this.shown.set(c.id, s);
      }
      s.rx = smoothToward(s.rx, c.rx, step, GROW_RATE);
      s.ry = smoothToward(s.ry, c.ry, step, GROW_RATE);
      return { ...c, rx: s.rx, ry: s.ry };
    });
    this.drawnOnce = true;

    this.placeNestAnts(layout, shown);
    this.compose(layout, shown);
    this.present();
  }

  // ---- composition ----------------------------------------------------------------------------------------------

  private canvasFrom(r: { data: Uint8ClampedArray }, w: number, h: number): CanvasLike {
    const cv = this.make(w, h);
    const c = cv.getContext('2d');
    if (c) {
      const img = c.createImageData(w, h);
      img.data.set(r.data);
      c.putImageData(img, 0, 0);
    }
    return cv;
  }

  private ensureStatic(layout: NestLayout): void {
    const seed = finite(this.world.seed) | 0;
    if (!this.backdrop || this.backdropSeed !== seed) {
      this.backdrop = this.canvasFrom(renderBackdrop(NEST_W, NEST_H, seed), NEST_W, NEST_H);
      this.backdropSeed = seed;
    }
    if (!this.vignette) this.vignette = this.canvasFrom({ data: vignettePixels(NEST_W, NEST_H) }, NEST_W, NEST_H);
    const queens = layout.chambers.filter((c) => c.kind === 'queen').length;
    if (this.tunnelLayers?.queens !== queens) {
      const mouth = layout.entrance.y - MOUTH_RISE;
      const rim = this.make(NEST_W, NEST_H);
      const inner = this.make(NEST_W, NEST_H);
      const rc = rim.getContext('2d');
      const ic = inner.getContext('2d');
      if (rc) paintTunnelRims(rc, layout.tunnels, mouth);
      if (ic) paintTunnelInteriors(ic, layout.tunnels, mouth);
      this.tunnelLayers = { queens, rim, inner };
    }
  }

  private compose(layout: NestLayout, shown: Chamber[]): void {
    this.ensureStatic(layout);
    const c = this.sceneCtx;
    c.imageSmoothingEnabled = false;
    c.drawImage(this.backdrop as unknown as CanvasImageSource, 0, 0);
    const layers = this.tunnelLayers!;
    c.drawImage(layers.rim as unknown as CanvasImageSource, 0, 0);
    for (const ch of shown) paintChamberRim(c, ch, ch.rx, ch.ry);
    c.drawImage(layers.inner as unknown as CanvasImageSource, 0, 0);
    for (const ch of shown) paintChamberInterior(c, ch, ch.rx, ch.ry);

    let qi = 0;
    for (const ch of shown) {
      if (ch.kind === 'queen') this.drawQueen(c, ch, qi++);
      else if (ch.kind === 'larvae') this.drawLarvae(c, ch);
      else this.drawPantry(c, ch);
    }
    for (const ch of shown) this.drawLabel(c, ch);
    this.drawNestAnts(c);
    c.drawImage(this.vignette as unknown as CanvasImageSource, 0, 0);
  }

  private present(): void {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = VOID_COLOR;
    c.fillRect(0, 0, this.cw, this.ch);
    if (this.cw < 1 || this.ch < 1) return;
    c.imageSmoothingEnabled = false;
    c.drawImage(this.scene as unknown as CanvasImageSource, this.ox, this.oy, NEST_W * this.zoom, NEST_H * this.zoom);
  }

  private drawQueen(c: Ctx2D, ch: Chamber, index: number): void {
    const frame = Math.floor((((this.t + index * 0.9) % BOB_PERIOD) / BOB_PERIOD) * BOB.length) % BOB.length;
    const dy = BOB[frame];
    const x = Math.round(ch.cx);
    const y = Math.round(ch.cy - ch.ry * 0.12) + dy;
    const flip = index % 2 === 1;
    c.save();
    c.translate(x, y);
    if (flip) c.scale(-1, 1);
    for (const g of queenSprite().groups) {
      c.fillStyle = g.style;
      const r = g.rects;
      for (let i = 0; i < r.length; i += 4) c.fillRect(r[i], r[i + 1], r[i + 2], r[i + 3]);
    }
    c.restore();
    // eggs behind her (fewer while nurses carry some away); one more appears with the "laying" frame
    const ex = flip ? Math.round(ch.cx + ch.rx * 0.28) : Math.round(ch.cx - ch.rx * 0.28 - 9);
    const n = this.eggsShown[index] ?? 0;
    paintEggPile(c, ex, Math.round(ch.cy + ch.ry * 0.5), n + (frame === 1 && n < 6 ? 1 : 0));
  }

  private larvaSprite(variant: number, frame: number, grow: number): CanvasLike {
    const key = (grow * LARVA_FRAMES + frame) * LARVA_VARIANTS + variant;
    let s = this.larvaSprites.get(key);
    if (!s) {
      s = this.canvasFrom(larvaRaster(variant, frame, grow), LARVA_SIZE, LARVA_SIZE);
      this.larvaSprites.set(key, s);
    }
    return s;
  }

  private drawLarvae(c: Ctx2D, ch: Chamber): void {
    const n = Math.min(MAX_SHOWN_LARVAE, Math.max(0, Math.floor(finite(this.world.larvae))));
    if (n === 0) return;
    const slots = larvaSlots(n);
    const half = LARVA_SIZE / 2;
    const frac = Math.max(0, Math.min(1, finite(this.world.hatchFraction)));
    slots.forEach((s, k) => {
      const nx = s.dx / (ch.rx * 0.9);
      const ny = s.dy / (ch.ry * 0.88);
      if (nx * nx + ny * ny > 1) return;
      const x = Math.round(ch.cx + s.dx);
      const y = Math.round(ch.cy + s.dy);
      const frame = Math.floor(this.t * 1.3 + ((k * 0.618) % 1) * 2) % LARVA_FRAMES;
      if (k === 0) {
        // the next one to hatch: a warm halo and a body that fattens with the hatch progress
        c.fillStyle = `rgba(255,214,130,${0.05 + 0.12 * frac})`;
        c.fillRect(x - 8, y - 5, 16, 11);
        c.fillStyle = `rgba(255,214,130,${0.04 + 0.08 * frac})`;
        c.fillRect(x - 6, y - 7, 12, 15);
        const grow = Math.min(LARVA_GROW - 1, Math.round(frac * (LARVA_GROW - 1)));
        c.drawImage(this.larvaSprite(s.variant, frame, grow) as unknown as CanvasImageSource, x - half, y - half);
      } else {
        c.drawImage(this.larvaSprite(s.variant, frame, 0) as unknown as CanvasImageSource, x - half, y - half);
      }
    });
  }

  private drawPantry(c: Ctx2D, ch: Chamber): void {
    const stock = Math.max(0, finite(this.world.stock));
    const n = Math.min(MAX_CRUMBS, Math.ceil(stock * 1.3));
    if (n > 0) {
      this.crumbs ??= pantryCrumbs(MAX_CRUMBS);
      paintCrumbs(c, ch, ch.rx, ch.ry, this.crumbs.slice(0, n));
    }
    if (stock >= 40) paintFlyRemains(c, ch, ch.rx, ch.ry);
  }

  private drawLabel(c: Ctx2D, ch: Chamber): void {
    const text = ch.kind === 'queen' ? 'Královna' : ch.kind === 'larvae' ? 'Larvy' : 'Spíž';
    const tw = textWidth(text);
    const x = Math.round(ch.cx - tw / 2);
    const y = Math.round(ch.cy - ch.ry) - 3;
    c.fillStyle = 'rgba(18,10,5,.8)';
    c.fillRect(x - 2, y, tw + 4, 8);
    drawText(c, text, x, y + 2, '#ecdcb0', '#120a05');
  }

  // ---- the ants inside ------------------------------------------------------------------------------------------

  /** Eggs in the pile of one queen before the nurses take any: grows with the number of queens and the hatch progress (2..6). */
  private baseEggs(queens: number): number {
    const frac = Math.max(0, Math.min(1, finite(this.world.hatchFraction)));
    return 2 + Math.min(2, Math.floor(queens / 3)) + Math.floor(frac * 1.99);
  }

  /** Poses of the first MAX_DRAWN_NEST_ANTS ants whose state is 'nest', sorted by y; counts the eggs nurses carry away. */
  private placeNestAnts(layout: NestLayout, shown: Chamber[]): void {
    const w = this.world;
    const sl = (this.shownLayout ??= { ...layout, chambers: shown });
    sl.entrance = layout.entrance;
    sl.tunnels = layout.tunnels;
    sl.chambers = shown;
    const queens = shown.reduce((n, c) => n + (c.kind === 'queen' ? 1 : 0), 0);
    this.eggsTaken.length = queens;
    this.eggsTaken.fill(0);
    let n = 0;
    const time = finite(w.time);
    for (const a of w.ants) {
      if (a.state !== 'nest') continue;
      if (n >= MAX_DRAWN_NEST_ANTS) break;
      const pose = (this.poses[n] ??= { x: 0, y: 0, dir16: 0, frame: 0, carrying: null, pose: 'stand', callow: false, queen: -1 });
      nestAntPose(a, sl, time, pose);
      if (pose.carrying === 'egg' && pose.pose === 'walk' && pose.queen >= 0 && pose.queen < queens) this.eggsTaken[pose.queen]++;
      n++;
    }
    this.drawn = n;
    // draw order: by y (insertion sort of a handful of indices, nothing allocated)
    const order = this.order;
    order.length = n;
    for (let i = 0; i < n; i++) {
      let j = i;
      while (j > 0 && this.poses[order[j - 1]].y > this.poses[i].y) {
        order[j] = order[j - 1];
        j--;
      }
      order[j] = i;
    }
    const base = this.baseEggs(queens);
    this.eggsShown.length = queens;
    for (let i = 0; i < queens; i++) this.eggsShown[i] = Math.max(0, base - this.eggsTaken[i]);
  }

  private drawNestAnts(c: Ctx2D): void {
    for (let k = 0; k < this.drawn; k++) {
      const p = this.poses[this.order[k]];
      const sprites = p.callow ? this.callowSprites : this.antSprites;
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      c.drawImage(sprites.get(p.dir16, p.frame, p.carrying === 'crumb') as unknown as CanvasImageSource, x - 12, y - 12);
      if (p.carrying === 'egg') this.drawCarriedEgg(c, p, x, y);
    }
  }

  /** A small cream egg (2 x 3 fine px, 3 x 2 when the ant walks sideways) held in the jaws, in front of the head. */
  private drawCarriedEgg(c: Ctx2D, p: NestPose, x: number, y: number): void {
    const a = (p.dir16 * Math.PI) / 8;
    const ex = x + Math.round(Math.cos(a) * 7);
    const ey = y + Math.round(Math.sin(a) * 7);
    const wide = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a));
    const w = wide ? 3 : 2;
    const h = wide ? 2 : 3;
    c.fillStyle = '#efe6c9';
    c.fillRect(ex - 1, ey - 1, w, h);
    c.fillStyle = '#b9a67c';
    c.fillRect(ex - 1, ey - 1 + h - 1, w, 1);
    c.fillStyle = '#fffaf0';
    c.fillRect(ex - 1, ey - 1, 1, 1);
  }
}
