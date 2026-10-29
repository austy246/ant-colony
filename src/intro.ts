import { NEST, WORLD_W, WORLD_H } from './sim/constants';

export type IntroPhase = 'wide' | 'zoom' | 'dig' | 'hidden' | 'spawn' | 'done';

export const INTRO_DURATIONS = { wide: 2, zoom: 3, dig: 3, hidden: 1, spawn: 1 } as const;
export const INTRO_TOTAL_S = 10;

const T_ZOOM = INTRO_DURATIONS.wide; // 2
const T_DIG = T_ZOOM + INTRO_DURATIONS.zoom; // 5
const T_HIDDEN = T_DIG + INTRO_DURATIONS.dig; // 8
const T_SPAWN = T_HIDDEN + INTRO_DURATIONS.hidden; // 9

const TARGET_ZOOM = 10;
const DEFAULT_VIEW_W = 1280;
const DEFAULT_VIEW_H = 720;

const smoothstep = (u: number): number => u * u * (3 - 2 * u);

/** Pure state machine of the opening sequence; rendering is done elsewhere. */
export class Intro {
  /** Elapsed seconds, clamped to [0, INTRO_TOTAL_S]. */
  t = 0;
  private spawnConsumed = false;

  get phase(): IntroPhase {
    const t = this.t;
    if (t < T_ZOOM) return 'wide';
    if (t < T_DIG) return 'zoom';
    if (t < T_HIDDEN) return 'dig';
    if (t < T_SPAWN) return 'hidden';
    if (t < INTRO_TOTAL_S) return 'spawn';
    return 'done';
  }

  get done(): boolean {
    return this.t >= INTRO_TOTAL_S;
  }

  update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0 || this.done) return;
    this.t = Math.min(INTRO_TOTAL_S, this.t + dt);
  }

  skip(): void {
    this.t = INTRO_TOTAL_S;
  }

  /** True exactly once, the first time the spawn phase has been reached. */
  consumeSpawn(): boolean {
    if (this.spawnConsumed || this.t < T_SPAWN) return false;
    this.spawnConsumed = true;
    return true;
  }

  cameraAt(viewW = DEFAULT_VIEW_W, viewH = DEFAULT_VIEW_H): { x: number; y: number; zoom: number } {
    const fit = Math.min(viewW / WORLD_W, viewH / WORLD_H);
    const cx = WORLD_W / 2;
    const cy = WORLD_H / 2;
    if (this.t < T_ZOOM) return { x: cx, y: cy, zoom: fit };
    if (this.t >= T_DIG) return { x: NEST.x, y: NEST.y, zoom: TARGET_ZOOM };
    const k = smoothstep((this.t - T_ZOOM) / INTRO_DURATIONS.zoom);
    return {
      x: cx + (NEST.x - cx) * k,
      y: cy + (NEST.y - cy) * k,
      zoom: fit * Math.pow(TARGET_ZOOM / fit, k),
    };
  }

  queen(): { visible: boolean; x: number; y: number; digProgress: number } {
    const t = this.t;
    const digProgress = t <= T_DIG ? 0 : t >= T_HIDDEN ? 1 : (t - T_DIG) / INTRO_DURATIONS.dig;
    return { visible: t < T_HIDDEN, x: NEST.x, y: NEST.y, digProgress };
  }
}
