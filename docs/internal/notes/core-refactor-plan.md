# Core Refactor Plan

## Зачем нужен этот документ

Это рабочий пошаговый план по декомпозиции core-частей проекта:
- `server/`
- `shared/`
- `client/`

Документ фиксирует порядок работ, чтобы:
- не смешивать рефакторинг с новыми фичами;
- не делать хаотичные переносы кода;
- двигаться маленькими шагами с понятной проверкой после каждого шага.

## Scope

В этом плане покрываются:
- декомпозиция `server/src/index.ts`;
- выравнивание контрактов в `shared/`;
- вынос логики из `client/src/App.tsx`;
- дальнейшая декомпозиция `client/src/pages/GamePage.tsx`;
- дальнейшая декомпозиция `client/src/pages/LobbyPage.tsx`;
- hygiene-проход по дубликатам и границам ответственности.

## Non-Goals

В этот план специально не входят:
- release / CI stabilization;
- desktop-specific задачи;
- content-pack architecture rewrite;
- полная модульная переработка сценарной системы;
- внедрение AI-ботов.

Эти направления не надо смешивать с текущим core-refactor проходом.

## Общие правила выполнения

- Каждый шаг должен быть маленьким и проверяемым.
- Не смешивать рефакторинг и новые продуктовые изменения в одном пакете правок.
- Не менять поведение намеренно, если задача шага только структурная.
- Если меняется контракт, одновременно обновлять `server` и `client`.
- После каждого шага проверять критичные игровые flow, а не только компиляцию.

## Целевая архитектурная граница

### `server/`

Должен отвечать за:
- transport;
- room lifecycle;
- session / identity;
- orchestration матча;
- action handling;
- server-side services;
- state publication наружу.

Не должен тащить в одном месте:
- bootstrap;
- websocket wiring;
- game rules dispatch;
- snapshot assembly;
- служебные util-блоки без границ.

### `shared/`

Должен быть единой точкой правды для:
- event contracts;
- payload contracts;
- room/game state contracts;
- role/session/domain enums;
- общих transport-форматов.

Не должен содержать:
- UI-specific модели;
- server-only runtime детали;
- presentation-логику;
- дубли того, что уже есть как канонический контракт.

### `client/`

Должен отвечать за:
- presentation;
- page composition;
- client session state;
- user intent handling;
- mapping server data в UI state.

Не должен держать в `App.tsx`:
- почти весь session lifecycle;
- большой кусок action routing;
- размазанные derived selectors;
- лишнюю business-логику.

## Пошаговый план

## Шаг 1. Зафиксировать карту текущих зон ответственности

Что сделать:
- Выписать, какие крупные блоки сейчас живут в `server/src/index.ts`.
- Отдельно выписать, что именно живёт в `client/src/App.tsx`.
- Отметить дубли в `server/`, `shared/`, `client/`.
- Зафиксировать текущие критичные flow:
  - create room;
  - join room;
  - reconnect;
  - host transfer;
  - основной игровой action flow;
  - публикация состояния клиенту.

Результат:
- короткая карта “что есть сейчас”;
- список модулей-кандидатов на вынос;
- список flow, которые нельзя сломать.

Критерий готовности:
- понятно, какие куски можно выносить без архитектурных гаданий.

## Шаг 2. Вынести server bootstrap и config wiring

Что сделать:
- Отделить запуск процесса и wiring зависимостей от основной игровой логики.
- Вынести bootstrap-код из `server/src/index.ts` в отдельный слой.
- Выделить конфигурацию и env resolution в отдельный модуль.

Целевая структура:
- `server/src/bootstrap/`
- `server/src/config/`

Что не трогать:
- игровую логику;
- shape websocket-сообщений;
- room-state поведение.

Критерий готовности:
- `server/src/index.ts` становится thin entrypoint;
- bootstrap можно читать отдельно от game/runtime логики.

## Шаг 3. Вынести room lifecycle и registry

Что сделать:
- Отделить создание, поиск, удаление и жизненный цикл комнат.
- Вынести registry комнат и связанные операции.
- Убрать размазанную логику room-management из общего server entry flow.

Целевая структура:
- `server/src/rooms/`

Внутри как минимум:
- room registry;
- room factory;
- room lifecycle operations.

Критерий готовности:
- управление комнатами не зависит от websocket handler’ов напрямую;
- room lifecycle читается как отдельный слой.

## Шаг 4. Вынести websocket transport и routing

Что сделать:
- Отделить низкоуровневую websocket-обвязку от game handling.
- Разделить:
  - приём сообщения;
  - parse / envelope validation;
  - routing к нужному handler;
  - отправку ответа / broadcast.

Целевая структура:
- `server/src/ws/`

Внутри как минимум:
- connection wiring;
- incoming router;
- outgoing dispatcher;
- transport helpers.

Критерий готовности:
- transport можно читать отдельно от правил игры;
- обработчики действий не завязаны на низкоуровневую websocket-механику.

## Шаг 5. Вынести session / identity / reconnect / host transfer

Что сделать:
- Собрать в один слой работу с идентичностью подключения.
- Разделить роли:
  - host;
  - player;
  - spectator;
  - control / service connections, если есть.
- Отдельно вынести reconnect и host transfer flow.

Целевая структура:
- `server/src/sessions/`

Критерий готовности:
- session-логика больше не размазана по transport, rooms и game actions;
- reconnect и host transfer имеют явные точки входа.

## Шаг 6. Вынести action handlers и orchestration игры

Что сделать:
- Разделить оркестрацию матча и обработчики конкретных действий.
- Не держать все игровые переходы и action dispatch в одном giant-file.
- Для каждой группы действий сделать отдельный handler layer.

Целевая структура:
- `server/src/game/`
- `server/src/actions/`

Минимальные срезы:
- room pre-game actions;
- in-game actions;
- vote / reveal / round transitions;
- host/admin actions.

Критерий готовности:
- server action flow читается по модулям;
- добавление новой action-ветки не требует лезть в огромный entry file.

## Шаг 7. Вынести snapshot / presenter / payload assembly

Что сделать:
- Отделить вычисление server-side состояния от его внешнего представления.
- Вынести сборку payload’ов и snapshot’ов, отправляемых клиенту.
- Убрать смешение domain state и transport presentation.

Целевая структура:
- `server/src/presenters/`
- или `server/src/mappers/`

Критерий готовности:
- место сборки outbound payload явно одно;
- проще контролировать, что клиенту уходит только нужный срез данных.

## Шаг 8. Привести `shared/` к каноническим контрактам

Что сделать:
- Собрать все client/server event contracts в `shared/`.
- Нормализовать payload shape.
- Убрать почти-дублирующие типы.
- Выровнять enums, status values, stage values, role values.

Проверить отдельно:
- события client -> server;
- события server -> client;
- room/game state contracts;
- identity/session payloads;
- action payloads;
- invite / link / control payloads, если они реально общие.

Что убрать:
- UI-only модели из `shared/`;
- server-only runtime детали из `shared/`;
- helper’ы, которые не являются общими по смыслу.

Критерий готовности:
- `shared/` становится реальным contract layer;
- у одного сетевого смысла один канонический тип.

## Шаг 9. Подчистить contract hygiene между слоями

Что сделать:
- Найти дубли нормализации, enum-conversion, role-checking, payload shaping.
- Убрать повторяющиеся утилиты между `server` и `client`.
- Отделить localization от domain / contract логики.

Особенно проверить:
- role / permission checks;
- room code / token / id normalization;
- stage / state name mappings;
- event-name consistency.

Критерий готовности:
- меньше дублированных helper-функций;
- ниже шанс тихого рассинхрона между слоями.

## Шаг 10. Вынести session/runtime logic из `client/src/App.tsx`

Что сделать:
- Убрать из `App.tsx` connection lifecycle.
- Убрать из `App.tsx` reconnect/session init.
- Вынести app/session orchestration в отдельный client-layer.

Целевая структура:
- `client/src/session/`
- `client/src/state/` или `client/src/stores/`

Критерий готовности:
- `App.tsx` становится thin composition root;
- session flow читается отдельно от рендера.

## Шаг 11. Вынести client action dispatch и derived state

Что сделать:
- Отделить user intent handling от page/component кода.
- Вынести action dispatch и server-call orchestration.
- Вынести derived selectors / mapping logic из крупных компонентов.

Целевая структура:
- `client/src/actions/`
- `client/src/mappers/`
- `client/src/selectors/`, если нужен отдельный слой

Критерий готовности:
- UI-компоненты меньше знают о transport details;
- бизнес-переходы и server-call path не спрятаны в JSX-слое.

## Шаг 12. Разрезать `client/src/pages/GamePage.tsx`

Что сделать:
- Разбить экран на feature-секции и контейнеры.
- Вынести игровые блоки по ответственности.
- Уменьшить связность между UI, local derived state и action wiring.

Возможные направления выноса:
- player panel;
- voting section;
- round status;
- reveal/result blocks;
- host controls;
- spectator-specific fragments.

Критерий готовности:
- `GamePage.tsx` перестаёт быть монолитом;
- feature-блоки можно читать и тестировать отдельно.

## Шаг 13. Разрезать `client/src/pages/LobbyPage.tsx`

Что сделать:
- Отделить lobby composition от session/control logic.
- Вынести участники, room actions, host controls и invite/info blocks в отдельные куски.
- Убрать лишнюю связанность между lobby UI и транспортной логикой.

Критерий готовности:
- `LobbyPage.tsx` остаётся page-shell;
- основная логика и крупные фрагменты живут отдельно.

## Шаг 14. Финальный hygiene pass

Что сделать:
- Дочистить нейминг;
- убрать устаревшие helper’ы;
- убрать мёртвые transitional abstraction;
- схлопнуть временные промежуточные слои, если они уже не нужны;
- обновить dev-документацию, если структура заметно поменялась.

Критерий готовности:
- нет очевидного legacy-мусора после распила;
- новая структура читается без знания старой истории.

## Проверка после каждого крупного шага

- typecheck / build для затронутой части;
- существующие тесты по затронутой области;
- ручная проверка критичных flow:
  - create/join room;
  - reconnect;
  - host transfer;
  - базовый игровой action flow;
  - корректная публикация состояния клиенту.

## Рекомендуемый порядок исполнения

1. Шаг 1
2. Шаг 2
3. Шаг 3
4. Шаг 4
5. Шаг 5
6. Шаг 6
7. Шаг 7
8. Шаг 8
9. Шаг 9
10. Шаг 10
11. Шаг 11
12. Шаг 12
13. Шаг 13
14. Шаг 14

## Practical Rule

Если шаг можно сделать без изменения поведения, так и надо делать.

Если шаг требует изменения поведения, это должно быть:
- явно зафиксировано;
- ограничено одной областью;
- отдельно проверено по flow и контрактам.
