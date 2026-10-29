import type { FoodItem } from '../sim/food';
import { FINE } from './fine';
import {
  BEETLE_DIRS,
  BEETLE_FRAMES,
  beetlePixels,
  CATERPILLAR_CORPSE_DIRS,
  CATERPILLAR_DIRS,
  CATERPILLAR_FRAMES,
  caterpillarPixels,
  deadBeetlePixels,
  deadCaterpillarPixels,
  deadFlyPixels,
  FLY_DIRS,
  FLY_POSES,
  flyHopPose,
  flyIdlePose,
  flyLift,
  flyPixels,
  flyShadowPixels,
  PREY_CENTER,
  PREY_SIZE,
  preyDirection,
  puffFrame,
} from './preyAnim';
import { drawFood, type Ctx2D } from './sprites';
import type { CanvasFactory, CanvasLike } from './terrainRender';

/** Snaps a world coordinate to the fine grid (half art pixels). */
const snap = (v: number): number => Math.round(v * FINE) / FINE;

function toCanvas(make: CanvasFactory, px: Uint8ClampedArray): CanvasLike {
  const cv = make(PREY_SIZE, PREY_SIZE);
  const ctx = cv.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(PREY_SIZE, PREY_SIZE);
    img.data.set(px);
    ctx.putImageData(img, 0, 0);
  }
  return cv;
}

/**
 * Pre-rendered living-prey sprites: every variant is built once (lazily, per group, on first use) into a small
 * offscreen canvas through the injectable canvas factory.
 */
export class PreySprites {
  private beetles: CanvasLike[] | null = null;
  private flies: CanvasLike[] | null = null;
  private shadow: CanvasLike | null = null;
  private deadBeetles: CanvasLike[] | null = null;
  private deadFlies: CanvasLike[] | null = null;
  private caterpillars: CanvasLike[] | null = null;
  private deadCaterpillars: CanvasLike[] | null = null;

  constructor(private make: CanvasFactory) {}

  beetle(dir: number, frame: number): CanvasLike {
    if (!this.beetles) {
      this.beetles = [];
      for (let d = 0; d < BEETLE_DIRS; d++) for (let f = 0; f < BEETLE_FRAMES; f++) this.beetles.push(toCanvas(this.make, beetlePixels(d, f)));
    }
    return this.beetles[dir * BEETLE_FRAMES + frame];
  }

  fly(dir: number, pose: number): CanvasLike {
    if (!this.flies) {
      this.flies = [];
      for (let d = 0; d < FLY_DIRS; d++) for (let p = 0; p < FLY_POSES; p++) this.flies.push(toCanvas(this.make, flyPixels(d, p)));
      this.shadow = toCanvas(this.make, flyShadowPixels());
    }
    return this.flies[dir * FLY_POSES + pose];
  }

  flyShadow(): CanvasLike {
    this.fly(0, 0);
    return this.shadow as CanvasLike;
  }

  /** Living caterpillar: 16 directions x 4 wave frames x {calm, fleeing}, built together on first use. */
  caterpillar(dir: number, frame: number, flee: boolean): CanvasLike {
    if (!this.caterpillars) {
      this.caterpillars = [];
      for (const fl of [false, true]) {
        for (let d = 0; d < CATERPILLAR_DIRS; d++) {
          for (let f = 0; f < CATERPILLAR_FRAMES; f++) this.caterpillars.push(toCanvas(this.make, caterpillarPixels(d, f, fl)));
        }
      }
    }
    return this.caterpillars[((flee ? CATERPILLAR_DIRS : 0) + dir) * CATERPILLAR_FRAMES + frame];
  }

  deadCaterpillar(dir: number): CanvasLike {
    this.deadCaterpillars ??= Array.from({ length: CATERPILLAR_CORPSE_DIRS }, (_, d) => toCanvas(this.make, deadCaterpillarPixels(d)));
    return this.deadCaterpillars[dir];
  }

  deadBeetle(dir: number): CanvasLike {
    this.deadBeetles ??= Array.from({ length: FLY_DIRS }, (_, d) => toCanvas(this.make, deadBeetlePixels(d)));
    return this.deadBeetles[dir];
  }

  deadFly(dir: number): CanvasLike {
    this.deadFlies ??= Array.from({ length: FLY_DIRS }, (_, d) => toCanvas(this.make, deadFlyPixels(d)));
    return this.deadFlies[dir];
  }
}

/** One pre-rendered prey sprite with a single drawImage at the (snapped) world position, smoothing off. */
function blitPrey(c: Ctx2D, cv: CanvasLike, x: number, y: number): void {
  if (c.imageSmoothingEnabled) c.imageSmoothingEnabled = false;
  c.drawImage(cv as unknown as CanvasImageSource, snap(x) - PREY_CENTER / FINE, snap(y) - PREY_CENTER / FINE, PREY_SIZE / FINE, PREY_SIZE / FINE);
}

/** A living prey creature as the renderer sees it: beetle, fly or caterpillar (independent of which kinds the simulation lets live). */
export const isLiving = (f: FoodItem): boolean => f.alive === true && (f.kind === 'beetle' || f.kind === 'fly' || f.kind === 'caterpillar');

/** Fleeing = a living caterpillar with seconds of flight left (a transient simulation field). */
export const isFleeing = (f: FoodItem): boolean => f.kind === 'caterpillar' && ((f as FoodItem & { fleeT?: number }).fleeT ?? 0) > 0;

/** True while a fly is in the air (drawn in a second pass, over everything else). */
export const isHopping = (f: FoodItem): boolean => f.hop !== undefined && isLiving(f);

/**
 * Draws one food item: living beetle or caterpillar (walking sprite, `beetleFrame` = gait / wave frame from the renderer's stride state), living fly (idle
 * fidget or airborne with the lift applied and its shadow left on the ground), corpses of those two, and every other
 * kind through the static sprites. `time` is the simulation time (drives the fly's fidget).
 */
export function drawPreyItem(c: Ctx2D, spr: PreySprites, f: FoodItem, beetleFrame: number, time: number): void {
  if (isLiving(f)) {
    if (f.kind === 'beetle') {
      blitPrey(c, spr.beetle(preyDirection(f.heading, BEETLE_DIRS), beetleFrame), f.x, f.y);
    } else if (f.kind === 'caterpillar') {
      blitPrey(c, spr.caterpillar(preyDirection(f.heading, CATERPILLAR_DIRS), beetleFrame, isFleeing(f)), f.x, f.y);
    } else {
      const dir = preyDirection(f.heading, FLY_DIRS);
      blitPrey(c, spr.flyShadow(), f.x, f.y);
      if (f.hop) {
        const u = f.hop.dur > 0 ? f.hop.t / f.hop.dur : 0;
        blitPrey(c, spr.fly(dir, flyHopPose(f.hop.t)), f.x, f.y - flyLift(u));
      } else {
        blitPrey(c, spr.fly(dir, flyIdlePose(time, f.id)), f.x, f.y);
      }
    }
    return;
  }
  if (f.kind === 'carrion' && f.corpseOf) {
    const dir = preyDirection(f.heading, FLY_DIRS);
    const corpse: string = f.corpseOf;
    blitPrey(c, corpse === 'beetle' ? spr.deadBeetle(dir) : corpse === 'caterpillar' ? spr.deadCaterpillar(dir) : spr.deadFly(dir), f.x, f.y);
    return;
  }
  drawFood(c, f.kind, f.x, f.y);
}

/** Dust puff offsets per frame in fine px (module constants, nothing allocated per draw): x, y, size. */
const PUFF: readonly (readonly (readonly [number, number, number])[])[] = [
  [[-1, -1, 3], [-4, 1, 2], [3, 0, 2], [0, 3, 2], [-2, -4, 2]],
  [[-6, -2, 2], [5, -1, 2], [-3, 5, 2], [4, 4, 2], [-1, -7, 2], [1, 7, 1]],
  [[-9, -3, 1], [8, -2, 1], [-5, 8, 1], [7, 7, 1], [-1, -10, 1], [2, 10, 1]],
];
const PUFF_ALPHA = [0.85, 0.6, 0.35];

/** Tiny 3-frame puff of dust at the place an ant was killed; `age` in seconds (nothing is drawn once it is over). */
export function drawPuff(c: Ctx2D, x: number, y: number, age: number): void {
  const k = puffFrame(age);
  if (k < 0) return;
  c.save();
  c.translate(snap(x), snap(y));
  c.scale(1 / FINE, 1 / FINE);
  c.globalAlpha = PUFF_ALPHA[k];
  c.fillStyle = '#c9b48a';
  for (const [dx, dy, s] of PUFF[k]) c.fillRect(dx, dy, s, s);
  c.restore();
}
