import { MAX_PHEROMONE, NEST } from './constants';

const HALF_LIFE_S = 25;
const DIFFUSION = 0.02;
const MIN_VALUE = 0.01;
const GLOW_RADIUS = 40;

export class PheromoneField {
  readonly w: number;
  readonly h: number;
  readonly data: Float32Array;
  private scratch: Float32Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.data = new Float32Array(w * h);
    this.scratch = new Float32Array(w * h);
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

  step(dt: number): void {
    const { w, h, data, scratch } = this;
    const decay = Math.exp((-dt * Math.LN2) / HALF_LIFE_S);
    const share = DIFFUSION / 4;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const i = row + x;
        const v = data[i];
        // Out-of-map neighbours return their share to the cell: total is conserved.
        const l = x > 0 ? data[i - 1] : v;
        const r = x < w - 1 ? data[i + 1] : v;
        const u = y > 0 ? data[i - w] : v;
        const d = y < h - 1 ? data[i + w] : v;
        let n = (v * (1 - DIFFUSION) + share * (l + r + u + d)) * decay;
        if (n < MIN_VALUE) n = 0;
        else if (n > MAX_PHEROMONE) n = MAX_PHEROMONE;
        scratch[i] = n;
      }
    }
    data.set(scratch);
  }
}

export function homeGlow(x: number, y: number): number {
  const d = Math.hypot(x - NEST.x, y - NEST.y);
  if (!Number.isFinite(d)) return 0;
  return Math.max(0, 1 - d / GLOW_RADIUS);
}
