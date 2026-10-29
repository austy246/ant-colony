import { LARVAE_PER_CHAMBER, MAX_LARVAE_CHAMBERS, MAX_PANTRIES, PANTRY_CAPACITY } from './constants';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Storage chambers the colony needs for the most food it ever held: 1..MAX_PANTRIES, PANTRY_CAPACITY food each. */
export function pantriesNeeded(peakStock: number): number {
  return clamp(Math.ceil(peakStock / PANTRY_CAPACITY), 1, MAX_PANTRIES);
}

/** Brood chambers needed for the most larvae ever waiting: 1..MAX_LARVAE_CHAMBERS, LARVAE_PER_CHAMBER each. */
export function larvaeChambersNeeded(peakLarvae: number): number {
  return clamp(Math.ceil(peakLarvae / LARVAE_PER_CHAMBER), 1, MAX_LARVAE_CHAMBERS);
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
