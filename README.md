# Mravenci

Pixel-art simulace mravenčí kolonie v prohlížeči. Svět je z jehličí, větviček, kamenů a mechu; ty jsi pozorovatel. Rozmístíš kořist, mravenci ji najdou, odnesou do hnízda a po cestě vytvoří feromonovou stopu, kterou následují další. Za donesenou potravu královna líhne nové mravence. Mravenci nestárnou a neumírají věkem; zahynout mohou jen v konfliktu (brouk se brání), predátoři jsou plánovaní na později. Za každých 100 donesených jednotek potravy přibude další královna a líhnutí se zrychlí.

Hra začíná krátkým úvodem (celá mapa, zoom na královnu, ta vyhrabe komůrku a zmizí pod zem, pak se objeví první mravenec). Úvod lze přeskočit tlačítkem „Přeskočit" a přehraje se jen při nové hře.

## Spuštění

```bash
npm ci
npm run dev      # vývojový server (Vite)
npm test         # testy (vitest)
npm run build    # kontrola typů + produkční build do dist/
```

## Ovládání

- **Lišta kořisti** dole: Brouk, Housenka, Moucha, Zdechlina, Malina, Houba. Vyber druh a klikni do mapy. Počet kusů je neomezený.
- **Přesunout**: tažením přemístíš položenou kořist. **Smazat**: kliknutím kořist odstraníš. **Posun**: tažení posouvá mapu.
- **Kolečko myši** = zoom, **tažení** (v nástroji Posun nebo mimo kořist) = posun mapy, **pravé nebo prostřední tlačítko** = posun vždy. Na dotykovém displeji pinch = zoom, dva prsty = posun.
- **Pohledy**: `1` běžný, `P` feromonový (pohled mravenců: ztmavená mapa, modrá stopa k potravě, oranžová záře kolem hnízda), `T` průchodnost terénu (červená kameny, oranžová větvičky, žlutá jehličí).
- **Nová hra** (vpravo nahoře) po potvrzení smaže uložený postup a začne znovu.
- Vlevo nahoře ukazuje počet mravenců a zásobu potravy.

## Ukládání

Stav se ukládá automaticky každých 10 s, při skrytí karty a při zavření stránky do `localStorage` (klíč `ant-colony-save`, verzovaný formát). Pokud se tam nevejde nebo není dostupný, použije se IndexedDB (databáze `ant-colony`). Po obnovení stránky hra pokračuje bez úvodu; poškozené nebo neplatné uložení se ignoruje a začne nová hra.

## Technologie

TypeScript, Vite, Canvas 2D (`image-rendering: pixelated`), vitest (jsdom, `@napi-rs/canvas`, `fake-indexeddb`). Simulace (`src/sim`) je oddělená od vykreslování (`src/render`) a ovládání (`src/ui`), takže se testuje bez prohlížeče. Nasazení na GitHub Pages řeší `.github/workflows/pages.yml` (build s `base: './'`); zatím se spouští ručně (`workflow_dispatch`), dokud vlastník nezapne GitHub Pages a nerozhodne o viditelnosti repozitáře, pak se vrátí spouštění při pushi do `main`. CI (`ci.yml`) spouští testy a build při pushi do `main` a u každého PR.

## Dokumentace

- Návrh: [`docs/superpowers/specs/2026-10-29-ant-colony-design.md`](docs/superpowers/specs/2026-10-29-ant-colony-design.md)
- Plán implementace: [`docs/superpowers/plans/2026-10-29-ant-colony.md`](docs/superpowers/plans/2026-10-29-ant-colony.md)
