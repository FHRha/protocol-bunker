# Протокол: Бункер

Это браузерная версия настолки «Бункер» для друзей, которые хотят спорить и голосовать, но не хотят собираться в одной комнате и печатать карточки (хотя собраться вместе вы сможете с андроид версией).

Проект живой: тут много “как в настолке”, немного “как в стриме”, и чуть-чуть “почему всё снова обсуждают 60 секунд”.

---

## Что это

Протокол: Бункер — онлайн-стол для игры в «Бункер»:
- есть лобби, настройки и старт от ведущего
- есть игровой стол и раскрытие карт по ходам
- есть голосования по правилам
- есть режим для стримов (OBS overlay)
- есть отдельная ссылка для зрителей (read-only), чтобы никто не лез управлять игрой и не превращал чат в “а покажи код комнаты”

Если коротко: заходите, создаёте комнату, играете. Дальше начнётся социальная инженерия и аргументы уровня “ну я же адекватный”.

---

## Как играть (очень кратко)

1) Введите имя (желательно не “1”, но мы вас не осудим. Почти).
2) Создайте комнату или зайдите по ссылке.
3) Ведущий запускает игру (и принимает на себя карму).
4) В каждом круге игроки по очереди раскрывают карты, обсуждают, потом голосуют (если в этом раунде положено).
5) В финале остаются те, кто убедил остальных. Или те, кто громче говорил. Как пойдёт.

---

## Что уже сделано

- Лобби с настройками (таймеры, кто может продолжить кон, кто открывает угрозы и т.д.)
- Переходы/модалки с анимациями
- Защита от странностей при переподключении: кнопки блокируются, пока связь не восстановится (да, это специально, а не “сломалось”)
- Отдельная страница зрителя (read-only)
- Streamer mode + ссылки для OBS (view/control)
- Нормальная обработка ошибок вместо “белого экрана” (у кого-то может и синего)

---

## Открытый исходный код и кастомизация

Да, это **open-source**. То есть игра — не “закрытая магия”, а нормальный проект, который можно:
- допиливать под себя,
- добавлять сценарии,
- добавлять/менять колоды,
- править тексты, оформление, механики (если руки чешутся — лечению не подлежит).

Если вы хотите сделать “свой Бункер” (с мемами вашей компании, локальными приколами и “сценарием про ЖКХ”) — это как раз тот случай: берёте, форкаете, делаете.

---

## Скачать

Все ссылки ведут на **GitHub Releases → Latest**. На странице релиза выберите нужный файл:

| Платформа | Файлы в релизе |
|---|---|
| Android | [Все необходимые Android-релизы (armv7, arm64 и т.д.)](https://github.com/FHRha/protocol-bunker-android/releases) |
| macOS | В разработке |
| Windows | [Setup x64](https://github.com/FHRha/protocol-bunker/releases/latest) · [EXE x64 (zip)](https://github.com/FHRha/protocol-bunker/releases/latest) · [Portable x64](https://github.com/FHRha/protocol-bunker/releases/latest) |
| Linux x64 | [Public](https://github.com/FHRha/protocol-bunker/releases/latest) · [Server](https://github.com/FHRha/protocol-bunker/releases/latest) |
| Linux ARM64 | [Public](https://github.com/FHRha/protocol-bunker/releases/latest) · [Server](https://github.com/FHRha/protocol-bunker/releases/latest) |

> Если файлов на странице релиза пока нет — значит сборки ещё не залиты (или GitHub решил устроить нам квест).

### Про macOS

Я не обещаю, что всё заведётся идеально.  
Если заведётся — отлично. Если нет — будем чинить (возможно).  
А если заведётся “с первого раза” — значит где-то во вселенной нарушен баланс.

### Windows (EXE Launcher)

- `protocol-bunker-win-x64-exe-setup-v0.1.2.exe` — установщик/бутстраппер (скачает нужные файлы и развернёт игру).
- `ProtocolBunker.exe` — лаунчер: запускает сервер, показывает логи/статус, есть кнопка **Check updates**.
- `protocol-bunker-win-x64-exe-v0.1.2.zip` — архив с релизными файлами (на случай “я хочу руками и всё контролировать”).

Коротко: хочешь “как у людей” — **setup**. Хочешь “я сам себе DevOps” — **zip**.

## Про portable

Portable — это “скачал и запустил”. Без установщиков, просто папка.  
Удобно, если не хочется трогать систему или вы запускаете игру с флешки/второго диска.

(Да, это версия для людей, которые на слово “установщик” отвечают: “не, спасибо, я уже обжигался”.)

---

## Установка (самохост)

### Требования
- **Git**
- **Node.js** (актуальная LTS)
- **pnpm**
- **curl** (нужен, если вы пользуетесь `install.sh` через терминал/однострочник)

> Если `curl` не установлен — поставьте его (или просто скачайте `install.sh` через браузер и запустите локально).

### Установка через install.sh
Если вы хотите ставить через `install.sh`, скачайте и запустите его:

- скачать:
  - `curl -fsSL https://raw.githubusercontent.com/FHRha/protocol-bunker/main/install.sh -o install.sh`
- запустить:
  - `bash install.sh`
  - `bash install.sh --edition server` (серверный Linux-профиль: без вывода LAN/localhost ссылок)

Быстрые команды через `curl` (без ручного скачивания файла):

- latest, public-профиль:
```bash
curl -fsSL https://raw.githubusercontent.com/FHRha/protocol-bunker/main/install.sh | bash
```
- latest, server-профиль:
```bash
curl -fsSL https://raw.githubusercontent.com/FHRha/protocol-bunker/main/install.sh | bash -s -- --edition server
```
- latest, server-профиль (ARM64):
```bash
curl -fsSL https://raw.githubusercontent.com/FHRha/protocol-bunker/main/install.sh | bash -s -- --edition server --arch arm64
```
- конкретная версия, public-профиль:
```bash
curl -fsSL https://raw.githubusercontent.com/FHRha/protocol-bunker/main/install.sh | bash -s -- --version v0.1.2
```
- конкретная версия, server-профиль:
```bash
curl -fsSL https://raw.githubusercontent.com/FHRha/protocol-bunker/main/install.sh | bash -s -- --edition server --version v0.1.2
```

Что выбрать:

- `public` — обычный профиль (показывает и Public, и Local ссылки).
- `server` — серверный профиль (скрывает LAN/localhost ссылки в выводе launcher и в блоке ссылок в лобби).
- `--arch` — можно явно выбрать `x64` или `arm64`. Если не указывать, `install.sh` определит архитектуру автоматически (`uname -m`).

### Автозапуск и сервис (Linux)

Включить автозапуск сразу при установке:

```bash
curl -fsSL https://raw.githubusercontent.com/FHRha/protocol-bunker/main/install.sh | bash -s -- --edition server --service-scope system --autostart
```

По умолчанию `--service-scope auto`: для `root` используется `system`, для обычного пользователя — `user`.

Включить автозапуск после установки:

```bash
protocol-bunker --enable-autostart
```

Отключить автозапуск:

```bash
protocol-bunker --disable-autostart
```

Стандартные пути установки (Linux):

- игра: `~/.local/share/protocol-bunker/Protocol-Bunker`
- launcher-команда: `~/.local/bin/protocol-bunker`
- service unit: `/etc/systemd/system/protocol-bunker.service`

Редактирование настроек (стандартная установка):

```bash
nano ~/.local/share/protocol-bunker/Protocol-Bunker/portable.env
```
Для запуска на выделенном сервере перед первым стартом поправьте `portable.env` и поставьте минимум:

```env
PORT=0
DEV_MODE=0
MODE=local
```

Или для домена:

```env
PORT=8080
DEV_MODE=0
MODE=domain
DOMAIN=your.domain.com
```

Для режима `MODE=local` можно явно задать внешний адрес и отключить авто-определение через внешние сервисы:

```env
PUBLIC_HOST=203.0.113.10
# или
PUBLIC_ORIGIN=http://203.0.113.10:8080
```

Если `PUBLIC_HOST`/`PUBLIC_ORIGIN` не заданы, внешний адрес определяется автоматически через `api.ipify.org` (fallback: `ifconfig.me/ip`).

Особенность `PUBLIC_ORIGIN`:
- можно указывать `https://your.domain.com` (домен + HTTPS) — это корректно;
- порт указывайте только если внешний доступ у пользователей реально идёт на нестандартный порт (например `:8443`);
- если домен работает через reverse-proxy на стандартном `443`, обычно порт в `PUBLIC_ORIGIN` не нужен.

После изменения настроек перезапустите сервис:

```bash
sudo systemctl restart protocol-bunker
```

Полезные команды сервиса:

```bash
sudo systemctl status protocol-bunker
sudo systemctl stop protocol-bunker
sudo systemctl start protocol-bunker
sudo journalctl -u protocol-bunker -f
```

Подробный пример reverse-proxy через `nginx stream` (Linux, server-профиль):
- `docs/nginx-stream-linux.md`


Удаление установки (Linux):

```bash
protocol-bunker --disable-autostart
protocol-bunker --uninstall
```

Если команда `protocol-bunker` не в PATH:

```bash
~/.local/bin/protocol-bunker --disable-autostart
~/.local/bin/protocol-bunker --uninstall
```

---

## Для стримов и зрителей

Streamer mode делает две вещи:
- даёт ссылки для OBS (view/control)
- прячет то, что лучше не показывать на стриме

Для зрителей есть отдельная страница (read-only). Она показывает стол и открытые элементы, но не даёт ничего нажимать и никого “не подключает” как игрока.  
То есть зрители смотрят, а не устраивают “а давайте я нажму”.
Внешний адрес для ссылок определяется автоматически через `api.ipify.org` (fallback: `ifconfig.me/ip`), либо задаётся вручную через `Public Host`/`Domain`.
В интерфейсе ссылки показываются в двух вариантах: `LAN` и `Внешняя` (если внешний адрес доступен).

---

## Важно про использование на стримах и в коммерции

Если вы используете игру:
- на стримах/роликах/видео,
- в коммерческих активностях (ивенты, платные игры, клубы, “мы просто берём донатик, это не коммерция, честно”),

то **упомяните автора**: **FHR**.

Достаточно коротко:  
**“Игра сделана FHR”** / **“Protocol: Bunker by FHR”** + ссылка на репозиторий (если уместно).  
Это не налог, не лицензия и не “плати за воздух” — просто нормальная человеческая отметка авторства.

---

## Разработка

Проект состоит из клиента и сервера. Как запускать — зависит от того, как у вас настроены скрипты в package.json (npm/pnpm). Обычно это “поставить зависимости → поднять сервер → поднять клиент”.

Я специально не пишу команды в README “наугад”, чтобы не было мимо вашего реального сетапа.  
(Потому что если я напишу “делай так”, а у вас там pnpm/monorepo/скрипты по-своему — виноват буду я, а не жизнь.)

---

## Автор

Сделано FHR.

Если что-то выглядит странно — возможно, это ещё не финальная полировка.
Если всё работает — значит сегодня хороший день.

---

## Сборка релизов (0.1.2)

Полная сборка:
- `pnpm run build:all`
- `pnpm run pack:win`
- `pnpm run pack:linux`
- `pnpm run pack:linux:arm64`
- `pnpm run pack:win-exe`

Быстро (если dist уже актуальны):
- `pnpm run pack:win -- --skip-build`
- `pnpm run pack:linux -- --skip-build`
- `pnpm run pack:linux:arm64 -- --skip-build`
- `pnpm run pack:win-exe -- --skip-build`

Где результаты:
- `artifacts/win/`
- `artifacts/linux/`:
  - `protocol-bunker-linux-x64-public-v0.1.2.tar.gz`
  - `protocol-bunker-linux-x64-server-v0.1.2.tar.gz`
  - `protocol-bunker-linux-arm64-public-v0.1.2.tar.gz`
  - `protocol-bunker-linux-arm64-server-v0.1.2.tar.gz`
- `artifacts/win-exe/`
