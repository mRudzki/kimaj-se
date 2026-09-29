# Synchronizacja z Figmą jako źródło aktywności

## Cel i kontekst

Figma ma być trzecim źródłem aktywności obok GitHuba i Jiry. Praca w Figmie (zapisane wersje plików,
komentarze) zamienia się w wiersze w podsumowaniu miesiąca, tak jak commity i zmiany w Jirze.
Figma wchodzi do istniejącego przepływu `ActivityEvent -> aggregateDay -> mapping.json`.

Założenia (potwierdzone):
- Tylko aktywność samego użytkownika.
- Figma Personal Access Token zapisany w `config.json`.
- Jeden plik Figmy = jeden projekt w Kimai. Wiele pages w pliku należy do tego samego projektu, więc
  pages nie mają własnego mapowania.
- Brak osobnego przycisku: Figma wchodzi do „Generuj" automatycznie, gdy jest skonfigurowana.

Poza zakresem (YAGNI):
- Matchowanie po pages (API wersji nie wskazuje page).
- Osobny przycisk synchronizacji.
- Automatyczne wykrywanie teamów (API nie zwraca ich listy).
- Mapowanie na poziomie folderu.
- Synchronizacja w drugą stronę.

## Konfiguracja i klient (`src/clients/figmaClient.ts`)

- `AppConfig` dostaje opcjonalną sekcję `figma: { token: string; teamIds: string[] }`. Bez niej Figma jest
  pomijana, a „Generuj" działa jak dotychczas.
- Ekran Ustawienia dostaje sekcję Figma (token, lista team id wpisywana ręcznie). „Testuj połączenia" woła
  `GET /v1/me`.
- `fetchFigmaActivity(config, since, until): Promise<ActivityEvent[]>`:
  1. `GET /v1/me` daje user id.
  2. Dla każdego `teamId`: `GET /v1/teams/:id/projects`, potem `GET /v1/projects/:id/files`.
  3. Pliki z `last_modified` przed `since` są odrzucane.
  4. Dla pozostałych: `GET /v1/files/:key/versions` (tylko wersje z user id użytkownika w zakresie dat) oraz
     `GET /v1/files/:key/comments` (tylko komentarze użytkownika w zakresie dat). Obsługa stronicowania.
- `ActivityEvent.source` rozszerzone o `"figma"`. Jedna wersja lub komentarz to jedno zdarzenie, `label` to
  nazwa pliku.
- Błąd Figmy (zły token, limit zapytań) nie blokuje GitHuba i Jiry. Endpoint zwraca ostrzeżenie w
  podsumowaniu, UI je pokazuje.

## Matchowanie

Kolejność ustalania `projectKey` dla zdarzenia Figmy:
1. **Klucz Jiry** w nazwie pliku, etykiecie wersji lub komentarzu (regex `[A-Z][A-Z0-9]+-\d+`). Jeśli
   `jira:KEY` ma wpis w `mapping.json` (także `ignored`), zdarzenie dostaje `jira:KEY`.
2. W przeciwnym razie `figma:file:<fileKey>`. To osobny wpis w `mapping.json`. Brak wpisu uruchamia
   istniejący flow brakujących mapowań.

Prezentacja i podpowiedzi:
- Wpis w `mapping.json` dostaje opcjonalne pole `label` (nazwa pliku i folderu), żeby ekrany
  `MappingPage` i `MappingsManagerPage` pokazywały czytelną nazwę zamiast klucza. Wpisy bez `label`
  (GitHub, Jira) działają bez zmian.
- Preselekcja projektu Kimai przy nowym pliku: (a) projekt użyty przez inny plik z tego samego folderu,
  (b) w razie braku projekt Kimai o najbardziej podobnej nazwie (normalizacja, zawieranie). To tylko
  sugestia, użytkownik zatwierdza.

## Agregacja i UI

- `aggregateDay` bez zmian: Figma to zwykłe źródło, dzień z wieloma źródłami dzieli 8h proporcjonalnie do
  rozpiętości aktywności.
- Opisy wierszy to nazwy plików.
- UI pokazuje ostrzeżenie o błędzie Figmy, jeśli wystąpiło.

## Testy

- Klient Figmy z mockowanym `fetch`: filtr po user id, zakres dat, stronicowanie, brak konfiguracji.
- Reguła matchowania: klucz Jiry vs `figma:file:<key>`.
- Trasa `generate`: Figma nieskonfigurowana, błąd Figmy (ostrzeżenie, reszta działa).
- Rozszerzenie `MappingEntry` o `label` i preselekcja.
