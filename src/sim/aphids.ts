/** A bush with an aphid colony (normal mode, from BUSH_MIN_ANTS ants). Ants feed the aphids leaves; the aphids give honeydew. */
export interface Bush {
  x: number;
  y: number;
  /** Aphids on the bush; every leaf unit an ant brings adds one, up to APHID_MAX. */
  aphids: number;
  /** Aphid-seconds since the last drop of honeydew: every aphid makes one drop per APHID_HONEY_S (the drops wait on the bush, see World.updateBush). */
  dropT: number;
}
