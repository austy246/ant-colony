/**
 * "Podzemí": the underground cross-section. The picture is a fine-pixel scene of the layout's size (320 x 200; in normal
 * mode it grows with the colony, see nestSceneSize) that is composed every frame from a cached soil backdrop, cached tunnel
 * layers and chambers whose radii ease towards the colony's size, then blitted to the canvas centred, with the largest whole
 * zoom that fits (a grown scene that does not fit even 1:1 is scaled down to fit). The world is only read.
 *
 * The nest follows the colony's NEED: one chamber per queen, as many pantries as the biggest stock ever needed and as many
 * larvae chambers as the most larvae ever waiting. A chamber that becomes needed while the view is visible is dug: its tunnel
 * (and the deeper part of the shaft it branches from, if that is not dug yet) grows from the mouth to the chamber in DIG_S
 * seconds with a few crumbs of soil flying back, then the chamber itself grows from nothing. Chambers that exist when the
 * view is opened (or the game is loaded) are simply there.
 */
import { FOOD_PER_ANT, FOOD_PER_QUEEN, LARVAE_PER_CHAMBER, MAX_QUEENS, PANTRY_CAPACITY } from '../sim/constants';
import { chamberFills } from '../sim/nestNeeds';
import type { World } from '../sim/world';
import { ANT_CENTER, ANT_SIZE, CALLOW_RGBA } from './antArt';
import {
  colonyTint, drawText, floorY, larvaRaster, larvaSlots, LARVA_FRAMES, LARVA_GROW, LARVA_SIZE, LARVA_VARIANTS, MAX_CRUMBS,
  paintChamberInterior, paintChamberRim, paintCrumbs, paintEggPile, paintFlyRemains, paintTunnelInteriors, paintTunnelRims,
  pantryCrumbs, renderBackdrop, vignettePixels, VOID_COLOR, type Crumb, type Tint,
} from './nestArt';
import { MOUTH_RISE, nestAntPose, type NestPose } from './nestChoreo';
import { labelPlates, MAX_LABELED_CHAMBERS, type Plate } from './nestLabels';
import {
  insideChamber, MAX_SHOWN_LARVAE, nestLayout, NEST_H, NEST_W, smoothToward, type Chamber, type NestLayout, type Pt, type Tunnel,
} from './nestLayout';
import { queenSprite } from './preyArt';
import { AntSprites, MAJOR_SCALE, type Ctx2D } from './sprites';
import type { CanvasFactory, CanvasLike } from './terrainRender';

const defaultMake: CanvasFactory = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

/** Chambers ease to their new size at this rate (1/s): about 1.5 s to settle. */
export const GROW_RATE = 3.2;
/** Seconds a new chamber takes to be dug (the tunnel grows to it); the chamber then grows from nothing. */
export const DIG_S = 3;
/**
 * With more shown chambers than this (only a grown normal-mode nest has them) the chambers that have reached their size are
 * painted once into cached layers instead of every frame; the plan's 18 chambers are always painted directly.
 */
export const CACHE_CHAMBERS_ABOVE = 18;
/** At most this many nest ants are drawn (the first ones by id); the rest of a big colony is implied. */
export const MAX_DRAWN_NEST_ANTS = 60;
/** At most this many standing ants are drawn in one chamber (they stay at its edges, off the larvae). */
export const MAX_STANDERS = 6;
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
  const canHatch = stock >= FOOD_PER_ANT && ants < world.maxAnts;
  const missing = Math.max(1, Math.ceil(FOOD_PER_QUEEN - (world.totalDelivered % FOOD_PER_QUEEN)));
  return {
    line: `Královny: ${world.queens} · Larvy: ${world.larvae} · Zásoba: ${stock.toFixed(1)} · Mravenci: ${ants}`,
    hatch: canHatch ? world.hatchFraction : null,
    wait: stock < FOOD_PER_ANT ? `Královna čeká na potravu (${FOOD_PER_ANT})` : null,
    nextQueen: world.queens < MAX_QUEENS ? `Další královna za ${missing} jídla` : null,
  };
}

const finite = (v: number, def = 0): number => (Number.isFinite(v) ? v : def);

/**
 * Zoom of a sw x sh scene on a cw x ch canvas: the largest whole zoom that fits, at least 1 (a base-sized picture on a tiny
 * window stays 1:1, cut at the edges, as always). A scene that grew beyond the base picture (normal mode) and does not fit
 * even 1:1 is scaled down to fit exactly (a fraction, drawn smoothed): the new chambers are dug at its far edges, so the
 * player has to see the whole nest.
 */
export function nestZoom(cw: number, ch: number, sw: number, sh: number): number {
  const fit = Math.min(cw / sw, ch / sh);
  if (!Number.isFinite(fit) || fit <= 0) return 1;
  if (fit >= 1) return Math.floor(fit);
  return sw > NEST_W || sh > NEST_H ? fit : 1;
}

/** What the colony needs right now: chamber counts (from the sim) and how full each pantry / larvae chamber is. */
function needsOf(w: World): {
  queens: number; pantries: number; larvaeChambers: number;
  pantry: number[]; larvae: number[]; sizePantry: number[]; sizeLarvae: number[];
} {
  const n = w.nestNeeds;
  return {
    ...n,
    pantry: chamberFills(Math.max(0, finite(w.stock)), n.pantries, PANTRY_CAPACITY),
    larvae: chamberFills(Math.max(0, finite(w.larvae)), n.larvaeChambers, LARVAE_PER_CHAMBER),
    // chamber size follows the peaks (never shrinks); what is drawn inside follows the current state
    sizePantry: chamberFills(Math.max(0, finite(w.peakStock)), n.pantries, PANTRY_CAPACITY),
    sizeLarvae: chamberFills(Math.max(0, finite(w.peakLarvae)), n.larvaeChambers, LARVAE_PER_CHAMBER),
  };
}

interface Dig {
  /** View time (s) the digging started; -Infinity for chambers that were already there. */
  at: number;
  /** Points of the shaft before / after: the part in between is dug first (extFrom === extTo when nothing is added). */
  extFrom: number;
  extTo: number;
}

const slice = (t: Tunnel, n: number): Tunnel => ({ ...t, points: t.points.slice(0, n), widths: t.widths.slice(0, n) });

export class UndergroundView {
  private ctx: CanvasRenderingContext2D;
  private cw = 1;
  private ch = 1;
  private zoom = 1;
  private ox = 0;
  private oy = 0;
  private t = 0;
  /** Size of the scene (the layout's width / height): the base picture, grown in normal mode. */
  private sw = NEST_W;
  private sh = NEST_H;
  private scene: CanvasLike;
  private sceneCtx: Ctx2D;
  private backdrop: CanvasLike | null = null;
  private backdropSeed: number | null = null;
  /** The tunnel of every chamber by id, for the tunnels array it was built from. */
  private tunnelIndex: { of: readonly Tunnel[]; map: Map<string, Tunnel> } | null = null;
  /** Fills of the larvae chambers this frame. */
  private larvaFills: number[] = [];
  private tint: Tint | null = null;
  private vignette: CanvasLike | null = null;
  private tunnelLayers: { sig: string; rim: CanvasLike; inner: CanvasLike } | null = null;
  private shown = new Map<string, { rx: number; ry: number }>();
  private digs = new Map<string, Dig>();
  private digSeed: number | null = null;
  /** Points of the shaft that are dug (the shaft grows deeper when a chamber that branches from deeper down is needed). */
  private shaftN = 0;
  private drawnOnce = false;
  private crumbs: Crumb[] | null = null;
  private larvaSprites = new Map<number, CanvasLike>();
  private antSprites: AntSprites;
  private callowSprites: AntSprites;
  /** Reused per frame: the poses of the drawn nest ants (at most MAX_DRAWN_NEST_ANTS), their draw order and the egg bookkeeping. */
  private poses: NestPose[] = [];
  /** Whether the ant behind poses[i] is a major (drawn larger). */
  private majors: boolean[] = [];
  private order: number[] = [];
  private drawn = 0;
  private eggsTaken: number[] = [];
  private eggsShown: number[] = [];
  private standers = new Map<string, number>();
  private layout: NestLayout | null = null;
  /** The layout the ants walk in: only the dug chambers with their eased sizes. */
  private walkLayout: NestLayout | null = null;
  private walkSig = '';
  private plates: Plate[] = [];
  private platesSig = '';
  /** Per shown chamber of this frame: has it reached its target size? */
  private settled: boolean[] = [];
  /** Rims and interiors (with the crumbs of full pantries) of the settled chambers, when there are many chambers. */
  private chamberLayers: { sig: string; rim: CanvasLike; inner: CanvasLike; ids: Set<string>; contents: Set<string> } | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private world: World,
    private make: CanvasFactory = defaultMake,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.scene = make(NEST_W, NEST_H);
    this.sceneCtx = this.contextOf(this.scene);
    this.antSprites = new AntSprites(make);
    this.callowSprites = new AntSprites(make, CALLOW_RGBA);
    this.resize();
  }

  /** Where the scene (width x height layout units) lies on the canvas (device pixels), for tests and hit mapping. */
  get metrics(): { zoom: number; ox: number; oy: number; width: number; height: number } {
    return { zoom: this.zoom, ox: this.ox, oy: this.oy, width: this.sw, height: this.sh };
  }

  private contextOf(c: CanvasLike): Ctx2D {
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    return ctx;
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

  /** How far the digging of a chamber has come: 0..1 (1 = dug, also for chambers that were there from the start); undefined = not needed. */
  digProgress(id: string): number | undefined {
    const d = this.digs.get(id);
    if (!d) return undefined;
    return Math.max(0, Math.min(1, (this.t - d.at) / DIG_S));
  }

  /** Last computed layout (target sizes, every needed chamber). */
  get currentLayout(): NestLayout | null {
    return this.layout;
  }

  /** How many standing ants the last draw() drew in a chamber (at most MAX_STANDERS). */
  standersIn(id: string): number {
    return this.standers.get(id) ?? 0;
  }

  /** The label plates drawn by the last draw(). */
  get labelPlatesShown(): readonly Plate[] {
    return this.plates;
  }

  /** Sizes the canvas to its CSS size x devicePixelRatio and picks the zoom (nestZoom). */
  resize(): void {
    const dpr = typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
    const css = (v: number | undefined, fallback: number | undefined): number => Math.max(0, finite(v || fallback || 0));
    const cssW = css(this.canvas.clientWidth, typeof window !== 'undefined' ? window.innerWidth : 0);
    const cssH = css(this.canvas.clientHeight, typeof window !== 'undefined' ? window.innerHeight : 0);
    this.canvas.width = this.cw = Math.round(cssW * dpr);
    this.canvas.height = this.ch = Math.round(cssH * dpr);
    this.place();
  }

  /** Zoom and offsets of the scene on the canvas. */
  private place(): void {
    this.zoom = nestZoom(this.cw, this.ch, this.sw, this.sh);
    this.ox = Math.floor((this.cw - this.sw * this.zoom) / 2);
    this.oy = Math.floor((this.ch - this.sh * this.zoom) / 2);
  }

  /** The nest grew (or another colony has another size): a new scene canvas, backdrop and vignette, then the zoom again. */
  private setSceneSize(w: number, h: number): void {
    this.sw = w;
    this.sh = h;
    this.scene = this.make(w, h);
    this.sceneCtx = this.contextOf(this.scene);
    this.backdrop = null;
    this.vignette = null;
    this.tunnelLayers = null;
    this.chamberLayers = null;
    this.platesSig = '';
    this.place();
  }

  /** Call when the view is shown again: every chamber that exists is shown at once, without digging (the ants need no catching up). */
  enter(): void {
    this.drawnOnce = false;
  }

  draw(dt: number): void {
    const step = Math.min(Math.max(finite(dt), 0), 0.25);
    this.t += step;
    const w = this.world;
    const seed = Math.round(finite(w.seed)) | 0;
    if (this.digSeed !== seed) {
      // another colony (new game): forget everything about the old nest
      this.digs.clear();
      this.shown.clear();
      this.shaftN = 0;
      this.digSeed = seed;
      this.drawnOnce = false;
    }
    const need = needsOf(w);
    const layout = nestLayout({
      seed,
      queens: need.queens,
      pantries: need.pantries,
      larvaeChambers: need.larvaeChambers,
      loads: { ants: w.ants.length, pantry: need.pantry, larvae: need.larvae },
      sizeLoads: { ants: Math.max(finite(w.peakAnts), w.ants.length), pantry: need.sizePantry, larvae: need.sizeLarvae },
      width: NEST_W,
      height: NEST_H,
      unbounded: w.mode === 'normal',
    });
    this.layout = layout;
    this.larvaFills = need.larvae;
    if (layout.width !== this.sw || layout.height !== this.sh) this.setSceneSize(layout.width, layout.height);
    this.updateDigs(layout);

    const shown: Chamber[] = [];
    this.settled.length = 0;
    for (const c of layout.chambers) {
      const d = this.digs.get(c.id)!;
      if (this.t - d.at < DIG_S) continue; // still being dug: not a room yet
      let s = this.shown.get(c.id);
      if (!s) {
        s = d.at === -Infinity ? { rx: c.rx, ry: c.ry } : { rx: 0, ry: 0 };
        this.shown.set(c.id, s);
      }
      s.rx = smoothToward(s.rx, c.rx, step, GROW_RATE);
      s.ry = smoothToward(s.ry, c.ry, step, GROW_RATE);
      shown.push({ ...c, rx: s.rx, ry: s.ry });
      this.settled.push(s.rx === c.rx && s.ry === c.ry);
    }
    this.drawnOnce = true;

    this.placeNestAnts(layout, shown);
    this.compose(layout, shown);
    this.present();
  }

  // ---- digging ---------------------------------------------------------------------------------------------------------------

  private updateDigs(layout: NestLayout): void {
    const first = !this.drawnOnce;
    const shaft = layout.tunnels[0];
    if (first) {
      this.shaftN = shaft.points.length;
      for (const c of layout.chambers) this.digs.set(c.id, { at: -Infinity, extFrom: shaft.points.length, extTo: shaft.points.length });
      return;
    }
    let grew = false;
    for (const c of layout.chambers) {
      if (this.digs.has(c.id)) continue;
      // the first new chamber of a frame also digs the deeper part of the shaft that it branches from
      const ext: boolean = !grew && shaft.points.length > this.shaftN;
      grew ||= ext;
      this.digs.set(c.id, { at: this.t, extFrom: ext ? this.shaftN : shaft.points.length, extTo: shaft.points.length });
    }
    if (shaft.points.length > this.shaftN && !grew) this.shaftN = shaft.points.length;
    // a dug shaft stays dug; a chamber that is dug completes the shaft part it needed
    for (const d of this.digs.values()) if (this.t - d.at >= DIG_S && d.extTo > this.shaftN) this.shaftN = d.extTo;
  }

  // ---- composition ----------------------------------------------------------------------------------------------------------

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

  /** The tunnel that leads to a chamber (a map built once per tunnels array: hundreds of chambers in normal mode). */
  private tunnelTo(layout: NestLayout, id: string): Tunnel {
    if (this.tunnelIndex?.of !== layout.tunnels) {
      const map = new Map<string, Tunnel>();
      for (const t of layout.tunnels) map.set(t.to, t);
      this.tunnelIndex = { of: layout.tunnels, map };
    }
    return this.tunnelIndex.map.get(id)!;
  }

  /** The tunnels that are dug completely: the shaft down to what is dug, and the tunnel of every finished chamber. */
  private dugTunnels(layout: NestLayout): Tunnel[] {
    const out: Tunnel[] = [slice(layout.tunnels[0], Math.min(this.shaftN, layout.tunnels[0].points.length))];
    for (const c of layout.chambers) {
      const d = this.digs.get(c.id);
      if (d && this.t - d.at >= DIG_S) out.push(this.tunnelTo(layout, c.id));
    }
    return out;
  }

  private ensureStatic(layout: NestLayout, dug: Tunnel[]): void {
    const seed = layout.seed;
    if (!this.backdrop || this.backdropSeed !== seed) {
      this.backdrop = this.canvasFrom(renderBackdrop(this.sw, this.sh, seed, { w: NEST_W, h: NEST_H }), this.sw, this.sh);
      this.backdropSeed = seed;
      this.tint = colonyTint(seed);
      this.tunnelLayers = null;
    }
    if (!this.vignette) this.vignette = this.canvasFrom({ data: vignettePixels(this.sw, this.sh) }, this.sw, this.sh);
    const sig = `${layout.key}|${dug.map((t) => `${t.to}:${t.points.length}`).join(',')}`;
    if (this.tunnelLayers?.sig !== sig) {
      const mouth = layout.entrance.y - MOUTH_RISE;
      const rim = this.make(this.sw, this.sh);
      const inner = this.make(this.sw, this.sh);
      const rc = rim.getContext('2d');
      const ic = inner.getContext('2d');
      if (rc) paintTunnelRims(rc, dug, mouth, this.tint!);
      if (ic) paintTunnelInteriors(ic, dug, mouth, this.tint!);
      this.tunnelLayers = { sig, rim, inner };
    }
  }

  /** The tunnels that are being dug right now, cut at the head. Also gives the heads for the flying soil. */
  private diggingTunnels(layout: NestLayout, heads: { p: Pt; dx: number; dy: number }[]): Tunnel[] {
    const out: Tunnel[] = [];
    const shaft = layout.tunnels[0];
    for (const c of layout.chambers) {
      const d = this.digs.get(c.id)!;
      const u = (this.t - d.at) / DIG_S;
      if (u >= 1 || u < 0) continue;
      const tun = this.tunnelTo(layout, c.id);
      const extLen = Math.max(0, d.extTo - d.extFrom);
      const frac = extLen > 0 ? extLen / (extLen + tun.points.length) : 0;
      let part: Tunnel;
      if (u < frac) {
        const n = Math.max(d.extFrom, Math.round(d.extFrom + (extLen * u) / frac));
        part = slice(shaft, Math.min(n, shaft.points.length));
      } else {
        if (extLen > 0) out.push(slice(shaft, Math.min(d.extTo, shaft.points.length)));
        const v = frac >= 1 ? 1 : (u - frac) / (1 - frac);
        part = slice(tun, Math.max(2, Math.round(tun.points.length * v)));
      }
      out.push(part);
      const n = part.points.length;
      const head = part.points[n - 1];
      const back = part.points[Math.max(0, n - 4)];
      const L = Math.hypot(head.x - back.x, head.y - back.y) || 1;
      heads.push({ p: head, dx: (head.x - back.x) / L, dy: (head.y - back.y) / L });
    }
    return out;
  }

  private compose(layout: NestLayout, shown: Chamber[]): void {
    const dug = this.dugTunnels(layout);
    this.ensureStatic(layout, dug);
    const tint = this.tint!;
    const c = this.sceneCtx;
    const mouth = layout.entrance.y - MOUTH_RISE;
    c.imageSmoothingEnabled = false;
    c.drawImage(this.backdrop as unknown as CanvasImageSource, 0, 0);
    const layers = this.tunnelLayers!;
    const heads: { p: Pt; dx: number; dy: number }[] = [];
    const digging = this.diggingTunnels(layout, heads);
    const cached = shown.length > CACHE_CHAMBERS_ABOVE ? this.cachedChambers(layout, shown) : null;
    c.drawImage(layers.rim as unknown as CanvasImageSource, 0, 0);
    if (digging.length) paintTunnelRims(c, digging, mouth, tint);
    if (cached) c.drawImage(cached.rim as unknown as CanvasImageSource, 0, 0);
    for (const ch of shown) if (ch.rx > 0.6 && !cached?.ids.has(ch.id)) paintChamberRim(c, ch, ch.rx, ch.ry, tint);
    c.drawImage(layers.inner as unknown as CanvasImageSource, 0, 0);
    if (digging.length) paintTunnelInteriors(c, digging, mouth, tint);
    if (cached) c.drawImage(cached.inner as unknown as CanvasImageSource, 0, 0);
    for (const ch of shown) if (ch.rx > 0.6 && !cached?.ids.has(ch.id)) paintChamberInterior(c, ch, ch.rx, ch.ry, tint);

    for (const ch of shown) {
      if (ch.rx < ch.rxMax * 0.4) continue;
      if (ch.kind === 'queen') this.drawQueen(c, ch);
      else if (ch.kind === 'pantry' && !cached?.contents.has(ch.id)) this.drawPantry(c, ch);
    }
    this.drawDust(c, heads);
    this.drawNestAnts(c, shown);
    // the larvae are drawn over the ants: a crowd never hides them
    for (const ch of shown) if (ch.kind === 'larvae' && ch.rx >= ch.rxMax * 0.4) this.drawLarvae(c, ch, layout);
    c.drawImage(this.vignette as unknown as CanvasImageSource, 0, 0);
    this.drawLabels(c, layout, shown, dug);
  }

  /**
   * The cached layers of the settled chambers (a chamber is settled once its shown size reached the target). Chambers never
   * overlap, so painting them into a layer drawn at the place of the per-chamber pass gives the same picture. A full pantry's
   * crumbs go with it (they only change while it fills or empties). Repainted only when that set or a size changes.
   */
  private cachedChambers(layout: NestLayout, shown: Chamber[]): { rim: CanvasLike; inner: CanvasLike; ids: Set<string>; contents: Set<string> } {
    let sig = layout.key;
    for (let i = 0; i < shown.length; i++) {
      const ch = shown[i];
      if (!this.settled[i] || ch.rx <= 0.6) continue;
      const full = ch.kind === 'pantry' && ch.load >= PANTRY_CAPACITY && ch.rx >= ch.rxMax * 0.4;
      sig += `|${ch.id}:${ch.rx.toFixed(2)}:${ch.ry.toFixed(2)}${full ? 'f' : ''}`;
    }
    if (this.chamberLayers?.sig === sig) return this.chamberLayers;
    const rim = this.chamberLayers?.rim ?? this.make(this.sw, this.sh);
    const inner = this.chamberLayers?.inner ?? this.make(this.sw, this.sh);
    const rc = this.contextOf(rim);
    const ic = this.contextOf(inner);
    rc.clearRect(0, 0, this.sw, this.sh);
    ic.clearRect(0, 0, this.sw, this.sh);
    const ids = new Set<string>();
    const contents = new Set<string>();
    const tint = this.tint!;
    for (let i = 0; i < shown.length; i++) {
      const ch = shown[i];
      if (!this.settled[i] || ch.rx <= 0.6) continue;
      ids.add(ch.id);
      paintChamberRim(rc, ch, ch.rx, ch.ry, tint);
      paintChamberInterior(ic, ch, ch.rx, ch.ry, tint);
    }
    for (let i = 0; i < shown.length; i++) {
      const ch = shown[i];
      if (!ids.has(ch.id) || ch.kind !== 'pantry' || ch.load < PANTRY_CAPACITY || ch.rx < ch.rxMax * 0.4) continue;
      contents.add(ch.id);
      this.drawPantry(ic, ch);
    }
    this.chamberLayers = { sig, rim, inner, ids, contents };
    return this.chamberLayers;
  }

  private present(): void {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = VOID_COLOR;
    c.fillRect(0, 0, this.cw, this.ch);
    if (this.cw < 1 || this.ch < 1) return;
    // whole zooms stay crisp; a grown scene scaled down to fit is smoothed (dropping rows and columns would shred it)
    c.imageSmoothingEnabled = this.zoom < 1;
    c.drawImage(this.scene as unknown as CanvasImageSource, this.ox, this.oy, this.sw * this.zoom, this.sh * this.zoom);
  }

  /** A few crumbs of soil thrown back from the head of every tunnel that is being dug. */
  private drawDust(c: Ctx2D, heads: { p: Pt; dx: number; dy: number }[]): void {
    for (const h of heads) {
      for (let k = 0; k < 4; k++) {
        const ph = (this.t * 2.4 + k * 0.25) % 1;
        const x = Math.round(h.p.x - h.dx * ph * 7 + (k - 1.5) * ph * 1.4);
        const y = Math.round(h.p.y - h.dy * ph * 7 - ph * (1 - ph) * 9 + ph * ph * 4);
        c.fillStyle = `rgba(${k % 2 ? '125,98,68' : '90,66,44'},${(1 - ph).toFixed(2)})`;
        c.fillRect(x, y, 1, 1);
      }
    }
  }

  private drawQueen(c: Ctx2D, ch: Chamber): void {
    const index = ch.index;
    const frame = Math.floor((((this.t + index * 0.9) % BOB_PERIOD) / BOB_PERIOD) * BOB.length) % BOB.length;
    const dy = BOB[frame];
    const x = Math.round(ch.cx);
    const y = floorY(ch, ch.ry) - 12 + dy;
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
    const ex = flip ? Math.round(ch.cx + ch.rx * 0.3) : Math.round(ch.cx - ch.rx * 0.3 - 9);
    const n = this.eggsShown[index] ?? 0;
    paintEggPile(c, ex, floorY(ch, ch.ry) - 3, n + (frame === 1 && n < 6 ? 1 : 0));
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

  private drawLarvae(c: Ctx2D, ch: Chamber, layout: NestLayout): void {
    const n = Math.min(MAX_SHOWN_LARVAE, Math.max(0, Math.floor(finite(this.larvaFills[ch.index] ?? 0))));
    if (n === 0) return;
    const slots = larvaSlots(n);
    const half = LARVA_SIZE / 2;
    const frac = Math.max(0, Math.min(1, finite(this.world.hatchFraction)));
    const here = { cx: ch.cx, cy: ch.cy, rx: ch.rx, ry: ch.ry, lobes: ch.lobes };
    void layout;
    slots.forEach((s, k) => {
      if (!insideChamber(here, ch.cx + s.dx, ch.cy + s.dy, -3)) return;
      const x = Math.round(ch.cx + s.dx);
      const y = Math.round(ch.cy + s.dy);
      const frame = Math.floor(this.t * 1.3 + ((k * 0.618) % 1) * 2) % LARVA_FRAMES;
      if (k === 0 && ch.index === 0) {
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
    const fill = Math.max(0, finite(ch.load));
    const n = Math.min(MAX_CRUMBS, Math.ceil(fill * 3.2));
    if (n > 0) {
      this.crumbs ??= pantryCrumbs(MAX_CRUMBS);
      paintCrumbs(c, ch, ch.rx, ch.ry, this.crumbs.slice(0, n));
    }
    if (fill >= 20) paintFlyRemains(c, ch, ch.rx, ch.ry);
  }

  /** Plates of the labels, drawn last (above ants, larvae and crumbs). */
  private drawLabels(c: Ctx2D, layout: NestLayout, shown: Chamber[], dug: Tunnel[]): void {
    const sig = `${layout.key}|${shown.map((s) => s.id).join(',')}`;
    if (this.platesSig !== sig) {
      // too many chambers for plates: skip the search among them (labelPlates would give none)
      this.plates =
        shown.length > MAX_LABELED_CHAMBERS
          ? []
          : labelPlates(layout.chambers.filter((x) => shown.some((s) => s.id === x.id)), dug, this.sw, this.sh, layout.surfaceY);
      this.platesSig = sig;
    }
    for (const p of this.plates) {
      const s = this.shown.get(p.id);
      if (!s || s.rx < 3) continue;
      c.fillStyle = 'rgba(18,10,5,.92)';
      c.fillRect(p.x, p.y, p.w, p.h);
      c.fillStyle = 'rgba(120,88,52,.9)';
      c.fillRect(p.x, p.y, p.w, 1);
      drawText(c, p.text, p.x + 2, p.y + 2, '#ecdcb0', '#120a05');
    }
  }

  // ---- the ants inside ------------------------------------------------------------------------------------------------------

  /** Eggs in the pile of one queen before the nurses take any: grows with the number of queens and the hatch progress (2..6). */
  private baseEggs(queens: number): number {
    const frac = Math.max(0, Math.min(1, finite(this.world.hatchFraction)));
    return 2 + Math.min(2, Math.floor(queens / 3)) + Math.floor(frac * 1.99);
  }

  /** The layout the ants walk in: dug chambers (eased sizes) and dug tunnels; rebuilt only when the set of dug parts changes. */
  private walkIn(layout: NestLayout, shown: Chamber[]): NestLayout {
    const dug = this.dugTunnels(layout);
    const sig = `${layout.key}|${shown.map((s) => s.id).join(',')}|${dug.map((t) => t.points.length).join(',')}`;
    if (this.walkSig !== sig || !this.walkLayout) {
      this.walkLayout = { ...layout, key: sig, chambers: shown, tunnels: dug };
      this.walkSig = sig;
    }
    this.walkLayout.chambers = shown;
    return this.walkLayout;
  }

  /** Poses of the first MAX_DRAWN_NEST_ANTS ants whose state is 'nest', sorted by y; counts the eggs nurses carry away. */
  private placeNestAnts(layout: NestLayout, shown: Chamber[]): void {
    const w = this.world;
    const sl = this.walkIn(layout, shown);
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
      this.majors[n] = a.major === true;
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

  private drawNestAnts(c: Ctx2D, shown: Chamber[]): void {
    this.standers.clear();
    for (let k = 0; k < this.drawn; k++) {
      const p = this.poses[this.order[k]];
      if (p.pose !== 'walk') {
        // standing ants gather at the edges of a chamber; no more than MAX_STANDERS of them are drawn in one
        const room = shown.find((s) => insideChamber(s, p.x, p.y, 1));
        if (room) {
          const n = (this.standers.get(room.id) ?? 0) + 1;
          if (n > MAX_STANDERS) continue;
          this.standers.set(room.id, n);
        }
      }
      const sprites = p.callow ? this.callowSprites : this.antSprites;
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      const img = sprites.get(p.dir16, p.frame, p.carrying === 'crumb') as unknown as CanvasImageSource;
      if (this.majors[this.order[k]]) {
        // a major: the same sprite MAJOR_SCALE times larger (whole fine pixels), centred on the same point
        const size = Math.round(ANT_SIZE * MAJOR_SCALE);
        const off = Math.round((ANT_CENTER + 0.5) * MAJOR_SCALE - 0.5);
        c.drawImage(img, x - off, y - off, size, size);
      } else {
        c.drawImage(img, x - 12, y - 12);
      }
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
