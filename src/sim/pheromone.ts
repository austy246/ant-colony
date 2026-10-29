import { MAX_PHEROMONE, NEST } from './constants';

const HALF_LIFE_S = 25;
const MIN_VALUE = 0.01;
const GLOW_RADIUS = 40;

export class PheromoneField {
  readonly w: number;
  readonly h: number;
  readonly data: Float32Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.data = new Float32Array(w * h);
  }

  private index(x: number, y: number): number {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return -1;
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= this.w || cy >= this.h) return -1;
    return cy * this.w + cx;
  }

  deposit(x: number, y: number, amount: number): void {
    if (!Number.isFinite(amount)) return;
    const i = this.index(x, y);
    if (i < 0) return;
    this.data[i] = Math.min(MAX_PHEROMONE, Math.max(0, this.data[i] + amount));
  }

  sample(x: number, y: number): number {
    const i = this.index(x, y);
    return i < 0 ? 0 : this.data[i];
  }

  /** Max cell value within integer radius around floor(x), floor(y); out-of-range counts as 0. */
  sampleMax(x: number, y: number, radius: number): number {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius)) return 0;
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    const r = Math.max(0, Math.floor(radius));
    let max = 0;
    for (let yy = Math.max(0, cy - r); yy <= Math.min(this.h - 1, cy + r); yy++) {
      for (let xx = Math.max(0, cx - r); xx <= Math.min(this.w - 1, cx + r); xx++) {
        const v = this.data[yy * this.w + xx];
        if (v > max) max = v;
      }
    }
    return max;
  }

  step(dt: number): void {
    const data = this.data;
    const decay = Math.exp((-dt * Math.LN2) / HALF_LIFE_S);
    for (let i = 0; i < data.length; i++) {
      const n = data[i] * decay;
      data[i] = n < MIN_VALUE ? 0 : n;
    }
  }
}

export function homeGlow(x: number, y: number): number {
  const d = Math.hypot(x - NEST.x, y - NEST.y);
  if (!Number.isFinite(d)) return 0;
  return Math.max(0, 1 - d / GLOW_RADIUS);
}
