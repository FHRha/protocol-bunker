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
GLOBAL_BIN_DIR="/usr/local/bin"
APP_DIR="${INSTALL_ROOT}/Protocol-Bunker"
INSTALL_HOME="${HOME}"
SYSTEMD_USER_DIR="${HOME}/.config/systemd/user"
SYSTEMD_SYSTEM_DIR="/etc/systemd/system"
SERVICE_NAME="protocol-bunker"
SERVICE_FILE_USER="${SYSTEMD_USER_DIR}/${SERVICE_NAME}.service"
SERVICE_FILE_SYSTEM="${SYSTEMD_SYSTEM_DIR}/${SERVICE_NAME}.service"
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
ARCH=""            # x64 | arm64 (empty => auto-detect)
SERVICE_SCOPE="auto"      # auto | system | user
EFFECTIVE_SERVICE_SCOPE="" # resolved service scope
TARGET_ARCH=""     # normalized arch used for assets
VERSION_TAG=""     # canonical version for asset names (e.g. v0.2.0)
RELEASE_TAG=""     # actual GitHub release tag (e.g. 0.2.0 or v0.2.0)

usage() {
  cat <<EOF
Install ${APP_NAME} (Linux)

Usage:
  install.sh [--version vX.Y.Z] [--edition public|server] [--arch x64|arm64] [--service-scope auto|system|user] [--list] [--autostart|--no-autostart]

Examples:
  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash
  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash -s -- --version v0.2.0
  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash -s -- --edition server
  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash -s -- --arch arm64
  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash -s -- --service-scope system --autostart
  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash -s -- --list
  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash -s -- --autostart
EOF
}

# ----- parse args -----
while [ $# -gt 0 ]; do
  case "$1" in
    --version)
      shift
      [ $# -gt 0 ] || err "--version requires a value like v0.2.0"
      VERSION="$1"
      ;;
    --edition)
      shift
      [ $# -gt 0 ] || err "--edition requires 'public' or 'server'"
      EDITION="$1"
      ;;
    --arch)
      shift
      [ $# -gt 0 ] || err "--arch requires 'x64' or 'arm64'"
      ARCH="$1"
      ;;
    --service-scope)
      shift
      [ $# -gt 0 ] || err "--service-scope requires 'auto', 'system' or 'user'"
      SERVICE_SCOPE="$1"
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

normalize_version_tag() {
  local value="$1"
  if [ -z "$value" ]; then
    err "Version is empty. Use format like v0.2.0 or 0.2.0"
  fi

  if [[ "$value" == v* ]]; then
    printf "%s" "$value"
    return
  fi

  if [[ "$value" =~ ^[0-9]+([.][0-9]+){1,3}([.-][0-9A-Za-z]+)*$ ]]; then
    printf "v%s" "$value"
    return
  fi

  err "Invalid version format: $value (expected v0.2.0 or 0.2.0)"
}

resolve_release_tag_by_candidates() {
  # Try candidates in order and return the first existing release tag_name.
  local candidate json resolved
  for candidate in "$@"; do
    [ -n "$candidate" ] || continue
    if json="$(gh_api "https://api.github.com/repos/${REPO}/releases/tags/${candidate}" 2>/dev/null)"; then
      resolved="$(printf "%s" "$json" | json_latest_tag | head -n 1)"
      [ -n "$resolved" ] || resolved="$candidate"
      printf "%s" "$resolved"
      return 0
    fi
  done
  return 1
}

validate_edition() {
  case "$1" in
    public|server) ;;
    *) err "Edition must be 'public' or 'server'. Got: $1" ;;
  esac
}

validate_service_scope() {
  case "$1" in
    auto|system|user) ;;
    *) err "Service scope must be auto, system or user. Got: $1" ;;
  esac
}

resolve_service_scope() {
  local scope="$1"
  if [ "$scope" = "auto" ]; then
    if [ "$(id -u)" -eq 0 ]; then
      printf "system"
    else
      printf "user"
    fi
    return
  fi
  printf "%s" "$scope"
}

normalize_arch() {
  local value
  value="$(printf "%s" "$1" | tr '[:upper:]' '[:lower:]')"
  case "$value" in
    x64|amd64|x86_64) printf "x64" ;;
    arm64|aarch64) printf "arm64" ;;
    *) err "Architecture must be x64 or arm64. Got: $1" ;;
  esac
}

detect_arch() {
  local machine
  machine="$(uname -m 2>/dev/null || true)"
  case "$machine" in
    x86_64|amd64) printf "x64" ;;
    aarch64|arm64) printf "arm64" ;;
    *) err "Unsupported host architecture: ${machine:-unknown}. Use --arch x64|arm64." ;;
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
  VERSION_TAG="$(normalize_version_tag "$VERSION")"
  if [[ "$VERSION_TAG" == v* ]]; then
    RELEASE_TAG="$(resolve_release_tag_by_candidates "$VERSION" "${VERSION_TAG#v}" "$VERSION_TAG" || true)"
  else
    RELEASE_TAG="$(resolve_release_tag_by_candidates "$VERSION" "$VERSION_TAG" || true)"
  fi
  [ -n "$RELEASE_TAG" ] || err "Release for version '$VERSION' not found."
  VERSION_TAG="$(normalize_version_tag "$RELEASE_TAG")"
  info "Requested version: $VERSION_TAG (release tag: $RELEASE_TAG)"
else
  info "Resolving latest version..."
  RELEASE_TAG="$(resolve_latest_version || true)"
  [ -n "$RELEASE_TAG" ] || err "Failed to resolve latest release version."
  VERSION_TAG="$(normalize_version_tag "$RELEASE_TAG")"
  info "Latest: $VERSION_TAG (release tag: $RELEASE_TAG)"
fi

validate_edition "$EDITION"
validate_service_scope "$SERVICE_SCOPE"
EFFECTIVE_SERVICE_SCOPE="$(resolve_service_scope "$SERVICE_SCOPE")"
if [ "$EFFECTIVE_SERVICE_SCOPE" = "system" ] && [ "$(id -u)" -ne 0 ]; then
  err "--service-scope system requires root. Use sudo/root or --service-scope user."
fi
if [ -n "$ARCH" ]; then
  TARGET_ARCH="$(normalize_arch "$ARCH")"
  info "Requested arch: $TARGET_ARCH"
else
  TARGET_ARCH="$(detect_arch)"
  info "Detected arch: $TARGET_ARCH"
fi
info "Service scope: ${EFFECTIVE_SERVICE_SCOPE}"
ASSET="protocol-bunker-linux-${TARGET_ARCH}-${EDITION}-${VERSION_TAG}.tar.gz"
URL="https://github.com/${REPO}/releases/download/${RELEASE_TAG}/${ASSET}"

# ----- download + install -----
mkdir -p "$INSTALL_ROOT" "$BIN_DIR"

info "Downloading: $URL"
curl -fL --retry 3 --retry-delay 1 -o "$TMP/$ASSET" "$URL"

info "Installing to: $APP_DIR"
PRESERVE_DIR="$TMP/preserve"
rm -rf "$PRESERVE_DIR"
mkdir -p "$PRESERVE_DIR"
if [ -d "$APP_DIR" ]; then
  if [ -f "$APP_DIR/portable.env" ]; then
    cp "$APP_DIR/portable.env" "$PRESERVE_DIR/portable.env"
    info "Preserving settings: portable.env"
  fi
  if [ -d "$APP_DIR/app/data" ]; then
    mkdir -p "$PRESERVE_DIR/app"
    cp -a "$APP_DIR/app/data" "$PRESERVE_DIR/app/data"
    info "Preserving data: app/data"
  fi
fi

rm -rf "$APP_DIR"
tar -xzf "$TMP/$ASSET" -C "$INSTALL_ROOT"

[ -f "$APP_DIR/start.sh" ] || err "start.sh not found at $APP_DIR/start.sh (check tar structure)"
chmod +x "$APP_DIR/start.sh" || true
if [ -f "$APP_DIR/app/node/node" ]; then
  chmod +x "$APP_DIR/app/node/node" || true
fi
if [ -f "$PRESERVE_DIR/portable.env" ]; then
  if [ -f "$APP_DIR/portable.env" ]; then
    awk '
      function parse_assignment(line,   s, eq) {
        s = line
        sub(/^[[:space:]]*/, "", s)
        if (s ~ /^#/ || s !~ /^[A-Za-z_][A-Za-z0-9_]*=/) return 0
        eq = index(s, "=")
        if (eq <= 1) return 0
        assign_key = substr(s, 1, eq - 1)
        assign_val = substr(s, eq + 1)
        return 1
      }
      NR == FNR {
        if (parse_assignment($0)) {
          k = assign_key
          if (!(k in old_seen)) {
            old_order[++old_n] = k
            old_seen[k] = 1
          }
          old_val[k] = assign_val
        }
        next
      }
      {
        if (parse_assignment($0)) {
          k = assign_key
          base_key[k] = 1
          if (k in old_val) {
            print k "=" old_val[k]
            next
          }
        }
        print $0
      }
      END {
        for (i = 1; i <= old_n; i++) {
          k = old_order[i]
          if (!(k in base_key)) {
            print k "=" old_val[k]
          }
        }
      }
    ' "$PRESERVE_DIR/portable.env" "$APP_DIR/portable.env" > "$TMP/portable.env.merged"
    mv "$TMP/portable.env.merged" "$APP_DIR/portable.env"
    info "Merged settings: portable.env (user values kept, new defaults added)"
  else
    cp "$PRESERVE_DIR/portable.env" "$APP_DIR/portable.env"
    info "Restored settings: portable.env"
  fi
fi
if [ -d "$PRESERVE_DIR/app/data" ]; then
  mkdir -p "$APP_DIR/app"
  rm -rf "$APP_DIR/app/data"
  cp -a "$PRESERVE_DIR/app/data" "$APP_DIR/app/data"
  info "Restored data: app/data"
fi

# ----- create launcher -----
LAUNCHER="${BIN_DIR}/${APP_NAME}"
INSTALL_URL="https://raw.githubusercontent.com/${REPO}/main/install.sh"

cat > "$LAUNCHER" <<EOF
#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME}"
INSTALL_HOME="${INSTALL_HOME}"
APP_DIR="${APP_DIR}"
SYSTEMD_USER_DIR="${INSTALL_HOME}/.config/systemd/user"
SYSTEMD_SYSTEM_DIR="/etc/systemd/system"
SERVICE_NAME="${SERVICE_NAME}"
SERVICE_FILE_USER="\${SYSTEMD_USER_DIR}/\${SERVICE_NAME}.service"
SERVICE_FILE_SYSTEM="\${SYSTEMD_SYSTEM_DIR}/\${SERVICE_NAME}.service"
SERVICE_SCOPE="${EFFECTIVE_SERVICE_SCOPE}"
GLOBAL_LINK="${GLOBAL_BIN_DIR}/${APP_NAME}"
INSTALL_URL="${INSTALL_URL}"
EDITION="${EDITION}"
ARCH="${TARGET_ARCH}"

msg() { printf "[%s] %s\n" "\$APP_NAME" "\$*"; }

run_systemctl() {
  local scope="\$1"
  shift
  if [ "\$scope" = "user" ]; then
    systemctl --user "\$@"
  else
    systemctl "\$@"
  fi
}

service_file_for_scope() {
  local scope="\$1"
  if [ "\$scope" = "user" ]; then
    printf "%s" "\$SERVICE_FILE_USER"
  else
    printf "%s" "\$SERVICE_FILE_SYSTEM"
  fi
}

wanted_by_for_scope() {
  local scope="\$1"
  if [ "\$scope" = "user" ]; then
    printf "default.target"
  else
    printf "multi-user.target"
  fi
}

scope_allowed() {
  local scope="\$1"
  if [ "\$scope" = "system" ] && [ "\$(id -u)" -ne 0 ]; then
    msg "system scope requires root. Run with sudo/root."
    return 1
  fi
  return 0
}

enable_autostart() {
  command -v systemctl >/dev/null 2>&1 || { msg "systemctl not found; autostart unavailable."; return 1; }
  local scope="\$SERVICE_SCOPE"
  local unit_file unit_dir wanted_by
  scope_allowed "\$scope" || return 1
  unit_file="\$(service_file_for_scope "\$scope")"
  unit_dir="\$(dirname "\$unit_file")"
  wanted_by="\$(wanted_by_for_scope "\$scope")"
  mkdir -p "\$unit_dir"

  cat > "\$unit_file" <<SERVICE
[Unit]
Description=Protocol: Bunker (self-host server)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
ExecStart=${APP_DIR}/start.sh
Restart=on-failure
RestartSec=2

[Install]
WantedBy=\${wanted_by}
SERVICE

  run_systemctl "\$scope" daemon-reload
  run_systemctl "\$scope" enable --now "\$SERVICE_NAME"
  msg "Autostart enabled (systemd --\${scope})."
  if [ "\$scope" = "user" ]; then
    msg "Tip: if it doesn't start after reboot on headless systems, you may need linger (requires sudo):"
    msg "  sudo loginctl enable-linger \$USER"
  fi
}

disable_scope() {
  local scope="\$1"
  local unit_file
  unit_file="\$(service_file_for_scope "\$scope")"
  if [ "\$scope" = "system" ] && [ "\$(id -u)" -ne 0 ]; then
    return 0
  fi
  run_systemctl "\$scope" disable --now "\$SERVICE_NAME" >/dev/null 2>&1 || true
  rm -f "\$unit_file"
  run_systemctl "\$scope" daemon-reload >/dev/null 2>&1 || true
}

disable_autostart() {
  command -v systemctl >/dev/null 2>&1 || true
  disable_scope "system"
  disable_scope "user"
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
      curl -fsSL "\$INSTALL_URL" | bash -s -- --edition "\$EDITION" --arch "\$ARCH" --service-scope "\$SERVICE_SCOPE" --version "\$2"
    else
      curl -fsSL "\$INSTALL_URL" | bash -s -- --edition "\$EDITION" --arch "\$ARCH" --service-scope "\$SERVICE_SCOPE"
    fi
    exit 0
    ;;
  --enable-autostart) enable_autostart; exit \$? ;;
  --disable-autostart) disable_autostart; exit 0 ;;
  --uninstall)
    disable_autostart >/dev/null 2>&1 || true
    if [ -L "\$GLOBAL_LINK" ]; then
      target="\$(readlink "\$GLOBAL_LINK" || true)"
      case "\$target" in
        "${INSTALL_HOME}/.local/bin/\${APP_NAME}"|"${INSTALL_HOME}/.local/share/${APP_NAME}/"*)
          rm -f "\$GLOBAL_LINK"
          ;;
      esac
    fi
    rm -rf "${INSTALL_HOME}/.local/share/${APP_NAME}"
    rm -f  "${INSTALL_HOME}/.local/bin/${APP_NAME}"
    msg "Uninstalled."
    exit 0
    ;;
esac

cd "\$APP_DIR"
exec ./start.sh
EOF

chmod +x "$LAUNCHER"

GLOBAL_LAUNCHER=""
if [ -d "$GLOBAL_BIN_DIR" ] && [ -w "$GLOBAL_BIN_DIR" ]; then
  if ln -sfn "$LAUNCHER" "${GLOBAL_BIN_DIR}/${APP_NAME}" 2>/dev/null; then
    GLOBAL_LAUNCHER="${GLOBAL_BIN_DIR}/${APP_NAME}"
  fi
fi

# ----- PATH hint -----
if ! command -v "$APP_NAME" >/dev/null 2>&1 && ! echo ":$PATH:" | grep -q ":$BIN_DIR:"; then
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
    echo "Enable autostart (systemd --${EFFECTIVE_SERVICE_SCOPE}) after install?"
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
    warn "Autostart could not be enabled (scope: ${EFFECTIVE_SERVICE_SCOPE}). Install completed without autostart."
  fi
else
  info "Autostart not enabled."
fi

info "Installed release tag: $RELEASE_TAG"
info "Installed version: $VERSION_TAG"
info "Installed edition: $EDITION"
info "Installed arch: $TARGET_ARCH"
info "Installed service scope: $EFFECTIVE_SERVICE_SCOPE"
if command -v "${APP_NAME}" >/dev/null 2>&1; then
  info "Run: ${APP_NAME}"
elif [ -n "$GLOBAL_LAUNCHER" ]; then
  info "Run: ${GLOBAL_LAUNCHER}"
else
  info "Run: ${LAUNCHER}"
fi
