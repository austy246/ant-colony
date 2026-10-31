import type { FoodKind } from './food';

export const WORLD_W = 320;
export const WORLD_H = 200;
/** Normal mode: each map growth step adds MAP_STEP_W x MAP_STEP_H px to the map (to the right and down), see terrainSize. */
export const MAP_STEP_W = 60;
export const MAP_STEP_H = 38;
/** Upper bound of the map growth step: the map keeps growing with the colony up to MAX_ANTS_NORMAL / MAP_STEP_ANTS = 20 steps (2000 ants). */
export const MAX_MAP_STEP = 20;
/** The colony needs this many ants per map growth step (step = floor(ants / MAP_STEP_ANTS), never shrinks). */
export const MAP_STEP_ANTS = 100;
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
/** Majors (big soldier ants) can hatch only once the colony has at least this many ants. */
export const MAJOR_MIN_ANTS = 50;
/** Chance that a hatching ant (with at least MAJOR_MIN_ANTS ants) is a major. */
export const MAJOR_CHANCE = 0.08;
/** Majors never exceed this fraction of all ants. */
export const MAJOR_MAX_FRACTION = 0.1;
/** Pieces of food a major takes per bite (an ordinary ant takes 1). */
export const MAJOR_CARRY_PIECES = 2;
/** Super majors: one hatches for every SUPER_MAJOR_EVERY ants of the colony; twice the size of a major, they carry SUPER_CARRY_PIECES pieces and win a duel with SUPER_WIN_P. */
export const SUPER_MAJOR_EVERY = 100;
export const SUPER_CARRY_PIECES = 4;
export const SUPER_WIN_P = 0.99;
/** Ant limit in normal mode. */
export const MAX_ANTS_NORMAL = 2000;
/** Normal mode: seconds of sim time before another sugar piece can be placed. */
export const SUGAR_COOLDOWN_S = 300;
/** Seconds of colony-wide speed boost after an ant delivers sugar to the nest. */
export const SUGAR_BOOST_S = 60;
/** Movement speed multiplier of every ant while the sugar boost lasts. */
export const SUGAR_BOOST_MUL = 1.5;
/** Normal mode: seconds between two spontaneous prey / food appearances (uniform in MIN..MAX). */
export const SPAWN_MIN_S = 12;
export const SPAWN_MAX_S = 30;
/** Relative chance of each kind to be the next spontaneous appearance (sugar is never spawned). */
export const SPAWN_WEIGHTS: Record<Exclude<FoodKind, 'sugar' | 'honeydew' | 'redant'>, number> = {
  berry: 3, mushroom: 2, carrion: 1, fly: 2, caterpillar: 2, beetle: 1, leaf: 2,
};
/** Spontaneous appearances stop while there are at least BASE + PER_STEP * mapStep food items on the map. */
export const SPAWN_MAX_FOOD_BASE = 12;
export const SPAWN_MAX_FOOD_PER_STEP = 4;
/** Living beetles on the map at most BASE + mapStep. */
export const SPAWN_MAX_BEETLES_BASE = 1;
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

// ---- Natural variation ("random vibe"); all randomness comes from the world's seeded Rng ----
/** Per-ant personality ranges drawn at spawn (uniform). Ants loaded from old saves get the neutral 1.0 for each. */
export const SPEED_MUL_MIN = 0.88;
export const SPEED_MUL_MAX = 1.12;
/** Curiosity scales heading jitter, the chance to stray off a trail and the pull of unexplored ground. */
export const CURIOSITY_MIN = 0.6;
export const CURIOSITY_MAX = 1.6;
/** Stubbornness divides the stray chance: a stubborn ant follows a trail longer before it is distracted. */
export const STUBBORNNESS_MIN = 0.5;
export const STUBBORNNESS_MAX = 1.5;
/** Chance per substep that a wanderer pulled by pheromone gets distracted (times curiosity / stubbornness). */
export const STRAY_P = 0.002;
/** A pheromone pull (weight * trail strength) must exceed this for the ant to count as "following a trail". */
export const STRAY_PULL_MIN = 0.05;
/** A distracted ant ignores pheromone for STRAY_MIN_S + (STRAY_MAX_S - STRAY_MIN_S) * random seconds. */
export const STRAY_MIN_S = 2;
export const STRAY_MAX_S = 6;
/** ... and turns away from its heading by STRAY_TURN_MIN..STRAY_TURN_MAX rad (either side). */
export const STRAY_TURN_MIN = 0.6;
export const STRAY_TURN_MAX = 1.6;
/** Heading weave of returning carriers: std (rad) at curiosity 1, correlation time (s). */
export const WEAVE_AMP = 0.22;
export const WEAVE_TAU_S = 1.5;
/** Weave std of an ant walking to food (a slight curve instead of a straight line); fades out near the food. */
export const APPROACH_WEAVE_AMP = 0.12;
/** Chance per second (times curiosity) that a carrier gets confused and heads off in a random direction. */
export const LOST_P = 0.01;
export const LOST_MIN_S = 1.5;
export const LOST_MAX_S = 3;
/** The queen's hatch cycle lasts interval * (1 - HATCH_JITTER + 2 * HATCH_JITTER * random), drawn when the cycle starts. */
export const HATCH_JITTER = 0.2;
/** Beetles and caterpillars walk at their base speed times 1 +- PREY_SPEED_VAR (drawn once, when placed). */
export const PREY_SPEED_VAR = 0.15;

// ---- Nest needs (the underground layout is sized by the peaks the colony has reached) ----
/** Food one storage chamber (pantry) holds. */
export const PANTRY_CAPACITY = 25;
/** Larvae one brood chamber holds. */
export const LARVAE_PER_CHAMBER = 10;
export const MAX_PANTRIES = 6;
export const MAX_LARVAE_CHAMBERS = 4;
/**
 * Normal mode has no 6 / 4 limit: the underground grows with the colony. These are only safety caps that keep the layout
 * (and the cost of drawing it) bounded: with MAX_QUEENS queens at most 392 chambers, under 400. 256 pantries hold 6400 food,
 * 128 brood chambers 1280 larvae (the larvae of that food), far more than a colony of MAX_ANTS_NORMAL ants keeps.
 */
export const MAX_NORMAL_PANTRIES = 256;
export const MAX_NORMAL_LARVAE_CHAMBERS = 128;

// ---- Spider (normal mode): one immobile spider in a corner with a web ----
/** Radius (art px) of the circular web around the spider. */
export const SPIDER_WEB_R = 22;
/**
 * Seconds between two meals (digestion): the spider eats one caught ant this often while anyone is caught, ordinary ants
 * first (longest caught first). Wandering ants sense a living web and steer clear of it (world.ts, WEB_AVOID_PENALTY).
 */
export const SPIDER_EAT_S = 15;
/**
 * A caught major is eaten only after it has hung in the web this long and no ordinary caught ant is waiting (time for a
 * second major to come).
 */
export const SPIDER_MAJOR_HOLD_S = 60;
/** Seconds after the spider's death until a new one settles in a corner. */
export const SPIDER_RESPAWN_S = 600;

// ---- Leaves: food of caterpillars (ants ignore them) ----
/** Leaf units in a fresh pile of leaves. */
export const LEAF_PIECES = 24;
/** A hungry caterpillar smells leaves this far away (px) and crawls to them. */
export const LEAF_SENSE = 60;
/** A caterpillar eats while it is this close (px) to the leaves. */
export const LEAF_REACH = 2.5;
/** Seconds a caterpillar needs per leaf unit; each one it eats adds CATERPILLAR_GAIN pieces of meat, up to CATERPILLAR_MAX_PIECES (a full caterpillar stops eating). */
export const CATERPILLAR_BITE_S = 2.5;
export const CATERPILLAR_GAIN = 4;
export const CATERPILLAR_MAX_PIECES = 144;

// ---- Aphids: a bush with a few aphids appears with a big colony; ants feed them leaves and collect their honeydew ----
/** The bush appears once the colony has this many ants (normal mode). */
export const BUSH_MIN_ANTS = 1000;
export const APHID_START = 3;
export const APHID_MAX = 15;
/** Every aphid holds one drop of honeydew per APHID_HONEY_S seconds, until an ant licks it off. */
export const APHID_HONEY_S = 30;
/** An ant carrying a leaf feeds the aphids once it is this close (px) to the bush. */
export const BUSH_REACH = 60;
/** The bush is big (about 300 x 270 art px): it appears at least this far (px) from the nest and from the map edges. Ants smell its honeydew BUSH_SENSE px farther than they notice other food. */
export const BUSH_NEST_GAP = 220;
export const BUSH_EDGE_GAP = 150;
export const BUSH_SENSE = 150;
/** At most this many ants collect the bush's honeydew at once (others may still walk across the bush), and a drop is taken by one ant at a time. */
export const BUSH_MAX_ANTS = 20;
/** A claim on a drop of honeydew lapses after this many seconds (an ant that was eaten or lost interest). */
export const HONEY_CLAIM_S = 60;

// ---- Raids: from RAID_MIN_ANTS ants, red ants now and then attack the colony ----
export const RAID_MIN_ANTS = 1500;
/** Seconds between two raids (uniform in MIN..MAX, drawn when the colony reaches RAID_MIN_ANTS and after each raid). */
export const RAID_MIN_S = 120;
export const RAID_MAX_S = 360;
/** A raid brings RAID_SIZE_MIN..RAID_SIZE_MAX red ants (never more than half of the black ones). */
export const RAID_SIZE_MIN = 100;
export const RAID_SIZE_MAX = 500;
/** The raiders appear this far (px) from the nest, toward the open side of the map, so they are soon seen. */
export const RAID_DIST_MIN = 260;
export const RAID_DIST_MAX = 360;
/** The raiders start spread over a disc of this radius (px) around that point, each with its own speed, so the raid is a wide, loose crowd. */
export const RAID_SPREAD = 110;
/** The surviving red ants give up and leave this many seconds after the raid began. */
export const RAID_MAX_S_ALIVE = 240;
/** Walking speed of a red ant (px/s), how far (px) it notices a black ant, and how close it must be to fight. */
export const RED_SPEED = 11;
export const RED_SENSE = 12;
export const RED_REACH = 2.5;
/** A duel lasts this many seconds; the black ant wins with BLACK_WIN_P (a major with MAJOR_WIN_P), otherwise the red one does. */
export const DUEL_S = 2;
export const BLACK_WIN_P = 0.55;
export const MAJOR_WIN_P = 0.9;
/** Red ants keep this far (px) apart (they push each other away, at RED_SEP_SPEED px/s at most). */
export const RED_SEP = 8;
export const RED_SEP_SPEED = 10;
/** A wandering black ant notices a red one this far away (px) and goes to fight it. */
export const ANT_SENSE_RED = 40;

// ---- The red nest: appears with RAID_MIN_ANTS black ants; red ants keep coming out; black ants can take it ----
/** The red nest lies at least this far (px) from the black nest and the bush, and RED_NEST_EDGE from the map edge. */
export const RED_NEST_GAP = 600;
/** The red nest appears with this many black ants. */
export const RED_NEST_MIN_ANTS = 1500;
export const RED_NEST_EDGE = 70;
/** RED_PATROL_START red ants appear with the nest and walk around it (within RED_PATROL_R px) to defend it; a new one comes out every RED_TRICKLE_S seconds, up to RED_PATROL_MAX: the red ants are real rivals. */
export const RED_TRICKLE_S = 5;
export const RED_PATROL_START = 100;
export const RED_PATROL_MAX = 300;
export const RED_PATROL_R = 120;
/** Black wanderers within RED_NEST_SENSE px smell the red nest and go there. */
export const RED_NEST_SENSE = 90;
/** The red nest is taken when CAPTURE_ANTS black ants (on the surface) are within CAPTURE_R px of it at once. */
export const CAPTURE_ANTS = 4;
export const CAPTURE_R = 18;
/** A taken nest adds CAPTURED_QUEENS queens, and the queens hatch ants CAPTURED_HATCH_MUL times as long per cycle (< 1: faster). */
export const CAPTURED_QUEENS = 4;
export const CAPTURED_HATCH_MUL = 0.75;
/** Raiders leave the red nest spread over a disc of this radius (px). */
export const RAID_SPREAD_NEST = 60;
/** Red ants: this share (at least one in ten) of the patrols are guards that circle the red nest; the rest forage up to RED_FORAGE_R px away. */
export const RED_GUARD_FRACTION = 0.15;
export const RED_FORAGE_R = 350;
/** A red forager notices food this far away (px); the food it brings home feeds the nest (new red ants cost RED_FOOD_PER_ANT each). */
export const RED_FOOD_SENSE = 60;
export const RED_START_STOCK = 100;
/** Every new red ant costs this much food from the red nest's stock (while it has none, no new red ants come out). */
export const RED_FOOD_PER_ANT = 1;
/** Guards: this share of the black colony (majors first) circles the nest in rings GUARD_R_MIN + k * GUARD_R_STEP px away, and fights the red ants. */
export const GUARD_FRACTION = 0.1;
export const GUARD_MIN_COLONY = 20;
export const GUARD_R_MIN = 22;
export const GUARD_R_STEP = 7;
/** The spider walks along its web to a caught creature at this speed (px/s). */
export const SPIDER_SPEED = 14;
/** Seconds the spider needs to eat a fly caught in its web, once it has reached it. Flies are served before ants. */
export const SPIDER_FLY_EAT_S = 6;
/** Walking speed of a living fly in px/s (times the ground speed factor): it ambles, and a touch still makes it hop away. */
export const FLY_SPEED = 6;
