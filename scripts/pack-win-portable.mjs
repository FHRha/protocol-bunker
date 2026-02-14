import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

if (process.platform !== "win32") {
  console.error("[pack:win] This script is intended to run on Windows.");
  process.exit(1);
}

const rootDir = process.cwd();
const rootPackageJsonPath = path.join(rootDir, "package.json");
const rootPackage = JSON.parse(fs.readFileSync(rootPackageJsonPath, "utf8"));
const appVersion = String(rootPackage.version ?? "0.0.0").trim() || "0.0.0";
const versionTag = `v${appVersion}`;
function getArgValue(flagName) {
  const idx = process.argv.findIndex((arg) => arg === flagName);
  if (idx < 0) return null;
  const value = process.argv[idx + 1];
  if (!value || value.startsWith("--")) return null;
  return value;
}
const fastMode = process.argv.includes("--fast");
const skipBuild = process.argv.includes("--skip-build");
const forceRepack = process.argv.includes("--force-repack");
const noArchive = process.argv.includes("--no-archive");
const outRootArg = getArgValue("--out-root");
const gitHead = (() => {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return "nogit";
  return String(result.stdout ?? "").trim() || "nogit";
})();
const artifactsWinDir = outRootArg
  ? path.resolve(rootDir, outRootArg)
  : path.join(rootDir, "artifacts", "win");
const artifactsDir = path.join(artifactsWinDir, "Protocol-Bunker");
const appDir = path.join(artifactsDir, "app");
const appVersionFilePath = path.join(appDir, "VERSION");
const serverAppDir = path.join(appDir, "server");
const clientDistSrc = path.join(rootDir, "client", "dist");
const clientDistDst = path.join(appDir, "client", "dist");
const clientDistIndexSrc = path.join(clientDistSrc, "index.html");
const sharedDistEntrySrc = path.join(rootDir, "shared", "dist", "index.js");
const scenariosDistEntrySrc = path.join(rootDir, "scenarios", "dist", "index.js");
const serverDistEntrySrc = path.join(rootDir, "server", "dist", "index.js");
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
const nodeExeSrc = process.execPath;
const nodeExeDst = path.join(nodeDir, "node.exe");
const startBatPath = path.join(artifactsDir, "start.bat");
const startPs1Path = path.join(artifactsDir, "start-portable.ps1");
const portableEnvPath = path.join(artifactsDir, "portable.env");
const readmePath = path.join(artifactsDir, "README_PORTABLE.txt");
const zipPath = path.join(
  artifactsWinDir,
  `protocol-bunker-win-x64-portable-${versionTag}.zip`
);
const jsBuildStampPath = path.join(rootDir, ".cache", "pack-js-build-stamp.json");
const pnpmCmd = "pnpm";

function quoteCmdArg(value) {
  if (value.length === 0) return '""';
  const escaped = value.replace(/"/g, '""');
  return /[\s&()^|<>]/.test(value) ? `"${escaped}"` : escaped;
}

function runStep(command, args) {
  const commandLine = [command, ...args.map(quoteCmdArg)].join(" ");
  console.log(`[pack:win] > ${commandLine}`);
  const result = spawnSync("cmd.exe", ["/d", "/s", "/c", commandLine], {
    cwd: rootDir,
    stdio: "inherit",
    windowsHide: false,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const code = result.status ?? 1;
    throw new Error(`Command failed (${code}): ${commandLine}`);
  }
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function runStepWithRetry(command, args, maxAttempts = 4) {
  let attempt = 1;
  while (attempt <= maxAttempts) {
    try {
      runStep(command, args);
      return;
    } catch (error) {
      const message = String(error);
      const canRetry = message.includes("EBUSY");
      if (!canRetry || attempt >= maxAttempts) {
        throw error;
      }
      console.warn(`[pack:win] Retrying after EBUSY (${attempt}/${maxAttempts})...`);
      sleepMs(800 * attempt);
      attempt += 1;
    }
  }
}

function runPowerShellCommand(script, stdio = "inherit") {
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    {
      cwd: rootDir,
      stdio,
      windowsHide: false,
    }
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const code = result.status ?? 1;
    throw new Error(`PowerShell command failed (${code}).`);
  }
}

function ensureExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Missing ${label}: ${targetPath}`);
  }
}

function ensureAnyMissing(pathsWithLabels) {
  const missing = [];
  for (const [targetPath, label] of pathsWithLabels) {
    if (!fs.existsSync(targetPath)) {
      missing.push(`${label}: ${targetPath}`);
    }
  }
  return missing;
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readTextSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

function writeJsBuildStamp() {
  const stamp = {
    versionTag,
    gitHead,
    builtAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(jsBuildStampPath), { recursive: true });
  fs.writeFileSync(jsBuildStampPath, `${JSON.stringify(stamp, null, 2)}\n`, "utf8");
}

function isJsBuildReusable() {
  const required = [
    [clientDistIndexSrc, "client dist"],
    [sharedDistEntrySrc, "shared dist"],
    [scenariosDistEntrySrc, "scenarios dist"],
    [serverDistEntrySrc, "server dist"],
  ];
  const missing = ensureAnyMissing(required);
  if (missing.length > 0) {
    return { ok: false, reason: `missing outputs: ${missing.join("; ")}` };
  }
  const stamp = readJsonSafe(jsBuildStampPath);
  if (!stamp) {
    return { ok: false, reason: "missing JS build stamp" };
  }
  if (stamp.versionTag !== versionTag) {
    return { ok: false, reason: `stamp version mismatch (${stamp.versionTag} != ${versionTag})` };
  }
  if (stamp.gitHead !== gitHead) {
    return { ok: false, reason: "stamp git revision mismatch" };
  }
  return { ok: true, reason: "stamp matches" };
}

function ensureJsBuildOutputsOrThrow() {
  const required = [
    [clientDistIndexSrc, "client dist"],
    [sharedDistEntrySrc, "shared dist"],
    [scenariosDistEntrySrc, "scenarios dist"],
    [serverDistEntrySrc, "server dist"],
  ];
  const missing = ensureAnyMissing(required);
  if (missing.length === 0) {
    return;
  }
  throw new Error(
    `[pack:win] --skip-build requested, but build outputs are missing. Run "pnpm -r build" first.\n${missing.join(
      "\n"
    )}`
  );
}

function cleanPath(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch (error) {
    const commandLine = `rmdir /s /q ${quoteCmdArg(targetPath)}`;
    const fallback = spawnSync("cmd.exe", ["/d", "/s", "/c", commandLine], {
      cwd: rootDir,
      stdio: "ignore",
      windowsHide: true,
    });
    if (fallback.error || fs.existsSync(targetPath)) {
      throw error;
    }
  }
}

function copyDir(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true, force: true });
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function removeLinuxShellScripts(root) {
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".sh")) {
        fs.rmSync(fullPath, { force: true });
      }
    }
  }
}

function materializeDirectory(sourceDir) {
  const materializedDir = path.join(
    os.tmpdir(),
    `bunker-portable-materialized-${Date.now()}-${process.pid}`
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
    // best effort cleanup for temporary materialized folder
  }
}

function flattenNodeModules(rootDir) {
  const nodeModulesDir = path.join(rootDir, "node_modules");
  const pnpmVirtualDir = path.join(nodeModulesDir, ".pnpm", "node_modules");
  if (!fs.existsSync(pnpmVirtualDir)) {
    return;
  }
  const entries = fs.readdirSync(pnpmVirtualDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const src = path.join(pnpmVirtualDir, entry.name);
    const dst = path.join(nodeModulesDir, entry.name);
    if (fs.existsSync(dst)) continue;
    fs.cpSync(src, dst, { recursive: true, force: true, dereference: true });
  }
}

function stopRunningPortableServer() {
  const escapedExe = nodeExeDst.replace(/'/g, "''");
  const script = [
    `$exe = '${escapedExe}'`,
    "Get-Process -Name node -ErrorAction SilentlyContinue |",
    "Where-Object { $_.Path -eq $exe } |",
    "ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }",
  ].join(" ");
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    {
      cwd: rootDir,
      stdio: "ignore",
      windowsHide: true,
    }
  );
  if (result.error) {
    throw result.error;
  }
}

function formatBytes(value) {
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const fractionDigits = unitIndex === 0 ? 0 : 2;
  return `${size.toFixed(fractionDigits)} ${units[unitIndex]}`;
}

function createZipArchive() {
  const src = artifactsDir.replace(/'/g, "''");
  const dst = zipPath.replace(/'/g, "''");
  const script = [
    `$src = '${src}'`,
    `$dst = '${dst}'`,
    "if (Test-Path -LiteralPath $dst) { Remove-Item -LiteralPath $dst -Force }",
    "Compress-Archive -Path $src -DestinationPath $dst -Force",
  ].join("; ");
  runPowerShellCommand(script, "inherit");
  ensureExists(zipPath, "portable zip");
  const stats = fs.statSync(zipPath);
  console.log(`[pack:win] ZIP created: ${zipPath}`);
  console.log(`[pack:win] ZIP size: ${formatBytes(stats.size)}`);
}

function isPortableBaseReusable() {
  if (forceRepack) {
    return { ok: false, reason: "--force-repack set" };
  }
  const versionValue = readTextSafe(appVersionFilePath);
  if (versionValue !== versionTag) {
    return { ok: false, reason: `app/VERSION mismatch (${versionValue || "empty"} != ${versionTag})` };
  }
  const required = [
    [path.join(serverAppDir, "dist", "index.js"), "server dist entry"],
    [path.join(appDir, "client", "dist", "index.html"), "client dist index"],
    [path.join(appDir, "assets"), "assets"],
    [nodeExeDst, "node runtime"],
  ];
  const missing = ensureAnyMissing(required);
  if (missing.length > 0) {
    return { ok: false, reason: `missing runtime files: ${missing.join("; ")}` };
  }
  return { ok: true, reason: "portable base version and files are valid" };
}

function buildStartBat() {
  return `@echo off
setlocal
cd /d "%~dp0"
if not exist "logs" mkdir "logs"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-portable.ps1"
set "EXITCODE=%ERRORLEVEL%"
echo.
echo Server stopped.
if not "%EXITCODE%"=="0" echo Exit code: %EXITCODE%
pause
endlocal & exit /b %EXITCODE%
`;
}

function buildStartPs1() {
  return `$ErrorActionPreference = "Stop"

$portableRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$appRoot = Join-Path $portableRoot "app"
$logsDir = Join-Path $portableRoot "logs"
$portableEnvFile = Join-Path $portableRoot "portable.env"

$nodeExe = Join-Path $appRoot "node\\node.exe"
$serverRoot = Join-Path $appRoot "server"
$serverEntry = Join-Path $serverRoot "dist\\index.js"
$clientDist = Join-Path $appRoot "client\\dist"
$clientIndex = Join-Path $clientDist "index.html"
$assetsRoot = Join-Path $appRoot "assets"

$serverLogFile = Join-Path $logsDir "server.log"
$portFile = Join-Path $logsDir "port.txt"
$urlsFile = Join-Path $logsDir "urls.txt"
$lastStartFile = Join-Path $logsDir "last-start.txt"

$script:detectedPort = $null
$script:browserOpened = $false
$script:selectedPort = 0
$script:lanIp = "127.0.0.1"
$script:publicIp = $null
$script:mode = "local"
$script:domain = $null
$script:openUrl = $null

function Assert-Exists {
  param(
    [Parameter(Mandatory = $true)][string]$PathValue,
    [Parameter(Mandatory = $true)][string]$Label
  )
  if (-not (Test-Path -LiteralPath $PathValue)) {
    throw "Missing \${Label}: $PathValue"
  }
}

function Read-PortableEnv {
  param([Parameter(Mandatory = $true)][string]$PathValue)
  $result = @{}
  if (-not (Test-Path -LiteralPath $PathValue)) {
    return $result
  }
  try {
    $lines = Get-Content -LiteralPath $PathValue -ErrorAction Stop
  } catch {
    Write-Host "portable.env unreadable. Using defaults: PORT=0 DEV_MODE=0."
    return $result
  }
  foreach ($rawLine in $lines) {
    $line = $rawLine.Trim()
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    if ($line.StartsWith("#") -or $line.StartsWith(";")) { continue }
    $eqIndex = $line.IndexOf("=")
    if ($eqIndex -lt 1) { continue }
    $key = $line.Substring(0, $eqIndex).Trim().ToUpperInvariant()
    $value = $line.Substring($eqIndex + 1).Trim()
    if (-not [string]::IsNullOrWhiteSpace($key)) {
      $result[$key] = $value
    }
  }
  return $result
}

function Get-ConfigPort {
  param([hashtable]$Config)
  $rawPort = if ($Config.ContainsKey("PORT")) { [string]$Config["PORT"] } else { "" }
  if ([string]::IsNullOrWhiteSpace($rawPort)) {
    return 0
  }
  $port = 0
  if (-not [int]::TryParse($rawPort, [ref]$port)) {
    Write-Host ("Invalid PORT in portable.env: '{0}'. Using PORT=0." -f $rawPort)
    return 0
  }
  if ($port -lt 0 -or $port -gt 65535) {
    Write-Host ("Invalid PORT in portable.env: '{0}'. Using PORT=0." -f $rawPort)
    return 0
  }
  return $port
}

function Get-ConfigDevMode {
  param([hashtable]$Config)
  $raw = if ($Config.ContainsKey("DEV_MODE")) { [string]$Config["DEV_MODE"] } else { "" }
  if ([string]::IsNullOrWhiteSpace($raw)) { return $false }
  $value = $raw.Trim().ToLowerInvariant()
  return $value -in @("1", "true", "yes", "on")
}

function Resolve-Mode {
  param([hashtable]$Config)
  $modeRaw = if ($Config.ContainsKey("MODE")) { [string]$Config["MODE"] } else { "" }
  $mode = $modeRaw.Trim().ToLowerInvariant()
  if ($mode -eq "local" -or $mode -eq "1") { return "local" }
  if ($mode -eq "domain" -or $mode -eq "2") { return "domain" }

  Write-Host "============================================"
  Write-Host "Protocol: Bunker Portable Launcher (PowerShell)"
  Write-Host "============================================"
  Write-Host "1) Local (HTTP) - IP:PORT"
  Write-Host "2) Domain (HTTPS) - reverse-proxy"
  Write-Host ""

  $choice = Read-Host "Choose mode [1-2]"
  if ($choice -eq "1") { return "local" }
  if ($choice -eq "2") { return "domain" }
  throw "Invalid mode selection."
}

function Resolve-Domain {
  param([hashtable]$Config)
  $domain = if ($Config.ContainsKey("DOMAIN")) { [string]$Config["DOMAIN"] } else { "" }
  $domain = $domain.Trim()
  if ([string]::IsNullOrWhiteSpace($domain)) {
    $domain = Read-Host "Enter domain (e.g. bunker.example.com)"
  }
  if ([string]::IsNullOrWhiteSpace($domain)) {
    $domain = "example.com"
  }
  return $domain
}

function Get-PublicIp {
  try {
    $ip = Invoke-RestMethod -Uri "https://api.ipify.org" -TimeoutSec 5
    if (-not [string]::IsNullOrWhiteSpace([string]$ip)) {
      return [string]$ip
    }
  } catch {
    # ignore
  }
  try {
    $ip = Invoke-RestMethod -Uri "https://ifconfig.me/ip" -TimeoutSec 5
    if (-not [string]::IsNullOrWhiteSpace([string]$ip)) {
      return [string]$ip
    }
  } catch {
    # ignore
  }
  return $null
}

function Test-PrivateIPv4 {
  param([Parameter(Mandatory = $true)][string]$Ip)
  return (
    $Ip -like "10.*" -or
    $Ip -like "192.168.*" -or
    $Ip -match "^172\\.(1[6-9]|2[0-9]|3[0-1])\\."
  )
}

function Test-PreferredAdapterAlias {
  param([string]$Alias)
  if ([string]::IsNullOrWhiteSpace($Alias)) { return $true }
  $name = $Alias.ToLowerInvariant()
  $blocked = @(
    "nekobox", "vpn", "wintun", "wireguard", "tun", "tap", "openvpn", "clash", "warp",
    "vethernet", "hyper-v", "vmware", "virtual", "loopback", "docker", "podman", "wsl",
    "tailscale", "zerotier", "hamachi", "isatap", "teredo"
  )
  foreach ($token in $blocked) {
    if ($name -like "*$token*") {
      return $false
    }
  }
  return $true
}

function Get-LanIPv4 {
  try {
    $candidates = New-Object System.Collections.Generic.List[object]
    $configs = Get-NetIPConfiguration -ErrorAction Stop |
      Where-Object { $_.IPv4Address -and $_.IPv4Address.IPAddress }

    foreach ($cfg in $configs) {
      $ip = [string]$cfg.IPv4Address.IPAddress
      if ([string]::IsNullOrWhiteSpace($ip)) { continue }
      if ($ip -like "127.*" -or $ip -like "169.254.*" -or $ip -eq "0.0.0.0") { continue }

      $isPrivate = Test-PrivateIPv4 -Ip $ip
      $preferredAlias = Test-PreferredAdapterAlias -Alias ([string]$cfg.InterfaceAlias)
      $hasGateway = $null -ne $cfg.IPv4DefaultGateway

      $score = 0
      if ($isPrivate) { $score += 100 }
      if ($preferredAlias) { $score += 20 }
      if ($hasGateway) { $score += 10 }

      $candidates.Add([PSCustomObject]@{
        Ip = $ip
        Score = $score
      }) | Out-Null
    }

    if ($candidates.Count -gt 0) {
      return ($candidates | Sort-Object -Property Score -Descending | Select-Object -First 1).Ip
    }
  } catch {
    # ignore
  }
  return "127.0.0.1"
}

function Test-PortBusy {
  param([Parameter(Mandatory = $true)][int]$Port)
  if ($Port -le 0) { return $false }

  try {
    if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
      $connections = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
      if ($connections) {
        return $true
      }
    }
  } catch {
    # ignore
  }

  $tcpClient = $null
  try {
    $tcpClient = New-Object System.Net.Sockets.TcpClient
    $async = $tcpClient.BeginConnect("127.0.0.1", $Port, $null, $null)
    $connected = $async.AsyncWaitHandle.WaitOne(300)
    if ($connected) {
      try {
        $tcpClient.EndConnect($async) | Out-Null
      } catch {
        # ignore
      }
      return $true
    }
  } catch {
    # ignore
  } finally {
    if ($tcpClient) {
      $tcpClient.Dispose()
    }
  }

  return $false
}

function Wait-PortOpen {
  param([Parameter(Mandatory = $true)][int]$Port, [int]$TimeoutSeconds = 10)
  if ($Port -le 0) { return $false }
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $client = New-Object System.Net.Sockets.TcpClient
      $async = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
      if ($async.AsyncWaitHandle.WaitOne(250)) {
        $client.EndConnect($async) | Out-Null
        $client.Dispose()
        return $true
      }
      $client.Dispose()
    } catch {
      # ignore
    }
    Start-Sleep -Milliseconds 200
  }
  return $false
}

function Try-ExtractPort {
  param([Parameter(Mandatory = $true)][string]$Line)

  $marker = [System.Text.RegularExpressions.Regex]::Match($Line, "__BUNKER_PORT__=(\\d{1,5})")
  if ($marker.Success) {
    return [int]$marker.Groups[1].Value
  }

  $urlMatch = [System.Text.RegularExpressions.Regex]::Match($Line, "https?://\\S+:(\\d{2,5})(?:/|$)")
  if ($urlMatch.Success) {
    return [int]$urlMatch.Groups[1].Value
  }

  $keywordMatch = [System.Text.RegularExpressions.Regex]::Match(
    $Line,
    "(?i)(?:port|listening|127\\.0\\.0\\.1|0\\.0\\.0\\.0|localhost)[^0-9]{0,20}(\\d{2,5})"
  )
  if ($keywordMatch.Success) {
    return [int]$keywordMatch.Groups[1].Value
  }

  $fallback = [System.Text.RegularExpressions.Regex]::Match($Line, ":(\\d{2,5})(?:\\b|/)")
  if ($fallback.Success) {
    return [int]$fallback.Groups[1].Value
  }

  return $null
}

function Save-PortAndUrls {
  param([Parameter(Mandatory = $true)][int]$Port)
  if ($script:detectedPort) { return }

  $script:detectedPort = $Port
  Set-Content -LiteralPath $portFile -Value "$Port" -Encoding ASCII

  if ($script:mode -eq "domain") {
    $openUrl = "https://$script:domain"
    $upstream = "http://127.0.0.1:$Port"
    $script:openUrl = $openUrl
    $lines = @(
      ("Open: {0}" -f $openUrl),
      ("Upstream: {0}" -f $upstream)
    )
    Set-Content -LiteralPath $urlsFile -Value $lines -Encoding UTF8

    Write-Host ""
    Write-Host ("Open: {0}" -f $openUrl) -ForegroundColor Cyan
    Write-Host ("Upstream: {0}" -f $upstream) -ForegroundColor Cyan
    Write-Host ""
  } else {
    $localhostUrl = "http://127.0.0.1:$Port"
    $lanUrl = "http://{0}:{1}" -f $script:lanIp, $Port
    $publicUrl = if ([string]::IsNullOrWhiteSpace($script:publicIp)) {
      "unavailable"
    } else {
      "http://{0}:{1}" -f $script:publicIp, $Port
    }
    $script:openUrl = $lanUrl
    $lines = @(
      ("Public: {0}" -f $publicUrl),
      ("Local : {0}" -f $lanUrl),
      ("Localhost: {0}" -f $localhostUrl)
    )
    Set-Content -LiteralPath $urlsFile -Value $lines -Encoding UTF8

    Write-Host ""
    Write-Host ("Public: {0}" -f $publicUrl) -ForegroundColor Cyan
    Write-Host ("Local : {0}" -f $lanUrl) -ForegroundColor Cyan
    Write-Host ("Localhost: {0}" -f $localhostUrl) -ForegroundColor Cyan
    Write-Host ""
  }

  Write-Host "Port saved to logs/port.txt"
  Write-Host ""

  if ($env:BUNKER_PORTABLE_NO_BROWSER -ne "1" -and -not $script:browserOpened -and $script:openUrl) {
    Start-Process -FilePath $script:openUrl | Out-Null
    $script:browserOpened = $true
  }
}

function Process-ServerLine {
  param([Parameter(Mandatory = $true)][string]$Line)
  if ([string]::IsNullOrWhiteSpace($Line)) { return }

  if (-not $script:detectedPort) {
    $port = Try-ExtractPort -Line $Line
    if ($port -and $port -gt 0 -and $port -le 65535) {
      Save-PortAndUrls -Port $port
      return
    }
    if ($script:selectedPort -gt 0 -and $Line -match "(?i)server listening|listening on|listening at") {
      Save-PortAndUrls -Port $script:selectedPort
    }
  }
}

function Apply-DevMode {
  param([bool]$DevMode)

  $env:BUNKER_ENABLE_DEV_SCENARIOS = if ($DevMode) { "true" } else { "false" }
  if ($DevMode) {
    $env:BUNKER_IDENTITY_MODE = "dev_tab"
    $env:BUNKER_DEV_LOGS = "true"
    $env:VITE_IDENTITY_MODE = "dev_tab"
    $env:DEV_NEW_PLAYER_PER_TAB = "true"
    $env:VITE_DEV_TAB_IDENTITY = "true"
    $env:VITE_DEV_NEW_PLAYER_PER_TAB = "true"
  } else {
    $env:BUNKER_IDENTITY_MODE = "prod"
    $env:BUNKER_DEV_LOGS = "false"
    $env:VITE_IDENTITY_MODE = "prod"
    $env:DEV_NEW_PLAYER_PER_TAB = "false"
    $env:VITE_DEV_TAB_IDENTITY = "false"
    $env:VITE_DEV_NEW_PLAYER_PER_TAB = "false"
  }
}

Assert-Exists -PathValue $nodeExe -Label "Node runtime"
Assert-Exists -PathValue $serverEntry -Label "server entrypoint"
Assert-Exists -PathValue $clientIndex -Label "client dist"
Assert-Exists -PathValue $assetsRoot -Label "assets directory"

New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
foreach ($f in @($serverLogFile, $portFile, $urlsFile)) {
  if (Test-Path -LiteralPath $f) {
    Remove-Item -LiteralPath $f -Force
  }
}
Set-Content -LiteralPath $lastStartFile -Value (Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz") -Encoding UTF8
New-Item -ItemType File -Path $serverLogFile -Force | Out-Null

$portableConfig = Read-PortableEnv -PathValue $portableEnvFile
$script:selectedPort = Get-ConfigPort -Config $portableConfig
$devMode = Get-ConfigDevMode -Config $portableConfig
$script:mode = Resolve-Mode -Config $portableConfig

if ($script:mode -eq "domain") {
  if ($script:selectedPort -eq 0) {
    Write-Host "Domain mode requires fixed PORT. Set PORT=xxxx in portable.env"
    exit 1
  }
  $script:domain = Resolve-Domain -Config $portableConfig
}

if ($script:selectedPort -gt 0 -and (Test-PortBusy -Port $script:selectedPort)) {
  Write-Host ("PORT {0} is busy. Change PORT in portable.env or set PORT=0 for auto." -f $script:selectedPort)
  exit 1
}

$env:PORT = "$script:selectedPort"
$env:BUNKER_SERVE_CLIENT = "true"
$env:BUNKER_PORTABLE = "1"
$env:BUNKER_ASSETS_ROOT = $assetsRoot
$env:BUNKER_CLIENT_DIST = $clientDist

if ($script:mode -eq "domain") {
  $env:HOST = "127.0.0.1"
  $env:TRUST_PROXY = "true"
  $env:PUBLIC_ORIGIN = "https://$script:domain"
} else {
  $env:HOST = "0.0.0.0"
  $env:TRUST_PROXY = "false"
  Remove-Item Env:PUBLIC_ORIGIN -ErrorAction SilentlyContinue
}
Apply-DevMode -DevMode:$devMode

$script:lanIp = Get-LanIPv4
$script:publicIp = if ($script:mode -eq "local") { Get-PublicIp } else { $null }

Write-Host "Starting Protocol Bunker server..."
Write-Host ("Mode: {0}" -f $script:mode.ToUpperInvariant())
if ($devMode) {
  Write-Host "Identity: DEV_MODE=1"
}
if ($script:selectedPort -eq 0) {
  Write-Host "Port mode: auto (PORT=0 from portable.env)"
} else {
  Write-Host ("Port mode: fixed ({0}) from portable.env" -f $script:selectedPort)
}
Write-Host "Log file: logs/server.log"
Write-Host "Press Ctrl+C to stop."

$exitCode = 0
$previousErrorActionPreference = $ErrorActionPreference
Push-Location -LiteralPath $serverRoot
try {
  $ErrorActionPreference = "Continue"
  & $nodeExe $serverEntry 2>&1 |
    Tee-Object -FilePath $serverLogFile -Append |
    ForEach-Object {
      $line = [string]$_
      Write-Host $line
      Process-ServerLine -Line $line
    }
  $exitCode = $LASTEXITCODE
} finally {
  Pop-Location
  $ErrorActionPreference = $previousErrorActionPreference
}

if (-not $script:detectedPort -and $script:selectedPort -gt 0 -and (Wait-PortOpen -Port $script:selectedPort -TimeoutSeconds 1)) {
  Save-PortAndUrls -Port $script:selectedPort
}

if ($exitCode -ne 0) {
  throw "Server exited with code $exitCode. See logs/server.log"
}
`;
}

function buildReadme() {
  return `Protocol Bunker Portable (Windows)
==================================

Start:
1. Run start.bat
2. Wait for startup lines in the console
3. Browser opens automatically (unless disabled)

Stop:
- Press Ctrl+C in the start.bat window
- Or close the start.bat window

Logs:
- logs\\server.log
- logs\\port.txt
- logs\\urls.txt
- logs\\last-start.txt

Port configuration:
- Open portable.env and set PORT=XXXXX for fixed port (example: PORT=56986)
- Set PORT=0 for automatic port
- Actual port is always saved to logs\\port.txt
- MODE=local|domain (if not set, launcher asks in console)
- DOMAIN=your.domain.com (used in domain mode)
- Domain mode requires fixed PORT (PORT must be 1..65535)
- DEV_MODE=1 enables dev_tab behavior (for testing), default DEV_MODE=0

Disable auto browser open:
- set BUNKER_PORTABLE_NO_BROWSER=1
- then run start.bat

Router port forwarding:
- Use the port from logs\\port.txt
- Forward that TCP port to this machine in your router settings
`;
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

function main() {
  console.log(`[pack:win] Building version: ${versionTag}`);
  if (skipBuild) {
    console.log("[pack:win] Skipping package builds (--skip-build).");
    ensureJsBuildOutputsOrThrow();
  } else if (fastMode) {
    const reuse = isJsBuildReusable();
    if (reuse.ok) {
      console.log(`[pack:win] Reusing JS build outputs (--fast): ${reuse.reason}`);
    } else {
      console.log(`[pack:win] --fast fallback to build: ${reuse.reason}`);
      runStep(pnpmCmd, ["-C", "client", "build"]);
      runStep(pnpmCmd, ["-C", "shared", "build"]);
      runStep(pnpmCmd, ["-C", "scenarios", "build"]);
      runStep(pnpmCmd, ["-C", "server", "build"]);
      writeJsBuildStamp();
    }
  } else {
    console.log("[pack:win] Building production artifacts...");
    runStep(pnpmCmd, ["-C", "client", "build"]);
    runStep(pnpmCmd, ["-C", "shared", "build"]);
    runStep(pnpmCmd, ["-C", "scenarios", "build"]);
    runStep(pnpmCmd, ["-C", "server", "build"]);
    writeJsBuildStamp();
  }

  console.log("[pack:win] Preparing portable base...");
  stopRunningPortableServer();
  const portableBaseReuse = isPortableBaseReusable();
  const shouldReusePortableBase = portableBaseReuse.ok;
  if (shouldReusePortableBase) {
    console.log(`[pack:win] Reusing existing portable base: ${portableBaseReuse.reason}`);
    fs.mkdirSync(appDir, { recursive: true });
  } else {
    console.log(`[pack:win] Building portable base: ${portableBaseReuse.reason}`);
    cleanPath(artifactsDir);
    fs.mkdirSync(appDir, { recursive: true });

    console.log("[pack:win] Deploying server runtime...");
    runStepWithRetry(pnpmCmd, ["--filter", "@bunker/server", "deploy", "--prod", serverAppDir]);

    const serverPrune = ["src", "tsconfig.json", "tsconfig.build.json", ".env"];
    for (const relPath of serverPrune) {
      cleanPath(path.join(serverAppDir, relPath));
    }

    console.log("[pack:win] Materializing server runtime links...");
    materializeDirectory(serverAppDir);
    flattenNodeModules(serverAppDir);

    console.log("[pack:win] Copying client dist and assets...");
    ensureExists(clientDistSrc, "client dist source");
    ensureExists(assetsSrc, "assets source");
    copyDir(clientDistSrc, clientDistDst);
    copyDir(assetsSrc, assetsDst);

    console.log("[pack:win] Copying scenario runtime data...");
    ensureExists(scenariosRuntimeSrc, "scenarios runtime source");
    copyDir(scenariosRuntimeSrc, scenariosRuntimeDst);
    ensureExists(disastersTextSrc, "disaster text source");
    fs.mkdirSync(path.dirname(disastersTextDst), { recursive: true });
    fs.copyFileSync(disastersTextSrc, disastersTextDst);

    console.log("[pack:win] Copying Node runtime...");
    ensureExists(nodeExeSrc, "local node runtime");
    fs.mkdirSync(nodeDir, { recursive: true });
    fs.copyFileSync(nodeExeSrc, nodeExeDst);
  }

  console.log("[pack:win] Writing launch files...");
  writeFile(startBatPath, buildStartBat());
  writeFile(startPs1Path, buildStartPs1());
  writeFile(portableEnvPath, buildPortableEnv());
  writeFile(readmePath, buildReadme());
  writeFile(appVersionFilePath, `${versionTag}\n`);

  console.log("[pack:win] Removing Linux shell scripts...");
  removeLinuxShellScripts(artifactsDir);

  ensureExists(startBatPath, "start.bat");
  ensureExists(startPs1Path, "start-portable.ps1");
  ensureExists(portableEnvPath, "portable.env");
  ensureExists(path.join(serverAppDir, "dist", "index.js"), "server dist entry");
  ensureExists(path.join(appDir, "client", "dist", "index.html"), "client dist index");
  ensureExists(appVersionFilePath, "app VERSION");

  if (noArchive) {
    console.log("[pack:win] --no-archive set, skipping ZIP creation.");
  } else {
    console.log("[pack:win] Creating ZIP archive...");
    createZipArchive();
  }

  console.log("[pack:win] Created files:");
  if (!noArchive) {
    console.log(` - ${zipPath}`);
  }
  console.log(` - ${artifactsDir}`);
  console.log(`[pack:win] Portable build completed for ${versionTag}`);
}

main();
