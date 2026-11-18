/**
 * The ant collection ("Mravenci"): an inventory of cards, one for every ant of the colony, with ten rarities. Browse it page by page,
 * sort by rarity, click a card for its detail and keep the ant in the terrarium (safe from everything, at most TERRARIUM_MAX) or let it out again.
 * Only for collecting: it changes nothing in the game except that a stored ant is out of the colony until it is released.
 */
import { formatTime } from '../records';
import { antKind, antRarity, RARITY_NAMES, type CardAnt } from '../sim/collection';
import { TERRARIUM_MAX } from '../sim/constants';
import type { World } from '../sim/world';

/** Colour of the frame (and of the eyes) of each rarity, from grey to gold; the cosmic one is violet and Rainbow cycles through all colours (see the style sheet). */
export const RARITY_COLORS = ['#8a8a82', '#a89f7c', '#7fae6a', '#5aa6a0', '#5b8fd6', '#9a6fd0', '#d06fc0', '#e8a23a', '#e8583a', '#ffd84a', '#b04dff', '#ff3a3a'] as const;

export const PAGE_SIZE = 24;

export interface Card {
  ant: CardAnt;
  rarity: number;
  stored: boolean;
}

/** Left half (the last column is the middle) of the ant's head seen from the front; the other half is its mirror image. */
const HEAD_HALF = [
  'JJ.......',
  '.JJ......',
  '..J......',
  '...J.....',
  '....BBBBB',
  '...BBBHHH',
  '..BBBBBHH',
  '.BBBBBBBB',
  '.BEEEBBBB',
  '.BEEeBBBB',
  '.BBEEBBBB',
  '..BBBBSSS',
  '...BBJBBB',
  '....JJJ..',
  '.....JJ..',
  '......J..',
];
export const HEAD_ROWS = HEAD_HALF.map((r) => r + r.slice(0, 8).split('').reverse().join(''));
export const HEAD_W = HEAD_ROWS[0].length;
export const HEAD_H = HEAD_ROWS.length;
const HEAD_COLORS: Record<string, string> = { J: '#7a5a3a', B: '#241a12', H: '#4e3d2e', S: '#3a2c20', e: '#ffffff' };

/** The ant's head peeking out over the top edge of its card, its eyes glowing in the colour of the rarity (a bigger ant has a bigger head). */
function peekingHead(rarity: number, scale: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = HEAD_W * scale;
  cv.height = HEAD_H * scale;
  cv.className = 'ac-head-art';
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = cv.getContext('2d');
  } catch {
    ctx = null;
  }
  if (!ctx) return cv;
  for (let y = 0; y < HEAD_H; y++) {
    for (let x = 0; x < HEAD_W; x++) {
      const ch = HEAD_ROWS[y][x];
      if (ch === '.') continue;
      ctx.fillStyle = ch === 'E' ? RARITY_COLORS[rarity] : HEAD_COLORS[ch];
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return cv;
}

function portrait(card: Card, big: boolean): HTMLElement {
  const box = document.createElement('div');
  box.className = 'ac-portrait';
  box.style.background = `radial-gradient(circle at 50% 30%, ${RARITY_COLORS[card.rarity]}66, #2a2016 78%)`;
  // a bigger ant peeks out with a bigger head
  const base = card.ant.superMajor ? 7 : card.ant.major ? 6 : 5;
  const head = peekingHead(card.rarity, big ? base + 2 : base);
  if (card.ant.superMajor) head.classList.add('ac-super');
  box.appendChild(head);
  return box;
}

export function cardElement(card: Card, big: boolean): HTMLElement {
  const el = document.createElement('div');
  el.className = 'ac-card' + (big ? ' ac-big' : '');
  el.style.setProperty('--rar', RARITY_COLORS[card.rarity]);
  el.dataset.rarity = String(card.rarity);
  el.appendChild(portrait(card, big));
  const rar = document.createElement('div');
  rar.className = 'ac-rarity';
  rar.textContent = `${RARITY_NAMES[card.rarity]} · ${antKind(card.ant)}`;
  el.append(rar);
  if (big) {
    const stats = document.createElement('div');
    stats.className = 'ac-stats';
    const pct = (v: number): string => `${Math.round(v * 100)} %`;
    for (const [k, v] of [
      ['Věk', formatTime(card.ant.age)],
      ['Rychlost', pct(card.ant.speedMul)],
      ['Zvědavost', pct(card.ant.curiosity)],
      ['Vytrvalost', pct(card.ant.stubbornness)],
    ] as const) {
      const row = document.createElement('div');
      row.textContent = `${k}: ${v}`;
      stats.appendChild(row);
    }
    el.appendChild(stats);
  }
  return el;
}

/** The cards of the colony (stored = false) or of the terrarium (stored = true), in id order, or from the rarest to the poorest. */
export function cardsOf(world: World, stored: boolean, byRarity: boolean): Card[] {
  const seed = world.terrain.seed;
  const list: CardAnt[] = stored ? world.terrarium : world.ants;
  const cards = list.map((ant) => ({ ant, rarity: antRarity(seed, ant), stored }));
  cards.sort((a, b) => (byRarity && a.rarity !== b.rarity ? b.rarity - a.rarity : a.ant.id - b.ant.id));
  return cards;
}

/** Opens the collection over `root`; returns a function that closes it (a second call while open does nothing). */
export function openAntCollection(root: HTMLElement, world: World): () => void {
  const open = root.querySelector<HTMLElement>('.ac-overlay');
  if (open) return () => open.remove();
  const overlay = document.createElement('div');
  overlay.className = 'ac-overlay';
  const win = document.createElement('div');
  win.className = 'ac-window';
  win.setAttribute('role', 'dialog');
  win.setAttribute('aria-label', 'Mravenci');
  overlay.appendChild(win);
  root.appendChild(overlay);

  let showStored = false;
  let byRarity = false;
  let page = 0;
  let detail: Card | null = null;
  let message = '';

  const button = (label: string, onClick: () => void, cls = ''): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    if (cls) b.className = cls;
    b.addEventListener('click', onClick);
    return b;
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      if (detail) {
        detail = null;
        render();
      } else close();
    }
  };
  function close(): void {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
  }
  document.addEventListener('keydown', onKey, true);

  function render(): void {
    win.replaceChildren();
    const head = document.createElement('div');
    head.className = 'ac-head';
    const title = document.createElement('div');
    title.className = 'ac-title';
    title.textContent = 'Mravenci';
    head.appendChild(title);
    head.appendChild(
      button(
        `Kolonie (${world.ants.length})`,
        () => {
          showStored = false;
          page = 0;
          detail = null;
          message = '';
          render();
        },
        showStored ? '' : 'on',
      ),
    );
    head.appendChild(
      button(
        `Terárium (${world.terrarium.length}/${TERRARIUM_MAX})`,
        () => {
          showStored = true;
          page = 0;
          detail = null;
          message = '';
          render();
        },
        showStored ? 'on' : '',
      ),
    );
    head.appendChild(
      button(
        'Nejvzácnější',
        () => {
          byRarity = !byRarity;
          page = 0;
          render();
        },
        byRarity ? 'on ac-sort' : 'ac-sort',
      ),
    );
    head.appendChild(button('Zavřít', close, 'ac-close'));
    win.appendChild(head);

    if (detail) {
      renderDetail(detail);
      return;
    }
    const cards = cardsOf(world, showStored, byRarity);
    const pages = Math.max(1, Math.ceil(cards.length / PAGE_SIZE));
    page = Math.min(page, pages - 1);
    const grid = document.createElement('div');
    grid.className = 'ac-grid';
    if (cards.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ac-empty';
      empty.textContent = showStored ? 'Terárium je prázdné. Otevři kartu mravence a dej ho uschovat.' : 'V kolonii nejsou žádní mravenci.';
      grid.appendChild(empty);
    }
    for (const card of cards.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
      const el = cardElement(card, false);
      el.tabIndex = 0;
      const pick = (): void => {
        detail = card;
        message = '';
        render();
      };
      el.addEventListener('click', pick);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') pick();
      });
      grid.appendChild(el);
    }
    win.appendChild(grid);
    const nav = document.createElement('div');
    nav.className = 'ac-nav';
    const prev = button('‹', () => {
      page = Math.max(0, page - 1);
      render();
    });
    prev.disabled = page === 0;
    const next = button('›', () => {
      page = Math.min(pages - 1, page + 1);
      render();
    });
    next.disabled = page >= pages - 1;
    const info = document.createElement('span');
    info.className = 'ac-page';
    info.textContent = `Strana ${page + 1} / ${pages}`;
    nav.append(prev, info, next);
    win.appendChild(nav);
  }

  function renderDetail(card: Card): void {
    const box = document.createElement('div');
    box.className = 'ac-detail';
    box.appendChild(cardElement(card, true));
    const side = document.createElement('div');
    side.className = 'ac-actions';
    const msg = document.createElement('div');
    msg.className = 'ac-msg';
    msg.textContent = message;
    if (card.stored) {
      side.appendChild(
        button('Vypustit do kolonie', () => {
          if (world.releaseAnt(card.ant.id)) {
            detail = null;
            message = '';
          } else message = 'Kolonie je plná, mravence nejde vypustit.';
          render();
        }),
      );
    } else {
      side.appendChild(
        button('Uschovat', () => {
          if (world.storeAnt(card.ant.id)) {
            detail = null;
            message = '';
          } else if (world.terrarium.length >= TERRARIUM_MAX) message = `Terárium je plné (${TERRARIUM_MAX}).`;
          else {
            message = 'Tohoto mravence se nepodařilo uschovat (už není nebo zrovna bojuje).';
            if (!world.ants.some((a) => a.id === card.ant.id)) detail = null;
          }
          render();
        }),
      );
    }
    side.appendChild(
      button('Zpět', () => {
        detail = null;
        message = '';
        render();
      }),
    );
    side.appendChild(msg);
    box.appendChild(side);
    win.appendChild(box);
  }

  render();
  return close;
}
