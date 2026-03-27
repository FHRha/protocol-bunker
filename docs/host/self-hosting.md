# Self-hosting

Этот файл — практический гайд для тех, кто хочет сам поднять Protocol: Bunker и дать игрокам рабочую ссылку.

Если ты обычный игрок, этот документ тебе не нужен. Обычному игроку обычно достаточно браузера и ссылки от хоста.

## Что делает хост

Хост:
1. скачивает готовую сборку или ставит игру через установщик;
2. запускает игру;
3. открывает комнату;
4. даёт игрокам ссылку;
5. проверяет, что у других всё реально открывается и подключается.

Игра у игроков идёт в браузере. Отдельно ставить клиент им обычно не нужно.

## Какой вариант выбрать

Обычно есть три основных варианта:

### Вариант 1. Готовый релиз
Подходит для большинства случаев, если ты просто хочешь быстро поднять игру.

### Вариант 2. Установка через `install.sh`
Подходит в первую очередь для Linux, особенно если нужен серверный сценарий, обновление, сервис и автозапуск.

### Вариант 3. Сборка из репозитория
Подходит, если ты хочешь сам собирать проект, вносить изменения или делать собственные релизные артефакты.

---

## Вариант 1. Запуск из готового релиза

Это основной сценарий для большинства хостов.

### Где брать сборки

Актуальные сборки обычно находятся в **GitHub Releases → Latest**.

### Что скачивать

В релизах могут быть такие варианты:

#### Windows
- `Setup x64` — обычная установочная версия;
- `EXE x64 (zip)` — архив с exe;
- `Portable x64` — portable-вариант без обычной установки.

#### Linux x64
- `Public`
- `Server`

#### Linux ARM64
- `Public`
- `Server`

Если не хочется разбираться, обычно начинай с самого простого варианта под свою систему:
- на Windows — `Setup x64` или `Portable x64`;
- на Linux — сначала смотри `Public`, а `Server` используй для более серверного сценария.

### Как запустить

#### Windows
1. Скачай `Setup x64`, `EXE x64 (zip)` или `Portable x64`.
2. Запусти выбранный вариант.
3. Дождись старта игры.
4. Открой интерфейс.
5. Создай комнату.
6. Передай ссылку игрокам.

#### Linux
1. Скачай `Public` или `Server`.
2. Распакуй, если это архив.
3. Запусти нужный вариант.
4. Убедись, что интерфейс открывается.
5. Создай комнату.
6. Проверь подключение другого игрока.

---

## Вариант 2. Установка через `install.sh`

Если ты хочешь установить игру через `install.sh`, скачай и запусти его.

### Скачивание и запуск

Скачать:

`curl -fsSL https://raw.githubusercontent.com/FHRha/protocol-bunker/main/install.sh -o install.sh`

Запустить:

`bash install.sh`

Серверный Linux-профиль:

`bash install.sh --edition server`

Профиль `server` — это серверный Linux-вариант без вывода LAN/localhost-ссылок.

### Быстрые команды через curl

#### Latest, public-профиль

`curl -fsSL https://raw.githubusercontent.com/FHRha/protocol-bunker/main/install.sh | bash`

#### Latest, server-профиль

`curl -fsSL https://raw.githubusercontent.com/FHRha/protocol-bunker/main/install.sh | bash -s -- --edition server`

#### Latest, server-профиль (ARM64)

`curl -fsSL https://raw.githubusercontent.com/FHRha/protocol-bunker/main/install.sh | bash -s -- --edition server --arch arm64`

#### Конкретная версия, public-профиль

`curl -fsSL https://raw.githubusercontent.com/FHRha/protocol-bunker/main/install.sh | bash -s -- --version v0.2.7`

#### Конкретная версия, server-профиль

`curl -fsSL https://raw.githubusercontent.com/FHRha/protocol-bunker/main/install.sh | bash -s -- --edition server --version v0.2.7`

### Что означают параметры

- `public` — обычный профиль, показывает и Public, и Local ссылки;
- `server` — серверный профиль, скрывает LAN/localhost-ссылки в выводе launcher и в блоке ссылок в лобби;
- `--arch` — можно явно выбрать `x64` или `arm64`; если не указывать, `install.sh` определит архитектуру автоматически через `uname -m`;
- `--quality` — качество колоды: `1x` по умолчанию или `2x` (HQ).

Если выбран `1x` и запуск идёт интерактивно, `install.sh` перед скачиванием предложит переключиться на `2x` (HQ).

---

## Автозапуск и сервис (Linux)

### Включить автозапуск сразу при установке

Серверный профиль:

`curl -fsSL https://raw.githubusercontent.com/FHRha/protocol-bunker/main/install.sh | bash -s -- --edition server --service-scope system --autostart`

Серверный профиль + HQ-колода `2x`:

`curl -fsSL https://raw.githubusercontent.com/FHRha/protocol-bunker/main/install.sh | bash -s -- --edition server --quality 2x --service-scope system --autostart`

По умолчанию `--service-scope auto`:
- для `root` используется `system`;
- для обычного пользователя — `user`.

### Включить автозапуск после установки

`protocol-bunker --enable-autostart`

### Отключить автозапуск

`protocol-bunker --disable-autostart`

---

## Стандартные пути установки (Linux)

Игра:

`~/.local/share/protocol-bunker/Protocol-Bunker`

Launcher-команда:

`~/.local/bin/protocol-bunker`

Service unit:

`/etc/systemd/system/protocol-bunker.service`

---

## Редактирование настроек

Для стандартной установки настройки лежат здесь:

`nano ~/.local/share/protocol-bunker/Protocol-Bunker/portable.env`

### Минимум для выделенного сервера

Перед первым стартом можно поставить:

`PORT=0`
`DEV_MODE=0`
`MODE=local`

### Вариант для домена

`PORT=8080`
`DEV_MODE=0`
`MODE=domain`
`DOMAIN=your.domain.com`

### Явный внешний адрес для `MODE=local`

Можно явно задать внешний адрес и отключить автоопределение через внешние сервисы:

`PUBLIC_HOST=203.0.113.10`

или

`PUBLIC_ORIGIN=http://203.0.113.10:8080`

Если `PUBLIC_HOST` / `PUBLIC_ORIGIN` не заданы, внешний адрес определяется автоматически через `api.ipify.org` с fallback на `ifconfig.me/ip`.

### Важно про `PUBLIC_ORIGIN`

- можно указывать `https://your.domain.com` — это корректно;
- порт указывай только если внешний доступ реально идёт на нестандартный порт, например `:8443`;
- если домен работает через reverse proxy на стандартном `443`, порт в `PUBLIC_ORIGIN` обычно не нужен.

После изменения настроек перезапусти сервис:

`sudo systemctl restart protocol-bunker`

---

## Полезные команды сервиса

Статус:

`sudo systemctl status protocol-bunker`

Остановить:

`sudo systemctl stop protocol-bunker`

Запустить:

`sudo systemctl start protocol-bunker`

Перезапустить:

`sudo systemctl restart protocol-bunker`

Логи:

`sudo journalctl -u protocol-bunker -f`

---

## Полезные команды `protocol-bunker`

Справка:

`protocol-bunker --help`

Обновить до latest:

`protocol-bunker --update`

Обновить до конкретной версии:

`protocol-bunker --update vX.Y.Z`

Включить автозапуск:

`protocol-bunker --enable-autostart`

Отключить автозапуск:

`protocol-bunker --disable-autostart`

Удалить установку:

`protocol-bunker --uninstall`

### Важно про обновление

`protocol-bunker --update` переустанавливает архив целиком, но сохраняет:
- настройки (`portable.env`);
- данные (`app/data`).

---

## Если `protocol-bunker` не в PATH

Тогда используй полный путь:

`~/.local/bin/protocol-bunker --disable-autostart`

`~/.local/bin/protocol-bunker --uninstall`

---

## Вариант 3. Сборка из репозитория

Этот вариант нужен, если ты хочешь запускать проект из исходников, вносить правки или собирать свои артефакты.

### Что нужно заранее

У тебя должны быть установлены:
- `Git`
- `Node.js` актуальной LTS-версии
- `pnpm`

### Установка зависимостей

Из корня проекта:

`pnpm install`

### Проверка типов

`pnpm typecheck`

### Полная сборка

`pnpm build`

После этого можно собирать нужные релизные артефакты.

### Команды сборки

#### Windows

Основная упаковка под Windows:

`pnpm pack:win`

Если нужен EXE-вариант:

`pnpm pack:win-exe`

#### Linux x64

`pnpm pack:linux`

#### Linux ARM64

`pnpm pack:linux:arm64`

### Полезный безопасный порядок

Если ты собираешь свою версию из репозитория, нормальный порядок такой:

1. `pnpm install`
2. `pnpm typecheck`
3. `pnpm build`

При необходимости дополнительно:
- `pnpm locale:audit`
- `pnpm locale:check`
- `pnpm test:integration`

Потом уже:
- `pnpm pack:win`
- `pnpm pack:win-exe`
- `pnpm pack:linux`
- `pnpm pack:linux:arm64`

---

## Что проверить после запуска

После того как игра поднята, проверь по порядку:

1. Интерфейс вообще открывается.
2. Комната создаётся.
3. Ссылка на комнату открывается у тебя.
4. Другой игрок может зайти по ссылке.
5. Подключение не ломается сразу после входа.
6. Если нужен стрим — overlay-сценарий тоже доступен.

---

## Если игра открывается только у тебя

Это почти всегда проблема не самой игры, а доступа к ней.

Проверь:
- правильный ли адрес ты отправляешь;
- доступен ли нужный порт;
- не мешает ли firewall;
- не закрыт ли доступ извне;
- работает ли не только страница, но и websocket-подключение.

Очень частая ситуация: страница у хоста открывается, а у других игроков нет. Тогда проблема обычно в сети, прокси, порте или внешнем доступе.

---

## Если нужен доступ через интернет

Если игроки подключаются не из локальной сети, тебе может понадобиться:
- внешний адрес;
- домен;
- reverse proxy;
- корректная работа websocket;
- HTTPS.

Для продвинутого Linux-сценария смотри:
- `linux-nginx.md`
- `deployment.md`

---

## Удаление установки (Linux)

Сначала отключи автозапуск:

`protocol-bunker --disable-autostart`

Потом удали установку:

`protocol-bunker --uninstall`

Если команда не находится:

`~/.local/bin/protocol-bunker --disable-autostart`

`~/.local/bin/protocol-bunker --uninstall`

---

## Что читать дальше

Если нужен Linux-сценарий с nginx:
- `linux-nginx.md`

Если нужен более общий deployment-гайд:
- `deployment.md`

Если ты просто хочешь играть:
- `../user/getting-started.md`

## Примечание

Самый простой путь для большинства хостов такой:
1. скачать релиз или поставить через `install.sh`;
2. запустить игру;
3. открыть комнату;
4. отправить ссылку;
5. проверить, что другой игрок реально заходит.