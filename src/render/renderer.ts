import { WORLD_H, WORLD_W } from '../sim/constants';
import type { Terrain } from '../sim/terrain';
import type { Ant, World } from '../sim/world';
import type { Camera } from '../ui/camera';
import { drawAnt, drawFood, drawQueen } from './sprites';
import { renderTerrain, type CanvasFactory, type CanvasLike } from './terrainRender';
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
  private overlayCanvas: CanvasLike | null = null;
  private overlayRef: Terrain | null = null;
  private queen: QueenState | null = null;
  /** Offscreen WORLD_W x WORLD_H canvas + reused pixel buffer for the pheromone trail (one pixel per cell). */
  private trailCanvas: CanvasLike | null = null;
  private trailImage: ImageData | null = null;

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

    if (this.terrainRef !== this.world.terrain || !this.terrainCanvas) {
      this.terrainRef = this.world.terrain;
      this.terrainCanvas = renderTerrain(this.world.terrain, this.make);
    }

    // CSS px -> device px, then camera.
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.translate(this.cssW / 2 - this.camera.x * zoom, this.cssH / 2 - this.camera.y * zoom);
    c.scale(zoom, zoom);
    c.imageSmoothingEnabled = false;

    c.drawImage(this.terrainCanvas as unknown as CanvasImageSource, 0, 0, WORLD_W, WORLD_H);

    if (this.view === 'pheromone') this.drawPheromoneView(c);
    else if (this.view === 'terrain') this.drawTerrainView(c);
    else {
      for (const f of this.world.food) drawFood(c, f.kind, f.x, f.y);
      const q = this.queen;
      if (q?.visible) drawQueen(c, Math.round(q.x), Math.round(q.y), q.digProgress);

      const ants = this.sorted;
      ants.length = 0;
      for (const a of this.world.ants) ants.push(a);
      ants.sort(byY);
      for (const a of ants) drawAnt(c, a.x, a.y, Math.cos(a.heading) >= 0 ? 1 : -1, a.carry > 0);
    }

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

  private drawPheromoneView(c: CanvasRenderingContext2D): void {
    c.fillStyle = PHEROMONE_DARK;
    c.fillRect(0, 0, WORLD_W, WORLD_H);
    this.glowCanvas ??= buildHomeGlowCanvas(this.make);
    c.drawImage(this.glowCanvas as unknown as CanvasImageSource, 0, 0);

    // Trail: only cells inside the visible world rectangle, one art pixel each.
    const { zoom, x: camX, y: camY } = this.camera;
    const halfW = this.cssW / 2 / zoom;
    const halfH = this.cssH / 2 / zoom;
    const { w, h, data } = this.world.pher;
    const x0 = Math.max(0, Math.floor(camX - halfW));
    const x1 = Math.min(w - 1, Math.ceil(camX + halfW));
    const y0 = Math.max(0, Math.floor(camY - halfH));
    const y1 = Math.min(h - 1, Math.ceil(camY + halfH));
    if (!this.trailCanvas) {
      this.trailCanvas = this.make(WORLD_W, WORLD_H);
      this.trailImage = null;
    }
    const tc = this.trailCanvas.getContext('2d');
    if (tc) {
      this.trailImage ??= tc.createImageData(WORLD_W, WORLD_H);
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
      const ax = Math.round(a.x);
      const ay = Math.round(a.y);
      c.fillRect(ax - 1, ay, 3, 1);
      c.fillRect(ax, ay - 1, 1, 3);
    }
  }

  private drawTerrainView(c: CanvasRenderingContext2D): void {
    c.fillStyle = TERRAIN_DARK;
    c.fillRect(0, 0, WORLD_W, WORLD_H);
    if (this.overlayRef !== this.world.terrain || !this.overlayCanvas) {
      this.overlayRef = this.world.terrain;
      this.overlayCanvas = buildSurfaceOverlayCanvas(this.world.terrain, this.make);
    }
    c.globalAlpha = 0.8;
    c.drawImage(this.overlayCanvas as unknown as CanvasImageSource, 0, 0);
    c.globalAlpha = 1;

    c.fillStyle = 'rgba(127,209,255,.9)';
    for (const a of this.world.ants) c.fillRect(Math.round(a.x), Math.round(a.y), 1, 1);
  }
}
