# Build square PWA icons from the Florian lockup (contain on white, no stretch).
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent
$src = Join-Path $root "public\brand\logo.jpeg"
$brandDir = Join-Path $root "public\brand"
$publicDir = Join-Path $root "public"
if (-not (Test-Path -LiteralPath $src)) { throw "Missing $src" }

function Save-Contained([int]$size, [string]$dest) {
  $img = [System.Drawing.Image]::FromFile($src)
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.Clear([System.Drawing.Color]::White)
  $pad = [int]($size * 0.08)
  $maxW = $size - (2 * $pad)
  $maxH = $size - (2 * $pad)
  $scale = [Math]::Min($maxW / $img.Width, $maxH / $img.Height)
  $w = [int]($img.Width * $scale)
  $h = [int]($img.Height * $scale)
  $x = [int](($size - $w) / 2)
  $y = [int](($size - $h) / 2)
  $g.DrawImage($img, $x, $y, $w, $h)
  $bmp.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $img.Dispose()
}

Save-Contained 192 (Join-Path $brandDir "icon-192.png")
Save-Contained 512 (Join-Path $brandDir "icon-512.png")
Copy-Item -Force (Join-Path $brandDir "icon-192.png") (Join-Path $publicDir "apple-touch-icon.png")
Write-Host "Wrote Florian PWA icons from public/brand/logo.jpeg"
