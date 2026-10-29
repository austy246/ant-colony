export const WORLD_W = 320;
export const WORLD_H = 200;
export const SCALE = 4;
export const NEST = { x: 40, y: 150, r: 6 } as const;
/** Food the queen spends on one new ant (and the minimum stock needed for a hatching cycle to run). */
export const FOOD_PER_ANT = 5;
/** Seconds of one hatching cycle: the queen hatches one ant per cycle while she has FOOD_PER_ANT food. */
export const HATCH_INTERVAL_S = 10;
/** Every FOOD_PER_QUEEN of food delivered to the nest in total adds another queen (hatching speeds up proportionally). */
export const FOOD_PER_QUEEN = 100;
/** Upper bound of the number of queens. */
export const MAX_QUEENS = 8;
/** Food the queen starts with (enough for two ants once the colony has started). */
export const STARTER_STOCK = 10;
/** A started colony with no ants and too little food for one gets a free ant after this many seconds. */
export const RESCUE_AFTER_S = 15;
export const MAX_ANTS = 300;
export const MAX_PHEROMONE = 5;
export const STEP_S = 1 / 30;
/** Seconds an ant gnaws at its food before it takes a piece (each ant: GNAW_S * (0.75 + 0.5 * random)). */
export const GNAW_S = 4;
/** Speed multiplier of an ant carrying a piece of food. */
export const CARRY_SPEED_MUL = 0.8;
/** Walking speed of a living beetle in px/s (times the ground speed factor). */
export const BEETLE_SPEED = 4;
/** An ant (wander / toFood) touches a living creature when it is closer than this many px. */
export const TOUCH_DIST = 2.5;
/** Seconds a living creature cannot be touched again after a touch. */
export const TOUCH_COOLDOWN_S = 0.8;
/** Seconds a startled fly spends in the air during one hop. */
export const HOP_DUR = 0.35;
/** Side (art px) of one cell of the coarse "explored" grid wandering ants avoid revisiting (40 x 25 cells on 320 x 200). */
export const EXPLORE_CELL = 8;
/** Half-life (s) of the explored-grid values: ground nobody walked for a while counts as new again. */
export const EXPLORE_HALF_LIFE_S = 90;
/** Upper bound of a cell value of the explored grid. */
export const EXPLORE_CAP = 6;
/** Seconds a freshly hatched ant stays in the nest before it emerges at the entrance (each ant: HATCH_STAY_S * (0.85 + 0.3 * random)). */
export const HATCH_STAY_S = 30;
/** Seconds a forager that delivered food rests in the nest before it goes out again (each delivery: UNLOAD_S * (0.8 + 0.4 * random)). */
export const UNLOAD_S = 5;
/** Nurses (permanent nest workers: feed the queen, carry eggs): wanted per queen, plus one per LARVAE_PER_NURSE waiting larvae, at most NURSE_MAX_FRACTION of all ants. */
export const NURSES_PER_QUEEN = 2;
export const LARVAE_PER_NURSE = 5;
export const NURSE_MAX_FRACTION = 0.3;
/** The wanted nurse count is re-evaluated every NURSE_EVAL_S of simulated time (not every substep). */
export const NURSE_EVAL_S = 2;
/** Crawling speed of a living caterpillar in px/s (times the ground speed factor): slower than a beetle. */
export const CATERPILLAR_SPEED = 2.5;
/** Speed multiplier of a caterpillar after the first touch, for CATERPILLAR_FLEE_S seconds. */
export const CATERPILLAR_FLEE_MUL = 2.5;
/** Seconds a touched caterpillar hurries away from the ant that touched it. */
export const CATERPILLAR_FLEE_S = 5;
