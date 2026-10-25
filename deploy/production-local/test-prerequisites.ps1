# Offline bootstrap tests: never invoke WinGet or modify installed tools.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'deploy.ps1'), [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
foreach ($name in @('Update-ProcessPath', 'Ensure-Kind')) {
    $node = $ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name}, $true)
    Invoke-Expression $node.Extent.Text
}
# Exercise actual PATH refresh separately, preserving process-only additions.
$originalPath = $env:Path
try {
    $env:Path = 'RELOOP_TEST_SESSION_ENTRY'
    Update-ProcessPath
    if (($env:Path -split ';') -notcontains 'RELOOP_TEST_SESSION_ENTRY') { throw 'Session PATH entry lost.' }
    foreach ($scope in @('User', 'Machine')) {
        $persisted = [Environment]::GetEnvironmentVariable('Path', $scope)
        if ($persisted -and -not $env:Path.Contains($persisted)) { throw "Persisted $scope PATH not refreshed." }
    }
    Write-Host 'PASS: PATH refresh preserves session entries and reads persisted paths'
} finally { $env:Path = $originalPath }

$originalOS = $env:OS
$script:Calls = New-Object 'Collections.Generic.List[string]'
$script:Available = $false
$script:Mode = ''
function Get-Command {
    param([string]$Name, [string]$ErrorAction)
    if ($Name -eq 'kind' -and $script:Available) { return @{Name = 'kind'} }
    if ($Name -eq 'winget' -and $script:Mode -ne 'no-winget') { return @{Name = 'winget'} }
}
function Update-ProcessPath {
    $script:Calls.Add('refresh-path')
    if ($script:Mode -eq 'stale-path') { $script:Available = $true }
}
function Invoke-Native {
    param([string]$Program, [string[]]$Arguments)
    $script:Calls.Add($Program + ' ' + ($Arguments -join ' '))
    if ($Program -eq 'winget') {
        if ($script:Mode -eq 'install-failure') { throw 'winget failed (7)' }
        if ($script:Mode -ne 'not-on-path') { $script:Available = $true }
    }
    if ($Program -eq 'kind' -and $script:Mode -eq 'broken-kind') { throw 'kind failed (1)' }
}
function Run-Scenario {
    param([string]$Mode, [bool]$AlreadyInstalled, [string]$ExpectedError = '')
    $script:Mode = $Mode
    $script:Available = $AlreadyInstalled
    $script:Calls.Clear()
    $env:OS = if ($Mode -eq 'non-windows') { 'Other' } else { 'Windows_NT' }
    $message = ''
    try { Ensure-Kind } catch { $message = $_.Exception.Message }
    if ($ExpectedError) {
        if ($message -notmatch $ExpectedError) { throw "Expected $ExpectedError but got: $message" }
        if ($Mode -ne 'broken-kind' -and @($script:Calls | Where-Object { $_ -like 'kind *' }).Count) { throw 'Used kind after failed setup.' }
    } else {
        if ($message) { throw $message }
        if (@($script:Calls | Where-Object { $_ -eq 'kind version' }).Count -ne 1) { throw 'Version was not checked.' }
    }
    $installs = @($script:Calls | Where-Object { $_ -like 'winget *' })
    if ($Mode -in @('existing', 'stale-path', 'no-winget', 'non-windows', 'broken-kind') -and $installs.Count) { throw 'Unexpected installation.' }
    if ($Mode -eq 'install') {
        if ($installs.Count -ne 1) { throw 'Expected exactly one installation.' }
        if ($installs[0] -ne 'winget install --id Kubernetes.kind --exact --source winget --scope user --accept-source-agreements --accept-package-agreements --disable-interactivity') { throw 'Unexpected package or installer flags.' }
        if ($script:Calls[$script:Calls.Count - 2] -ne 'refresh-path') { throw 'PATH must refresh before verification.' }
    }
    Write-Host "PASS: kind bootstrap $Mode"
}
try {
    Run-Scenario 'existing' $true
    Run-Scenario 'stale-path' $false
    Run-Scenario 'install' $false
    Run-Scenario 'no-winget' $false 'Missing kind and WinGet'
    Run-Scenario 'install-failure' $false 'winget failed'
    Run-Scenario 'not-on-path' $false 'kind is not available'
    Run-Scenario 'non-windows' $false 'requires Windows'
    Run-Scenario 'broken-kind' $true 'kind failed'
} finally { $env:OS = $originalOS }
