Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$RootDir = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$SourceDir = Join-Path $RootDir "icons"
$TargetDir = Join-Path $RootDir "win-exe\assets\icons"

if (-not (Test-Path -LiteralPath $SourceDir)) {
  throw "Missing source icons folder: $SourceDir"
}

New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
Copy-Item -Path (Join-Path $SourceDir "*") -Destination $TargetDir -Force

function Get-PngSize {
  param([byte[]]$Bytes)

  if ($Bytes.Length -lt 24) {
    throw "PNG data is too short."
  }

  $width = ($Bytes[16] -shl 24) -bor ($Bytes[17] -shl 16) -bor ($Bytes[18] -shl 8) -bor $Bytes[19]
  $height = ($Bytes[20] -shl 24) -bor ($Bytes[21] -shl 16) -bor ($Bytes[22] -shl 8) -bor $Bytes[23]
  return @{ Width = $width; Height = $height }
}

function New-IcoFromEntries {
  param(
    [string]$OutputPath,
    [object[]]$Entries
  )

  if ($Entries.Count -eq 0) {
    throw "No icon entries available for $OutputPath"
  }

  $stream = [System.IO.File]::Open($OutputPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::Read)
  $writer = New-Object System.IO.BinaryWriter($stream)
  try {
    $writer.Write([UInt16]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]$Entries.Count)

    $offset = 6 + (16 * $Entries.Count)
    foreach ($entry in $Entries) {
      $widthByte = if ($entry.Width -ge 256) { 0 } else { [byte]$entry.Width }
      $heightByte = if ($entry.Height -ge 256) { 0 } else { [byte]$entry.Height }

      $writer.Write([byte]$widthByte)
      $writer.Write([byte]$heightByte)
      $writer.Write([byte]0)
      $writer.Write([byte]0)
      $writer.Write([UInt16]1)
      $writer.Write([UInt16]32)
      $writer.Write([UInt32]([byte[]]$entry.Bytes).Length)
      $writer.Write([UInt32]$offset)

      $offset += ([byte[]]$entry.Bytes).Length
    }

    foreach ($entry in $Entries) {
      $writer.Write([byte[]]$entry.Bytes)
    }
  }
  finally {
    $writer.Dispose()
    $stream.Dispose()
  }
}

function Get-BaseIconPngPath {
  param([string]$Dir)

  $candidates = @(
    (Join-Path $Dir "icon-1024x1024.png"),
    (Join-Path $Dir "icon-512x512.png"),
    (Join-Path $Dir "icon-256x256.png"),
    (Join-Path $Dir "favicon-48x48.png")
  )

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  throw "No source PNG found for ICO generation in $Dir"
}

function New-PngBytesFromSize {
  param(
    [System.Drawing.Image]$BaseImage,
    [int]$Size
  )

  $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.DrawImage($BaseImage, 0, 0, $Size, $Size)

    $memory = New-Object System.IO.MemoryStream
    try {
      $bitmap.Save($memory, [System.Drawing.Imaging.ImageFormat]::Png)
      return ,$memory.ToArray()
    }
    finally {
      $memory.Dispose()
    }
  }
  finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

$requiredSizes = @(16, 20, 24, 32, 40, 48, 64, 128, 256)
$basePng = Get-BaseIconPngPath -Dir $TargetDir
$entries = @()

$baseImage = [System.Drawing.Image]::FromFile($basePng)
try {
  foreach ($size in $requiredSizes) {
    $bytes = New-PngBytesFromSize -BaseImage $baseImage -Size $size
    $entries += [PSCustomObject]@{
      Bytes  = $bytes
      Width  = $size
      Height = $size
    }

    $resizedPath = Join-Path $TargetDir ("app-{0}x{0}.png" -f $size)
    [System.IO.File]::WriteAllBytes($resizedPath, $bytes)
  }
}
finally {
  $baseImage.Dispose()
}

$entries = $entries | Sort-Object Width
New-IcoFromEntries -OutputPath (Join-Path $TargetDir "app.ico") -Entries $entries

if (-not (Test-Path -LiteralPath (Join-Path $TargetDir "favicon.ico"))) {
  Write-Host "[win-exe] Warning: source favicon.ico is missing; using generated app.ico"
}

Write-Host "[win-exe] Icons synced to $TargetDir (app.ico generated with multi-size layers)"
