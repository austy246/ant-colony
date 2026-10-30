/** A red (raiding) ant: walks to the nest, fights the black ants it meets, one duel at a time. Transient: not saved. */
export interface RedAnt {
  id: number;
  x: number;
  y: number;
  heading: number;
  /** Seconds left of the duel it is in (absent = not fighting). */
  fightT?: number;
}
