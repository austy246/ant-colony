/**
 * The ant collection ("Mravenci"): every ant has a card with a name and one of ten rarities. It is only for collecting and has
 * no effect on the game: name and rarity are worked out from the ant's id and the world's seed (the same after a reload), nothing is saved
 * for them and no random numbers of the simulation are used.
 */

export const RARITY_NAMES = ['Obyčejný', 'Běžný', 'Neobvyklý', 'Zajímavý', 'Vzácný', 'Výjimečný', 'Epický', 'Legendární', 'Mýtický', 'Božský'] as const;

/** Chance (in thousandths) of each rarity for an ordinary worker; sums to 1000. */
const RARITY_WEIGHTS = [300, 230, 160, 110, 80, 55, 35, 20, 8, 2];

const FIRST = [
  'Anežka', 'Barbora', 'Čeněk', 'Dalibor', 'Eliška', 'Filip', 'Gustav', 'Hana', 'Ivo', 'Jarmila', 'Karel', 'Lenka', 'Matěj', 'Nora', 'Ondřej', 'Pavla',
  'Quido', 'Radek', 'Štěpán', 'Tereza', 'Ulrich', 'Vendula', 'Viktor', 'Xenie', 'Yvona', 'Zdeněk', 'Adam', 'Bětka', 'Cyril', 'Dana', 'Emil', 'Fanda',
  'Gita', 'Honza', 'Irena', 'Jakub', 'Klára', 'Libor', 'Mája', 'Naďa',
];
const EPITHET = [
  'Rychlonohý', 'Zvědavý', 'Statečný', 'Věčný hladovec', 'Tichý', 'Nosič', 'Průzkumník', 'Hlídač', 'Snílek', 'Ostrá čelist', 'Šikovný', 'Zlatý čich',
  'Silák', 'Poutník', 'Šplhal', 'Prašivý', 'Dobrosrdečný', 'Žvanil', 'Opatrný', 'Odvážný', 'Spáč', 'Cukrář', 'Stopař', 'Skromný', 'Hrbáč', 'Černý blesk',
  'Vytrvalec', 'Kapitán', 'Nenasyta', 'Hrabal', 'Šprt', 'Svéhlavý',
];

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

/** Rarity 0 (the poorest) .. 9 (the best): drawn from the id and seed; a major is two ranks higher, a super major four (at most 9). */
export function antRarity(seed: number, ant: Pick<CardAnt, 'id' | 'major' | 'superMajor'>): number {
  const u = (hash(seed | 0, ant.id) % 1000) | 0;
  let acc = 0;
  let r = RARITY_WEIGHTS.length - 1;
  for (let i = 0; i < RARITY_WEIGHTS.length; i++) {
    acc += RARITY_WEIGHTS[i];
    if (u < acc) {
      r = i;
      break;
    }
  }
  return Math.min(RARITY_NAMES.length - 1, r + (ant.superMajor ? 4 : ant.major ? 2 : 0));
}

/** The ant's name, from its id and the seed ("Honza Zlatý čich"). */
export function antName(seed: number, id: number): string {
  const h = hash(seed | 0, id + 7919);
  return `${FIRST[h % FIRST.length]} ${EPITHET[Math.floor(h / FIRST.length) % EPITHET.length]}`;
}

export function antKind(ant: Pick<CardAnt, 'major' | 'superMajor'>): string {
  return ant.superMajor ? 'Super major' : ant.major ? 'Major' : 'Dělnice';
}
