# AGENTS.md

## 1. Краткое резюме проекта
- `Bunker_browser` — монорепозиторий браузерной игры «Бункер»: сервер хранит комнаты и игровое состояние, клиент рендерит UI и отправляет действия, сценарии содержат правила игры (`server/src/index.ts`, `client/src/App.tsx`, `scenarios/src/classic.ts`).
- Стек: TypeScript + pnpm workspaces (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`).
- Протокол и типы общие для всех частей через `shared/src/index.ts` (интерфейсы + Zod-схемы сообщений/состояния).
- В репозитории используется один основной файл документации для агентов: `AGENTS.md` (этот файл).

## 2. Архитектура (server/client/shared/scenarios/assets) + карта папок
- `server/` — Express + WebSocket сервер, управление комнатами, авторизация токенами, overlay/overlay-control HTTP-роуты (`server/src/index.ts`).
- `client/` — React + Vite приложение с роутами `/`, `/lobby`, `/game` (`client/src/main.tsx`, `client/src/App.tsx`, `client/vite.config.ts`).
- `shared/` — контракты данных и валидация (типы `RoomState`, `GameView`, `OverlayState`, схемы `ClientMessageSchema`/`ServerMessageSchema`) (`shared/src/index.ts`).
- `scenarios/` — игровая логика и сессии сценариев, автозагрузка файлов сценариев из `scenarios/src` (`scenarios/src/index.ts`).
- `assets/` — изображения колод; сервер индексирует `assets/decks/<deckName>/*.{jpg,jpeg,png,webp}` (`assets/README.md`, `server/src/catalog.ts`).

Карта папок (фактическая):
```text
.
├─ server/
│  ├─ src/
│  └─ public/overlay/
├─ client/
│  └─ src/
├─ shared/
│  └─ src/
├─ scenarios/
│  ├─ src/
│  └─ tests/
├─ assets/
│  └─ decks/
├─ scripts/
├─ README.md
├─ MANUAL.md
├─ package.json
└─ pnpm-workspace.yaml
```

## 3. Как запустить локально (Windows/Linux)
Зависимости:
- Node.js LTS (в мануале рекомендован 20.x) (`MANUAL.md`).
- pnpm (workspace-проект, `pnpm@9.12.0`) (`package.json`, `pnpm-lock.yaml`).

Windows (готовые лаунчеры):
```powershell
.\run-dev.bat
.\run-selfhost.bat
```
- `run-dev.bat` вызывает `scripts/launchers/run-dev.ps1`, выставляет `PORT=3001`, `BUNKER_SERVE_CLIENT=false`, dev-identity (`scripts/launchers/run-dev.ps1`).
- `run-selfhost.bat` вызывает `scripts/launchers/run-selfhost.ps1`, собирает проект и запускает `node server/dist/index.js` (`scripts/launchers/run-selfhost.ps1`).

Linux/macOS (готовые скрипты):
```bash
./run-dev.sh
./run-selfhost.sh
```
- Скрипты выставляют нужные env для dev/prod режимов (`run-dev.sh`, `run-selfhost.sh`).

Ручной запуск через pnpm (из корня):
```bash
pnpm install
pnpm dev
pnpm build
pnpm start
pnpm typecheck
```
- Реальные скрипты определены в корневом `package.json`.

Переменные окружения:
- Корень: серверные override-переменные (`.env.example`).
- Сервер: `HOST`, `PORT`, `TRUST_PROXY`, `PUBLIC_ORIGIN`, `BUNKER_IDENTITY_MODE`, `BUNKER_ENABLE_DEV_SCENARIOS` (`server/.env.example`).
- Клиент: `VITE_IDENTITY_MODE`, `VITE_WS_URL`, `VITE_API_BASE`, `VITE_ASSET_BASE` (`client/.env.example`).

## 4. Как работает сеть и состояние
Транспорт и формат сообщений:
- Игровой транспорт — WebSocket; сервер поднимает `WebSocketServer` на том же HTTP-сервере (`server/src/index.ts`).
- Формат WS-сообщений типизирован и валидируется Zod-схемами (`shared/src/index.ts`: `ClientMessageSchema`, `ServerMessageSchema`).
- HTTP используется для служебных endpoint'ов: `/api/scenarios`, `/overlay`, `/overlay-control`, `/overlay-control/state`, `/overlay-control/save` (`server/src/index.ts`).

Где хранится room state и как обновляется:
- Комнаты живут в памяти процесса: `const rooms = new Map<string, Room>()` (`server/src/index.ts`).
- Снимок комнаты собирается в `buildRoomState`, рассылается в `broadcastRoomState` (`server/src/index.ts`).
- Для уменьшения трафика используется top-level patch: `diffTopLevel` и событие `statePatch` (`server/src/index.ts`, `shared/src/index.ts`).
- Игровой view по игроку формируется сценарием `session.getGameView(playerId)` и отправляется через `sendGameView`/`broadcastGameViews` (`server/src/index.ts`, `scenarios/src/classic.ts`).

Где валидация входящих действий:
- Сервер валидирует каждое входящее WS-сообщение через `ClientMessageSchema.safeParse` перед `switch`-обработкой (`server/src/index.ts`).
- Клиент валидирует входящие серверные WS-сообщения через `ServerMessageSchema.safeParse` (`client/src/wsClient.ts`).
- Сохранение Overlay Overrides валидируется `OverlayOverridesSchema.safeParse` (`server/src/index.ts`, `shared/src/index.ts`).

## 5. Сценарии
Как добавить новый сценарий:
- Создать файл в `scenarios/src` и экспортировать `scenario` типа `ScenarioModule` (`scenarios/src/classic.ts`, `scenarios/src/dev_test.ts`, `shared/src/index.ts`).

Как появляется в списке/регистрации:
- Лоадер `scenarios/src/index.ts` автоматически читает файлы `*.ts/*.js` в папке `scenarios/src` (кроме `index.*`) и импортирует `mod.scenario`.
- Сервер фильтрует dev-сценарии по `meta.devOnly` и env `BUNKER_ENABLE_DEV_SCENARIOS`, затем отдаёт список на `GET /api/scenarios` (`server/src/index.ts`).

## 6. Клиент (UI)
Ключевые страницы/роутинг:
- Роутинг через `react-router-dom`: `/` (Home), `/lobby`, `/game` (`client/src/App.tsx`).
- Точка входа клиента: `client/src/main.tsx`.

Принцип «клиент только рисует и отправляет actions»:
- Клиент отправляет действия (`startGame`, `revealCard`, `vote`, `applySpecial`, `updateSettings`, и т.д.) через `client.send(...)` (`client/src/App.tsx`).
- Игровые правила/переходы фаз реализованы в сценариях на сервере (`scenarios/src/classic.ts`, `scenarios/src/dev_test.ts`).
- Отдельный overlay UI не входит в React-клиент и живёт как статическая страница (`server/public/overlay/overlay.html`, `server/public/overlay/overlay.js`).

## 7. Кодстайл и правила внесения изменений
TS-правила:
- Включён `strict: true` и базовые строгие опции в `tsconfig.base.json`.
- Пакеты расширяют базовый tsconfig (`server/tsconfig.json`, `client/tsconfig.json`, `shared/tsconfig.json`, `scenarios/tsconfig.json`).

Инструменты форматирования/линта:
- ESLint/Prettier конфиги не обнаружены (проверено поиском по репозиторию: `rg --files -g "*eslint*" -g "*prettier*"`).
- Отдельного `lint`-скрипта в `package.json`-файлах нет (проверено: `package.json`, `server/package.json`, `client/package.json`, `shared/package.json`, `scenarios/package.json`).

Что нельзя делать:
- Не переносить игровую логику на клиент: изменения правил/фаз/резолва делаются в `scenarios/src/*` и серверной оркестрации (`server/src/index.ts`), а не в React-компонентах (`client/src/*`).
- Не менять сетевые payload'ы только в одном месте: любые изменения сообщений синхронно править в `shared/src/index.ts`, сервере и клиенте.
- Не вставлять HTML в overlay overrides: сервер и UI ожидают plain text + лимиты (`server/src/index.ts`, `shared/src/index.ts`, `server/public/overlay/overlay-control.js`).

## 8. Частые задачи (recipes)
Добавить карту/ассет:
1. Положить файлы в `assets/decks/<deckName>/...` (`assets/README.md`).
2. Допустимые расширения: `.jpg/.jpeg/.png/.webp` (`server/src/catalog.ts`).
3. Проверить, что нужный deckName совпадает с тем, что ожидает сценарий (`scenarios/src/classic.ts`, `scenarios/src/world_deck.ts`).

Добавить действие/ивент:
1. Добавить тип и Zod-схему в `shared/src/index.ts` (`ScenarioAction`, `ClientMessageSchema`, `ServerMessageSchema`).
2. Добавить отправку на клиенте (`client/src/App.tsx` или целевой компонент).
3. Добавить обработку на сервере в `switch (message.type)` (`server/src/index.ts`).
4. Добавить фактическую игровую логику в `handleAction` сценария (`scenarios/src/classic.ts`/`scenarios/src/dev_test.ts`).

Добавить поле в room state без поломки совместимости:
1. Добавить поле в `RoomState` + `RoomStateSchema` (желательно optional на переходном этапе) (`shared/src/index.ts`).
2. Наполнить поле в `buildRoomState` (`server/src/index.ts`).
3. Убедиться, что patch-рассылка `statePatch` остаётся корректной (`server/src/index.ts`: `diffTopLevel`, `broadcastRoomState`).
4. Обновить клиентские чтения/дефолты (`client/src/App.tsx` и соответствующие страницы).

## 9. Отладка и логирование
Где смотреть логи:
- Основные серверные lifecycle-логи: создание/вход/дисконнекты комнат (`server/src/index.ts`, `logRoomLifecycle`).
- Dev-логи включаются флагами (`BUNKER_DEV_LOGS`, `BUNKER_IDENTITY_MODE=dev_tab`) (`server/src/index.ts`, `scripts/launchers/run-dev.ps1`).

OBS/overlay отладка:
- При создании комнаты сервер печатает overlay URL и control URL (`printOverlayInfo` в `server/src/index.ts`).
- Debug overlay режим: параметр `debug=1` у `/overlay` (`server/public/overlay/overlay.js`).

Безопасность логов:
- Токены используются для доступа к overlay/control (`server/src/index.ts`), не добавляйте их в новые debug-логи и внешние отчёты.

## 10. Чеклист перед PR/коммитом
- Проверить типы во всех пакетах:
```bash
pnpm typecheck
```
- Проверить сборку:
```bash
pnpm build
```
- Прогнать существующие тесты сценариев:
```bash
pnpm -C scenarios test
```
- Ручная проверка критичных потоков: создание комнаты, старт игры, reconnect, overlay/view/control (`client/src/App.tsx`, `server/src/index.ts`, `server/public/overlay/*`).
- Тестов для `client` и `server` не обнаружено (проверено: `rg --files -g "**/*.{spec,test}.{ts,tsx,js}" client server shared scenarios`; найдено только `scenarios/tests/*`).

## 11. Приложение: ключевые файлы
- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `README.md`
- `MANUAL.md`
- `.env.example`
- `server/.env.example`
- `client/.env.example`
- `server/src/index.ts`
- `server/src/catalog.ts`
- `server/public/overlay/overlay.html`
- `server/public/overlay/overlay.js`
- `server/public/overlay/overlay.css`
- `server/public/overlay/overlay-control.html`
- `server/public/overlay/overlay-control.js`
- `server/public/overlay/overlay-control.css`
- `client/src/main.tsx`
- `client/src/App.tsx`
- `client/src/wsClient.ts`
- `client/src/config.ts`
- `client/src/storage.ts`
- `client/src/pages/HomePage.tsx`
- `client/src/pages/LobbyPage.tsx`
- `client/src/pages/GamePage.tsx`
- `shared/src/index.ts`
- `scenarios/src/index.ts`
- `scenarios/src/classic.ts`
- `scenarios/src/dev_test.ts`
- `scenarios/src/world_deck.ts`
- `scenarios/src/threat_modifier.ts`
- `scenarios/tests/dev_test.spec.ts`
- `scenarios/tests/threat_modifier.spec.ts`
