// TEMPORARY dev wiring so `npm run dev` shows the game. The real game loop / UI is Task 12.
import { Renderer } from './render/renderer';
import { NEST } from './sim/constants';
import { World } from './sim/world';
import { Camera } from './ui/camera';

const canvas = document.getElementById('game') as HTMLCanvasElement;
document.body.style.cssText = 'margin:0;overflow:hidden;background:#1a120b';
canvas.style.cssText = 'display:block;width:100vw;height:100vh;touch-action:none;cursor:grab';

const world = World.create(Date.now() >>> 0);
for (let i = 0; i < 3; i++) world.spawnAnt();
world.placeFood('beetle', NEST.x + 50, NEST.y - 25);
world.placeFood('berry', NEST.x + 35, NEST.y + 30);

const camera = new Camera(window.innerWidth, window.innerHeight);
const renderer = new Renderer(canvas, world, camera);
camera.fitWorld();

window.addEventListener('resize', () => renderer.resize());
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    camera.zoomAt(e.offsetX, e.offsetY, e.deltaY < 0 ? 1.15 : 1 / 1.15);
  },
  { passive: false },
);
let drag: { x: number; y: number } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  camera.panBy(e.clientX - drag.x, e.clientY - drag.y);
  drag = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerup', () => (drag = null));

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  world.step(dt);
  renderer.draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
