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
      'Běžný (1)', 'Feromony (P)', 'Terén (T)',
    ]);
    expect(TOOL_BUTTONS).toHaveLength(9);
    expect(VIEW_BUTTONS.map((v) => v.view)).toEqual(['normal', 'pheromone', 'terrain']);
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

  it('keys 1/p/t trigger views, case-insensitive', () => {
    const onView = vi.fn();
    buildToolbar(root, () => {}, onView);
    key('p');
    key('T');
    key('1');
    expect(onView.mock.calls.map((c) => c[0])).toEqual(['pheromone', 'terrain', 'normal']);
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
