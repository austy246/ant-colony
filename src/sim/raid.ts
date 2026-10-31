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
  /** Job of a patrol red ant: a guard circles the red nest, a forager looks for food and brings it to the nest (absent = walks about near it). */
  job?: 'guard' | 'forager';
  /** Food a forager carries (its value) and the id of the food item it is walking to. */
  carry?: number;
  tf?: number;
  /** Seconds a forager still gnaws at its food before it takes a piece (it stands still meanwhile, like a black ant). */
  gnawT?: number;
  /** Seconds left of the duel it is in (absent = not fighting). */
  fightT?: number;
}

/** The nest of the red ants (normal mode, from RAID_MIN_ANTS black ants): red ants come out of it for good, raids set off from it. */
export interface RedNest {
  x: number;
  y: number;
  /** 'red' while the red ants hold it; 'black' once black ants have taken it (it is then another nest of the colony: more queens, faster hatching). */
  owner: 'red' | 'black';
  /** Food the red foragers have brought home; every RED_STOCK_PER_ANT of it makes one more red ant. */
  stock?: number;
  /** Food brought home in all (for the statistics and tests). */
  delivered?: number;
  /** Seconds until the next patrol red ant comes out. Transient. */
  trickleT: number;
}
