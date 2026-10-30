import type { FoodKind } from '../sim/food';
import { hash2, Raster, type SpriteGroup } from './raster';

/** Soft shadow colour (down-right of every object). */
const SH = 'rgba(10,6,3,.38)';

export interface Sprite {
  groups: SpriteGroup[];
}

/** Sprite canvas: 72 x 56 fine px, local (0, 0) in the middle; the final anchor is the opaque bounding-box centre. */
const newR = (): Raster => new Raster(72, 56, 36, 28);

type LensCb = (ix: number, iy: number, u: number, v: number, e: number) => void;

/**
 * Pointed oval ("lens") of half length L and half width Wd rotated by `ang`; calls cb for every pixel inside with
 * (u along the axis, v across, e = distance to the edge).
 */
function eachInLens(cx: number, cy: number, L: number, Wd: number, ang: number, cb: LensCb, pow = 1.7): void {
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const ext = Math.ceil(Math.max(L, Wd)) + 1;
  for (let iy = Math.floor(cy) - ext; iy <= Math.ceil(cy) + ext; iy++) {
    for (let ix = Math.floor(cx) - ext; ix <= Math.ceil(cx) + ext; ix++) {
      const dx = ix + 0.5 - cx;
      const dy = iy + 0.5 - cy;
      const u = dx * ca + dy * sa;
      const v = -dx * sa + dy * ca;
      if (Math.abs(u) > L) continue;
      const hw = Wd * (1 - Math.pow(Math.abs(u) / L, pow));
      if (Math.abs(v) <= hw) cb(ix, iy, u, v, hw - Math.abs(v));
    }
  }
}

function toSprite(R: Raster): Sprite {
  return { groups: R.toRuns() };
}

// ---------------------------------------------------------------------------------------------------------------------
// Beetle: shiny green-black ground beetle, about 24 x 16 fine px, facing right.
// ---------------------------------------------------------------------------------------------------------------------
const BEETLE = ['#0b1512', '#14201b', '#1f3a2f', '#2d5446', '#3f7461'];

function buildBeetle(): Sprite {
  const R = newR();
  R.ell(2, 3, 13.5, 8, SH);
  // Six jointed legs (femur out, tibia hooking back), drawn first so the shell overlaps them.
  const LEG = '#0b130f';
  for (const s of [-1, 1]) {
    for (const [xi, k] of [
      [5, 1],
      [0, 0],
      [-6, -1],
    ] as const) {
      const kx = xi + k * 2 + 1;
      R.line(xi, s * 4, kx, s * 9, LEG);
      R.line(kx, s * 9, xi + k * 5 + 2, s * 7, LEG);
      R.px(kx, s * 9, '#26382f');
      R.px(xi + k * 5 + 2, s * 7 + s, LEG);
    }
  }
  // Elytra: dome with grainy metallic shading.
  R.dome(-3, 0, 10.5, 7.2, BEETLE, { jitter: 0.1, seed: 11, bias: 0.02 });
  // Seam and striae (dark dashes parallel to the seam).
  for (let x = -13; x <= 6; x++) {
    R.px(x, 0, '#0a1511');
    if ((x + 20) % 3 !== 0) {
      R.px(x, -4, '#0d1a15', 0.85);
      R.px(x, 3, '#0d1a15', 0.85);
    }
  }
  // Shine.
  R.ell(-7, -4.5, 3.4, 1.3, '#8fc9b2', 0.75);
  R.px(-9, -4.5, '#e6f6ee');
  R.px(-8, -4.5, '#e6f6ee');
  R.px(-5, -2.5, '#6aa78f');
  R.px(5, 3, '#2f5a4a');
  // Pronotum (the plate behind the head).
  R.dome(7, 0, 4.4, 5.4, ['#08100d', '#101b16', '#1a2f26', '#26443a'], { jitter: 0.08, seed: 5 });
  R.px(5, -3, '#4f8a74');
  // Head with eyes and mandibles.
  R.dome(12.5, 0, 3.4, 3.4, ['#060b09', '#0d1612', '#16241e', '#203a30'], { seed: 3 });
  R.px(13, -2, '#d6e2dc');
  R.px(13, 1, '#d6e2dc');
  R.px(14, -2, '#030504');
  R.px(14, 1, '#030504');
  R.line(15, -1, 17, -2, '#0b130f');
  R.line(15, 0, 17, 1, '#0b130f');
  // Antennae with club ends.
  R.line(14, -3, 17, -6, '#0b130f');
  R.line(17, -6, 20, -6, '#0b130f');
  R.px(20, -7, '#1a2a23');
  R.px(21, -6, '#1a2a23');
  R.line(14, 3, 17, 6, '#0b130f');
  R.line(17, 6, 20, 6, '#0b130f');
  R.px(20, 6, '#1a2a23');
  R.px(21, 6, '#1a2a23');
  return toSprite(R);
}

// ---------------------------------------------------------------------------------------------------------------------
// Caterpillar: 7 stripy green segments with tiny feet, brown head with eyes, facing left.
// ---------------------------------------------------------------------------------------------------------------------
const CAT = ['#3a5a1a', '#4f7022', '#79a93a', '#8fc24a', '#c5e58a'];

function buildCaterpillar(): Sprite {
  const R = newR();
  const seg = (i: number): { x: number; y: number } => ({ x: i * 6, y: Math.round(Math.sin(i * 0.8) * 2.6) });
  for (let i = 0; i < 7; i++) {
    const p = seg(i);
    R.ell(p.x + 2, p.y + 3.5, 5.6, 3.8, SH);
  }
  for (let i = 6; i >= 0; i--) {
    const { x, y } = seg(i);
    // Tiny feet (two pairs of dark dots on the underside).
    R.px(x - 2, y + 5, '#2c4212');
    R.px(x - 2, y + 6, '#2c4212');
    R.px(x + 2, y + 5, '#2c4212');
    R.px(x + 2, y + 6, '#2c4212');
    R.dome(x, y, 5.6, 5.2, CAT, { bias: i % 2 ? -0.04 : 0.06, jitter: 0.06, seed: 20 + i });
    // Segment crease on the head-side edge and a dorsal highlight stripe.
    R.eachInEllipse(x, y, 5.6, 5.2, (ix, iy, nx, ny) => {
      if (nx < -0.74 && Math.abs(ny) < 0.85) R.px(ix, iy, '#3a5a1a', 0.85);
    });
    R.px(x - 1, y - 4, '#d9f0a0');
    R.px(x, y - 4, '#d9f0a0');
    R.px(x + 1, y - 3, '#b4d870');
    if (i % 3 === 1) {
      R.px(x, y, '#f0e27a');
      R.px(x + 1, y, '#f0e27a');
    }
    R.px(x + 2, y + 2, '#2c4212');
  }
  // Head.
  const hx = -7;
  R.ell(hx + 2, 3.5, 4.8, 3.6, SH);
  R.dome(hx, 0, 4.6, 4.4, ['#3a1f0c', '#5a3416', '#7a4a22', '#9a6130', '#b57a44'], { seed: 7, jitter: 0.06 });
  R.px(hx - 3, -1, '#14100c');
  R.px(hx - 3, 0, '#14100c');
  R.px(hx - 3, 2, '#14100c');
  R.px(hx - 3, 3, '#14100c');
  R.px(hx - 3, -2, '#f2ede0');
  R.px(hx - 3, 1, '#f2ede0');
  R.px(hx - 5, 1, '#2a1a0c');
  R.px(hx - 5, 2, '#2a1a0c');
  R.line(hx - 2, -4, hx - 4, -6, '#2a1a0c');
  R.line(hx + 1, -4, hx, -6, '#2a1a0c');
  return toSprite(R);
}

// ---------------------------------------------------------------------------------------------------------------------
// Fly: red-eyed grey fly with veined translucent wings and bristly legs, facing right.
// ---------------------------------------------------------------------------------------------------------------------
const FLY = ['#0f1214', '#1c1f22', '#2b3033', '#3e4549', '#5b6165'];

function buildFly(): Sprite {
  const R = newR();
  R.ell(3, 4, 10, 5.5, SH);
  // Legs: thin, jointed, with a bristle pixel at the knee.
  const LEG = '#16181a';
  for (const s of [-1, 1]) {
    for (const [xi, k] of [
      [4, 1],
      [0, 0],
      [-4, -1],
    ] as const) {
      const kx = xi + k * 3;
      R.line(xi, s * 3, kx, s * 7, LEG);
      R.line(kx, s * 7, kx + k * 3 + 1, s * 9, LEG);
      R.px(kx + 1, s * 7, '#3e4549');
      R.px(kx - 1, s * 8, LEG);
    }
  }
  // Wings (behind the body): translucent, outlined, with veins.
  for (const s of [-1, 1]) {
    const ang = Math.atan2(s * 0.64, -0.76);
    eachInLens(-8, s * 8, 8.2, 3.5, ang, (ix, iy, u, v, e) => {
      let col = 'rgba(214,232,246,.40)';
      if (e < 0.95) col = 'rgba(140,160,176,.8)';
      else if (Math.abs(v) < 0.5) col = 'rgba(120,142,158,.8)'; // main vein
      else if (Math.abs(Math.abs(v) - 1.7) < 0.5 && u > -4 && u < 3) col = 'rgba(130,150,165,.6)';
      else if (u > 1 && u < 4 && v * s < -0.4) col = 'rgba(250,253,255,.55)'; // sheen
      R.px(ix, iy, col);
    });
  }
  // Abdomen with dark bands.
  R.dome(-6, 0, 6.6, 4.8, FLY, { jitter: 0.1, seed: 31, bias: -0.04 });
  for (const bx of [-9, -5, -2]) for (let y = -3; y <= 3; y++) R.px(bx, y, '#0a0c0d', 0.75);
  R.px(-8, -3, '#7b8288');
  R.px(-7, -3, '#7b8288');
  // Thorax with two dark stripes.
  R.dome(1.5, 0, 4.8, 4.4, FLY, { jitter: 0.1, seed: 32, bias: 0.04 });
  for (let x = -1; x <= 4; x++) {
    R.px(x, -1, '#16191b', 0.8);
    R.px(x, 1, '#16191b', 0.8);
  }
  R.px(0, -3, '#8d949a');
  R.px(1, -3, '#8d949a');
  // Head with big red eyes.
  R.dome(7, 0, 3.2, 3.6, ['#0f1214', '#1c1f22', '#2b3033', '#3e4549'], { seed: 33 });
  for (const s of [-1, 1]) {
    R.dome(7.5, s * 2.6, 2.3, 2.0, ['#4a0c0c', '#7a1414', '#a02a2a', '#c04545'], { seed: 34, jitter: 0.1 });
  }
  R.px(7, -4, '#f2a0a0');
  R.px(7, 1, '#f2a0a0');
  R.px(10, 0, '#16181a'); // proboscis tip
  R.px(11, 0, '#16181a');
  return toSprite(R);
}

// ---------------------------------------------------------------------------------------------------------------------
// Carrion: a dead, dried-out beetle lying on its back with curled legs, grey-brown, head to the right.
// ---------------------------------------------------------------------------------------------------------------------
function buildCarrion(): Sprite {
  const R = newR();
  R.ell(2, 4, 16, 9.5, SH);
  // Legs curled up over the belly: femur out, tibia curling back in; lit joints so they read against the soil.
  const LEG = '#5a4a38';
  for (const s of [-1, 1]) {
    for (const [xi, k] of [
      [5, 1],
      [-1, 0],
      [-7, -1],
    ] as const) {
      const kx = xi + k * 4 + (k === 0 ? 1 : 0);
      R.line(xi, s * 6, kx, s * 11, LEG, 2);
      R.line(kx, s * 11, kx + k * 3 - 1, s * 12, LEG);
      R.line(kx + k * 3 - 1, s * 12, kx + k * 2 - 3, s * 9, LEG);
      R.px(kx - 1, s * 10, '#8a7656');
      R.px(kx + k * 2 - 3, s * 9, '#2a2219');
      R.px(kx + 1, s * 11 + s, '#2a2219', 0.8);
    }
  }
  // Belly (underside): clean ridged plates.
  R.dome(-2, 0, 12.5, 8.6, ['#3b3226', '#4f4234', '#6a5a46', '#857158', '#a89476'], { jitter: 0.07, seed: 41, bias: -0.1 });
  for (const bx of [-9, -5, -1, 3, 7]) {
    for (let y = -7; y <= 7; y++) {
      const edge = Math.abs(y) / 7.5;
      const px = bx + Math.round(edge * edge * (bx < -1 ? -2 : 2));
      R.px(px, y, '#2a2219', 0.85);
      R.px(px + 1, y, '#a08a6a', 0.5);
    }
  }
  for (let x = -12; x <= 10; x++) R.px(x, 0, '#2a2219', 0.6); // central keel
  R.px(-8, -6, '#b8a484');
  R.px(-7, -6, '#b8a484');
  R.px(-6, -6, '#b8a484', 0.7);
  // Dry mould specks.
  for (const [mx, my] of [
    [-4, 3],
    [3, -3],
    [-9, 2],
  ]) {
    R.px(mx, my, '#c4bda0', 0.85);
  }
  // Head with mandibles and limp antennae.
  R.dome(13.5, 0, 3.8, 3.8, ['#241d14', '#3b3226', '#4f4234', '#6a5a46'], { seed: 42 });
  R.line(16, -2, 19, -3, '#241d14');
  R.line(16, 2, 19, 3, '#241d14');
  R.line(15, -4, 18, -7, '#5a4a38');
  R.line(18, -7, 21, -6, '#5a4a38');
  R.line(15, 4, 18, 7, '#5a4a38');
  R.line(18, 7, 21, 8, '#5a4a38');
  R.px(14, -1, '#14100c');
  R.px(14, 1, '#14100c');
  return toSprite(R);
}

// ---------------------------------------------------------------------------------------------------------------------
// Berry: a cluster of seven raspberries with highlights and a serrated leaf.
// ---------------------------------------------------------------------------------------------------------------------
const BERRY_PTS: [number, number][] = [
  [0, 0],
  [6, -2],
  [-6, -2],
  [2, 6],
  [-4, 6],
  [8, 4],
  [0, -6],
];
const BERRY = ['#5a0c18', '#8a1226', '#a81830', '#cf2a45', '#e8566c'];
const LEAF = ['#2b4a18', '#3d6023', '#4f7a2e', '#68964a'];

function buildBerry(): Sprite {
  const R = newR();
  R.ell(2, 4, 12, 7, SH);
  // Leaf behind the berries, with a serrated edge, midrib and veins.
  eachInLens(-9, -8, 8, 3.6, -0.6, (ix, iy, u, v, e) => {
    const serr = e < 1.1 && ((ix + iy) & 1) === 0 && Math.abs(u) < 6;
    if (serr) return;
    let col = v < -0.3 ? LEAF[2] : LEAF[1];
    if (Math.abs(v) < 0.5) col = LEAF[3];
    else if (e > 1 && (Math.floor((Math.abs(u) + Math.abs(v)) / 2.2) & 1) === 0 && Math.abs(v) > 0.8) col = LEAF[0];
    if (e < 1.0) col = v < 0 ? LEAF[3] : LEAF[0];
    R.px(ix, iy, col);
  });
  R.line(-5, -6, -1, -3, '#2b4a18'); // stalk
  const order = [...BERRY_PTS].sort((p, q) => p[1] - q[1]);
  for (const [bx, by] of order) {
    R.ell(bx + 1, by + 1.5, 4.3, 4.3, 'rgba(40,0,10,.45)');
    R.dome(bx, by, 4.2, 4.2, BERRY, { bias: 0.02 });
    // Drupelet texture.
    R.eachInEllipse(bx, by, 4.2, 4.2, (ix, iy) => {
      if ((ix + iy * 2) % 4 === 0 && hash2(ix, iy, 9) < 0.6) R.px(ix, iy, '#7a1022', 0.55);
    });
    R.px(bx - 2, by - 2, '#f9a8b4');
    R.px(bx - 1, by - 3, '#ffd5da');
  }
  return toSprite(R);
}

// ---------------------------------------------------------------------------------------------------------------------
// Mushroom: a chunk of brown cap with cream gills, a pale stem and spots.
// ---------------------------------------------------------------------------------------------------------------------
const CAP = ['#4a2a12', '#6b4222', '#8a5a2c', '#b0773a', '#cf9a58'];

function buildMushroom(): Sprite {
  const R = newR();
  R.ell(2, 5, 14, 5, SH);
  // Stem with soil at the foot.
  R.dome(0, 4, 3.4, 6.4, ['#a8987a', '#c4b594', '#eadfc3', '#fff8e6'], { jitter: 0.05, seed: 51, bias: -0.05 });
  for (let y = 0; y < 9; y += 3) R.px(-2, y + 1, '#a8987a', 0.8);
  for (const [sx, sy] of [
    [-5, 10],
    [4, 10],
    [-3, 11],
    [2, 11],
    [6, 9],
  ]) {
    R.px(sx, sy, '#4a3524');
    R.px(sx + 1, sy, '#3e2c1d');
  }
  // Cap.
  R.dome(0, -2, 12.5, 7.6, CAP, { jitter: 0.08, seed: 52, bias: 0.0 });
  // Gills strip under the lower rim.
  R.eachInEllipse(0, -2, 12.5, 7.6, (ix, iy, _nx, ny) => {
    if (ny > 0.55) {
      const col = ((ix + 40) & 1) === 0 ? '#b79c68' : '#e3d3a8';
      R.px(ix, iy, ny > 0.82 ? '#8a7048' : col);
    }
  });
  // Spots (little warts with a lit corner) and a shine.
  for (const [sx, sy, r] of [
    [-6, -4, 1.6],
    [-1, -7, 1.3],
    [5, -4, 1.7],
    [8, -1, 1.2],
    [-9, -1, 1.1],
    [2, -2, 1.2],
  ] as const) {
    R.ell(sx, sy, r, r * 0.8, '#f0e0c0');
    R.px(sx - 1, sy - 1, '#fffaf0');
    R.px(sx + 1, sy, '#c4a878', 0.6);
  }
  R.px(-8, -5, '#e8b87a');
  R.px(-7, -6, '#e8b87a');
  R.px(-6, -7, '#e8b87a');
  return toSprite(R);
}

// ---------------------------------------------------------------------------------------------------------------------
// Sugar: a small white cube (front face, shaded right side, light top) with a tiny highlight.
// ---------------------------------------------------------------------------------------------------------------------
const SUGAR = '#f2efe6';
const SUGAR_SHADE = '#cfc9b8';

function buildSugar(): Sprite {
  const R = newR();
  R.ell(2, 5, 8, 3.2, SH);
  R.rect(-5, -3, 8, 8, SUGAR); // front face
  R.rect(3, -3, 3, 8, SUGAR_SHADE); // right side
  R.rect(-5, 4, 11, 1, SUGAR_SHADE); // lower edge
  R.rect(-4, -5, 9, 2, '#fbf9f2'); // top face
  R.rect(5, -5, 1, 2, SUGAR_SHADE);
  R.px(-4, -2, '#ffffff'); // highlight
  R.px(-3, -2, '#ffffff');
  R.px(-1, 1, SUGAR_SHADE, 0.6); // grain
  R.px(1, 2, SUGAR_SHADE, 0.6);
  return toSprite(R);
}

// ---------------------------------------------------------------------------------------------------------------------
// Leaf: a green leaf with a pale midrib and a darker rim, lying slightly tilted. (Drawn smaller as it is eaten, see drawPreyItem.)
// ---------------------------------------------------------------------------------------------------------------------
function buildLeaf(): Sprite {
  const R = newR();
  R.ell(2, 4, 11, 4, SH);
  eachInLens(0, 0, 14, 8, -0.4, (ix, iy, _u, v, e) => {
    R.px(ix, iy, Math.abs(v) < 0.8 ? '#b3c96a' : e < 1.2 ? '#2f5a22' : (ix + iy) & 1 ? '#4c8a34' : '#5a9a3c');
  });
  return toSprite(R);
}

// ---------------------------------------------------------------------------------------------------------------------
// Honeydew: a glossy amber droplet.
// ---------------------------------------------------------------------------------------------------------------------
function buildHoneydew(): Sprite {
  const R = newR();
  R.ell(2, 4, 7, 3, SH);
  R.dome(0, 0, 6, 5, ['#8a5a14', '#b3801f', '#d8a63a', '#f0c860', '#fbe6a0']);
  R.px(-2, -2, '#fff7d6');
  R.px(-1, -2, '#fff7d6');
  return toSprite(R);
}

// ---------------------------------------------------------------------------------------------------------------------
// Dead red ant: a small red-brown body lying on its side with curled legs.
// ---------------------------------------------------------------------------------------------------------------------
function buildRedAnt(): Sprite {
  const R = newR();
  R.ell(2, 3, 8, 3, SH);
  for (const [x, k] of [[-3, -1], [0, 0], [3, 1]] as const) {
    R.line(x, -2, x + k, -5, '#4a0c08');
    R.line(x, 2, x - k, 5, '#4a0c08');
  }
  R.ell(-5, 0, 2.6, 2.2, '#8a1c10');
  R.ell(0, 0, 3, 2.4, '#b8321c');
  R.ell(6, 0, 3.6, 2.8, '#6e140c');
  R.px(-1, -1, '#d8583a');
  R.px(-6, -1, '#e8e0c8');
  return toSprite(R);
}

const BUILDERS: Record<FoodKind, () => Sprite> = {
  beetle: buildBeetle,
  caterpillar: buildCaterpillar,
  fly: buildFly,
  carrion: buildCarrion,
  berry: buildBerry,
  mushroom: buildMushroom,
  sugar: buildSugar,
  leaf: buildLeaf,
  honeydew: buildHoneydew,
  redant: buildRedAnt,
};

const cache = new Map<FoodKind, Sprite>();

/** Prey sprite on the fine grid (built once, then drawn as colour-grouped fillRects). */
export function preySprite(kind: FoodKind): Sprite {
  let s = cache.get(kind);
  if (!s) {
    s = BUILDERS[kind]();
    cache.set(kind, s);
  }
  return s;
}

// ---------------------------------------------------------------------------------------------------------------------
// Queen: about 3x the worker (44 x 26 fine px), fully black with subtle highlights, facing right.
// ---------------------------------------------------------------------------------------------------------------------
const QUEEN = ['#0e0a07', '#1a1410', '#241a12', '#3a2c20', '#4e3d2e'];

function buildQueen(): Sprite {
  const R = newR();
  R.ell(2, 5, 24, 8, SH);
  // Six jointed legs, 2 px thick at the femur.
  for (const s of [-1, 1]) {
    for (const [xi, k] of [
      [8, 1],
      [4, 0],
      [0, -1],
    ] as const) {
      const kx = xi + k * 4 + (k === 0 ? 2 : 0);
      const L1 = '#1a1410';
      R.line(xi, s * 4, kx, s * 10, L1, 2);
      R.line(kx, s * 10, kx + k * 6 + 1, s * 12, L1);
      R.line(kx + 1, s * 10, kx + k * 6 + 2, s * 12, L1);
      R.px(kx + k * 6 + 2, s * 13, '#0e0a07');
      R.px(kx, s * 10 - 1, '#3a2c20');
    }
  }
  // Gaster (abdomen) with segment bands.
  R.dome(-12, 0, 10.2, 7.6, QUEEN, { jitter: 0.06, seed: 61, bias: -0.1 });
  for (const bx of [-17, -12, -7]) {
    for (let y = -6; y <= 6; y++) {
      const edge = Math.abs(y) / 7;
      R.px(bx + Math.round(edge * edge * -1.5), y, '#0a0705', 0.8);
    }
  }
  R.px(-16, -5, '#5f4d3b');
  R.px(-15, -5, '#5f4d3b');
  R.px(-14, -6, '#4e3d2e');
  // Petiole node.
  R.dome(-1.5, 0, 2.4, 2.8, QUEEN, { bias: -0.1 });
  // Thorax with a faint sheen.
  R.dome(5.5, 0, 6.6, 5.4, QUEEN, { jitter: 0.04, seed: 62, bias: -0.1 });
  R.px(3, -3, '#4e3d2e');
  R.px(4, -3, '#4e3d2e');
  R.px(2, -2, '#3a2c20');
  // Head with dark-grey eyes, mandibles, antennae.
  R.dome(16, 0, 5, 4.6, QUEEN, { jitter: 0.04, seed: 63, bias: -0.08 });
  R.px(17, -3, '#6a5a48');
  R.px(17, -2, '#3a2c20');
  R.px(17, 2, '#3a2c20');
  R.px(17, 3, '#4e3d2e');
  R.line(20, -2, 24, -1, '#1a1410', 2);
  R.line(20, 2, 24, 1, '#1a1410', 2);
  R.line(19, -4, 23, -8, '#1a1410');
  R.line(23, -8, 28, -7, '#1a1410');
  R.line(19, 4, 23, 8, '#1a1410');
  R.line(23, 8, 28, 7, '#1a1410');
  return toSprite(R);
}

let queen: Sprite | null = null;
export function queenSprite(): Sprite {
  queen ??= buildQueen();
  return queen;
}
