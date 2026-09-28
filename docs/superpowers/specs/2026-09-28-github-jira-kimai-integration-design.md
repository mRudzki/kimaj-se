# Integracja GitHub + Jira -> Kimai (automatyczne wypełnianie czasu)

## Cel i kontekst

Michał (autor) chce automatycznie wypełniać timesheet w Kimai (self-hosted, `time.mindpal.co`) na
podstawie własnej aktywności na GitHubie i w Jirze, zamiast ręcznie wpisywać czas każdego dnia.
Narzędzie ma być używane lokalnie, uruchamiane bez znajomości programowania ani terminala —
dwuklik na plik wykonywalny.

**Sukces wygląda tak:** użytkownik wybiera miesiąc, dostaje gotową propozycję wpisów czasu
zbudowaną z realnej aktywności (commity, PR, zmiany statusów w Jirze, komentarze, założone
tickety), poprawia to co trzeba w prostej tabeli, i jednym kliknięciem wysyła do Kimai.

## Zakres

W zakresie:
- Lokalna aplikacja webowa (backend + UI w przeglądarce), dystrybuowana jako pojedyncza binarka.
- Pobieranie aktywności z GitHub (wszystkie repo dostępne dla użytkownika, wszystkie typy zdarzeń:
  commity, PR, review, komentarze) i z Jiry (zmiany statusu, komentarze, utworzenie ticketa).
- Automatyczne budowanie propozycji wpisów czasu per dzień roboczy w wybranym miesiącu.
- Interaktywne mapowanie repo GitHub / projektu Jira -> projekt+aktywność w Kimai, z zapisem na
  przyszłość.
- Ręczne uzupełnianie dni bez żadnej wykrytej aktywności.
- Zbiorcze podsumowanie miesiąca do przejrzenia/edycji przed wysłaniem.
- Zapis wpisów do Kimai przez jego REST API.

Poza zakresem (świadomie, YAGNI na start):
- Wsparcie dla wielu użytkowników Kimai jednocześnie / multi-tenant.
- Dystrybucja dla Windows/Linux (start: macOS, binarka przez `bun build --compile`).
- Edycja/usuwanie już wysłanych wpisów z poziomu aplikacji (robi się to w samym Kimai).
- Automatyczne rozpoznawanie świąt/urlopów — dni bez aktywności są zawsze traktowane jak dni do
  ręcznego uzupełnienia (użytkownik może wpisać 0h / urlop / pominąć).
- Synchronizacja w drugą stronę (Kimai -> GitHub/Jira).

## Architektura

- **Backend**: TypeScript na runtime Bun, framework Hono. Wystawia REST API dla frontendu i
  serwuje statyczny build frontendu.
- **Frontend**: React + Vite, zbudowany do plików statycznych.
- **Pakowanie**: `bun build --compile` do jednej binarki wykonywalnej. Frontend embedowany jako
  statyczne assety obok/w binarce.
- **Uruchomienie**: dwuklik na binarkę -> serwer startuje na wolnym lokalnym porcie -> automatyczne
  otwarcie domyślnej przeglądarki na `http://localhost:<port>`.
- **Storage**: pliki JSON w katalogu użytkownika `~/.kimaj-se/`:
  - `config.json` — URL i token do Kimai, GitHub PAT, URL+email+token do Jiry.
  - `mapping.json` — mapowanie repo GitHub / klucz projektu Jira -> `{ kimaiProjectId, kimaiActivityId }`.

  Nic z tego nie trafia do repozytorium `kimaj-se` (odpowiedni wpis w `.gitignore`).

## Integracje zewnętrzne

### Kimai REST API
- Autoryzacja: token API użytkownika (nagłówki zgodne z wersją instancji — do potwierdzenia przy
  implementacji przez `GET /api/doc.json` z tokenem z `.env`/`config.json`, instancja to
  `time.mindpal.co`).
- Potrzebne endpointy: lista projektów, lista aktywności, lista wpisów czasu w danym zakresie dat
  (do idempotencji), tworzenie wpisu czasu (`POST /api/timesheets` lub odpowiednik).

### GitHub API
- Autoryzacja: personal access token użytkownika, zapisany w `config.json`.
- Pobierane dane dla wybranego zakresu dat: commity (wszystkie repo, wszystkie branche do których
  user pushował), pull requesty (otwarcie/merge/review), komentarze. Źródłem repo jest lista repo
  dostępnych danemu tokenowi (nie tylko własne — też te, do których ma dostęp).

### Jira REST API
- Autoryzacja: email + API token (Atlassian), URL instancji — wszystko w `config.json`.
- Pobierane dane: zmiany statusu ticketów przypisane do usera, komentarze usera, tickety założone
  przez usera, w wybranym zakresie dat.

## Przepływ (data flow)

1. **Pierwsze uruchomienie / Ustawienia** — formularz na dane z sekcji Integracje, test połączenia
   z każdym API (prosty request weryfikujący token), zapis do `config.json`.
2. **Ekran główny** — wybór miesiąca, przycisk „Generuj".
3. Backend pobiera aktywność z GitHub i Jiry dla wybranego zakresu dat.
4. Backend pobiera istniejące wpisy czasu z Kimai dla tego zakresu — **dni, które mają
   jakikolwiek istniejący wpis, są pomijane** (idempotencja; nie dubluje wpisów przy ponownym
   uruchomieniu).
5. Backend grupuje pozostałą aktywność per dzień roboczy / per projekt (repo lub klucz Jira):
   - liczy rozpiętość czasową aktywności tego dnia per projekt (od pierwszego do ostatniego
     zdarzenia),
   - jeśli dzień dotyczy więcej niż jednego projektu, dzieli 8h **proporcjonalnie do rozpiętości
     aktywności** każdego projektu,
   - zaokrągla każdy blok do najbliższych 0.5h,
   - normalizuje tak, by suma bloków danego dnia zawsze wynosiła dokładnie 8h,
   - buduje sekwencyjne bloki begin/end (pierwszy blok zaczyna się od czasu pierwszej aktywności
     tego dnia, kolejne następują po sobie).
6. Jeśli repo/projekt Jira nie ma jeszcze wpisu w `mapping.json` — UI pokazuje ekran do
   przypisania go do projektu+aktywności w Kimai; zapis trafia do `mapping.json` i jest używany
   przy kolejnych uruchomieniach.
7. Dni robocze bez żadnej wykrytej aktywności (i bez istniejącego wpisu w Kimai) trafiają do
   podsumowania jako puste wiersze — użytkownik uzupełnia ręcznie (projekt, aktywność, opis,
   godziny) albo zostawia puste (dzień zostanie pominięty przy wysyłce).
8. **Zbiorcze podsumowanie miesiąca** — edytowalna tabela: dzień, projekt, aktywność, godziny,
   opis. Wszystko można poprawić przed wysłaniem.
9. „Wyślij do Kimai" — backend tworzy wpisy przez Kimai API dla wszystkich wierszy z
   uzupełnionymi godzinami > 0. Wynik (sukces/błąd per dzień) pokazany w UI.

## Model danych (pliki lokalne)

`config.json`:
```json
{
  "kimai": { "baseUrl": "https://time.mindpal.co", "token": "..." },
  "github": { "token": "..." },
  "jira": { "baseUrl": "...", "email": "...", "token": "..." }
}
```

`mapping.json`:
```json
{
  "github:owner/repo": { "kimaiProjectId": 12, "kimaiActivityId": 34 },
  "jira:PROJ": { "kimaiProjectId": 12, "kimaiActivityId": 35 }
}
```

## Obsługa błędów

- Błąd połączenia / zły token przy dowolnym API -> czytelny komunikat w UI z linkiem do Ustawień,
  nie blokuje reszty aplikacji.
- Brak mapowania dla repo/projektu -> blokuje wygenerowanie podsumowania dla tego dnia, dopóki
  użytkownik nie uzupełni mapowania (ekran mapowania pojawia się przed podsumowaniem).
- Błąd zapisu pojedynczego wpisu do Kimai (np. walidacja pola) -> reszta wpisów i tak się wysyła,
  błędny wiersz oznaczony w UI z treścią błędu, można poprawić i wysłać ponownie tylko ten wiersz.

## Testy

- Testy jednostkowe logiki agregacji dnia: rozpiętość czasowa, podział proporcjonalny między
  projektami, zaokrąglanie do 0.5h, normalizacja do sumy 8h — to czysta logika biznesowa, najwyższe
  ryzyko błędu, najłatwiejsza do przetestowania w izolacji.
- Testy klientów API (GitHub/Jira/Kimai) na mockowanych odpowiedziach HTTP.
- Bez testów e2e UI na start (narzędzie osobiste/małozespołowe, YAGNI).

## Otwarte pytania do potwierdzenia przy implementacji

- Dokładny kontrakt Kimai REST API (nagłówki autoryzacji, pola wymagane przy tworzeniu wpisu) —
  do zweryfikowania przez `GET /api/doc.json` z realnym tokenem na starcie implementacji.
