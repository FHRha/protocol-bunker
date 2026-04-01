param(
  [string]$TargetPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Test-IsAdmin {
  $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdmin)) {
  throw "Run this script from an elevated PowerShell window."
}

$resolvedTarget = [System.IO.Path]::GetFullPath($TargetPath)
if (-not (Test-Path -LiteralPath $resolvedTarget)) {
  throw "Target path does not exist: $resolvedTarget"
}

$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name

Write-Host "[fix-repo-acl] Target: $resolvedTarget"
Write-Host "[fix-repo-acl] User: $currentUser"

cmd /c "takeown /F ""$resolvedTarget"" /R /D Y" | Out-Host
cmd /c "icacls ""$resolvedTarget"" /inheritance:e /grant:r ""$currentUser"":(OI)(CI)F /T /C" | Out-Host
cmd /c "attrib -R ""$resolvedTarget\*"" /S /D" | Out-Host

Write-Host "[fix-repo-acl] Done."
