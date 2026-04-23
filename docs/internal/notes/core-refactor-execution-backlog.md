# Core Refactor Execution Backlog

## Назначение

Это более жёсткий execution backlog поверх общего плана из `core-refactor-plan.md`.

Здесь фиксируется:
- что делать по фазам;
- какой результат должен быть в конце фазы;
- какие файлы являются главной целью;
- что проверять перед переходом к следующей фазе.

## Phase Status

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
- `Phase 12` — `partial`
- `Phase 13` — `partial`
- `Phase 14` — `not started`

## Phase 1. Current-State Mapping

Цель:
- зафиксировать карту текущих зон ответственности;
- понять, что именно режем первым;
- выделить критичные flow, которые нельзя ломать.

Главные файлы:
- `server/src/index.ts`
- `client/src/App.tsx`
- `client/src/pages/GamePage.tsx`
- `client/src/pages/LobbyPage.tsx`
- `shared/` по фактическим transport/domain контрактам

Результат фазы:
- документ с картой монолитов;
- список server-блоков для первого выноса;
- список client-блоков для первого выноса;
- список критичных flow для проверки после каждого следующего этапа.

Гейт выхода:
- понятно, какие переносы делать сначала;
- нет архитектурной неопределённости по первым 2-3 шагам рефакторинга.

## Phase 2. Server Bootstrap And Config Split

Цель:
- сделать `server/src/index.ts` тоньше без изменения поведения;
- отделить bootstrap и config resolution от runtime/game логики.

Главные цели:
- вынести env/config resolution;
- вынести server bootstrap;
- оставить в `index.ts` только entry wiring.

Целевые папки:
- `server/src/bootstrap/`
- `server/src/config/`

Гейт выхода:
- `index.ts` больше не несёт на себе env/config plumbing;
- запуск сервера читается отдельно от gameplay/runtime деталей.

## Phase 3. Rooms Layer Extraction

Цель:
- отделить room lifecycle от общего server entry потока.

Главные цели:
- room registry;
- room creation/destruction;
- lobby player attach/remove;
- inactive room cleanup.

Целевые папки:
- `server/src/rooms/`

Гейт выхода:
- операции с комнатами не размазаны по нескольким несвязанным блокам;
- room lifecycle читается как самостоятельный слой.

## Phase 4. WS Transport And Routing Split

Цель:
- отделить websocket transport от игровой логики.

Главные цели:
- connection setup;
- incoming message parse/validation;
- routing;
- outgoing dispatch.

Целевые папки:
- `server/src/ws/`

Гейт выхода:
- transport и game logic не сидят в одном giant block;
- обработчики не зависят напрямую от низкоуровневой websocket-обвязки.

## Phase 5. Session Identity And Reconnect Split

Цель:
- собрать identity/session/reconnect/host-transfer в явный слой.

Главные цели:
- player identity;
- reconnect token/session binding;
- host transfer;
- disconnect grace logic.

Целевые папки:
- `server/src/sessions/`

Гейт выхода:
- reconnect и host transfer имеют явные точки входа;
- session-логика не размазана по transport/rooms/actions.

## Phase 6. Game Actions And Orchestration Split

Цель:
- разделить orchestration матча и обработчики конкретных действий.

Главные цели:
- `startGame`;
- lobby/game action dispatch;
- control-only actions;
- classic/manual rules transitions;
- scenario action handling.

Целевые папки:
- `server/src/game/`
- `server/src/actions/`

Гейт выхода:
- новые action-ветки можно добавлять без правки огромного switch-блока;
- orchestration и handlers читаются по отдельности.

## Phase 7. Outbound State And Presenter Split

Цель:
- отделить domain state от transport/presenter assembly.

Главные цели:
- `buildRoomState`;
- `sendGameView`;
- `broadcastRoomState`;
- `broadcastGameViews`;
- overlay/state projection.

Целевые папки:
- `server/src/presenters/`
- `server/src/mappers/`

Гейт выхода:
- outbound payload assembly локализован в одном месте;
- проще контролировать видимость чувствительных данных.

## Phase 8. Shared Contract Canonicalization

Цель:
- сделать `shared/` единой точкой правды для контрактов.

Главные цели:
- client->server events;
- server->client events;
- room/game/session payloads;
- role/stage/status enums;
- общие transport shape.

Гейт выхода:
- один сетевой смысл = один канонический контракт;
- дубли и почти-дубли вычищены.

## Phase 9. Contract Hygiene Pass

Цель:
- убрать межслойные дубли и рассинхрон helper-логики.

Главные цели:
- normalization helpers;
- role/permission helpers;
- payload shaping helpers;
- event-name consistency;
- отделение localization от contract/domain logic.

Гейт выхода:
- нет явных дублей одной и той же contract-логики в `server` и `client`.

## Phase 10. Client Session And App Split

Цель:
- снять с `client/src/App.tsx` session/runtime orchestration.

Главные цели:
- create/join/reconnect flow;
- ws lifecycle;
- retry/reconnect path;
- route gating;
- app-level session state.

Целевые папки:
- `client/src/session/`
- `client/src/state/` или `client/src/stores/`

Гейт выхода:
- `App.tsx` становится composition root, а не центром всей app-логики.

## Phase 11. Client Actions And Selectors Split

Цель:
- вынести action dispatch и derived logic из верхнего компонента.

Главные цели:
- game actions;
- lobby actions;
- control actions;
- derived selectors;
- server payload -> UI mapping.

Целевые папки:
- `client/src/actions/`
- `client/src/selectors/`
- `client/src/mappers/`

Гейт выхода:
- UI-компоненты меньше знают про transport и side-effects.

## Phase 12. GamePage Split

Цель:
- разрезать `client/src/pages/GamePage.tsx` на feature-блоки.

Главные цели:
- player panel;
- voting;
- round/status blocks;
- result/reveal blocks;
- control/dev fragments.

Гейт выхода:
- `GamePage.tsx` остаётся shell-страницей;
- крупные блоки живут отдельно.

## Phase 13. LobbyPage Split

Цель:
- разрезать `client/src/pages/LobbyPage.tsx` на feature-блоки.

Главные цели:
- player list;
- invite/info blocks;
- host/control actions;
- room settings sections.

Гейт выхода:
- `LobbyPage.tsx` перестаёт быть монолитом;
- transport/session детали не размазаны по lobby JSX.

## Phase 14. Cleanup And Documentation Pass

Цель:
- убрать transitional мусор после распила.

Главные цели:
- удалить временные helper’ы;
- дочистить нейминг;
- обновить внутреннюю dev-документацию;
- схлопнуть устаревшие промежуточные слои.

Гейт выхода:
- новая структура читается без знания старого giant-file layout.

## Общая проверка между фазами

- typecheck / build по затронутой части;
- целевые тесты по затронутой области;
- ручная проверка:
  - create room;
  - join room;
  - reconnect;
  - host transfer;
  - start game;
  - базовые game actions;
  - room/game state delivery клиенту.
