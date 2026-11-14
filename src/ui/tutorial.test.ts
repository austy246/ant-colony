// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { showTutorial, TUTORIAL_STEPS, tutorialDismissed } from './tutorial';

let root: HTMLElement;
beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="ui"><button>Cukr</button><button>Podzemí (U)</button></div>';
  root = document.getElementById('ui')!;
});

describe('tutorial', () => {
  it('has a title and a text for every step', () => {
    expect(TUTORIAL_STEPS.length).toBeGreaterThanOrEqual(6);
    for (const s of TUTORIAL_STEPS) {
      expect(s.title.length).toBeGreaterThan(2);
      expect(s.text.length).toBeGreaterThan(20);
    }
  });

  it('goes through the steps with Dalsi/Zpet, lights up the target and closes once on Hotovo', () => {
    const onClose = vi.fn();
    showTutorial(root, { onClose });
    const card = root.querySelector('.tutorial')!;
    const btn = (t: string): HTMLButtonElement => Array.from(card.querySelectorAll('button')).find((b) => b.textContent === t)!;
    expect(card.querySelector('.tutorial-count')?.textContent).toBe(`1 / ${TUTORIAL_STEPS.length}`);
    expect(btn('Zpět').disabled).toBe(true);
    btn('Další').click(); // step 2: Cukr is lit
    expect(card.querySelector('.tutorial-title')?.textContent).toBe(TUTORIAL_STEPS[1].title);
    expect(root.querySelector('.tutorial-hl')?.textContent).toBe('Cukr');
    btn('Zpět').click();
    expect(root.querySelector('.tutorial-hl')).toBeNull();
    for (let k = 0; k < TUTORIAL_STEPS.length - 1; k++) btn('Další').click();
    expect(btn('Hotovo')).toBeTruthy();
    btn('Hotovo').click();
    expect(root.querySelector('.tutorial')).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Preskocit closes it, and "Priste nezobrazovat" closes it and is remembered', () => {
    const onClose = vi.fn();
    showTutorial(root, { onClose });
    (Array.from(root.querySelectorAll('button')).find((b) => b.textContent === 'Přeskočit') as HTMLButtonElement).click();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(tutorialDismissed()).toBe(false);
    showTutorial(root, { onClose });
    (Array.from(root.querySelectorAll('button')).find((b) => b.textContent === 'Příště nezobrazovat') as HTMLButtonElement).click();
    expect(tutorialDismissed()).toBe(true);
    expect(root.querySelector('.tutorial')).toBeNull();
  });
});
