param(
  [string]$Configuration = "Release",
  [switch]$SkipBuild,
  [switch]$Fast,
  [switch]$ForceRepack,
  [string]$PortableBaseDir,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ExtraArgs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Script = Join-Path $PSScriptRoot "build\pack-release.ps1"
if (-not (Test-Path -LiteralPath $Script)) {
  throw "Missing script: $Script"
}

if ($ExtraArgs) {
  if ($ExtraArgs -contains "--skip-build") { $SkipBuild = $true }
  if ($ExtraArgs -contains "--fast") { $Fast = $true }
  if ($ExtraArgs -contains "--force-repack") { $ForceRepack = $true }
}

& $Script -Configuration $Configuration -SkipBuild:$SkipBuild -Fast:$Fast -ForceRepack:$ForceRepack -PortableBaseDir $PortableBaseDir
