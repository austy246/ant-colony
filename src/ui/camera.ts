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
  x: number;
  y: number;
  zoom: number;
  private viewW: number;
  private viewH: number;

  constructor(
    viewW: number,
    viewH: number,
    private worldW = WORLD_W,
    private worldH = WORLD_H,
  ) {
    this.x = this.worldW / 2;
    this.y = this.worldH / 2;
    this.viewW = ok(viewW) && viewW > 0 ? viewW : 1;
    this.viewH = ok(viewH) && viewH > 0 ? viewH : 1;
    this.zoom = SCALE;
    this.clamp();
  }

  /** The most zoomed-out view: the whole map just fits (no floor, so a huge map can be seen whole). */
  get minZoom(): number {
    return Math.min(this.viewW / this.worldW, this.viewH / this.worldH);
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

  /** The map grew (to the right and down): the view centre stays put, only the limits and the clamp change. */
  setWorldSize(worldW: number, worldH: number): void {
    if (!ok(worldW) || !ok(worldH) || worldW <= 0 || worldH <= 0) return;
    this.worldW = worldW;
    this.worldH = worldH;
    this.clamp();
  }

  /** Clamps zoom into limits and the view centre into the map. */
  clamp(): void {
    if (!ok(this.zoom)) this.zoom = SCALE;
    this.zoom = Math.min(MAX_ZOOM, Math.max(this.minZoom, this.zoom));
    this.x = this.clampAxis(this.x, this.viewW, this.worldW);
    this.y = this.clampAxis(this.y, this.viewH, this.worldH);
  }

  private clampAxis(c: number, viewPx: number, worldSize: number): number {
    const half = viewPx / this.zoom / 2;
    if (half * 2 >= worldSize || !ok(c)) return worldSize / 2;
    // the view never leaves the map: its edge stops at the map's edge
    return Math.min(worldSize - half, Math.max(half, c));
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
    this.zoom = Math.min(this.viewW / this.worldW, this.viewH / this.worldH);
    this.x = this.worldW / 2;
    this.y = this.worldH / 2;
    this.clamp();
  }
}
