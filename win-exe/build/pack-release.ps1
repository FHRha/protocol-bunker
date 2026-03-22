param(
  [string]$Configuration = "Release",
  [switch]$SkipBuild,
  [switch]$Fast,
  [switch]$ForceRepack,
  [string]$PortableBaseDir,
  [string]$AssetVariant = "1x"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RootDir = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$RootPackageJson = Join-Path $RootDir "package.json"
$DistDir = Join-Path $RootDir "artifacts\win-exe"
$WorkDir = Join-Path $DistDir "_work"
$WinExePortableBaseRoot = Join-Path $DistDir "_b"
$PayloadRoot = Join-Path $DistDir "Protocol-Bunker"
$AppRoot = Join-Path $PayloadRoot "app"
$SyncIconsScript = Join-Path $RootDir "win-exe\build\sync-icons.ps1"
$IconsSourceDir = Join-Path $RootDir "win-exe\assets\icons"
$AssetsSourceDir = Join-Path $RootDir "assets"

$LauncherProject = Join-Path $RootDir "win-exe\src\ProtocolBunker.Launcher\ProtocolBunker.Launcher.csproj"
$BootstrapperProject = Join-Path $RootDir "win-exe\src\ProtocolBunker.Bootstrapper\ProtocolBunker.Bootstrapper.csproj"
$UpdaterProject = Join-Path $RootDir "win-exe\src\ProtocolBunker.UpdaterHelper\ProtocolBunker.UpdaterHelper.csproj"
$BootstrapperEmbeddedPayload = Join-Path $RootDir "win-exe\src\ProtocolBunker.Bootstrapper\Embedded\payload.zip"
$PublishDir = Join-Path $WorkDir "publish"

function Write-Step([string]$Message) {
  Write-Host "[pack:win-exe] $Message"
}

function Format-Elapsed {
  param([Parameter(Mandatory = $true)][TimeSpan]$Elapsed)

  if ($Elapsed.TotalHours -ge 1) {
    return ("{0}h {1}m {2}s" -f [int]$Elapsed.TotalHours, $Elapsed.Minutes, $Elapsed.Seconds)
  }

  if ($Elapsed.TotalMinutes -ge 1) {
    return ("{0}m {1}s" -f [int]$Elapsed.TotalMinutes, $Elapsed.Seconds)
  }

  return ("{0}s" -f [int]$Elapsed.TotalSeconds)
}

function Format-ElapsedSeconds {
  param([Parameter(Mandatory = $true)][int]$Seconds)

  if ($Seconds -lt 0) {
    $Seconds = 0
  }
  $elapsed = [TimeSpan]::FromSeconds($Seconds)
  return (Format-Elapsed -Elapsed $elapsed)
}

function Wait-ProcessWithHeartbeat {
  param(
    [Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process,
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][System.Diagnostics.Stopwatch]$Stopwatch,
    [int]$HeartbeatSeconds = 10
  )

  if ($HeartbeatSeconds -lt 1) {
    $HeartbeatSeconds = 1
  }

  $heartbeatElapsedSeconds = 0
  while (-not $Process.HasExited) {
    $exited = $Process.WaitForExit($HeartbeatSeconds * 1000)
    if (-not $exited) {
      $heartbeatElapsedSeconds += $HeartbeatSeconds
      Write-Step "$Label still running (+${heartbeatElapsedSeconds}s, now $(Get-Date -Format 'HH:mm:ss'))..."
    }
  }

  $Process.WaitForExit()
}

function Resolve-VersionTag {
  if (-not (Test-Path -LiteralPath $RootPackageJson)) {
    throw "Missing package.json at: $RootPackageJson"
  }
  $json = Get-Content -LiteralPath $RootPackageJson -Raw | ConvertFrom-Json
  $version = [string]$json.version
  if ([string]::IsNullOrWhiteSpace($version)) {
    throw "Root package.json has empty version."
  }
  $trimmed = $version.Trim()
  if ($trimmed.StartsWith("v")) {
    return $trimmed
  }
  return "v$trimmed"
}

$VersionTag = Resolve-VersionTag
$ReleaseZipPath = Join-Path $DistDir "protocol-bunker-win-x64-exe-$VersionTag.zip"
$SetupExePath = Join-Path $DistDir "protocol-bunker-win-x64-exe-setup-$VersionTag.exe"

function Measure-Step {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][scriptblock]$Action
  )

  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  Write-Step "$Name (start)"
  & $Action
  $sw.Stop()
  Write-Step "$Name (done in $($sw.Elapsed.ToString()))"
}

function Invoke-External {
  param(
    [Parameter(Mandatory = $true)][string]$File,
    [Parameter(Mandatory = $true)][string[]]$Args,
    [string]$WorkingDirectory = $RootDir,
    [string]$Label = "command"
  )

  $display = @($File) + $Args
  Write-Host "[pack:win-exe] > $($display -join ' ')"
  Write-Step "$Label in progress..."
  $watch = [System.Diagnostics.Stopwatch]::StartNew()
  $proc = Start-Process -FilePath $File -ArgumentList $Args -WorkingDirectory $WorkingDirectory -NoNewWindow -PassThru
  Wait-ProcessWithHeartbeat -Process $proc -Label $Label -Stopwatch $watch -HeartbeatSeconds 10
  $watch.Stop()
  $exitCode = 0
  try {
    $proc.Refresh()
    if ($null -ne $proc.ExitCode) {
      $exitCode = [int]$proc.ExitCode
    }
  } catch {
    $exitCode = 0
  }
  if ($watch.Elapsed.TotalMinutes -ge 2) {
    Write-Step "$Label finished after $(Format-Elapsed -Elapsed $watch.Elapsed). Single-file bundling can take time, this is expected."
  }
  if ($exitCode -ne 0) {
    throw "Command failed ($exitCode): $File $($Args -join ' ')"
  }
}

function Copy-FileWithHeartbeat {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination,
    [Parameter(Mandatory = $true)][string]$Label,
    [int]$HeartbeatSeconds = 10
  )

  if (-not (Test-Path -LiteralPath $Source)) {
    throw "Missing source file: $Source"
  }

  Ensure-Dir -PathValue (Split-Path -Parent $Destination)

  $watch = [System.Diagnostics.Stopwatch]::StartNew()
  $job = Start-Job -ScriptBlock {
    param($Src, $Dst)
    Copy-Item -LiteralPath $Src -Destination $Dst -Force
  } -ArgumentList $Source, $Destination

  try {
    if ($HeartbeatSeconds -lt 1) {
      $HeartbeatSeconds = 1
    }
    while ($job.State -eq "Running" -or $job.State -eq "NotStarted") {
      Start-Sleep -Seconds $HeartbeatSeconds
      if ($job.State -eq "Running" -or $job.State -eq "NotStarted") {
        Write-Step "$Label still running ($(Format-Elapsed -Elapsed $watch.Elapsed) elapsed)..."
      }
    }

    Receive-Job -Job $job -Wait -ErrorAction Stop | Out-Null
  } finally {
    $watch.Stop()
    Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
  }

  if ($watch.Elapsed.TotalSeconds -ge 10) {
    Write-Step "$Label completed in $(Format-Elapsed -Elapsed $watch.Elapsed)"
  }
}

function Ensure-CleanDir([Parameter(Mandatory = $true)][string]$PathValue) {
  if (Test-Path -LiteralPath $PathValue) {
    Remove-Item -LiteralPath $PathValue -Recurse -Force
  }
  New-Item -ItemType Directory -Path $PathValue -Force | Out-Null
}

function Ensure-Dir([Parameter(Mandatory = $true)][string]$PathValue) {
  New-Item -ItemType Directory -Path $PathValue -Force | Out-Null
}

function Copy-Dir {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination
  )

  if (-not (Test-Path -LiteralPath $Source)) {
    throw "Missing source directory: $Source"
  }
  Ensure-Dir -PathValue $Destination
  $args = @(
    $Source,
    $Destination,
    "/MIR",
    "/R:1",
    "/W:1",
    "/NFL",
    "/NDL",
    "/NJH",
    "/NJS",
    "/NP"
  )
  $copyWatch = [System.Diagnostics.Stopwatch]::StartNew()
  $proc = Start-Process -FilePath "robocopy.exe" -ArgumentList $args -NoNewWindow -PassThru
  Wait-ProcessWithHeartbeat -Process $proc -Label "robocopy $Source -> $Destination" -Stopwatch $copyWatch -HeartbeatSeconds 10
  $copyWatch.Stop()
  $copyExitCode = 0
  try {
    $proc.Refresh()
    if ($null -ne $proc.ExitCode) {
      $copyExitCode = [int]$proc.ExitCode
    }
  } catch {
    $copyExitCode = 0
  }
  if ($copyWatch.Elapsed.TotalSeconds -ge 20) {
    Write-Step "robocopy completed in $([int]$copyWatch.Elapsed.TotalSeconds)s: $Source -> $Destination"
  }
  if ($copyExitCode -gt 7) {
    throw "robocopy failed ($copyExitCode): $Source -> $Destination"
  }
}

function Write-TextFile {
  param(
    [Parameter(Mandatory = $true)][string]$PathValue,
    [Parameter(Mandatory = $true)][string]$Content
  )

  Ensure-Dir -PathValue (Split-Path -Parent $PathValue)
  [System.IO.File]::WriteAllText($PathValue, $Content, [System.Text.Encoding]::UTF8)
}

function Resolve-PortableAppRoot {
  param([string]$BaseDir)

  if ([string]::IsNullOrWhiteSpace($BaseDir)) {
    throw "Portable base directory is empty."
  }

  $fullBaseDir = [System.IO.Path]::GetFullPath($BaseDir)
  $candidates = @(
    (Join-Path $fullBaseDir "app"),
    (Join-Path $fullBaseDir "Protocol-Bunker\app")
  )

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath (Join-Path $candidate "server\dist\index.js")) {
      return $candidate
    }
  }

  throw "Portable app runtime not found under base directory: $fullBaseDir"
}

function Add-AssetVariantToApp {
  param(
    [Parameter(Mandatory = $true)][string]$AssetsRoot,
    [Parameter(Mandatory = $true)][string]$AppAssetsRoot,
    [Parameter(Mandatory = $true)][string]$Variant
  )

  $srcDecksVariant = Join-Path $AssetsRoot "decks\$Variant"
  if (-not (Test-Path -LiteralPath $srcDecksVariant)) {
    throw "Missing asset variant directory: $srcDecksVariant"
  }

  $dstDecksRoot = Join-Path $AppAssetsRoot "decks"
  $dstDecksVariant = Join-Path $dstDecksRoot $Variant

  if (Test-Path -LiteralPath $dstDecksRoot) {
    Remove-Item -LiteralPath $dstDecksRoot -Recurse -Force
  }

  Ensure-Dir -PathValue $dstDecksRoot
  Copy-Dir -Source $srcDecksVariant -Destination $dstDecksVariant
  Write-TextFile -PathValue (Join-Path $AppAssetsRoot "ASSET_VARIANT") -Content "$Variant`n"
}

function Stop-WinExeFileLockProcesses {
  $roots = @(
    [System.IO.Path]::GetFullPath($PayloadRoot),
    [System.IO.Path]::GetFullPath($WinExePortableBaseRoot)
  )

  $stopped = 0
  $all = Get-Process -ErrorAction SilentlyContinue
  foreach ($proc in $all) {
    $procPath = $null
    try {
      $procPath = $proc.Path
    } catch {
      $procPath = $null
    }
    if ([string]::IsNullOrWhiteSpace($procPath)) {
      continue
    }

    $fullProcPath = $null
    try {
      $fullProcPath = [System.IO.Path]::GetFullPath($procPath)
    } catch {
      continue
    }

    $isMatch = $false
    foreach ($root in $roots) {
      if ($fullProcPath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
        $isMatch = $true
        break
      }
    }

    if (-not $isMatch) {
      continue
    }

    try {
      Stop-Process -Id $proc.Id -Force -ErrorAction Stop
      $stopped += 1
    } catch {
      # best effort
    }
  }

  if ($stopped -gt 0) {
    Write-Step "Stopped $stopped process(es) from win-exe artifacts to release file locks."
  }
}

function Find-7ZipExecutable {
  $candidates = @(
    "7z.exe",
    "C:\Program Files\7-Zip\7z.exe",
    "C:\Program Files (x86)\7-Zip\7z.exe"
  )

  foreach ($candidate in $candidates) {
    try {
      $cmd = Get-Command $candidate -ErrorAction Stop
      if ($cmd -and $cmd.Source) {
        return $cmd.Source
      }
    } catch {
      if (Test-Path -LiteralPath $candidate) {
        return $candidate
      }
    }
  }

  return $null
}

function Compress-ProtocolBunkerZip {
  param(
    [Parameter(Mandatory = $true)][string]$Destination
  )

  if (Test-Path -LiteralPath $Destination) {
    Remove-Item -LiteralPath $Destination -Force
  }

  $source = Join-Path $DistDir "Protocol-Bunker"
  $zipWatch = [System.Diagnostics.Stopwatch]::StartNew()
  $sevenZip = Find-7ZipExecutable
  if ($sevenZip) {
    Write-Step "Using 7-Zip backend: $sevenZip"
    $proc = Start-Process -FilePath $sevenZip -ArgumentList @(
      "a",
      "-tzip",
      "-mx=1",
      $Destination,
      "Protocol-Bunker"
    ) -WorkingDirectory $DistDir -NoNewWindow -PassThru
    Wait-ProcessWithHeartbeat -Process $proc -Label "7-Zip" -Stopwatch $zipWatch -HeartbeatSeconds 10
  } else {
    $compressArgs = @(
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy", "Bypass",
      "-Command",
      "`$ProgressPreference='SilentlyContinue'; Compress-Archive -Path '$source' -DestinationPath '$Destination' -Force"
    )
    $proc = Start-Process -FilePath "powershell.exe" -ArgumentList $compressArgs -NoNewWindow -PassThru
    Wait-ProcessWithHeartbeat -Process $proc -Label "Compress-Archive" -Stopwatch $zipWatch -HeartbeatSeconds 10
  }
  $zipWatch.Stop()

  $zipExitCode = 0
  try {
    $proc.Refresh()
    if ($null -ne $proc.ExitCode) {
      $zipExitCode = [int]$proc.ExitCode
    }
  } catch {
    $zipExitCode = 0
  }
  if ($zipExitCode -ne 0) {
    $backend = if ($sevenZip) { "7-Zip" } else { "Compress-Archive" }
    throw "$backend failed ($zipExitCode): $source -> $Destination"
  }

  if ($zipWatch.Elapsed.TotalSeconds -ge 20) {
    $backend = if ($sevenZip) { "7-Zip" } else { "Compress-Archive" }
    Write-Step "$backend completed in $(Format-Elapsed -Elapsed $zipWatch.Elapsed)"
  }
}

function Publish-DotnetSingleFile {
  param(
    [Parameter(Mandatory = $true)][string]$Project,
    [Parameter(Mandatory = $true)][string]$OutDir,
    [Parameter(Mandatory = $true)][string]$Label
  )

  Ensure-CleanDir -PathValue $OutDir
  Invoke-External -File "dotnet" -Args @(
    "publish",
    $Project,
    "-c", $Configuration,
    "-r", "win-x64",
    "--self-contained", "true",
    "--no-restore",
    "-p:SelfContained=true",
    "-p:UseAppHost=true",
    "-p:PublishSingleFile=true",
    "-p:PublishTrimmed=false",
    "-p:IncludeNativeLibrariesForSelfExtract=true",
    "-o", $OutDir
  ) -Label $Label
}

Write-Step "Building version: $VersionTag"

$ResolvedPortableBaseDir = if ([string]::IsNullOrWhiteSpace($PortableBaseDir)) {
  $WinExePortableBaseRoot
} else {
  [System.IO.Path]::GetFullPath($PortableBaseDir)
}

$PortableAppRoot = Resolve-PortableAppRoot -BaseDir $ResolvedPortableBaseDir

if ([string]::IsNullOrWhiteSpace($PortableBaseDir)) {
  Measure-Step -Name "prepare win portable base" -Action {
    $packWinArgs = @("scripts/pack-win-portable.mjs")
    if ($SkipBuild) {
      $packWinArgs += "--skip-build"
    } elseif ($Fast) {
      $packWinArgs += "--fast"
    }
    if ($ForceRepack) {
      $packWinArgs += "--force-repack"
    }
    $packWinArgs += "--out-root"
    $packWinArgs += $WinExePortableBaseRoot
    $packWinArgs += "--no-archive"
    Invoke-External -File "node" -Args $packWinArgs -Label "pack:win portable base for win-exe"
  }
} else {
  Write-Step "Reusing external portable base: $ResolvedPortableBaseDir"
}

Measure-Step -Name "sync launcher icons" -Action {
  & $SyncIconsScript
}

Measure-Step -Name "prepare output dirs" -Action {
  Stop-WinExeFileLockProcesses
  Ensure-Dir -PathValue $DistDir
  Ensure-CleanDir -PathValue $WorkDir
  Ensure-CleanDir -PathValue $PayloadRoot
  if (Test-Path -LiteralPath $ReleaseZipPath) {
    Remove-Item -LiteralPath $ReleaseZipPath -Force
  }
  if (Test-Path -LiteralPath $SetupExePath) {
    Remove-Item -LiteralPath $SetupExePath -Force
  }
}

Measure-Step -Name "copy app runtime" -Action {
  if (-not (Test-Path -LiteralPath $PortableAppRoot)) {
    throw "Missing portable app runtime: $PortableAppRoot"
  }
  Copy-Dir -Source $PortableAppRoot -Destination $AppRoot
  Add-AssetVariantToApp -AssetsRoot $AssetsSourceDir -AppAssetsRoot (Join-Path $AppRoot "assets") -Variant $AssetVariant
  Ensure-Dir -PathValue (Join-Path $AppRoot "logs")
  Ensure-Dir -PathValue (Join-Path $AppRoot "data")
  Copy-Dir -Source $IconsSourceDir -Destination (Join-Path $PayloadRoot "icons")
  Copy-Dir -Source $IconsSourceDir -Destination (Join-Path $AppRoot "icons")
}

Measure-Step -Name "write app portable.env and VERSION" -Action {
  $portableEnvContent = @"
PORT=8080
DEV_MODE=0
MODE=local
# MODE=domain
# DOMAIN=bunker.example.com
DOMAIN=
PUBLIC_HOST=
DATA_DIR=app/data
HOST_TOKEN=
VIEW_TOKEN=
EDIT_TOKEN=
ROOM_CODE=
"@
  Write-TextFile -PathValue (Join-Path $AppRoot "portable.env") -Content $portableEnvContent
  Write-TextFile -PathValue (Join-Path $AppRoot "VERSION") -Content "$VersionTag`n"
}

$updaterPublish = Join-Path $PublishDir "updater"
$launcherPublish = Join-Path $PublishDir "launcher"
$bootstrapperPublish = Join-Path $PublishDir "bootstrapper"

Measure-Step -Name "dotnet restore launcher/updater" -Action {
  Invoke-External -File "dotnet" -Args @("restore", $UpdaterProject, "-r", "win-x64") -Label "dotnet restore updater"
  Invoke-External -File "dotnet" -Args @("restore", $LauncherProject, "-r", "win-x64") -Label "dotnet restore launcher"
}

Measure-Step -Name "dotnet build launcher/updater" -Action {
  Invoke-External -File "dotnet" -Args @("build", $UpdaterProject, "-c", $Configuration, "-r", "win-x64", "--no-restore") -Label "dotnet build updater"
  Invoke-External -File "dotnet" -Args @("build", $LauncherProject, "-c", $Configuration, "-r", "win-x64", "--no-restore") -Label "dotnet build launcher"
}

Measure-Step -Name "dotnet publish updater" -Action {
  Publish-DotnetSingleFile -Project $UpdaterProject -OutDir $updaterPublish -Label "dotnet publish updater"
  Copy-FileWithHeartbeat -Source (Join-Path $updaterPublish "UpdaterHelper.exe") -Destination (Join-Path $PayloadRoot "UpdaterHelper.exe") -Label "copy UpdaterHelper.exe"
}

Measure-Step -Name "dotnet publish launcher" -Action {
  Publish-DotnetSingleFile -Project $LauncherProject -OutDir $launcherPublish -Label "dotnet publish launcher"
  Copy-FileWithHeartbeat -Source (Join-Path $launcherPublish "ProtocolBunker.exe") -Destination (Join-Path $PayloadRoot "ProtocolBunker.exe") -Label "copy ProtocolBunker.exe"
}

Measure-Step -Name "pack final zip" -Action {
  Stop-WinExeFileLockProcesses
  Compress-ProtocolBunkerZip -Destination $ReleaseZipPath
}

Measure-Step -Name "embed release zip into bootstrapper" -Action {
  Ensure-Dir -PathValue (Split-Path -Parent $BootstrapperEmbeddedPayload)
  Copy-FileWithHeartbeat -Source $ReleaseZipPath -Destination $BootstrapperEmbeddedPayload -Label "copy embedded payload.zip"
}

Measure-Step -Name "dotnet restore/build/publish bootstrapper" -Action {
  Invoke-External -File "dotnet" -Args @("restore", $BootstrapperProject, "-r", "win-x64") -Label "dotnet restore bootstrapper"
  Invoke-External -File "dotnet" -Args @("build", $BootstrapperProject, "-c", $Configuration, "-r", "win-x64", "--no-restore") -Label "dotnet build bootstrapper"
  Publish-DotnetSingleFile -Project $BootstrapperProject -OutDir $bootstrapperPublish -Label "dotnet publish bootstrapper"
  Copy-FileWithHeartbeat -Source (Join-Path $bootstrapperPublish "ProtocolBunkerSetup.exe") -Destination $SetupExePath -Label "copy ProtocolBunkerSetup.exe"
}

Write-Step "Build complete"
$outputs = @(
  $SetupExePath,
  (Join-Path $PayloadRoot "ProtocolBunker.exe"),
  (Join-Path $PayloadRoot "UpdaterHelper.exe"),
  $ReleaseZipPath,
  (Join-Path $AppRoot "VERSION")
)

foreach ($output in $outputs) {
  if (Test-Path -LiteralPath $output) {
    $item = Get-Item -LiteralPath $output
    if ($item.PSIsContainer) {
      Write-Host "[pack:win-exe] -> $output"
    } else {
      $sizeMb = [math]::Round($item.Length / 1MB, 2)
      Write-Host "[pack:win-exe] -> $output ($sizeMb MB)"
    }
  } else {
    Write-Host "[pack:win-exe] -> MISSING $output"
  }
}
