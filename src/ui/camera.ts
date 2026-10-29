import { WORLD_W, WORLD_H, SCALE } from '../sim/constants';

export const MAX_ZOOM = 16;

const ok = (n: number): boolean => Number.isFinite(n);

export interface CameraPose {
  x: number;
  y: number;
  zoom: number;
}

/** Smoothstep-eased pose between `from` and `to` for progress `u` (clamped to 0..1); zoom is interpolated geometrically. */
export function easeCameraTo(from: CameraPose, to: CameraPose, u: number): CameraPose {
  const t = Number.isFinite(u) ? Math.min(1, Math.max(0, u)) : 1;
  const k = t * t * (3 - 2 * t);
  return {
    x: from.x + (to.x - from.x) * k,
    y: from.y + (to.y - from.y) * k,
    zoom: from.zoom * Math.pow(to.zoom / from.zoom, k),
  };
}

/**
 * Pure camera logic. `x`,`y` = view centre in world pixels,
 * `zoom` = screen pixels per world pixel.
 */
export class Camera {
  x = WORLD_W / 2;
  y = WORLD_H / 2;
  zoom: number;
  private viewW: number;
  private viewH: number;

  constructor(viewW: number, viewH: number) {
    this.viewW = ok(viewW) && viewW > 0 ? viewW : 1;
    this.viewH = ok(viewH) && viewH > 0 ? viewH : 1;
    this.zoom = SCALE;
    this.clamp();
  }

  get minZoom(): number {
    return Math.max(1, Math.min(this.viewW / WORLD_W, this.viewH / WORLD_H));
  }

  get maxZoom(): number {
    return MAX_ZOOM;
  }

  resize(viewW: number, viewH: number): void {
    if (!ok(viewW) || !ok(viewH) || viewW <= 0 || viewH <= 0) return;
    this.viewW = viewW;
    this.viewH = viewH;
    this.clamp();
  }

  /** Clamps zoom into limits and the view centre into the map. */
  clamp(): void {
    if (!ok(this.zoom)) this.zoom = SCALE;
    this.zoom = Math.min(MAX_ZOOM, Math.max(this.minZoom, this.zoom));
    this.x = this.clampAxis(this.x, this.viewW, WORLD_W);
    this.y = this.clampAxis(this.y, this.viewH, WORLD_H);
  }

  private clampAxis(c: number, viewPx: number, worldSize: number): number {
    if (viewPx / this.zoom >= worldSize || !ok(c)) return worldSize / 2;
    return Math.min(worldSize, Math.max(0, c));
  }

  panBy(dxScreen: number, dyScreen: number): void {
    if (!ok(dxScreen) || !ok(dyScreen)) return;
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
    this.clamp();
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    if (!ok(factor) || factor <= 0 || !ok(sx) || !ok(sy)) return;
    const w = this.screenToWorld(sx, sy);
    this.zoom = Math.min(MAX_ZOOM, Math.max(this.minZoom, this.zoom * factor));
    this.x = w.x - (sx - this.viewW / 2) / this.zoom;
    this.y = w.y - (sy - this.viewH / 2) / this.zoom;
    this.clamp();
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: this.x + (sx - this.viewW / 2) / this.zoom,
      y: this.y + (sy - this.viewH / 2) / this.zoom,
    };
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: (wx - this.x) * this.zoom + this.viewW / 2,
      y: (wy - this.y) * this.zoom + this.viewH / 2,
    };
  }

  fitWorld(): void {
    this.zoom = Math.min(this.viewW / WORLD_W, this.viewH / WORLD_H);
    this.x = WORLD_W / 2;
    this.y = WORLD_H / 2;
    this.clamp();
  }
}
