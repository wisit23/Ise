[CmdletBinding()]
param([switch]$Migrate, [string]$ResumeBackup)
$ErrorActionPreference = 'Stop'
$arguments = @((Join-Path $PSScriptRoot 'kind-local.py'))
if ($Migrate) { $arguments += '--migrate' }
if ($ResumeBackup) { $arguments += @('--resume', $ResumeBackup) }
& python @arguments
if ($LASTEXITCODE -ne 0) { throw 'kind local setup failed. See the error and deploy/kind-local.md; do not delete clusters or volumes.' }
