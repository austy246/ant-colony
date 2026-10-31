import {
  APPROACH_WEAVE_AMP, CURIOSITY_MAX, CURIOSITY_MIN, HATCH_JITTER, LOST_MAX_S, LOST_MIN_S, LOST_P, PREY_SPEED_VAR, SPEED_MUL_MAX, SPEED_MUL_MIN,
  STRAY_MAX_S, STRAY_MIN_S, STRAY_P, STRAY_PULL_MIN, STRAY_TURN_MAX, STRAY_TURN_MIN, STUBBORNNESS_MAX, STUBBORNNESS_MIN, WEAVE_AMP, WEAVE_TAU_S,
  BEETLE_SPEED, CATERPILLAR_FLEE_MUL, CATERPILLAR_FLEE_S, CATERPILLAR_SPEED, EXPLORE_CAP, EXPLORE_CELL, EXPLORE_HALF_LIFE_S, CARRY_SPEED_MUL, FOOD_PER_ANT, FOOD_PER_QUEEN, GNAW_S, HATCH_INTERVAL_S, HATCH_STAY_S, LARVAE_PER_NURSE, MAX_ANTS, MAJOR_CARRY_PIECES, MAJOR_CHANCE, MAJOR_MAX_FRACTION, MAJOR_MIN_ANTS, MAX_ANTS_NORMAL, SUGAR_BOOST_MUL, SUGAR_BOOST_S, SUGAR_COOLDOWN_S, MAX_QUEENS, NEST, NURSE_EVAL_S, NURSE_MAX_FRACTION, NURSES_PER_QUEEN, HOP_DUR, RESCUE_AFTER_S, STARTER_STOCK, STEP_S, TOUCH_COOLDOWN_S, TOUCH_DIST, UNLOAD_S, MAP_STEP_ANTS, MAX_MAP_STEP, SPIDER_EAT_S, SPIDER_MAJOR_HOLD_S, SPIDER_RESPAWN_S, SPIDER_WEB_R, SPIDER_SPEED, SPIDER_FLY_EAT_S, FLY_SPEED, LEAF_SENSE, LEAF_REACH, RAID_MIN_ANTS, RAID_MIN_S, RAID_MAX_S, RAID_SIZE_MIN, RAID_SIZE_MAX, RAID_MAX_S_ALIVE, RAID_DIST_MIN, RAID_DIST_MAX, RAID_SPREAD, RED_SEP, RED_SEP_SPEED, RED_NEST_GAP, RED_NEST_MIN_ANTS, RED_GUARD_FRACTION, RED_FORAGE_R, RED_FOOD_SENSE, RED_START_STOCK, RED_FOOD_PER_ANT, GUARD_FRACTION, GUARD_MIN_COLONY, GUARD_R_MIN, GUARD_R_STEP, RED_NEST_EDGE, RED_TRICKLE_S, RED_PATROL_START, RED_PATROL_MAX, RED_PATROL_R, RED_NEST_SENSE, CAPTURE_ANTS, CAPTURE_R, CAPTURED_QUEENS, CAPTURED_HATCH_MUL, RAID_SPREAD_NEST, ANT_SENSE_RED, RED_SPEED, RED_SENSE, RED_REACH, DUEL_S, BLACK_WIN_P, MAJOR_WIN_P, SUPER_MAJOR_EVERY, SUPER_CARRY_PIECES, SUPER_WIN_P, BUSH_MIN_ANTS, APHID_START, APHID_MAX, APHID_HONEY_S, BUSH_SENSE, BUSH_MAX_ANTS, HONEY_CLAIM_S, BUSH_REACH, BUSH_NEST_GAP, BUSH_EDGE_GAP, CATERPILLAR_BITE_S, CATERPILLAR_GAIN, CATERPILLAR_MAX_PIECES,
} from './constants';
import { FOOD_TABLE, isAlive, isFreeSpot, resolvePlacement, type FoodItem, type FoodKind, type PreyKind } from './food';
import { updateEnvironment } from './environment';
import { larvaeChambersNeeded, pantriesNeeded } from './nestNeeds';
import { PheromoneField } from './pheromone';
import { Rng } from './rng';
import type { RedAnt, RedNest } from './raid';
import { dropSpot, type Bush } from './aphids';
import { bodyPos, inWeb, spiderCorner, spiderCornerIndex, type Spider } from './spider';
import { extendTerrain, generateTerrain, speedAt, type Terrain } from './terrain';

/** 'nest' = underground: the ant is not on the surface (see `Ant.nestKind` for why it is inside). */
export type AntState = 'wander' | 'toFood' | 'gnaw' | 'carry' | 'nest';
/** Why an ant in state 'nest' is inside: freshly hatched, resting after a delivery, or a permanent nest worker. */
export type NestKind = 'hatch' | 'unload' | 'nurse';
export type AntRole = 'forager' | 'nurse' | 'guard';

export interface Ant {
  id: number;
  x: number;
  y: number;
  heading: number;
  state: AntState;
  /** Seconds lived (informational only: ants do not die of old age). */
  age: number;
  carry: number;
  /** Set while the carried piece is sugar; delivering it starts the colony speed boost. */
  carrySugar?: true;
  targetFood: number | null;
  /** Seconds of gnawing left while state is 'gnaw', seconds left inside while state is 'nest' (hatch / unload); 0 otherwise. */
  timer: number;
  /** Only while state is 'nest': why the ant is inside. Absent on the surface. */
  nestKind?: NestKind;
  role: AntRole;
  /** A major (big soldier ant): always kills living prey on touch and survives, ignores touch cooldowns, carries MAJOR_CARRY_PIECES pieces. Absent on ordinary ants and old saves. */
  major?: true;
  /** A super major (also `major`): twice the size of a major. One hatches per SUPER_MAJOR_EVERY ants of the colony. */
  superMajor?: true;
  /** TRANSIENT (not saved): leaf units this ant carries to the aphids bush (instead of food to the nest). */
  carryLeaf?: number;
  /** TRANSIENT (not saved): seconds left of a duel with a red ant; the ant stands still meanwhile. */
  duelT?: number;
  /** Normal mode: seconds this ant has been stuck in the spider's web (absent = free). A caught ant does not move or act. Saved. */
  caughtT?: number;
  /** Personality (drawn at spawn, saved; 1.0 = neutral for ants loaded from old saves). Walking speed factor. */
  speedMul: number;
  /** Scales heading jitter, the chance to stray off a trail, the pull of unexplored ground and the weave of a carrier. */
  curiosity: number;
  /** Divides the chance to stray off a trail: a stubborn ant follows a trail longer. */
  stubbornness: number;
  /** TRANSIENT (not saved): seconds a distracted wanderer still ignores pheromone (absent = following normally). */
  strayT?: number;
  /** TRANSIENT: the heading a distracted wanderer is turning toward while strayT > 0. */
  strayH?: number;
  /** TRANSIENT: seconds a confused carrier still heads off along lostH instead of toward the nest. */
  lostT?: number;
  /** TRANSIENT: heading of a confused carrier. */
  lostH?: number;
  /** TRANSIENT: smooth random heading offset (rad) of an ant walking to food or carrying; correlated over ~WEAVE_TAU_S. */
  weave?: number;
}

const BASE_SPEED = 12;
/** Honeydew within this distance (px) of the bush's centre is the aphids' (see nearestFood). */
const BUSH_HONEY_R = 170;
/** Cell size (px) of the grid of red ants that the black ants search. */
const RED_CELL = 16;
const MAX_TURN = 6 * STEP_S; // rad per substep
const FAN = 0.6;
/** How far ahead (px) and how wide (cells, each way) a pheromone-following ant senses a trail: a 1 px trail is easy to miss with less. */
const PHER_LOOKAHEAD = 6;
const PHER_R = 2;
/** Pheromone pull of a returning carrier (a wanderer's is 0.22, a forager walking to food 0.3). */
const CARRY_TRAIL_PULL = 0.12;
/** Nest-entrance trail scent: directions sampled, base chance to follow it, and the trail strength that makes it certain. */
const SCENT_DIRS = 24;
const SCENT_P = 0.7;
const SCENT_FULL = 0.5;
/** Radius within which a wandering ant notices food (pickup distance is separate and unchanged). Raised 16 -> 32 so bold, straight-heading scouts still find food. */
const SENSE_FOOD = 32;
/**
 * A young ant (the colony's first scouts) searches the neighbourhood of the nest first: until its range
 * YOUNG_R0 + YOUNG_GROW * age (px) exceeds the whole world it is blended back toward home beyond that range. The range
 * grows with the ant's age (about 80 s later it covers every corner), so it is NOT a permanent radius and old ants roam freely.
 */
const YOUNG_R0 = 100;
const YOUNG_GROW = 1.5;
const YOUNG_SPAN = 60;
const YOUNG_K = 0.15;
const YOUNG_MAX = 0.6;
/** Per-substep decay factor of the explored grid (half-life EXPLORE_HALF_LIFE_S). */
const EXPLORE_DECAY = Math.exp((-STEP_S * Math.LN2) / EXPLORE_HALF_LIFE_S);
/** Explored value a wandering ant adds to its cell per second spent there. */
const EXPLORE_RATE = 1;
/**
 * Score penalty per unit of explored value in the cell a candidate heading points at (a detected trail or food always outweighs it).
 * Scaled by the ant's curiosity as 0.7 + 0.3 * curiosity (0.88 - 1.18), so even the most curious ant keeps trail > explored ground
 * (EXPLORE_CAP * 0.1 * 1.18 = 0.71 < the pull 0.15 * MAX_PHEROMONE of a fresh trail).
 */
const EXPLORE_WEIGHT = 0.1;
/**
 * Score penalty of a wanderer's candidate heading whose EXPLORE_LOOKAHEAD point lies in the web of a living spider: larger
 * than any trail pull (0.15 * MAX_PHEROMONE = 0.75) plus the explored-ground spread (<= 0.71), so the ant turns away when it
 * can. It is a penalty, not a wall: a wanderer that already points into the web with every candidate (or is turned in by
 * the map edge) can still blunder in, so the spider keeps catching a few ants (measured with the headless gameplay sim).
 */
const WEB_AVOID_PENALTY = 2;
/** How far ahead (px) a wanderer reads the explored grid. */
const EXPLORE_LOOKAHEAD = 16;
const PICKUP_DIST = 1.5;
/** Beetle heading noise per substep (full range, rad): much calmer than an ant. */
const BEETLE_JITTER = 0.15;
/** Caterpillar heading noise per substep (full range, rad): it crawls almost straight. */
const CATERPILLAR_JITTER = 0.1;
/** Caterpillar pauses last this many seconds (it stops with the same chance per second as a beetle). */
const CATERPILLAR_PAUSE_MIN_S = 1;
const CATERPILLAR_PAUSE_MAX_S = 3;
/** Chance per second that a walking beetle stops; it then pauses BEETLE_PAUSE_MIN_S..MAX_S. */
const BEETLE_PAUSE_RATE = 0.2;
const BEETLE_PAUSE_MIN_S = 0.5;
const BEETLE_PAUSE_MAX_S = 2;
/** How far ahead (px) a beetle looks for stone, big twigs, the nest and the map edge. */
const BEETLE_LOOKAHEAD = 3;
/** Turns (rad) a beetle tries, in this order and both ways, when something is in its way. */
const BEETLE_TURNS = [0.5, 1, 1.6, 2.3, Math.PI];
/** Hop length range (px) of a startled fly, and how many random headings it tries per length scale. */
const HOP_MIN = 20;
const HOP_MAX = 35;
const HOP_TRIES = 8;
const HOP_SCALES = [1, 0.5, 0.25];
const DEPOSIT = 0.5;
const MAX_DT = 0.5;
const WANDER_JITTER = 0.3; // full range of per-step heading noise (+-0.15 rad): ants keep a heading and scout
/** Wanderers closer than OUTBOUND_R px to the nest are pushed outward (blend OUTBOUND_K) so they do not mill around the crater. */
const OUTBOUND_R = 50;
const OUTBOUND_K = 0.2;
/** Tolerance when comparing the fractional stock (pieces of 2/3) with FOOD_PER_ANT. */
const STOCK_EPS = 1e-6;
const TWO_PI = Math.PI * 2;
/** Candidate turns: the fan, plus a wider one that lets an ant swing around a big obstacle. */
const FAN_TURNS = [-2 * FAN, -FAN, 0, FAN, 2 * FAN];
/**
 * Terrain look-ahead: along each candidate heading the ant samples the ground every RAY_STEP px for RAY_N samples and
 * takes the harmonic mean speed (the real average speed over that stretch), so a stone in the way costs what it costs to
 * cross it. A candidate's score is that speed minus TURN_ARC * (1 - cos(turn)): turning costs a little, so on open ground
 * the ant keeps its heading, but a stone (speed 0.15) in the way is walked around.
 */
const RAY_STEP = 2;
const RAY_N = 6;
const TURN_ARC = 0.35;

function wrapAngle(a: number): number {
  a = (a + Math.PI) % TWO_PI;
  if (a < 0) a += TWO_PI;
  return a - Math.PI;
}

export type GameMode = 'sandbox' | 'normal';

export class World {
  terrain: Terrain;
  pher: PheromoneField;
  ants: Ant[] = [];
  food: FoodItem[] = [];
  /** The queen's food. Every FOOD_PER_ANT of it is a fed larva waiting to hatch. */
  stock = STARTER_STOCK;
  /** Food value delivered to the nest in total (stock only grows from it and shrinks by hatching); drives `queens`. */
  totalDelivered = 0;
  /** Seconds of the current hatching cycle, in [0, effective hatch interval); 0 while no cycle runs. */
  hatchProgress = 0;
  /**
   * Length of the current hatching cycle as a multiple of `hatchInterval`, drawn when the cycle starts
   * (1 - hatchJitter .. 1 + hatchJitter). TRANSIENT: 1 after a load, the next cycle draws again.
   */
  hatchMul = 1;
  /** Half-width of the cycle jitter (HATCH_JITTER); tests set 0 for exact timing. */
  hatchJitter = HATCH_JITTER;
  /** Highest `stock` ever reached (never decreases; saved). Sizes the pantries of the underground view. */
  peakStock: number;
  /** Highest `larvae` count ever reached (never decreases; saved). Sizes the brood chambers. */
  peakLarvae: number;
  /** Highest number of ants ever alive (never decreases; saved, restored as at least the live count). Sizes the queen chambers. */
  peakAnts = 0;
  /** True once the first ant has appeared (set by spawnAnt); hatching and rescue only run from then on. */
  started = false;
  /** Ants killed so far: by a defending beetle or eaten by the spider (transient: not saved, 0 after a load). */
  antsKilled = 0;
  /** Number of carried-food deliveries to the nest (transient: not saved, 0 after a load). */
  deliveryCount = 0;
  time = 0;
  nextId = 1;
  rng: Rng;
  seed: number;
  /** 'sandbox': MAX_ANTS, rescue on, never extinct. 'normal': MAX_ANTS_NORMAL, no rescue, the colony can die out. */
  mode: GameMode = 'sandbox';
  /** Map growth step 0..MAX_MAP_STEP; grown by the colony in normal mode, see terrainSize. */
  mapStep = 0;
  /** Bumped on every map growth step (the terrain, pheromone field and explored grid are new objects then). */
  mapVersion = 0;
  /** Normal mode: seconds until the next spontaneous prey / food appearance (0 = draw a new wait now). */
  spawnTimer = 0;
  /** Normal mode: the spider (created on the first step; null in sandbox and before that). */
  spider: Spider | null = null;
  /** Normal mode: the bush with aphids (null until the colony has BUSH_MIN_ANTS ants). Saved. */
  bush: Bush | null = null;
  /** The red ants' own pheromone: red foragers carrying food home lay it, red foragers follow it. */
  redPher: PheromoneField;
  /** The red ants' nest (null until the colony has RAID_MIN_ANTS ants). Saved (position and owner). */
  redNest: RedNest | null = null;
  /** Red raiders on the map (transient: not saved, a raid in progress ends with a reload). */
  reds: RedAnt[] = [];
  /** Seconds until the next raid; -1 = not drawn yet (the colony is below RAID_MIN_ANTS). Transient. */
  raidWait = -1;
  /** Seconds since the current raid began. */
  private raidAge = 0;
  /** Test hook: no guards (tests that count on every ant of a colony foraging). */
  noGuards = false;
  /** Test hook: no raids (tests that count ants exactly with a colony of 1000 or more). */
  noRaid = false;
  /** Red ants killed in raids so far, and raids started (transient). */
  redKilled = 0;
  raidsStarted = 0;
  /** Test hook: no spider is ever created (tests of unrelated mechanics that place ants anywhere on the map). */
  noSpider = false;
  /** Sim time (`time`) at which the next sugar piece may be placed (normal mode). */
  sugarReadyAt = 0;
  /** Sim time until which every ant moves SUGAR_BOOST_MUL times faster. */
  boostUntil = 0;
  /**
   * Coarse "where have ants been" map (exploreW x exploreH cells of EXPLORE_CELL px, row-major): wandering ants add
   * to their cell, values decay with half-life EXPLORE_HALF_LIFE_S and are capped at EXPLORE_CAP; wanderers prefer
   * headings toward less explored ground. TRANSIENT: never saved, empty after a load (it refills within a minute).
   * Treat as read-only outside the world (tests may poke values to arrange a situation). Covers the whole current
   * map: a map growth step replaces it with a bigger grid (old cells kept at the same cell coordinates).
   */
  explored: Float32Array;
  /** Columns / rows of the explored grid (ceil of the terrain size / EXPLORE_CELL). */
  private exploreW: number;
  private exploreH: number;
  private acc = 0;
  /** Seconds the colony has been empty and out of food (rescue clock; transient, not saved). */
  private rescueTimer = 0;
  /** Index of the last NURSE_EVAL_S slot of sim time in which the nurse count was re-evaluated (-1 = not yet; transient, derived from `time`). */
  private nurseSlot = -1;

  constructor(seed: number, terrain: Terrain, pher: PheromoneField, rng: Rng) {
    this.seed = seed;
    this.terrain = terrain;
    this.pher = pher;
    this.redPher = new PheromoneField(terrain.w, terrain.h);
    this.rng = rng;
    this.exploreW = Math.ceil(terrain.w / EXPLORE_CELL);
    this.exploreH = Math.ceil(terrain.h / EXPLORE_CELL);
    this.explored = new Float32Array(this.exploreW * this.exploreH);
    this.peakStock = this.stock;
    this.peakLarvae = this.larvae;
  }

  static create(seed: number, mode: GameMode = 'sandbox'): World {
    const terrain = generateTerrain(seed);
    const w = new World(seed, terrain, new PheromoneField(terrain.w, terrain.h), new Rng(seed ^ 0x9e3779b9));
    w.mode = mode;
    return w;
  }

  get maxAnts(): number {
    return this.mode === 'normal' ? MAX_ANTS_NORMAL : MAX_ANTS;
  }

  /** Normal mode only: the colony started, has no ants and not enough food for another. Evaluated on every call. */
  get extinct(): boolean {
    return this.mode === 'normal' && this.started && this.ants.length === 0 && this.stock + STOCK_EPS < FOOD_PER_ANT;
  }

  /** Seconds until sugar can be placed again (>= 0). */
  get sugarCooldownLeft(): number {
    return Math.max(0, this.sugarReadyAt - this.time);
  }

  /** Seconds of sugar speed boost left (>= 0). */
  get boostLeft(): number {
    return Math.max(0, this.boostUntil - this.time);
  }

  /** Fed larvae waiting to hatch (stock is fractional, hence the epsilon). */
  get larvae(): number {
    return Math.floor((this.stock + STOCK_EPS) / FOOD_PER_ANT);
  }

  /** Number of queens: one, plus one per FOOD_PER_QUEEN delivered in total, at most MAX_QUEENS. */
  get queens(): number {
    return Math.min(MAX_QUEENS, 1 + Math.floor(this.totalDelivered / FOOD_PER_QUEEN)) + (this.redNest?.owner === 'black' ? CAPTURED_QUEENS : 0);
  }

  /** Seconds between two hatches: each queen lays on her own HATCH_INTERVAL_S cycle. */
  get hatchInterval(): number {
    return (HATCH_INTERVAL_S / this.queens) * (this.redNest?.owner === 'black' ? CAPTURED_HATCH_MUL : 1);
  }

  /** Progress of the current hatching cycle in [0, 1] (the cycle is `hatchInterval * hatchMul` long). */
  get hatchFraction(): number {
    return Math.max(0, Math.min(1, this.hatchProgress / (this.hatchInterval * this.hatchMul)));
  }

  /** What the underground layout needs: queens, and pantries / brood chambers for the peak stock / larvae. */
  get nestNeeds(): { queens: number; pantries: number; larvaeChambers: number } {
    return {
      queens: this.queens,
      pantries: pantriesNeeded(this.peakStock, this.mode),
      larvaeChambers: larvaeChambersNeeded(this.peakLarvae, this.mode),
    };
  }

  /** Ants working in the nest for good (role 'nurse'): they feed the queen, carry eggs and never go out. */
  get nurses(): number {
    let n = 0;
    for (const a of this.ants) if (a.role === 'nurse') n++;
    return n;
  }

  /** Wanted nurses: NURSES_PER_QUEEN per queen plus one per LARVAE_PER_NURSE larvae, but at most NURSE_MAX_FRACTION of all ants. */
  get desiredNurses(): number {
    const need = this.queens * NURSES_PER_QUEEN + Math.ceil(this.larvae / LARVAE_PER_NURSE);
    const cap = Math.floor(this.ants.length * NURSE_MAX_FRACTION + 1e-9);
    return Math.max(0, Math.min(need, cap));
  }

  /** Ants that are majors. They count in `ants.length` (and so toward `maxAnts`) too. */
  /** Super majors in the colony. */
  get supers(): number {
    let n = 0;
    for (const a of this.ants) if (a.superMajor) n++;
    return n;
  }

  get majors(): number {
    let n = 0;
    for (const a of this.ants) if (a.major) n++;
    return n;
  }

  /** Radius of the spider's web (art px). */
  get spiderWebR(): number {
    return SPIDER_WEB_R;
  }

  /** Ants currently stuck in the web. */
  get caughtAnts(): number {
    let n = 0;
    for (const a of this.ants) if (a.caughtT !== undefined) n++;
    return n;
  }

  /** Ants on the surface (everything but state 'nest'). */
  get antsOnSurface(): number {
    let n = 0;
    for (const a of this.ants) if (a.state !== 'nest') n++;
    return n;
  }

  /** Ants underground (state 'nest'): hatchlings, unloading foragers and nurses. They count in `ants.length` too. */
  get antsInNest(): number {
    let n = 0;
    for (const a of this.ants) if (a.state === 'nest') n++;
    return n;
  }

  /**
   * A new ant. `inNest = false` (default): it appears on the surface at the entrance at once (intro's first ant,
   * rescue ant). `inNest = true`: a hatchling, underground for HATCH_STAY_S * (0.85 + 0.3 * random) seconds.
   */
  spawnAnt(inNest = false): Ant {
    const rng = this.rng;
    const ant: Ant = {
      id: this.nextId++,
      x: NEST.x + (rng.next() - 0.5) * 4,
      y: NEST.y + (rng.next() - 0.5) * 4,
      heading: rng.next() * TWO_PI - Math.PI,
      state: 'wander',
      age: 0,
      carry: 0,
      targetFood: null,
      timer: 0,
      role: 'forager',
      speedMul: 1,
      curiosity: 1,
      stubbornness: 1,
    };
    // Personality last, so the draws above keep their order.
    ant.speedMul = SPEED_MUL_MIN + (SPEED_MUL_MAX - SPEED_MUL_MIN) * rng.next();
    ant.curiosity = CURIOSITY_MIN + (CURIOSITY_MAX - CURIOSITY_MIN) * rng.next();
    ant.stubbornness = STUBBORNNESS_MIN + (STUBBORNNESS_MAX - STUBBORNNESS_MIN) * rng.next();
    if (inNest) {
      ant.state = 'nest';
      ant.nestKind = 'hatch';
      ant.timer = HATCH_STAY_S * (0.85 + 0.3 * rng.next());
    }
    this.ants.push(ant);
    this.started = true;
    return ant;
  }

  /** Secret cheat: up to `n` more wandering ants at the entrance, never beyond maxAnts. Returns how many were added. */
  addAnts(n: number): number {
    let added = 0;
    while (added < n && this.ants.length < this.maxAnts) {
      this.spawnAnt();
      added++;
    }
    return added;
  }

  placeFood(kind: FoodKind, x: number, y: number): FoodItem | null {
    if (kind === 'leaf' && this.food.some((f) => f.kind === 'leaf')) return null; // one pile of leaves at a time
    const p = resolvePlacement(this.terrain, x, y);
    if (!p) return null;
    const item: FoodItem = { id: this.nextId++, kind, x: p.x, y: p.y, piecesLeft: FOOD_TABLE[kind].pieces };
    if (kind === 'beetle' || kind === 'fly' || kind === 'caterpillar') {
      // A placed beetle / fly / caterpillar is a living creature until two ants have touched it.
      item.alive = true;
      item.touches = 0;
      item.heading = this.rng.next() * TWO_PI - Math.PI;
      if (kind !== 'fly') item.speedMul = 1 + PREY_SPEED_VAR * (2 * this.rng.next() - 1);
    }
    this.food.push(item);
    return item;
  }

  /** Normal mode only, and only when the cooldown is over: places a piece of sugar and starts the cooldown. */
  placeSugar(x: number, y: number): FoodItem | null {
    if (this.mode !== 'normal' || this.time < this.sugarReadyAt) return null;
    const item = this.placeFood('sugar', x, y);
    if (item) this.sugarReadyAt = this.time + SUGAR_COOLDOWN_S;
    return item;
  }

  moveFood(id: number, x: number, y: number): boolean {
    const item = this.food.find((f) => f.id === id);
    if (!item) return false;
    const p = resolvePlacement(this.terrain, x, y);
    if (!p) return false;
    item.x = p.x;
    item.y = p.y;
    delete item.hop; // dragging cancels a hop in the air (and is not a touch)
    return true;
  }

  removeFood(id: number): void {
    const i = this.food.findIndex((f) => f.id === id);
    if (i >= 0) this.food.splice(i, 1);
    for (const a of this.ants) {
      if (a.targetFood !== id) continue;
      a.targetFood = null;
      if (a.state === 'nest') continue; // an unloading ant keeps its clock; it wanders on emerging
      if (a.state === 'toFood' || a.state === 'gnaw') a.state = 'wander';
      a.timer = 0;
    }
  }

  /**
   * Grows the map step by step from `mapStep` up to min(step, MAX_MAP_STEP); a lower or equal step does nothing.
   * Each step extends the terrain to the right and down (all coordinates stay valid) and replaces terrain, pheromone
   * field and explored grid with bigger copies. Uses no randomness of the world's rng.
   */
  growMapTo(step: number): void {
    const target = Math.min(MAX_MAP_STEP, Math.floor(step));
    while (this.mapStep < target) {
      const next = this.mapStep + 1;
      this.terrain = extendTerrain(this.terrain, next);
      this.pher = this.pher.grown(this.terrain.w, this.terrain.h);
      this.redPher = this.redPher.grown(this.terrain.w, this.terrain.h);
      const ow = this.exploreW;
      const oh = this.exploreH;
      const old = this.explored;
      this.exploreW = Math.ceil(this.terrain.w / EXPLORE_CELL);
      this.exploreH = Math.ceil(this.terrain.h / EXPLORE_CELL);
      this.explored = new Float32Array(this.exploreW * this.exploreH);
      for (let y = 0; y < oh; y++) this.explored.set(old.subarray(y * ow, (y + 1) * ow), y * this.exploreW);
      this.mapStep = next;
      this.mapVersion++;
    }
  }

  step(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (this.extinct) return; // the colony is dead: time stands still
    this.acc += Math.min(dt, MAX_DT);
    const n = Math.floor(this.acc / STEP_S + 1e-9);
    this.acc = Math.max(0, this.acc - n * STEP_S);
    for (let i = 0; i < n; i++) this.substep();
  }

  private substep(): void {
    this.substepNo++;
    // how many ants are collecting the aphids' honeydew now (on their way to a drop or gnawing at it)
    const bush = this.bush;
    if (bush) {
      const ids = new Set<number>();
      for (const f of this.food) if (f.kind === 'honeydew' && Math.hypot(f.x - bush.x, f.y - bush.y) <= BUSH_HONEY_R) ids.add(f.id);
      let n = 0;
      for (const a of this.ants) if ((a.state === 'toFood' || a.state === 'gnaw') && a.targetFood !== null && ids.has(a.targetFood)) n++;
      this.honeyCollectors = n;
    } else this.honeyCollectors = 0;
    const ex = this.explored;
    for (let i = 0; i < ex.length; i++) ex[i] *= EXPLORE_DECAY;
    if (this.spider?.alive) this.saturateWeb(this.spider);
    for (const ant of this.ants) this.updateAnt(ant);
    this.trackPeaks();
    this.updateCreatures();
    this.resolveTouches();
    this.hatch();
    this.rescue();
    if (this.mode === 'normal') {
      // The map follows the colony size, one step per substep at most, and never shrinks.
      const wanted = Math.min(MAX_MAP_STEP, Math.floor(this.ants.length / MAP_STEP_ANTS));
      if (wanted > this.mapStep) this.growMapTo(this.mapStep + 1);
      updateEnvironment(this);
      this.updateBush();
      this.updateRedNest();
    }
    this.updateRaid(); // also in sandbox, so the secret raid key works there (it never starts by itself below RAID_MIN_ANTS ants)
    this.updateSpider();
    this.pher.step(STEP_S);
    // the red trail evaporates like the black one (every 4th substep, in one go: only while red ants are about; it is wiped when they are gone)
    if (this.reds.length > 0) {
      if (this.substepNo % 4 === 0) this.redPher.step(STEP_S * 4);
    } else if (this.redPherDirty) {
      this.redPher.data.fill(0);
      this.redPherDirty = false;
    }
    this.time += STEP_S;
    this.updateNurses();
  }

  /**
   * Normal mode, once per substep, after the ants moved: creates the spider on the first step, catches surface ants that
   * stand in the web, kills the spider when two majors are caught at once (everyone is freed), otherwise eats one caught
   * ant every SPIDER_EAT_S: the longest-caught ordinary ant, or, when none is caught, a major that has hung in the web for
   * SPIDER_MAJOR_HOLD_S. A dead spider counts down to its replacement. Uses no randomness of the world's rng.
   */
  /** The `index`-th spider of the game: sandbox always settles in the lower right corner, normal mode in a corner drawn from (seed, index). */
  private newSpider(index: number): Spider {
    const corner = this.mode === 'sandbox' ? 1 : spiderCornerIndex(this.seed, index);
    const c = spiderCorner(this.seed, index, corner);
    return { x: c.x, y: c.y, alive: true, eatT: 0, respawnT: 0, corner };
  }

  private updateSpider(): void {
    if (this.noSpider) return;
    if (!this.spider) {
      this.spider = this.newSpider(0);
    }
    const sp = this.spider;
    if (!sp.alive) {
      sp.respawnT -= STEP_S;
      if (sp.respawnT <= 1e-9) {
        // The replacement's corner depends on the seed and the (whole-second) time of the respawn, so it is reproducible.
        const index = 1 + Math.floor(this.time);
        this.spider = this.newSpider(index);
      }
      return;
    }
    let majors = 0;
    let longest: Ant | null = null; // longest-caught ordinary ant
    let longestMajor: Ant | null = null;
    for (const a of this.ants) {
      if (a.caughtT === undefined) {
        if (a.state === 'nest' || !inWeb(sp, a.x, a.y)) continue;
        a.caughtT = 0;
      }
      if (a.major) {
        majors += a.superMajor ? 2 : 1; // a super major counts for two when the spider is overpowered
        if (!longestMajor || a.caughtT > (longestMajor.caughtT as number)) longestMajor = a;
      } else if (!longest || a.caughtT > (longest.caughtT as number)) {
        longest = a;
      }
    }
    if (majors >= 2) {
      sp.alive = false;
      sp.eatT = 0;
      sp.respawnT = SPIDER_RESPAWN_S;
      for (const a of this.ants) delete a.caughtT;
      return;
    }
    // Flies caught in the web are served first: the spider walks to the nearest one and eats it after SPIDER_FLY_EAT_S.
    let fly: FoodItem | null = null;
    let flyD = Infinity;
    const body = bodyPos(sp);
    for (const f of this.food) {
      const d = f.stuck ? Math.hypot(f.x - body.x, f.y - body.y) : Infinity;
      if (d < flyD) {
        flyD = d;
        fly = f;
      }
    }
    if (fly) {
      if (this.walkSpider(sp, fly.x, fly.y)) {
        fly.eatT = (fly.eatT ?? 0) + STEP_S;
        if (fly.eatT >= SPIDER_FLY_EAT_S - 1e-9) this.food.splice(this.food.indexOf(fly), 1);
      }
      return;
    }
    if (!longest && !longestMajor) {
      sp.eatT = 0;
      this.walkSpider(sp, sp.x, sp.y); // back to the middle of the web
      return;
    }
    const target = (longest ?? longestMajor) as Ant;
    const arrived = this.walkSpider(sp, target.x, target.y);
    sp.eatT += STEP_S;
    if (sp.eatT < SPIDER_EAT_S - 1e-9 || !arrived) return;
    // Ordinary ants first; a lone major only after SPIDER_MAJOR_HOLD_S, so a second major has time to come and help.
    const meal = longest ?? ((longestMajor!.caughtT as number) >= SPIDER_MAJOR_HOLD_S - 1e-9 ? longestMajor : null);
    if (!meal) {
      sp.eatT = SPIDER_EAT_S; // hungry: eats the held major the moment its hold is over
      return;
    }
    sp.eatT = 0;
    const i = this.ants.indexOf(meal);
    if (i >= 0) this.ants.splice(i, 1); // whatever it carried is lost
    this.antsKilled++;
  }

  /** Moves the spider's body one substep toward (tx, ty) along the web; true once it is within reach (2 px) of it. */
  private walkSpider(sp: Spider, tx: number, ty: number): boolean {
    const b = bodyPos(sp);
    const d = Math.hypot(tx - b.x, ty - b.y);
    const step = SPIDER_SPEED * STEP_S;
    if (d <= 2) return true;
    sp.bx = b.x + ((tx - b.x) / d) * Math.min(step, d);
    sp.by = b.y + ((ty - b.y) / d) * Math.min(step, d);
    return d - step <= 2;
  }

  /**
   * While the spider lives, every explored-grid cell that overlaps its web is held at EXPLORE_CAP, so wanderers see the web
   * as well-trodden ground and are not drawn into it by the pull of unexplored ground. Recomputed from the spider's
   * position and the current grid every substep (respawn in another corner, map growth).
   */
  private saturateWeb(sp: Spider): void {
    const r = SPIDER_WEB_R;
    const x0 = Math.max(0, Math.floor((sp.x - r) / EXPLORE_CELL));
    const x1 = Math.min(this.exploreW - 1, Math.floor((sp.x + r) / EXPLORE_CELL));
    const y0 = Math.max(0, Math.floor((sp.y - r) / EXPLORE_CELL));
    const y1 = Math.min(this.exploreH - 1, Math.floor((sp.y + r) / EXPLORE_CELL));
    for (let cy = y0; cy <= y1; cy++) {
      const ny = Math.max(cy * EXPLORE_CELL, Math.min((cy + 1) * EXPLORE_CELL, sp.y)) - sp.y;
      for (let cx = x0; cx <= x1; cx++) {
        const nx = Math.max(cx * EXPLORE_CELL, Math.min((cx + 1) * EXPLORE_CELL, sp.x)) - sp.x;
        if (nx * nx + ny * ny <= r * r) this.explored[cy * this.exploreW + cx] = EXPLORE_CAP;
      }
    }
  }

  /** Would a creature stepping from (x0, y0) to (x1, y1) get (deeper) into the web of a living spider? Prey keeps out of it. */
  private intoWeb(x0: number, y0: number, x1: number, y1: number): boolean {
    const sp = this.spider;
    if (!sp || !inWeb(sp, x1, y1)) return false;
    return Math.hypot(x1 - sp.x, y1 - sp.y) < Math.hypot(x0 - sp.x, y0 - sp.y);
  }

  /**
   * Every NURSE_EVAL_S of sim time: too few nurses -> promote ants that are inside the nest (hatchlings about to emerge
   * first, then unloaders); too many -> the oldest nurse goes out as a wandering forager (one per evaluation).
   * Ants on the surface are never recalled.
   */
  private updateNurses(): void {
    const slot = Math.floor(this.time / NURSE_EVAL_S + 1e-9);
    if (this.nurseSlot < 0) this.nurseSlot = slot; // fresh world or a load: wait for the next boundary
    if (slot <= this.nurseSlot) return;
    this.nurseSlot = slot;
    this.updateGuards();
    // Majors (big soldiers) are not nest workers: any that were nurses go out to the surface.
    for (const a of this.ants) {
      if (a.role === 'nurse' && a.major) {
        a.role = 'forager';
        this.emerge(a, 'wander');
      }
    }
    const want = this.desiredNurses;
    const have = this.nurses;
    if (have < want) {
      const candidates = this.ants
        .filter((a) => a.state === 'nest' && a.role !== 'nurse' && !a.major)
        .sort((a, b) => (a.nestKind === b.nestKind ? 0 : a.nestKind === 'hatch' ? -1 : 1) || a.timer - b.timer);
      for (const a of candidates.slice(0, want - have)) {
        a.role = 'nurse';
        a.nestKind = 'nurse';
        a.timer = 0;
        a.targetFood = null;
      }
    } else if (have > want) {
      let oldest: Ant | undefined;
      for (const a of this.ants) if (a.role === 'nurse' && (!oldest || a.age > oldest.age)) oldest = a;
      if (oldest) {
        oldest.role = 'forager';
        this.emerge(oldest, 'wander');
      }
    }
  }

  /**
   * About GUARD_FRACTION of the colony (once it has GUARD_MIN_COLONY ants) are guards: they circle the nest and fight the red
   * ants instead of foraging. Majors are chosen first, then ordinary ants on the surface that carry nothing.
   */
  private updateGuards(): void {
    const want = !this.noGuards && this.ants.length >= GUARD_MIN_COLONY ? Math.floor(this.ants.length * GUARD_FRACTION) : 0;
    let have = 0;
    for (const a of this.ants) if (a.role === 'guard') have++;
    if (have < want) {
      const free = (a: Ant): boolean => a.state !== 'nest' && a.role === 'forager' && a.carry === 0 && a.carryLeaf === undefined && a.caughtT === undefined && a.duelT === undefined;
      const picks = this.ants.filter((a) => free(a) && a.major === true).concat(this.ants.filter((a) => free(a) && a.major !== true));
      for (const a of picks.slice(0, want - have)) {
        a.role = 'guard';
        a.state = 'wander';
        a.targetFood = null;
      }
    } else if (have > want) {
      let extra = have - want;
      for (const a of this.ants) {
        if (extra <= 0) break;
        if (a.role === 'guard' && a.major !== true) {
          a.role = 'forager';
          extra--;
        }
      }
      for (const a of this.ants) {
        if (extra <= 0) break;
        if (a.role === 'guard') {
          a.role = 'forager';
          extra--;
        }
      }
    }
  }

  /** Remembers the highest stock / larvae count reached (the nest is sized by the peaks, which never shrink). */
  private trackPeaks(): void {
    if (this.stock > this.peakStock) this.peakStock = this.stock;
    const l = this.larvae;
    if (l > this.peakLarvae) this.peakLarvae = l;
    if (this.ants.length > this.peakAnts) this.peakAnts = this.ants.length;
  }

  /** Living creatures: cooldowns tick, hopping flies fly, beetles and caterpillars walk. */
  private updateCreatures(): void {
    for (const f of this.food) {
      if (!isAlive(f)) continue;
      if (f.cooldown !== undefined && f.cooldown > 0) f.cooldown = Math.max(0, f.cooldown - STEP_S);
      if (f.fleeT !== undefined) {
        f.fleeT -= STEP_S;
        if (f.fleeT <= 1e-9) delete f.fleeT;
      }
      if (f.kind === 'fly') {
        // A fly that walks (or is dropped) into the web sticks to it; one that is no longer in a living web is free again.
        const caught = this.spider?.alive === true && inWeb(this.spider, f.x, f.y);
        if (caught) {
          f.stuck = true;
          delete f.hop;
          continue;
        }
        delete f.stuck;
        delete f.eatT;
      }
      if (f.hop) {
        const hop = f.hop;
        hop.t += STEP_S;
        const k = Math.min(1, hop.t / hop.dur);
        f.x = hop.fromX + (hop.toX - hop.fromX) * k;
        f.y = hop.fromY + (hop.toY - hop.fromY) * k;
        if (hop.t >= hop.dur - 1e-9) {
          f.x = hop.toX;
          f.y = hop.toY;
          delete f.hop;
        }
      } else if (f.kind === 'caterpillar') {
        if (!this.feedCaterpillar(f)) this.walkCrawler(f);
      } else if (f.kind === 'beetle' || f.kind === 'fly') {
        this.walkCrawler(f);
      }
    }
  }

  /**
   * A hungry caterpillar (not fleeing, below CATERPILLAR_MAX_PIECES) turns toward the nearest leaves within LEAF_SENSE and,
   * once at them, stands and chews: every CATERPILLAR_BITE_S one leaf unit disappears and the caterpillar gains
   * CATERPILLAR_GAIN pieces of meat (it grows longer, and a killed one is worth more). Returns true while it stands eating.
   */
  private feedCaterpillar(f: FoodItem): boolean {
    if ((f.fleeT ?? 0) > 0 || f.piecesLeft >= CATERPILLAR_MAX_PIECES) return false;
    let leaf: FoodItem | null = null;
    let best = LEAF_SENSE;
    for (const l of this.food) {
      if (l.kind !== 'leaf' || l.piecesLeft <= 0) continue;
      const d = Math.hypot(l.x - f.x, l.y - f.y);
      if (d <= best) {
        best = d;
        leaf = l;
      }
    }
    if (!leaf) {
      delete f.biteT;
      return false;
    }
    if (best > LEAF_REACH) {
      f.heading = Math.atan2(leaf.y - f.y, leaf.x - f.x);
      return false;
    }
    f.biteT = (f.biteT ?? 0) + STEP_S;
    if (f.biteT >= CATERPILLAR_BITE_S - 1e-9) {
      f.biteT = 0;
      leaf.piecesLeft -= 1;
      f.piecesLeft = Math.min(CATERPILLAR_MAX_PIECES, f.piecesLeft + CATERPILLAR_GAIN);
      if (leaf.piecesLeft <= 0) this.food.splice(this.food.indexOf(leaf), 1);
    }
    return true;
  }

  /**
   * A beetle / caterpillar ambles with little heading noise, pauses now and then and turns away from obstacles; it never
   * steps onto a blocked spot, nor (deeper) into the web of a living spider. A caterpillar is slower than a beetle, and while it flees (fleeT > 0) it neither pauses
   * nor crawls at the normal pace.
   */
  private walkCrawler(f: FoodItem): void {
    const rng = this.rng;
    const cat = f.kind === 'caterpillar';
    const fly = f.kind === 'fly';
    const fleeing = cat && (f.fleeT ?? 0) > 0;
    if (f.wanderT !== undefined && f.wanderT > 0) {
      f.wanderT -= STEP_S;
      return;
    }
    if (!fleeing && rng.next() < BEETLE_PAUSE_RATE * STEP_S) {
      const lo = cat ? CATERPILLAR_PAUSE_MIN_S : BEETLE_PAUSE_MIN_S;
      const hi = cat ? CATERPILLAR_PAUSE_MAX_S : BEETLE_PAUSE_MAX_S;
      f.wanderT = lo + (hi - lo) * rng.next();
      return;
    }
    let h = (f.heading ?? 0) + (rng.next() - 0.5) * (cat ? CATERPILLAR_JITTER : BEETLE_JITTER);
    const t = this.terrain;
    const freeAhead = (a: number): boolean => {
      const ax = f.x + Math.cos(a) * BEETLE_LOOKAHEAD;
      const ay = f.y + Math.sin(a) * BEETLE_LOOKAHEAD;
      return isFreeSpot(t, ax, ay) && (fly || !this.intoWeb(f.x, f.y, ax, ay));
    };
    if (!freeAhead(h)) {
      const sign = rng.next() < 0.5 ? 1 : -1;
      let turned = false;
      for (const k of BEETLE_TURNS) {
        if (freeAhead(h + sign * k)) {
          h += sign * k;
          turned = true;
        } else if (freeAhead(h - sign * k)) {
          h -= sign * k;
          turned = true;
        }
        if (turned) break;
      }
      if (!turned) {
        f.wanderT = 1; // boxed in: wait a moment
        return;
      }
    }
    f.heading = wrapAngle(h);
    const base = cat ? CATERPILLAR_SPEED * (fleeing ? CATERPILLAR_FLEE_MUL : 1) : fly ? FLY_SPEED : BEETLE_SPEED;
    const v = base * (f.speedMul ?? 1) * speedAt(t, f.x, f.y) * STEP_S;
    const nx = f.x + Math.cos(f.heading) * v;
    const ny = f.y + Math.sin(f.heading) * v;
    if (isFreeSpot(t, nx, ny) && (fly || !this.intoWeb(f.x, f.y, nx, ny))) {
      f.x = nx;
      f.y = ny;
    }
  }

  /** Each living creature that is touchable and has an ant (wander / toFood) within TOUCH_DIST gets exactly one touch per substep. */
  private resolveTouches(): void {
    if (this.ants.length === 0) return;
    for (const f of this.food) {
      if (!isAlive(f) || f.hop || f.stuck) continue;
      const onCooldown = (f.cooldown ?? 0) > 1e-9;
      let toucher: Ant | null = null;
      for (const ant of this.ants) {
        if (ant.state !== 'wander' && ant.state !== 'toFood') continue;
        if (ant.caughtT !== undefined) continue;
        if (onCooldown && !ant.major) continue;
        if (Math.hypot(ant.x - f.x, ant.y - f.y) > TOUCH_DIST) continue;
        // A major in reach wins over any ordinary ant (and ignores the cooldown); otherwise the first ant in array order.
        if (ant.major) {
          toucher = ant;
          break;
        }
        if (!toucher) toucher = ant;
      }
      if (toucher) this.touch(f, toucher);
    }
  }

  /** A living creature dies and becomes carrion with its own meat (a fattened caterpillar is worth more). */
  private killCreature(f: FoodItem): void {
    const was = f.kind as PreyKind;
    f.alive = false;
    f.kind = 'carrion';
    f.corpseOf = was;
    f.piecesLeft = was === 'caterpillar' ? Math.max(f.piecesLeft, FOOD_TABLE[was].pieces) : FOOD_TABLE[was].pieces;
    delete f.cooldown;
    delete f.biteT;
    delete f.hop;
    delete f.wanderT;
    delete f.fleeT;
  }

  /**
   * A red forager touches a living creature (the same rules as for a black ant): the second touch kills it (it becomes carrion
   * the red ants take home too); the first makes a fly hop away and a caterpillar flee, and a beetle kills the red ant that
   * touched it. Returns false when the red ant died.
   */
  private redTouch(r: RedAnt, f: FoodItem): boolean {
    if (!isAlive(f) || f.hop || f.stuck || (f.cooldown ?? 0) > 1e-9) return true;
    f.touches = (f.touches ?? 0) + 1;
    f.cooldown = f.kind === 'fly' ? Math.max(TOUCH_COOLDOWN_S, HOP_DUR + 0.2) : TOUCH_COOLDOWN_S;
    if (f.touches >= 2) {
      this.killCreature(f);
      return true;
    }
    if (f.kind === 'beetle') {
      const i = this.reds.indexOf(r);
      if (i >= 0) this.reds.splice(i, 1);
      this.redKilled++;
      return false;
    }
    if (f.kind === 'caterpillar') {
      f.fleeT = CATERPILLAR_FLEE_S;
      f.heading = Math.atan2(f.y - r.y, f.x - r.x);
      f.wanderT = 0;
    } else {
      this.startHop(f);
    }
    return true;
  }

  private touch(f: FoodItem, ant: Ant): void {
    f.touches = (f.touches ?? 0) + 1;
    f.cooldown = f.kind === 'fly' ? Math.max(TOUCH_COOLDOWN_S, HOP_DUR + 0.2) : TOUCH_COOLDOWN_S;
    if (f.touches >= 2 || ant.major) {
      // Second touch (or any touch of a major): the creature dies and becomes carrion with its own meat; the ant survives and goes for it.
      this.killCreature(f);
      ant.state = 'toFood';
      ant.targetFood = f.id;
      ant.timer = 0;
      return;
    }
    if (f.kind === 'beetle') {
      // First touch of a beetle: the touching ant dies (removed in place, so the array identity stays).
      const i = this.ants.indexOf(ant);
      if (i >= 0) this.ants.splice(i, 1);
      this.antsKilled++;
      return;
    }
    if (f.kind === 'caterpillar') {
      // First touch of a caterpillar: it hurries away from the ant for CATERPILLAR_FLEE_S; the ant is unhurt and keeps chasing.
      f.fleeT = CATERPILLAR_FLEE_S;
      f.heading = Math.atan2(f.y - ant.y, f.x - ant.x);
      f.wanderT = 0;
      ant.state = 'toFood';
      ant.targetFood = f.id;
      ant.timer = 0;
      return;
    }
    // First touch of a fly: it hops away and the ant keeps chasing it.
    this.startHop(f);
    ant.state = 'toFood';
    ant.targetFood = f.id;
    ant.timer = 0;
  }

  /**
   * Hop 20-35 px in a random direction to a free spot (8 headings, then shorter hops); stays put if nothing is free.
   * A spot in the web of a living spider does not count as free.
   */
  private startHop(f: FoodItem): void {
    const rng = this.rng;
    for (const scale of HOP_SCALES) {
      for (let i = 0; i < HOP_TRIES; i++) {
        const h = rng.next() * TWO_PI - Math.PI;
        const d = (HOP_MIN + (HOP_MAX - HOP_MIN) * rng.next()) * scale;
        const tx = f.x + Math.cos(h) * d;
        const ty = f.y + Math.sin(h) * d;
        if (!isFreeSpot(this.terrain, tx, ty) || inWeb(this.spider, tx, ty)) continue;
        f.hop = { fromX: f.x, fromY: f.y, toX: tx, toY: ty, t: 0, dur: HOP_DUR };
        f.heading = h;
        return;
      }
    }
  }

  /** One hatching cycle per effective interval (HATCH_INTERVAL_S / queens) while there is food and room; at most one hatch per substep. */
  private hatch(): void {
    if (!this.started || this.stock + STOCK_EPS < FOOD_PER_ANT || this.ants.length >= this.maxAnts) {
      this.hatchProgress = 0;
      return;
    }
    if (this.hatchProgress === 0) {
      // A new cycle starts: its length is the nominal interval times 0.8 .. 1.2, fixed for the whole cycle.
      this.hatchMul = 1 - this.hatchJitter + 2 * this.hatchJitter * this.rng.next();
    }
    this.hatchProgress += STEP_S;
    if (this.hatchProgress >= this.hatchInterval * this.hatchMul - 1e-9) {
      this.stock = Math.max(0, Math.round((this.stock - FOOD_PER_ANT) * 1e6) / 1e6);
      const hatched = this.spawnAnt(true);
      // Drawn after every other draw of this hatch; below MAJOR_MIN_ANTS nothing is drawn (seeded sequences stay unchanged).
      if (this.ants.length >= MAJOR_MIN_ANTS && this.rng.next() < MAJOR_CHANCE
        && this.majors + 1 <= Math.floor(this.ants.length * MAJOR_MAX_FRACTION + 1e-9)) {
        hatched.major = true;
      }
      // one super major for every SUPER_MAJOR_EVERY ants of the colony (no random draw: it does not disturb the seeded sequences)
      if (this.supers + 1 <= Math.floor(this.ants.length / SUPER_MAJOR_EVERY)) {
        hatched.major = true;
        hatched.superMajor = true;
      }
      this.hatchProgress = 0;
    }
  }

  /** Never soft-lock: an empty, foodless started colony gets one free ant after RESCUE_AFTER_S. */
  private rescue(): void {
    if (this.mode === 'normal' || !this.started || this.ants.length > 0 || this.stock + STOCK_EPS >= FOOD_PER_ANT) {
      this.rescueTimer = 0;
      return;
    }
    this.rescueTimer += STEP_S;
    if (this.rescueTimer >= RESCUE_AFTER_S - 1e-9) {
      this.rescueTimer = 0;
      this.spawnAnt();
    }
  }

  private findFood(id: number | null): FoodItem | undefined {
    return id === null ? undefined : this.food.find((f) => f.id === id);
  }

  private nearestFood(x: number, y: number, asker?: Ant): FoodItem | undefined {
    let best: FoodItem | undefined;
    let bestD = SENSE_FOOD;
    for (const f of this.food) {
      if (f.piecesLeft <= 0 || f.stuck) continue;
      if (f.kind === 'leaf' && !this.bush) continue; // without aphids to feed, ants leave leaves to the caterpillars
      const d = Math.hypot(f.x - x, f.y - y);
      // the aphids' honeydew hangs inside the big bush: ants notice it from the edge of the canopy
      const bushHoney = f.kind === 'honeydew' && this.bush !== null && Math.hypot(f.x - this.bush.x, f.y - this.bush.y) <= BUSH_HONEY_R;
      if (bushHoney) {
        // one ant per drop, and at most BUSH_MAX_ANTS ants in the bush at once (those already in it may go on)
        const claim = this.honeyClaims.get(f.id);
        if (claim && claim.ant !== asker && this.time - claim.t < HONEY_CLAIM_S && claim.ant.targetFood === f.id) continue;
        if (this.honeyCollectors >= BUSH_MAX_ANTS) continue; // enough ants are already collecting honeydew (others still walk past)
      }
      if (d <= (bushHoney ? SENSE_FOOD + BUSH_SENSE : SENSE_FOOD) && (!best || d <= bestD)) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }

  /** Puts the ant back on the surface at the entrance (small random offset). */
  private emerge(ant: Ant, state: 'wander' | 'toFood'): void {
    const rng = this.rng;
    ant.x = NEST.x + (rng.next() - 0.5) * 4;
    ant.y = NEST.y + (rng.next() - 0.5) * 4;
    ant.state = state;
    ant.timer = 0;
    delete ant.nestKind;
    if (state === 'wander') {
      ant.targetFood = null;
      this.scentTrail(ant);
    }
  }

  /**
   * A forager leaving the nest smells the trails that start at the entrance: with a chance that grows with the trail's
   * strength (and the ant's stubbornness) it sets off along one of them (chosen in proportion to strength) instead of
   * a random heading. Without trail, or for a free-spirited ant, the heading stays random.
   */
  private scentTrail(ant: Ant): void {
    const vals: number[] = [];
    let total = 0;
    let max = 0;
    for (let k = 0; k < SCENT_DIRS; k++) {
      const a = (k / SCENT_DIRS) * TWO_PI;
      const v = this.pher.sampleMax(NEST.x + Math.cos(a) * (NEST.r + 4), NEST.y + Math.sin(a) * (NEST.r + 4), 2);
      vals.push(v);
      total += v;
      if (v > max) max = v;
    }
    if (total <= 0) return;
    if (this.rng.next() >= Math.min(1, SCENT_P * ant.stubbornness) * Math.min(1, max / SCENT_FULL)) return;
    let r = this.rng.next() * total;
    let k = 0;
    while (k < SCENT_DIRS - 1 && r > vals[k]) {
      r -= vals[k];
      k++;
    }
    ant.heading = wrapAngle((k / SCENT_DIRS) * TWO_PI + (this.rng.next() - 0.5) * 0.3);
  }

  /** An ant underground: only its clock runs. Hatchlings and unloaded foragers emerge when it reaches 0, nurses never do. */
  private updateNestAnt(ant: Ant): void {
    if (ant.nestKind === 'nurse') return;
    ant.timer -= STEP_S;
    if (ant.timer > 1e-9) return;
    const f = ant.nestKind === 'unload' ? this.findFood(ant.targetFood) : undefined;
    if (f && f.piecesLeft > 0) {
      this.emerge(ant, 'toFood');
      ant.heading = Math.atan2(f.y - ant.y, f.x - ant.x);
    } else {
      this.emerge(ant, 'wander');
    }
  }

  private updateAnt(ant: Ant): void {
    ant.age += STEP_S;
    if (ant.caughtT !== undefined) {
      ant.caughtT += STEP_S; // stuck in the web: stays put, keeps what it carries
      return;
    }
    if (ant.duelT !== undefined) return; // fighting a red ant: stands still until the duel is decided
    if (ant.state === 'nest') {
      this.updateNestAnt(ant);
      return;
    }

    if (ant.state === 'wander' && ant.role !== 'guard') {
      const f = this.nearestFood(ant.x, ant.y, ant);
      if (f) {
        ant.state = 'toFood';
        ant.targetFood = f.id;
        if (f.kind === 'honeydew' && this.bush) this.honeyClaims.set(f.id, { ant, t: this.time });
      }
    }

    if (ant.state !== 'wander' && ant.strayT !== undefined) {
      delete ant.strayT; // found something to do: the distraction is over
      delete ant.strayH;
    }

    if (ant.state === 'gnaw') {
      this.gnaw(ant);
      return;
    }

    let desired = ant.heading;
    let pherWeight = 0;
    if (ant.state === 'toFood') {
      const f = this.findFood(ant.targetFood);
      if (!f || f.piecesLeft <= 0 || f.stuck) {
        ant.state = 'wander';
        ant.targetFood = null;
      } else {
        const fd = Math.hypot(f.x - ant.x, f.y - ant.y);
        desired = Math.atan2(f.y - ant.y, f.x - ant.x);
        pherWeight = 0.3;
        // A slight random curve on the way in; it fades out near the food so the ant still arrives.
        this.stepWeave(ant, APPROACH_WEAVE_AMP * ant.curiosity);
        desired += (ant.weave ?? 0) * Math.min(1, fd / 15);
        if (fd <= PICKUP_DIST) {
          // Nothing can be taken from a living creature: stand and wait for the touch.
          if (isAlive(f)) return;
          // Arrived: stand still and gnaw for a while before taking a piece.
          ant.state = 'gnaw';
          ant.timer = GNAW_S * (0.75 + 0.5 * this.rng.next());
          return;
        }
      }
    }
    if (ant.state === 'carry' && ant.carryLeaf !== undefined) {
      desired = this.leafHeading(ant);
    } else if (ant.state === 'carry') {
      desired = this.carryHeading(ant);
      pherWeight = CARRY_TRAIL_PULL; // returning carriers are drawn to the existing trail, so separate lines merge into one
      this.pher.deposit(ant.x, ant.y, DEPOSIT);
    } else if (ant.state === 'wander') {
      const jitter = (this.rng.next() - 0.5) * WANDER_JITTER * ant.curiosity;
      if (ant.strayT !== undefined) {
        ant.strayT -= STEP_S;
        if (ant.strayT <= 1e-9) {
          delete ant.strayT;
          delete ant.strayH;
        }
      }
      if (ant.strayT !== undefined) {
        // Distracted: wander off on its own heading and ignore the trail for now.
        ant.strayH = (ant.strayH ?? ant.heading) + jitter;
        desired = ant.strayH;
      } else {
        desired = ant.heading + jitter;
      }
      const homeD = Math.hypot(ant.x - NEST.x, ant.y - NEST.y);
      if (homeD < OUTBOUND_R) {
        desired += wrapAngle(Math.atan2(ant.y - NEST.y, ant.x - NEST.x) - desired) * OUTBOUND_K;
      }
      const range = YOUNG_R0 + YOUNG_GROW * ant.age;
      if (homeD > range && range < this.terrain.w + this.terrain.h) {
        const w = Math.min(YOUNG_MAX, (YOUNG_K * (homeD - range)) / YOUNG_SPAN);
        desired += wrapAngle(Math.atan2(NEST.y - ant.y, NEST.x - ant.x) - desired) * w;
      }
      pherWeight = ant.strayT !== undefined ? 0 : 0.22;
      this.markExplored(ant.x, ant.y);
      const red = this.reds.length > 0 ? this.sensedRed(ant) : null;
      const rn = this.redNest?.owner === 'red' ? this.redNest : null;
      if (ant.role === 'guard' && !red) {
        // a guard circles the nest on its own ring
        desired = this.orbitHeading(ant.x, ant.y, NEST.x, NEST.y, ant.id);
        pherWeight = 0;
        delete ant.strayT;
        delete ant.strayH;
      } else if (red) {
        // a red ant close by: go and fight it (the duel starts when they meet)
        desired = Math.atan2(red.y - ant.y, red.x - ant.x);
        pherWeight = 0;
        delete ant.strayT;
        delete ant.strayH;

      } else if (rn && Math.hypot(rn.x - ant.x, rn.y - ant.y) <= RED_NEST_SENSE) {
        // the red nest is near: smell it and go there (four of them at once take it)
        desired = Math.atan2(rn.y - ant.y, rn.x - ant.x);
        pherWeight = 0;
        delete ant.strayT;
        delete ant.strayH;
      }
    }

    const pull = this.move(ant, desired, pherWeight);
    // Following a trail (a real pull) may end in a distraction; it starts next substep.
    if (ant.state === 'wander' && ant.strayT === undefined && pull > STRAY_PULL_MIN) {
      if (this.rng.next() < (STRAY_P * ant.curiosity) / ant.stubbornness) {
        ant.strayT = STRAY_MIN_S + (STRAY_MAX_S - STRAY_MIN_S) * this.rng.next();
        const sign = this.rng.next() < 0.5 ? 1 : -1;
        ant.strayH = ant.heading + sign * (STRAY_TURN_MIN + (STRAY_TURN_MAX - STRAY_TURN_MIN) * this.rng.next());
      }
    }

    if (ant.state === 'carry' && ant.carryLeaf !== undefined) this.feedAphids(ant);
    if (ant.state === 'carry' && ant.carryLeaf === undefined && Math.hypot(ant.x - NEST.x, ant.y - NEST.y) <= NEST.r) {
      this.stock += ant.carry;
      this.totalDelivered += ant.carry;
      ant.carry = 0;
      delete ant.lostT;
      delete ant.lostH;
      this.deliveryCount++;
      if (ant.carrySugar) {
        this.boostUntil = this.time + SUGAR_BOOST_S;
        delete ant.carrySugar;
      }
      // The forager goes down into the nest to unload and rest; it keeps its food target if that food still exists.
      const f = this.findFood(ant.targetFood);
      if (!f || f.piecesLeft <= 0) ant.targetFood = null;
      ant.state = 'nest';
      ant.nestKind = 'unload';
      ant.timer = UNLOAD_S * (0.8 + 0.4 * this.rng.next());
      ant.x = NEST.x + (this.rng.next() - 0.5) * 4;
      ant.y = NEST.y + (this.rng.next() - 0.5) * 4;
    }
  }

  /**
   * Advances the ant's smooth heading offset `weave`: an Ornstein-Uhlenbeck process with correlation time WEAVE_TAU_S and
   * stationary standard deviation `amp` rad, clamped to +-1 rad so the ant always makes progress toward its goal.
   */
  private stepWeave(ant: Ant, amp: number): void {
    const decay = Math.exp(-STEP_S / WEAVE_TAU_S);
    const rng = this.rng;
    const gauss = (rng.next() + rng.next() + rng.next() - 1.5) * 2; // mean 0, std 1
    const w = decay * (ant.weave ?? 0) + amp * Math.sqrt(1 - decay * decay) * gauss;
    ant.weave = Math.max(-1, Math.min(1, w));
  }

  /** Heading of an ant carrying a leaf: straight to the aphids bush (with a slight weave); without a bush it drops the leaf. */
  private leafHeading(ant: Ant): number {
    const b = this.bush;
    if (!b) {
      delete ant.carryLeaf;
      ant.state = 'wander';
      return ant.heading;
    }
    this.stepWeave(ant, WEAVE_AMP * ant.curiosity);
    return Math.atan2(b.y - ant.y, b.x - ant.x) + (ant.weave ?? 0);
  }

  /** An ant with a leaf close to the bush hands it over: every leaf unit adds an aphid (up to APHID_MAX). */
  private feedAphids(ant: Ant): void {
    const b = this.bush;
    if (!b || ant.carryLeaf === undefined || Math.hypot(ant.x - b.x, ant.y - b.y) > BUSH_REACH) return;
    b.aphids = Math.min(APHID_MAX, b.aphids + ant.carryLeaf);
    delete ant.carryLeaf;
    ant.carry = 0;
    ant.state = 'wander';
    ant.targetFood = null;
  }

  /**
   * Normal mode, from RAID_MIN_ANTS ants: now and then RAID_SIZE_MIN..RAID_SIZE_MAX red ants (at most half of the black ones) come in
   * from the map edge, walk to the nest and fight every black ant they meet, one duel at a time. A killed red ant leaves its
   * body (1 piece, carried by one black ant to the larder); the survivors leave RAID_MAX_S_ALIVE seconds after the start.
   */
  private updateRaid(): void {
    if (this.noRaid) return;
    if (this.raiders === 0) {
      // between raids: count the wait down (only while the red nest holds out and the colony is big enough)
      if (this.ants.length < RAID_MIN_ANTS || this.redNest?.owner !== 'red') {
        this.raidWait = -1;
      } else {
        if (this.raidWait < 0) this.raidWait = RAID_MIN_S + (RAID_MAX_S - RAID_MIN_S) * this.rng.next();
        this.raidWait -= STEP_S;
        if (this.raidWait <= 0) this.startRaid();
      }
    } else {
      this.raidAge += STEP_S;
      if (this.raidAge >= RAID_MAX_S_ALIVE) this.endRaid();
    }
    if (this.reds.length === 0) return; // nothing to move: no raiders, no patrols
    // Black ants on the surface, bucketed by explored-grid cell, so every red looks only at its neighbours.
    const cell = EXPLORE_CELL;
    const buckets = new Map<number, Ant[]>();
    for (const a of this.ants) {
      if (a.state === 'nest' || a.caughtT !== undefined || a.duelT !== undefined) continue;
      const key = Math.floor(a.y / cell) * 4096 + Math.floor(a.x / cell);
      const list = buckets.get(key);
      if (list) list.push(a);
      else buckets.set(key, [a]);
    }
    const rng = this.rng;
    const fights = new Map<number, Ant>();
    // grid of all red ants, so each one only looks at its close neighbours when keeping its distance
    const sep = new Map<number, RedAnt[]>();
    for (const r of this.reds) {
      const key = Math.floor(r.y / RED_SEP) * 4096 + Math.floor(r.x / RED_SEP);
      const list = sep.get(key);
      if (list) list.push(r);
      else sep.set(key, [r]);
    }
    for (const r of [...this.reds]) {
      if (r.fightT !== undefined) {
        r.fightT -= STEP_S;
        if (r.fightT <= 1e-9) this.resolveDuel(r, fights.get(r.id));
        continue;
      }
      let foe: Ant | null = null;
      let best = RED_SENSE;
      const cx = Math.floor(r.x / cell);
      const cy = Math.floor(r.y / cell);
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const list = buckets.get((cy + dy) * 4096 + cx + dx);
          if (!list) continue;
          for (const a of list) {
            if (a.duelT !== undefined) continue;
            const d = Math.hypot(a.x - r.x, a.y - r.y);
            if (d < best) {
              best = d;
              foe = a;
            }
          }
        }
      }
      if (foe && best <= RED_REACH) {
        r.fightT = DUEL_S;
        foe.duelT = DUEL_S;
        this.duels.set(r.id, foe);
        continue;
      }
      if (r.gnawT !== undefined) {
        // gnawing at its food: stands still until it takes a piece
        r.gnawT -= STEP_S;
        if (r.gnawT <= 1e-9) {
          delete r.gnawT;
          this.redTakePiece(r);
        }
        continue;
      }
      // guards circle the red nest, foragers look for food; raiders make for their own rally point near the black nest
      const base = r.patrol && this.redNest ? this.redNest : NEST;
      const job = !foe && r.patrol && this.redNest ? r.job : undefined;
      if (job === 'guard') {
        r.heading = this.orbitHeading(r.x, r.y, this.redNest!.x, this.redNest!.y, r.id) + (rng.next() - 0.5) * 0.3;
      } else if (job === 'forager') {
        r.heading = this.forageHeading(r, this.redNest!);
      }
      const tx = foe ? foe.x : Math.max(5, Math.min(this.terrain.w - 5, base.x + (r.ox ?? 0)));
      const ty = foe ? foe.y : Math.max(5, Math.min(this.terrain.h - 5, base.y + (r.oy ?? 0)));
      const away = Math.hypot(tx - r.x, ty - r.y);
      if (job) {
        // its heading was set above
      } else if (!foe && away <= 6) {
        r.heading += (rng.next() - 0.5) * 1.5; // at its rally point: mill about and wait for ants to come
        if (r.patrol) {
          const pa = rng.next() * TWO_PI;
          const pd = RED_PATROL_R * Math.sqrt(rng.next());
          r.ox = Math.cos(pa) * pd; // a patrol then walks on to another point around its nest
          r.oy = Math.sin(pa) * pd;
        }
      } else {
        r.heading = Math.atan2(ty - r.y, tx - r.x) + (rng.next() - 0.5) * 0.9; // wanders a little on the way
      }
      const v = RED_SPEED * (r.spd ?? 1) * (r.carry ? CARRY_SPEED_MUL : 1) * STEP_S;
      let px = 0;
      let py = 0;
      const gx = Math.floor(r.x / RED_SEP);
      const gy = Math.floor(r.y / RED_SEP);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const list = sep.get((gy + dy) * 4096 + gx + dx);
          if (!list) continue;
          for (const o of list) {
            if (o === r) continue;
            const ddx = r.x - o.x;
            const ddy = r.y - o.y;
            const d = Math.hypot(ddx, ddy);
            if (d >= RED_SEP) continue;
            if (d < 1e-6) {
              const a = rng.next() * TWO_PI; // exactly on top of each other: any way apart
              px += Math.cos(a);
              py += Math.sin(a);
            } else {
              px += (ddx / d) * ((RED_SEP - d) / RED_SEP);
              py += (ddy / d) * ((RED_SEP - d) / RED_SEP);
            }
          }
        }
      }
      const pl = Math.hypot(px, py);
      const k = pl > 1 ? 1 / pl : 1; // push at most RED_SEP_SPEED
      r.x = Math.max(0.5, Math.min(this.terrain.w - 0.5, r.x + Math.cos(r.heading) * v + px * k * RED_SEP_SPEED * STEP_S));
      r.y = Math.max(0.5, Math.min(this.terrain.h - 0.5, r.y + Math.sin(r.heading) * v + py * k * RED_SEP_SPEED * STEP_S));
      if (r.carry) {
        this.redPher.deposit(r.x, r.y, DEPOSIT); // a red trail home, like the black ants' trail
        this.redPherDirty = true;
      }
    }
    void fights;
    // grid of the free red ants for the black ants' sense (next substep)
    this.redGrid.clear();
    for (const r of this.reds) {
      if (r.fightT !== undefined) continue;
      const key = Math.floor(r.y / RED_CELL) * 4096 + Math.floor(r.x / RED_CELL);
      const list = this.redGrid.get(key);
      if (list) list.push(r);
      else this.redGrid.set(key, [r]);
    }
  }

  /** The red ant a wandering black ant is after: looked up every 4th substep (staggered by ant id) and remembered in between. */
  private sensedRed(ant: Ant): RedAnt | null {
    if ((this.substepNo + ant.id) % 4 === 0 || !this.redTargets.has(ant)) {
      this.redTargets.set(ant, this.nearestRed(ant.x, ant.y));
    }
    const r = this.redTargets.get(ant) ?? null;
    return r && this.reds.length > 0 ? r : null;
  }

  private redPherDirty = false;
  private redTargets = new WeakMap<Ant, RedAnt | null>();
  /** Which ant is on its way to which drop of honeydew (id -> claim), and how many ants are in the bush now. Transient. */
  private honeyClaims = new Map<number, { ant: Ant; t: number }>();
  private honeyCollectors = 0;
  private substepNo = 0;

  /** The nearest free red ant within ANT_SENSE_RED of (x, y), or null. */
  private nearestRed(x: number, y: number): RedAnt | null {
    if (this.redGrid.size === 0) return null;
    let best: RedAnt | null = null;
    let bestD = ANT_SENSE_RED;
    const cx = Math.floor(x / RED_CELL);
    const cy = Math.floor(y / RED_CELL);
    const n = Math.ceil(ANT_SENSE_RED / RED_CELL);
    for (let dy = -n; dy <= n; dy++) {
      for (let dx = -n; dx <= n; dx++) {
        const list = this.redGrid.get((cy + dy) * 4096 + cx + dx);
        if (!list) continue;
        for (const r of list) {
          const d = Math.hypot(r.x - x, r.y - y);
          if (d < bestD) {
            bestD = d;
            best = r;
          }
        }
      }
    }
    return best;
  }

  /** Free red ants by 16 px cell, rebuilt every substep of a raid (what the black ants can sense). */
  private redGrid = new Map<number, RedAnt[]>();

  /** Active duels (red id -> the black ant it fights); transient. */
  private duels = new Map<number, Ant>();

  /** Secret cheat: a raid of red ants starts right now (false while one is going on). */
  triggerRaid(): boolean {
    if (this.raiders > 0 || this.noRaid) return false;
    this.startRaid();
    return true;
  }

  private startRaid(): void {
    const rng = this.rng;
    const cap = Math.max(RAID_SIZE_MIN, Math.floor(this.ants.length / 2));
    const size = Math.min(cap, RAID_SIZE_MIN + Math.floor(rng.next() * (RAID_SIZE_MAX - RAID_SIZE_MIN + 1)));
    const w = this.terrain.w;
    const h = this.terrain.h;
    // from a random direction on the open side of the map (the nest lies at its left edge), RAID_DIST px away, kept on the map
    const ang = (rng.next() - 0.5) * Math.PI;
    const dist = RAID_DIST_MIN + (RAID_DIST_MAX - RAID_DIST_MIN) * rng.next();
    // from the red nest when there is one, else (the secret raid key) from a random direction near the black nest
    const rn = this.redNest?.owner === 'red' ? this.redNest : null;
    const ex = rn ? rn.x : Math.max(5, Math.min(w - 5, NEST.x + Math.cos(ang) * dist));
    const ey = rn ? rn.y : Math.max(5, Math.min(h - 5, NEST.y + Math.sin(ang) * dist));
    const spread = rn ? RAID_SPREAD_NEST : RAID_SPREAD;
    for (let i = 0; i < size; i++) {
      const a = rng.next() * TWO_PI;
      const d = spread * Math.sqrt(rng.next()); // uniform over the disc
      this.reds.push({
        id: this.nextId++,
        x: Math.max(0.5, Math.min(w - 0.5, ex + Math.cos(a) * d)),
        y: Math.max(0.5, Math.min(h - 0.5, ey + Math.sin(a) * d)),
        heading: Math.atan2(NEST.y - ey, NEST.x - ex),
        spd: 0.75 + 0.5 * rng.next(),
        ox: Math.cos(a + 2) * RAID_SPREAD * Math.sqrt(rng.next()),
        oy: Math.sin(a + 2) * RAID_SPREAD * Math.sqrt(rng.next()),
      });
    }
    this.raidAge = 0;
    this.raidsStarted++;
  }

  /** The raid is over: the surviving red ants leave, any duel in progress is called off. */
  private endRaid(): void {
    this.dropReds((r) => !r.patrol);
    this.raidWait = -1;
  }

  /** Removes the red ants `pick` selects and calls off their duels. */
  private dropReds(pick: (r: RedAnt) => boolean): void {
    for (let i = this.reds.length - 1; i >= 0; i--) if (pick(this.reds[i])) this.reds.splice(i, 1);
    for (const [id, foe] of this.duels) {
      if (this.reds.some((r) => r.id === id)) continue;
      delete foe.duelT;
      this.duels.delete(id);
    }
    this.redGrid.clear();
  }

  /** Raiders on the map (the patrol red ants of the red nest do not count). */
  get raiders(): number {
    let n = 0;
    for (const r of this.reds) if (!r.patrol) n++;
    return n;
  }

  /**
   * Normal mode, from RAID_MIN_ANTS ants: the red ants' nest appears far from the black one. While it is red, a patrol red ant
   * comes out every RED_TRICKLE_S (at most RED_PATROL_MAX, they walk about near the nest and fight any black ant that comes)
   * and the raids set off from it. When CAPTURE_ANTS black ants stand at it at once they take it: the patrols are gone, no
   * more raids, and it is another nest of the colony (CAPTURED_QUEENS more queens, hatching faster).
   */
  private updateRedNest(): void {
    if (this.noRaid) return;
    if (!this.redNest) {
      if (this.ants.length < RED_NEST_MIN_ANTS) return;
      const sx = RED_NEST_EDGE + this.rng.next() * Math.max(0, this.terrain.w - 2 * RED_NEST_EDGE);
      const sy = RED_NEST_EDGE + this.rng.next() * Math.max(0, this.terrain.h - 2 * RED_NEST_EDGE);
      const p = resolvePlacement(this.terrain, sx, sy);
      if (!p || inWeb(this.spider, p.x, p.y)) return;
      if (Math.hypot(p.x - NEST.x, p.y - NEST.y) < RED_NEST_GAP) return;
      if (this.bush && Math.hypot(p.x - this.bush.x, p.y - this.bush.y) < BUSH_NEST_GAP) return;
      this.redNest = { x: p.x, y: p.y, owner: 'red', stock: RED_START_STOCK, delivered: 0, trickleT: RED_TRICKLE_S };
      for (let i = 0; i < RED_PATROL_START; i++) this.spawnPatrol(this.redNest); // the nest comes with its defenders
      return;
    }
    const n = this.redNest;
    if (n.owner !== 'red') return;
    let at = 0;
    for (const a of this.ants) {
      if (a.state !== 'nest' && a.caughtT === undefined && Math.hypot(a.x - n.x, a.y - n.y) <= CAPTURE_R) at++;
    }
    if (at >= CAPTURE_ANTS) {
      n.owner = 'black';
      this.dropReds((r) => r.patrol === true);
      return;
    }
    n.trickleT -= STEP_S;
    if (n.trickleT > 1e-9) return;
    n.trickleT = RED_TRICKLE_S;
    let patrols = 0;
    for (const r of this.reds) if (r.patrol) patrols++;
    if (patrols >= RED_PATROL_MAX) return;
    // a new red ant is hatched from the nest's food: with no food in the stock none comes out
    if ((n.stock ?? 0) + 1e-9 < RED_FOOD_PER_ANT) return;
    n.stock = (n.stock ?? 0) - RED_FOOD_PER_ANT;
    this.spawnPatrol(n);
  }

  /** A patrol red ant at the red nest, with its own point to walk to around it. */
  private spawnPatrol(n: RedNest): void {
    const pa = this.rng.next() * TWO_PI;
    const pd = RED_PATROL_R * Math.sqrt(this.rng.next());
    let patrols = 0;
    let guards = 0;
    for (const r of this.reds) {
      if (!r.patrol) continue;
      patrols++;
      if (r.job === 'guard') guards++;
    }
    // at least RED_GUARD_FRACTION of the patrols circle the nest as guards, the rest look for food
    const job = guards < Math.ceil((patrols + 1) * RED_GUARD_FRACTION) ? 'guard' : 'forager';
    this.reds.push({
      id: this.nextId++, x: n.x, y: n.y, heading: pa, patrol: true, job, spd: 0.75 + 0.5 * this.rng.next(),
      ox: Math.cos(pa) * pd, oy: Math.sin(pa) * pd,
    });
  }

  /** Heading of a ring walker: round the centre (cx, cy) on its own ring (ring k = id % 5), clockwise or not by id. */
  private orbitHeading(x: number, y: number, cx: number, cy: number, id: number): number {
    const r = Math.hypot(x - cx, y - cy) || 1;
    const th = Math.atan2(y - cy, x - cx);
    const dir = id % 2 === 0 ? 1 : -1;
    const want = GUARD_R_MIN + (id % 5) * GUARD_R_STEP;
    const k = (want - r) / 10;
    return Math.atan2(Math.cos(th) * dir + Math.sin(th) * k, -Math.sin(th) * dir + Math.cos(th) * k);
  }

  /**
   * Heading of a red forager: a carrier goes home along the red nest's pheromone (it leaves a trail of its own) and hands its
   * food over (the nest's stock, which feeds new red ants); a seeker walks to the nearest piece of food it notices (not a living
   * creature, not leaves, honeydew or red bodies), gnaws at it for a while like a black ant, takes one piece and turns home,
   * else follows a red trail or wanders up to RED_FORAGE_R px from the nest.
   */
  private forageHeading(r: RedAnt, n: RedNest): number {
    const rng = this.rng;
    if (r.carry) {
      if (Math.hypot(n.x - r.x, n.y - r.y) <= 8) {
        n.stock = (n.stock ?? 0) + r.carry;
        n.delivered = (n.delivered ?? 0) + r.carry;
        r.carry = 0;
        return r.heading + Math.PI * (0.5 + rng.next());
      }
      return Math.atan2(n.y - r.y, n.x - r.x) + (rng.next() - 0.5) * 0.4;
    }
    if (r.tf === undefined && (this.substepNo + r.id) % 4 === 0) {
      let best: FoodItem | null = null;
      let bestD = RED_FOOD_SENSE;
      for (const f of this.food) {
        if (f.piecesLeft <= 0 || f.kind === 'leaf' || f.kind === 'honeydew' || f.kind === 'redant' || f.stuck) continue;
        const d = Math.hypot(f.x - r.x, f.y - r.y);
        if (d < bestD) {
          bestD = d;
          best = f;
        }
      }
      if (best) r.tf = best.id;
    }
    if (r.tf !== undefined) {
      const f = this.findFood(r.tf);
      if (!f || f.piecesLeft <= 0 || f.stuck) {
        delete r.tf;
      } else if (isAlive(f)) {
        // a living creature: go for it and touch it (a second touch kills it; then it is food like any other)
        if (Math.hypot(f.x - r.x, f.y - r.y) <= TOUCH_DIST && !this.redTouch(r, f)) return r.heading;
        return Math.atan2(f.y - r.y, f.x - r.x) + (rng.next() - 0.5) * 0.3;
      } else if (Math.hypot(f.x - r.x, f.y - r.y) <= 2) {
        r.gnawT = GNAW_S * (0.75 + 0.5 * rng.next()); // arrived: gnaw before taking a piece
        return r.heading;
      } else {
        return Math.atan2(f.y - r.y, f.x - r.x) + (rng.next() - 0.5) * 0.3;
      }
    }
    // no food in sight: follow a red trail if one is near (like the black ants follow theirs), else wander
    const away = Math.hypot(r.x - n.x, r.y - n.y);
    if (away > RED_FORAGE_R) return Math.atan2(n.y - r.y, n.x - r.x) + (rng.next() - 0.5) * 0.6;
    let bestH = r.heading;
    let bestV = 0.08;
    for (const turn of [-0.6, 0, 0.6]) {
      const v = this.redPher.sampleMax(r.x + Math.cos(r.heading + turn) * 6, r.y + Math.sin(r.heading + turn) * 6, 2);
      if (v > bestV) {
        bestV = v;
        bestH = r.heading + turn;
      }
    }
    if (bestV > 0.08) return bestH + (rng.next() - 0.5) * 0.25;
    return r.heading + (rng.next() - 0.5) * 0.6; // wander
  }

  /** A forager's gnawing is over: it takes one piece of the food (if it is still there) and heads home with it. */
  private redTakePiece(r: RedAnt): void {
    const f = r.tf !== undefined ? this.findFood(r.tf) : undefined;
    delete r.tf;
    if (!f || f.piecesLeft <= 0 || isAlive(f)) return;
    f.piecesLeft -= 1;
    r.carry = FOOD_TABLE[f.kind].value;
    if (f.piecesLeft <= 0) this.food.splice(this.food.indexOf(f), 1);
    if (this.redNest) r.heading = Math.atan2(this.redNest.y - r.y, this.redNest.x - r.x);
  }

  /** The duel of `r` ends: the black ant wins with BLACK_WIN_P (a major with MAJOR_WIN_P); the loser dies, a dead red ant leaves its body. */
  private resolveDuel(r: RedAnt, _unused?: Ant): void {
    const foe = this.duels.get(r.id);
    this.duels.delete(r.id);
    delete r.fightT;
    if (!foe) return;
    delete foe.duelT;
    const i = this.ants.indexOf(foe);
    if (i < 0) return; // the black ant is gone (spider, beetle): the red one fights on
    if (this.rng.next() < (foe.superMajor ? SUPER_WIN_P : foe.major ? MAJOR_WIN_P : BLACK_WIN_P)) {
      const k = this.reds.indexOf(r);
      if (k >= 0) this.reds.splice(k, 1);
      this.redKilled++;
      this.food.push({ id: this.nextId++, kind: 'redant', x: r.x, y: r.y, piecesLeft: FOOD_TABLE.redant.pieces });
    } else {
      this.ants.splice(i, 1);
      this.antsKilled++;
    }
  }

  /** Normal mode: the bush appears with a big colony; its aphids make honeydew that the ants lick off. */
  private updateBush(): void {
    if (!this.bush) {
      if (this.ants.length < BUSH_MIN_ANTS) return;
      // the bush is big: well away from the nest and the map edges
      const sx = BUSH_EDGE_GAP + this.rng.next() * Math.max(0, this.terrain.w - 2 * BUSH_EDGE_GAP);
      const sy = BUSH_EDGE_GAP + this.rng.next() * Math.max(0, this.terrain.h - 2 * BUSH_EDGE_GAP);
      const found = resolvePlacement(this.terrain, sx, sy);
      const spot = found && !inWeb(this.spider, found.x, found.y) && Math.hypot(found.x - NEST.x, found.y - NEST.y) >= BUSH_NEST_GAP ? found : null;
      if (spot) this.bush = { x: spot.x, y: spot.y, aphids: APHID_START, dropT: 0 };
      return;
    }
    const b = this.bush;
    // Every aphid makes one drop of honeydew per APHID_HONEY_S and holds it, at the rear of its body, until an ant takes it
    // (at most one per aphid). A drop is a food item at the aphid's rear; ants walk to the aphid and take it from there.
    b.dropT += b.aphids * STEP_S;
    if (b.dropT < APHID_HONEY_S - 1e-9) return;
    b.dropT -= APHID_HONEY_S;
    const free: number[] = [];
    for (let i = 0; i < b.aphids; i++) {
      const s = dropSpot(b, i);
      if (!this.food.some((f) => f.kind === 'honeydew' && f.x === s.x && f.y === s.y)) free.push(i);
    }
    if (free.length === 0) return;
    const s = dropSpot(b, free[Math.floor(this.rng.next() * free.length)]);
    this.food.push({ id: this.nextId++, kind: 'honeydew', x: s.x, y: s.y, piecesLeft: 1 });
  }

  /**
   * Heading of a carrier: straight toward the nest plus a smooth random weave (so the way home is wavy), except while it is
   * confused (`lostT` > 0): then it walks a random heading for a moment and homing resumes. LOST_P is per second.
   */
  private carryHeading(ant: Ant): number {
    this.stepWeave(ant, WEAVE_AMP * ant.curiosity);
    const weave = ant.weave ?? 0;
    if (ant.lostT !== undefined) {
      ant.lostT -= STEP_S;
      if (ant.lostT <= 1e-9) {
        delete ant.lostT;
        delete ant.lostH;
      }
    } else if (this.rng.next() < LOST_P * ant.curiosity * STEP_S) {
      ant.lostT = LOST_MIN_S + (LOST_MAX_S - LOST_MIN_S) * this.rng.next();
      ant.lostH = this.rng.next() * TWO_PI - Math.PI;
    }
    if (ant.lostT !== undefined) return (ant.lostH ?? ant.heading) + weave * 0.3;
    return Math.atan2(NEST.y - ant.y, NEST.x - ant.x) + weave;
  }

  /** A gnawing ant stands still; when its bite ends it takes a piece, unless the food is gone or used up meanwhile. */
  private gnaw(ant: Ant): void {
    const f = this.findFood(ant.targetFood);
    if (!f || f.piecesLeft <= 0 || isAlive(f)) {
      ant.state = 'wander';
      ant.targetFood = null;
      ant.timer = 0;
      return;
    }
    ant.timer -= STEP_S;
    if (ant.timer > 1e-9) return;
    const pieces = ant.superMajor ? Math.min(f.piecesLeft, SUPER_CARRY_PIECES) : ant.major ? Math.min(f.piecesLeft, MAJOR_CARRY_PIECES) : 1;
    f.piecesLeft -= pieces;
    ant.carry = pieces * FOOD_TABLE[f.kind].value;
    if (f.kind === 'sugar') ant.carrySugar = true;
    if (f.kind === 'leaf') ant.carryLeaf = pieces; // a leaf is not food: it goes to the aphids
    ant.state = 'carry';
    ant.timer = 0;
    if (f.piecesLeft <= 0) this.food.splice(this.food.indexOf(f), 1);
  }

  /** Cell index of the explored grid under (x, y), clamped to the world. */
  private exploreIndex(x: number, y: number): number {
    const cx = Math.max(0, Math.min(this.exploreW - 1, Math.floor(x / EXPLORE_CELL)));
    const cy = Math.max(0, Math.min(this.exploreH - 1, Math.floor(y / EXPLORE_CELL)));
    return cy * this.exploreW + cx;
  }

  private markExplored(x: number, y: number): void {
    const i = this.exploreIndex(x, y);
    this.explored[i] = Math.min(EXPLORE_CAP, this.explored[i] + STEP_S * EXPLORE_RATE);
  }

  /** Harmonic mean speed of the ground along the ray from (x, y) in direction (c, s): RAY_N samples, RAY_STEP px apart. */
  private rayProgress(x: number, y: number, c: number, s: number): number {
    let slow = 0;
    for (let i = 1; i <= RAY_N; i++) slow += 1 / Math.max(0.05, speedAt(this.terrain, x + c * RAY_STEP * i, y + s * RAY_STEP * i));
    return RAY_N / slow;
  }

  /**
   * Pick the best of the candidate headings around `desired`, turn smoothly toward it and advance.
   * Returns the pheromone pull: pherWeight times the strongest trail value any candidate heading senses (0 without trail).
   */
  private move(ant: Ant, desired: number, pherWeight: number): number {
    let pull = 0;
    let best = desired;
    let bestScore = -Infinity;
    const wander = ant.state === 'wander';
    // A wanderer (not one off on a distraction) senses the silk of a living web and steers clear of it.
    const web = wander && ant.strayT === undefined && this.spider?.alive ? this.spider : null;
    for (const turn of FAN_TURNS) {
      const h = desired + turn;
      const c = Math.cos(h);
      const s = Math.sin(h);
      let score = this.rayProgress(ant.x, ant.y, c, s) - TURN_ARC * (1 - Math.cos(turn));
      if (pherWeight > 0) {
        const p = pherWeight * this.pher.sampleMax(ant.x + c * PHER_LOOKAHEAD, ant.y + s * PHER_LOOKAHEAD, PHER_R);
        score += p;
        if (p > pull) pull = p;
      }
      if (wander) score -= EXPLORE_WEIGHT * (0.7 + 0.3 * ant.curiosity) * this.explored[this.exploreIndex(ant.x + c * EXPLORE_LOOKAHEAD, ant.y + s * EXPLORE_LOOKAHEAD)];
      if (web && inWeb(web, ant.x + c * EXPLORE_LOOKAHEAD, ant.y + s * EXPLORE_LOOKAHEAD)) score -= WEB_AVOID_PENALTY;
      if (score > bestScore) {
        bestScore = score;
        best = h;
      }
    }
    const diff = wrapAngle(best - ant.heading);
    ant.heading = wrapAngle(ant.heading + Math.max(-MAX_TURN, Math.min(MAX_TURN, diff)));
    const v = BASE_SPEED * ant.speedMul * (ant.state === 'carry' ? CARRY_SPEED_MUL : 1) * (this.time < this.boostUntil ? SUGAR_BOOST_MUL : 1) * speedAt(this.terrain, ant.x, ant.y) * STEP_S;
    let nx = ant.x + Math.cos(ant.heading) * v;
    let ny = ant.y + Math.sin(ant.heading) * v;
    const maxX = this.terrain.w - 0.5;
    const maxY = this.terrain.h - 0.5;
    // Reflect off the world edge instead of sliding along it.
    if (nx < 0.5 || nx > maxX) {
      nx = Math.max(0.5, Math.min(maxX, nx));
      ant.heading = wrapAngle(Math.PI - ant.heading);
    }
    if (ny < 0.5 || ny > maxY) {
      ny = Math.max(0.5, Math.min(maxY, ny));
      ant.heading = wrapAngle(-ant.heading);
    }
    ant.x = nx;
    ant.y = ny;
    return pull;
  }
}
