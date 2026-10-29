# Mravenci – návrh hry (první verze)

Repozitář: `austy246/ant-colony` (pojmenoval autor hry).
Stav: schváleno autorem hry 2026-10-29.

## Záměr a proč

Pixel-art 2D hra v prohlížeči: simulace vývoje mravenčí kolonie z pohledu mravence (svět je z jehličí, větviček, kamenů a mechu). Hráč je spíš pozorovatel než velitel. Rozmístí kořist a sleduje, jak ji mravenci najdou, jak vznikne feromonová cestička do hnízda a jak kolonie roste. Hodnotou hry je pohled na to, jak jednoduchá pravidla vytvoří živou kolonii, a dobrá pixelartová grafika. Autor chce začít s malým rozsahem, vypiplat vzhled a pak hru rozšiřovat.

## Cíle první verze

1. Úvodní sekvence: celá mapa oddáleně, plynulý zoom na královnu, ta vyhrabe komůrku a zmizí z mapy (je pod zemí), pak se objeví první mravenec.
2. Hráč rozmisťuje kořist z lesa: brouk, housenka, hmyz (např. moucha), zdechlina, lesní malina, kus houby. Brouk a moucha jsou živí: brouk chodí a brání se (první mravenec, který se ho dotkne, zahyne, při druhém doteku brouk zahyne a stane se zdechlinou), moucha při prvním doteku odskočí a při druhém se stane zdechlinou.
3. Mravenci kořist samostatně hledají, nesou ji do hnízda a značkují feromonovou stopu, kterou ostatní sledují. Stopa se posiluje s provozem a časem slábne.
4. Kolonie roste podle přinesené potravy: za donesenou potravu královna líhne další mravence (konkrétní kurz potrava → mravenci je ladicí parametr, určí builder). Za každých 100 donesených jednotek potravy přibude královna (nejvýše 8) a líhnutí se úměrně zrychlí.
5. Posun po mapě a zoom (myš/dotyk).
6. Přepínač feromonového pohledu („pohled mravenců"): ztmavená mapa, tenká (zhruba 1 pixel) modrá stopa k potravě, jemná oranžová záře kolem hnízda, mravenci jako světlé body.
7. Terén ovlivňuje pohyb: kameny a velké větve mravence výrazně zpomalují (obcházejí je), drobné větvičky mírně, jehličí jen málo. (Tohle je odhad autora návrhu k potvrzení, hráč s tím souhlasil jen obecně.) Volitelný třetí pohled zobrazuje průchodnost (červená kameny, oranžová větvičky, žlutá jehličí).
8. Stav hry se ukládá do local storage a po obnovení stránky se pokračuje.
9. Mravenci nestárnou a neumírají věkem (rozhodl autor hry, protože později přibudou predátoři); zahynout mohou jen v konfliktu (brání se brouk); predátoři jsou plánovaní na později. Královna v první verzi neumírá, takže nevzniká prohra (volba autora návrhu).

## Rozhodnutí o hnízdě a kořisti (potvrdil autor hry)

- **Hnízdo:** na mapě je jen vchod na povrchu. Mravenci do něj mizí, královna a vajíčka zůstávají skryté. Podzemní pohled s komůrkami je záměrně odložen na později.
- **Umísťování kořisti:** hráč vybere druh kořisti v liště a klikne do mapy. Počet je neomezený, položený kus lze přesunout nebo smazat.
- **Nošení:** malé kusy (malina, kousek houby) unese jeden mravenec. Velké (brouk, housenka, zdechlina) se rozdělí na více dílků, které mravenci nosí postupně. U velké kořisti se tak stopa zesiluje.

## Další volby autora návrhu (autor hry s nimi souhlasil při revizi, ne jednotlivě)

- Bez kořisti se mravenci čile potulují po okolí, ne jen stojí.
- Mapa je při nové hře generovaná podle seedu (seed se uloží), ne ručně kreslená.
- Měřítko: 1 pixel kresby = 4 pixely obrazovky při výchozím zoomu, mravenec asi 11×7 pixelů kresby, feromonová mřížka má rozlišení kresby.
- Překážky mravence zpomalují a ti je obcházejí. Neprůchodné překážky v první verzi nejsou.
- Uložení je verzované. Pokud se nevejde do local storage, přejde se na IndexedDB.
- Úvodní sekvence se přehraje jen při nové hře a lze ji přeskočit.

## Mimo rozsah první verze (non-goals)

Nepřátelé, roční období, počasí, více kolonií, hráč jako velitel mravenců, zvuk a hudba (builder může přidat jednoduchý, pokud je to levné), mobilní optimalizace, vyšší rozlišení grafiky (to přijde ve „skutečné hře" později, první verze má nízké rozlišení), účty a online funkce.

## Anti-cíle

- Grafika působící jako generický placeholder: vzhled je hlavní hodnota projektu.
- Feromonová stopa hrubá, rozmazaná nebo „tlustá".
- Cokoli „nepřirozeného" v lese (lízátka, ohryzky, lidské předměty).
- Mravenci chodící po pevných drahách bez emergentního chování.

## Vizuální směr (rozhodnuto autorem)

Směr „A – lesní hrabanka": teplá hnědá půda, zelený mech, oranžové jehličí (vždy ve dvojicích), spadané listí, kameny s mechem, větve s kůrou, měkké stíny, jemná vinětace. Mravenci jsou **celí černí** (původní návrh měl rezavý hrudník, autor to zamítl). Pohled shora na pixelartovou mapu, inspirace: farmářské RPG v pixelartu (obrázek přiložený autorem). Referenční náčrt: `docs/design/visual-style-v2.html` (generovaný kódem, ne finální grafika; paleta: půda `#4a3524 #54402c #3e2c1d #5f4a33 #352517`, jehličí `#c9822f #9b5d22`, mech `#4f7a2e #3d6023 #68964a`, kameny `#5d5f5b #797b76 #93958f`).

## Omezení a technická rozhodnutí

- Běží celé v prohlížeči, bez serveru. Stav v local storage.
- Hostování: GitHub Pages z repozitáře `austy246/ant-colony` (volba autora návrhu).
- Technologie (volba autora návrhu, builder může zdůvodněně změnit): TypeScript + Vite, vykreslování přes Canvas nebo PixiJS s `image-rendering: pixelated`; simulace odděleně od vykreslování, aby šla testovat bez prohlížeče.
- Jazyk rozhraní: čeština (volba autora návrhu).
- Vlastník komunikuje česky; kód a komentáře builder volí podle konvence projektu, dokumentace česky.

## Ponecháno na builderovi

Architektura simulace (mřížka feromonů vs. agenti, difúze a vypařování), velikost mapy, počet mravenců a výkonnostní limity, přesné ladění feromonů a růstu kolonie, tvorba sprite assetů (procedurálně nebo kreslené), ovládání dotykem, struktura repozitáře, testy a CI nasazení na Pages.
