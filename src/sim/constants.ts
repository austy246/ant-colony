export const WORLD_W = 320;
export const WORLD_H = 200;
export const SCALE = 4;
export const NEST = { x: 40, y: 150, r: 6 } as const;
/** Food the queen spends on one new ant (and the minimum stock needed for a hatching cycle to run). */
export const FOOD_PER_ANT = 5;
/** Seconds of one hatching cycle: the queen hatches one ant per cycle while she has FOOD_PER_ANT food. */
export const HATCH_INTERVAL_S = 10;
/** Food the queen starts with (enough for two ants once the colony has started). */
export const STARTER_STOCK = 10;
/** A started colony with no ants and too little food for one gets a free ant after this many seconds. */
export const RESCUE_AFTER_S = 15;
export const MAX_ANTS = 300;
export const LIFESPAN_S = 600;
export const MAX_PHEROMONE = 5;
export const STEP_S = 1 / 30;
