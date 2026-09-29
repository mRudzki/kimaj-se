# kimaj-se
Nie wypełniaj lokalnie Kimai - zamiast tego kimaj se a apka zrobi robotę za ciebie
Lokalna aplikacja, ktora automatycznie wypelnia timesheet w [Kimai](https://www.kimai.org/) na podstawie Twojej
aktywnosci na GitHubie i w Jirze. Wybierasz miesiac, dostajesz gotowa propozycje wpisow czasu zbudowana z realnej
aktywnosci (commity, PR, zmiany statusow w Jirze, komentarze), poprawiasz co trzeba w prostej tabeli i jednym
klikniecim wysylasz do Kimai.

Dziala lokalnie jako pojedyncza binarka — bez instalowania Node/Bun po stronie koncowego uzytkownika, bez terminala.

## Instalacja

### Wymagania (tylko do budowania)

- [Bun](https://bun.sh) 1.4+

```bash
brew install oven-sh/bun/bun
```

### Budowanie

```bash
git clone git@github.com:mRudzki/kimaj-se.git
cd kimaj-se
bun install
bun run build
```

Powstanie folder `dist/` z plikiem wykonywalnym `dist/kimaj-se` oraz statycznymi zasobami frontendu w
`dist/web/`. Caly folder `dist/` mozna skopiowac gdziekolwiek (np. na Pulpit) — binarka i `dist/web/` musza
zostac razem, obok siebie.

### Uruchomienie

```bash
./dist/kimaj-se
```

Otworzy sie przegladarka na `http://localhost:<port>` (port jest losowy, wolny). Serwer nasluchuje wylacznie na
`127.0.0.1` — nie jest dostepny z sieci lokalnej.

## Pierwsza konfiguracja

Wejdz w **Ustawienia** i uzupelnij:

### Kimai
- **URL instancji** — adres Twojego Kimai, np. `https://time.mindpal.co`.
- **Token API** — wygeneruj w Kimai: profil uzytkownika -> API access -> Create API token.

### GitHub
- **Personal access token** — GitHub -> Settings -> Developer settings -> Personal access tokens (classic) ->
  Generate new token.
- **Wymagany zakres: `repo` (pelny).** Bez niego commity i pull requesty z prywatnych repozytoriow beda
  niewidoczne dla aplikacji — "Testuj polaczenia" ostrzeze Cie, jesli tokenowi brakuje tego zakresu.

### Jira
- **URL instancji** — np. `https://twojafirma.atlassian.net`.
- **Email** — adres, ktorym logujesz sie do Jiry/Atlassian.
- **Token API** — Atlassian -> Account settings -> Security -> API tokens -> Create API token.

Po uzupelnieniu kliknij **Testuj polaczenia**, a nastepnie **Zapisz**. Dane zapisywane sa lokalnie w
`~/.kimaj-se/config.json` — nigdy w repozytorium.

## Uzycie

1. Na ekranie glownym wybierz miesiac i kliknij **Generuj**.
2. Jesli trafisz na repo/projekt Jira bez przypisanego projektu w Kimai — przypisz je (zapamietamy na przyszlosc).
3. W podsumowaniu popraw projekt, aktywnosc, godziny lub opis dla dowolnego wiersza. Dni robocze bez wykrytej
   aktywnosci maja 0h — uzupelnij je recznie, jesli pracowales. Weekendy nie sa pokazywane.
4. Kliknij **Wyslij do Kimai**. Mozna bezpiecznie klikac ponownie po poprawieniu bledow — wiersze juz wyslane
   pomyslnie nie zostana zduplikowane.

## Tryb deweloperski

W dwoch terminalach:

```bash
bun run dev:server   # backend na :3001
bun run dev:web      # frontend Vite z live-reload
```

Testy: `bun test`.
