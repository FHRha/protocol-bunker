$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "_deps.ps1")

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location -Path $repoRoot

Write-Host "============================================"
Write-Host "Bunker Dev Launcher (PowerShell)"
Write-Host "============================================"
Write-Info "Detected OS: Windows"

Ensure-Node
Ensure-Pnpm

function Test-PortInUse {
  param([string]$Port)
  try {
    $connections = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
    return $null -ne $connections
  } catch {
    return $false
  }
}

function Get-PortPids {
  param([string]$Port)
  try {
    $connections = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
    if (-not $connections) { return @() }
    return ($connections | Select-Object -ExpandProperty OwningProcess -Unique)
  } catch {
    return @()
  }
}

function Try-FreePort {
  param([string]$Port)
  $pids = Get-PortPids -Port $Port
  if ($pids.Count -eq 0) { return $true }

  Write-Warn ("Port {0} is in use by:" -f $Port)
  foreach ($procId in $pids) {
    try {
      $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
      if ($proc) {
        Write-Host ("  PID {0}: {1}" -f $procId, $proc.ProcessName) -ForegroundColor Yellow
      } else {
        Write-Host ("  PID {0}" -f $procId) -ForegroundColor Yellow
      }
    } catch {
      Write-Host ("  PID {0}" -f $procId) -ForegroundColor Yellow
    }
  }

  $answer = Read-Host "Kill these processes? (y/N)"
  if ($answer -ne "y" -and $answer -ne "Y") {
    return $false
  }

  foreach ($procId in $pids) {
    try {
      Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    } catch {
      Write-Err ("Failed to kill PID {0}" -f $procId)
    }
  }

  Start-Sleep -Milliseconds 300
  return -not (Test-PortInUse -Port $Port)
}

# Force dev identity for local dev
$env:BUNKER_IDENTITY_MODE = "dev_tab"
$env:BUNKER_DEV_LOGS = "true"
$env:VITE_IDENTITY_MODE = "dev_tab"
$env:DEV_NEW_PLAYER_PER_TAB = "true"
$env:VITE_DEV_TAB_IDENTITY = "true"
$env:VITE_DEV_NEW_PLAYER_PER_TAB = "true"

# Dev ports (client expects server on 3001)
$env:PORT = "3001"
$env:HOST = "127.0.0.1"
$env:BUNKER_SERVE_CLIENT = "false"
$env:VITE_WS_URL = "ws://localhost:3001"
$env:VITE_API_BASE = "http://localhost:3001"
$env:VITE_ASSET_BASE = "http://localhost:3001/assets"

if (Test-PortInUse -Port $env:PORT) {
  if (-not (Try-FreePort -Port $env:PORT)) {
    Write-Err "Port $($env:PORT) is already in use. Stop the other server or set PORT to another value."
    exit 1
  }
}

Write-Info "Starting dev (dev_tab)."
Write-Info "Open in browser: http://localhost:5173"
if (-not (Test-Path (Join-Path $repoRoot "node_modules"))) {
  Write-Info "node_modules not found, running pnpm install..."
  pnpm install
} else {
  Write-Info "Dependencies already installed, skipping pnpm install."
}
pnpm dev
