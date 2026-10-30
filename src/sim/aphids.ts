/** A bush with an aphid colony (normal mode, from BUSH_MIN_ANTS ants). Ants feed the aphids leaves; the aphids give honeydew. */
export interface Bush {
  x: number;
  y: number;
  /** Aphids on the bush; every leaf unit an ant brings adds one, up to APHID_MAX. */
  aphids: number;
  /** Aphid-seconds since the last drop of honeydew: every aphid makes one drop per APHID_HONEY_S (the drops wait on the bush, see World.updateBush). */
  dropT: number;
}

/** The bush is drawn BUSH_SCALE times larger than its base pattern (art px per base unit). */
export const BUSH_SCALE = 16;
/** Where the aphids sit on the bush (base units times BUSH_SCALE); aphid i sits at APHID_SPOTS[i]. */
export const APHID_SPOTS: readonly (readonly [number, number])[] = [
  [-6, 1], [-3, -4], [2, -5], [6, 0], [-1, 5], [4, 5], [-4, 4], [0, -1], [7, 3], [-7, -2], [3, -2], [-2, 1], [5, -3], [1, 7], [-5, 6],
];
/** Half the width of an aphid's body (art px): its drop of honeydew hangs at the rear end, this far from its centre. */
export const APHID_REAR = 6;

/** Centre of aphid i (art px). */
export function aphidCenter(b: Bush, i: number): { x: number; y: number } {
  const [dx, dy] = APHID_SPOTS[i % APHID_SPOTS.length];
  return { x: b.x + dx * BUSH_SCALE, y: b.y + dy * BUSH_SCALE };
}

/** Where the drop of honeydew of aphid i hangs: at the rear of its body (even aphids face left, odd ones right). */
export function dropSpot(b: Bush, i: number): { x: number; y: number } {
  const c = aphidCenter(b, i);
  return { x: c.x + (i % 2 === 0 ? APHID_REAR : -APHID_REAR), y: c.y + 1 };
}
