import type { FoodItem, FoodKind } from '../sim/food';
import type { World } from '../sim/world';
import type { Camera } from './camera';

export type Tool =
  | { kind: 'place'; food: FoodKind }
  | { kind: 'move' }
  | { kind: 'delete' }
  | { kind: 'pan' }
  | { kind: 'sugar' };

const PICK_RADIUS = 8;
const CLICK_SLOP = 4;
const WHEEL_SENSITIVITY = 0.0015;

/** Nearest food item within `radius` (inclusive) of (x, y), or null. */
export function pickFood(world: World, x: number, y: number, radius: number): FoodItem | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius)) return null;
  let best: FoodItem | null = null;
  let bestD = Infinity;
  for (const f of world.food) {
    const d = Math.hypot(f.x - x, f.y - y);
    if (d <= radius && d < bestD) {
      best = f;
      bestD = d;
    }
  }
  return best;
}

type Mode = 'none' | 'pan' | 'place' | 'move';

interface Pt {
  x: number;
  y: number;
}

export class Input {
  private pointers = new Map<number, Pt>();
  private mode: Mode = 'none';
  private primaryId = -1;
  private start: Pt = { x: 0, y: 0 };
  private last: Pt = { x: 0, y: 0 };
  private moved = false;
  private pinching = false;
  private pinchDist = 0;
  private pinchMid: Pt = { x: 0, y: 0 };
  private moveId = -1;

  constructor(
    private canvas: HTMLElement,
    private camera: Camera,
    private world: World,
    private getTool: () => Tool,
  ) {}

  attach(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', this.onDown as EventListener);
    c.addEventListener('pointermove', this.onMove as EventListener);
    c.addEventListener('pointerup', this.onUp as EventListener);
    c.addEventListener('pointercancel', this.onCancel as EventListener);
    c.addEventListener('wheel', this.onWheel as EventListener, { passive: false });
    c.addEventListener('contextmenu', this.onContext);
  }

  detach(): void {
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onDown as EventListener);
    c.removeEventListener('pointermove', this.onMove as EventListener);
    c.removeEventListener('pointerup', this.onUp as EventListener);
    c.removeEventListener('pointercancel', this.onCancel as EventListener);
    c.removeEventListener('wheel', this.onWheel as EventListener);
    c.removeEventListener('contextmenu', this.onContext);
    this.reset();
  }

  private local(e: MouseEvent): Pt {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private reset(): void {
    this.pointers.clear();
    this.mode = 'none';
    this.pinching = false;
    this.moveId = -1;
  }

  private touchPoints(): Pt[] {
    const out: Pt[] = [];
    for (const p of this.pointers.values()) out.push(p);
    return out;
  }

  private onContext = (e: Event): void => {
    e.preventDefault();
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const p = this.local(e);
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
    this.camera.zoomAt(p.x, p.y, Math.exp(-e.deltaY * unit * WHEEL_SENSITIVITY));
  };

  private onDown = (e: PointerEvent): void => {
    const p = this.local(e);
    if (e.pointerType === 'touch') {
      this.pointers.set(e.pointerId, p);
      if (this.pointers.size === 2) {
        this.beginPinch();
        return;
      }
      if (this.pointers.size > 2) return;
    } else {
      this.pointers.set(e.pointerId, p);
    }
    if (this.mode !== 'none' || this.pinching) return;

    this.primaryId = e.pointerId;
    this.start = p;
    this.last = p;
    this.moved = false;
    try {
      this.canvas.setPointerCapture?.(e.pointerId);
    } catch {
      /* capture is best-effort */
    }

    const tool = this.getTool();
    if (e.button === 1 || e.button === 2 || tool.kind === 'pan') {
      this.mode = 'pan';
      return;
    }
    if (e.button !== 0) return;

    const w = this.camera.screenToWorld(p.x, p.y);
    switch (tool.kind) {
      case 'place':
      case 'sugar':
        this.mode = 'place';
        break;
      case 'move': {
        const item = pickFood(this.world, w.x, w.y, PICK_RADIUS);
        if (item) {
          this.mode = 'move';
          this.moveId = item.id;
        } else {
          this.mode = 'pan';
        }
        break;
      }
      case 'delete': {
        const item = pickFood(this.world, w.x, w.y, PICK_RADIUS);
        if (item) this.world.removeFood(item.id);
        break;
      }
    }
  };

  private beginPinch(): void {
    const [a, b] = this.touchPoints();
    this.pinching = true;
    this.mode = 'none';
    this.moveId = -1;
    this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    this.pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  private onMove = (e: PointerEvent): void => {
    const p = this.local(e);
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, p);

    if (this.pinching) {
      const pts = this.touchPoints();
      if (pts.length < 2) return;
      const [a, b] = pts;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.camera.panBy(mid.x - this.pinchMid.x, mid.y - this.pinchMid.y);
      if (this.pinchDist > 0 && dist > 0) this.camera.zoomAt(mid.x, mid.y, dist / this.pinchDist);
      this.pinchDist = dist;
      this.pinchMid = mid;
      return;
    }

    if (e.pointerId !== this.primaryId || this.mode === 'none') return;
    if (Math.hypot(p.x - this.start.x, p.y - this.start.y) >= CLICK_SLOP) this.moved = true;

    if (this.mode === 'pan') {
      this.camera.panBy(p.x - this.last.x, p.y - this.last.y);
    } else if (this.mode === 'move') {
      const w = this.camera.screenToWorld(p.x, p.y);
      this.world.moveFood(this.moveId, w.x, w.y);
    }
    this.last = p;
  };

  private onUp = (e: PointerEvent): void => {
    const p = this.local(e);
    const wasPinching = this.pinching;
    this.pointers.delete(e.pointerId);
    if (wasPinching) {
      if (this.pointers.size < 2) {
        this.pinching = false;
        this.mode = 'none';
      }
      return;
    }
    if (e.pointerId !== this.primaryId) return;

    if (this.mode === 'place' && e.button === 0) {
      const slop = Math.hypot(p.x - this.start.x, p.y - this.start.y);
      if (!this.moved && slop < CLICK_SLOP) {
        const tool = this.getTool();
        if (tool.kind === 'place') {
          const w = this.camera.screenToWorld(p.x, p.y);
          this.world.placeFood(tool.food, w.x, w.y);
        } else if (tool.kind === 'sugar') {
          const w = this.camera.screenToWorld(p.x, p.y);
          this.world.placeSugar(w.x, w.y);
        }
      }
    }
    this.mode = 'none';
    this.moveId = -1;
    try {
      this.canvas.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  private onCancel = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    if (this.pinching && this.pointers.size < 2) this.pinching = false;
    if (e.pointerId === this.primaryId || this.pointers.size === 0) {
      this.mode = 'none';
      this.moveId = -1;
    }
  };
}
