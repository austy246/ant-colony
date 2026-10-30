import {
  APPROACH_WEAVE_AMP, CURIOSITY_MAX, CURIOSITY_MIN, HATCH_JITTER, LOST_MAX_S, LOST_MIN_S, LOST_P, PREY_SPEED_VAR, SPEED_MUL_MAX, SPEED_MUL_MIN,
  STRAY_MAX_S, STRAY_MIN_S, STRAY_P, STRAY_PULL_MIN, STRAY_TURN_MAX, STRAY_TURN_MIN, STUBBORNNESS_MAX, STUBBORNNESS_MIN, WEAVE_AMP, WEAVE_TAU_S,
  BEETLE_SPEED, CATERPILLAR_FLEE_MUL, CATERPILLAR_FLEE_S, CATERPILLAR_SPEED, EXPLORE_CAP, EXPLORE_CELL, EXPLORE_HALF_LIFE_S, CARRY_SPEED_MUL, FOOD_PER_ANT, FOOD_PER_QUEEN, GNAW_S, HATCH_INTERVAL_S, HATCH_STAY_S, LARVAE_PER_NURSE, MAX_ANTS, MAJOR_CARRY_PIECES, MAJOR_CHANCE, MAJOR_MAX_FRACTION, MAJOR_MIN_ANTS, MAX_ANTS_NORMAL, SUGAR_BOOST_MUL, SUGAR_BOOST_S, SUGAR_COOLDOWN_S, MAX_QUEENS, NEST, NURSE_EVAL_S, NURSE_MAX_FRACTION, NURSES_PER_QUEEN, HOP_DUR, RESCUE_AFTER_S, STARTER_STOCK, STEP_S, TOUCH_COOLDOWN_S, TOUCH_DIST, UNLOAD_S, MAP_STEP_ANTS, MAX_MAP_STEP,
} from './constants';
import { FOOD_TABLE, isAlive, isFreeSpot, resolvePlacement, type FoodItem, type FoodKind, type PreyKind } from './food';
import { updateEnvironment } from './environment';
import { larvaeChambersNeeded, pantriesNeeded } from './nestNeeds';
import { PheromoneField } from './pheromone';
import { Rng } from './rng';
import { extendTerrain, generateTerrain, speedAt, type Terrain } from './terrain';

/** 'nest' = underground: the ant is not on the surface (see `Ant.nestKind` for why it is inside). */
export type AntState = 'wander' | 'toFood' | 'gnaw' | 'carry' | 'nest';
/** Why an ant in state 'nest' is inside: freshly hatched, resting after a delivery, or a permanent nest worker. */
export type NestKind = 'hatch' | 'unload' | 'nurse';
export type AntRole = 'forager' | 'nurse';

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
const MAX_TURN = 6 * STEP_S; // rad per substep
const FAN = 0.6;
const TURN_PENALTY = 0.05;
const LOOKAHEAD = 3;
/** How far ahead (px) and how wide (cells, each way) a pheromone-following ant senses a trail: a 1 px trail is easy to miss with less. */
const PHER_LOOKAHEAD = 6;
const PHER_R = 2;
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
const FAN_TURNS = [-FAN, 0, FAN];

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
  /** Ants killed so far by a defending beetle (transient: not saved, 0 after a load). */
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
    return Math.min(MAX_QUEENS, 1 + Math.floor(this.totalDelivered / FOOD_PER_QUEEN));
  }

  /** Seconds between two hatches: each queen lays on her own HATCH_INTERVAL_S cycle. */
  get hatchInterval(): number {
    return HATCH_INTERVAL_S / this.queens;
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
  get majors(): number {
    let n = 0;
    for (const a of this.ants) if (a.major) n++;
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

  placeFood(kind: FoodKind, x: number, y: number): FoodItem | null {
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
    const ex = this.explored;
    for (let i = 0; i < ex.length; i++) ex[i] *= EXPLORE_DECAY;
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
    }
    this.pher.step(STEP_S);
    this.time += STEP_S;
    this.updateNurses();
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
    const want = this.desiredNurses;
    const have = this.nurses;
    if (have < want) {
      const candidates = this.ants
        .filter((a) => a.state === 'nest' && a.role !== 'nurse')
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
      } else if (f.kind === 'beetle' || f.kind === 'caterpillar') {
        this.walkCrawler(f);
      }
    }
  }

  /**
   * A beetle / caterpillar ambles with little heading noise, pauses now and then and turns away from obstacles; it never
   * steps onto a blocked spot. A caterpillar is slower than a beetle, and while it flees (fleeT > 0) it neither pauses
   * nor crawls at the normal pace.
   */
  private walkCrawler(f: FoodItem): void {
    const rng = this.rng;
    const cat = f.kind === 'caterpillar';
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
    const freeAhead = (a: number): boolean =>
      isFreeSpot(t, f.x + Math.cos(a) * BEETLE_LOOKAHEAD, f.y + Math.sin(a) * BEETLE_LOOKAHEAD);
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
    const base = cat ? CATERPILLAR_SPEED * (fleeing ? CATERPILLAR_FLEE_MUL : 1) : BEETLE_SPEED;
    const v = base * (f.speedMul ?? 1) * speedAt(t, f.x, f.y) * STEP_S;
    const nx = f.x + Math.cos(f.heading) * v;
    const ny = f.y + Math.sin(f.heading) * v;
    if (isFreeSpot(t, nx, ny)) {
      f.x = nx;
      f.y = ny;
    }
  }

  /** Each living creature that is touchable and has an ant (wander / toFood) within TOUCH_DIST gets exactly one touch per substep. */
  private resolveTouches(): void {
    if (this.ants.length === 0) return;
    for (const f of this.food) {
      if (!isAlive(f) || f.hop) continue;
      const onCooldown = (f.cooldown ?? 0) > 1e-9;
      let toucher: Ant | null = null;
      for (const ant of this.ants) {
        if (ant.state !== 'wander' && ant.state !== 'toFood') continue;
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

  private touch(f: FoodItem, ant: Ant): void {
    f.touches = (f.touches ?? 0) + 1;
    f.cooldown = f.kind === 'fly' ? Math.max(TOUCH_COOLDOWN_S, HOP_DUR + 0.2) : TOUCH_COOLDOWN_S;
    if (f.touches >= 2 || ant.major) {
      // Second touch (or any touch of a major): the creature dies and becomes carrion with its own meat; the ant survives and goes for it.
      const was = f.kind as PreyKind;
      f.alive = false;
      f.kind = 'carrion';
      f.corpseOf = was;
      f.piecesLeft = FOOD_TABLE[was].pieces;
      delete f.cooldown;
      delete f.hop;
      delete f.wanderT;
      delete f.fleeT;
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

  /** Hop 20-35 px in a random direction to a free spot (8 headings, then shorter hops); stays put if nothing is free. */
  private startHop(f: FoodItem): void {
    const rng = this.rng;
    for (const scale of HOP_SCALES) {
      for (let i = 0; i < HOP_TRIES; i++) {
        const h = rng.next() * TWO_PI - Math.PI;
        const d = (HOP_MIN + (HOP_MAX - HOP_MIN) * rng.next()) * scale;
        const tx = f.x + Math.cos(h) * d;
        const ty = f.y + Math.sin(h) * d;
        if (!isFreeSpot(this.terrain, tx, ty)) continue;
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

  private nearestFood(x: number, y: number): FoodItem | undefined {
    let best: FoodItem | undefined;
    let bestD = SENSE_FOOD;
    for (const f of this.food) {
      if (f.piecesLeft <= 0) continue;
      const d = Math.hypot(f.x - x, f.y - y);
      if (d <= bestD) {
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
    if (ant.state === 'nest') {
      this.updateNestAnt(ant);
      return;
    }

    if (ant.state === 'wander') {
      const f = this.nearestFood(ant.x, ant.y);
      if (f) {
        ant.state = 'toFood';
        ant.targetFood = f.id;
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
      if (!f || f.piecesLeft <= 0) {
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
    if (ant.state === 'carry') {
      desired = this.carryHeading(ant);
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
      pherWeight = ant.strayT !== undefined ? 0 : 0.15;
      this.markExplored(ant.x, ant.y);
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

    if (ant.state === 'carry' && Math.hypot(ant.x - NEST.x, ant.y - NEST.y) <= NEST.r) {
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
    const pieces = ant.major ? Math.min(f.piecesLeft, MAJOR_CARRY_PIECES) : 1;
    f.piecesLeft -= pieces;
    ant.carry = pieces * FOOD_TABLE[f.kind].value;
    if (f.kind === 'sugar') ant.carrySugar = true;
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

  /**
   * Pick the best of the candidate headings around `desired`, turn smoothly toward it and advance.
   * Returns the pheromone pull: pherWeight times the strongest trail value any candidate heading senses (0 without trail).
   */
  private move(ant: Ant, desired: number, pherWeight: number): number {
    let pull = 0;
    let best = desired;
    let bestScore = -Infinity;
    const wander = ant.state === 'wander';
    for (const turn of FAN_TURNS) {
      const h = desired + turn;
      const c = Math.cos(h);
      const s = Math.sin(h);
      let score = speedAt(this.terrain, ant.x + c * LOOKAHEAD, ant.y + s * LOOKAHEAD) - TURN_PENALTY * Math.abs(turn);
      if (pherWeight > 0) {
        const p = pherWeight * this.pher.sampleMax(ant.x + c * PHER_LOOKAHEAD, ant.y + s * PHER_LOOKAHEAD, PHER_R);
        score += p;
        if (p > pull) pull = p;
      }
      if (wander) score -= EXPLORE_WEIGHT * (0.7 + 0.3 * ant.curiosity) * this.explored[this.exploreIndex(ant.x + c * EXPLORE_LOOKAHEAD, ant.y + s * EXPLORE_LOOKAHEAD)];
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
