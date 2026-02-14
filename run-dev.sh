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
    say_info "Use run-dev.bat instead."
    exit 1
    ;;
esac

# Force dev identity for local dev
export BUNKER_IDENTITY_MODE="dev_tab"
export VITE_IDENTITY_MODE="dev_tab"
export DEV_NEW_PLAYER_PER_TAB="true"
export VITE_DEV_TAB_IDENTITY="true"
export VITE_DEV_NEW_PLAYER_PER_TAB="true"

# Dev ports (client expects server on 3001)
export PORT="3001"
export HOST="127.0.0.1"
export BUNKER_SERVE_CLIENT="false"
export VITE_WS_URL="ws://localhost:3001"
export VITE_API_BASE="http://localhost:3001"
export VITE_ASSET_BASE="http://localhost:3001/assets"

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

ensure_node
ensure_pnpm
check_port

echo "============================================"
echo "Bunker Dev Launcher (Linux/macOS)"
echo "============================================"
say_info "Open in browser: http://localhost:5173"

pnpm install
pnpm dev
