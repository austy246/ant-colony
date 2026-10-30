import { APHID_DROP_BASE_S, APHID_DROP_MIN_S } from './constants';

/** A bush with an aphid colony (normal mode, from BUSH_MIN_ANTS ants). Ants feed the aphids leaves; the aphids give honeydew. */
export interface Bush {
  x: number;
  y: number;
  /** Aphids on the bush; every leaf unit an ant brings adds one, up to APHID_MAX. */
  aphids: number;
  /** Seconds until the next drop of honeydew. */
  dropT: number;
}

/** Seconds between two honeydew drops: the more aphids, the sooner. */
export function dropInterval(aphids: number): number {
  return Math.max(APHID_DROP_MIN_S, APHID_DROP_BASE_S / Math.max(1, aphids));
}
