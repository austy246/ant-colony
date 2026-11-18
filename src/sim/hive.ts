/** A wild bee hive (normal mode, from HIVE_MIN_ANTS ants): a pile of honey that the ants may rob, guarded by bees that sting them. */
export interface Hive {
  x: number;
  y: number;
  /** Seconds since the honey pile last grew (it grows by one piece every HIVE_HONEY_S seconds). */
  honeyT: number;
}

/** A guard bee (transient: not saved, the bees are made again from the hive when a game is loaded). */
export interface Bee {
  id: number;
  x: number;
  y: number;
  heading: number;
  /** Seconds until it can sting again. */
  stingCd: number;
}

/** The bees stay in the hive in winter and in the rain: the honey can then be taken without a sting. */
export function beesSleep(season: number, raining: boolean): boolean {
  return season === 3 || raining;
}
