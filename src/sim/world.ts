import { FOOD_PER_ANT, LIFESPAN_S, MAX_ANTS, NEST, STEP_S } from './constants';
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
const SENSE_FOOD = 10;
const PICKUP_DIST = 1.5;
const DEPOSIT = 0.5;
const MAX_DT = 0.5;
const TWO_PI = Math.PI * 2;

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
  /** Reserved for save compatibility; unused. */
  hatchProgress = 0;
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
    this.ants = this.ants.filter((a) => a.age < a.lifespan);
    while (this.stock >= FOOD_PER_ANT && this.ants.length < MAX_ANTS) {
      this.stock -= FOOD_PER_ANT;
      this.spawnAnt();
    }
    this.pher.step(STEP_S);
    this.time += STEP_S;
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
          if (f.piecesLeft <= 0) this.food = this.food.filter((o) => o !== f);
          desired = Math.atan2(NEST.y - ant.y, NEST.x - ant.x);
        }
      }
    }
    if (ant.state === 'carry') {
      desired = Math.atan2(NEST.y - ant.y, NEST.x - ant.x);
      this.pher.deposit(ant.x, ant.y, DEPOSIT);
    } else if (ant.state === 'wander') {
      desired = ant.heading + (this.rng.next() - 0.5) * 0.6;
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
    for (const turn of [-FAN, 0, FAN]) {
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
    ant.x = Math.max(0.5, Math.min(this.terrain.w - 0.5, ant.x + Math.cos(ant.heading) * v));
    ant.y = Math.max(0.5, Math.min(this.terrain.h - 0.5, ant.y + Math.sin(ant.heading) * v));
  }
}
