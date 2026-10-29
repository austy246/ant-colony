/** Walking-animation phase of one ant: advances with the distance walked, so a standing ant stands. */
export interface StrideState {
  x: number;
  y: number;
  /** Fraction of one full gait cycle, kept in [0, 1). */
  phase: number;
  /** Renderer bookkeeping: the draw generation that last touched this entry (stale entries are pruned). */
  gen?: number;
}

/** Art pixels walked per full gait cycle (one pass through all frames). */
export const STRIDE_ART_PX = 3;
/** A jump longer than this (save restore, pan, respawn) re-anchors the position without advancing the animation. */
export const TELEPORT_ART_PX = 20;

/**
 * Advances the stride state to the ant's new position. Mutates and returns `prev` (no allocation per ant per frame);
 * creates a fresh state when `prev` is undefined.
 */
export function advanceStride(prev: StrideState | undefined, x: number, y: number): StrideState {
  if (!prev) return { x, y, phase: 0 };
  const d = Math.hypot(x - prev.x, y - prev.y);
  if (d > 0 && d <= TELEPORT_ART_PX) {
    const p = prev.phase + d / STRIDE_ART_PX;
    prev.phase = p - Math.floor(p); // wrap, so the phase never grows and keeps full precision
  }
  prev.x = x;
  prev.y = y;
  return prev;
}

/** Frame index (0..frames-1) for a phase; tolerant of phase 1 and tiny negative drift. */
export function frameFor(phase: number, frames: number): number {
  const f = Math.floor(phase * frames) % frames;
  return f < 0 ? f + frames : f;
}
