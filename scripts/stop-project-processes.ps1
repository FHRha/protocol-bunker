param(
  [switch]$ResetAttributes,
  [switch]$Quiet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$CurrentPid = $PID
$CurrentProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $CurrentPid" -ErrorAction SilentlyContinue
$ParentPid = if ($null -ne $CurrentProcess) { [int]$CurrentProcess.ParentProcessId } else { -1 }

$projectRoots = @(
  $RepoRoot,
  (Join-Path $RepoRoot "artifacts"),
  (Join-Path $RepoRoot "artifacts\win"),
  (Join-Path $RepoRoot "artifacts\win-desktop"),
  (Join-Path $RepoRoot "win-desktop")
) | ForEach-Object {
  try { [System.IO.Path]::GetFullPath($_) } catch { $null }
} | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique

$candidateNames = @(
  "ProtocolBunker.exe",
  "ProtocolBunkerSetup.exe",
  "UpdaterHelper.exe",
  "dotnet.exe",
  "testhost.exe",
  "node.exe",
  "cmd.exe",
  "powershell.exe",
  "pwsh.exe"
)

function Write-Log([string]$Message) {
  if (-not $Quiet) {
    Write-Host "[stop-project-processes] $Message"
  }
}

function Is-ProjectProcess($proc) {
  if ($null -eq $proc) {
    return $false
  }

  if ($proc.ProcessId -eq $CurrentPid -or $proc.ProcessId -eq $ParentPid) {
    return $false
  }

  $name = [string]$proc.Name
  if (-not ($candidateNames -contains $name)) {
    return $false
  }

  $parts = @()
  if ($proc.ExecutablePath) { $parts += [string]$proc.ExecutablePath }
  if ($proc.CommandLine) { $parts += [string]$proc.CommandLine }
  if ($parts.Count -eq 0) {
    return $false
  }

  foreach ($part in $parts) {
    foreach ($root in $projectRoots) {
      if ($part.IndexOf($root, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
        return $true
      }
    }
  }

  return $false
}

$stopped = New-Object System.Collections.Generic.List[string]
$failed = New-Object System.Collections.Generic.List[string]

$processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue
foreach ($proc in $processes) {
  if (-not (Is-ProjectProcess $proc)) {
    continue
  }

  try {
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
    $stopped.Add("$($proc.ProcessId) $($proc.Name)")
  } catch {
    $failed.Add("$($proc.ProcessId) $($proc.Name): $($_.Exception.Message)")
  }
}

if ($ResetAttributes) {
  foreach ($path in @("artifacts", "win-desktop")) {
    $fullPath = Join-Path $RepoRoot $path
    if (-not (Test-Path -LiteralPath $fullPath)) {
      continue
    }

    try {
      cmd /c "attrib -R `"$fullPath\*`" /S /D" | Out-Null
    } catch {
      Write-Log ("Failed to reset attributes for {0}: {1}" -f $path, $_.Exception.Message)
    }
  }
}

if ($stopped.Count -gt 0) {
  Write-Log ("Stopped: " + ($stopped -join ", "))
} else {
  Write-Log "No project-scoped processes were running."
}

if ($failed.Count -gt 0) {
  Write-Log ("Failed: " + ($failed -join "; "))
}
