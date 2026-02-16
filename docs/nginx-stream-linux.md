# Nginx Stream Для Linux Server-Профиля

Этот гайд для случая, когда:
- игра установлена как Linux `server` профиль;
- сервер игры слушает локально на `127.0.0.1:8080`;
- наружу хотите отдавать через домен и `443` с `nginx stream`.

Схема:
- внешний клиент -> `:443` (stream, SNI)
- stream отправляет трафик на локальный HTTPS-вход `127.0.0.1:8445`
- локальный HTTPS-вход проксирует в игру `127.0.0.1:8080`

## 1) Настройте portable.env

Файл:
```bash
nano ~/.local/share/protocol-bunker/Protocol-Bunker/portable.env
```

Минимум для доменного режима:
```env
PORT=8080
DEV_MODE=0
MODE=domain
DOMAIN=your.domain.com
```

Применить:
```bash
systemctl --user restart protocol-bunker
systemctl --user status protocol-bunker --no-pager
```

## 2) HTTP-конфиг Nginx (локальный HTTPS на 8445)

Создайте файл:
```bash
sudo nano /etc/nginx/conf.d/game-8445.conf
```

Вставьте:
```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 127.0.0.1:8445 ssl;
    server_name your.domain.com;

    ssl_certificate     /etc/letsencrypt/live/your.domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your.domain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;

        proxy_read_timeout 3600;
        proxy_send_timeout 3600;
        proxy_buffering off;
    }
}
```

Важно:
- для этого проекта отдельный `location /socket.io/` не нужен;
- если убрать `Upgrade/Connection`, UI может открываться, но WebSocket будет рваться.

## 3) Stream-маршрутизация в nginx.conf

Откройте:
```bash
sudo nano /etc/nginx/nginx.conf
```

Пример блока:
```nginx
stream {
    map $ssl_preread_server_name $upstream {
        your.domain.com game;
        default xray;
    }

    upstream game { server 127.0.0.1:8445; }
    upstream xray { server 127.0.0.1:443; }

    server {
        listen <SERVER_IP>:443;
        ssl_preread on;
        proxy_pass $upstream;
    }
}
```

Если на сервере только игра и ничего больше, можно упростить:
- без `map`;
- сразу `proxy_pass 127.0.0.1:8445`.

## 4) Проверка и перезапуск Nginx

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 5) Быстрый чек

Проверьте, что игра жива локально:
```bash
curl -I http://127.0.0.1:8080
```

Проверьте логи игры:
```bash
journalctl --user -u protocol-bunker -n 80 --no-pager
```

Проверьте логи Nginx:
```bash
sudo journalctl -u nginx -n 120 --no-pager
```

## Частые проблемы

1) UI открывается, но сверху "Не удалось переподключиться":
- почти всегда нет корректного WebSocket proxy (`Upgrade`/`Connection`).

2) `502/503`:
- игра не запущена;
- неверный `proxy_pass` порт;
- `MODE=domain` с `PORT=0` (так нельзя, нужен фиксированный порт).

3) Сертификат не читается:
- проверьте пути в `ssl_certificate`/`ssl_certificate_key`;
- проверьте права на файлы сертификата.

4) Stream не работает:
- проверьте, что Nginx собран с stream-модулем:
```bash
nginx -V 2>&1 | grep -o with-stream
```

Если stream-модуля нет, используйте обычный `server { listen 443 ssl; ... }` в `http` секции без stream.
