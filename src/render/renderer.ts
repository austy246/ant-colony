import { WORLD_H, WORLD_W } from '../sim/constants';
import type { Terrain } from '../sim/terrain';
import type { Ant, World } from '../sim/world';
import type { Camera } from '../ui/camera';
import { drawAnt, drawFood } from './sprites';
import { renderTerrain, type CanvasLike } from './terrainRender';

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

  constructor(
    private canvas: HTMLCanvasElement,
    private world: World,
    private camera: Camera,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.resize();
  }

  setView(v: View): void {
    this.view = v; // pheromone / terrain views are added in the next task
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
      this.terrainCanvas = renderTerrain(this.world.terrain);
    }

    // CSS px -> device px, then camera.
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.translate(this.cssW / 2 - this.camera.x * zoom, this.cssH / 2 - this.camera.y * zoom);
    c.scale(zoom, zoom);
    c.imageSmoothingEnabled = false;

    c.drawImage(this.terrainCanvas as unknown as CanvasImageSource, 0, 0, WORLD_W, WORLD_H);

    for (const f of this.world.food) drawFood(c, f.kind, f.x, f.y);

    const ants = this.sorted;
    ants.length = 0;
    for (const a of this.world.ants) ants.push(a);
    ants.sort((p, q) => p.y - q.y);
    for (const a of ants) drawAnt(c, a.x, a.y, Math.cos(a.heading) >= 0 ? 1 : -1, a.carry > 0);

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
}
