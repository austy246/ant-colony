/** The list of all updates of the game ("Novinky"): newest first, shown over the game by the button next to "Nová hra". */

export interface Update {
  date: string;
  items: readonly string[];
}

export const UPDATES: readonly Update[] = [
  {
    date: '15. 11. 2026',
    items: [
      'Vzácnosti mravenců mají skutečné body: každý stupeň přidá rychlosti, zvědavosti a vytrvalosti 3 %. Přibyly dvě nové vzácnosti, Kosmický a Rainbow (duhový), vyšší vzácnosti jsou mnohem řidší a major už nemá bonus ke vzácnosti. Na kartách vykukuje z rámečku hlava mravence se svítícíma očima.',
      'Nové tlačítko Mravenci: sbírka karet všech mravenců kolonie s deseti vzácnostmi (od Obyčejného po Božského), řazení od nejvzácnějších, detail karty a terárium na 100 uschovaných mravenců.',
      'Milníky velikosti kolonie: 100 mravenců dá bonus zkušenosti, 200 odemkne tlačítko Výpad na červené hnízdo, 500 vytvoří superkolonii (další královny a tunel mezi hnízdy).',
      'Velcí mravenci mají vlastní, detailnější vzhled (velká hlava s očima a čelistmi).',
      'Nálet červených: mravenci vylézají z ústí hnízda jeden za druhým a hned míří k černému hnízdu.',
      'Červené hnízdo zhnědne, až když padne aspoň 95 % jeho obránců.',
      'Okusující mravenci se odtlačují, takže se netvoří chumly.',
    ],
  },
  {
    date: '14. 11. 2026',
    items: [
      'Tutorial pro režim Normal (9 karet, hra je během něj pozastavená).',
      'Výzkum je dražší, čím dál od středu, a s každým koupeným uzlem; zkušenosti už nerostou s počtem mravenců.',
      'Černí mravenci se odstrkují jako červení.',
      'Relaxační hudba a zvukové efekty ke každé činnosti, zvuk deště, vypínače Hudba a Efekty.',
      'Nové rameno výzkumu Příroda (zvědové, zimní zásoby, pastvina mšic, lov, pavoučí smysl); zkušenosti za objevování mapy.',
      'Výzkum za zkušenosti místo jídla a rameno Chemie: černí mravenci stříkají kyselinu na červené.',
      'Červení mravenci stříkají zelenou kyselinu, která zpomalí a oslabí soupeře.',
      'Horní levou lištu jde sbalit a znovu otevřít.',
      'Kruhový strom výzkumu na celou obrazovku.',
      'Houbové zahrady v podzemí jsou větší, zářivé a popsané.',
    ],
  },
  {
    date: '13. 11. 2026',
    items: [
      'Přehled podzemí se spížemi, komůrkami larev a houbovými zahradami; zahrady vyrábějí jídlo.',
      'Klik na mravence ho vybere (zezelená) a další klik ho pošle na dané místo.',
      'Druhé hnízdo (nástroj Hnízdo), mravenci nosí jídlo do bližšího.',
      'Déšť jako rychlé šikmé modré čáry; v prvních 3 minutách neprší.',
      'Zadání seedu na začátku hry, čas přežití a rekord.',
      'Volba líhnutí (směs, majoři, dělnice).',
      'Feromonové značky: návnada a zákaz.',
      'Roční období a déšť v režimu Normal.',
      'Varování před náletem v liště a posuvník strážců.',
      'Hnízdo červených začíná se 400 mravenci; pevnější a čitelnější stopy.',
      'Nová hra se potvrzuje dialogem ve stránce; kameny jsou 1,5× větší.',
    ],
  },
  {
    date: '11. 11. 2026',
    items: ['Pixelartový vzhled ovládání (písmo Pixelify Sans, zkosené okraje), zrnitá vinětace a okraj mapy.', 'Pavouk a jeho síť.'],
  },
  {
    date: '30. – 31. 10. 2026',
    items: [
      'Hnízdo červených mravenců s hlídkami, sběrem jídla, vlastním feromonem a nálety; černí ho mohou obsadit (+4 královny).',
      'Keř se mšicemi a medovicí, listí pro housenky.',
      'Super majoři (jeden ze 100) a lovení živé kořisti červenými.',
      'Realističtější keř, strážci kolem hnízda, mapa roste s kolonií až do 2000 mravenců.',
      'Mravenci obcházejí kameny a chodí víc v řadě; tajné klávesy B (přidá 100 mravenců) a V (nálet).',
    ],
  },
];

/** Shows the list of updates over `root`; the returned function closes it (a second call while open does nothing). */
export function showChangelog(root: HTMLElement): () => void {
  const existing = root.querySelector<HTMLElement>('.changelog');
  if (existing) return () => existing.remove();
  const card = document.createElement('div');
  card.className = 'tutorial changelog';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Novinky');
  const title = document.createElement('div');
  title.className = 'tutorial-title';
  title.textContent = 'Novinky ve hře';
  card.appendChild(title);
  const body = document.createElement('div');
  body.className = 'changelog-body';
  for (const u of UPDATES) {
    const h = document.createElement('div');
    h.className = 'changelog-date';
    h.textContent = u.date;
    const ul = document.createElement('ul');
    for (const it of u.items) {
      const li = document.createElement('li');
      li.textContent = it;
      ul.appendChild(li);
    }
    body.append(h, ul);
  }
  card.appendChild(body);
  const buttons = document.createElement('div');
  buttons.className = 'tutorial-buttons';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Zavřít';
  const shut = (): void => {
    card.remove();
    document.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') shut();
  };
  close.addEventListener('click', shut);
  document.addEventListener('keydown', onKey, true);
  buttons.appendChild(close);
  card.appendChild(buttons);
  root.appendChild(card);
  close.focus();
  return shut;
}
