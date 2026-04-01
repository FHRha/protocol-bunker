param(
  [string]$Configuration = "Release",
  [switch]$SkipBuild,
  [switch]$Fast,
  [switch]$ForceRepack,
  [switch]$NoArchive,
  [switch]$NoSetup,
  [string]$PortableBaseDir,
  [string]$AssetVariant = "1x"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RootDir = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$RootPackageJson = Join-Path $RootDir "package.json"
$DistDir = Join-Path $RootDir "artifacts\win-desktop"
$WorkDir = Join-Path $DistDir "_work"
$PortableBaseRoot = Join-Path $DistDir "_b"
$PayloadRoot = Join-Path $DistDir "Protocol-Bunker"
$AppRoot = Join-Path $PayloadRoot "app"
$PublishDir = Join-Path $WorkDir "publish"
$IconsSourceDir = Join-Path $RootDir "icons"
$AssetsSourceDir = Join-Path $RootDir "assets"

$LauncherProject = Join-Path $RootDir "win-desktop\src\ProtocolBunker.Desktop.App\ProtocolBunker.Desktop.App.csproj"
$SetupProject = Join-Path $RootDir "win-desktop\src\ProtocolBunker.Desktop.Setup\ProtocolBunker.Desktop.Setup.csproj"
$UpdaterProject = Join-Path $RootDir "win-desktop\src\ProtocolBunker.Desktop.UpdateHelper\ProtocolBunker.Desktop.UpdateHelper.csproj"
$SetupEmbeddedPayload = Join-Path $RootDir "win-desktop\src\ProtocolBunker.Desktop.Setup\Embedded\payload.zip"
$LauncherLocalizationDir = Join-Path $RootDir "win-desktop\src\ProtocolBunker.Desktop.App\Localization"
$LauncherAsciiDir = Join-Path $RootDir "win-desktop\src\ProtocolBunker.Desktop.App\AsciiAnimations"

function Write-Step([string]$Message) {
  Write-Host "[pack:desktop] $Message"
}

function Ensure-Dir([string]$PathValue) {
  New-Item -ItemType Directory -Path $PathValue -Force | Out-Null
}

function Ensure-CleanDir([string]$PathValue) {
  if (Test-Path -LiteralPath $PathValue) {
    Remove-Item -LiteralPath $PathValue -Recurse -Force
  }
  New-Item -ItemType Directory -Path $PathValue -Force | Out-Null
}

function Resolve-VersionTag {
  $json = Get-Content -LiteralPath $RootPackageJson -Raw | ConvertFrom-Json
  $version = [string]$json.version
  if ([string]::IsNullOrWhiteSpace($version)) {
    throw "Root package.json has empty version."
  }
  $trimmed = $version.Trim()
  if ($trimmed.StartsWith('v')) { return $trimmed }
  return "v$trimmed"
}

$VersionTag = Resolve-VersionTag
$ReleaseZipPath = Join-Path $DistDir "protocol-bunker-win-x64-desktop-$VersionTag.zip"
$SetupExePath = Join-Path $DistDir "protocol-bunker-win-x64-desktop-setup-$VersionTag.exe"

function Invoke-External([string]$File, [string[]]$Arguments, [string]$WorkingDirectory = $RootDir) {
  Write-Host "[pack:desktop] > $File $($Arguments -join ' ')"
  $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
  Push-Location $WorkingDirectory
  try {
    & $File @Arguments
    $exitCode = $LASTEXITCODE
  } finally {
    Pop-Location
    $stopwatch.Stop()
  }

  if ($exitCode -ne 0) {
    throw "Command failed ($exitCode): $File $($Arguments -join ' ')"
  }

  Write-Host "[pack:desktop] < completed in $([Math]::Round($stopwatch.Elapsed.TotalSeconds, 1))s"
}

function Sync-Icons {
  $syncIconsMjs = Join-Path $RootDir 'scripts\sync-icons.mjs'
  if (-not (Test-Path -LiteralPath $syncIconsMjs)) {
    throw "Missing icon sync script: $syncIconsMjs"
  }

  Invoke-External -File 'node' -Arguments @($syncIconsMjs)
}

function Copy-Dir([string]$Source, [string]$Destination) {
  if (-not (Test-Path -LiteralPath $Source)) {
    throw "Missing source directory: $Source"
  }
  Ensure-Dir $Destination
  robocopy.exe $Source $Destination /MIR /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -gt 7) {
    throw "robocopy failed ($LASTEXITCODE): $Source -> $Destination"
  }
}

function Resolve-PortableAppRoot([string]$BaseDir) {
  $fullBaseDir = [System.IO.Path]::GetFullPath($BaseDir)
  $candidates = @(
    (Join-Path $fullBaseDir 'app'),
    (Join-Path $fullBaseDir 'Protocol-Bunker\app')
  )

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath (Join-Path $candidate 'server\dist\index.js')) {
      return $candidate
    }
  }

  throw "Portable app runtime not found under base directory: $fullBaseDir"
}

function Add-AssetVariantToApp([string]$AssetsRoot, [string]$AppAssetsRoot, [string]$Variant) {
  $srcDecksVariant = Join-Path $AssetsRoot "decks\$Variant"
  if (-not (Test-Path -LiteralPath $srcDecksVariant)) {
    throw "Missing asset variant directory: $srcDecksVariant"
  }

  $dstDecksRoot = Join-Path $AppAssetsRoot 'decks'
  $dstDecksVariant = Join-Path $dstDecksRoot $Variant
  if (Test-Path -LiteralPath $dstDecksRoot) {
    Remove-Item -LiteralPath $dstDecksRoot -Recurse -Force
  }
  Ensure-Dir $dstDecksRoot
  Copy-Dir $srcDecksVariant $dstDecksVariant
  [System.IO.File]::WriteAllText((Join-Path $AppAssetsRoot 'ASSET_VARIANT'), "$Variant`n", [System.Text.Encoding]::UTF8)
}

function Find-7ZipExecutable {
  $candidates = @('7z.exe', 'C:\Program Files\7-Zip\7z.exe', 'C:\Program Files (x86)\7-Zip\7z.exe')
  foreach ($candidate in $candidates) {
    try {
      $cmd = Get-Command $candidate -ErrorAction Stop
      if ($cmd.Source) { return $cmd.Source }
    } catch {
      if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
  }
  return $null
}

function Compress-ProtocolBunkerZip([string]$Destination) {
  if (Test-Path -LiteralPath $Destination) {
    Remove-Item -LiteralPath $Destination -Force
  }
  $sevenZip = Find-7ZipExecutable
  if ($sevenZip) {
    Invoke-External -File $sevenZip -Arguments @('a', '-tzip', '-mx=1', $Destination, 'Protocol-Bunker') -WorkingDirectory $DistDir
  } else {
    Compress-Archive -Path (Join-Path $DistDir 'Protocol-Bunker') -DestinationPath $Destination -Force
  }
}

function Publish-DotnetSingleFile([string]$Project, [string]$OutDir) {
  Ensure-CleanDir $OutDir
  Invoke-External 'dotnet' @(
    'publish', $Project,
    '-c', $Configuration,
    '-r', 'win-x64',
    '--self-contained', 'true',
    '--no-restore',
    '-p:SelfContained=true',
    '-p:UseAppHost=true',
    '-p:PublishSingleFile=true',
    '-p:PublishTrimmed=false',
    '-p:DebugType=None',
    '-p:DebugSymbols=false',
    '-p:IncludeNativeLibrariesForSelfExtract=true',
    '-o', $OutDir
  )
}

$ResolvedPortableBaseDir = if ([string]::IsNullOrWhiteSpace($PortableBaseDir)) { $PortableBaseRoot } else { [System.IO.Path]::GetFullPath($PortableBaseDir) }

if ([string]::IsNullOrWhiteSpace($PortableBaseDir)) {
  Write-Step 'Preparing Windows portable base'
  $packWinArgs = @('scripts/pack-win-portable.mjs')
  if ($SkipBuild) { $packWinArgs += '--skip-build' }
  elseif ($Fast) { $packWinArgs += '--fast' }
  if ($ForceRepack) { $packWinArgs += '--force-repack' }
  $packWinArgs += '--out-root'; $packWinArgs += $PortableBaseRoot
  $packWinArgs += '--no-archive'
  Invoke-External -File 'node' -Arguments $packWinArgs
} else {
  Write-Step "Reusing external portable base: $ResolvedPortableBaseDir"
}

Write-Step 'Resolving portable app runtime'
$PortableAppRoot = Resolve-PortableAppRoot $ResolvedPortableBaseDir

Write-Step "Building version: $VersionTag"
Sync-Icons
Write-Step 'Preparing output directories'
Ensure-Dir $DistDir
Ensure-CleanDir $WorkDir
Ensure-CleanDir $PayloadRoot
if (Test-Path $ReleaseZipPath) { Remove-Item $ReleaseZipPath -Force }
if (Test-Path $SetupExePath) { Remove-Item $SetupExePath -Force }

Write-Step 'Copying portable app payload'
Copy-Dir $PortableAppRoot $AppRoot
Write-Step "Applying asset variant: $AssetVariant"
Add-AssetVariantToApp $AssetsSourceDir (Join-Path $AppRoot 'assets') $AssetVariant
Ensure-Dir (Join-Path $AppRoot 'logs')
Ensure-Dir (Join-Path $AppRoot 'data')
Write-Step 'Copying icon assets'
Copy-Dir $IconsSourceDir (Join-Path $PayloadRoot 'icons')
Copy-Dir $IconsSourceDir (Join-Path $AppRoot 'icons')

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
[System.IO.File]::WriteAllText((Join-Path $AppRoot 'portable.env'), $portableEnvContent, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText((Join-Path $AppRoot 'VERSION'), "$VersionTag`n", [System.Text.Encoding]::UTF8)

$updaterPublish = Join-Path $PublishDir 'updater'
$launcherPublish = Join-Path $PublishDir 'launcher'
$setupPublish = Join-Path $PublishDir 'setup'

Write-Step 'Restoring updater helper'
Invoke-External -File 'dotnet' -Arguments @('restore', $UpdaterProject, '-r', 'win-x64')
Write-Step 'Restoring desktop launcher'
Invoke-External -File 'dotnet' -Arguments @('restore', $LauncherProject, '-r', 'win-x64')

Write-Step 'Publishing updater helper'
Publish-DotnetSingleFile $UpdaterProject $updaterPublish
Copy-Item -LiteralPath (Join-Path $updaterPublish 'UpdaterHelper.exe') -Destination (Join-Path $PayloadRoot 'UpdaterHelper.exe') -Force

Write-Step 'Publishing desktop launcher'
Publish-DotnetSingleFile $LauncherProject $launcherPublish
Copy-Item -LiteralPath (Join-Path $launcherPublish 'ProtocolBunker.exe') -Destination (Join-Path $PayloadRoot 'ProtocolBunker.exe') -Force
Write-Step 'Copying launcher support directories'
if (Test-Path $LauncherLocalizationDir) {
  Copy-Item -LiteralPath $LauncherLocalizationDir -Destination (Join-Path $PayloadRoot 'Localization') -Recurse -Force
} elseif (Test-Path (Join-Path $launcherPublish 'Localization')) {
  Copy-Item -LiteralPath (Join-Path $launcherPublish 'Localization') -Destination (Join-Path $PayloadRoot 'Localization') -Recurse -Force
}
if (Test-Path $LauncherAsciiDir) {
  Copy-Item -LiteralPath $LauncherAsciiDir -Destination (Join-Path $PayloadRoot 'AsciiAnimations') -Recurse -Force
} elseif (Test-Path (Join-Path $launcherPublish 'AsciiAnimations')) {
  Copy-Item -LiteralPath (Join-Path $launcherPublish 'AsciiAnimations') -Destination (Join-Path $PayloadRoot 'AsciiAnimations') -Recurse -Force
}

if (-not $NoArchive) {
  Write-Step 'Creating desktop archive'
  Compress-ProtocolBunkerZip $ReleaseZipPath
}

if (-not $NoSetup) {
  if ($NoArchive) {
    throw "Setup packaging requires archive generation. Remove -NoArchive or add -NoSetup."
  }

  Write-Step 'Preparing setup payload'
  Ensure-Dir (Split-Path -Parent $SetupEmbeddedPayload)
  Copy-Item -LiteralPath $ReleaseZipPath -Destination $SetupEmbeddedPayload -Force

  Write-Step 'Restoring desktop setup'
  Invoke-External -File 'dotnet' -Arguments @('restore', $SetupProject, '-r', 'win-x64')
  Write-Step 'Publishing desktop setup'
  Publish-DotnetSingleFile $SetupProject $setupPublish
  Copy-Item -LiteralPath (Join-Path $setupPublish 'ProtocolBunkerSetup.exe') -Destination $SetupExePath -Force
}

Write-Step 'Build complete'
