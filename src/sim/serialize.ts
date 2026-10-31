import { APHID_MAX, RED_TRICKLE_S, FOOD_PER_ANT, MAX_MAP_STEP, MAX_PHEROMONE, SPIDER_RESPAWN_S, STEP_S, SUGAR_BOOST_S, SUGAR_COOLDOWN_S } from './constants';
import { FOOD_TABLE, type FoodItem } from './food';
import type { Spider } from './spider';
import type { Bush } from './aphids';
import { terrainSize } from './terrain';
import { World, type Ant, type AntRole, type GameMode } from './world';

/** Ant fields that only live while the ant is steering a certain way; never written to a save. */
type TransientAntKey = 'strayT' | 'strayH' | 'lostT' | 'lostH' | 'weave';

export interface SaveV1 {
  version: 1;
  seed: number;
  rngState: number;
  time: number;
  stock: number;
  /** Optional (absent in older saves): food delivered in total; derived as stock + ants * FOOD_PER_ANT when missing. */
  totalDelivered?: number;
  hatchProgress: number;
  /** Optional (absent in older saves: start at the current stock): the highest stock ever reached. */
  peakStock?: number;
  /** Optional (absent in older saves: start at the current larvae count): the highest number of larvae ever waiting. */
  peakLarvae?: number;
  /** Optional (absent in older saves): whether the first ant has appeared. */
  started?: boolean;
  nextId: number;
  introDone: boolean;
  /**
   * `timer` is optional (absent in older saves): seconds of gnawing left (or seconds left inside the nest), 0 otherwise.
   * `role` is optional (absent in older saves = 'forager'); `nestKind` is optional (absent = 'hatch' for an ant in state 'nest').
   * `lifespan` is optional and ignored (removed: ants no longer die of old age; older saves still hold it).
   * `speedMul` / `curiosity` / `stubbornness` are optional (absent in older saves = 1.0); the transient steering state
   * (strayT, strayH, lostT, lostH, weave) is never saved.
   */
  ants: (Omit<Ant, 'timer' | 'role' | 'speedMul' | 'curiosity' | 'stubbornness' | TransientAntKey> & {
    timer?: number;
    role?: AntRole;
    speedMul?: number;
    curiosity?: number;
    stubbornness?: number;
    lifespan?: number;
  })[];
  /** Living-creature fields (`alive`, `touches`, `heading`, `corpseOf`) are optional; transient ones (cooldown, hop, wanderT) are never saved. */
  food: FoodItem[];
  /** base64 of Uint8Array, one byte per cell: round(value / MAX_PHEROMONE * 255). */
  pheromone: string;
  camera: { x: number; y: number; zoom: number };
  /** Optional (absent in older saves = 'sandbox'). */
  mode?: GameMode;
  /** Optional (absent = 0): map growth step 0..MAX_MAP_STEP; the pheromone payload and coordinates follow terrainSize(mapStep). */
  mapStep?: number;
  /** Optional (absent = ants.length): the highest number of ants ever alive; restored as max(saved, ants.length). */
  peakAnts?: number;
  /** Optional (absent = 0): normal mode sugar cooldown, speed boost end and spawn wait (sim time / seconds). */
  sugarReadyAt?: number;
  boostUntil?: number;
  spawnTimer?: number;
  /** Optional (absent / -1 = not drawn yet): seconds until the next red ant raid, so a reload does not restart the wait. */
  raidWait?: number;
  /** Optional (absent = none yet: created on the first normal-mode step): the spider. A caught ant carries `caughtT` (seconds stuck). */
  spider?: Spider;
  /** Optional (absent = no bush yet): the aphids bush (normal mode). */
  bush?: Bush;
  /** Optional (absent = none yet): the red ants' nest (normal mode) and who holds it. */
  redNest?: { x: number; y: number; owner: 'red' | 'black'; stock?: number };
}

/** Persistent fields of a food item only (the transient cooldown / hop / wanderT are left out). */
function foodToSave(f: FoodItem): FoodItem {
  const o: FoodItem = { id: f.id, kind: f.kind, x: f.x, y: f.y, piecesLeft: f.piecesLeft };
  if (f.alive !== undefined) o.alive = f.alive;
  if (f.touches !== undefined) o.touches = f.touches;
  if (f.heading !== undefined) o.heading = f.heading;
  if (f.corpseOf !== undefined) o.corpseOf = f.corpseOf;
  if (f.speedMul !== undefined) o.speedMul = f.speedMul;
  return o;
}

/** Persistent fields of an ant only (the transient steering state is left out). */
function antToSave(a: Ant): SaveV1['ants'][number] {
  const { strayT: _s, strayH: _sh, lostT: _l, lostH: _lh, weave: _w, carryLeaf: _cl, duelT: _d, ...rest } = a;
  return rest;
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
    peakStock: w.peakStock,
    peakLarvae: w.peakLarvae,
    started: w.started,
    nextId: w.nextId,
    introDone: extra.introDone,
    ants: w.ants.map(antToSave),
    food: w.food.map(foodToSave),
    pheromone: bytesToBase64(bytes),
    camera: { ...extra.camera },
    mode: w.mode,
    mapStep: w.mapStep,
    peakAnts: w.peakAnts,
    sugarReadyAt: w.sugarReadyAt,
    boostUntil: w.boostUntil,
    spawnTimer: w.spawnTimer,
    raidWait: w.raidWait,
    ...(w.bush ? { bush: { ...w.bush } } : {}),
    ...(w.redNest ? { redNest: { x: w.redNest.x, y: w.redNest.y, owner: w.redNest.owner, stock: w.redNest.stock ?? 0 } } : {}),
    ...(w.spider ? { spider: { x: w.spider.x, y: w.spider.y, alive: w.spider.alive, eatT: w.spider.eatT, respawnT: w.spider.respawnT, corner: w.spider.corner } } : {}),
  };
}

/** Throws if the pheromone payload does not match the world size. Validate with `validateSave` first. */
export function worldFromSave(s: SaveV1): World {
  const w = World.create(s.seed, s.mode ?? 'sandbox');
  w.growMapTo(s.mapStep ?? 0);
  const bytes = base64ToBytes(s.pheromone);
  if (bytes.length !== w.pher.data.length) throw new Error('Invalid save: pheromone size mismatch');
  w.rng.state = s.rngState;
  w.time = s.time;
  w.stock = s.stock;
  w.totalDelivered = s.totalDelivered ?? s.stock + s.ants.length * FOOD_PER_ANT;
  // Old saves (colony floor) may hold up to LEGACY_MAX_HATCH_PROGRESS seconds: clamp into the effective cycle range.
  w.hatchProgress = Math.max(0, Math.min(w.hatchInterval - STEP_S, s.hatchProgress));
  w.peakStock = Math.max(s.peakStock ?? 0, s.stock);
  w.peakLarvae = Math.max(s.peakLarvae ?? 0, w.larvae);
  w.started = s.started ?? (s.ants.length > 0 || s.time > 30);
  w.nextId = s.nextId;
  // Clamped to one full cooldown / boost from now, so a corrupt save cannot lock the sugar (or boost) forever.
  w.sugarReadyAt = Math.min(s.sugarReadyAt ?? 0, s.time + SUGAR_COOLDOWN_S);
  w.boostUntil = Math.min(s.boostUntil ?? 0, s.time + SUGAR_BOOST_S);
  w.spawnTimer = s.spawnTimer ?? 0;
  w.raidWait = s.raidWait ?? -1;
  w.ants.length = 0;
  for (const a of s.ants) {
    // `lifespan` was removed (ants no longer die of old age); old saves may still carry it: drop it.
    const { lifespan: _lifespan, ...rest } = a;
    const ant: Ant = {
      ...rest,
      timer: a.timer ?? 0,
      role: a.role ?? 'forager',
      speedMul: a.speedMul ?? 1,
      curiosity: a.curiosity ?? 1,
      stubbornness: a.stubbornness ?? 1,
    };
    if (ant.state === 'nest') ant.nestKind = a.nestKind ?? 'hatch';
    else delete ant.nestKind;
    w.ants.push(ant);
  }
  w.bush = s.bush ? { ...s.bush } : null;
  w.redNest = s.redNest ? { x: s.redNest.x, y: s.redNest.y, owner: s.redNest.owner, stock: s.redNest.stock ?? 0, trickleT: RED_TRICKLE_S } : null;
  // Without a living spider nobody can be stuck in a web.
  // Clamped to one full respawn from now, like the sugar clocks.
  w.spider = s.spider ? { ...s.spider, respawnT: Math.min(s.spider.respawnT, SPIDER_RESPAWN_S) } : null;
  // Ants inside the nest are never in the web either.
  for (const a of w.ants) if (!w.spider?.alive || a.state === 'nest') delete a.caughtT;
  w.peakAnts = Math.max(s.peakAnts ?? 0, w.ants.length);
  w.food.length = 0;
  for (const f of s.food) w.food.push(foodToSave(f));
  for (let i = 0; i < bytes.length; i++) w.pher.data[i] = (bytes[i] / 255) * MAX_PHEROMONE;
  return w;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => isNum(v) && Number.isInteger(v);
const inRange = (v: unknown, lo: number, hi: number): v is number => isNum(v) && v >= lo && v <= hi;
const ANT_STATES = ['wander', 'toFood', 'gnaw', 'carry', 'nest'];
const NEST_KINDS = ['hatch', 'unload', 'nurse'];
const ANT_ROLES = ['forager', 'nurse', 'guard'];
/** Saves from the old colony-floor rules stored up to 15 s here; they still load (clamped on restore). */
const LEGACY_MAX_HATCH_PROGRESS = 15;
const MAX_ENTRIES = 2000;
/** Accepted range of the personality traits and of a creature's speedMul in a save (generous: drawn values stay well inside). */
const TRAIT_MIN = 0.3;
const TRAIT_MAX = 3;
/** Largest piece count of any food kind (a loaded save may hold 0..max; old saves hold smaller numbers). */
const MAX_PIECES = Math.max(...Object.values(FOOD_TABLE).map((f) => f.pieces));

function validAnt(a: unknown, size: { w: number; h: number }): boolean {
  if (typeof a !== 'object' || a === null) return false;
  const o = a as Record<string, unknown>;
  return (
    isInt(o.id) && inRange(o.x, 0, size.w) && inRange(o.y, 0, size.h) && isNum(o.heading) &&
    isNum(o.age) && o.age >= 0 && isNum(o.carry) &&
    typeof o.state === 'string' && ANT_STATES.includes(o.state) &&
    (o.targetFood === null || isNum(o.targetFood)) &&
    (o.timer === undefined || (isNum(o.timer) && o.timer >= 0)) &&
    (o.nestKind === undefined || (typeof o.nestKind === 'string' && NEST_KINDS.includes(o.nestKind))) &&
    (o.role === undefined || (typeof o.role === 'string' && ANT_ROLES.includes(o.role))) &&
    (o.speedMul === undefined || inRange(o.speedMul, TRAIT_MIN, TRAIT_MAX)) &&
    (o.curiosity === undefined || inRange(o.curiosity, TRAIT_MIN, TRAIT_MAX)) &&
    (o.stubbornness === undefined || inRange(o.stubbornness, TRAIT_MIN, TRAIT_MAX)) &&
    (o.major === undefined || o.major === true) &&
    (o.superMajor === undefined || (o.superMajor === true && o.major === true)) &&
    (o.carrySugar === undefined || o.carrySugar === true) &&
    (o.caughtT === undefined || (isNum(o.caughtT) && o.caughtT >= 0))
  );
}

function validFood(f: unknown, size: { w: number; h: number }): boolean {
  if (typeof f !== 'object' || f === null) return false;
  const o = f as Record<string, unknown>;
  return (
    isInt(o.id) && inRange(o.x, 0, size.w) && inRange(o.y, 0, size.h) &&
    isInt(o.piecesLeft) && o.piecesLeft >= 0 && o.piecesLeft <= MAX_PIECES &&
    typeof o.kind === 'string' && Object.prototype.hasOwnProperty.call(FOOD_TABLE, o.kind) &&
    (o.alive === undefined || typeof o.alive === 'boolean') &&
    (o.touches === undefined || (isInt(o.touches) && o.touches >= 0 && o.touches <= 2)) &&
    (o.heading === undefined || isNum(o.heading)) &&
    (o.speedMul === undefined || inRange(o.speedMul, TRAIT_MIN, TRAIT_MAX)) &&
    (o.corpseOf === undefined || o.corpseOf === 'beetle' || o.corpseOf === 'fly' || o.corpseOf === 'caterpillar')
  );
}

function validSpider(sp: unknown, size: { w: number; h: number }): boolean {
  if (typeof sp !== 'object' || sp === null) return false;
  const o = sp as Record<string, unknown>;
  return (
    inRange(o.x, 0, size.w) && inRange(o.y, 0, size.h) && typeof o.alive === 'boolean' &&
    isNum(o.eatT) && o.eatT >= 0 && isNum(o.respawnT) && o.respawnT >= 0 && (o.corner === 0 || o.corner === 1)
  );
}

function validBush(b: unknown, size: { w: number; h: number }): boolean {
  if (typeof b !== 'object' || b === null) return false;
  const o = b as Record<string, unknown>;
  return inRange(o.x, 0, size.w) && inRange(o.y, 0, size.h) && isInt(o.aphids) && o.aphids >= 1 && o.aphids <= APHID_MAX && isNum(o.dropT) && o.dropT >= 0;
}

function validRedNest(n: unknown, size: { w: number; h: number }): boolean {
  if (typeof n !== 'object' || n === null) return false;
  const o = n as Record<string, unknown>;
  return inRange(o.x, 0, size.w) && inRange(o.y, 0, size.h) && (o.owner === 'red' || o.owner === 'black') && (o.stock === undefined || (isNum(o.stock) && o.stock >= 0));
}

function validPheromone(b64: string, size: { w: number; h: number }): boolean {
  try {
    return base64ToBytes(b64).length === size.w * size.h;
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
  for (const k of ['peakStock', 'peakLarvae'] as const) {
    if (o[k] !== undefined && (!isNum(o[k]) || (o[k] as number) < 0)) return null;
  }
  if (o.raidWait !== undefined && (!isNum(o.raidWait) || o.raidWait < -1)) return null;
  if (o.totalDelivered !== undefined && (!isNum(o.totalDelivered) || o.totalDelivered < 0)) return null;
  if (o.started !== undefined && typeof o.started !== 'boolean') return null;
  if (o.mode !== undefined && o.mode !== 'sandbox' && o.mode !== 'normal') return null;
  if (o.mapStep !== undefined && (!isInt(o.mapStep) || o.mapStep < 0 || o.mapStep > MAX_MAP_STEP)) return null;
  for (const k of ['peakAnts', 'sugarReadyAt', 'boostUntil', 'spawnTimer'] as const) {
    if (o[k] !== undefined && (!isNum(o[k]) || (o[k] as number) < 0)) return null;
  }
  const size = terrainSize((o.mapStep as number | undefined) ?? 0);
  if (o.spider !== undefined && !validSpider(o.spider, size)) return null;
  if (o.bush !== undefined && !validBush(o.bush, size)) return null;
  if (o.redNest !== undefined && !validRedNest(o.redNest, size)) return null;
  if (typeof o.introDone !== 'boolean' || typeof o.pheromone !== 'string') return null;
  const c = o.camera as Record<string, unknown> | null | undefined;
  if (typeof c !== 'object' || c === null || !isNum(c.x) || !isNum(c.y) || !isNum(c.zoom) || c.zoom <= 0) return null;
  if (!Array.isArray(o.ants) || o.ants.length > MAX_ENTRIES || !o.ants.every((a) => validAnt(a, size))) return null;
  if (!Array.isArray(o.food) || o.food.length > MAX_ENTRIES || !o.food.every((f) => validFood(f, size))) return null;
  for (const e of [...(o.ants as { id: number }[]), ...(o.food as { id: number }[])]) {
    if (e.id >= o.nextId) return null;
  }
  if (!validPheromone(o.pheromone, size)) return null;
  return x as SaveV1;
}
