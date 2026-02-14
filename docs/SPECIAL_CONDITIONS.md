# SPECIAL_CONDITIONS.md

## 1) Что такое Special Conditions в текущей версии
- Special Conditions в текущей сборке — это отдельная категория карт `"Особые условия"` внутри сценария `classic`; определения карт грузятся из `scenarios/classic/SPECIAL_CONDITIONS.json`, а runtime-логика живёт в `scenarios/src/classic.ts`.
- В начале партии каждому игроку выдаётся ровно 1 карта Special из пула `implemented=true`; карты с `implemented=false` в раздачу не попадают (`scenarios/src/classic.ts`).
- Состояние карты у игрока: `instanceId`, `revealedPublic`, `used`, `definition`; клиент получает это через `GameView.you.specialConditions` (`scenarios/src/classic.ts`, `shared/src/index.ts`).
- Применение выполняется действием `applySpecial` по WS с валидацией payload на сервере (`shared/src/index.ts`, `server/src/index.ts`, `scenarios/src/classic.ts`).

Где в коде:
- Модель и схемы: `shared/src/index.ts`
- Каталог карт: `scenarios/classic/SPECIAL_CONDITIONS.json`
- Загрузка/выдача/применение: `scenarios/src/classic.ts`
- WS-роутинг действий: `server/src/index.ts`
- UI игрока (кнопка/диалоги применения): `client/src/pages/GamePage.tsx`

## 2) Список условий (только реально существующие сейчас)

Источник списка: `scenarios/classic/SPECIAL_CONDITIONS.json`.

| Название | Тех. ключ (id в рантайме) | Что делает (факт по коду) | Где применяется | Где реализовано |
|---|---|---|---|---|
| Будь Другом | `Особые условия/БУДЬ ДРУГОМ.jpg` | Запрещает выбранному игроку голосовать против владельца карты (`banVoteAgainst`). | Игра, фаза голосования | Дефиниция: `scenarios/classic/SPECIAL_CONDITIONS.json`; эффект: `scenarios/src/classic.ts` (`applySpecialEffect`) |
| Взял С Собой | `Особые условия/ВЗЯЛ С СОБОЙ.jpg` | Не используется в матче: `implemented=false`, карта не попадает в пул раздачи. | Не применяется | `scenarios/classic/SPECIAL_CONDITIONS.json`; фильтр пула: `scenarios/src/classic.ts` |
| Включил Свет | `Особые условия/ВКЛЮЧИЛ СВЕТ.jpg` | Не используется в матче: `implemented=false`. | Не применяется | `scenarios/classic/SPECIAL_CONDITIONS.json`; фильтр пула: `scenarios/src/classic.ts` |
| Громкий Голос | `Особые условия/ГРОМКИЙ ГОЛОС.jpg` | Делает вес голоса владельца = 2 (`voteWeight`). | Игра, окно спецусловий голосования | `scenarios/classic/SPECIAL_CONDITIONS.json`; `scenarios/src/classic.ts` |
| Давайте НА Чистоту Багажа | `Особые условия/ДАВАЙТЕ НА ЧИСТОТУ БАГАЖА.jpg` | Перераздаёт все уже раскрытые карты категории baggage среди живых (`redealAllRevealed`). | Игра | `scenarios/classic/SPECIAL_CONDITIONS.json`; `scenarios/src/classic.ts` |
| Давайте НА Чистоту Биология | `Особые условия/ДАВАЙТЕ НА ЧИСТОТУ БИОЛОГИЯ.jpg` | Перераздаёт все раскрытые карты biology. | Игра | `scenarios/classic/SPECIAL_CONDITIONS.json`; `scenarios/src/classic.ts` |
| Давайте НА Чистоту Здоровья | `Особые условия/ДАВАЙТЕ НА ЧИСТОТУ ЗДОРОВЬЯ.jpg` | Перераздаёт все раскрытые карты health. | Игра | `scenarios/classic/SPECIAL_CONDITIONS.json`; `scenarios/src/classic.ts` |
| Давайте НА Чистоту Фактов | `Особые условия/ДАВАЙТЕ НА ЧИСТОТУ ФАКТОВ.jpg` | Перераздаёт все раскрытые карты facts (`facts1/facts2`). | Игра | `scenarios/classic/SPECIAL_CONDITIONS.json`; `scenarios/src/classic.ts` |
| Давайте НА Чистоту Хобби | `Особые условия/ДАВАЙТЕ НА ЧИСТОТУ ХОББИ.jpg` | Перераздаёт все раскрытые карты hobby. | Игра | `scenarios/classic/SPECIAL_CONDITIONS.json`; `scenarios/src/classic.ts` |
| Диверсия | `Особые условия/ДИВЕРСИЯ.jpg` | Не используется в матче: `implemented=false`. | Не применяется | `scenarios/classic/SPECIAL_CONDITIONS.json`; фильтр пула: `scenarios/src/classic.ts` |
| Дискредитация | `Особые условия/ДИСКРЕДИТАЦИЯ.jpg` | Помечает голос выбранного игрока как потраченный/заблокированный (`disableVote`). | Игра, окно спецусловий голосования | `scenarios/classic/SPECIAL_CONDITIONS.json`; `scenarios/src/classic.ts` |
| Защити Игрока Слева | `Особые условия/ЗАЩИТИ ИГРОКА СЛЕВА.jpg` | Авто-триггер: если исключили левого соседа, следующий голос владельца будет потрачен (`secret_onEliminate`). | Игра (автоматически) | `scenarios/classic/SPECIAL_CONDITIONS.json`; `handleSecretEliminationTriggers` в `scenarios/src/classic.ts` |
| Защити Игрока Справа | `Особые условия/ЗАЩИТИ ИГРОКА СПРАВА.jpg` | Авто-триггер для правого соседа; следующий голос владельца тратится. | Игра (автоматически) | `scenarios/classic/SPECIAL_CONDITIONS.json`; `handleSecretEliminationTriggers` в `scenarios/src/classic.ts` |
| Защити Младшего | `Особые условия/ЗАЩИТИ МЛАДШЕГО.jpg` | Авто-триггер: если исключён самый младший (по уже раскрытому возрасту), следующий голос владельца тратится. | Игра (автоматически) | `scenarios/classic/SPECIAL_CONDITIONS.json`; `handleSecretEliminationTriggers` в `scenarios/src/classic.ts` |
| Защити Смелого | `Особые условия/ЗАЩИТИ СМЕЛОГО.jpg` | Авто-триггер: если исключён игрок, первым раскрывший здоровье, следующий голос владельца тратится. | Игра (автоматически) | `scenarios/classic/SPECIAL_CONDITIONS.json`; `handleSecretEliminationTriggers` в `scenarios/src/classic.ts` |
| Защити Старшего | `Особые условия/ЗАЩИТИ СТАРШЕГО.jpg` | Авто-триггер: если исключён самый старший (по раскрытому возрасту), следующий голос владельца тратится. | Игра (автоматически) | `scenarios/classic/SPECIAL_CONDITIONS.json`; `handleSecretEliminationTriggers` в `scenarios/src/classic.ts` |
| Компромат | `Особые условия/КОМПРОМАТ.jpg` | Удваивает голоса против выбранной цели и одновременно тратит голос владельца. | Игра, окно спецусловий голосования | `scenarios/classic/SPECIAL_CONDITIONS.json`; `scenarios/src/classic.ts` |
| МНЕ Нужнее | `Особые условия/МНЕ НУЖНЕЕ.jpg` | Крадёт одну карту багажа у цели и даёт цели новую карту Special из пула. | Игра | `scenarios/classic/SPECIAL_CONDITIONS.json`; `scenarios/src/classic.ts` |
| Молчание | `Особые условия/МОЛЧАНИЕ.jpg` | Включает правило раунда `noTalkUntilVoting=true` (`setRoundRule`). | Игра, раунд раскрытия | `scenarios/classic/SPECIAL_CONDITIONS.json`; `scenarios/src/classic.ts` |
| Обмен Карт Багаж | `Особые условия/ОБМЕН КАРТ БАГАЖ.jpg` | Меняет местами раскрытые карты baggage у владельца и выбранного соседа. | Игра | `scenarios/classic/SPECIAL_CONDITIONS.json`; `scenarios/src/classic.ts` |
| Обмен Карт Биология | `Особые условия/ОБМЕН КАРТ БИОЛОГИЯ.jpg` | Меняет местами раскрытые карты biology с соседом. | Игра | `scenarios/classic/SPECIAL_CONDITIONS.json`; `scenarios/src/classic.ts` |
| Обмен Карт Здоровье | `Особые условия/ОБМЕН КАРТ ЗДОРОВЬЕ.jpg` | Меняет местами раскрытые карты health с соседом. | Игра | `scenarios/classic/SPECIAL_CONDITIONS.json`; `scenarios/src/classic.ts` |
| Обмен Карт Фактов | `Особые условия/ОБМЕН КАРТ ФАКТОВ.jpg` | Меняет местами раскрытые карты facts с соседом. | Игра | `scenarios/classic/SPECIAL_CONDITIONS.json`; `scenarios/src/classic.ts` |
| Обмен Карт Хобби | `Особые условия/ОБМЕН КАРТ ХОББИ.jpg` | Меняет местами раскрытые карты hobby с соседом. | Игра | `scenarios/classic/SPECIAL_CONDITIONS.json`; `scenarios/src/classic.ts` |
| План Б | `Особые условия/ПЛАН Б.jpg` | Запускает переголосование (`forceRevote`), может запретить лидеров прошлого подсчёта. | Игра, окно спецусловий голосования | `scenarios/classic/SPECIAL_CONDITIONS.json`; `scenarios/src/classic.ts` |
| Просроченные Таблетки | `Особые условия/ПРОСРОЧЕННЫЕ ТАБЛЕТКИ.jpg` | Заменяет раскрытую health-карту цели на случайную из колоды. | Игра | `scenarios/classic/SPECIAL_CONDITIONS.json`; `scenarios/src/classic.ts` |
| Прямой Вопрос | `Особые условия/ПРЯМОЙ ВОПРОС.jpg` | Задаёт обязательную категорию раскрытия до конца текущего раунда (`forcedRevealCategory`). | Игра, раунд раскрытия | `scenarios/classic/SPECIAL_CONDITIONS.json`; `scenarios/src/classic.ts` |
| Тайная Угроза | `Особые условия/ТАЙНАЯ УГРОЗА.jpg` | Авто при исключении владельца: добавляет `threatKey` в финальные угрозы (`addFinalThreat`). | Игра (автоматически) | `scenarios/classic/SPECIAL_CONDITIONS.json`; `handleOnOwnerEliminated` в `scenarios/src/classic.ts` |
| Фейковый Диплом | `Особые условия/ФЕЙКОВЫЙ ДИПЛОМ.jpg` | Заменяет раскрытую profession-карту цели на случайную из колоды. | Игра | `scenarios/classic/SPECIAL_CONDITIONS.json`; `scenarios/src/classic.ts` |
| Хорошие Таблетки | `Особые условия/ХОРОШИЕ ТАБЛЕТКИ.jpg` | Заменяет раскрытую health-карту цели и делает новую карту скрытой (`revealed=false`). | Игра | `scenarios/classic/SPECIAL_CONDITIONS.json`; `scenarios/src/classic.ts` |

Дополнительно по реальному поведению:
- Автоматические триггеры (`onOwnerEliminated`, `secret_onEliminate`) не запускаются кнопкой игрока; они срабатывают в логике исключения (`scenarios/src/classic.ts`).
- Карты с `implemented=false` остаются в JSON как каталог, но не участвуют в раздаче (`scenarios/src/classic.ts`).

## 3) Конфигурация и хранение
- Каталог Special Conditions хранится в `scenarios/classic/SPECIAL_CONDITIONS.json`.
- В рантайме файл читается один раз при загрузке сценария (`loadSpecialDefinitions` в `scenarios/src/classic.ts`).
- На игроке состояние хранится в `PlayerState.specialConditions` (использование, публичное раскрытие, ссылка на definition) (`scenarios/src/classic.ts`).
- В сеть уходит `SpecialConditionInstance` в `GameView.you.specialConditions` (`scenarios/src/classic.ts`, `shared/src/index.ts`).
- Общая persistence проекта — in-memory room/session; после рестарта сервера состояние комнаты и special-карт не восстанавливается (`server/src/index.ts`, `Room.session`, `rooms` map).

Валидация/ограничения:
- Сообщение `applySpecial` валидируется схемой (`shared/src/index.ts`, `ClientMessageSchema`).
- Серверная логика валидирует доступность карты, `implemented`, `used`, фазу и target (`scenarios/src/classic.ts`).
- Проверяемые `requires` сейчас ограничены набором, зашитым в `validateRequires`; часть ключей из JSON (`phase=any`, `ownerEliminated`, `bunkerCardsImplemented`) фактически служит как метаданные и отдельно не валидируется (`scenarios/src/classic.ts`, `scenarios/classic/SPECIAL_CONDITIONS.json`).

## 4) UI / управление
- Игрок видит свои Special Conditions в игровом UI (`client/src/pages/GamePage.tsx`): отдельный блок в десктопе и мобильном досье, кнопка `Применить`.
- При необходимости выбора цели/категории открывается диалог (player/category), а затем отправляется `applySpecial` (`client/src/pages/GamePage.tsx`).
- В лобби есть настройка `specialUsage` (`anytime` / `only_during_voting`), которая влияет на серверное правило применения активируемых спецкарт (`client/src/pages/LobbyPage.tsx`, `scenarios/src/classic.ts`).
- Авто-триггеры (`onOwnerEliminated`, `secret_onEliminate`) в UI не «нажимаются», они исполняются сервером при исключении игрока (`scenarios/src/classic.ts`).

Что видит пользователь по эффектам правил:
- Флажки раунда `noTalkUntilVoting` и `forcedRevealCategory` выводятся в верхней панели игры (`client/src/pages/GamePage.tsx`), заполняются из `GameView.public.roundRules` (`scenarios/src/classic.ts`, `shared/src/index.ts`).

## 5) Интеграция с Overlay / Overlay Control
- OBS overlay (`/overlay`) строится из `getOverlayState(room)` и использует данные `view.public.players` + world top-блоков (`server/src/index.ts`, `server/public/overlay/overlay.js`).
- Overlay не читает `you.specialConditions` напрямую; он отображает категории/теги/верхние блоки. Поэтому влияние Special Conditions на overlay в основном косвенное: через изменения раскрытых карт и значений категорий (`scenarios/src/classic.ts`, `server/src/index.ts`, `server/public/overlay/overlay.js`).
- Примеры косвенного влияния: `replaceRevealedCard`, `swapRevealedWithNeighbor`, `redealAllRevealed`, `forceRevealCategoryForAll` меняют состояние карт, и это отражается в overlay при следующем `overlayState` broadcast (`scenarios/src/classic.ts`, `server/src/index.ts`).
- Эффекты чисто голосования (`banVoteAgainst`, `disableVote`, `voteWeight`, `forceRevote`, `doubleVotesAgainst_and_disableSelfVote`) overlay-карточки игроков обычно не меняют; они видны в игровом UI/результатах голосования (`scenarios/src/classic.ts`, `client/src/pages/GamePage.tsx`).
- `Тайная Угроза` (`addFinalThreat`) в текущей реализации попадает в финальное текстовое сообщение игры, а не в отдельный top-блок overlay (`scenarios/src/classic.ts`).

Overlay Control (текущее поведение):
- Overlay Control редактирует `overlayOverrides` поверх текущего overlay state и получает live-обновления через `overlaySubscribe` (`server/src/index.ts`, `server/public/overlay/overlay-control.js`).
- Это отдельный слой отображения OBS; он не изменяет core-игровую модель Special Conditions (`server/public/overlay/overlay-control.js`, `scenarios/src/classic.ts`).

## 6) Как расширять (для разработчика)
Минимальный паттерн добавления нового Special Condition:
1. Добавить запись в `scenarios/classic/SPECIAL_CONDITIONS.json` с полями `title`, `file`, `trigger`, `effect`, `implemented`, `requires`, `uiTargeting`.
2. Если нужен новый runtime-эффект: добавить ветку в `applySpecialEffect` (`scenarios/src/classic.ts`).
3. Если нужен новый автоматический триггер: обновить `handleOnOwnerEliminated` или `handleSecretEliminationTriggers` (`scenarios/src/classic.ts`).
4. Если добавили новый ключ в `requires`: расширить `validateRequires` (`scenarios/src/classic.ts`).
5. Если нужен новый trigger-тип/контракт: обновить `SpecialConditionTrigger` и схемы в `shared/src/index.ts`.
6. Проверить клиентские ограничения по фазам (множества voting/reveal эффектов, выбор целей) в `client/src/pages/GamePage.tsx`.
7. Проверить, как изменение отражается в OBS overlay: `server/src/index.ts` (`getOverlayState`) и `server/public/overlay/overlay.js`.

Важно по текущему состоянию:
- `implemented=false` = карта в каталоге, но не в реальной раздаче (`scenarios/src/classic.ts`).
- Транспорт менять только синхронно (shared schema + server handler + client sender), иначе поломается WS-протокол (`shared/src/index.ts`, `server/src/index.ts`, `client/src/App.tsx`).

## 7) Как тестировать
Ручной сценарий проверки:
1. Поднять проект (`pnpm dev`) и создать комнату Classic.
2. В игре открыть досье игрока и убедиться, что есть блок Special Conditions (`client/src/pages/GamePage.tsx`).
3. Применить активируемую карту:
   - карта должна стать `used=true`;
   - при первом применении должна стать `revealedPublic=true`;
   - ошибка должна возвращаться при повторном применении.
4. Проверить auto-триггеры:
   - исключить владельца `onOwnerEliminated`/`secret_onEliminate`;
   - проверить изменение состояния (например, потраченный голос в следующем голосовании).
5. Проверить влияние на overlay:
   - открыть `/overlay?room=XXXX&token=VIEW_TOKEN`;
   - применить спецкарту, которая меняет карты/категории;
   - убедиться, что overlay обновился после broadcast (`server/src/index.ts`, `server/public/overlay/overlay.js`).
6. Проверить Overlay Control:
   - открыть `/overlay-control?room=XXXX&token=EDIT_TOKEN`;
   - убедиться, что текущие значения приходят через `/overlay-control/state` и WS realtime;
   - убедиться, что overrides меняют только output overlay, а не игровую модель special cards (`server/public/overlay/overlay-control.js`).

Проверка через типы/схемы:
- `pnpm -C shared typecheck`
- `pnpm -C server typecheck`
- `pnpm -C client typecheck`

Ограничение тестового покрытия:
- Отдельных автотестов именно для Special Conditions не обнаружено (в `scenarios/tests` есть другие проверки, но не детальный suite для всех спецкарт).
