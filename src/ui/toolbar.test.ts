// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildToolbar, TOOL_BUTTONS, VIEW_BUTTONS } from './toolbar';
import type { Tool } from './input';

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
});

const buttons = () => Array.from(root.querySelectorAll('button'));
const key = (k: string, target: EventTarget = document, o: KeyboardEventInit = {}) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...o }));

describe('buildToolbar', () => {
  it('has the exact Czech labels in order', () => {
    buildToolbar(root, () => {}, () => {});
    expect(buttons().map((b) => b.textContent)).toEqual([
      'Brouk', 'Housenka', 'Moucha', 'Zdechlina', 'Malina', 'Houba',
      'Přesunout', 'Smazat', 'Posun',
      'Běžný (1)', 'Feromony (P)', 'Terén (T)', 'Podzemí (U)',
    ]);
    expect(TOOL_BUTTONS).toHaveLength(9);
    expect(VIEW_BUTTONS.map((v) => v.view)).toEqual(['normal', 'pheromone', 'terrain', 'underground']);
    expect(root.querySelector('div.toolbar')).not.toBeNull();
    expect(buttons().every((b) => b.type === 'button')).toBe(true);
  });

  it('exactly one active tool, initially beetle, onTool called once initially', () => {
    const onTool = vi.fn();
    buildToolbar(root, onTool, () => {});
    expect(onTool).toHaveBeenCalledTimes(1);
    expect(onTool).toHaveBeenCalledWith({ kind: 'place', food: 'beetle' });
    const act = buttons().slice(0, 9).filter((b) => b.classList.contains('active'));
    expect(act.map((b) => b.textContent)).toEqual(['Brouk']);
  });

  it('clicking a tool changes active and calls onTool', () => {
    const tools: Tool[] = [];
    buildToolbar(root, (t) => tools.push(t), () => {});
    buttons().find((b) => b.textContent === 'Smazat')!.click();
    expect(tools.at(-1)).toEqual({ kind: 'delete' });
    const act = buttons().slice(0, 9).filter((b) => b.classList.contains('active'));
    expect(act.map((b) => b.textContent)).toEqual(['Smazat']);
  });

  it('clicking a view calls onView and highlights', () => {
    const onView = vi.fn();
    buildToolbar(root, () => {}, onView);
    buttons().find((b) => b.textContent === 'Terén (T)')!.click();
    expect(onView).toHaveBeenCalledWith('terrain');
    expect(buttons().find((b) => b.textContent === 'Terén (T)')!.classList.contains('active')).toBe(true);
  });

  it('keys 1/p/t/u trigger views, case-insensitive', () => {
    const onView = vi.fn();
    buildToolbar(root, () => {}, onView);
    key('p');
    key('T');
    key('1');
    key('u');
    key('U');
    expect(onView.mock.calls.map((c) => c[0])).toEqual(['pheromone', 'terrain', 'normal', 'underground', 'underground']);
  });

  it('keys are ignored in inputs and with modifiers', () => {
    const onView = vi.fn();
    buildToolbar(root, () => {}, onView);
    const inp = document.createElement('input');
    document.body.appendChild(inp);
    key('p', inp);
    key('p', document, { ctrlKey: true });
    key('t', document, { metaKey: true });
    key('1', document, { altKey: true });
    expect(onView).not.toHaveBeenCalled();
  });

  it('disposer removes element and listener', () => {
    const onView = vi.fn();
    const dispose = buildToolbar(root, () => {}, onView);
    dispose();
    expect(root.querySelector('.toolbar')).toBeNull();
    key('p');
    expect(onView).not.toHaveBeenCalled();
  });
});

describe('view shortcuts on a Czech keyboard layout', () => {
  const activeView = () => buttons().slice(9).filter((b) => b.classList.contains('active')).map((b) => b.textContent);
  it('matches by physical key code when e.key is a layout character', () => {
    const onView = vi.fn();
    buildToolbar(root, () => {}, onView);
    key('+', document, { code: 'Digit1' });
    expect(onView).toHaveBeenLastCalledWith('normal');
    key('z', document, { code: 'KeyP' });
    expect(onView).toHaveBeenLastCalledWith('pheromone');
    expect(activeView()).toEqual(['Feromony (P)']);
    key('ž', document, { code: 'KeyT' });
    expect(onView).toHaveBeenLastCalledWith('terrain');
    key('+', document, { code: 'Numpad1' });
    expect(onView).toHaveBeenLastCalledWith('normal');
  });
  it('still ignores modifiers and input targets', () => {
    const onView = vi.fn();
    buildToolbar(root, () => {}, onView);
    onView.mockClear();
    key('+', document, { code: 'Digit1', ctrlKey: true });
    const input = document.createElement('input');
    root.appendChild(input);
    key('+', input, { code: 'Digit1' });
    expect(onView).not.toHaveBeenCalled();
  });
});

describe('underground view button', () => {
  const tools = () => buttons().slice(0, 9);
  const activeView = () => buttons().slice(9).filter((b) => b.classList.contains('active')).map((b) => b.textContent);

  it('KeyU works on any keyboard layout and highlights the button', () => {
    const onView = vi.fn();
    buildToolbar(root, () => {}, onView);
    key('ů', document, { code: 'KeyU' });
    expect(onView).toHaveBeenLastCalledWith('underground');
    expect(activeView()).toEqual(['Podzemí (U)']);
  });

  it('clicking it calls onView and disables the prey and tool buttons (still visible)', () => {
    const onView = vi.fn();
    buildToolbar(root, () => {}, onView);
    expect(tools().some((b) => b.classList.contains('disabled'))).toBe(false);
    buttons().find((b) => b.textContent === 'Podzemí (U)')!.click();
    expect(onView).toHaveBeenLastCalledWith('underground');
    expect(tools().every((b) => b.classList.contains('disabled'))).toBe(true);
    expect(root.querySelector('.toolbar')!.classList.contains('underground')).toBe(true);
  });

  it('any surface view enables the tools again and the selected tool stays selected', () => {
    buildToolbar(root, () => {}, () => {});
    buttons().find((b) => b.textContent === 'Smazat')!.click();
    key('u');
    key('p');
    expect(tools().some((b) => b.classList.contains('disabled'))).toBe(false);
    expect(root.querySelector('.toolbar')!.classList.contains('underground')).toBe(false);
    expect(tools().filter((b) => b.classList.contains('active')).map((b) => b.textContent)).toEqual(['Smazat']);
    expect(activeView()).toEqual(['Feromony (P)']);
  });

  it('clicks on a disabled tool button are ignored', () => {
    const onTool = vi.fn();
    buildToolbar(root, onTool, () => {});
    onTool.mockClear();
    key('u');
    buttons().find((b) => b.textContent === 'Houba')!.click();
    expect(onTool).not.toHaveBeenCalled();
  });
});

describe('buildToolbar normal mode', () => {
  it('has only Cukr and the four view buttons', () => {
    buildToolbar(root, () => {}, () => {}, { mode: 'normal', sugarLeft: () => 0 });
    expect(buttons().map((b) => b.textContent)).toEqual([
      'Cukr', 'Běžný (1)', 'Feromony (P)', 'Terén (T)', 'Podzemí (U)',
    ]);
  });

  it('Cukr button is disabled and shows the countdown while sugarLeft > 0', () => {
    let left = 75;
    const tools: Tool[] = [];
    buildToolbar(root, (t) => tools.push(t), () => {}, { mode: 'normal', sugarLeft: () => left });
    const cukr = buttons()[0];
    expect(cukr.textContent).toBe('Cukr (1:15)');
    expect(cukr.classList.contains('disabled')).toBe(true);
    cukr.click();
    expect(tools.some((t) => t.kind === 'sugar')).toBe(false);
    left = 0;
    vi.useFakeTimers();
    try {
      document.body.innerHTML = '';
      root = document.createElement('div');
      document.body.appendChild(root);
      buildToolbar(root, (t) => tools.push(t), () => {}, { mode: 'normal', sugarLeft: () => left });
      expect(buttons()[0].textContent).toBe('Cukr');
      expect(buttons()[0].classList.contains('disabled')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('placing sugar returns the active tool to pan', () => {
    vi.useFakeTimers();
    try {
      let left = 0;
      const tools: Tool[] = [];
      const cleanup = buildToolbar(root, (t) => tools.push(t), () => {}, { mode: 'normal', sugarLeft: () => left });
      buttons()[0].click();
      expect(tools.at(-1)).toEqual({ kind: 'sugar' });
      expect(buttons()[0].classList.contains('active')).toBe(true);
      left = 90;
      vi.advanceTimersByTime(600);
      expect(tools.at(-1)).toEqual({ kind: 'pan' });
      expect(buttons()[0].classList.contains('active')).toBe(false);
      expect(buttons()[0].textContent).toBe('Cukr (1:30)');
      cleanup();
    } finally {
      vi.useRealTimers();
    }
  });

  it('cleanup stops the refresh timer', () => {
    vi.useFakeTimers();
    try {
      const cleanup = buildToolbar(root, () => {}, () => {}, { mode: 'normal', sugarLeft: () => 0 });
      cleanup();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
