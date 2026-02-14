$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\\..")
Set-Location -Path $repoRoot

. (Join-Path $PSScriptRoot "_deps.ps1")

Write-Info "Detected OS: Windows"

Ensure-Node
Ensure-Pnpm

# Force prod identity for selfhost (ignore any dev .env)
$env:BUNKER_IDENTITY_MODE = "prod"
$env:VITE_IDENTITY_MODE = "prod"
$env:DEV_NEW_PLAYER_PER_TAB = "false"
$env:VITE_DEV_TAB_IDENTITY = "false"
$env:VITE_DEV_NEW_PLAYER_PER_TAB = "false"

function Run-Step {
  param(
    [string]$Command,
    [string[]]$CommandArgs
  )
  & $Command @CommandArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $Command $($CommandArgs -join ' ') (code $LASTEXITCODE)"
  }
}

function Resolve-Pnpm {
  $pnpmCmd = Get-Command pnpm -ErrorAction SilentlyContinue
  if ($pnpmCmd) {
    return @{ Command = "pnpm"; Prefix = @() }
  }
  $corepackCmd = Get-Command corepack -ErrorAction SilentlyContinue
  if ($corepackCmd) {
    return @{ Command = "corepack"; Prefix = @("pnpm") }
  }
  throw "pnpm not found in PATH. Install pnpm or enable corepack."
}

function Resolve-Node {
  $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $nodeCmd) {
    throw "node not found in PATH. Install Node.js or enable corepack."
  }
  return "node"
}

function Wait-PortOpen {
  param([string]$Port, [int]$TimeoutSeconds = 10)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $client = New-Object System.Net.Sockets.TcpClient
      $async = $client.BeginConnect("127.0.0.1", [int]$Port, $null, $null)
      if ($async.AsyncWaitHandle.WaitOne(200)) {
        $client.EndConnect($async)
        $client.Close()
        return $true
      }
      $client.Close()
    } catch {
      # ignore
    }
    Start-Sleep -Milliseconds 200
  }
  return $false
}

function Run-StartWithLinks {
  param(
    [string]$NodeCmd,
    [string]$Port,
    [string]$PublicIp,
    [string]$LocalIp,
    [string]$Domain
  )
  $proc = Start-Process -FilePath $NodeCmd -ArgumentList "server/dist/index.js" -NoNewWindow -PassThru

  $exitHandler = Register-EngineEvent PowerShell.Exiting -Action {
    try {
      if ($proc -and -not $proc.HasExited) {
        $proc.Kill()
      }
    } catch { }
  }

  try {
    if (Wait-PortOpen -Port $Port -TimeoutSeconds 10) {
      Write-Host ""
      if (-not [string]::IsNullOrWhiteSpace($Domain)) {
        Write-Host "Open: https://$Domain" -ForegroundColor Cyan
      } else {
        if (-not [string]::IsNullOrWhiteSpace($PublicIp)) {
          Write-Host "Public: http://$PublicIp`:$Port" -ForegroundColor Cyan
        }
        Write-Host "Local : http://$LocalIp`:$Port" -ForegroundColor Cyan
      }
      Write-Host ""
    }

    Wait-Process -Id $proc.Id
  } finally {
    if ($exitHandler) { Unregister-Event -SourceIdentifier $exitHandler.Name -ErrorAction SilentlyContinue }
  }

  if ($proc.ExitCode -ne 0) {
    throw "Server exited with code $($proc.ExitCode)"
  }
}

function Get-PublicIp {
  try {
    return (Invoke-RestMethod -Uri "https://api.ipify.org" -TimeoutSec 5)
  } catch {
    try {
      return (Invoke-RestMethod -Uri "https://ifconfig.me/ip" -TimeoutSec 5)
    } catch {
      return $null
    }
  }
}

function Get-LocalIp {
  try {
    $ip = (Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null } | Select-Object -First 1).IPv4Address.IPAddress
    if ([string]::IsNullOrWhiteSpace($ip)) { return "127.0.0.1" }
    return $ip
  } catch {
    return "127.0.0.1"
  }
}

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

Write-Host "============================================"
Write-Host "Bunker Selfhost Launcher (PowerShell)"
Write-Host "============================================"
Write-Host "1) Local (HTTP) - IP:PORT"
Write-Host "2) Domain (HTTPS) - reverse-proxy"
Write-Host ""

$mode = Read-Host "Choose mode [1-2]"

if ($mode -ne "1" -and $mode -ne "2") {
  Write-Err "Invalid choice."
  exit 1
}

$port = $env:PORT
if ([string]::IsNullOrWhiteSpace($port)) { $port = "3000" }

try {
  $pnpm = Resolve-Pnpm
  $node = Resolve-Node

  if ($mode -eq "1") {
    $publicIp = Get-PublicIp
    $localIp = Get-LocalIp

    $env:HOST = "0.0.0.0"
    $env:PORT = $port
    $env:TRUST_PROXY = "false"

    Run-Step $pnpm.Command ($pnpm.Prefix + @("install"))
    Run-Step $pnpm.Command ($pnpm.Prefix + @("run", "build"))
    if (Test-PortInUse -Port $port) {
      if (-not (Try-FreePort -Port $port)) {
        throw "ERROR: Port $port is already in use. Stop the other server or set PORT to another value."
      }
    }
    Run-StartWithLinks -NodeCmd $node -Port $port -PublicIp $publicIp -LocalIp $localIp -Domain ""
  }

  if ($mode -eq "2") {
    $domain = Read-Host "Enter domain (e.g. bunker.example.com)"
    if ([string]::IsNullOrWhiteSpace($domain)) { $domain = "example.com" }

    $env:HOST = "127.0.0.1"
    $env:PORT = $port
    $env:TRUST_PROXY = "true"
    $env:PUBLIC_ORIGIN = "https://$domain"

    Run-Step $pnpm.Command ($pnpm.Prefix + @("install"))
    Run-Step $pnpm.Command ($pnpm.Prefix + @("run", "build"))
    if (Test-PortInUse -Port $port) {
      if (-not (Try-FreePort -Port $port)) {
        throw "ERROR: Port $port is already in use. Stop the other server or set PORT to another value."
      }
    }
    Run-StartWithLinks -NodeCmd $node -Port $port -PublicIp "" -LocalIp "" -Domain $domain
  }
} catch {
  Write-Host ""
  Write-Err "Launch error:"
  Write-Host $_
  Write-Host ""
  Read-Host "Press Enter to exit"
  exit 1
}
