/**
 * The ant collection ("Mravenci"): every ant has a card with one of twelve rarities, worked out from the ant's id and the world's seed (the same
 * after a reload; no random numbers of the simulation are used). A better rarity makes a better ant: the world multiplies its speed, curiosity
 * and stubbornness by rarityBonus() once, when the ant is born (or, for an older save, when it is first loaded).
 */
import { RARITY_STAT_STEP, WHEEL_LUCK } from './constants';

export const RARITY_NAMES = ['Obyčejný', 'Běžný', 'Neobvyklý', 'Zajímavý', 'Vzácný', 'Výjimečný', 'Epický', 'Legendární', 'Mýtický', 'Božský', 'Kosmický', 'Rainbow'] as const;

/** Chance (in hundred-thousandths) of each rarity; sums to 100000. Božský is about 1 in 2000, Kosmický 1 in 5000 and Rainbow 1 in 20000. */
const RARITY_WEIGHTS = [36145, 27000, 17000, 9500, 5000, 2800, 1500, 700, 280, 50, 20, 5];

/** What the collection needs to know about an ant (living ants and stored ones both fit). */
export interface CardAnt {
  id: number;
  age: number;
  major?: true;
  superMajor?: true;
  speedMul: number;
  curiosity: number;
  stubbornness: number;
}

/** An ant kept safe in the terrarium: only what its card shows (it takes no part in the game until it is let out). */
export type StoredAnt = CardAnt;

/** 32-bit mixing of two integers into a well-spread unsigned integer. */
function hash(a: number, b: number): number {
  let h = (a ^ Math.imul(b | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Rarity 0 (the poorest) .. 11 (Rainbow, the best): drawn from the id and seed alone (a major has no advantage). */
export function antRarity(seed: number, ant: { id: number }): number {
  const u = hash(seed | 0, ant.id) % 100000;
  let acc = 0;
  let r = RARITY_WEIGHTS.length - 1;
  for (let i = 0; i < RARITY_WEIGHTS.length; i++) {
    acc += RARITY_WEIGHTS[i];
    if (u < acc) {
      r = i;
      break;
    }
  }
  return r;
}

/** The wheel of fortune: the chance of each rarity (summing to 1), the ordinary chances flattened by the power WHEEL_LUCK. */
export function wheelChances(): number[] {
  const w = RARITY_WEIGHTS.map((x) => Math.pow(x, WHEEL_LUCK));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / sum);
}

/** The rarity the n-th spin of the wheel lands on (from the seed and n alone: no random numbers of the simulation). */
export function wheelRarity(seed: number, n: number): number {
  const u = (hash(seed | 0, 0x5eed + n * 31) % 1000000) / 1000000;
  const chances = wheelChances();
  let acc = 0;
  for (let i = 0; i < chances.length; i++) {
    acc += chances[i];
    if (u < acc) return i;
  }
  return chances.length - 1;
}

/** The first id from `from` on (looking at most `limit` ids ahead) whose ant would have `rarity`; null if there is none that far. */
export function idWithRarity(seed: number, from: number, rarity: number, limit = 400000): number | null {
  for (let id = from; id < from + limit; id++) if (antRarity(seed, { id }) === rarity) return id;
  return null;
}

/** The factor a rarity gives to speed, curiosity and stubbornness: 1 for Obyčejný, +RARITY_STAT_STEP per rank. */
export function rarityBonus(rarity: number): number {
  return 1 + RARITY_STAT_STEP * rarity;
}

export function antKind(ant: Pick<CardAnt, 'major' | 'superMajor'>): string {
  return ant.superMajor ? 'Super major' : ant.major ? 'Major' : 'Dělnice';
}
