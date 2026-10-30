import type { Terrain } from '../sim/terrain';
import { isAlive } from '../sim/food';
import type { Ant, World } from '../sim/world';
import type { Camera } from '../ui/camera';
import { SPIDER_WEB_R } from '../sim/constants';
import { bodyPos } from '../sim/spider';
import { ANT_FRAMES, antDirection } from './antArt';
import { BEETLE_FRAMES, BEETLE_STRIDE_ART_PX, CATERPILLAR_FRAMES, CATERPILLAR_STRIDE_ART_PX } from './preyAnim';
import { drawPreyItem, drawPuff, isFleeing, isHopping, isLiving, PreySprites } from './preySprites';
import { drawSpider, drawWeb } from './spiderArt';
import { advanceStride, frameFor, type StrideState } from './stride';
import { AntSprites, drawAnt, drawQueen, MAJOR_SCALE } from './sprites';
import { extendTerrainCanvas, isGrowthOf, renderTerrain, terrainStep, type CanvasFactory, type CanvasLike } from './terrainRender';
import {
  buildHomeGlowCanvas,
  buildSurfaceOverlayCanvas,
  pheromoneAlpha,
  PHEROMONE_DARK,
  TERRAIN_DARK,
  TRAIL_RGB,
} from './views';

const defaultMake: CanvasFactory = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

const byY = (p: Ant, q: Ant): number => p.y - q.y;

export interface QueenState {
  visible: boolean;
  x: number;
  y: number;
  digProgress: number;
}

export type View = 'normal' | 'pheromone' | 'terrain';

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private view: View = 'normal';
  private terrainCanvas: CanvasLike | null = null;
  private terrainRef: Terrain | null = null;
  private dpr = 1;
  private cssW = 1;
  private cssH = 1;
  private vignette: CanvasGradient | null = null;
  private sorted: Ant[] = [];
  private glowCanvas: CanvasLike | null = null;
  /** Map size (art pixels) the glow and trail canvases were built for; they are rebuilt when the map grows. */
  private viewCanvasW = 0;
  private viewCanvasH = 0;
  private overlayCanvas: CanvasLike | null = null;
  private overlayRef: Terrain | null = null;
  private queen: QueenState | null = null;
  /** Offscreen map-sized canvas + reused pixel buffer for the pheromone trail (one pixel per cell). */
  private trailCanvas: CanvasLike | null = null;
  private trailImage: ImageData | null = null;
  private antSprites: AntSprites | null = null;
  /** Walking-animation state per ant id; entries of ants that are gone are pruned by generation. */
  private strides = new Map<number, StrideState>();
  private strideGen = 0;
  /** Living-prey sprites, the beetles' walking state (by food id, pruned by generation) and the dust puffs of killed ants. */
  private preySprites: PreySprites | null = null;
  private foodStrides = new Map<number, StrideState>();
  private foodGen = 0;
  private lastKilled = -1;
  private puffs: { x: number; y: number; t0: number }[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private world: World,
    private camera: Camera,
    private make: CanvasFactory = defaultMake,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.resize();
  }

  setView(v: View): void {
    this.view = v;
  }

  /** Intro queen (drawn above terrain/food, below ants); null or invisible = nothing. */
  setQueen(q: QueenState | null): void {
    this.queen = q;
  }

  getView(): View {
    return this.view;
  }

  /** Syncs the backing store to CSS size x devicePixelRatio and informs the camera (CSS pixels). */
  resize(): void {
    this.dpr = window.devicePixelRatio || 1;
    this.cssW = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    this.cssH = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    this.vignette = null;
    this.camera.resize(this.cssW, this.cssH);
  }

  draw(): void {
    const c = this.ctx;
    const { zoom } = this.camera;
    const w = this.canvas.width;
    const h = this.canvas.height;

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#1a120b';
    c.fillRect(0, 0, w, h);
    c.imageSmoothingEnabled = false;

    const terrain = this.world.terrain;
    if (this.terrainRef !== terrain || !this.terrainCanvas) {
      // Map growth keeps the ground already painted and adds only the new strips (cheap, nothing on screen changes).
      const prev = this.terrainRef;
      this.terrainCanvas =
        this.terrainCanvas && prev && isGrowthOf(prev, terrain)
          ? extendTerrainCanvas(this.terrainCanvas, terrain, terrainStep(prev), this.make)
          : renderTerrain(terrain, this.make);
      this.terrainRef = terrain;
    }

    // CSS px -> device px, then camera.
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.translate(this.cssW / 2 - this.camera.x * zoom, this.cssH / 2 - this.camera.y * zoom);
    c.scale(zoom, zoom);
    c.imageSmoothingEnabled = false;

    // The terrain canvas is on the fine grid (terrain.w*FINE x terrain.h*FINE); drawn into world space (art pixels) with
    // smoothing off, one fine pixel is half an art pixel, the same pixel size as the ants and sprites.
    c.drawImage(this.terrainCanvas as unknown as CanvasImageSource, 0, 0, this.world.terrain.w, this.world.terrain.h);

    if (this.view === 'pheromone') this.drawPheromoneView(c);
    else if (this.view === 'terrain') this.drawTerrainView(c);
    else {
      this.drawFoodLayer(c);
      const q = this.queen;
      if (q?.visible) drawQueen(c, q.x, q.y, q.digProgress);
      // The spider's web lies on the ground under the ants; the spider sits on it, also under the ants.
      const sp = this.world.spider;
      const halfW = this.cssW / 2 / zoom + SPIDER_WEB_R;
      const halfH = this.cssH / 2 / zoom + SPIDER_WEB_R;
      if (sp?.alive && Math.abs(sp.x - this.camera.x) <= halfW && Math.abs(sp.y - this.camera.y) <= halfH) {
        drawWeb(c, sp.x, sp.y, SPIDER_WEB_R, this.world.time);
        drawSpider(c, bodyPos(sp).x, bodyPos(sp).y);
      }

      const ants = this.sorted;
      ants.length = 0;
      for (const a of this.world.ants) {
        // an ant underground is not on the surface; it has no stride entry either, so it comes out with a fresh gait
        if (a.state === 'nest') this.strides.delete(a.id);
        else ants.push(a);
      }
      ants.sort(byY);
      const sprites = (this.antSprites ??= new AntSprites(this.make));
      const gen = ++this.strideGen;
      for (const a of ants) {
        const st = advanceStride(this.strides.get(a.id), a.x, a.y);
        st.gen = gen;
        this.strides.set(a.id, st);
        drawAnt(c, sprites, a.x, a.y, antDirection(a.heading), frameFor(st.phase, ANT_FRAMES), a.carry > 0, a.major ? MAJOR_SCALE : 1);
      }
      if (this.strides.size > ants.length) {
        const kills = this.lastKilled >= 0 ? this.world.antsKilled - this.lastKilled : 0;
        for (const [id, st] of this.strides) {
          if (st.gen === gen) continue;
          this.strides.delete(id);
          if (kills > 0) this.puffIfKilled(st.x, st.y);
        }
      }
      this.drawPuffs(c);
    }
    this.lastKilled = this.world.antsKilled;

    // Vignette in screen space.
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (!this.vignette) {
      const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.hypot(w, h) * 0.55);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(8,5,2,.45)');
      this.vignette = g;
    }
    c.fillStyle = this.vignette;
    c.fillRect(0, 0, w, h);
  }

  /** Food, living prey and corpses; a hopping fly is drawn last so it is never hidden by other food. */
  private drawFoodLayer(c: CanvasRenderingContext2D): void {
    const spr = (this.preySprites ??= new PreySprites(this.make));
    const food = this.world.food;
    const time = this.world.time;
    const gen = ++this.foodGen;
    let hopping = false;
    let beetles = 0;
    for (const f of food) {
      if (isHopping(f)) {
        hopping = true;
        continue;
      }
      let frame = 0;
      if (isLiving(f) && (f.kind === 'beetle' || f.kind === 'caterpillar')) {
        // distance-driven animation: a beetle's legs, a caterpillar's body wave (twice as fast per distance while it flees)
        const cat = f.kind === 'caterpillar';
        const stride = cat ? (isFleeing(f) ? CATERPILLAR_STRIDE_ART_PX / 2 : CATERPILLAR_STRIDE_ART_PX) : BEETLE_STRIDE_ART_PX;
        const st = advanceStride(this.foodStrides.get(f.id), f.x, f.y, stride);
        st.gen = gen;
        this.foodStrides.set(f.id, st);
        frame = frameFor(st.phase, cat ? CATERPILLAR_FRAMES : BEETLE_FRAMES);
        beetles++;
      }
      drawPreyItem(c, spr, f, frame, time);
    }
    if (hopping) for (const f of food) if (isHopping(f)) drawPreyItem(c, spr, f, 0, time);
    if (this.foodStrides.size > beetles) {
      for (const [id, st] of this.foodStrides) if (st.gen !== gen) this.foodStrides.delete(id);
    }
  }

  /** An ant that vanished right next to a living beetle on a draw where the kill counter went up: a little dust where it stood. */
  private puffIfKilled(x: number, y: number): void {
    for (const f of this.world.food) {
      if (isAlive(f) && f.kind === 'beetle' && Math.hypot(f.x - x, f.y - y) <= 14) {
        this.puffs.push({ x, y, t0: this.world.time });
        return;
      }
    }
  }

  private drawPuffs(c: CanvasRenderingContext2D): void {
    const now = this.world.time;
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      const age = now - p.t0;
      if (age < 0 || age >= 0.4) this.puffs.splice(i, 1);
      else drawPuff(c, p.x, p.y, age);
    }
  }

  private drawPheromoneView(c: CanvasRenderingContext2D): void {
    const { w, h, data } = this.world.pher; // replaced by a bigger instance when the map grows: read it fresh
    if (this.viewCanvasW !== w || this.viewCanvasH !== h) {
      this.viewCanvasW = w;
      this.viewCanvasH = h;
      this.glowCanvas = null;
      this.trailCanvas = null;
      this.trailImage = null;
    }
    c.fillStyle = PHEROMONE_DARK;
    c.fillRect(0, 0, w, h);
    this.glowCanvas ??= buildHomeGlowCanvas(this.make, w, h);
    c.drawImage(this.glowCanvas as unknown as CanvasImageSource, 0, 0);

    // Trail: only cells inside the visible world rectangle, one art pixel each.
    const { zoom, x: camX, y: camY } = this.camera;
    const halfW = this.cssW / 2 / zoom;
    const halfH = this.cssH / 2 / zoom;
    const x0 = Math.max(0, Math.floor(camX - halfW));
    const x1 = Math.min(w - 1, Math.ceil(camX + halfW));
    const y0 = Math.max(0, Math.floor(camY - halfH));
    const y1 = Math.min(h - 1, Math.ceil(camY + halfH));
    if (!this.trailCanvas) {
      this.trailCanvas = this.make(w, h);
      this.trailImage = null;
    }
    const tc = this.trailCanvas.getContext('2d');
    if (tc) {
      this.trailImage ??= tc.createImageData(w, h);
      const buf = this.trailImage.data;
      buf.fill(0);
      for (let y = y0; y <= y1; y++) {
        const row = y * w;
        for (let x = x0; x <= x1; x++) {
          const a = pheromoneAlpha(data[row + x]);
          if (a === 0) continue;
          const o = (row + x) * 4;
          buf[o] = TRAIL_RGB[0];
          buf[o + 1] = TRAIL_RGB[1];
          buf[o + 2] = TRAIL_RGB[2];
          buf[o + 3] = Math.round(a * 255);
        }
      }
      tc.putImageData(this.trailImage, 0, 0);
      c.imageSmoothingEnabled = false;
      c.drawImage(this.trailCanvas as unknown as CanvasImageSource, 0, 0);
    }

    for (const f of this.world.food) {
      const fx = Math.round(f.x);
      const fy = Math.round(f.y);
      c.fillStyle = 'rgba(127,209,255,.18)';
      c.beginPath();
      c.arc(fx, fy, 5, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#d8f3ff';
      c.fillRect(fx - 1, fy - 1, 3, 3);
    }

    c.fillStyle = '#ffffff';
    for (const a of this.world.ants) {
      if (a.state === 'nest') continue;
      const ax = Math.round(a.x);
      const ay = Math.round(a.y);
      c.fillRect(ax - 1, ay, 3, 1);
      c.fillRect(ax, ay - 1, 1, 3);
    }
  }

  private drawTerrainView(c: CanvasRenderingContext2D): void {
    c.fillStyle = TERRAIN_DARK;
    c.fillRect(0, 0, this.world.terrain.w, this.world.terrain.h);
    if (this.overlayRef !== this.world.terrain || !this.overlayCanvas) {
      this.overlayRef = this.world.terrain;
      this.overlayCanvas = buildSurfaceOverlayCanvas(this.world.terrain, this.make);
    }
    c.globalAlpha = 0.8;
    c.drawImage(this.overlayCanvas as unknown as CanvasImageSource, 0, 0);
    c.globalAlpha = 1;

    c.fillStyle = 'rgba(127,209,255,.9)';
    for (const a of this.world.ants) if (a.state !== 'nest') c.fillRect(Math.round(a.x), Math.round(a.y), 1, 1);
  }
}
