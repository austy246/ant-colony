/**
 * The tutorial at the start of a new Normal game: a few cards, one after another, each with a short explanation and the part of
 * the screen it is about lit up. The game is paused while it is open (the caller gets told through onOpen / onClose).
 */

export interface TutorialStep {
  title: string;
  text: string;
  /** Finds the element to light up (null = nothing special). */
  target?: (root: HTMLElement) => HTMLElement | null;
}

const byText =
  (selector: string, starts: string) =>
  (root: HTMLElement): HTMLElement | null =>
    Array.from(root.querySelectorAll<HTMLElement>(selector)).find((e) => (e.textContent ?? '').startsWith(starts)) ?? null;

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    title: 'Vítej v kolonii',
    text: 'Jsi černá mravenčí kolonie. V režimu Normal můžeš zahynout, takže hlídej jídlo i nepřátele. Mravenci si hledají jídlo sami, ty jim pomáháš a rozhoduješ. Projdeme to rychle.',
  },
  {
    title: 'Jídlo a cukr',
    text: 'Mravenci najdou kořist, odnesou ji do hnízda a cestou nechají feromonovou stopu, po které jdou další. Tlačítkem Cukr hodíš na mapu sladkou odměnu (chvíli se pak obnovuje); po cukru se kolonie na chvíli zrychlí.',
    target: byText('button', 'Cukr'),
  },
  {
    title: 'Návnada a Zákaz',
    text: 'Návnada je silná feromonová stopa: mravenci půjdou za ní. Zákaz je místo, kterému se na chvíli vyhnou, třeba kolem pavouka. Obojí zapneš tlačítkem a klikneš na mapu.',
    target: byText('button', 'Návnada'),
  },
  {
    title: 'Hnízdo a podzemí',
    text: 'Královna líhne nové mravence za jídlo. Klávesou U (nebo tlačítkem Podzemí) se podíváš do hnízda: uvidíš komory, larvy a spíže. Po odemčení ve výzkumu (uzel Houbové zahrady) tam jde za jídlo vykopat houbovou zahradu, která jídlo sama vyrábí.',
    target: byText('button', 'Podzemí'),
  },
  {
    title: 'Červení mravenci',
    text: 'Od určité velikosti kolonie se objeví hnízdo červených mravenců. Čas od času vyrazí na nálet (v liště se objeví odpočet) a stříkají kyselinu. Proti nim mohou hlídat strážci: posuvník nastavuje, kolik mravenců hlídá místo sbírání.',
    target: (root) => root.querySelector<HTMLElement>('.work-panel input[type="range"]'),
  },
  {
    title: 'Výzkum',
    text: 'Za donesené jídlo, zabité červené, objevování mapy a čas získáváš zkušenost. Tlačítko Výzkum otevře kruhový strom vylepšení: čím dál od středu, tím dražší. Vybírej, nemůžeš koupit všechno.',
    target: byText('.work-panel button', 'Výzkum'),
  },
  {
    title: 'Druhé hnízdo a roční období',
    text: 'Za 30 jídla postavíš druhé hnízdo daleko od prvního (tlačítko Hnízdo, pak klik do mapy). Rok má čtyři období: v zimě je jídla málo a mravenci pomalejší, déšť smývá stopy.',
    target: byText('button', 'Hnízdo'),
  },
  {
    title: 'Jeden mravenec',
    text: 'Klikni na mravence: zezelená. Pak klikni kamkoli na mapu a on tam dojde, i přes celou mapu. Takhle mu můžeš ukázat jídlo nebo směr. Dalším kliknutím na něj ho pustíš.',
  },
  {
    title: 'Hodně štěstí',
    text: 'Hra se ukládá sama. Vlevo nahoře jde lišta sbalit tlačítkem Zavřít. Hudbu a efekty vypneš vpravo nahoře. Ať kolonie přežije co nejdéle!',
  },
];

const SEEN_KEY = 'ant-colony-tutorial-seen';

/** True when the player asked not to see the tutorial again. */
export function tutorialDismissed(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Shows the tutorial over `root` (the game's UI layer); `ui` is searched for the parts to light up. Returns a function that closes it.
 * `onClose` is called once when it is closed any way (finished, skipped, or by the returned function).
 */
export function showTutorial(root: HTMLElement, opts: { steps?: readonly TutorialStep[]; onClose?: () => void } = {}): () => void {
  const steps = opts.steps ?? TUTORIAL_STEPS;
  let i = 0;
  let lit: HTMLElement | null = null;
  const card = document.createElement('div');
  card.className = 'tutorial';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-labelledby', 'tutorial-title');
  const count = document.createElement('div');
  count.className = 'tutorial-count';
  const title = document.createElement('div');
  title.className = 'tutorial-title';
  title.id = 'tutorial-title';
  const text = document.createElement('div');
  text.className = 'tutorial-text';
  const buttons = document.createElement('div');
  buttons.className = 'tutorial-buttons';
  const mk = (label: string): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    return b;
  };
  const back = mk('Zpět');
  const next = mk('Další');
  const skip = mk('Přeskočit');
  const never = mk('Příště nezobrazovat');
  never.className = 'tutorial-never';
  buttons.append(back, next, skip);
  card.append(count, title, text, buttons, never);
  root.appendChild(card);

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    lit?.classList.remove('tutorial-hl');
    card.remove();
    opts.onClose?.();
  };
  const render = (): void => {
    const s = steps[i];
    count.textContent = `${i + 1} / ${steps.length}`;
    title.textContent = s.title;
    text.textContent = s.text;
    back.disabled = i === 0;
    next.textContent = i === steps.length - 1 ? 'Hotovo' : 'Další';
    lit?.classList.remove('tutorial-hl');
    lit = s.target ? s.target(root) : null;
    lit?.classList.add('tutorial-hl');
  };
  back.addEventListener('click', () => {
    if (i > 0) {
      i--;
      render();
    }
  });
  next.addEventListener('click', () => {
    if (i >= steps.length - 1) close();
    else {
      i++;
      render();
    }
  });
  skip.addEventListener('click', close);
  never.addEventListener('click', () => {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* best effort */
    }
    close();
  });
  render();
  next.focus();
  return close;
}
