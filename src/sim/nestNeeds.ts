import {
  LARVAE_PER_CHAMBER, MAX_LARVAE_CHAMBERS, MAX_NORMAL_LARVAE_CHAMBERS, MAX_NORMAL_PANTRIES, MAX_PANTRIES, PANTRY_CAPACITY,
} from './constants';
import type { GameMode } from './world';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
/** ceil(peak / capacity) clamped to 1..max; a non-finite peak counts as 0. */
const chambersFor = (peak: number, capacity: number, max: number): number =>
  clamp(Math.ceil((Number.isFinite(peak) ? peak : 0) / capacity), 1, max);

/**
 * Storage chambers the colony needs for the most food it ever held, PANTRY_CAPACITY food each: 1..MAX_PANTRIES in sandbox,
 * no limit in normal mode (the underground grows; only the safety cap MAX_NORMAL_PANTRIES).
 */
export function pantriesNeeded(peakStock: number, mode: GameMode = 'sandbox'): number {
  return chambersFor(peakStock, PANTRY_CAPACITY, mode === 'normal' ? MAX_NORMAL_PANTRIES : MAX_PANTRIES);
}

/**
 * Brood chambers needed for the most larvae ever waiting, LARVAE_PER_CHAMBER each: 1..MAX_LARVAE_CHAMBERS in sandbox,
 * no limit in normal mode (only the safety cap MAX_NORMAL_LARVAE_CHAMBERS).
 */
export function larvaeChambersNeeded(peakLarvae: number, mode: GameMode = 'sandbox'): number {
  return chambersFor(peakLarvae, LARVAE_PER_CHAMBER, mode === 'normal' ? MAX_NORMAL_LARVAE_CHAMBERS : MAX_LARVAE_CHAMBERS);
}

/**
 * Spreads `total` over `chambers` chambers of `capacity` each, filling the first ones first.
 * The fills sum to min(total, chambers * capacity); a non-positive or non-finite total gives all zeros.
 */
export function chamberFills(total: number, chambers: number, capacity: number): number[] {
  const n = Math.max(0, Math.floor(chambers));
  const out: number[] = [];
  let left = Number.isFinite(total) ? Math.max(0, total) : 0;
  for (let i = 0; i < n; i++) {
    const f = Math.min(capacity, left);
    out.push(f);
    left -= f;
  }
  return out;
}
