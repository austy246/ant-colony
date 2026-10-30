# Normal mód, majoři a pevné komůrky – plán implementace

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Po „Nová hra“ si hráč vybere Sandbox nebo Normal; Normal je pozorovací mód (kořist se objevuje sama, mapa roste, kolonie může zahynout, jen cukr ručně), majoři a nezmenšující se komůrky platí v obou módech.

**Architecture:** Simulace (`src/sim/`) dostane `World.mode`, majory, cukr, spawner kořisti a růst mapy po krocích (`mapStep`, deterministicky ze semínka, takže uložení pamatuje jen číslo kroku). Vykreslení a kamera přestanou číst pevné `WORLD_W/H` a čtou rozměr z `world.terrain`. UI dostane výběr módu, lištu pro normal a obrazovku zániku.

**Tech Stack:** TypeScript, Vite, Canvas 2D, vitest (+ jsdom, fake-indexeddb, @napi-rs/canvas) jako dnes.

**Spec:** `docs/superpowers/specs/2026-10-30-normal-mode-design.md` (navazuje na `2026-10-29-ant-colony-design.md`).

## Global Constraints

- UI texty česky, kód a identifikátory anglicky. Verze uložení zůstává `version: 1`, nová pole jsou nepovinná; chybějící pole = sandbox, mapa 320 × 200, žádní majoři.
- Sandbox se chová jako dnes (`MAX_ANTS = 300`, `rescue` zapnutý, žádná zkáza, žádný spawner, mapa 320 × 200), až na majory a komůrky.
- Normal: `MAX_ANTS_NORMAL = 2000`, `rescue` vypnutý, zánik = `started` && 0 mravenců && `stock + STOCK_EPS < FOOD_PER_ANT` (kontrola každý krok).
- Majoři od 50 mravenců; kořist zabijí prvním dotykem a sami nezemřou; unesou 2 dílky.
- Cukr: 1 dílek, hodnota 1; odpočet 300 s a zrychlení 60 s (×1,5) v herním čase `World.time`; zrychlení se neskládá, jen obnoví.
- Mapa: kroky `terrainSize(step) = { w: 320 + 40 * step, h: 200 + 25 * step }`, `step` v 0..8, roste doprava a dolů, nikdy se nezmenšuje a nemění už existující buňky ani prvky; hnízdo zůstává na `NEST` (40, 150).
- Veškerá náhoda v sim jen přes `World.rng` (nebo `createRng` ze semínka u terénu).
- Nic z toho nesmí rozbít existující testy (`npm test`) ani `npm run build`.

## Review Focus

1. Staré uložení bez nových polí → načte se jako sandbox 320 × 200, bez pádu (Task 8).
2. Po růstu mapy zůstanou stávající buňky terénu, feromony, jídlo a mravenci na svých místech a nikdo se neocitne mimo mapu (Task 6, 7).
3. Prázdný svět před prvním mravencem, během úvodu nebo hned po načtení nesmí hlásit zánik (Task 1, 11).
4. Cukr: odpočet a zrychlení přežijí obnovení stránky; druhý cukr zrychlení jen obnoví; cukr za odpočtu nejde položit (Task 4, 8).
5. Kamera po růstu mapy: aktuální zoom a střed zůstanou v mezích (Task 7).

---

### Task 1: Mód světa, limit mravenců a zánik

**Files:**
- Modify: `src/sim/constants.ts`, `src/sim/world.ts`
- Test: `src/sim/mode.test.ts`

**Interfaces:**
- Produces: v `constants.ts` `MAX_ANTS_NORMAL = 2000`. V `world.ts` `export type GameMode = 'sandbox' | 'normal'`; `World.mode: GameMode` (výchozí `'sandbox'`); `World.create(seed: number, mode: GameMode = 'sandbox'): World`; `get maxAnts(): number`; `get extinct(): boolean`.

- [ ] **Step 1: Napsat testy** v `mode.test.ts`: `sandbox keeps MAX_ANTS 300`, `normal maxAnts is 2000`, `normal colony with 0 ants and stock below FOOD_PER_ANT is extinct`, `sandbox is never extinct`, `world before first ant is not extinct` (`started` false), `normal rescue does not spawn an ant after RESCUE_AFTER_S` (sandbox ho spawne, jako dnes).
- [ ] **Step 2:** `npx vitest run src/sim/mode.test.ts` → FAIL.
- [ ] **Step 3: Implementovat** pole a gettery; `hatch()` používá `this.maxAnts` místo `MAX_ANTS`; `rescue()` se v normal módu přeskočí.
- [ ] **Step 4:** `npx vitest run` celé → PASS.
- [ ] **Step 5: Commit** `sim: game mode, normal ant limit and extinction`

### Task 2: Major mravenci (sim)

**Files:**
- Modify: `src/sim/constants.ts`, `src/sim/world.ts`
- Test: `src/sim/major.test.ts`

**Interfaces:**
- Consumes: Task 1 (`maxAnts`).
- Produces: `Ant.major?: true`; konstanty `MAJOR_MIN_ANTS = 50`, `MAJOR_CHANCE = 0.08` (šance na major při každém vylíhnutí), `MAJOR_MAX_FRACTION = 0.1`, `MAJOR_CARRY_PIECES = 2`; `get majors(): number`.

- [ ] **Step 1: Napsat testy** v `major.test.ts`:
  - `no major hatches below 50 ants` (stovky líhnutí s `ants.length < 50` → `majors === 0`);
  - `majors appear from 50 ants and never exceed MAJOR_MAX_FRACTION` (líhnutí se seedem do 400 mravenců: `majors > 0`, `majors <= ceil(ants * 0.1)`);
  - `major kills a beetle on first touch and survives` (`touches 0` → po doteku `kind === 'carrion'`, `corpseOf === 'beetle'`, major v `ants`, `antsKilled === 0`);
  - `major kills a fly and a caterpillar on first touch`;
  - `major touches through a touch cooldown` (kořist s `cooldown = 0.5` je přesto zabita);
  - `major wins a simultaneous touch` (obyčejný i major v `TOUCH_DIST`, obyčejný je dřív v `ants` → obyčejný nezemře, kořist umře);
  - `major carries two pieces` (po `gnaw` je `ant.carry === 2 * FOOD_TABLE[kind].value`, `piecesLeft` kleslo o 2; s 1 zbývajícím dílkem bere jen 1).
- [ ] **Step 2:** spustit testy → FAIL.
- [ ] **Step 3: Implementovat** v `hatch()` (po `spawnAnt(true)` rozhodnout o majoru přes `this.rng`, až po všech dnešních losech, aby se nezměnily seedované sekvence sandboxu pod 50 mravenci); v `resolveTouches()` vybrat pro každou kořist přednostně majora v dosahu (ignoruje `cooldown`), jinak dnešní chování; v `touch()` větev „zabij“ platí i při `ant.major`; v `gnaw()` vzít `min(piecesLeft, MAJOR_CARRY_PIECES)` dílků pro majora.
- [ ] **Step 4:** `npx vitest run` → PASS (sandbox testy s pevnými semínky musí zůstat zelené).
- [ ] **Step 5: Commit** `sim: major ants`

### Task 3: Komůrky se řídí vrcholy, ne aktuálním zatížením

**Files:**
- Modify: `src/sim/world.ts` (`trackPeaks`), `src/render/nestLayout.ts`, `src/render/underground.ts` (`needsOf`)
- Test: `src/render/nestLayout.test.ts`, `src/sim/nest.test.ts`

**Interfaces:**
- Produces: `World.peakAnts: number` (nikdy neklesá, začíná na 0); `NestInput.sizeLoads?: NestLoads` (když chybí, platí `loads`; velikost komůrky se počítá ze `sizeLoads`, pole `Chamber.load` zůstává podle `loads`); `needsOf(w)` v `underground.ts` vrací i `sizePantry: number[]` (z `peakStock`), `sizeLarvae: number[]` (z `peakLarvae`).

- [ ] **Step 1: Napsat testy**: v `nestLayout.test.ts` `chamber size ignores current loads when sizeLoads is given` (dva vstupy se stejným `sizeLoads`, jinými `loads` → shodné `rx`, `ry` všech komůrek, rozdílné `load`); `chamber grows with larger sizeLoads` (`rx(sizeLoads vyšší) >= rx(nižší)`); v `nest.test.ts` `peakAnts never decreases` (odstranit mravence → `peakAnts` zůstane).
- [ ] **Step 2:** spustit → FAIL.
- [ ] **Step 3: Implementovat** `peakAnts` v `trackPeaks`; v `nestLayout` použít `inp.sizeLoads ?? inp.loads` pro výpočet `f`; v `underground.ts` předat `sizeLoads: { ants: w.peakAnts, pantry: need.sizePantry, larvae: need.sizeLarvae }`. Pravidla počtu komůrek beze změny.
- [ ] **Step 4:** `npx vitest run` → PASS (včetně `undergroundShots`/`screenshots`, pokud se změní reference, aktualizovat jen záměrně).
- [ ] **Step 5: Commit** `render: chamber sizes follow peaks, no more breathing`

### Task 4: Cukr a zrychlení (sim)

**Files:**
- Modify: `src/sim/constants.ts`, `src/sim/food.ts`, `src/sim/world.ts`
- Test: `src/sim/sugar.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces: `FoodKind` rozšířen o `'sugar'`; `FOOD_TABLE.sugar = { pieces: 1, value: 1 }`; konstanty `SUGAR_COOLDOWN_S = 300`, `SUGAR_BOOST_S = 60`, `SUGAR_BOOST_MUL = 1.5`; `Ant.carrySugar?: true`; `World.sugarReadyAt: number` (výchozí 0), `World.boostUntil: number` (výchozí 0); `get sugarCooldownLeft(): number` (s, ≥ 0); `get boostLeft(): number` (s, ≥ 0); `placeSugar(x: number, y: number): FoodItem | null`.

- [ ] **Step 1: Napsat testy** v `sugar.test.ts`:
  - `placeSugar works only in normal mode` (sandbox → `null`);
  - `placeSugar starts a 300 s cooldown` (`sugarCooldownLeft === 300`; druhé volání → `null`; po 300 s herního času znovu funguje);
  - `delivering sugar starts a 60 s boost` (mravenec s `carrySugar` na `NEST.r` → `boostLeft ≈ 60`, `carrySugar` smazáno);
  - `second sugar during boost refreshes, does not add` (`boostLeft` po druhém ≈ 60, ne 120);
  - `boost speeds every ant by 1.5` (stejný mravenec urazí za krok `1.5×` víc, `speedMul` stejná);
  - `delivering other food does not boost`.
- [ ] **Step 2:** spustit → FAIL.
- [ ] **Step 3: Implementovat**: `gnaw()` nastaví `ant.carrySugar = true`, pokud `f.kind === 'sugar'`; v doručení (konec `updateAnt`) nastaví `boostUntil = time + SUGAR_BOOST_S`; `move()` násobí rychlost `SUGAR_BOOST_MUL`, dokud `time < boostUntil`; `placeSugar` volá `placeFood('sugar', x, y)` a nastavuje `sugarReadyAt = time + SUGAR_COOLDOWN_S`.
- [ ] **Step 4:** `npx vitest run` → PASS.
- [ ] **Step 5: Commit** `sim: sugar with cooldown and colony speed boost`

### Task 5: Samovolný přísun kořisti v normal módu

**Files:**
- Create: `src/sim/environment.ts`
- Modify: `src/sim/constants.ts`, `src/sim/world.ts`
- Test: `src/sim/environment.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces: konstanty `SPAWN_MIN_S = 20`, `SPAWN_MAX_S = 45`, `SPAWN_WEIGHTS: Record<Exclude<FoodKind,'sugar'>, number>` (`berry 3, mushroom 2, carrion 1, fly 2, caterpillar 2, beetle 1`), `SPAWN_MAX_FOOD_BASE = 12`, `SPAWN_MAX_FOOD_PER_STEP = 2`, `SPAWN_MAX_BEETLES_BASE = 1`; `World.spawnTimer: number` (s do dalšího výskytu, výchozí 0 = dnes losovat); v `environment.ts` `export function pickSpawnKind(rng: Rng, weights: ...): FoodKind` a `export function pickSpawnSpot(world: World): { x: number; y: number } | null`.

- [ ] **Step 1: Napsat testy**: `pickSpawnKind follows weights` (10 000 losů, podíl berry ≈ 3/11 ± 3 %); `sandbox never spawns anything` (1 hodina herního času → `food.length === 0`); `normal spawns food over time` (po 10 min `food.length > 0`); `spawned food stays under the cap` (`food.length <= 12 + 2 * mapStep` po hodině bez mravenců); `no more than SPAWN_MAX_BEETLES_BASE + mapStep living beetles`; `spawned food is on a free spot outside the nest radius` (každá položka projde `isFreeSpot`).
- [ ] **Step 2:** spustit → FAIL.
- [ ] **Step 3: Implementovat** `updateEnvironment()` volané ze `substep()` jen při `mode === 'normal'`: odpočítává `spawnTimer`, při nule vybere druh a místo a zavolá `placeFood`, nový odpočet `SPAWN_MIN_S + (SPAWN_MAX_S - SPAWN_MIN_S) * rng.next()`. Místo je náhodný bod celé aktuální mapy (`terrain.w/h`) přes `resolvePlacement`.
- [ ] **Step 4:** `npx vitest run` → PASS.
- [ ] **Step 5: Commit** `sim: normal mode spawns prey and food on its own`

### Task 6: Růst mapy (sim)

**Files:**
- Modify: `src/sim/constants.ts`, `src/sim/terrain.ts`, `src/sim/pheromone.ts`, `src/sim/world.ts`
- Test: `src/sim/terrain.test.ts`, `src/sim/pheromone.test.ts`, `src/sim/mapGrowth.test.ts`

**Interfaces:**
- Produces: konstanty `MAP_STEP_W = 40`, `MAP_STEP_H = 25`, `MAX_MAP_STEP = 8`, `MAP_STEP_ANTS = 100`; v `terrain.ts` `terrainSize(step: number): { w: number; h: number }` a `extendTerrain(t: Terrain, step: number): Terrain` (předpoklad: `t` má rozměr `terrainSize(step - 1)`; nová oblast = vše mimo starý obdélník; nové prvky se losují z `createRng((t.seed ^ Math.imul(step, 0x9e3779b1)) >>> 0)` a rastrují jen do nových buněk); `PheromoneField.grown(w: number, h: number): PheromoneField` (nová instance, stará data zkopírovaná po řádcích); `World.mapStep: number` (0), `World.mapVersion: number` (zvyšuje se při každém růstu), `World.growMapTo(step: number): void` (postupně 1..step, idempotentní pro nižší krok), `explored` se přealokuje podle `terrain.w/h`.

- [ ] **Step 1: Napsat testy**: `generateTerrain(seed)` dává stejný výsledek jako dosud (existující testy zůstanou); `extendTerrain keeps every old cell and feature` (`surface` a `speed` ve starém obdélníku bytově shodné, `features` začínají původním polem); `extendTerrain is deterministic` (dvakrát stejné); `extendTerrain adds features in the new area only` (každý nový prvek má střed mimo starý obdélník); `terrain stays passable near the nest` (nic v `CLEAR_R` hnízda); `PheromoneField.grown keeps old values at the same x, y`; `growMapTo(3) equals three single steps`; `ants grow the map in normal mode` (`ants.length = 250` → `mapStep === 2` po několika krocích; `mapStep` nikdy neklesne při úbytku mravenců; max `MAX_MAP_STEP`); `sandbox map never grows`; `explored grid covers the new map` (`explored.length === ceil(w/8) * ceil(h/8)`); `ants and food keep their coordinates after growth`.
- [ ] **Step 2:** spustit → FAIL.
- [ ] **Step 3: Implementovat**. Počty prvků v nové oblasti úměrné poměru plochy nové oblasti k základní (stejné rozsahy jako v `generateTerrain`). V `world.ts` nahradit `EXPLORE_W/H` a `WORLD_W + WORLD_H` (řádek ~671) hodnotami z `this.terrain`. `substep()` v normal módu: `wanted = min(MAX_MAP_STEP, floor(ants.length / MAP_STEP_ANTS))`; je-li větší než `mapStep`, `growMapTo(mapStep + 1)`.
- [ ] **Step 4:** `npx vitest run` → PASS.
- [ ] **Step 5: Commit** `sim: map grows with the colony in normal mode`

### Task 7: Růst mapy v kameře a vykreslení

**Files:**
- Modify: `src/ui/camera.ts`, `src/render/renderer.ts`, `src/render/terrainRender.ts`, `src/render/views.ts`, `src/game.ts`
- Test: `src/ui/camera.test.ts`, `src/render/renderer.test.ts`, `src/render/views.test.ts`

**Interfaces:**
- Consumes: Task 6 (`terrain.w/h`, `mapVersion`).
- Produces: `Camera.setWorldSize(w: number, h: number): void` (přepočítá `minZoom` a `clamp()`); konstruktor `Camera(viewW, viewH, worldW = WORLD_W, worldH = WORLD_H)`; `buildHomeGlowCanvas(make, w, h)` a `buildSurfaceOverlayCanvas(make, terrain)` berou rozměr z parametrů (úprava podpisů dle dnešního kódu); `Renderer` při změně `world.terrain` (nová instance při růstu) znovu vytvoří terénní, stopový, záři a overlay canvas v nové velikosti.

- [ ] **Step 1: Napsat testy**: `camera uses setWorldSize for clamping` (střed za novým okrajem je oříznut; po zvětšení světa lze jet dál); `camera keeps zoom within new minZoom after setWorldSize`; `renderer rebuilds terrain canvas when the map grows` (druhé `draw()` po `growMapTo(1)` použije `terrain.w * FINE` šířku); `trail canvas has the size of the map` ; `grep WORLD_W|WORLD_H in src` mimo `constants.ts`, `terrain.ts`, `intro.ts`, `world.ts (create)` nic nenajde (kontrola v kroku 4).
- [ ] **Step 2:** spustit → FAIL.
- [ ] **Step 3: Implementovat**; `game.ts`: v každé iteraci `step` při změně `world.mapVersion` zavolat `camera.setWorldSize(world.terrain.w, world.terrain.h)`; úvod (`intro.ts`) zůstává na základní velikosti.
- [ ] **Step 4:** `npx vitest run` → PASS, `npm run build` → bez chyb, `rg "WORLD_W|WORLD_H" src --glob '!*.test.ts'` ukáže jen povolená místa.
- [ ] **Step 5: Commit** `render: camera and renderer follow the map size`

### Task 8: Uložení nových polí

**Files:**
- Modify: `src/sim/serialize.ts`
- Test: `src/sim/serialize.test.ts`

**Interfaces:**
- Consumes: Tasky 1–6.
- Produces: nepovinná pole `SaveV1`: `mode?: GameMode`, `mapStep?: number`, `peakAnts?: number`, `sugarReadyAt?: number`, `boostUntil?: number`, `spawnTimer?: number`; u mravence `major?: true`, `carrySugar?: true`. `worldToSave` je zapisuje; `worldFromSave` je čte (výchozí: sandbox, 0, `ants.length`, 0, 0, 0) a před obnovou feromonů zavolá `growMapTo(mapStep)`; `validateSave` ověřuje souřadnice a velikost feromonů podle `terrainSize(mapStep)`.

- [ ] **Step 1: Napsat testy**: `round trip keeps mode, mapStep, sugar cooldown, boost and majors`; `old save without new fields loads as sandbox 320x200`; `save with mapStep 3 restores terrain of size terrainSize(3) identical to extend steps`; `pheromone size mismatch for the saved mapStep is rejected`; `ant coordinates beyond the saved map are rejected`; `invalid mapStep (negative, 9, fraction) is rejected`.
- [ ] **Step 2:** spustit → FAIL.
- [ ] **Step 3: Implementovat** (v `worldFromSave` nastavit `World.create(seed, mode)`).
- [ ] **Step 4:** `npx vitest run src/sim src/save.test.ts` → PASS.
- [ ] **Step 5: Commit** `save: mode, map step, sugar and major fields`

### Task 9: Sprity majora a cukru

**Files:**
- Modify: `src/render/sprites.ts`, `src/render/renderer.ts`, `src/render/underground.ts`, `src/render/preyArt.ts` (kde je `drawFood`)
- Test: `src/render/sprites.test.ts`, `src/render/preySprites.test.ts`

**Interfaces:**
- Produces: `MAJOR_SCALE = 1.6` (export v `sprites.ts`); `drawAnt(c, sprites, x, y, dir, frame, carrying, scale = 1)`; `drawFood(c, 'sugar', x, y)` vykreslí malou bílou kostku; místa, kde se kreslí `Ant` na povrchu i v podzemí, předají `a.major ? MAJOR_SCALE : 1`.

- [ ] **Step 1: Napsat testy**: `drawAnt with scale draws a larger image` (šířka `drawImage` = `ANT_SIZE / FINE * scale`); `drawFood sugar is not blank` (aspoň jeden neprázdný pixel na `@napi-rs/canvas`); `underground draws a major larger than a normal ant` (zachytit volání kreslení).
- [ ] **Step 2:** spustit → FAIL.
- [ ] **Step 3: Implementovat**; barvy cukru světlé (`#f2efe6`, stín `#cfc9b8`), žádná nová paleta pro mravence (zůstávají černí).
- [ ] **Step 4:** `npx vitest run src/render` → PASS.
- [ ] **Step 5: Commit** `render: major ant and sugar sprites`

### Task 10: Výběr módu a lišta normal módu

**Files:**
- Create: `src/ui/modeSelect.ts`
- Modify: `src/ui/toolbar.ts`, `src/ui/input.ts`, `src/game.ts`, `src/style.css`
- Test: `src/ui/modeSelect.test.ts`, `src/ui/toolbar.test.ts`, `src/ui/input.test.ts`

**Interfaces:**
- Consumes: Task 4 (`placeSugar`, `sugarCooldownLeft`).
- Produces: `showModeSelect(root: HTMLElement): Promise<GameMode>` (modál se dvěma tlačítky „Sandbox“ a „Normal“ s krátkým popisem česky; vrátí zvolený mód, odstraní se); `Tool` rozšířen o `{ kind: 'sugar' }`; `Input` na tool `sugar` po klepnutí zavolá `world.placeSugar(x, y)`; `buildToolbar(root, onTool, onView, opts?: { mode?: GameMode; sugarLeft?: () => number })` — v normal módu jen tlačítko „Cukr“ (s odpočtem `m:ss` a neaktivní, dokud `sugarLeft() > 0`) a pohledy, bez nástrojů sandboxu; po položení se nástroj sám vrátí na `pan`.

- [ ] **Step 1: Napsat testy**: `showModeSelect resolves 'normal' after clicking Normal and removes itself`; `normal toolbar has only Cukr and the four view buttons`; `Cukr button is disabled and shows the countdown while sugarLeft > 0`; `placing sugar returns the active tool to pan`; `sandbox toolbar is unchanged` (existující testy zůstanou); `input places sugar via placeSugar and not placeFood`.
- [ ] **Step 2:** spustit → FAIL.
- [ ] **Step 3: Implementovat**. `startGame()`: když není uložení, `await showModeSelect(ui)` a `World.create(seed, mode)`; z uložení se mód načte. „Nová hra“ zůstává (potvrzení → smazání → reload → výběr módu). V HUD drobný štítek „Normal“ / „Sandbox“ (`span.hud-mode`). CSS tlačítek modálu min. výška 44 px (dotyk) a přizpůsobení úzkému displeji.
- [ ] **Step 4:** `npx vitest run src/ui` → PASS; `npm run build`.
- [ ] **Step 5: Commit** `ui: mode selection and normal mode toolbar with sugar`

### Task 11: Obrazovka zániku kolonie

**Files:**
- Create: `src/ui/extinct.ts`
- Modify: `src/game.ts`, `src/style.css`, `src/sim/world.ts`
- Test: `src/ui/extinct.test.ts`, `src/sim/mode.test.ts`

**Interfaces:**
- Consumes: Task 1 (`extinct`).
- Produces: `showExtinct(root: HTMLElement, onNewGame: () => void): () => void` (přes hru překryv s hláškou „Kolonie zanikla“ a tlačítkem „Nová hra“; vrací funkci pro odstranění); `World.step` při `extinct` nic nepočítá.

- [ ] **Step 1: Napsat testy**: `showExtinct renders the message and calls onNewGame on click`; `world.step does nothing when extinct` (`time` se nemění); `autosave is skipped after extinction and the save is cleared` (v `game.ts` otestovat přes injektovatelnou funkci, nebo test v `mode.test.ts` pro sim část a ruční ověření UI v kroku 4).
- [ ] **Step 2:** spustit → FAIL.
- [ ] **Step 3: Implementovat**: ve smyčce `game.ts` při `world.extinct` jednou nastavit `resetting = true`, počkat na `inFlight`, `clearSave()`, zobrazit překryv; tlačítko udělá `location.reload()`.
- [ ] **Step 4:** `npx vitest run` → PASS. Ručně v prohlížeči (`npm run dev`): normal mód, vynutit `world.ants.length = 0; world.stock = 0` v konzoli → překryv, obnovení stránky nabídne výběr módu.
- [ ] **Step 5: Commit** `ui: colony extinction screen for normal mode`

### Task 12: Výkon při 2000 mravencích, dokumentace a ruční kontrola

**Files:**
- Modify: `src/render/underground.ts` (jen pokud měření ukáže potřebu), `README.md`
- Test: `src/sim/perf.test.ts`

- [ ] **Step 1: Napsat test** `perf.test.ts`: `normal world with 2000 ants steps 10 simulated seconds under 8 s` (velkorysá mez pro CI; test zapsat jako smoke, ne přesné měření).
- [ ] **Step 2:** spustit; pokud selže nebo je pomalý, profilovat (`nearestFood`, `resolveTouches`, feromony) a opravit nejlevnější úzké místo.
- [ ] **Step 3:** změřit kreslení podzemí s 2000 mravenci; kdyby nestíhalo, omezit počet kreslených podzemních mravenců pevným stropem (hodnota měřením) a zapsat do `README.md` v sekci o módech: popis Sandboxu a Normalu, majorů a cukru.
- [ ] **Step 4:** `npm test` a `npm run build` → vše zelené. Ručně `npm run dev` na mobilním viewportu (375 × 812): výběr módu, lišta normal módu, cukr, růst mapy po zrychlení vyvolaném v konzoli (`world.spawnAnt()` ve smyčce).
- [ ] **Step 5: Commit** `docs: README for modes, majors and sugar; perf guard`
