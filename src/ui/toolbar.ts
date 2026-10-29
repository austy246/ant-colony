import type { Tool } from './input';

export type ViewName = 'normal' | 'pheromone' | 'terrain';

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
];

function makeButton(label: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  return b;
}

export function buildToolbar(
  root: HTMLElement,
  onTool: (t: Tool) => void,
  onView: (v: ViewName) => void,
): () => void {
  const bar = document.createElement('div');
  bar.className = 'toolbar';

  const toolEls = TOOL_BUTTONS.map(({ label, tool }) => {
    const b = makeButton(label);
    b.addEventListener('click', () => selectTool(b, tool));
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
    onView(view);
  }

  const onKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const k = e.key.toLowerCase();
    const idx = VIEW_BUTTONS.findIndex((v) => v.key === k);
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
