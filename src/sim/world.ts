import {
  BEETLE_SPEED, EXPLORE_CAP, EXPLORE_CELL, EXPLORE_HALF_LIFE_S, CARRY_SPEED_MUL, FOOD_PER_ANT, FOOD_PER_QUEEN, GNAW_S, HATCH_INTERVAL_S, MAX_ANTS, MAX_QUEENS, NEST, HOP_DUR, RESCUE_AFTER_S, STARTER_STOCK, STEP_S, TOUCH_COOLDOWN_S, TOUCH_DIST, WORLD_H, WORLD_W,
} from './constants';
import { FOOD_TABLE, isAlive, isFreeSpot, resolvePlacement, type FoodItem, type FoodKind, type PreyKind } from './food';
import { PheromoneField } from './pheromone';
import { Rng } from './rng';
import { generateTerrain, speedAt, type Terrain } from './terrain';

export type AntState = 'wander' | 'toFood' | 'gnaw' | 'carry';

export interface Ant {
  id: number;
  x: number;
  y: number;
  heading: number;
  state: AntState;
  /** Seconds lived (informational only: ants do not die of old age). */
  age: number;
  carry: number;
  targetFood: number | null;
  /** Seconds of gnawing left while state is 'gnaw'; 0 otherwise. */
  timer: number;
}

const BASE_SPEED = 12;
const MAX_TURN = 6 * STEP_S; // rad per substep
const FAN = 0.6;
const TURN_PENALTY = 0.05;
const LOOKAHEAD = 3;
const PHER_LOOKAHEAD = 4;
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
/** Cells of the explored grid (EXPLORE_CELL px each). */
const EXPLORE_W = Math.ceil(WORLD_W / EXPLORE_CELL);
const EXPLORE_H = Math.ceil(WORLD_H / EXPLORE_CELL);
/** Per-substep decay factor of the explored grid (half-life EXPLORE_HALF_LIFE_S). */
const EXPLORE_DECAY = Math.exp((-STEP_S * Math.LN2) / EXPLORE_HALF_LIFE_S);
/** Explored value a wandering ant adds to its cell per second spent there. */
const EXPLORE_RATE = 1;
/** Score penalty per unit of explored value in the cell a candidate heading points at (a detected trail or food always outweighs it). */
const EXPLORE_WEIGHT = 0.1;
/** How far ahead (px) a wanderer reads the explored grid. */
const EXPLORE_LOOKAHEAD = 16;
const PICKUP_DIST = 1.5;
/** Beetle heading noise per substep (full range, rad): much calmer than an ant. */
const BEETLE_JITTER = 0.15;
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
  /**
   * Coarse "where have ants been" map (EXPLORE_W x EXPLORE_H cells of EXPLORE_CELL px, row-major): wandering ants add
   * to their cell, values decay with half-life EXPLORE_HALF_LIFE_S and are capped at EXPLORE_CAP; wanderers prefer
   * headings toward less explored ground. TRANSIENT: never saved, empty after a load (it refills within a minute).
   * Treat as read-only outside the world (tests may poke values to arrange a situation).
   */
  readonly explored = new Float32Array(EXPLORE_W * EXPLORE_H);
  private acc = 0;
  /** Seconds the colony has been empty and out of food (rescue clock; transient, not saved). */
  private rescueTimer = 0;

  constructor(seed: number, terrain: Terrain, pher: PheromoneField, rng: Rng) {
    this.seed = seed;
    this.terrain = terrain;
    this.pher = pher;
    this.rng = rng;
  }

  static create(seed: number): World {
    const terrain = generateTerrain(seed);
    return new World(seed, terrain, new PheromoneField(terrain.w, terrain.h), new Rng(seed ^ 0x9e3779b9));
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

  /** Progress of the current hatching cycle in [0, 1]. */
  get hatchFraction(): number {
    return Math.max(0, Math.min(1, this.hatchProgress / this.hatchInterval));
  }

  spawnAnt(): Ant {
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
    };
    this.ants.push(ant);
    this.started = true;
    return ant;
  }

  placeFood(kind: FoodKind, x: number, y: number): FoodItem | null {
    const p = resolvePlacement(this.terrain, x, y);
    if (!p) return null;
    const item: FoodItem = { id: this.nextId++, kind, x: p.x, y: p.y, piecesLeft: FOOD_TABLE[kind].pieces };
    if (kind === 'beetle' || kind === 'fly') {
      // A placed beetle / fly is a living creature until two ants have touched it.
      item.alive = true;
      item.touches = 0;
      item.heading = this.rng.next() * TWO_PI - Math.PI;
    }
    this.food.push(item);
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
      if (a.state === 'toFood' || a.state === 'gnaw') a.state = 'wander';
      a.timer = 0;
    }
  }

  step(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.acc += Math.min(dt, MAX_DT);
    const n = Math.floor(this.acc / STEP_S + 1e-9);
    this.acc = Math.max(0, this.acc - n * STEP_S);
    for (let i = 0; i < n; i++) this.substep();
  }

  private substep(): void {
    const ex = this.explored;
    for (let i = 0; i < ex.length; i++) ex[i] *= EXPLORE_DECAY;
    for (const ant of this.ants) this.updateAnt(ant);
    this.updateCreatures();
    this.resolveTouches();
    this.hatch();
    this.rescue();
    this.pher.step(STEP_S);
    this.time += STEP_S;
  }

  /** Living creatures: cooldowns tick, hopping flies fly, beetles walk. */
  private updateCreatures(): void {
    for (const f of this.food) {
      if (!isAlive(f)) continue;
      if (f.cooldown !== undefined && f.cooldown > 0) f.cooldown = Math.max(0, f.cooldown - STEP_S);
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
      } else if (f.kind === 'beetle') {
        this.walkBeetle(f);
      }
    }
  }

  /** A beetle ambles with little heading noise, pauses now and then and turns away from obstacles; it never steps onto a blocked spot. */
  private walkBeetle(f: FoodItem): void {
    const rng = this.rng;
    if (f.wanderT !== undefined && f.wanderT > 0) {
      f.wanderT -= STEP_S;
      return;
    }
    if (rng.next() < BEETLE_PAUSE_RATE * STEP_S) {
      f.wanderT = BEETLE_PAUSE_MIN_S + (BEETLE_PAUSE_MAX_S - BEETLE_PAUSE_MIN_S) * rng.next();
      return;
    }
    let h = (f.heading ?? 0) + (rng.next() - 0.5) * BEETLE_JITTER;
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
    const v = BEETLE_SPEED * speedAt(t, f.x, f.y) * STEP_S;
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
      if (!isAlive(f) || f.hop || (f.cooldown ?? 0) > 1e-9) continue;
      for (const ant of this.ants) {
        if (ant.state !== 'wander' && ant.state !== 'toFood') continue;
        if (Math.hypot(ant.x - f.x, ant.y - f.y) > TOUCH_DIST) continue;
        this.touch(f, ant);
        break;
      }
    }
  }

  private touch(f: FoodItem, ant: Ant): void {
    f.touches = (f.touches ?? 0) + 1;
    f.cooldown = f.kind === 'fly' ? Math.max(TOUCH_COOLDOWN_S, HOP_DUR + 0.2) : TOUCH_COOLDOWN_S;
    if (f.touches >= 2) {
      // Second touch: the creature dies and becomes carrion with its own meat; the ant survives and goes for it.
      const was = f.kind as PreyKind;
      f.alive = false;
      f.kind = 'carrion';
      f.corpseOf = was;
      f.piecesLeft = FOOD_TABLE[was].pieces;
      delete f.cooldown;
      delete f.hop;
      delete f.wanderT;
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
    if (!this.started || this.stock + STOCK_EPS < FOOD_PER_ANT || this.ants.length >= MAX_ANTS) {
      this.hatchProgress = 0;
      return;
    }
    this.hatchProgress += STEP_S;
    if (this.hatchProgress >= this.hatchInterval - 1e-9) {
      this.stock = Math.max(0, Math.round((this.stock - FOOD_PER_ANT) * 1e6) / 1e6);
      this.spawnAnt();
      this.hatchProgress = 0;
    }
  }

  /** Never soft-lock: an empty, foodless started colony gets one free ant after RESCUE_AFTER_S. */
  private rescue(): void {
    if (!this.started || this.ants.length > 0 || this.stock + STOCK_EPS >= FOOD_PER_ANT) {
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

  private updateAnt(ant: Ant): void {
    ant.age += STEP_S;

    if (ant.state === 'wander') {
      const f = this.nearestFood(ant.x, ant.y);
      if (f) {
        ant.state = 'toFood';
        ant.targetFood = f.id;
      }
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
        desired = Math.atan2(f.y - ant.y, f.x - ant.x);
        pherWeight = 0.3;
        if (Math.hypot(f.x - ant.x, f.y - ant.y) <= PICKUP_DIST) {
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
      desired = Math.atan2(NEST.y - ant.y, NEST.x - ant.x);
      this.pher.deposit(ant.x, ant.y, DEPOSIT);
    } else if (ant.state === 'wander') {
      desired = ant.heading + (this.rng.next() - 0.5) * WANDER_JITTER;
      const homeD = Math.hypot(ant.x - NEST.x, ant.y - NEST.y);
      if (homeD < OUTBOUND_R) {
        desired += wrapAngle(Math.atan2(ant.y - NEST.y, ant.x - NEST.x) - desired) * OUTBOUND_K;
      }
      const range = YOUNG_R0 + YOUNG_GROW * ant.age;
      if (homeD > range && range < WORLD_W + WORLD_H) {
        const w = Math.min(YOUNG_MAX, (YOUNG_K * (homeD - range)) / YOUNG_SPAN);
        desired += wrapAngle(Math.atan2(NEST.y - ant.y, NEST.x - ant.x) - desired) * w;
      }
      pherWeight = 0.15;
      this.markExplored(ant.x, ant.y);
    }

    this.move(ant, desired, pherWeight);

    if (ant.state === 'carry' && Math.hypot(ant.x - NEST.x, ant.y - NEST.y) <= NEST.r) {
      this.stock += ant.carry;
      this.totalDelivered += ant.carry;
      ant.carry = 0;
      this.deliveryCount++;
      if (this.findFood(ant.targetFood)) {
        ant.state = 'toFood';
      } else {
        ant.state = 'wander';
        ant.targetFood = null;
      }
    }
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
    f.piecesLeft--;
    ant.carry = FOOD_TABLE[f.kind].value;
    ant.state = 'carry';
    ant.timer = 0;
    if (f.piecesLeft <= 0) this.food.splice(this.food.indexOf(f), 1);
  }

  /** Cell index of the explored grid under (x, y), clamped to the world. */
  private exploreIndex(x: number, y: number): number {
    const cx = Math.max(0, Math.min(EXPLORE_W - 1, Math.floor(x / EXPLORE_CELL)));
    const cy = Math.max(0, Math.min(EXPLORE_H - 1, Math.floor(y / EXPLORE_CELL)));
    return cy * EXPLORE_W + cx;
  }

  private markExplored(x: number, y: number): void {
    const i = this.exploreIndex(x, y);
    this.explored[i] = Math.min(EXPLORE_CAP, this.explored[i] + STEP_S * EXPLORE_RATE);
  }

  /** Pick the best of the candidate headings candidate headings around `desired`, turn smoothly toward it and advance. */
  private move(ant: Ant, desired: number, pherWeight: number): void {
    let best = desired;
    let bestScore = -Infinity;
    const wander = ant.state === 'wander';
    for (const turn of FAN_TURNS) {
      const h = desired + turn;
      const c = Math.cos(h);
      const s = Math.sin(h);
      let score = speedAt(this.terrain, ant.x + c * LOOKAHEAD, ant.y + s * LOOKAHEAD) - TURN_PENALTY * Math.abs(turn);
      if (pherWeight > 0) {
        score += pherWeight * this.pher.sampleMax(ant.x + c * PHER_LOOKAHEAD, ant.y + s * PHER_LOOKAHEAD, 1);
      }
      if (wander) score -= EXPLORE_WEIGHT * this.explored[this.exploreIndex(ant.x + c * EXPLORE_LOOKAHEAD, ant.y + s * EXPLORE_LOOKAHEAD)];
      if (score > bestScore) {
        bestScore = score;
        best = h;
      }
    }
    const diff = wrapAngle(best - ant.heading);
    ant.heading = wrapAngle(ant.heading + Math.max(-MAX_TURN, Math.min(MAX_TURN, diff)));
    const v = BASE_SPEED * (ant.state === 'carry' ? CARRY_SPEED_MUL : 1) * speedAt(this.terrain, ant.x, ant.y) * STEP_S;
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
  }
}
