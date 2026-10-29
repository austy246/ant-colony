# Ant Colony – plán implementace

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pixel-art hra v prohlížeči, v níž mravenci hledají kořist, značkují feromonovou stopu a kolonie roste podle přinesené potravy.

**Architecture:** Simulace (`src/sim/`) je čistý TypeScript bez DOMu, běží s pevným krokem a je testovatelná ve vitestu. Vykreslování (`src/render/`) kreslí svět na Canvas 2D s vypnutým vyhlazováním, terén se předrenderuje do offscreen canvasu a sprity jsou procedurální. UI (`src/ui/`, `src/main.ts`) řeší kameru, lištu kořisti, přepínače pohledů, úvod a ukládání.

**Tech Stack:** TypeScript, Vite, Canvas 2D, vitest (+ jsdom, fake-indexeddb), GitHub Actions + GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-29-ant-colony-design.md` (vizuální reference: `docs/design/visual-style-v2.html`)

## Global Constraints

- Prohlížeč, bez serveru; stav ve `localStorage`, při nedostatku místa přechod na IndexedDB; uložení je verzované (`version: 1`).
- UI texty česky. Kód a identifikátory anglicky.
- Měřítko: 1 pixel kresby = 4 pixely obrazovky při výchozím zoomu; mravenec ≈ 11×7 pixelů kresby; feromonová mřížka má rozlišení kresby (1 buňka = 1 pixel kresby); stopa se kreslí jako 1 pixel kresby široká.
- Svět 320×200 pixelů kresby, generovaný ze seedu (seed se ukládá).
- Mravenci jsou celí černí (`#241a12`/`#1a1410`, žádná rezavá barva).
- Kořist jen z lesa: `beetle`, `caterpillar`, `fly`, `carrion`, `berry`, `mushroom`.
- Terén zpomaluje, nic není neprůchodné. Rychlosti: zem 1, jehličí 0.9, malá větvička 0.6, velká větev 0.3, kámen 0.15.
- Palety: půda `#4a3524 #54402c #3e2c1d #5f4a33 #352517`, jehličí `#c9822f #9b5d22`, mech `#4f7a2e #3d6023 #68964a`, kameny `#5d5f5b #797b76 #93958f`.
- Mravenci stárnou a umírají; královna neumírá, takže nevzniká prohra. Hnízdo je jen vchod na povrchu.
- Úvod se přehraje jen při nové hře a jde přeskočit.
- Žádné lízátko, ohryzek ani lidské předměty.

## Review Focus

1. Poškozený nebo starší uložený stav (neplatný JSON, jiná `version`, chybějící pole) → nová hra, žádný pád (Task 6).
2. Návrat na záložku po dlouhé nečinnosti (obří `dt`) → simulace se nesmí „vystřelit", krok se omezí (Task 5).
3. Kořist položená mimo mapu, na kámen nebo do hnízda → odmítnuta nebo posunuta, ne pád ani nedosažitelná kořist (Task 4).
4. Všichni mravenci mrtví a zásoba prázdná → hra běží dál bez chyby; pokud je v zásobě aspoň `FOOD_PER_ANT`, královna vylíhne nového mravence, jinak kolonie zůstane prázdná (Task 5).
5. Změna velikosti okna, zoom na limitech a pan za okraj mapy → kamera zůstane v mezích (Task 7).

---

### Task 1: Scaffold a seedovaný RNG

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/sim/rng.ts`, `src/sim/constants.ts`
- Test: `src/sim/rng.test.ts`

**Interfaces:**
- Produces: `createRng(seed: number): () => number` (mulberry32, výsledek v [0,1)); konstanty v `constants.ts`: `WORLD_W=320`, `WORLD_H=200`, `SCALE=4`, `NEST={x:40,y:150,r:6}`, `FOOD_PER_ANT=3`, `MAX_ANTS=300`, `LIFESPAN_S=600`, `MAX_PHEROMONE=5`, `STEP_S=1/30`.

- [ ] **Step 1: Napsat test** `rng.test.ts`: `same seed gives same sequence` (10 hodnot shodných pro seed 42), `different seeds differ`, `values are in [0,1)` (1000 hodnot).
- [ ] **Step 2:** `npm init`, nainstalovat `typescript vite vitest jsdom fake-indexeddb`, skripty `dev`, `build` (`tsc --noEmit && vite build`), `test` (`vitest run`). Spustit `npx vitest run` → FAIL (chybí `rng.ts`).
- [ ] **Step 3: Implementovat** `createRng` a `constants.ts`; `index.html` s jedním `<canvas id="game">` a prázdným `<div id="ui">`; `main.ts` jen vypíše do konzole start.
- [ ] **Step 4:** `npx vitest run` → PASS, `npm run build` → bez chyb.
- [ ] **Step 5: Commit** `chore: scaffold vite + vitest, seeded rng`

### Task 2: Generování terénu

**Files:**
- Create: `src/sim/terrain.ts`
- Test: `src/sim/terrain.test.ts`

**Interfaces:**
- Consumes: `createRng`, `WORLD_W/H`, `NEST`.
- Produces:
  - `export const Surface = { Ground: 0, Needle: 1, SmallTwig: 2, BigTwig: 3, Stone: 4 } as const`
  - `export const SPEED: Record<number, number>` podle Global Constraints.
  - `export type Feature = {kind:'stone';x;y;rx;ry} | {kind:'twig';x0;y0;x1;y1;t} | {kind:'needle';x;y;a;len} | {kind:'moss';x;y} | {kind:'leaf';x;y;c} | {kind:'grass';x;y}`
  - `export interface Terrain { seed:number; w:number; h:number; surface:Uint8Array; speed:Float32Array; features:Feature[] }`
  - `generateTerrain(seed: number): Terrain`, `speedAt(t: Terrain, x: number, y: number): number` (mimo mapu vrací 0).

- [ ] **Step 1: Testy**: `same seed gives identical terrain` (shodné `surface` a `features`); `nest area is free of stones and twigs` (v okruhu `NEST.r + 8` kolem `NEST` je jen `Ground`/`Needle`); `stone cells have speed 0.15 and ground 1`; `speedAt outside map returns 0`; `terrain contains at least 5 stones and 4 twigs`.
- [ ] **Step 2:** Spustit → FAIL.
- [ ] **Step 3: Implementovat** `generateTerrain`: nejdřív rozmístit kameny (elipsy), větve (úsečky; `t ≥ 4` → `BigTwig`, jinak `SmallTwig`), jehličí (páry), mech, listí, trávu; poté rasterizovat do `surface` (kámen přebije větev přebije jehličí) a `speed` podle `SPEED`. Prvky se v okolí hnízda vynechají.
- [ ] **Step 4:** Spustit → PASS.
- [ ] **Step 5: Commit** `feat(sim): seeded terrain generation with speed map`

### Task 3: Feromonové pole

**Files:**
- Create: `src/sim/pheromone.ts`
- Test: `src/sim/pheromone.test.ts`

**Interfaces:**
- Produces: `class PheromoneField { readonly w:number; readonly h:number; readonly data:Float32Array; constructor(w,h); deposit(x,y,amount):void; sample(x,y):number; step(dt:number):void }`. Hodnoty jsou omezeny na `MAX_PHEROMONE`. `step` aplikuje vypařování s poločasem 25 s (`value *= Math.exp(-dt * Math.LN2 / 25)`) a velmi slabou difuzi do 4 sousedů (podíl 0.02 za krok). Hodnoty pod `0.01` se nulují. `sample` mimo mapu vrací 0.
- Produces: `homeGlow(x:number, y:number):number` (statický radiální gradient kolem `NEST`, 1 u středu, 0 od vzdálenosti 40; jen pro vykreslení).

- [ ] **Step 1: Testy**: `deposit then sample returns amount`; `value is clamped to MAX_PHEROMONE`; `after 25 s of steps value halves (±5 %)`; `values below 0.01 become 0`; `diffusion spreads to neighbour but conserves roughly total`; `sample outside returns 0`; `homeGlow is 1 at nest and 0 at distance 40`.
- [ ] **Step 2:** FAIL. **Step 3:** implementovat. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(sim): pheromone field with evaporation and diffusion`

### Task 4: Kořist

**Files:**
- Create: `src/sim/food.ts`
- Test: `src/sim/food.test.ts`

**Interfaces:**
- Consumes: `Terrain`, `Surface`, `NEST`.
- Produces:
  - `type FoodKind = 'beetle'|'caterpillar'|'fly'|'carrion'|'berry'|'mushroom'`
  - `FOOD_TABLE: Record<FoodKind,{pieces:number; value:number}>` = beetle `{6,2}`, caterpillar `{4,2}`, fly `{2,2}`, carrion `{8,2}`, berry `{1,3}`, mushroom `{1,3}` (value = potrava jednoho dílku).
  - `interface FoodItem { id:number; kind:FoodKind; x:number; y:number; piecesLeft:number }`
  - `resolvePlacement(t: Terrain, x: number, y: number): {x:number;y:number} | null`: vrátí platnou pozici, nebo `null`, když je bod mimo mapu o víc než 0 buněk. Pozice na `Stone`/`BigTwig` nebo v okruhu `NEST.r + 4` se posune na nejbližší platnou buňku do vzdálenosti 12, jinak `null`.

- [ ] **Step 1: Testy**: `point inside map on ground is unchanged`; `point outside map returns null`; `point on stone is moved to nearest ground cell within 12`; `point in nest radius is moved out of it`; `point surrounded by stone with no free cell within 12 returns null`; `FOOD_TABLE has exactly the six forest kinds`.
- [ ] **Step 2:** FAIL. **Step 3:** implementovat (prohledávání prstenců rostoucího poloměru). **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(sim): forest prey table and placement validation`

### Task 5: Svět, mravenci a růst kolonie

**Files:**
- Create: `src/sim/world.ts`
- Test: `src/sim/world.test.ts`

**Interfaces:**
- Consumes: vše z Tasků 1–4.
- Produces:
  - `type AntState = 'wander'|'toFood'|'carry'`
  - `interface Ant { id:number; x:number; y:number; heading:number; state:AntState; age:number; lifespan:number; carry:number; targetFood:number|null }`
  - `class World { terrain:Terrain; pher:PheromoneField; ants:Ant[]; food:FoodItem[]; stock:number; hatchProgress:number; time:number; static create(seed:number): World; step(dt:number): void; spawnAnt(): Ant; placeFood(kind:FoodKind,x:number,y:number): FoodItem | null; moveFood(id:number,x:number,y:number): boolean; removeFood(id:number): void }`
- `step(dt)`: `dt` se omezí na max 0.5 s a rozdělí na kroky po `STEP_S`. V každém kroku:
  - **Pohyb:** rychlost `12 * speedAt(...)` pixelů/s. Směr se volí z kandidátů `heading-0.6, heading, heading+0.6` podle skóre (rychlost terénu vpředu 3 px, minus malá penalizace za zatáčení, plus u `toFood` váha feromonu). `wander` přidává náhodný šum natočení. Mravenec drží v mapě.
  - **Hledání:** `wander` mravenec, který je do 10 px od kusu kořisti, přejde na `toFood` k ní; jinak jde po gradientu feromonu (přechod do `toFood` i při vysokém feromonu).
  - **Nošení:** u kořisti vezme jeden dílek (`piecesLeft--`, `carry = value`), přejde na `carry` a míří k `NEST` (zjednodušení: mravenci znají směr domů), každý krok klade `0.5` feromonu na svou buňku. Po dosažení `NEST` přidá `carry` do `stock`, `carry = 0`, vrátí se na `toFood` k téže kořisti, pokud existuje, jinak `wander`.
  - **Kořist s `piecesLeft == 0`** se odstraní.
  - **Líhnutí:** za každých `FOOD_PER_ANT` jednotek v `stock` se `stock -= FOOD_PER_ANT` a `spawnAnt()` v `NEST`, ne víc než do `MAX_ANTS`.
  - **Stárnutí:** `age += dt`; při `age >= lifespan` mravenec zmizí. `lifespan = LIFESPAN_S * (0.8 + 0.4 * rng)`.
  - Feromon se aktualizuje `pher.step(dt)`.

- [ ] **Step 1: Testy** (světy z pevného seedu, simulace 0–120 s):
  - `ant on stone moves slower than on ground` (stejný vektor kroku, poměr dráhy ≈ 0.15).
  - `wandering ant finds food placed within 30 px and carries a piece to the nest` (po simulaci vzroste `stock`).
  - `food stock of 3 hatches exactly one new ant and leaves stock 0`.
  - `ants never exceed MAX_ANTS`.
  - `ant dies when age reaches lifespan`.
  - `queen survives: world with no ants and no food keeps running 1000 s without throwing`.
  - `dt of 3600 s is clamped and does not produce NaN positions`.
  - `trail forms: after 90 s with 5 ants and one beetle, pheromone sum along the line between food and nest is greater than the sum 15 px off the line`.
  - `deleted food clears targetFood so ants return to wander` a `trail evaporates when food is gone` (součet feromonu po 120 s < 5 % původního).
  - `placeFood returns null for point on stone beyond reach`, `moveFood relocates a piece, removeFood deletes it`.
  - `after all ants died and stock is 0, placing food and calling spawnAnt keeps the game consistent` (nové mravenec může kořist odnést).
- [ ] **Step 2:** FAIL. **Step 3:** implementovat `World` (náhodnost z `createRng(seed)`, stav RNG je součástí `World`, aby šel uložit). **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(sim): world, foraging ants, trails, colony growth, aging`

### Task 6: Verzované ukládání

**Files:**
- Create: `src/save.ts`, `src/sim/serialize.ts`
- Test: `src/save.test.ts` (prostředí jsdom + `fake-indexeddb`)

**Interfaces:**
- Consumes: `World`.
- Produces:
  - `interface SaveV1 { version:1; seed:number; rngState:number; time:number; stock:number; hatchProgress:number; nextId:number; introDone:boolean; ants:Ant[]; food:FoodItem[]; pheromone:string /* base64, Uint8 = round(value/MAX_PHEROMONE*255) */; camera:{x:number;y:number;zoom:number} }`
  - `worldToSave(w: World, extra:{introDone:boolean;camera:SaveV1['camera']}): SaveV1`, `worldFromSave(s: SaveV1): World`
  - `saveGame(s: SaveV1): Promise<void>` (zkusí `localStorage['ant-colony-save']`; při `QuotaExceededError` zapíše do IndexedDB `ant-colony`/`saves`/`current` a smaže klíč v localStorage)
  - `loadGame(): Promise<SaveV1 | null>` (kontroluje `version === 1` a tvar polí; jakákoli chyba → `null`)

- [ ] **Step 1: Testy**: `roundtrip preserves ants, food, stock and pheromone within 1/255*MAX`; `loading restores terrain from seed identical to original`; `invalid JSON returns null`; `version 2 returns null`; `missing ants field returns null`; `quota exceeded falls back to IndexedDB and loadGame reads it back` (mock `localStorage.setItem` vyhazuje `QuotaExceededError`); `empty storage returns null`.
- [ ] **Step 2:** FAIL. **Step 3:** implementovat. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: versioned save with localStorage and IndexedDB fallback`

### Task 7: Kamera

**Files:**
- Create: `src/ui/camera.ts`
- Test: `src/ui/camera.test.ts`

**Interfaces:**
- Produces: `class Camera { x:number; y:number; zoom:number; constructor(viewW:number, viewH:number); resize(viewW:number, viewH:number):void; panBy(dxScreen:number, dyScreen:number):void; zoomAt(sx:number, sy:number, factor:number):void; screenToWorld(sx:number, sy:number):{x:number;y:number}; worldToScreen(wx:number, wy:number):{x:number;y:number}; fitWorld():void; clamp():void }`. `x,y` je střed pohledu ve světových pixelech. Zoom je v rozsahu `[max(1, min(viewW/WORLD_W, viewH/WORLD_H)), 16]`, výchozí `SCALE`. Střed pohledu zůstává tak, aby okraj pohledu nepřesáhl mapu víc než o půl obrazovky nutně nutné (pohled nikdy nevyjede celý mimo mapu).

- [ ] **Step 1: Testy**: `screenToWorld inverts worldToScreen`; `zoomAt keeps the point under the cursor fixed`; `zoom is clamped to min and 16`; `panBy cannot move view fully off the map`; `resize keeps zoom within new limits`; `fitWorld shows the whole world`.
- [ ] **Step 2:** FAIL. **Step 3:** implementovat. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(ui): camera with pan, zoom and clamping`

### Task 8: Vykreslování běžného pohledu

**Files:**
- Create: `src/render/sprites.ts`, `src/render/terrainRender.ts`, `src/render/renderer.ts`
- Test: `src/render/terrainRender.test.ts`

**Interfaces:**
- Consumes: `Terrain`, `World`, `Camera`.
- Produces:
  - `renderTerrain(t: Terrain): HTMLCanvasElement` (offscreen `WORLD_W×WORLD_H`; kreslí podle palet z Global Constraints a přenese kresbu z `docs/design/visual-style-v2.html`: stíny, kůra, páry jehličí, listí, mech)
  - `drawAnt(c: CanvasRenderingContext2D, x:number, y:number, facing: 1|-1, carrying:boolean): void`, `drawFood(c, kind: FoodKind, x:number, y:number): void` (procedurální sprity z reference; mravenec celý černý)
  - `class Renderer { constructor(canvas: HTMLCanvasElement, world: World, camera: Camera); setView(v: 'normal'|'pheromone'|'terrain'): void; draw(): void }`

- [ ] **Step 1: Test** (jsdom + canvas mock nebo `node-canvas`, pokud to jsdom neumí, test jen na čistých datech): `renderTerrain returns canvas sized WORLD_W x WORLD_H`; `renderTerrain is deterministic for the same seed` (hash `getImageData` shodný); `ground pixels only use palette colours plus feature colours` (vzorek 500 pixelů v mezích).
- [ ] **Step 2:** FAIL. **Step 3:** implementovat. `Renderer.draw` vypne `imageSmoothingEnabled`, aplikuje kameru (`translate/scale`), nakreslí terén, hnízdo, kořist a mravence (seřazeno podle `y`), vinětu. Mravenec se překlápí podle znaménka `cos(heading)`.
- [ ] **Step 4:** PASS + `npm run build`. Vizuálně ověřit v prohlížeči (`npm run dev`, screenshot).
- [ ] **Step 5: Commit** `feat(render): pixel terrain, sprites and normal view`

### Task 9: Feromonový pohled a pohled průchodnosti

**Files:**
- Modify: `src/render/renderer.ts`
- Test: `src/render/views.test.ts`

**Interfaces:**
- Consumes: `World.pher`, `homeGlow`, `Terrain.surface`.
- Produces: `Renderer.setView('pheromone'|'terrain')` plně funkční. `pheromone`: terén ztmavený (`rgba(6,8,14,.80)`), oranžová záře z `homeGlow` kolem hnízda, stopa modrá `rgba(127,209,255,a)` s `a` úměrným hodnotě feromonu, vždy 1 pixel kresby široká (žádné rozmazání, `a < 0.02` se nekreslí), mravenci jako 3×1/1×3 bílé body, kořist jako světlý bod. `terrain`: ztmavený terén, překryv podle `Surface` (kámen červená `#ff4040`, větve oranžová `#ff9d2e`, jehličí žlutá `rgba(255,224,102,.55)`).

- [ ] **Step 1: Test** na čisté pomocné funkci `pheromoneAlpha(value:number): number` (0 pod `0.02`, monotónní, max `0.95`) a `surfaceOverlayColor(s:number): string|null` (`Ground` → `null`).
- [ ] **Step 2:** FAIL. **Step 3:** implementovat, vizuální kontrola ve všech třech pohledech. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(render): pheromone view and terrain cost view`

### Task 10: Lišta kořisti a umísťování

**Files:**
- Create: `src/ui/toolbar.ts`, `src/ui/input.ts`
- Test: `src/ui/input.test.ts`

**Interfaces:**
- Consumes: `World.placeFood/moveFood/removeFood`, `Camera`.
- Produces: `type Tool = {kind:'place'; food:FoodKind} | {kind:'move'} | {kind:'delete'} | {kind:'pan'}`; `class Input { constructor(canvas, camera, world, getTool: () => Tool); attach(): void }` – pan tažením (nástroj `pan` nebo prostřední tlačítko), zoom kolečkem a pinchem, kliknutí s nástrojem `place` volá `world.placeFood`, `move` přetáhne nejbližší kořist do 8 px, `delete` ji smaže. `buildToolbar(root: HTMLElement, onTool:(t:Tool)=>void, onView:(v:'normal'|'pheromone'|'terrain')=>void): void` vytvoří česká tlačítka: Brouk, Housenka, Moucha, Zdechlina, Malina, Houba, Přesunout, Smazat, Posun, a pohledy Běžný (klávesa `1`), Feromony (`P`), Terén (`T`).
- Pomocná čistá funkce `pickFood(world: World, x:number, y:number, radius:number): FoodItem | null`.

- [ ] **Step 1: Testy**: `pickFood returns nearest within radius`; `pickFood returns null outside radius`; `click with place tool on a stone places the food at nearest valid cell or ignores it` (přes `world.placeFood`).
- [ ] **Step 2:** FAIL. **Step 3:** implementovat. **Step 4:** PASS + ruční kontrola.
- [ ] **Step 5: Commit** `feat(ui): prey toolbar, place/move/delete and view toggles`

### Task 11: Úvodní sekvence

**Files:**
- Create: `src/intro.ts`
- Test: `src/intro.test.ts`

**Interfaces:**
- Produces: `type IntroPhase = 'wide'|'zoom'|'dig'|'hidden'|'spawn'|'done'`; `class Intro { constructor(); t:number; phase: IntroPhase; update(dt:number): void; skip(): void; get done(): boolean; cameraAt(): {x:number;y:number;zoom:number}; queen(): {visible:boolean; x:number; y:number; digProgress:number} }`. Časy fází: `wide` 2 s (celá mapa), `zoom` 3 s (plynulý ease na `NEST` se zoomem 10), `dig` 3 s (královna kope, `digProgress` 0→1), `hidden` 1 s (královna zmizí), `spawn` 1 s (první mravenec se objeví), pak `done`. `main.ts` volá `world.spawnAnt()` právě při přechodu do `spawn`.

- [ ] **Step 1: Testy**: `phases advance in order with the stated durations`; `camera at t=0 shows the whole world and at end of zoom is on the nest at zoom 10`; `queen invisible after dig`; `skip() sets done and phase done`; `update after done does nothing`.
- [ ] **Step 2:** FAIL. **Step 3:** implementovat (interpolace kamery easing). **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: intro sequence state machine`

### Task 12: Sestavení hry, autosave a nasazení

**Files:**
- Modify: `src/main.ts`, `index.html`
- Create: `.github/workflows/ci.yml`, `.github/workflows/pages.yml`, `src/style.css`
- Modify: `README.md`

**Interfaces:**
- Consumes: vše výše.
- Produces: `main.ts` načte uložení (`loadGame`); když existuje, naváže bez úvodu (`introDone` = true) s uloženou kamerou, jinak vytvoří `World.create(Date.now() & 0xffffffff)` a přehraje `Intro` s tlačítkem „Přeskočit". Smyčka `requestAnimationFrame` s akumulátorem; `visibilitychange` resetuje časovač. Autosave každých 10 s a při `visibilitychange`/`pagehide`. Tlačítko „Nová hra" (s potvrzením) smaže uložení. HUD ukazuje počet mravenců a zásobu potravy.

- [ ] **Step 1:** Propojit moduly, `vite.config.ts` s `base: './'`.
- [ ] **Step 2:** `ci.yml`: `npm ci`, `npm test`, `npm run build` na každý push a PR. `pages.yml`: build a nasazení `dist` na GitHub Pages (`actions/upload-pages-artifact`, `actions/deploy-pages`).
- [ ] **Step 3: Ověření v prohlížeči** (`npm run dev`): úvod proběhne, objeví se první mravenec, po položení brouka vznikne stopa, přepínání pohledů funguje, po obnovení stránky se pokračuje bez úvodu, poškozený `localStorage['ant-colony-save']` (ručně přepsaný na `{`) vede k nové hře. Uložit screenshoty obou pohledů.
- [ ] **Step 4:** `npm test` a `npm run build` zelené.
- [ ] **Step 5: Commit** `feat: wire game loop, autosave, CI and Pages workflow`
- [ ] **Step 6:** Repozitář je zatím soukromý a Pages u soukromých repozitářů vyžaduje placený tarif. Před zapnutím Pages se zeptat vlastníka, zda repozitář zveřejnit.
