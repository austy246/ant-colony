# Mravenci – pavouk s pavučinou (normal mód)

Repozitář: `austy246/ant-colony`. Navazuje na `2026-10-30-normal-mode-design.md`.
Stav: **zadání autora, doplněné mými výchozími volbami** (autor řekl „udělej to rovnou, neptej se“). Co řekl autor, je psáno jako fakt; co jsem domyslel já, je označeno **(moje volba)**.

## Zadání autora

> Pavouk bude někde v rohu mapy a bude kolem něj pavučina. Když se do pavučiny chytne mravenec, tak ho pak pavouk sní. Když se ale do sítě chytí dva majoři, tak přemůžou automaticky pavouka.

## Pravidla

- **Jen normal mód** (moje volba): pavouk je nebezpečí, které patří do hry, kde kolonie může zahynout. Sandbox se nemění.
- **Jeden pavouk** sedí v jednom z rohů mapy vzdálených od hnízda (pravý horní nebo pravý dolní roh mapy o základní velikosti 320 × 200; volba ze semínka) (moje volba). Pavouk se nehýbe. Když mapa roste, zůstává na svém místě.
- **Pavučina** je kruh kolem pavouka o poloměru `SPIDER_WEB_R = 22` pixelů kresby (moje volba). Kolonie ji nezná a nevyhýbá se jí (jen ji průzkum nebere jako neprozkoumanou zem, viz níže).
- **Chycení:** každý mravenec na povrchu (stav kromě `nest`), který vstoupí do pavučiny, se chytí a **zůstane stát** (zamotaný). Chytí se obyčejný mravenec i major.
- **Snězení:** pavouk sní vždy **jednoho** chyceného mravence každých `SPIDER_EAT_S = 25` sekund (trávení); přednost mají **obyčejní** mravenci, z nich nejdéle chycený. Snězený mravenec zmizí z mapy (počítá se do `antsKilled`) a nese-li jídlo, jídlo se ztratí.
- **Chycený major čeká:** majora pavouk sní, až když visí v pavučině aspoň `SPIDER_MAJOR_HOLD_S = 90` sekund a žádný obyčejný chycený mravenec nečeká, aby měl druhý major čas přijít na pomoc.
- **Dva majoři přemůžou pavouka:** jakmile jsou v pavučině chyceni **dva majoři zároveň**, pavouk okamžitě zahyne, pavučina zmizí a všichni chycení mravenci jsou volní. Majoři přitom neumírají.
- **Průzkum netáhne do pavučiny:** dokud pavouk žije, buňky mřížky prozkoumanosti (`explored`), které pavučina překrývá, jsou drženy na `EXPLORE_CAP`, takže tah toulavých mravenců k neprozkoumané zemi nemíří do pavučiny. Jinak se kolonie pavučině nevyhýbá.
- **Kořist do pavučiny neleze:** dokud pavouk žije, brouci a housenky nevkročí (hlouběji) do pavučiny a moucha do ní neskočí, aby se z kořisti v pavučině nestala trvalá návnada.
- **Ladění:** hodnoty 25 s a 90 s vyšly z bezhlavé simulace hry (semínka 1–6, 90 min); původně navržené 15 s / 60 s nechávaly kolonii déle pod 50 mravenci a pavouk v ní nezemřel ani jednou.
- **Návrat:** po smrti pavouka se za `SPIDER_RESPAWN_S = 600` sekund (10 min herního času) objeví nový, na stejném nebo druhém z obou rohů podle semínka (moje volba), aby hrozba zůstala.
- **Kořist se v pavučině nerodí:** samovolný přísun kořisti (a cukr položený hráčem se bere jak je) nesmí vybrat místo uvnitř pavučiny (moje volba), aby kolonie nebyla od začátku tlačena do pasti.
- **Zánik kolonie:** pavouk může sníst posledního mravence; platí běžná pravidla zániku.

## Vzhled

- Pixel-art pavouk (tmavý, 8 nohou, nehybný) a pavučina jako jemné světlé radiální nitě s několika soustřednými oblouky, poloprůhledná, kreslená **pod mravenci**. Žádný jiný druh nebezpečí a žádné nové texty v UI.
- Chycený mravenec stojí na místě (kreslí se jako obvykle, bez animace chůze). Mrtvý pavouk i jeho pavučina se přestanou kreslit.
- V pohledu feromonů a terénu se pavouk nekreslí (jako ostatní objekty na povrchu) **(moje volba)**.

## Uložení

Zůstává `version: 1`; nová pole jsou nepovinná: `spider?: { x: number; y: number; alive: boolean; eatT: number; respawnT: number; corner: number }` a u mravence `caughtT?: number` (jak dlouho už je chycený, v sekundách). Chybí-li pole, pavouk se v normal módu vytvoří při prvním kroku a ve starých uloženích bez něj nikdo není chycený.

## Mimo rozsah

Další pavouci, pohyb pavouka, lov mravenců mimo pavučinu, pavouk v sandboxu, nová nastavení v UI, zvuky.
