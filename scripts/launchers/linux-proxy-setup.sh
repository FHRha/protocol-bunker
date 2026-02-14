#!/usr/bin/env bash
set -e

DOMAIN="$1"
PORT="$2"

if [ -z "$DOMAIN" ] || [ -z "$PORT" ]; then
  echo "Usage: linux-proxy-setup.sh <domain> <port>"
  exit 1
fi

say_ok() { printf "\033[0;32m%s\033[0m\n" "$1"; }
say_warn() { printf "\033[0;33m%s\033[0m\n" "$1"; }
say_err() { printf "\033[0;31m%s\033[0m\n" "$1"; }

check_443() {
  if command -v ss >/dev/null 2>&1; then
    if ss -lnt "sport = :443" | grep -q ":443"; then
      say_err "Port 443 is already in use. Stop the service or choose another host."
      exit 1
    fi
  elif command -v lsof >/dev/null 2>&1; then
    if lsof -iTCP:443 -sTCP:LISTEN >/dev/null 2>&1; then
      say_err "Port 443 is already in use. Stop the service or choose another host."
      exit 1
    fi
  else
    say_warn "No ss/lsof found to проверять port 443."
  fi
}

check_server_port() {
  if command -v ss >/dev/null 2>&1; then
    if ss -lnt "sport = :$PORT" | grep -q ":$PORT"; then
      say_ok "Server port $PORT is already listening."
    else
      say_warn "Server port $PORT is not listening yet (will be checked after start)."
    fi
  elif command -v lsof >/dev/null 2>&1; then
    if lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
      say_ok "Server port $PORT is already listening."
    else
      say_warn "Server port $PORT is not listening yet (will be checked after start)."
    fi
  fi
}

choose_proxy() {
  local has_caddy=false
  local has_nginx=false
  if command -v caddy >/dev/null 2>&1; then has_caddy=true; fi
  if command -v nginx >/dev/null 2>&1; then has_nginx=true; fi

  if [ "$has_caddy" = true ]; then
    echo "caddy"
    return
  fi
  if [ "$has_nginx" = true ]; then
    echo "nginx"
    return
  fi

  say_warn "Neither Caddy nor Nginx is installed."
  echo "none"
}

install_caddy() {
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y caddy
    return
  fi
  if command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y caddy
    return
  fi
  if command -v pacman >/dev/null 2>&1; then
    sudo pacman -Sy --noconfirm caddy
    return
  fi
  if command -v zypper >/dev/null 2>&1; then
    sudo zypper install -y caddy
    return
  fi
  if command -v apk >/dev/null 2>&1; then
    sudo apk add --no-cache caddy
    return
  fi
  say_err "Unsupported package manager for Caddy install."
  exit 1
}

install_nginx() {
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y nginx
    return
  fi
  if command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y nginx
    return
  fi
  if command -v pacman >/dev/null 2>&1; then
    sudo pacman -Sy --noconfirm nginx
    return
  fi
  if command -v zypper >/dev/null 2>&1; then
    sudo zypper install -y nginx
    return
  fi
  if command -v apk >/dev/null 2>&1; then
    sudo apk add --no-cache nginx
    return
  fi
  say_err "Unsupported package manager for Nginx install."
  exit 1
}

configure_caddy() {
  local caddyfile="/etc/caddy/Caddyfile"
  local backup="/etc/caddy/Caddyfile.bunker.bak"

  if [ -f "$caddyfile" ]; then
    sudo cp "$caddyfile" "$backup"
    say_warn "Caddyfile backed up to $backup"
  fi

  sudo tee "$caddyfile" >/dev/null <<EOF
$DOMAIN {
  reverse_proxy localhost:$PORT
}
EOF

  sudo systemctl enable --now caddy
  sudo systemctl restart caddy
  say_ok "Caddy configured for $DOMAIN -> localhost:$PORT"
}

configure_nginx() {
  local conf="/etc/nginx/sites-available/bunker.conf"
  local link="/etc/nginx/sites-enabled/bunker.conf"

  sudo tee "$conf" >/dev/null <<EOF
server {
  listen 80;
  server_name $DOMAIN;

  location / {
    proxy_pass http://127.0.0.1:$PORT;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
  }
}
EOF

  sudo ln -sf "$conf" "$link"
  sudo nginx -t
  sudo systemctl enable --now nginx
  sudo systemctl restart nginx
  say_ok "Nginx configured for $DOMAIN -> 127.0.0.1:$PORT (HTTP only)"
  say_warn "For HTTPS, add certbot/ACME or use Caddy instead."
}

say_ok "Proxy preflight: domain=$DOMAIN, port=$PORT"
check_443
check_server_port

proxy=$(choose_proxy)
if [ "$proxy" = "none" ]; then
  read -r -p "Install Caddy automatically? (Recommended) (y/N) " ans
  if [ "$ans" != "y" ] && [ "$ans" != "Y" ]; then
    say_err "No proxy installed. Skipping automatic setup."
    exit 1
  fi
  install_caddy
  proxy="caddy"
fi

if [ "$proxy" = "caddy" ]; then
  configure_caddy
  exit 0
fi

if [ "$proxy" = "nginx" ]; then
  configure_nginx
  exit 0
fi

say_err "Unsupported proxy choice."
exit 1
