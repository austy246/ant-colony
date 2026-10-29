import { FOOD_PER_ANT, MAX_PHEROMONE, STEP_S, WORLD_H, WORLD_W } from './constants';
import { FOOD_TABLE, type FoodItem } from './food';
import { World, type Ant } from './world';

export interface SaveV1 {
  version: 1;
  seed: number;
  rngState: number;
  time: number;
  stock: number;
  /** Optional (absent in older saves): food delivered in total; derived as stock + ants * FOOD_PER_ANT when missing. */
  totalDelivered?: number;
  hatchProgress: number;
  /** Optional (absent in older saves): whether the first ant has appeared. */
  started?: boolean;
  nextId: number;
  introDone: boolean;
  /** `timer` is optional (absent in older saves): seconds of gnawing left, 0 when not gnawing. */
  /** `lifespan` is optional and ignored (removed: ants no longer die of old age; older saves still hold it). */
  ants: (Omit<Ant, 'timer'> & { timer?: number; lifespan?: number })[];
  /** Living-creature fields (`alive`, `touches`, `heading`, `corpseOf`) are optional; transient ones (cooldown, hop, wanderT) are never saved. */
  food: FoodItem[];
  /** base64 of Uint8Array, one byte per cell: round(value / MAX_PHEROMONE * 255). */
  pheromone: string;
  camera: { x: number; y: number; zoom: number };
}

/** Persistent fields of a food item only (the transient cooldown / hop / wanderT are left out). */
function foodToSave(f: FoodItem): FoodItem {
  const o: FoodItem = { id: f.id, kind: f.kind, x: f.x, y: f.y, piecesLeft: f.piecesLeft };
  if (f.alive !== undefined) o.alive = f.alive;
  if (f.touches !== undefined) o.touches = f.touches;
  if (f.heading !== undefined) o.heading = f.heading;
  if (f.corpseOf !== undefined) o.corpseOf = f.corpseOf;
  return o;
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
    totalDelivered: w.totalDelivered,
    hatchProgress: w.hatchProgress,
    started: w.started,
    nextId: w.nextId,
    introDone: extra.introDone,
    ants: w.ants.map((a) => ({ ...a })),
    food: w.food.map(foodToSave),
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
  w.totalDelivered = s.totalDelivered ?? s.stock + s.ants.length * FOOD_PER_ANT;
  // Old saves (colony floor) may hold up to LEGACY_MAX_HATCH_PROGRESS seconds: clamp into the effective cycle range.
  w.hatchProgress = Math.max(0, Math.min(w.hatchInterval - STEP_S, s.hatchProgress));
  w.started = s.started ?? (s.ants.length > 0 || s.time > 30);
  w.nextId = s.nextId;
  w.ants.length = 0;
  for (const a of s.ants) {
    // `lifespan` was removed (ants no longer die of old age); old saves may still carry it: drop it.
    const { lifespan: _lifespan, ...rest } = a;
    w.ants.push({ ...rest, timer: a.timer ?? 0 });
  }
  w.food.length = 0;
  for (const f of s.food) w.food.push(foodToSave(f));
  for (let i = 0; i < bytes.length; i++) w.pher.data[i] = (bytes[i] / 255) * MAX_PHEROMONE;
  return w;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => isNum(v) && Number.isInteger(v);
const inRange = (v: unknown, lo: number, hi: number): v is number => isNum(v) && v >= lo && v <= hi;
const ANT_STATES = ['wander', 'toFood', 'gnaw', 'carry'];
/** Saves from the old colony-floor rules stored up to 15 s here; they still load (clamped on restore). */
const LEGACY_MAX_HATCH_PROGRESS = 15;
const MAX_ENTRIES = 2000;
/** Largest piece count of any food kind (a loaded save may hold 0..max; old saves hold smaller numbers). */
const MAX_PIECES = Math.max(...Object.values(FOOD_TABLE).map((f) => f.pieces));

function validAnt(a: unknown): boolean {
  if (typeof a !== 'object' || a === null) return false;
  const o = a as Record<string, unknown>;
  return (
    isInt(o.id) && inRange(o.x, 0, WORLD_W) && inRange(o.y, 0, WORLD_H) && isNum(o.heading) &&
    isNum(o.age) && o.age >= 0 && isNum(o.carry) &&
    typeof o.state === 'string' && ANT_STATES.includes(o.state) &&
    (o.targetFood === null || isNum(o.targetFood)) &&
    (o.timer === undefined || (isNum(o.timer) && o.timer >= 0))
  );
}

function validFood(f: unknown): boolean {
  if (typeof f !== 'object' || f === null) return false;
  const o = f as Record<string, unknown>;
  return (
    isInt(o.id) && inRange(o.x, 0, WORLD_W) && inRange(o.y, 0, WORLD_H) &&
    isInt(o.piecesLeft) && o.piecesLeft >= 0 && o.piecesLeft <= MAX_PIECES &&
    typeof o.kind === 'string' && Object.prototype.hasOwnProperty.call(FOOD_TABLE, o.kind) &&
    (o.alive === undefined || typeof o.alive === 'boolean') &&
    (o.touches === undefined || (isInt(o.touches) && o.touches >= 0 && o.touches <= 2)) &&
    (o.heading === undefined || isNum(o.heading)) &&
    (o.corpseOf === undefined || o.corpseOf === 'beetle' || o.corpseOf === 'fly')
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
  if (o.totalDelivered !== undefined && (!isNum(o.totalDelivered) || o.totalDelivered < 0)) return null;
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
