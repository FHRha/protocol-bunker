# UI locales

## Что это

В клиенте используется **namespace-архитектура UI-локалей**.

Вместо одного большого `locales/ui/ru.json` и `locales/ui/en.json` тексты разбиты по тематическим namespace-папкам:

- `locales/ui/app`
- `locales/ui/common`
- `locales/ui/home`
- `locales/ui/lobby`
- `locales/ui/game`
- `locales/ui/world`
- `locales/ui/voting`
- `locales/ui/special`
- `locales/ui/host-menu`
- `locales/ui/overlay-links`
- `locales/ui/reconnect`
- `locales/ui/room-settings`
- `locales/ui/rules`
- `locales/ui/dev`
- `locales/ui/format`
- `locales/ui/maps`
- `locales/ui/misc`

Каждый namespace хранит только свой кусок UI-текстов для `ru` и `en`.

---

## Зачем это сделано

Старая схема с монолитным UI-словарём была неудобной:

- один огромный файл было сложно читать и поддерживать
- экран тянул лишние тексты, которые ему не нужны
- было тяжело понимать, к какому экрану относится ключ
- legacy fallback скрывал реальные проблемы структуры

Новая схема даёт:

- более понятную структуру
- загрузку только нужных namespace
- более удобное развитие по экранам и компонентам
- более честную архитектуру без монолитного fallback

---

## Основные принципы

### 1. Один namespace = одна тема или экран

Примеры:

- `home` — стартовый экран
- `lobby` — лобби
- `game` — основной игровой экран
- `world` — мир, бункер, угрозы, катастрофа
- `special` — особые условия и связанные диалоги
- `common` — общие кнопки, короткие подписи и повторно используемые строки

### 2. Компонент использует только нужные namespace

Не нужно тянуть весь UI-словарь.  
Компонент или страница подключают только свои namespace и, при необходимости, несколько fallback namespace.

### 3. Монолитного UI-словаря больше нет

Удалены:

- `locales/ui/ru.json`
- `locales/ui/en.json`
- старый монолитный loader
- старый proxy-слой

Теперь UI живёт только на namespace-локалях.

---

## Основные файлы

### `client/src/localization/localeTypes.ts`

Базовые типы locale-слоя.

### `client/src/localization/index.ts`

Публичная точка входа для locale API.

Отсюда импортируются:

- `useUiLocaleNamespace`
- `useUiLocaleNamespacesActivation`
- `getCurrentLocale`
- `setCurrentLocale`
- `subscribeLocale`

### `client/src/localization/uiLocaleNamespaceLoader.ts`

Отвечает за загрузку namespace-файлов.

### `client/src/localization/uiLocaleNamespaceRuntime.ts`

Основной runtime новой locale-системы:

- хранит загруженные namespace
- объединяет namespace и fallback namespace
- создаёт translator для `t(...)`
- больше **не использует** legacy fallback на монолитный словарь

### `client/src/localization/useUiLocaleNamespace.ts`

React hook для работы с namespace-локалями.

### `client/src/localization/useUiLocaleNamespacesActivation.ts`

Hook для активации нужных namespace на уровне страницы или крупного блока.

---

## Как использовать

### Активация namespace

На уровне страницы:

```ts
useUiLocaleNamespacesActivation([
  "common",
  "lobby",
  "overlay-links",
  "room-settings",
]);
```

### Получение translator

```ts
const lobbyText = useUiLocaleNamespace("lobby", {
  fallbacks: ["common", "format", "maps"],
});
```

### Использование строк

```ts
lobbyText.t("playersTitle")
lobbyText.t("copyButton")
```

### Использование форматных строк

```ts
lobbyText.t("playerFallback", { index: 3 })
gameText.t("worldBunkerCard", { index: 2 })
```

---

## Рекомендации по добавлению новых текстов

### Если добавляешь новый текст:

1. Определи, к какому экрану или блоку он относится
2. Положи его в соответствующий namespace
3. Не добавляй новые общие тексты в `misc`, если для них есть более подходящий namespace
4. Если текст реально общий, положи его в `common`

### Если добавляешь новый экран:

1. Создай новую папку в `locales/ui/...`
2. Добавь `ru.json` и `en.json`
3. Активируй namespace через `useUiLocaleNamespacesActivation(...)`
4. Получай translator через `useUiLocaleNamespace(...)`

---

## Что делать с `misc`

`misc` — временный namespace для текстов, которые ещё не были нормально разложены по структуре.

Цель со временем — уменьшать `misc` и переносить его содержимое в:

- `common`
- `game`
- `lobby`
- `world`
- `special`
- другие профильные namespace

---

## Что больше не использовать

Не использовать:

- старый монолитный UI-словарь
- старый proxy-слой
- обращения вида `ru.someKey`
- любые новые fallback-мосты к удалённым `locales/ui/ru.json` и `en.json`

Новый код должен идти только через:

- `useUiLocaleNamespace(...)`
- `useUiLocaleNamespacesActivation(...)`

---

## Текущее состояние

Система переведена на новую namespace-архитектуру.

Основные страницы и ключевые client-side locale слои уже работают без legacy fallback.
Оставшиеся улучшения относятся в основном к:

- полировке структуры namespace
- чистке `misc`
- возможному ужесточению типов в `localeTypes.ts`
