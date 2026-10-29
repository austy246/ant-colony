import { HATCH_INTERVAL_S, MAX_PHEROMONE, STEP_S, WORLD_H, WORLD_W } from './constants';
import { FOOD_TABLE, type FoodItem } from './food';
import { World, type Ant } from './world';

export interface SaveV1 {
  version: 1;
  seed: number;
  rngState: number;
  time: number;
  stock: number;
  hatchProgress: number;
  /** Optional (absent in older saves): whether the first ant has appeared. */
  started?: boolean;
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
    started: w.started,
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
  // Old saves (colony floor) may hold up to LEGACY_MAX_HATCH_PROGRESS seconds: clamp into the new cycle range.
  w.hatchProgress = Math.max(0, Math.min(HATCH_INTERVAL_S - STEP_S, s.hatchProgress));
  w.started = s.started ?? (s.ants.length > 0 || s.time > 30);
  w.nextId = s.nextId;
  w.ants.length = 0;
  for (const a of s.ants) w.ants.push({ ...a });
  w.food.length = 0;
  for (const f of s.food) w.food.push({ ...f });
  for (let i = 0; i < bytes.length; i++) w.pher.data[i] = (bytes[i] / 255) * MAX_PHEROMONE;
  return w;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => isNum(v) && Number.isInteger(v);
const inRange = (v: unknown, lo: number, hi: number): v is number => isNum(v) && v >= lo && v <= hi;
const ANT_STATES = ['wander', 'toFood', 'carry'];
/** Saves from the old colony-floor rules stored up to 15 s here; they still load (clamped on restore). */
const LEGACY_MAX_HATCH_PROGRESS = 15;
const MAX_ENTRIES = 2000;
const MAX_PIECES = 20;

function validAnt(a: unknown): boolean {
  if (typeof a !== 'object' || a === null) return false;
  const o = a as Record<string, unknown>;
  return (
    isInt(o.id) && inRange(o.x, 0, WORLD_W) && inRange(o.y, 0, WORLD_H) && isNum(o.heading) &&
    isNum(o.age) && o.age >= 0 && isNum(o.lifespan) && o.lifespan > 0 && isNum(o.carry) &&
    typeof o.state === 'string' && ANT_STATES.includes(o.state) &&
    (o.targetFood === null || isNum(o.targetFood))
  );
}

function validFood(f: unknown): boolean {
  if (typeof f !== 'object' || f === null) return false;
  const o = f as Record<string, unknown>;
  return (
    isInt(o.id) && inRange(o.x, 0, WORLD_W) && inRange(o.y, 0, WORLD_H) &&
    isInt(o.piecesLeft) && o.piecesLeft >= 0 && o.piecesLeft <= MAX_PIECES &&
    typeof o.kind === 'string' && Object.prototype.hasOwnProperty.call(FOOD_TABLE, o.kind)
  );
}

function validPheromone(b64: string): boolean {
  try {
    return base64ToBytes(b64).length === WORLD_W * WORLD_H;
  } catch {
    return false;
  }
}

export function validateSave(x: unknown): SaveV1 | null {
  if (typeof x !== 'object' || x === null) return null;
  const o = x as Record<string, unknown>;
  if (o.version !== 1) return null;
  if (!isNum(o.seed) || !isNum(o.rngState)) return null;
  if (!inRange(o.hatchProgress, 0, LEGACY_MAX_HATCH_PROGRESS)) return null;
  if (!isNum(o.time) || o.time < 0 || !isNum(o.stock) || o.stock < 0 || !isInt(o.nextId)) return null;
  if (o.started !== undefined && typeof o.started !== 'boolean') return null;
  if (typeof o.introDone !== 'boolean' || typeof o.pheromone !== 'string') return null;
  const c = o.camera as Record<string, unknown> | null | undefined;
  if (typeof c !== 'object' || c === null || !isNum(c.x) || !isNum(c.y) || !isNum(c.zoom) || c.zoom <= 0) return null;
  if (!Array.isArray(o.ants) || o.ants.length > MAX_ENTRIES || !o.ants.every(validAnt)) return null;
  if (!Array.isArray(o.food) || o.food.length > MAX_ENTRIES || !o.food.every(validFood)) return null;
  for (const e of [...(o.ants as { id: number }[]), ...(o.food as { id: number }[])]) {
    if (e.id >= o.nextId) return null;
  }
  if (!validPheromone(o.pheromone)) return null;
  return x as SaveV1;
}
