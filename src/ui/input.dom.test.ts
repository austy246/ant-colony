// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '../sim/world';
import { Surface } from '../sim/terrain';
import { Camera } from './camera';
import { Input, type Tool } from './input';

function ptr(
  type: string,
  x: number,
  y: number,
  o: { id?: number; button?: number; pointerType?: string } = {},
): MouseEvent {
  const e = new MouseEvent(type, { clientX: x, clientY: y, button: o.button ?? 0, bubbles: true, cancelable: true });
  Object.defineProperty(e, 'pointerId', { value: o.id ?? 1 });
  Object.defineProperty(e, 'pointerType', { value: o.pointerType ?? 'mouse' });
  return e;
}

let canvas: HTMLCanvasElement;
let camera: Camera;
let world: World;
let tool: Tool;
let input: Input;

beforeEach(() => {
  canvas = document.createElement('canvas');
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  canvas.setPointerCapture = () => {};
  canvas.releasePointerCapture = () => {};
  camera = new Camera(800, 600);
  camera.zoom = 4;
  camera.x = 160;
  camera.y = 100;
  world = World.create(7);
  world.food.length = 0;
  tool = { kind: 'place', food: 'berry' };
  input = new Input(canvas, camera, world, () => tool);
  input.attach();
});

const click = (x: number, y: number, o = {}) => {
  canvas.dispatchEvent(ptr('pointerdown', x, y, o));
  canvas.dispatchEvent(ptr('pointerup', x, y, o));
};

describe('Input place', () => {
  it('click with place tool places food under the pointer', () => {
    const w = camera.screenToWorld(400, 300);
    click(400, 300);
    expect(world.food).toHaveLength(1);
    expect(Math.abs(world.food[0].x - w.x)).toBeLessThan(13);
    expect(Math.abs(world.food[0].y - w.y)).toBeLessThan(13);
  });

  it('click with place tool on a stone places the food at nearest valid cell or ignores it', () => {
    const t = world.terrain;
    let sx = -1;
    let sy = -1;
    for (let i = 0; i < t.surface.length && sx < 0; i++) {
      if (t.surface[i] === Surface.Stone) {
        sx = i % t.w;
        sy = Math.floor(i / t.w);
      }
    }
    expect(sx).toBeGreaterThanOrEqual(0);
    camera.x = sx + 0.5;
    camera.y = sy + 0.5;
    const before = world.food.length;
    click(400, 300);
    if (world.food.length > before) {
      const f = world.food[world.food.length - 1];
      const s = t.surface[Math.floor(f.y) * t.w + Math.floor(f.x)];
      expect(s).not.toBe(Surface.Stone);
      expect(s).not.toBe(Surface.BigTwig);
    } else {
      expect(world.food).toHaveLength(before);
    }
  });

  it('drag more than 4px does not place', () => {
    canvas.dispatchEvent(ptr('pointerdown', 400, 300));
    canvas.dispatchEvent(ptr('pointermove', 410, 300));
    canvas.dispatchEvent(ptr('pointerup', 410, 300));
    expect(world.food).toHaveLength(0);
  });

  it('right button does not place', () => {
    click(400, 300, { button: 2 });
    expect(world.food).toHaveLength(0);
  });
});

describe('Input delete / move', () => {
  it('delete tool removes the picked item', () => {
    const f = world.placeFood('fly', 160, 100)!;
    tool = { kind: 'delete' };
    const s = camera.worldToScreen(f.x + 3, f.y);
    canvas.dispatchEvent(ptr('pointerdown', s.x, s.y));
    expect(world.food).toHaveLength(0);
  });

  it('delete tool far from items does nothing', () => {
    world.placeFood('fly', 160, 100);
    tool = { kind: 'delete' };
    canvas.dispatchEvent(ptr('pointerdown', 10, 10));
    expect(world.food).toHaveLength(1);
  });

  it('move tool moves an item while dragging', () => {
    const f = world.placeFood('fly', 160, 100)!;
    tool = { kind: 'move' };
    const s = camera.worldToScreen(f.x, f.y);
    const x0 = f.x;
    canvas.dispatchEvent(ptr('pointerdown', s.x, s.y));
    canvas.dispatchEvent(ptr('pointermove', s.x + 40, s.y));
    canvas.dispatchEvent(ptr('pointerup', s.x + 40, s.y));
    expect(f.x).toBeGreaterThan(x0 + 5);
  });

  it('a failed move leaves the item where it was', () => {
    const f = world.placeFood('fly', 160, 100)!;
    tool = { kind: 'move' };
    const s = camera.worldToScreen(f.x, f.y);
    const { x, y } = f;
    canvas.dispatchEvent(ptr('pointerdown', s.x, s.y));
    canvas.dispatchEvent(ptr('pointermove', -100000, -100000));
    expect(f.x).toBe(x);
    expect(f.y).toBe(y);
  });

  it('move tool with nothing picked pans', () => {
    tool = { kind: 'move' };
    const cx = camera.x;
    canvas.dispatchEvent(ptr('pointerdown', 10, 10));
    canvas.dispatchEvent(ptr('pointermove', 50, 10));
    expect(camera.x).toBeLessThan(cx);
  });
});

describe('Input camera', () => {
  it('pan tool drag changes camera.x', () => {
    tool = { kind: 'pan' };
    const cx = camera.x;
    canvas.dispatchEvent(ptr('pointerdown', 100, 100));
    canvas.dispatchEvent(ptr('pointermove', 140, 100));
    expect(camera.x).toBeCloseTo(cx - 40 / 4, 5);
  });

  it('middle button pans even with the place tool, without placing', () => {
    const cx = camera.x;
    canvas.dispatchEvent(ptr('pointerdown', 100, 100, { button: 1 }));
    canvas.dispatchEvent(ptr('pointermove', 120, 100, { button: 1 }));
    canvas.dispatchEvent(ptr('pointerup', 120, 100, { button: 1 }));
    expect(camera.x).toBeLessThan(cx);
    expect(world.food).toHaveLength(0);
  });

  it('wheel zooms around the cursor', () => {
    const before = camera.screenToWorld(200, 150);
    const z = camera.zoom;
    const e = new WheelEvent('wheel', { clientX: 200, clientY: 150, deltaY: -100, cancelable: true, bubbles: true });
    canvas.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(camera.zoom).toBeCloseTo(z * Math.exp(100 * 0.0015), 5);
    const after = camera.screenToWorld(200, 150);
    expect(after.x).toBeCloseTo(before.x, 4);
    expect(after.y).toBeCloseTo(before.y, 4);
  });

  it('pinch zooms and does not place', () => {
    const z = camera.zoom;
    const t = { pointerType: 'touch' };
    canvas.dispatchEvent(ptr('pointerdown', 380, 300, { id: 1, ...t }));
    canvas.dispatchEvent(ptr('pointerdown', 420, 300, { id: 2, ...t }));
    canvas.dispatchEvent(ptr('pointermove', 360, 300, { id: 1, ...t }));
    canvas.dispatchEvent(ptr('pointermove', 440, 300, { id: 2, ...t }));
    canvas.dispatchEvent(ptr('pointerup', 360, 300, { id: 1, ...t }));
    canvas.dispatchEvent(ptr('pointerup', 440, 300, { id: 2, ...t }));
    expect(camera.zoom).toBeGreaterThan(z);
    expect(world.food).toHaveLength(0);
  });

  it('contextmenu is suppressed and detach removes listeners', () => {
    const e = new MouseEvent('contextmenu', { cancelable: true, bubbles: true });
    canvas.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    input.detach();
    click(400, 300);
    expect(world.food).toHaveLength(0);
  });
});
