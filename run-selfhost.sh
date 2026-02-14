#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

# Detect OS
OS_NAME="$(uname -s 2>/dev/null || echo "unknown")"

say_info() { printf "INFO: %s\n" "$1"; }
say_ok() { printf "\033[0;32mINFO: %s\033[0m\n" "$1"; }
say_warn() { printf "\033[0;33mWARN: %s\033[0m\n" "$1"; }
say_err() { printf "\033[0;31mERROR: %s\033[0m\n" "$1"; }

say_info "Detected OS: $OS_NAME"
case "$OS_NAME" in
  MINGW*|MSYS*|CYGWIN*|Windows_NT)
    say_err "This .sh script is not supported on Windows."
    say_info "Use run-selfhost.bat instead."
    exit 1
    ;;
esac

# Force prod identity for selfhost (ignore any dev .env)
export BUNKER_IDENTITY_MODE="prod"
export VITE_IDENTITY_MODE="prod"
export DEV_NEW_PLAYER_PER_TAB="false"
export VITE_DEV_TAB_IDENTITY="false"
export VITE_DEV_NEW_PLAYER_PER_TAB="false"

PORT="${PORT:-3000}"
HOST="${HOST:-0.0.0.0}"

open_url() {
  if command -v xdg-open >/dev/null 2>&1; then xdg-open "$1" >/dev/null 2>&1 &
  elif command -v open >/dev/null 2>&1; then open "$1" >/dev/null 2>&1 &
  else echo "Open this URL in your browser: $1"; fi
}

ensure_node() {
  if command -v node >/dev/null 2>&1; then
    say_ok "Node.js found :)"
    return
  fi
  say_warn "Node.js not found."
  read -r -p "Install Node.js LTS now? (Required for the game) (y/N) " ans
  if [ "$ans" != "y" ] && [ "$ans" != "Y" ]; then
    say_err "Node.js is required."
    open_url "https://nodejs.org/en/download"
    exit 1
  fi

  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y nodejs npm
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y nodejs npm
  elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -Sy --noconfirm nodejs npm
  elif command -v zypper >/dev/null 2>&1; then
    sudo zypper install -y nodejs npm
  elif command -v apk >/dev/null 2>&1; then
    sudo apk add --no-cache nodejs npm
  elif command -v brew >/dev/null 2>&1; then
    brew install node
  else
    say_err "No supported package manager found. Install Node.js manually."
    open_url "https://nodejs.org/en/download"
    exit 1
  fi

  if command -v node >/dev/null 2>&1; then
    say_ok "Node.js installed :)"
  else
    say_err "Node.js install finished, but node is still not in PATH. Restart the terminal."
    exit 1
  fi
}

ensure_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    say_ok "pnpm found :)"
    return
  fi

  say_warn "pnpm not found."

  if command -v corepack >/dev/null 2>&1; then
    corepack enable >/dev/null 2>&1 || true
    corepack prepare pnpm@latest --activate >/dev/null 2>&1 || true
  fi

  if command -v pnpm >/dev/null 2>&1; then
    say_ok "pnpm installed via corepack :)"
    return
  fi

  if ! command -v npm >/dev/null 2>&1; then
    say_err "npm not found. Install Node.js LTS and restart the terminal."
    open_url "https://nodejs.org/en/download"
    exit 1
  fi

  read -r -p "Install pnpm via npm -g? (Required for the game) (y/N) " ans
  if [ "$ans" != "y" ] && [ "$ans" != "Y" ]; then
    say_err "pnpm is required."
    exit 1
  fi

  npm i -g pnpm

  if command -v pnpm >/dev/null 2>&1; then
    say_ok "pnpm installed :)"
  else
    say_err "pnpm install failed."
    exit 1
  fi
}

check_port() {
  if command -v lsof >/dev/null 2>&1; then
    if lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
      say_err "Port $PORT is already in use. Stop the other server or set PORT to another value."
      exit 1
    fi
  elif command -v ss >/dev/null 2>&1; then
    if ss -lnt "sport = :$PORT" | grep -q ":$PORT"; then
      say_err "Port $PORT is already in use. Stop the other server or set PORT to another value."
      exit 1
    fi
  fi
}

wait_server_up() {
  local tries=20
  local ok=false
  for _ in $(seq 1 $tries); do
    if command -v curl >/dev/null 2>&1; then
      if curl -fsS --max-time 1 "http://127.0.0.1:$PORT" >/dev/null 2>&1; then
        ok=true
        break
      fi
    elif command -v nc >/dev/null 2>&1; then
      if nc -z 127.0.0.1 "$PORT" >/dev/null 2>&1; then
        ok=true
        break
      fi
    else
      if (echo >"/dev/tcp/127.0.0.1/$PORT") >/dev/null 2>&1; then
        ok=true
        break
      fi
    fi
    sleep 0.5
  done

  if [ "$ok" = true ]; then
    say_ok "Server is up on http://127.0.0.1:$PORT"
    return 0
  fi

  say_err "Server did not respond on http://127.0.0.1:$PORT"
  return 1
}

ensure_node
ensure_pnpm

echo "============================================"
echo "Bunker Selfhost Launcher (Linux/macOS)"
echo "============================================"
echo "1) Local (HTTP) - IP:PORT"
echo "2) Domain (HTTPS) - reverse-proxy"
echo
read -r -p "Choose mode [1-2]: " MODE

get_ip() {
  if command -v hostname >/dev/null 2>&1; then
    hostname -I 2>/dev/null | awk '{print $1}'
  fi
}

if [ "$MODE" = "1" ]; then
  IP="$(get_ip)"
  if [ -z "$IP" ]; then IP="127.0.0.1"; fi
  echo
  echo "Open: http://$IP:$PORT"
  echo
  pnpm install
  pnpm run build
  check_port
  HOST="$HOST" PORT="$PORT" TRUST_PROXY=false node server/dist/index.js &
  server_pid=$!
  if ! wait_server_up; then
    kill "$server_pid" >/dev/null 2>&1 || true
    exit 1
  fi
  wait "$server_pid"
elif [ "$MODE" = "2" ]; then
  read -r -p "Enter domain (e.g. bunker.example.com): " DOMAIN
  if [ -z "$DOMAIN" ]; then DOMAIN="example.com"; fi

  if [ "$(uname -s)" = "Linux" ]; then
    mkdir -p .selfhost
    auto_flag=".selfhost/proxy-auto"
    disable_flag=".selfhost/proxy-auto-disabled"

    if [ -n "$BUNKER_DISABLE_PROXY_SETUP" ] || [ -f "$disable_flag" ]; then
      say_warn "Auto proxy setup disabled. To enable: delete $disable_flag"
    else
      if [ -f "$auto_flag" ]; then
        say_ok "Auto proxy setup enabled (running checks)."
        bash scripts/launchers/linux-proxy-setup.sh "$DOMAIN" "$PORT" || true
      else
        read -r -p "Run automatic reverse-proxy setup (Linux only)? (y/N) " ans
        if [ "$ans" = "y" ] || [ "$ans" = "Y" ]; then
          touch "$auto_flag"
          rm -f "$disable_flag"
          bash scripts/launchers/linux-proxy-setup.sh "$DOMAIN" "$PORT" || true
        else
          touch "$disable_flag"
          say_warn "Auto proxy setup disabled. To enable later: delete $disable_flag"
        fi
      fi
    fi
  fi

  echo
  echo "Open: https://$DOMAIN"
  echo "Configure reverse-proxy (Caddy/Nginx)."
  echo
  pnpm install
  pnpm run build
  check_port
  HOST="127.0.0.1" PORT="$PORT" TRUST_PROXY=true PUBLIC_ORIGIN="https://$DOMAIN" node server/dist/index.js &
  server_pid=$!
  if ! wait_server_up; then
    kill "$server_pid" >/dev/null 2>&1 || true
    exit 1
  fi
  wait "$server_pid"
else
  say_err "Invalid choice."
fi
