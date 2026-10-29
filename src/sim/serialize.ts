import { MAX_PHEROMONE } from './constants';
import { FOOD_TABLE, type FoodItem } from './food';
import { World, type Ant } from './world';

export interface SaveV1 {
  version: 1;
  seed: number;
  rngState: number;
  time: number;
  stock: number;
  hatchProgress: number;
  nextId: number;
  introDone: boolean;
  ants: Ant[];
  food: FoodItem[];
  /** base64 of Uint8Array, one byte per cell: round(value / MAX_PHEROMONE * 255). */
  pheromone: string;
  camera: { x: number; y: number; zoom: number };
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function worldToSave(w: World, extra: { introDone: boolean; camera: SaveV1['camera'] }): SaveV1 {
  const bytes = new Uint8Array(w.pher.data.length);
  for (let i = 0; i < bytes.length; i++) {
    const v = Math.round((w.pher.data[i] / MAX_PHEROMONE) * 255);
    bytes[i] = Math.max(0, Math.min(255, v));
  }
  return {
    version: 1,
    seed: w.seed,
    rngState: w.rng.state,
    time: w.time,
    stock: w.stock,
    hatchProgress: w.hatchProgress,
    nextId: w.nextId,
    introDone: extra.introDone,
    ants: w.ants.map((a) => ({ ...a })),
    food: w.food.map((f) => ({ ...f })),
    pheromone: bytesToBase64(bytes),
    camera: { ...extra.camera },
  };
}

/** Throws if the pheromone payload does not match the world size. Validate with `validateSave` first. */
export function worldFromSave(s: SaveV1): World {
  const w = World.create(s.seed);
  const bytes = base64ToBytes(s.pheromone);
  if (bytes.length !== w.pher.data.length) throw new Error('Invalid save: pheromone size mismatch');
  w.rng.state = s.rngState;
  w.time = s.time;
  w.stock = s.stock;
  w.hatchProgress = s.hatchProgress;
  w.nextId = s.nextId;
  w.ants.length = 0;
  w.ants.push(...s.ants.map((a) => ({ ...a })));
  w.food.length = 0;
  w.food.push(...s.food.map((f) => ({ ...f })));
  for (let i = 0; i < bytes.length; i++) w.pher.data[i] = (bytes[i] / 255) * MAX_PHEROMONE;
  return w;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const ANT_STATES = ['wander', 'toFood', 'carry'];

function validAnt(a: unknown): boolean {
  if (typeof a !== 'object' || a === null) return false;
  const o = a as Record<string, unknown>;
  return (
    isNum(o.id) && isNum(o.x) && isNum(o.y) && isNum(o.heading) && isNum(o.age) && isNum(o.lifespan) &&
    isNum(o.carry) && typeof o.state === 'string' && ANT_STATES.includes(o.state) &&
    (o.targetFood === null || isNum(o.targetFood))
  );
}

function validFood(f: unknown): boolean {
  if (typeof f !== 'object' || f === null) return false;
  const o = f as Record<string, unknown>;
  return (
    isNum(o.id) && isNum(o.x) && isNum(o.y) && isNum(o.piecesLeft) && typeof o.kind === 'string' &&
    Object.prototype.hasOwnProperty.call(FOOD_TABLE, o.kind)
  );
}

export function validateSave(x: unknown): SaveV1 | null {
  if (typeof x !== 'object' || x === null) return null;
  const o = x as Record<string, unknown>;
  if (o.version !== 1) return null;
  if (!isNum(o.seed) || !isNum(o.rngState) || !isNum(o.time) || !isNum(o.stock) || !isNum(o.hatchProgress) || !isNum(o.nextId)) {
    return null;
  }
  if (typeof o.introDone !== 'boolean' || typeof o.pheromone !== 'string') return null;
  const c = o.camera as Record<string, unknown> | null | undefined;
  if (typeof c !== 'object' || c === null || !isNum(c.x) || !isNum(c.y) || !isNum(c.zoom)) return null;
  if (!Array.isArray(o.ants) || !o.ants.every(validAnt)) return null;
  if (!Array.isArray(o.food) || !o.food.every(validFood)) return null;
  return x as SaveV1;
}
