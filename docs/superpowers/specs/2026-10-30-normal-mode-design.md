# Mravenci – normal mód, majoři a oprava komůrek

Repozitář: `austy246/ant-colony`.
Stav: **návrh k odsouhlasení autorem hry** (2026-10-30). Navazuje na `2026-10-29-ant-colony-design.md`.

Co řekl autor hry, je psáno jako fakt. Co jsem domyslel já, je označeno **(můj odhad)** a autor to může změnit.

## Záměr a proč

Dnešní hra je sandbox: hráč sám rozmísťuje kořist a kolonie se nikdy nezhroutí. Autor chce druhou hru nad stejným světem, **normal mód**, ve kterém hráč hlavně **kouká na kolonii**. Svět se mění sám (přibývá kořist a surovina, roste mapa), kolonie může **zahynout** a hráč do ní může zasáhnout jen výjimečně. Důvod: sledovat živou kolonii, která má co ztratit.

Spolu s tím přicházejí dvě věci, které se týkají obou módů: **major mravenci** a **oprava „nadechujících se“ komůrek**.

## Cíle

1. Po stisku „Nová hra“ si hráč vybere **Sandbox** nebo **Normal**.
2. **Sandbox** zůstává takový, jaký je dnes, s výjimkou opravy komůrek a majorů (viz níže).
3. **Normal**: jen se kouká; kořist i suroviny se objevují samy; mapa se zvětšuje s kolonií; kolonie může zahynout; hráč smí jen občas přidat cukr.
4. **Major mravenci** od 50 mravenců, v obou módech.
5. **Komůrky se přestanou nadechovat**, v obou módech.

## Mimo rozsah

- Predátoři a nová nebezpečí kromě těch, co už ve hře jsou (brouk).
- Nové druhy kořisti kromě cukru.
- Změna pravidel sandboxu kromě majorů a komůrek.
- Online žebříčky, více uložených her.

## 1. Výběr módu

- Stisk „Nová hra“ (a potvrzení smazání postupu, jako dnes) otevře výběr dvou voleb **Sandbox** / **Normal**. Volba spustí novou hru v daném módu, včetně úvodní sekvence.
- **Hra bez uložení (první spuštění)** nabídne výběr také **(můj odhad)**, protože jinak by se hráč k normal módu dostal až přes „Nová hra“ s nulovým postupem.
- Mód se ukládá se hrou. Starší uložení bez módu se načte jako sandbox.
- V UI je vidět, v jakém módu hráč je (např. drobný štítek u HUD) **(můj odhad)**.

## 2. Normal mód

### 2.1 Co hráč smí
- Posouvat a přibližovat mapu, přepínat pohledy (Běžný, Feromony, Terén, Podzemí).
- Nic z nástrojů sandboxu (kořist, přesunout, smazat). Lišta nástrojů v normal módu nabízí jen pohledy a tlačítko **Cukr**.
- **Cukr:** jedno tlačítko, hráč s ním položí cukr na mapu jako ostatní jídlo. Použít ho lze **nejvýše jednou za 5 minut** herního času. Do dalšího použití tlačítko ukazuje odpočet.
- Když mravenec cukr **donese do hnízda**, **všichni mravenci se na 1 minutu zrychlí**. Druhý cukr za trvání zrychlení jen obnoví minutu, nesčítá se **(můj odhad)**. Zrychlení platí pro pohyb; míra zrychlení (cca 1,5×) je ladicí parametr **(můj odhad)**.
- Pětiminutový limit i zbývající zrychlení se ukládají, aby je obnovení stránky neresetovalo.

### 2.2 Svět se mění sám
- **Kořist a suroviny** (brouk, housenka, moucha, zdechlina, malina, houba) se objevují sami „občas“, na náhodných volných místech mimo okolí hnízda (stejná pravidla volného místa jako při pokládání dnes). Četnost a poměr druhů určí builder tak, aby kolonie měla šanci přežít i zahynout; brouků je výrazně míň než jídla. Počet kusů na mapě je shora omezený.
- **Mapa se občas trochu zvětší podle velikosti kolonie.** Čím víc mravenců, tím větší mapa. Nové oblasti vzniknou ze stejného generování terénu a po zvětšení platí všechny dosavadní souřadnice dál. Zvětšení má být plynulé a nesmí rozbít kameru, feromony, uložení ani pohled terénu.
- **Limit mravenců se v normal módu zvedá z 300 na 2000** (`MAX_ANTS`), aby kolonie mohla růst spolu s mapou. Sandbox zůstává na 300. Limit musí hlídat líhnutí stejně jako dnes. Při takovém počtu musí hra zůstat plynulá, hlavně na mobilu (dnešní kontroly dotyků kořisti, feromony, kresba i podzemní pohled s mnoha mravenci a larvami). Zvládnutí výkonu a případné omezení, kolik mravenců se v podzemí kreslí, je na builderovi.
- Kolonie je zodpovědná za to, aby kořist našla. Pokud nenajde, hladoví (viz 2.3).

### 2.3 Zkáza
- Autor: **zkáza hrozí**. Nesmí zůstat pojistka, kterou dnes sandbox má: „rescue“ (volný mravenec po 15 s bez mravenců a jídla) se v normal módu **vypíná**.
- Kolonie zahyne, když nemá žádného mravence a zásoba nestačí na další (méně než `FOOD_PER_ANT`). Hráč uvidí hlášku, že kolonie zanikla, a nabídku „Nová hra“ **(můj odhad)**. Uložená hra zaniklé kolonie se po konci smaže nebo označí tak, aby se nenačetla jako rozehraná **(můj odhad)**.
- Příčiny, které už jsou ve hře: brouk zabije mravence prvním dotykem; kolonie bez jídla přestane se množit. Normal mód nepřidává nový způsob smrti.
- Přírodní nebezpečí normal módu nemá měnit rovnováhu sandboxu.

## 3. Major mravenci (oba módy)

- Od **50 mravenců** (v normal módu až do limitu 2000) se „jednou za čas“ (náhodně, ne každou líheň) narodí **major**: větší sprite, silnější. Četnost a horní počet majorů v kolonii určí builder, ať jsou vzácní **(můj odhad)**.
- Major se chová jako ostatní mravenci (hledá, nosí), ale při doteku **živé kořisti** ji **hned zabije**, bez ohledu na to, kolikátý dotyk to je:
  - **Brouk:** major nezemře, brouk umře hned a stane se zdechlinou. Dnes by první dotyk bránícího se brouka obyčejného mravence zabil.
  - **Moucha:** nestihne uletět, umře hned.
  - **Housenka:** umře hned **(můj odhad, autor jmenoval brouka a mouchu)**.
- Majoři se počítají do počtu mravenců a do HUD, ale mají vlastní vzhled (i v podzemním pohledu, kde mají větší sprite).
- Uložení musí majory pamatovat; starší uložení nemá žádné.

## 4. Oprava komůrek (oba módy)

- Dnes se velikost komůrky v podzemí řídí **aktuálním zatížením** (počet mravenců, jídlo ve spižírně, larvy v komůrce), takže při kolísání zatížení se komůrka zvětšuje a zmenšuje, „nadechuje se“. Autor to označil za chybu.
- Nově: velikost komůrky **nikdy neklesá**. Když zatížení stoupne, komůrka **trvale naroste**, nebo **se rovnou objeví další** komůrka (autorova odpověď). Zatížení pro velikost se tedy řídí **vrcholem**, ne aktuální hodnotou.
- Dnešní pravidla počtu komůrek (spižírny podle vrcholu zásoby, komory larev podle vrcholu larev, limity 6 a 4) zůstávají.
- To, co se v komůrce kreslí (jídlo ve spižírně, larvy), se může dál měnit s aktuálním stavem; jen obrys se nesmí vracet.

## Omezení a vazby na kód

- Svět je dnes pevných 320 × 200 (`WORLD_W`, `WORLD_H` v `constants.ts`; kamera, renderer terénu, feromony, mřížka průzkumu). Zvětšování mapy se dotýká všeho, co tyto konstanty používá. Hnízdo je na pevné pozici.
- Výpočet rozložení podzemí je deterministický ze semínka (`nestLayout`); oprava komůrek nesmí rozbít stabilitu tvaru.
- Simulace používá jen `World.rng` (semínkový generátor); nové události v normal módu také, aby byla hra reprodukovatelná.
- Testy (vitest) a pravidla repozitáře zůstávají; nové chování má testy.
- Původní spec říká, že královna neumírá a prohra nevzniká. To platí dál pro sandbox; normal mód zkázu zavádí **jako volbu autora**.

## Moje volby k upřesnění (autor je může změnit)

Tohle jsou věci, které při kontrole návrhu vyšly najevo a které jsem rozhodl já.

**Cukr**
- Je to nový druh jídla `sugar`. Má **1 dílek** (unese ho jeden mravenec) a hodnotu **1 jídla**, tedy jako malina. Hodnota se přičte do zásoby jako každé jídlo.
- Hráč tlačítkem „Cukr“ **vybere nástroj a klepne na mapu**, kam cukr patří; po jednom položení se nástroj vrátí na posun a spustí se pětiminutový odpočet.
- Zrychlení se spustí, když **mravenec donese do hnízda** dílek cukru (u jednoho dílku je to vždy ten jediný).
- Časy (5 min odpočet, 1 min zrychlení) se počítají **herním časem** (`World.time`), takže se zastaví, když hra stojí (karta na pozadí), a nepočítají se zdi hodin.

**Zvětšování mapy**
- Mapa se **jen rozšiřuje, nikdy nezmenšuje a nepřetváří dosavadní terén**. Rozšiřuje se **doprava a dolů**, protože tím zůstanou všechny dosavadní souřadnice (včetně hnízda na 40, 150) platné.
- Nová oblast se generuje ze stejného semínka po pásech nebo dílech nezávisle na tom, co už existuje. Generátor terénu kvůli tomu potřebuje úpravu (dnes používá velikost světa při losování); dosavadní semínka musí dál dávat **stejný terén** pro sandbox a staré uložení.
- Existuje **horní mez velikosti mapy** daná pamětí a výkonem (terén, feromony a mřížka průzkumu stojí paměť na buňku). Přesnou mez a velikost kroku určí builder; kolonie na limitu 2000 mravenců má na ní ještě projít bez problému.
- Uložená hra si pamatuje aktuální velikost mapy.

**Zkáza**
- Kolonie zanikla, když **nežije žádný mravenec** (počítají se i čerstvě vylíhlí v hnízdě) a **zásoba je menší než `FOOD_PER_ANT`**. Jídlo, které leží na mapě nebo ho někdo nesl, se nepočítá. Larvy se do toho nepočítají zvlášť, protože vznikají ze zásoby.
- Zkouška se dělá **každý krok** a až od chvíle, kdy hra začala (`started`), takže prázdný svět při úvodní sekvenci nikdy nezaniká.
- Po zániku se hra **zastaví** a ukáže hlášku s tlačítkem „Nová hra“. **Uložení se smaže**, takže po obnovení stránky se nabídne nová hra.

**Majoři**
- Kromě okamžitého zabití kořisti **unese major dvojnásobek** (2 dílky najednou), jinak jde stejně rychle. Je to nejméně invazivní podoba „větší síly“.
- Počítají se do `MAX_ANTS` (300 v sandboxu, 2000 v normal).
- Když se dotknou kořisti současně obyčejný mravenec a major, **vyhrává major** (kořist umře a nikdo nezahyne).
- Major při doteku brouka nezemře ani když kořist právě „ustoupila“ nebo je v odpočtu doteku; jeho dotek odpočet ignoruje.

**Uložení**
- Zůstává **verze 1**; mód, velikost mapy, cukr, odpočet a majoři se přidají jako **nepovinná pole**. Chybějící pole znamenají sandbox, 320 × 200, žádný majoři.

**Ovládání**
- V normal módu v nabídce **nejsou** žádné ovládání rychlosti ani pauza (ve hře taková tlačítka dnes ani nejsou).

## 5. Podzemí roste s kolonií (dodatek autora, 2026-10-30; jen normal mód)

- Autor: podzemí se má **zvětšovat stejně jako normální mapa**; čím víc mravenců a chodbiček, tím větší podzemí, takže **prakticky neexistuje limit pro komůrky larev a skladů jídla**.
- V normal módu proto padají limity `MAX_PANTRIES` (6) a `MAX_LARVAE_CHAMBERS` (4): počet spižíren a komor larev vždy odpovídá vrcholu zásoby / larev (`ceil(peak / kapacita)`). Pevný obraz podzemí 320 × 200 se podle potřeby zvětšuje (kroky obdobné růstu mapy), nové komůrky a chodby přibývají do nově získaného místa a už vykopané zůstávají na místě. Zobrazení (zoom) se přizpůsobí velikosti scény.
- **Sandbox** si podzemí ponechává dnešní limity **(moje volba R5: autor mluvil o normal módu a o růstu jako mapy, která se zvětšuje jen tam)**. Počet královen zůstává `MAX_QUEENS` (8).
- Při velkém počtu komůrek platí skrytí popisků (viz volba R4: nad 8 zobrazených komůrek se popisky nekreslí).
- Výkon: kresba podzemí se stovkami komůrek nesmí zpomalit hru (builder může omezit počet kreslených larev a mravenců).

## Co je na builderovi

Přesné četnosti a poměry kořisti, míra zrychlení cukru, četnost majorů, přírůstky mapy, grafika majora a hlášky, způsob uložení mapy a módu, umístění tlačítka Cukr, odpočet.
