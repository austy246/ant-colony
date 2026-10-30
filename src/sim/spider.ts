import { SPIDER_WEB_R, WORLD_H, WORLD_W } from './constants';

/** The spider of normal mode: immobile, sits in a corner of the base map. `alive` false = dead, `respawnT` counts down to the next one. */
export interface Spider {
  x: number;
  y: number;
  alive: boolean;
  /**
   * Seconds since the last meal (or since the first catch); a caught ant is eaten at SPIDER_EAT_S. Stays at SPIDER_EAT_S
   * while only a major is caught that has not been held SPIDER_MAJOR_HOLD_S yet.
   */
  eatT: number;
  /** Seconds until a dead spider is replaced (0 while alive). */
  respawnT: number;
  /** 0 = upper right, 1 = lower right corner of the base map. */
  corner: number;
  /** TRANSIENT (not saved): where the spider's body is while it walks along the web to a catch (absent = at the web's centre x, y). */
  bx?: number;
  by?: number;
}

/** Where the spider's body is (it walks about its web; x, y is the web's centre). */
export function bodyPos(sp: Spider): { x: number; y: number } {
  return { x: sp.bx ?? sp.x, y: sp.by ?? sp.y };
}

/** Distance of the spider's centre from the map edges: the whole web fits in the base map. */
const MARGIN = SPIDER_WEB_R + 4;

/** Which corner (0 = upper right, 1 = lower right) the `index`-th spider of a game sits in. Pure function of (seed, index), uses no rng state. */
export function spiderCornerIndex(seed: number, index: number): 0 | 1 {
  let h = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(index | 0, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return ((h ^ (h >>> 16)) & 1) as 0 | 1;
}

/** Position of the `index`-th spider of a game: upper or lower right corner of the base map, MARGIN from the edges. */
export function spiderCorner(seed: number, index: number, corner: 0 | 1 = spiderCornerIndex(seed, index)): { x: number; y: number } {
  return { x: WORLD_W - MARGIN, y: corner === 0 ? MARGIN : WORLD_H - MARGIN };
}

/** Is (x, y) inside the web of a living spider? */
export function inWeb(spider: Spider | null, x: number, y: number): boolean {
  return spider !== null && spider.alive && Math.hypot(x - spider.x, y - spider.y) <= SPIDER_WEB_R;
}
