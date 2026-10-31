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
  /** A patrol red ant (walks about near the red nest, for good) instead of a raider (absent / false). */
  patrol?: boolean;
  /** Seconds left of the duel it is in (absent = not fighting). */
  fightT?: number;
}

/** The nest of the red ants (normal mode, from RAID_MIN_ANTS black ants): red ants come out of it for good, raids set off from it. */
export interface RedNest {
  x: number;
  y: number;
  /** 'red' while the red ants hold it; 'black' once black ants have taken it (it is then another nest of the colony: more queens, faster hatching). */
  owner: 'red' | 'black';
  /** Seconds until the next patrol red ant comes out. Transient. */
  trickleT: number;
}
