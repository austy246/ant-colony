/** A red (raiding) ant: walks to the nest, fights the black ants it meets, one duel at a time. Transient: not saved. */
export interface RedAnt {
  id: number;
  x: number;
  y: number;
  heading: number;
  /** Walking speed factor (0.75..1.25, drawn at the start of the raid; absent = 1), so the raid stretches out on the way. */
  spd?: number;
  /** Its own rally point: the nest plus this offset (so the raid stays a wide crowd around the nest instead of piling up on one spot). */
  ox?: number;
  oy?: number;
  /** Seconds left of the duel it is in (absent = not fighting). */
  fightT?: number;
}
