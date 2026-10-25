[CmdletBinding()]
param(
    [Alias('SecretsFile')]
    [string]$EnvFile
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not $EnvFile) { $EnvFile = Join-Path $Root '.env' }
. (Join-Path $PSScriptRoot 'environment.ps1')
. (Join-Path $PSScriptRoot 'ports.ps1')
$state = Join-Path $PSScriptRoot '.state'
[void][IO.Directory]::CreateDirectory($state)
$lock = [IO.File]::Open((Join-Path $state 'ports.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
try {
    Enable-LocalAccess (Read-DeploymentEnvironment $EnvFile)
} finally {
    $lock.Dispose()
}
