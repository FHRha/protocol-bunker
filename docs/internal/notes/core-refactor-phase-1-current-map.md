# Core Refactor Phase 1 Current Map

## Статус

Фаза 1 завершена.

Текущий статус фаз:
- `Phase 1` — `complete`
- `Phase 2` — `complete`
- `Phase 3` — `complete`
- `Phase 4` — `complete`
- `Phase 5` — `complete`
- `Phase 6` — `complete`
- `Phase 7` — `complete`
- `Phase 8` — `complete`
- `Phase 9` — `partial`
- `Phase 10` — `partial`
- `Phase 11` — `partial`

Цель этой записи:
- зафиксировать фактические текущие монолиты;
- выделить первые реальные точки распила;
- привязать дальнейшие фазы к конкретным файлам и зонам ответственности.

## Главные монолиты сейчас

### `server/src/index.ts`

Факты:
- размер: `6126` строк;
- количество `case "..."` в message handling: `38`;
- количество top-level `function`: `165`.

Что там уже сейчас смешано в одном файле:
- env/config resolution;
- HTTP bootstrap;
- CORS/origin/security plumbing;
- asset/locale/overlay path resolution;
- overlay catalog/preset logic;
- room lifecycle;
- reconnect/kick/absence timers;
- host transfer;
- websocket routing;
- control/overlay HTTP endpoints;
- game action dispatch;
- room/game payload assembly;
- localization helpers;
- manual rules normalization;
- logging/dev helpers;
- server startup logging.

Явные server-зоны для выноса:
- `bootstrap/config`
- `rooms`
- `ws`
- `sessions`
- `actions/game`
- `presenters/mappers`
- `overlay/http`

Критичный вывод:
- `server/src/index.ts` уже не один модуль, а смесь нескольких подсистем.
- Первый practical cut должен идти не по domain-фичам, а по инфраструктурным слоям:
  - bootstrap/config;
  - rooms;
  - ws transport.

### `client/src/App.tsx`

Факты:
- размер: `2172` строки;
- `useState`: `13`;
- `useRef`: `4`;
- `useEffect`: `37`;
- `handle*`-обработчиков: `23`.

Внутри `App.tsx` уже смешаны:
- app-level routing;
- websocket client lifecycle;
- create/join/reconnect flow;
- retry/error recovery;
- session/token/tab identity storage;

Что уже вынесено после старта client-фаз:
- `client/src/session/types.ts`
- `client/src/session/storage.ts`
- `client/src/session/protocol.ts`
- `client/src/session/connectionFlow.ts`
- `client/src/session/routing.ts`
- `client/src/session/wsMessageHandlers.ts`
- `client/src/session/actions.ts`
- `client/src/hooks/useAppUiSideEffects.ts`
- `client/src/hooks/useViewportFlags.ts`
- `client/src/hooks/usePopoverDismissal.ts`
- `client/src/app/derivedUi.ts`
- `client/src/components/RouteIssuePanel.tsx`
- `client/src/game/categoryPresentation.ts`
- `client/src/lobby/rulesMath.ts`

Текущий practical cut по клиенту:
- дочистить остатки `session/runtime` wiring в `App.tsx`;
- вынести page props builders;
- дальше резать `GamePage.tsx` и `LobbyPage.tsx` по state groups и крупным UI-секциям.
- theme/UI prefs storage;
- toast/event log;
- route guards;
- game/lobby action dispatch;
- modal orchestration;
- topbar/settings UI;
- page wiring для `HomePage`, `LobbyPage`, `GamePage`.

Явные client-зоны для выноса:
- `session`
- `actions`
- `selectors/mappers`
- `settings/ui-preferences`
- `navigation/route-guards`

Критичный вывод:
- `App.tsx` одновременно является shell, session manager, ws adapter и action dispatcher.
- Первый client-cut должен быть вокруг session/ws/reconnect, а не вокруг визуальных мелочей.

## Server: ключевые функциональные узлы

Ниже узлы, которые уже сейчас выглядят как отдельные будущие модули.

### 1. Bootstrap / Config / Runtime Setup

Опорные точки:
- `main()` около `3827`
- `httpServer.listen(...)` около `6082`
- env/config constants в верхней части файла

Содержимое:
- env parsing;
- path resolution;
- app/http/ws startup;
- startup logging.

Это кандидат на самый первый вынос.

### 2. HTTP And Overlay Endpoints

Опорные точки:
- `app.get(...)` / `app.post(...)` в зоне `3925-4981`

Содержимое:
- overlay view/control endpoints;
- desktop API endpoints;
- spectator/control invite endpoints;
- scenario listing;
- client static fallback route.

Это отдельный HTTP layer, который не должен жить в giant server file.

### 3. Room Lifecycle

Опорные точки:
- `cleanupInactiveRooms()` `2145`
- `generateRoomCode()` `2196`
- `buildRoomState()` `2206`
- `removeLobbyPlayer()` `3484`
- `addLobbyBotPlayer()` `3547`

Содержимое:
- room creation identity;
- lifecycle cleanup;
- player add/remove in lobby;
- room snapshot base assembly.

Это прямой кандидат на `server/src/rooms/`.

### 4. Session / Presence / Host Transfer

Опорные точки:
- `transferHost()` `3581`
- `scheduleHostTransfer()` `3626`
- `markPlayerLeftBunker()` `3655`
- `findPlayerByToken()` `3717`
- `findPlayerByTabId()` `3723`
- `findPlayerBySessionId()` `3729`
- `attachPlayer()` `3735`

Содержимое:
- reconnect identity;
- absence windows;
- host reassignment;
- player session rebinding.

Это прямой кандидат на `server/src/sessions/`.

### 5. Outbound State / Presenter Layer

Опорные точки:
- `broadcastRoomState()` `3274`
- `sendGameView()` `3293`
- `broadcastGameViews()` `3357`
- `broadcastEvent()` `3371`

Содержимое:
- outbound room payload;
- per-player game view delivery;
- event broadcasting;
- state fan-out.

Это прямой кандидат на `server/src/presenters/`.

### 6. Game / Action Routing

Опорные точки:
- control action normalization около `4469-4917`
- websocket `ws.on("message")` около `5100`
- message switch с action handling в зоне `5504-5962`

Содержимое:
- lobby actions;
- start game;
- rules/settings updates;
- host transfer request;
- kick flow;
- scenario action proxying в `room.session.handleAction(...)`.

Это прямой кандидат на `server/src/actions/` и `server/src/game/`.

## Client: ключевые функциональные узлы

### 1. Session / WS lifecycle

Опорные точки:
- `handleCreate()` `1162`
- `handleJoin()` `1191`
- `handleRetry()` `1450`
- reconnect-related refs и status logic вокруг `399-469`, `1043-1113`

Содержимое:
- create/join/reconnect;
- player token / session identity;
- ws status handling;
- retry path.

Это первый кандидат на `client/src/session/`.

### 2. Game/Lobby Action Dispatch

Опорные точки:
- `handleStart()` `1221`
- `handleRevealCard()` `1243`
- `handleVote()` `1249`
- `handleApplySpecial()` `1255`
- `handleFinalizeVoting()` `1271`
- `handleContinueRound()` `1277`
- `handleRevealWorldThreat()` `1283`
- `handleSetBunkerOutcome()` `1289`
- `handleUpdateSettings()` `1316`
- `handleUpdateRules()` `1322`
- `handleKickFromLobby()` `1328`
- `handleRequestHostTransfer()` `1340`
- `handleDevAddPlayer()` `1371`
- `handleDevRemovePlayer()` `1377`

Это первый кандидат на `client/src/actions/`.

### 3. UI Preferences And Shell Settings

Содержимое:
- theme;
- toast position/duration;
- ui scale;
- reduce motion;
- compact mode;
- hints / spectator links / room code visibility.

Это отдельный слой `ui-preferences`, который сейчас живёт в app shell.

### 4. Modal / Topbar / Overlay Shell Wiring

Содержимое:
- topbar settings menu;
- theme menu;
- transfer host modal;
- exit modal;
- dev kick modal;
- toast stacks.

Это кандидат на выделение shell-level компонентов и controller hooks.

## Критичные flow для защиты на следующих фазах

Обязательные flow, которые нельзя ломать после каждого распила:
- create room;
- join room;
- reconnect by token/session;
- host transfer;
- kick from lobby;
- start game;
- update settings;
- update rules;
- reveal card;
- vote;
- finalize voting;
- continue round;
- outbound room state sync;
- outbound game view sync.

## Рекомендуемый порядок следующего рефакторинга

### Next Cut 1

Вынести из `server/src/index.ts`:
- bootstrap;
- config/env resolution;
- startup wiring.

Причина:
- самый безопасный инфраструктурный вынос;
- минимум product behavior risk;
- сразу уменьшает giant-file noise.

### Next Cut 2

Вынести room lifecycle:
- room registry helpers;
- lobby add/remove;
- cleanup/inactive room handling.

Причина:
- это уже естественный слой;
- после этого проще изолировать sessions и ws routing.

### Next Cut 3

Вынести websocket transport/message router.

Причина:
- после room extraction проще разделить transport и action handlers.

### Next Cut 4

Только после первых server-cut перейти к client session layer:
- create/join/reconnect;
- ws lifecycle;
- retry handling.

Причина:
- сначала надо стабилизировать server boundary, потом удобнее выравнивать client-side adapter path.

## Вывод фазы

Фаза 1 подтвердила:
- первый главный монолит проекта сейчас `server/src/index.ts`;
- второй главный монолит `client/src/App.tsx`;
- самый безопасный и логичный старт рефакторинга:
  1. `server bootstrap/config`
  2. `rooms`
  3. `ws transport`
  4. `client session/ws`
