param(
  [string]$Configuration = "Release"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RootDir = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$LauncherProject = Join-Path $RootDir "win-exe\src\ProtocolBunker.Launcher\ProtocolBunker.Launcher.csproj"
$OutDir = Join-Path $RootDir "win-exe\dist"
$PublishDir = Join-Path $OutDir "_publish"
$IconsDir = Join-Path $RootDir "win-exe\assets\icons"

& (Join-Path $PSScriptRoot "sync-icons.ps1")

if (Test-Path -LiteralPath $OutDir) {
  Remove-Item -LiteralPath $OutDir -Recurse -Force
}
New-Item -ItemType Directory -Path $PublishDir -Force | Out-Null

Write-Host "[win-exe] Publishing launcher..."
dotnet publish $LauncherProject `
  -c $Configuration `
  -r win-x64 `
  --self-contained true `
  -p:PublishSingleFile=true `
  -p:PublishTrimmed=false `
  -p:IncludeNativeLibrariesForSelfExtract=true `
  -o $PublishDir

Copy-Item -LiteralPath (Join-Path $PublishDir "ProtocolBunker.exe") -Destination (Join-Path $OutDir "ProtocolBunker.exe") -Force
Copy-Item -LiteralPath $IconsDir -Destination (Join-Path $OutDir "icons") -Recurse -Force

Write-Host "[win-exe] Launcher build completed:"
Write-Host " - $(Join-Path $OutDir "ProtocolBunker.exe")"
Write-Host " - $(Join-Path $OutDir "icons")"
