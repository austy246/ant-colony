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

## Módy hry

Na začátku nové hry si vybereš mód.

- **Sandbox**: vše jako dosud. Kořist si pokládáš sám, počet mravenců je nejvýše 300 a kolonie nikdy nezahyne (prázdné hnízdo bez jídla dostane po 15 s jednoho zachránce).
- **Normal**: jen sleduješ kolonii. Kořist se objevuje sama (brouci, housenky, mouchy, zdechliny, maliny, houby i listí), mapa a podzemí rostou s kolonií (o další kousek na každých **100 mravenců**, až do **2000**), a ta může **zahynout**: když nezbude žádný mravenec ani jídlo na dalšího, zobrazí se obrazovka zániku a můžeš začít znovu. Limit je **2000 mravenců**. Jednou za **5 minut** můžeš položit **cukr**; mravenec ho donese do hnízda a celá kolonie se na **minutu zrychlí (×1,5 rychlost)**.

**Pavouk** (v Sandboxu vpravo dole, v Normalu vpravo nahoře nebo dole): je **velký**, chodí po své pavučině k chycené kořisti a sedí v rohu mapy a kolem něj je **pavučina**. Mravenec, který do ní vstoupí, se **chytí** a stojí na místě; pavouk chycené mravence postupně **sní**, jednoho každých **15 sekund** (tráví), obyčejné mravence dřív (nejdéle chyceného jako prvního). Chyceného **majora** si nechá viset **minutu**, než ho sní, takže mu na pomoc může přijít druhý major: když se do pavučiny chytí **dva majoři** najednou, pavouka **přemůžou**, všichni chycení se osvobodí a pavouk zmizí. Toulaví mravenci vlákna cítí a pavučině se vyhýbají (ne vždy úspěšně); mravenci, kteří jdou za jídlem nebo ho nesou, na ni nedbají. Brouci a housenky se pavučině vyhýbají, ale **mouchy** (které teď chodí) se do ní chytají; pavouk k nim dojde a po **6 sekundách** je sní, dřív než mravence. Po **10 minutách** se vrátí v některém z rohů.

**Majoři** (v obou módech, od **50 mravenců**): větší mravenec, který kořist (brouka, housenku, mouchu) zabije **jedním dotykem** a unese **dvojnásobek** (2 dílky). Majorem se vylíhne nejvýše asi desetina kolonie. Majoři se **nestarají o hnízdo**: nikdy z nich nejsou ošetřovatelé a stále chodí po povrchu.

Komůrky v podzemí se už **nezmenšují**: jednou vyhrabaná komůrka zůstane i při poklesu zásob nebo larev.

## Ovládání

- **Lišta kořisti** dole (jen v Sandboxu): Brouk, Housenka, Moucha, Zdechlina, Malina, Listí, Houba. Vyber druh a klikni do mapy. Počet kusů je neomezený.
- **Lišta v Normalu**: místo kořisti a nástrojů jen tlačítko **Cukr** (vybereš ho a klikneš do mapy; po položení běží 5min odpočet, který tlačítko ukazuje) a pohledy. Mapu posouváš tažením a zoomuješ kolečkem nebo pinchem.
- **Nástroje v Sandboxu** – **Přesunout**: tažením přemístíš položenou kořist. **Smazat**: kliknutím kořist odstraníš. **Posun**: tažení posouvá mapu.
- **Kolečko myši** = zoom, **tažení** (v nástroji Posun nebo mimo kořist) = posun mapy, **pravé nebo prostřední tlačítko** = posun vždy. Na dotykovém displeji pinch = zoom, dva prsty = posun.
- **Pohledy**: `1` běžný, `P` feromonový (pohled mravenců: ztmavená mapa, modrá stopa k potravě, oranžová záře kolem hnízda), `T` průchodnost terénu (červená kameny, oranžová větvičky, žlutá jehličí).
- **Podzemí** (tlačítko `Podzemí (U)` nebo klávesa `U`): řez hnízdem. Hnízdo se pro každou kolonii vygeneruje náhodně (podle seedu hry) a komůrky se vyhrabávají podle potřeby: jedna komůrka na každou královnu (roste s počtem mravenců), tolik spíží, kolik zásoby kolonie kdy potřebovala (25 jídla na spíž), a tolik komůrek larev, kolik larev kdy čekalo (10 na komůrku). Komůrky se řídí maximem, kterého kolonie kdy dosáhla, a nikdy se nezmenšují; v režimu Normal s kolonií roste celé podzemí i počet komůrek. Nová komůrka vzniká viditelným hrabáním chodby (asi 3 s) a pak zvolna roste; chodby tvoří jeden strom od jediného vchodu bez zbytečných slepých ramen. Mravenci chodí jen po chodbách. Mravenci uvnitř hnízda jsou skuteční: vidíš každého (nejvýše 60 najednou) při práci, viz Život v hnízdě. Mapu a kořist v tomto pohledu nelze ovládat (tlačítka kořisti jsou zašedlá); svět se mezitím dál simuluje. Návrat kterýmkoli povrchovým pohledem vše obnoví.
- **Nová hra** (vpravo nahoře) po potvrzení smaže uložený postup a začne znovu.
- Vlevo nahoře ukazuje počet mravenců (a menším písmem, kolik jich je právě na povrchu) a zásobu potravy (v Podzemí rozšířený přehled).

## Pravidla hnízda

- Královna za **5 jídla** vylíhne jednoho mravence, a to **každých 10 s** (dokud má v zásobě aspoň 5). Zásoba potravy z kořisti se tak mění na larvy a mravence.
- Za každých **100 jídla** donesených celkem přibude další **královna** (nejvýše 8) a líhnutí se úměrně zrychlí (s `n` královnami líhne jedna každých `10 / n` s).
- V Podzemí ukazuje lišta nahoře královny, larvy, zásobu a mravence, ukazatel dalšího líhnutí a kolik jídla chybí do další královny.

## Život v hnízdě

Každý mravenec stráví v hnízdě skutečný čas. Čerstvě vylíhlý mravenec zůstává **asi 30 s** uvnitř mezi larvami jako světlejší, šedohnědý „callow“ (mládě), a teprve potom chodbou vyjde na povrch. Pracovník, který donesl potravu, se **asi 5 s** zdrží v hnízdě: s drobtem sejde šachtou do spíže, vyloží ho a vrátí se k východu. Kromě toho v hnízdě trvale pracují **ošetřovatelky** (nikdy nevycházejí ven; jejich počet roste s počtem královen a larev): nosí královně drobky ze spíže a krmí ji, přenášejí vajíčka od královen do komůrky larev a o larvy pečují. Podzemní pohled všechny tyto mravence kreslí podle jejich skutečného stavu, takže se při opuštění a návratu do pohledu nic neposouvá; vajíčko, které ošetřovatelka nese, zmizí z hromádky u královny.

## Kořist: živá housenka

Housenka se po mapě plazí (pomaleji než brouk), tělo se jí vlní. Když se jí první mravenec dotkne, na chvíli zrychlí a uteče (vlna běží dvakrát rychleji a tělo se natáhne); při druhém doteku zahyne a zbude po ní stočená zdechlina s bledě žlutými kapkami, kterou mravenci rozdělí na dílky jako ostatní zdechliny. **Listí** (na mapě může být naráz jen **jedna hromádka**) je potrava jen pro housenky (mravenci ho ignorují): housenka k němu dolezne, žere ho a listí postupně **mizí** (zmenšuje se); za každý snědený kousek **přibude** housence maso, takže se **prodlužuje**, až do dvojnásobku. Kdyby ji pak mravenci zabili, zbyde po ní víc jídla. Syta se přestane krmit. **Hnízdo červených mravenců:** od **1000 černých mravenců** se daleko od vašeho hnízda (aspoň 380 px) objeví **hnízdo červených**. Hned se u něj objeví **10 červených mravenců**, kteří hnízdo **obcházejí a brání** (do 80 px kolem) a bojují s každým černým, který přijde; za padlého vyjde nový každých 8 s. Jednou za čas (2–6 minut) z něj vyrazí **nálet** na vaše hnízda (100 až 500 červených, v horní liště svítí „NÁLET“), vždy jeden na jednoho (černý vyhraje asi v 55 %, major v 90 %), černí je zblízka **vycítí** a jdou jim naproti, červení se navzájem **nepřekrývají**. Tělo zabitého červeného je **jeden kus jídla** (za 2), který unese **jeden** černý mravenec do spíže. Přeživší raideři odejdou po 4 minutách. Černí mravenci cítí červené hnízdo na 90 px; když se u něj najdou **čtyři najednou**, hnízdo **obsadí**: patroly zmizí, nálety přestanou a je to **další hnízdo kolonie** (**+4 královny** a líhne se **o třetinu rychleji**).

**Mšice:** od **500 mravenců** se v normalu na mapě objeví **keřík** s pár mšicemi. Když je na mapě listí, mravenci ho začnou nosit mšicím a za každý snědený kousek přibude **další mšice** (nejvýš 15). Každá mšice si jednou za **30 sekund** vytvoří **kapku medovice** (víc než jednu nenosí), která jí visí na **zadečku**; mravenci ji sebírají **přímo ze zadečků mšic** a nosí do hnízda jako normální jídlo; čím víc mšic, tím víc medovice. V pheromonovém a terénním pohledu je to stejná tečka jako každá jiná potrava.

## Ukládání

Stav se ukládá automaticky každých 10 s, při skrytí karty a při zavření stránky do `localStorage` (klíč `ant-colony-save`, verzovaný formát). Pokud se tam nevejde nebo není dostupný, použije se IndexedDB (databáze `ant-colony`). Po obnovení stránky hra pokračuje bez úvodu; poškozené nebo neplatné uložení se ignoruje a začne nová hra.

## Technologie

TypeScript, Vite, Canvas 2D (`image-rendering: pixelated`), vitest (jsdom, `@napi-rs/canvas`, `fake-indexeddb`). Simulace (`src/sim`) je oddělená od vykreslování (`src/render`) a ovládání (`src/ui`), takže se testuje bez prohlížeče. Nasazení na GitHub Pages řeší `.github/workflows/pages.yml` (build s `base: './'`); spouští se při každém pushi do `main` (a ručně přes `workflow_dispatch`). Hra běží na https://austy246.github.io/ant-colony/. CI (`ci.yml`) spouští testy a build při pushi do `main` a u každého PR.

## Dokumentace

- Návrh: [`docs/superpowers/specs/2026-10-29-ant-colony-design.md`](docs/superpowers/specs/2026-10-29-ant-colony-design.md)
- Plán implementace: [`docs/superpowers/plans/2026-10-29-ant-colony.md`](docs/superpowers/plans/2026-10-29-ant-colony.md)
