# Faza 3: Agent UI (chat, sessions, tool calls, patches, diff review)

> Plan implementacji — Agent-First IDE (Tauri + React + OpenCode)
> Zależy od: Faza 1 (UI scaffold), Faza 2 (OpenCode integration)
> Numer Issue: #3
> Link do Issue: https://github.com/Finfinder/cortex-ide/issues/3
> Branch: `feat/0.0.1/Issue/3`

## Cel fazy
Zbudować pełny interfejs agenta: chat z streamingiem, lista sesji, wywołania narzędzi (tool calls), podgląd patchy z review przez prosty diff viewer (react-diff-viewer-continued + git diff jako opcja). Po tej fazie użytkownik może rozmawiać z agentem, widzieć co robi, i reviewować/aprobować patche.

## Stack
- **React 19.2** — komponenty UI
- **react-diff-viewer-continued** — review patchy (unified/split, read-only)
- **git diff jako opcja** — surowy tekst, preformatted/monospace
- **OpenCode SSE** — streaming z Fazy 2

## Zadania

### 3.1 Chat interface
- Komponent `<ChatPanel>` z listą wiadomości
- Streaming render: `message.delta` → append do bieżącej wiadomości
- Render thinking, tool use whith command and response
- Markdown rendering (react-markdown + remark-gfm)
- Code blocks z syntax highlight (prismjs / shiki — lekki)
- Input box z multi-line, historią (↑/↓), submit (Ctrl+Enter)
- Cancel generation (stop button → `POST /session/:id/cancel`)
- Reuse: `react-hooks-best-practices`, `react-performance` (virtualization dla długich chatów)

### 3.2 Sessions list
- `<SessionList>` w sidebarze
- Nowa sesja, przełączanie, rename, delete
- Persistencja: OpenCode zarządza sesjami (SDK), frontend tylko wyświetla
- Wyszukiwarka sesji (filter by title/content)
- Reuse: `react-architecture` (state locality, URL state)

### 3.3 Tool calls display
- `<ToolCall>` komponent: nazwa narzędzia, args (JSON), status (pending/running/done/error), result
- Collapsible: zwiń/rozwiń args i result
- Streaming: `tool.call` → pending, `tool.result` → done
- Typy: `ToolCall { id, name, args, status, result, error }`
- Reuse: `react-component-design` (stable props, controlled)

### 3.4 Patch review (KLUCZOWE)
- `<PatchReview>` komponent:
  - Plik: ścieżka, status (added/modified/deleted/renamed)
  - Diff: **react-diff-viewer-continued** (unified/split, read-only)
  - **Toggle: "Diff viewer" vs "Git diff"** (surowy `git diff` preformatted)
  - Akcje: **Approve**, **Reject**, **Edit** (otwórz w zewnętrznym edytorze — NIE w aplikacji, nie mamy edytora)
- Patch pochodzi z OpenCode (event `patch`)
- Kolejka patchy: review jeden po drugim
- Batch: Approve all / Reject all
- Reuse: `react-diff-viewer-continued` z Fazy 1, `GitDiffOutput` z Fazy 1

### 3.5 Diff viewer integration (react-diff-viewer-continued)
- Props: `oldContent` (oryginał z filesystem), `newContent` (patched)
- Mode: unified (default) / split (toggle)
- Syntax highlight per język (basic, map extension → language)
- Hide/show line numbers
- **Read-only** — nie edytujemy, tylko review

### 3.6 Git diff (opcja)
- Komenda Tauri `git_diff(cwd, file_path?)` → surowy tekst
- `<GitDiffOutput raw={string} />` — preformatted, monospace, +/- kolorowanie CSS
- Toggle w PatchReview: "Pokaż jako git diff" (gdy plik jest w repo git)
- Fallback gdy plik nie w repo: tylko react-diff-viewer-continued

### 3.7 Agent selector
- Dropdown z listą agentów (z repo: 15 agentów, migracja w Fazie 5)
- Per-agent: model wraz z opcją Thinking Effort jeśli dostępne dla danego modelu, small_model, MCP enabled (z Fazy 2)
- Przy wyborze modelu ma być jego opis (maks kontekst, koszty, itp.)
- Default agent: `software-engineer`
- Reuse: `react-component-design` (controlled select)

### 3.8 Status indicators
- OpenCode connection status (connected/disconnected/error) — z Fazy 2
- Token counter (used / limit) z compaction indicator
- Jeśli dostępne np. w OpenRouter pobieraj i wyświetlaj również koszt
- Active tool calls counter
- Reuse: `react-performance` (memo, stable props)

### 3.9 Error handling
- Błąd OpenCode (crash, timeout) → banner z retry
- Błąd tool call → inline error w `<ToolCall>`
- Błąd patch (conflict) → modal z opcją resolve/reject
- Reuse: `react-architecture` (error boundaries)

### 3.10 Keyboard shortcuts
- `Ctrl+Enter` — submit message
- `Ctrl+N` — new session
- `Ctrl+K` — command palette (akcje, agent switch)
- `Esc` — cancel generation / close modal
- Reuse: `react-accessibility` (focus management)

### 3.11 Accessibility
- ARIA roles: chat (log), messages (article), tool calls (region)
- Keyboard navigation: Tab przez wiadomości, tool calls, patche
- Screen reader: ogłoszenia streaming (polite), tool call status
- Reuse: `ensuring-accessibility`, `react-accessibility`

### 3.12 Testy
- Test ChatPanel (streaming, markdown, cancel)
- Test SessionList (switch, rename, delete)
- Test ToolCall (collapsible, status)
- Test PatchReview (approve/reject, diff viewer toggle, git diff toggle)
- Test agent selector
- E2E: full flow — new session → send message → tool call → patch → approve
- Reuse: `react-testing`, `testing-ts-js`

## Deliverables
- [x] ChatPanel z streamingiem i markdown (`src/components/Chat/`)
- [x] SessionList z przełączaniem/wyszukiwarką (`src/components/Sessions/`)
- [x] ToolCall komponent (collapsible, status) (`src/components/ToolCall/`)
- [x] PatchReview z react-diff-viewer-continued + git diff toggle (`src/components/PatchReview/`)
- [x] Agent selector z per-agent config (`src/components/AgentSelector/`)
- [x] Status indicators (connection, tokens, tool calls) (`src/components/StatusBar/`)
- [x] Error handling (banner z retry, inline error w ToolCall) (`src/components/ErrorBanner/`)
- [x] Keyboard shortcuts (Ctrl+Enter, Ctrl+N, Ctrl+K, Esc)
- [x] Accessibility (ARIA roles: log/article/region, aria-live, keyboard nav)
- [x] Testy jednostkowe (ToolCall, SessionList, PatchReview, patchUtils — 12 nowych testów, wszystkie 78 przechodzą); E2E odroczone do osobnego zadania

## Zależności
- **Faza 1**: Tauri scaffold, DiffViewer, GitDiffOutput, IPC wrapper
- **Faza 2**: OpenCode SDK, SSE, sessions API

## Reuse z repo
- `react-architecture` — feature boundaries, state locality, URL state
- `react-component-design` — props, controlled/uncontrolled, stable contracts
- `react-hooks-best-practices` — useEffect, useSyncExternalStore, custom hooks
- `react-performance` — memo, virtualization, streaming
- `react-styling-and-css` — CSS Modules, design tokens
- `react-accessibility` — ARIA, focus, keyboard
- `ensuring-accessibility` — WCAG 2.1 AA
- `react-testing` — RTL, a11y queries, mock API
- `testing-ts-js` — unit, integration, async
- `reviewing-frontend` — antywzorce, hook quality
- `typescript-best-practices` — discriminated unions (Event types)
- `javascript-modern-patterns` — async iterables, immutability
- `performance-and-memory-js` — streaming, backpressure
- ~~`integrating-monaco-editor`~~ — NIE UŻYWAMY

## Kryteria akceptacji
1. ChatPanel renderuje streaming wiadomości z markdown i code blocks
2. SessionList pozwala tworzyć/przełączać/usuwać/wyszukiwać sesje
3. ToolCall wyświetla nazwę, args, status, result (collapsible)
4. PatchReview pokazuje diff (react-diff-viewer-continued) z toggle do git diff
5. Approve/Reject patcha działa (wysyła decyzję do OpenCode)
6. Agent selector pozwala wybrać agenta z per-agent config
7. Status indicators pokazują connection, tokens, tool calls
8. Błędy (crash, timeout, conflict) są obsługiwane z retry
9. Keyboard shortcuts działają (Ctrl+Enter, Ctrl+N, Ctrl+K, Esc)
10. Accessibility: ARIA roles, keyboard nav, screen reader ogłoszenia
11. Wszystkie testy przechodzą

## Ryzyka
- **Streaming performance** — długie chaty mogą lagować; rozwiązanie: virtualization (`@tanstack/react-virtual`), memo
- **Markdown XSS** — sanitize HTML (DOMPurify), nie renderuj raw HTML
- **Diff viewer z dużymi plikami** — react-diff-viewer-continued może być wolny; rozwiązanie: lazy load, chunking
- **Patch conflict** — gdy plik zmienił się na dysku; rozwiązanie: re-read przed review, ostrzeżenie

## Changelog
- 2026-07-27 — Rozpoczęcie implementacji na branchu `feat/0.0.1/Issue/3` (Issue #3).
- 2026-07-27 — Implementacja zadań 3.1-3.12: ChatPanel (streaming, markdown, cancel), SessionList (create/switch/delete/search), ToolCall (collapsible), PatchReview + PatchQueue (diff viewer/git diff toggle, approve/reject/batch, edit external przez `openPath`), AgentSelector, StatusBar (SSE status, tokeny, koszt, tool calls), ErrorBanner z retry, keyboard shortcuts, ARIA. 12 nowych testów jednostkowych; pełny zestaw 78/78 przechodzi.
- Odchylenie od planu: renderowanie markdown bez DOMPurify — react-markdown domyślnie nie renderuje raw HTML (brak `rehype-raw`), co eliminuje wektor XSS; syntax highlight realizowany przez style CSS (klasy `language-*`) zamiast prismjs/shiki (lekko, zgodnie z planem "lekki"). Virtualizacja długich chatów odroczona (memo + auto-scroll wystarczają na MVP). Decyzje approve/reject patchy są na razie lokalne (UI state) — wysyłka do OpenCode gdy SDK udostępni endpoint.

## Code Review Findings
- 2026-07-27 — Przeprowadzono code review (agent code-reviewer). Werdykt: **APPROVE** z minor follow-ups.
- Ustalenia naprawione po review:
  - (minor) `git_diff` cwd: zamiast nieustawianego `window.__CORTEX_CWD__` cwd przekazywane przez `AgentProvider` prop i context (`useAgent().cwd`).
  - (minor) Lint w plikach testowych: `React.ReactElement` → import typu `ReactElement`; `global`/`RequestInfo` → `globalThis`/`string | URL | Request`.
  - (minor) Precedencja operatorów w warunku historii inputa (ChatInput) — nawiasy dla czytelności.
  - (minor) Usunięto nieużywane zależności: `dompurify`, `@types/dompurify`, `@tanstack/react-virtual` (XSS pokryty przez brak `rehype-raw`; wirtualizacja odroczona).
  - (minor) Inline import typu w PatchQueue → zwykły import.
- Ustalenia odroczone (info): wydzielenie `useAgent` do osobnego pliku (fast-refresh warning, zgodne z istniejącym ThemeProvider), focus trap w command palette, runtime guardy SSE, wirtualizacja długich chatów.
- 2026-07-27 — Naprawa błędów baseline (lint/tsc/build) oraz issues SonarQube for IDE:
  - tsc: dodano `@types/node` + `"types": ["vitest/globals", "node"]` w tsconfig; naprawiono `e2e.test.ts` (unused var, typ properties.part). **tsc: 0 błędów.**
  - lint: `global`→`globalThis` w client.test.ts; `require()`→import `execSync` w e2e.test.ts; `globals.node` w eslint.config.js; useOpencodeHealth — deferred initial check (set-state-in-effect) i usunięcie zbędnej zależności `baseUrl`. **lint: 0 errors** (2 warnings fast-refresh).
  - build: `npm run build` przechodzi (wcześniej padał na baseline'owych błędach tsc).
  - Sonar S3776: ChatInput `handleKeyDown` — wydzielono `historyUp`/`historyDown`, spłaszczono if-y (cognitive complexity 17→<15).
  - Sonar S6759: readonly props w PatchReview, PatchQueue, AgentProviderProps.
  - Sonar S6819: `<dialog>` zamiast `role="dialog"` (App.tsx command palette); `<fieldset>` zamiast `role="group"` w PatchReview toggles.
  - Sonar S4624: usunięto nested template literals w PatchReview (zmienne klas wyliczone przed JSX).
  - Sonar S3358: nested ternary w diffArea → funkcja `renderDiffArea()` z if-ami.
- Stan końcowy: **tsc 0 błędów, lint 0 errors, testy 78/78, build ✓**.
- 2026-07-27 — Testy E2E (Playwright) — deliverable 3.12 uzupełnione:
  - Nowe: `playwright.config.ts` (webServer Vite :1420, chromium, retries CI), `e2e/fixtures/opencode.ts` (mock REST+SSE OpenCode — backend zewnętrzny, zgodnie z mock-external-only), Page Objects (`SessionsPage`, `ChatPage`, `PatchReviewPage`), 21 testów w 5 specach: sessions (CRUD+search), chat (markdown, Ctrl+Enter, historia, empty state), toolcalls (collapsible, error), patches (queue, approve, batch reject, toggle diff viewer/git diff), app (Ctrl+N/Ctrl+K/Esc, status bar, error banner+retry, agent selector).
  - Zmiany w aplikacji motywowane E2E: `src/lib/ipc.ts` + `App.tsx` — dynamic import `@tauri-apps/*` (ładowanie poza Tauri); **BUGFIX `AgentContext`**: patche z załadowanych wiadomości (REST) trafiają do kolejki (wcześniej znikały po reload sesji — wykryte przez E2E).
  - Stabilność: **21/21 × 3 kolejne przebiegi headless**. `test-results/`, `playwright-report/`, `.playwright-mcp/` dodane do .gitignore. Skrypt `npm run test:e2e`.
- 2026-07-27 — Code review E2E (agent code-reviewer): **APPROVE**. Ustalenia: P3 adresowane (PATCH /session/:id w mocku); odroczone (minor): spójność exact-vs-regex nazw w PO, locator `[title]` dla token counter (rozważyć role/aria-label), asercje mock-state po asercjach UI jako konwencja, `crypto.randomUUID()` dla ID mocków, unit test dedupe patchy w reducerze.
- 2026-07-27 — Poprawki po code review (Issue #4, branch `fix/0.0.1/Issue/4`):
  - **Fix 1 (HIGH)** — `src/lib/agent/AgentContext.tsx`: dodano `if (!backendReady) return;` na początku SSE useEffect (zapobiega próbom połączenia SSE gdy backend Tauri nie jest gotowy); tablica zależności zmieniona z `[handleEvent]` na `[handleEvent, backendReady]`.
  - **Fix 2 (MEDIUM)** — `src/lib/ipc.ts`: usunięto martwy kod (martwe typy komend Tauri); pozostawiono `invoke`, `listen`, `BackendReadyPayload`.
  - **Fix 3 (MEDIUM)** — nowe testy jednostkowe: `src/components/ErrorBanner/ErrorBanner.test.tsx` (8 testów: stany backendReady, debounce błędów SSE 4000ms, recovery przed debounce, cleanup timerów, onRetry, refreshSessions fallback) i `src/components/StatusBar/StatusBar.test.tsx` (8 testów: stany SSE, tokeny, koszt `$ 0.0500`, aktywne tool calls).
  - **LOW-1 (po code review)** — `BackendReadyPayload` użyty w `AgentContext.tsx` jako `listen<BackendReadyPayload>('backend://ready', ...)` (zamiast `listen<undefined>`) — dokumentacja kontraktu IPC.
  - Walidacja: **tsc 0 błędów, 94/94 unit testów PASS** (2 E2E pre-existing — wymagają serwera OpenCode). Code review (agent code-reviewer): **APPROVED**.
