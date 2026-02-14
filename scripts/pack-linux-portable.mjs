import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

if (process.arch !== "x64") {
  console.error("[pack:linux] This script currently supports x64 host only.");
  process.exit(1);
}

const rootDir = process.cwd();
const artifactsLinuxDir = path.join(rootDir, "artifacts", "linux");
const artifactsDir = path.join(artifactsLinuxDir, "Protocol-Bunker");
const appDir = path.join(artifactsDir, "app");
const serverAppDir = path.join(appDir, "server");
const clientDistSrc = path.join(rootDir, "client", "dist");
const clientDistDst = path.join(appDir, "client", "dist");
const assetsSrc = path.join(rootDir, "assets");
const assetsDst = path.join(appDir, "assets");
const scenariosRuntimeSrc = path.join(rootDir, "scenarios", "classic");
const scenariosRuntimeDst = path.join(
  serverAppDir,
  "node_modules",
  "@bunker",
  "scenarios",
  "classic"
);
const disastersTextSrc = path.join(rootDir, "server", "data", "world", "disasters.ru.json");
const disastersTextDst = path.join(
  serverAppDir,
  "node_modules",
  "@bunker",
  "server",
  "data",
  "world",
  "disasters.ru.json"
);
const nodeDir = path.join(appDir, "node");
const nodeBinDst = path.join(nodeDir, "node");
const startShPath = path.join(artifactsDir, "start.sh");
const portableEnvPath = path.join(artifactsDir, "portable.env");
const readmePath = path.join(artifactsDir, "README_PORTABLE.txt");
const tarGzPath = path.join(artifactsLinuxDir, "protocol-bunker-linux-x64-portable.tar.gz");
const pnpmCmd = "pnpm";

function quoteCmdArg(value) {
  if (value.length === 0) return '""';
  const escaped = value.replace(/"/g, '""');
  return /[\s&()^|<>]/.test(value) ? `"${escaped}"` : value;
}

function runStep(command, args) {
  let result;
  if (process.platform === "win32") {
    const commandLine = [command, ...args.map(quoteCmdArg)].join(" ");
    console.log(`[pack:linux] > ${commandLine}`);
    result = spawnSync("cmd.exe", ["/d", "/s", "/c", commandLine], {
      cwd: rootDir,
      stdio: "inherit",
      windowsHide: false,
    });
  } else {
    console.log(`[pack:linux] > ${[command, ...args].join(" ")}`);
    result = spawnSync(command, args, {
      cwd: rootDir,
      stdio: "inherit",
    });
  }
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status ?? 1}): ${command} ${args.join(" ")}`);
  }
}

function ensureExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Missing ${label}: ${targetPath}`);
  }
}

function cleanPath(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function copyDir(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true, force: true });
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function materializeDirectory(sourceDir) {
  const materializedDir = path.join(
    os.tmpdir(),
    `bunker-linux-portable-materialized-${Date.now()}-${process.pid}`
  );
  fs.cpSync(sourceDir, materializedDir, {
    recursive: true,
    force: true,
    dereference: true,
  });
  cleanPath(sourceDir);
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.cpSync(materializedDir, sourceDir, { recursive: true, force: true });
  try {
    cleanPath(materializedDir);
  } catch {
    // best effort cleanup
  }
}

function flattenNodeModules(rootPath) {
  const nodeModulesDir = path.join(rootPath, "node_modules");
  const pnpmVirtualDir = path.join(nodeModulesDir, ".pnpm", "node_modules");
  if (!fs.existsSync(pnpmVirtualDir)) return;

  const entries = fs.readdirSync(pnpmVirtualDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const src = path.join(pnpmVirtualDir, entry.name);
    const dst = path.join(nodeModulesDir, entry.name);
    if (fs.existsSync(dst)) continue;
    fs.cpSync(src, dst, { recursive: true, force: true, dereference: true });
  }
}

async function downloadFile(url, destinationPath) {
  console.log(`[pack:linux] Downloading: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}): ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.writeFileSync(destinationPath, Buffer.from(arrayBuffer));
}

async function ensureLinuxNodeRuntime() {
  fs.mkdirSync(nodeDir, { recursive: true });

  if (process.platform === "linux") {
    const nodeBinSrc = process.execPath;
    ensureExists(nodeBinSrc, "local node runtime");
    fs.copyFileSync(nodeBinSrc, nodeBinDst);
    fs.chmodSync(nodeBinDst, 0o755);
    return;
  }

  const version = (process.env.PORTABLE_NODE_VERSION?.trim() || process.version).replace(/^v/, "");
  const archiveBase = `node-v${version}-linux-x64`;
  const archivePath = path.join(artifactsLinuxDir, `${archiveBase}.tar.gz`);
  const downloadUrl = `https://nodejs.org/dist/v${version}/${archiveBase}.tar.gz`;

  if (!fs.existsSync(archivePath)) {
    await downloadFile(downloadUrl, archivePath);
  }

  runStep("tar", [
    "-xzf",
    archivePath,
    "-C",
    nodeDir,
    "--strip-components=2",
    `${archiveBase}/bin/node`,
  ]);
  ensureExists(nodeBinDst, "downloaded linux node runtime");
  fs.chmodSync(nodeBinDst, 0o755);
  cleanPath(archivePath);
}

function formatBytes(value) {
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function createTarGzArchive() {
  cleanPath(tarGzPath);
  runStep("tar", ["-czf", tarGzPath, "-C", artifactsLinuxDir, "Protocol-Bunker"]);
  ensureExists(tarGzPath, "portable tar.gz");
  const stats = fs.statSync(tarGzPath);
  console.log(`[pack:linux] TAR.GZ created: ${tarGzPath}`);
  console.log(`[pack:linux] TAR.GZ size: ${formatBytes(stats.size)}`);
}

function buildStartSh() {
  const lines = [
    "#!/usr/bin/env bash",
    "set -u",
    "set -o pipefail",
    "",
    'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
    'PORTABLE_ROOT="$SCRIPT_DIR"',
    'APP_ROOT="$PORTABLE_ROOT/app"',
    'LOGS_DIR="$PORTABLE_ROOT/logs"',
    'ENV_FILE="$PORTABLE_ROOT/portable.env"',
    "",
    'NODE_BIN="$APP_ROOT/node/node"',
    'SERVER_ROOT="$APP_ROOT/server"',
    'SERVER_ENTRY="$SERVER_ROOT/dist/index.js"',
    'CLIENT_INDEX="$APP_ROOT/client/dist/index.html"',
    'ASSETS_ROOT="$APP_ROOT/assets"',
    "",
    'SERVER_LOG="$LOGS_DIR/server.log"',
    'PORT_FILE="$LOGS_DIR/port.txt"',
    'URLS_FILE="$LOGS_DIR/urls.txt"',
    'LAST_START_FILE="$LOGS_DIR/last-start.txt"',
    "",
    'CONFIG_PORT="0"',
    'CONFIG_DEV_MODE="0"',
    'CONFIG_MODE=""',
    'CONFIG_DOMAIN=""',
    'MODE=""',
    'DOMAIN=""',
    'LAN_IP=""',
    'PUBLIC_IP=""',
    'OPEN_URL=""',
    "BROWSER_OPENED=0",
    "",
    "assert_exists() {",
    '  local path_value="$1"',
    '  local label="$2"',
    '  if [[ ! -e "$path_value" ]]; then',
    '    echo "Missing ${label}: ${path_value}" >&2',
    "    exit 1",
    "  fi",
    "}",
    "",
    "trim() {",
    '  local value="$*"',
    '  value="${value#"${value%%[![:space:]]*}"}"',
    '  value="${value%"${value##*[![:space:]]}"}"',
    '  printf "%s" "$value"',
    "}",
    "",
    "is_truthy() {",
    '  local value',
    '  value="$(printf "%s" "$1" | tr "[:upper:]" "[:lower:]")"',
    '  [[ "$value" == "1" || "$value" == "true" || "$value" == "yes" || "$value" == "on" ]]',
    "}",
    "",
    "parse_portable_env() {",
    '  [[ -f "$ENV_FILE" ]] || return 0',
    '  while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do',
    "    local line",
    '    line="$(trim "$raw_line")"',
    '    [[ -z "$line" ]] && continue',
    '    [[ "$line" == \\#* ]] && continue',
    '    [[ "$line" == \\;* ]] && continue',
    '    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=[[:space:]]*(.*)$ ]]; then',
    "      local key value",
    '      key="$(printf "%s" "${BASH_REMATCH[1]}" | tr "[:lower:]" "[:upper:]")"',
    '      value="$(trim "${BASH_REMATCH[2]}")"',
    '      case "$key" in',
    '        PORT) CONFIG_PORT="$value" ;;',
    '        DEV_MODE) CONFIG_DEV_MODE="$value" ;;',
    '        MODE) CONFIG_MODE="$value" ;;',
    '        DOMAIN) CONFIG_DOMAIN="$value" ;;',
    "      esac",
    "    fi",
    '  done < "$ENV_FILE"',
    "}",
    "",
    "normalize_port() {",
    '  if [[ ! "$CONFIG_PORT" =~ ^[0-9]+$ ]]; then',
    '    CONFIG_PORT="0"',
    "    return",
    "  fi",
    "  if (( CONFIG_PORT < 0 || CONFIG_PORT > 65535 )); then",
    '    CONFIG_PORT="0"',
    "  fi",
    "}",
    "",
    "resolve_mode() {",
    "  local mode_lower",
    '  mode_lower="$(printf "%s" "$CONFIG_MODE" | tr "[:upper:]" "[:lower:]")"',
    '  if [[ "$mode_lower" == "local" || "$mode_lower" == "1" ]]; then',
    '    MODE="local"',
    "    return",
    "  fi",
    '  if [[ "$mode_lower" == "domain" || "$mode_lower" == "2" ]]; then',
    '    MODE="domain"',
    "    return",
    "  fi",
    "",
    '  echo "============================================"',
    '  echo "Protocol: Bunker"',
    '  echo "Self-host launcher"',
    '  echo "============================================"',
    "  echo",
    '  echo "1) Local (HTTP) - IP:PORT"',
    '  echo "2) Domain (HTTPS) - reverse-proxy"',
    "  echo",
    '  read -r -p "Choose mode [1-2]: " choice',
    '  if [[ "$choice" == "1" ]]; then',
    '    MODE="local"',
    '  elif [[ "$choice" == "2" ]]; then',
    '    MODE="domain"',
    "  else",
    '    echo "Invalid mode selection." >&2',
    "    exit 1",
    "  fi",
    "}",
    "",
    "resolve_domain() {",
    '  DOMAIN="$(trim "$CONFIG_DOMAIN")"',
    '  if [[ -z "$DOMAIN" ]]; then',
    '    read -r -p "Enter domain (e.g. bunker.example.com): " DOMAIN',
    "    DOMAIN=\"$(trim \"$DOMAIN\")\"",
    "  fi",
    '  [[ -n "$DOMAIN" ]] || DOMAIN="example.com"',
    "}",
    "",
    "get_public_ip() {",
    "  if command -v curl >/dev/null 2>&1; then",
    '    curl -fsS --max-time 5 "https://api.ipify.org" 2>/dev/null && return 0',
    '    curl -fsS --max-time 5 "https://ifconfig.me/ip" 2>/dev/null && return 0',
    "  fi",
    "  return 1",
    "}",
    "",
    "get_lan_ip() {",
    "  local ip=\"\"",
    "  if command -v ip >/dev/null 2>&1 && command -v awk >/dev/null 2>&1; then",
    '    ip="$(ip route get 1.1.1.1 2>/dev/null | awk \'{for(i=1;i<=NF;i++) if($i==\"src\") {print $(i+1); exit}}\')"',
    "  fi",
    '  if [[ -z "$ip" ]] && command -v hostname >/dev/null 2>&1 && command -v awk >/dev/null 2>&1; then',
    '    ip="$(hostname -I 2>/dev/null | awk \'{print $1}\')"',
    "  fi",
    '  [[ -n "$ip" ]] || ip="127.0.0.1"',
    '  printf "%s" "$ip"',
    "}",
    "",
    "is_port_busy() {",
    '  local port="$1"',
    "  if command -v ss >/dev/null 2>&1; then",
    '    if ss -lnt "( sport = :$port )" 2>/dev/null | grep -q LISTEN; then',
    "      return 0",
    "    fi",
    "  fi",
    "  if command -v lsof >/dev/null 2>&1; then",
    '    if lsof -iTCP:"$port" -sTCP:LISTEN -t >/dev/null 2>&1; then',
    "      return 0",
    "    fi",
    "  fi",
    "  if command -v netstat >/dev/null 2>&1; then",
    '    if netstat -lnt 2>/dev/null | awk -v p=":$port" \'$4 ~ p"$" {found=1} END{exit(found?0:1)}\'; then',
    "      return 0",
    "    fi",
    "  fi",
    "  return 1",
    "}",
    "",
    "wait_port_open() {",
    '  local port="$1"',
    '  local timeout="${2:-10}"',
    '  local deadline=$((SECONDS + timeout))',
    "  while (( SECONDS < deadline )); do",
    '    if is_port_busy "$port"; then',
    "      return 0",
    "    fi",
    "    sleep 0.2",
    "  done",
    "  return 1",
    "}",
    "",
    "open_browser() {",
    '  local url="$1"',
    '  if [[ "${BUNKER_PORTABLE_NO_BROWSER:-0}" == "1" ]]; then',
    "    return",
    "  fi",
    "  if (( BROWSER_OPENED == 1 )); then",
    "    return",
    "  fi",
    "  if command -v xdg-open >/dev/null 2>&1; then",
    '    xdg-open "$url" >/dev/null 2>&1 || true',
    "    BROWSER_OPENED=1",
    "  fi",
    "}",
    "",
    "print_local_urls_block() {",
    '  local port="$1"',
    "  local public_line",
    '  if [[ -n "$PUBLIC_IP" ]]; then',
    '    public_line="Public: http://${PUBLIC_IP}:${port}"',
    "  else",
    '    public_line="Public: unavailable"',
    "  fi",
    '  local local_line="Local : http://${LAN_IP}:${port}"',
    '  local localhost_line="Localhost: http://127.0.0.1:${port}"',
    '  echo "--------------------------------------------"',
    '  echo "URLs"',
    '  echo "--------------------------------------------"',
    '  echo "$public_line"',
    '  echo "$local_line"',
    '  echo "--------------------------------------------"',
    "  {",
    '    echo "$public_line"',
    '    echo "$local_line"',
    '    echo "$localhost_line"',
    '  } > "$URLS_FILE"',
    "}",
    "",
    "print_domain_urls_block() {",
    '  local port="$1"',
    '  local open_line="Open  : https://${DOMAIN}"',
    '  local upstream_line="Upstream: http://127.0.0.1:${port}"',
    '  echo "--------------------------------------------"',
    '  echo "URLs"',
    '  echo "--------------------------------------------"',
    '  echo "$open_line"',
    '  echo "--------------------------------------------"',
    "  {",
    '    echo "$open_line"',
    '    echo "$upstream_line"',
    '  } > "$URLS_FILE"',
    "}",
    "",
    "handle_detected_port() {",
    '  local port="$1"',
    '  if [[ -s "$PORT_FILE" ]]; then',
    "    return",
    "  fi",
    '  echo "$port" > "$PORT_FILE"',
    '  if [[ "$MODE" == "domain" ]]; then',
    '    print_domain_urls_block "$port"',
    '    OPEN_URL="https://${DOMAIN}"',
    "  else",
    '    print_local_urls_block "$port"',
    '    OPEN_URL="http://${LAN_IP}:${port}"',
    "  fi",
    '  open_browser "$OPEN_URL"',
    "}",
    "",
    "apply_dev_mode() {",
    "  if is_truthy \"$CONFIG_DEV_MODE\"; then",
    '    export BUNKER_IDENTITY_MODE="dev_tab"',
    '    export BUNKER_DEV_LOGS="true"',
    '    export VITE_IDENTITY_MODE="dev_tab"',
    '    export DEV_NEW_PLAYER_PER_TAB="true"',
    '    export VITE_DEV_TAB_IDENTITY="true"',
    '    export VITE_DEV_NEW_PLAYER_PER_TAB="true"',
    '    export BUNKER_ENABLE_DEV_SCENARIOS="true"',
    "  else",
    '    export BUNKER_IDENTITY_MODE="prod"',
    '    export BUNKER_DEV_LOGS="false"',
    '    export VITE_IDENTITY_MODE="prod"',
    '    export DEV_NEW_PLAYER_PER_TAB="false"',
    '    export VITE_DEV_TAB_IDENTITY="false"',
    '    export VITE_DEV_NEW_PLAYER_PER_TAB="false"',
    '    export BUNKER_ENABLE_DEV_SCENARIOS="false"',
    "  fi",
    "}",
    "",
    'assert_exists "$NODE_BIN" "Node runtime"',
    'assert_exists "$SERVER_ENTRY" "server entrypoint"',
    'assert_exists "$CLIENT_INDEX" "client dist"',
    'assert_exists "$ASSETS_ROOT" "assets directory"',
    "",
    'mkdir -p "$LOGS_DIR"',
    '> "$SERVER_LOG"',
    'rm -f "$PORT_FILE" "$URLS_FILE"',
    'date "+%Y-%m-%d %H:%M:%S %z" > "$LAST_START_FILE"',
    "",
    "parse_portable_env",
    "normalize_port",
    "resolve_mode",
    "",
    'if [[ "$MODE" == "domain" ]]; then',
    '  if [[ "$CONFIG_PORT" == "0" ]]; then',
    '    echo "Domain mode requires fixed PORT. Set PORT=xxxx in portable.env" >&2',
    "    exit 1",
    "  fi",
    "  resolve_domain",
    "fi",
    "",
    'if [[ "$CONFIG_PORT" != "0" ]] && is_port_busy "$CONFIG_PORT"; then',
    '  echo "PORT ${CONFIG_PORT} is busy. Change PORT in portable.env or set PORT=0 for auto." >&2',
    "  exit 1",
    "fi",
    "",
    'export PORT="$CONFIG_PORT"',
    'export BUNKER_SERVE_CLIENT="true"',
    'export BUNKER_PORTABLE="1"',
    'export BUNKER_ASSETS_ROOT="$ASSETS_ROOT"',
    'export BUNKER_CLIENT_DIST="$APP_ROOT/client/dist"',
    "",
    'if [[ "$MODE" == "domain" ]]; then',
    '  export HOST="127.0.0.1"',
    '  export TRUST_PROXY="true"',
    '  export PUBLIC_ORIGIN="https://${DOMAIN}"',
    "else",
    '  export HOST="0.0.0.0"',
    '  export TRUST_PROXY="false"',
    "  unset PUBLIC_ORIGIN || true",
    "fi",
    "",
    "apply_dev_mode",
    'LAN_IP="$(get_lan_ip)"',
    'if [[ "$MODE" == "local" ]]; then',
    '  PUBLIC_IP="$(get_public_ip 2>/dev/null || true)"',
    "fi",
    "",
    'echo "Starting Protocol Bunker server..."',
    'echo "Mode: ${MODE^^}"',
    'if [[ "$CONFIG_PORT" == "0" ]]; then',
    '  echo "Port mode: auto (PORT=0 from portable.env)"',
    "else",
    '  echo "Port mode: fixed (${CONFIG_PORT}) from portable.env"',
    "fi",
    'echo "Log file: logs/server.log"',
    'echo "Press Ctrl+C to stop."',
    "",
    'pushd "$SERVER_ROOT" >/dev/null',
    '"$NODE_BIN" "$SERVER_ENTRY" 2>&1 | tee -a "$SERVER_LOG" | while IFS= read -r line || [[ -n "$line" ]]; do',
    '  if [[ ! -s "$PORT_FILE" ]]; then',
    '    if [[ "$line" =~ __BUNKER_PORT__=([0-9]{1,5}) ]]; then',
    '      handle_detected_port "${BASH_REMATCH[1]}"',
    '    elif [[ "$CONFIG_PORT" != "0" && "$line" =~ [Ss]erver[[:space:]]+listening ]]; then',
    '      handle_detected_port "$CONFIG_PORT"',
    "    fi",
    "  fi",
    "done",
    'SERVER_EXIT=${PIPESTATUS[0]}',
    "popd >/dev/null",
    "",
    'if [[ ! -s "$PORT_FILE" && "$CONFIG_PORT" != "0" ]]; then',
    '  if wait_port_open "$CONFIG_PORT" 1; then',
    '    handle_detected_port "$CONFIG_PORT"',
    "  fi",
    "fi",
    "",
    'if [[ "$SERVER_EXIT" -ne 0 ]]; then',
    '  echo "Server exited with code ${SERVER_EXIT}. See logs/server.log" >&2',
    '  exit "$SERVER_EXIT"',
    "fi",
    "",
    "exit 0",
  ];
  return `${lines.join("\n")}\n`;
}

function buildPortableEnv() {
  return `PORT=0
DEV_MODE=0
# MODE=local
# MODE=domain
# DOMAIN=bunker.example.com
# PORT=56986
# DEV_MODE=1
`;
}

function buildReadme() {
  return `Protocol Bunker Portable (Linux)
================================

Start:
1. chmod +x start.sh
2. Run ./start.sh
3. Wait for startup lines in terminal

Modes:
- MODE=local|domain in portable.env (if not set, launcher asks)
- DOMAIN=your.domain.com for domain mode
- Domain mode requires fixed PORT (PORT must be 1..65535)

Port:
- Set PORT=0 for auto-port
- Set PORT=XXXXX for fixed port
- Actual port is saved to logs/port.txt

Dev mode:
- DEV_MODE=1 enables dev_tab behavior and dev logs/scenarios

Logs:
- logs/server.log
- logs/port.txt
- logs/urls.txt
- logs/last-start.txt
`;
}

async function main() {
  if (process.platform !== "linux") {
    console.log(
      `[pack:linux] Cross-pack on ${process.platform}; linux node runtime will be downloaded automatically.`
    );
  }

  console.log("[pack:linux] Building production artifacts...");
  runStep(pnpmCmd, ["-C", "client", "build"]);
  runStep(pnpmCmd, ["-C", "shared", "build"]);
  runStep(pnpmCmd, ["-C", "scenarios", "build"]);
  runStep(pnpmCmd, ["-C", "server", "build"]);

  console.log("[pack:linux] Preparing output folder...");
  cleanPath(artifactsDir);
  fs.mkdirSync(appDir, { recursive: true });

  console.log("[pack:linux] Deploying server runtime...");
  runStep(pnpmCmd, ["--filter", "@bunker/server", "deploy", "--prod", serverAppDir]);

  const serverPrune = ["src", "tsconfig.json", "tsconfig.build.json", ".env"];
  for (const relPath of serverPrune) {
    cleanPath(path.join(serverAppDir, relPath));
  }

  console.log("[pack:linux] Materializing server runtime links...");
  materializeDirectory(serverAppDir);
  flattenNodeModules(serverAppDir);

  console.log("[pack:linux] Copying client dist and assets...");
  ensureExists(clientDistSrc, "client dist source");
  ensureExists(assetsSrc, "assets source");
  copyDir(clientDistSrc, clientDistDst);
  copyDir(assetsSrc, assetsDst);

  console.log("[pack:linux] Copying scenario runtime data...");
  ensureExists(scenariosRuntimeSrc, "scenarios runtime source");
  copyDir(scenariosRuntimeSrc, scenariosRuntimeDst);
  ensureExists(disastersTextSrc, "disaster text source");
  fs.mkdirSync(path.dirname(disastersTextDst), { recursive: true });
  fs.copyFileSync(disastersTextSrc, disastersTextDst);

  console.log("[pack:linux] Copying Linux Node runtime...");
  await ensureLinuxNodeRuntime();

  console.log("[pack:linux] Writing launch files...");
  writeFile(startShPath, buildStartSh());
  writeFile(portableEnvPath, buildPortableEnv());
  writeFile(readmePath, buildReadme());
  fs.chmodSync(startShPath, 0o755);

  ensureExists(startShPath, "start.sh");
  ensureExists(portableEnvPath, "portable.env");
  ensureExists(path.join(serverAppDir, "dist", "index.js"), "server dist entry");
  ensureExists(path.join(appDir, "client", "dist", "index.html"), "client dist index");

  console.log("[pack:linux] Creating tar.gz archive...");
  createTarGzArchive();

  console.log(`[pack:linux] Portable build completed: ${artifactsDir}`);
}

main().catch((error) => {
  console.error("[pack:linux] Build failed:", error);
  process.exit(1);
});
