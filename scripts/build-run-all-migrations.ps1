#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Rebuild supabase/run_all_migrations.sql from migrations/*.sql (filename order).

.DESCRIPTION
  One-shot SQL for a fresh Supabase project. Does not include seed_*.sql / mockdata.sql.
  After rebuilding, sync the deliverable with .\sync-from-app.ps1

.EXAMPLE
  .\scripts\build-run-all-migrations.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$AppRoot = Split-Path -Parent $PSScriptRoot
$MigDir = Join-Path $AppRoot "supabase\migrations"
$OutFile = Join-Path $AppRoot "supabase\run_all_migrations.sql"
$Utf8 = New-Object System.Text.UTF8Encoding $false

if (-not (Test-Path -LiteralPath $MigDir)) {
  throw "Migrations folder not found: $MigDir"
}

$files = Get-ChildItem -LiteralPath $MigDir -Filter "*.sql" | Sort-Object Name
if ($files.Count -eq 0) {
  throw "No migration SQL files found in $MigDir"
}

$sb = New-Object System.Text.StringBuilder

[void]$sb.AppendLine("-- ============================================================")
[void]$sb.AppendLine("-- Florian - run ALL migrations (fresh Supabase project)")
[void]$sb.AppendLine("-- ============================================================")
[void]$sb.AppendLine("-- Paste this entire file into Supabase SQL Editor and run it.")
[void]$sb.AppendLine("-- Safe for empty projects only (do not re-run on an existing DB).")
[void]$sb.AppendLine("--")
[void]$sb.AppendLine("-- Generated from supabase/migrations/*.sql in filename order.")
[void]$sb.AppendLine("-- Rebuild: .\scripts\build-run-all-migrations.ps1")
[void]$sb.AppendLine("-- Then sync deliverable: .\sync-from-app.ps1")
[void]$sb.AppendLine("--")
[void]$sb.AppendLine("-- Includes $($files.Count) files:")
foreach ($f in $files) {
  [void]$sb.AppendLine("--   - $($f.Name)")
}
[void]$sb.AppendLine("-- ============================================================")
[void]$sb.AppendLine("")

foreach ($f in $files) {
  [void]$sb.AppendLine("")
  [void]$sb.AppendLine("-- ############################################################")
  [void]$sb.AppendLine("-- >>> $($f.Name)")
  [void]$sb.AppendLine("-- ############################################################")
  [void]$sb.AppendLine("")
  $content = [System.IO.File]::ReadAllText($f.FullName).TrimEnd()
  [void]$sb.AppendLine($content)
  [void]$sb.AppendLine("")
}

[System.IO.File]::WriteAllText($OutFile, $sb.ToString(), $Utf8)

Write-Host "Rebuilt: $OutFile"
Write-Host "Migrations included: $($files.Count)"
Write-Host "Size: $((Get-Item -LiteralPath $OutFile).Length) bytes"
