# Shared dependency helpers for Windows launchers

function Write-Ok {
  param([string]$Message)
  Write-Host ("INFO: {0}" -f $Message) -ForegroundColor Green
}

function Write-Warn {
  param([string]$Message)
  Write-Host ("WARN: {0}" -f $Message) -ForegroundColor Yellow
}

function Write-Err {
  param([string]$Message)
  Write-Host ("ERROR: {0}" -f $Message) -ForegroundColor Red
}

function Write-Info {
  param([string]$Message)
  Write-Host ("INFO: {0}" -f $Message)
}

function Open-Url {
  param([string]$Url)
  try {
    Start-Process $Url | Out-Null
  } catch {
    Write-Warn "Open this URL in your browser: $Url"
  }
}

function Get-LatestNodeMsiUrl {
  $base = "https://nodejs.org/dist/latest-v20.x/"
  try {
    $resp = Invoke-WebRequest -Uri $base -UseBasicParsing -TimeoutSec 10
    $match = [regex]::Match($resp.Content, "node-v20\.\d+\.\d+-x64\.msi")
    if ($match.Success) {
      return "$base$($match.Value)"
    }
  } catch {
    return $null
  }
  return $null
}

function Ensure-Node {
  if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Ok "Node.js found :)"
    return
  }

  Write-Warn "Node.js not found."
  $choice = Read-Host "Install Node.js LTS now? (Required for the game) (y/N)"
  if ($choice -ne "y" -and $choice -ne "Y") {
    Write-Err "Node.js is required."
    Open-Url "https://nodejs.org/en/download"
    throw "Node.js is required."
  }

  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Host "Installing Node.js LTS via winget..."
    winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
  } else {
    $msiUrl = Get-LatestNodeMsiUrl
    if (-not $msiUrl) {
      Write-Err "Could not resolve Node.js LTS download URL."
      Open-Url "https://nodejs.org/en/download"
      throw "Could not resolve Node.js LTS download URL."
    }
    $tmp = Join-Path $env:TEMP "node-lts-x64.msi"
    Write-Host "Downloading Node.js installer..."
    try {
      Invoke-WebRequest -Uri $msiUrl -OutFile $tmp
    } catch {
      Write-Err "Download failed."
      Open-Url "https://nodejs.org/en/download"
      throw "Download failed."
    }
    Write-Host "Starting Node.js installer..."
    Start-Process msiexec.exe -ArgumentList "/i `"$tmp`"" -Wait
  }

  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Err "Node.js installed, but node is still not in PATH. Please restart the terminal."
    throw "Node.js install finished, but node is still not in PATH. Please restart the terminal."
  }
  Write-Ok "Node.js installed :)"
}

function Ensure-Pnpm {
  if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    Write-Ok "pnpm found :)"
    return
  }

  Write-Warn "pnpm not found."

  if (Get-Command corepack -ErrorAction SilentlyContinue) {
    Write-Host "Enabling corepack and activating pnpm..."
    corepack enable | Out-Null
    corepack prepare pnpm@latest --activate | Out-Null
  }

  if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    Write-Ok "pnpm installed via corepack :)"
    return
  }

  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Err "npm not found. Install Node.js LTS and restart the terminal."
    Open-Url "https://nodejs.org/en/download"
    throw "npm not found."
  }

  $choice = Read-Host "Install pnpm via npm -g? (Required for the game) (y/N)"
  if ($choice -ne "y" -and $choice -ne "Y") {
    Write-Err "pnpm is required."
    throw "pnpm is required."
  }

  npm i -g pnpm

  if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    throw "pnpm install failed."
  }
  Write-Ok "pnpm installed :)"
}
