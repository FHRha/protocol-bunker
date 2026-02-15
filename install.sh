#!/usr/bin/env bash
set -euo pipefail

# =========================
# Config (edit this)
# =========================
REPO="FHRha/protocol-bunker" 
APP_NAME="protocol-bunker"
# =========================

INSTALL_ROOT="${HOME}/.local/share/${APP_NAME}"
BIN_DIR="${HOME}/.local/bin"
APP_DIR="${INSTALL_ROOT}/Protocol-Bunker"
SYSTEMD_DIR="${HOME}/.config/systemd/user"
SERVICE_NAME="protocol-bunker"
SERVICE_FILE="${SYSTEMD_DIR}/${SERVICE_NAME}.service"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ----- output helpers -----
info() { printf "[%s] %s\n" "$APP_NAME" "$*"; }
warn() { printf "[%s] WARN: %s\n" "$APP_NAME" "$*"; }
err()  { printf "[%s] ERROR: %s\n" "$APP_NAME" "$*"; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || err "Missing required command: $1"; }

need curl
need tar

VERSION=""         # empty => latest
DO_LIST=0
AUTOSTART_MODE=""  # "yes" | "no" | ""
EDITION="public"   # public | server

usage() {
  cat <<EOF
Install ${APP_NAME} (Linux, no sudo)

Usage:
  install.sh [--version vX.Y.Z] [--edition public|server] [--list] [--autostart|--no-autostart]

Examples:
  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash
  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash -s -- --version v0.1.2
  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash -s -- --edition server
  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash -s -- --list
  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash -s -- --autostart
EOF
}

# ----- parse args -----
while [ $# -gt 0 ]; do
  case "$1" in
    --version)
      shift
      [ $# -gt 0 ] || err "--version requires a value like v0.1.2"
      VERSION="$1"
      ;;
    --edition)
      shift
      [ $# -gt 0 ] || err "--edition requires 'public' or 'server'"
      EDITION="$1"
      ;;
    --list) DO_LIST=1 ;;
    --autostart) AUTOSTART_MODE="yes" ;;
    --no-autostart) AUTOSTART_MODE="no" ;;
    --help|-h) usage; exit 0 ;;
    *) err "Unknown argument: $1" ;;
  esac
  shift
done

# ----- github helpers -----
gh_api() {
  curl -fsSL --retry 2 --retry-delay 1 -H "Accept: application/vnd.github+json" "$1"
}

json_tags() {
  if command -v jq >/dev/null 2>&1; then
    jq -r '.[].tag_name'
  else
    # simple fallback extractor
    sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'
  fi
}

json_latest_tag() {
  if command -v jq >/dev/null 2>&1; then
    jq -r '.tag_name'
  else
    sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1
  fi
}

validate_version_format() {
  # require leading "v"
  if [[ "$1" != v* ]]; then
    err "Version must start with 'v' (example: v0.1.2). Got: $1"
  fi
}

validate_edition() {
  case "$1" in
    public|server) ;;
    *) err "Edition must be 'public' or 'server'. Got: $1" ;;
  esac
}

list_versions() {
  info "Fetching releases list from GitHub..."
  gh_api "https://api.github.com/repos/${REPO}/releases?per_page=100" \
    | json_tags \
    | sed '/^null$/d' \
    | nl -w2 -s'. '
}

resolve_latest_version() {
  gh_api "https://api.github.com/repos/${REPO}/releases/latest" | json_latest_tag
}

# ----- list only -----
if [ "$DO_LIST" -eq 1 ]; then
  list_versions
  exit 0
fi

# ----- decide version -----
if [ -n "$VERSION" ]; then
  validate_version_format "$VERSION"
  info "Requested version: $VERSION"
else
  info "Resolving latest version..."
  VERSION="$(resolve_latest_version || true)"
  [ -n "$VERSION" ] || err "Failed to resolve latest release version."
  validate_version_format "$VERSION"
  info "Latest: $VERSION"
fi

validate_edition "$EDITION"
ASSET="protocol-bunker-linux-x64-${EDITION}-${VERSION}.tar.gz"
URL="https://github.com/${REPO}/releases/download/${VERSION}/${ASSET}"

# ----- download + install -----
mkdir -p "$INSTALL_ROOT" "$BIN_DIR"

info "Downloading: $URL"
curl -fL --retry 3 --retry-delay 1 -o "$TMP/$ASSET" "$URL"

info "Installing to: $APP_DIR"
rm -rf "$APP_DIR"
tar -xzf "$TMP/$ASSET" -C "$INSTALL_ROOT"

[ -f "$APP_DIR/start.sh" ] || err "start.sh not found at $APP_DIR/start.sh (check tar structure)"
chmod +x "$APP_DIR/start.sh" || true

# ----- create launcher -----
LAUNCHER="${BIN_DIR}/${APP_NAME}"
INSTALL_URL="https://raw.githubusercontent.com/${REPO}/main/install.sh"

cat > "$LAUNCHER" <<EOF
#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME}"
APP_DIR="\${HOME}/.local/share/${APP_NAME}/Protocol-Bunker"
SYSTEMD_DIR="\${HOME}/.config/systemd/user"
SERVICE_NAME="${SERVICE_NAME}"
SERVICE_FILE="\${SYSTEMD_DIR}/\${SERVICE_NAME}.service"
INSTALL_URL="${INSTALL_URL}"
EDITION="${EDITION}"

msg() { printf "[%s] %s\n" "\$APP_NAME" "\$*"; }

enable_autostart() {
  command -v systemctl >/dev/null 2>&1 || { msg "systemctl not found; autostart unavailable."; return 1; }
  mkdir -p "\$SYSTEMD_DIR"

  cat > "\$SERVICE_FILE" <<SERVICE
[Unit]
Description=Protocol: Bunker (self-host server)
After=network-online.target

[Service]
Type=simple
WorkingDirectory=%h/.local/share/${APP_NAME}/Protocol-Bunker
ExecStart=%h/.local/share/${APP_NAME}/Protocol-Bunker/start.sh
Restart=on-failure
RestartSec=2

[Install]
WantedBy=default.target
SERVICE

  systemctl --user daemon-reload
  systemctl --user enable --now "\$SERVICE_NAME"
  msg "Autostart enabled (systemd --user)."
  msg "Tip: if it doesn't start after reboot on headless systems, you may need linger (requires sudo):"
  msg "  sudo loginctl enable-linger \$USER"
}

disable_autostart() {
  command -v systemctl >/dev/null 2>&1 || true
  systemctl --user disable --now "\$SERVICE_NAME" >/dev/null 2>&1 || true
  rm -f "\$SERVICE_FILE"
  systemctl --user daemon-reload >/dev/null 2>&1 || true
  msg "Autostart disabled."
}

case "\${1:-}" in
  --help|-h)
    echo "\$APP_NAME: launch Protocol: Bunker self-host"
    echo "Usage:"
    echo "  \$APP_NAME"
    echo "  \$APP_NAME --update [vX.Y.Z]"
    echo "  \$APP_NAME --enable-autostart"
    echo "  \$APP_NAME --disable-autostart"
    echo "  \$APP_NAME --uninstall"
    exit 0
    ;;
  --update)
    # If version provided -> install that, else latest
    if [ -n "\${2:-}" ]; then
      curl -fsSL "\$INSTALL_URL" | bash -s -- --edition "\$EDITION" --version "\$2"
    else
      curl -fsSL "\$INSTALL_URL" | bash -s -- --edition "\$EDITION"
    fi
    exit 0
    ;;
  --enable-autostart) enable_autostart; exit \$? ;;
  --disable-autostart) disable_autostart; exit 0 ;;
  --uninstall)
    disable_autostart >/dev/null 2>&1 || true
    rm -rf "\${HOME}/.local/share/${APP_NAME}"
    rm -f  "\${HOME}/.local/bin/${APP_NAME}"
    msg "Uninstalled."
    exit 0
    ;;
esac

cd "\$APP_DIR"
exec ./start.sh
EOF

chmod +x "$LAUNCHER"

# ----- PATH hint -----
if ! echo ":$PATH:" | grep -q ":$BIN_DIR:"; then
  warn "$BIN_DIR is not in PATH."
  warn "Add to ~/.bashrc or ~/.zshrc:"
  echo "  export PATH=\"$BIN_DIR:\$PATH\""
fi

# ----- autostart choice -----
is_interactive=0
if [ -t 0 ] && [ -t 1 ]; then is_interactive=1; fi

if [ -z "$AUTOSTART_MODE" ]; then
  if [ "$is_interactive" -eq 1 ]; then
    echo
    echo "Enable autostart (systemd --user) after install?"
    echo "  1) Yes"
    echo "  2) No"
    printf "Choose [1-2]: "
    read -r ans || ans="2"
    case "$ans" in
      1|y|Y|yes|YES) AUTOSTART_MODE="yes" ;;
      *) AUTOSTART_MODE="no" ;;
    esac
  else
    AUTOSTART_MODE="no"
  fi
fi

if [ "$AUTOSTART_MODE" = "yes" ]; then
  if "$LAUNCHER" --enable-autostart; then
    :
  else
    warn "Autostart could not be enabled (systemd user may be unavailable). Install completed without autostart."
  fi
else
  info "Autostart not enabled."
fi

info "Installed version: $VERSION"
info "Installed edition: $EDITION"
info "Run: ${APP_NAME}"
