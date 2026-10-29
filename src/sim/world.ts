import { COLONY_FLOOR, FLOOR_HATCH_S, FOOD_PER_ANT, LIFESPAN_S, MAX_ANTS, NEST, STEP_S } from './constants';
import { FOOD_TABLE, resolvePlacement, type FoodItem, type FoodKind } from './food';
import { PheromoneField } from './pheromone';
import { Rng } from './rng';
import { generateTerrain, speedAt, type Terrain } from './terrain';

export type AntState = 'wander' | 'toFood' | 'carry';

export interface Ant {
  id: number;
  x: number;
  y: number;
  heading: number;
  state: AntState;
  age: number;
  lifespan: number;
  carry: number;
  targetFood: number | null;
}

const BASE_SPEED = 12;
const MAX_TURN = 6 * STEP_S; // rad per substep
const FAN = 0.6;
const TURN_PENALTY = 0.05;
const LOOKAHEAD = 3;
const PHER_LOOKAHEAD = 4;
/** Radius within which a wandering ant notices food (pickup distance is separate and unchanged). Raised 16 -> 32 so bold, straight-heading scouts still find food. */
const SENSE_FOOD = 32;
/** Home tether for wandering ants: beyond TETHER_R px from the nest the desired heading is blended toward home... */
const TETHER_R = 120;
/** ...with weight TETHER_K * (distance - TETHER_R) / TETHER_SPAN, clamped to [0, TETHER_MAX]. */
const TETHER_SPAN = 60;
const TETHER_K = 0.15;
const TETHER_MAX = 0.6;
const PICKUP_DIST = 1.5;
const DEPOSIT = 0.5;
const MAX_DT = 0.5;
const WANDER_JITTER = 0.3; // full range of per-step heading noise (+-0.15 rad): ants keep a heading and scout
/** Wanderers closer than OUTBOUND_R px to the nest are pushed outward (blend OUTBOUND_K) so they do not mill around the crater. */
const OUTBOUND_R = 50;
const OUTBOUND_K = 0.2;
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
  stock = 0;
  /** Seconds accumulated toward the next colony-floor egg (0 while the colony is at or above the floor). */
  hatchProgress = 0;
  /** True once the first ant has appeared (set by spawnAnt); the colony floor only applies from then on. */
  started = false;
  time = 0;
  nextId = 1;
  rng: Rng;
  seed: number;
  private acc = 0;

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

  spawnAnt(): Ant {
    const rng = this.rng;
    const ant: Ant = {
      id: this.nextId++,
      x: NEST.x + (rng.next() - 0.5) * 4,
      y: NEST.y + (rng.next() - 0.5) * 4,
      heading: rng.next() * TWO_PI - Math.PI,
      state: 'wander',
      age: 0,
      lifespan: LIFESPAN_S * (0.8 + 0.4 * rng.next()),
      carry: 0,
      targetFood: null,
    };
    this.ants.push(ant);
    this.started = true;
    return ant;
  }

  placeFood(kind: FoodKind, x: number, y: number): FoodItem | null {
    const p = resolvePlacement(this.terrain, x, y);
    if (!p) return null;
    const item: FoodItem = { id: this.nextId++, kind, x: p.x, y: p.y, piecesLeft: FOOD_TABLE[kind].pieces };
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
    return true;
  }

  removeFood(id: number): void {
    const i = this.food.findIndex((f) => f.id === id);
    if (i >= 0) this.food.splice(i, 1);
    for (const a of this.ants) {
      if (a.targetFood !== id) continue;
      a.targetFood = null;
      if (a.state === 'toFood') a.state = 'wander';
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
    for (const ant of this.ants) this.updateAnt(ant);
    let k = 0;
    for (const a of this.ants) if (a.age < a.lifespan) this.ants[k++] = a;
    this.ants.length = k;
    while (this.stock >= FOOD_PER_ANT && this.ants.length < MAX_ANTS) {
      this.stock -= FOOD_PER_ANT;
      this.spawnAnt();
    }
    this.layFloorEgg();
    this.pher.step(STEP_S);
    this.time += STEP_S;
  }

  /** The queen keeps laying a few eggs: below COLONY_FLOOR ants a new one hatches every FLOOR_HATCH_S. */
  private layFloorEgg(): void {
    if (!this.started || this.ants.length >= COLONY_FLOOR) {
      this.hatchProgress = 0;
      return;
    }
    this.hatchProgress += STEP_S;
    if (this.hatchProgress >= FLOOR_HATCH_S - 1e-9) {
      this.hatchProgress = 0;
      if (this.ants.length < MAX_ANTS) this.spawnAnt();
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
          f.piecesLeft--;
          ant.carry = FOOD_TABLE[f.kind].value;
          ant.state = 'carry';
          pherWeight = 0;
          if (f.piecesLeft <= 0) this.food.splice(this.food.indexOf(f), 1);
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
      } else if (homeD > TETHER_R) {
        const w = Math.min(TETHER_MAX, (TETHER_K * (homeD - TETHER_R)) / TETHER_SPAN);
        desired += wrapAngle(Math.atan2(NEST.y - ant.y, NEST.x - ant.x) - desired) * w;
      }
      pherWeight = 0.15;
    }

    this.move(ant, desired, pherWeight);

    if (ant.state === 'carry' && Math.hypot(ant.x - NEST.x, ant.y - NEST.y) <= NEST.r) {
      this.stock += ant.carry;
      ant.carry = 0;
      if (this.findFood(ant.targetFood)) {
        ant.state = 'toFood';
      } else {
        ant.state = 'wander';
        ant.targetFood = null;
      }
    }
  }

  /** Pick the best of three candidate headings around `desired`, turn smoothly toward it and advance. */
  private move(ant: Ant, desired: number, pherWeight: number): void {
    let best = desired;
    let bestScore = -Infinity;
    for (const turn of FAN_TURNS) {
      const h = desired + turn;
      const c = Math.cos(h);
      const s = Math.sin(h);
      let score = speedAt(this.terrain, ant.x + c * LOOKAHEAD, ant.y + s * LOOKAHEAD) - TURN_PENALTY * Math.abs(turn);
      if (pherWeight > 0) {
        score += pherWeight * this.pher.sampleMax(ant.x + c * PHER_LOOKAHEAD, ant.y + s * PHER_LOOKAHEAD, 1);
      }
      if (score > bestScore) {
        bestScore = score;
        best = h;
      }
    }
    const diff = wrapAngle(best - ant.heading);
    ant.heading = wrapAngle(ant.heading + Math.max(-MAX_TURN, Math.min(MAX_TURN, diff)));
    const v = BASE_SPEED * speedAt(this.terrain, ant.x, ant.y) * STEP_S;
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
