import type { Tool } from './input';

export type ViewName = 'normal' | 'pheromone' | 'terrain' | 'underground';

export const TOOL_BUTTONS: { label: string; tool: Tool }[] = [
  { label: 'Brouk', tool: { kind: 'place', food: 'beetle' } },
  { label: 'Housenka', tool: { kind: 'place', food: 'caterpillar' } },
  { label: 'Moucha', tool: { kind: 'place', food: 'fly' } },
  { label: 'Zdechlina', tool: { kind: 'place', food: 'carrion' } },
  { label: 'Malina', tool: { kind: 'place', food: 'berry' } },
  { label: 'Houba', tool: { kind: 'place', food: 'mushroom' } },
  { label: 'Přesunout', tool: { kind: 'move' } },
  { label: 'Smazat', tool: { kind: 'delete' } },
  { label: 'Posun', tool: { kind: 'pan' } },
];

export const VIEW_BUTTONS: { label: string; view: ViewName; key: string }[] = [
  { label: 'Běžný (1)', view: 'normal', key: '1' },
  { label: 'Feromony (P)', view: 'pheromone', key: 'p' },
  { label: 'Terén (T)', view: 'terrain', key: 't' },
  { label: 'Podzemí (U)', view: 'underground', key: 'u' },
];

function makeButton(label: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  return b;
}

/** Physical key -> view shortcut key, independent of the keyboard layout. */
const CODE_TO_KEY: Record<string, string> = { Digit1: '1', Numpad1: '1', KeyP: 'p', KeyT: 't', KeyU: 'u' };

export function buildToolbar(
  root: HTMLElement,
  onTool: (t: Tool) => void,
  onView: (v: ViewName) => void,
): () => void {
  const bar = document.createElement('div');
  bar.className = 'toolbar';

  const toolEls = TOOL_BUTTONS.map(({ label, tool }) => {
    const b = makeButton(label);
    b.addEventListener('click', () => {
      if (!b.classList.contains('disabled')) selectTool(b, tool);
    });
    bar.appendChild(b);
    return b;
  });

  const sep = document.createElement('span');
  sep.className = 'sep';
  bar.appendChild(sep);

  const viewEls = VIEW_BUTTONS.map(({ label, view }) => {
    const b = makeButton(label);
    b.addEventListener('click', () => selectView(b, view));
    bar.appendChild(b);
    return b;
  });

  function selectTool(el: HTMLButtonElement, tool: Tool): void {
    for (const b of toolEls) b.classList.toggle('active', b === el);
    onTool(tool);
  }

  function selectView(el: HTMLButtonElement, view: ViewName): void {
    for (const b of viewEls) b.classList.toggle('active', b === el);
    // underground there is no map to place prey on: the tool buttons stay visible but dimmed and inert
    const under = view === 'underground';
    bar.classList.toggle('underground', under);
    for (const b of toolEls) b.classList.toggle('disabled', under);
    onView(view);
  }

  const onKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    // `code` is layout independent (on a Czech keyboard unshifted digits give "+ěščř"), so check it as well as `key`.
    const k = e.key.toLowerCase();
    const byCode = CODE_TO_KEY[e.code];
    const idx = VIEW_BUTTONS.findIndex((v) => v.key === k || (byCode !== undefined && v.key === byCode));
    if (idx >= 0) selectView(viewEls[idx], VIEW_BUTTONS[idx].view);
  };
  document.addEventListener('keydown', onKey);

  root.appendChild(bar);
  viewEls[0].classList.add('active');
  selectTool(toolEls[0], TOOL_BUTTONS[0].tool);

  return () => {
    document.removeEventListener('keydown', onKey);
    bar.remove();
  };
}
