param(
  [string]$Configuration = "Release",
  [switch]$SkipBuild,
  [switch]$Fast,
  [switch]$ForceRepack,
  [switch]$NoArchive,
  [switch]$NoSetup,
  [string]$PortableBaseDir,
  [string]$AssetVariant = "1x",
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ExtraArgs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Script = Join-Path $PSScriptRoot "build\pack-release.ps1"
if (-not (Test-Path -LiteralPath $Script)) {
  throw "Missing script: $Script"
}

$StopProjectProcesses = Join-Path $PSScriptRoot "..\scripts\stop-project-processes.ps1"
if (Test-Path -LiteralPath $StopProjectProcesses) {
  & $StopProjectProcesses -ResetAttributes -Quiet
}

if ($ExtraArgs) {
  if ($ExtraArgs -contains "--skip-build") { $SkipBuild = $true }
  if ($ExtraArgs -contains "--fast") { $Fast = $true }
  if ($ExtraArgs -contains "--force-repack") { $ForceRepack = $true }
  if ($ExtraArgs -contains "--no-archive") { $NoArchive = $true }
  if ($ExtraArgs -contains "--no-setup") { $NoSetup = $true }
}

$invokeArgs = @{
  Configuration = $Configuration
  SkipBuild = $SkipBuild
  Fast = $Fast
  ForceRepack = $ForceRepack
  NoArchive = $NoArchive
  NoSetup = $NoSetup
  AssetVariant = $AssetVariant
}

if (-not [string]::IsNullOrWhiteSpace($PortableBaseDir)) {
  $invokeArgs.PortableBaseDir = $PortableBaseDir
}

& $Script @invokeArgs
