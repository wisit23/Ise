# Offline script regression tests. All mutating Docker/kind/kubectl calls are mocked.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$Deploy = Join-Path $PSScriptRoot 'deploy.ps1'
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$Apps = @('auth-service', 'product-service', 'order-service', 'support-service', 'chat-service', 'gateway', 'frontend')
$tokens = $null; $parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($Deploy, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
$functionAst = $ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Get-SchemaHash'}, $true)
Invoke-Expression $functionAst.Extent.Text
$global:ExpectedHash = Get-SchemaHash
$global:RealKubectl = (Get-Command kubectl).Source
$global:Calls = New-Object 'Collections.Generic.List[string]'
$global:Mode = 'normal'
$global:RenderedJobs = New-Object 'Collections.Generic.List[object]'
$fixture = Join-Path ([IO.Path]::GetTempPath()) ("reloop-test-" + [Guid]::NewGuid().ToString('N') + '.env')
$envText = @'
POSTGRES_PASSWORD=ci-test-only-password
JWT_ACCESS_SECRET=ci-test-only-access
JWT_REFRESH_SECRET=ci-test-only-refresh
INTERNAL_SERVICE_TOKEN=ci-test-only-internal
DATABASE_URL_AUTH=postgresql://reloop:ci-test-only-password@postgres:5432/reloop_auth
DATABASE_URL_PRODUCT=postgresql://reloop:ci-test-only-password@postgres:5432/reloop_product
DATABASE_URL_ORDER=postgresql://reloop:ci-test-only-password@postgres:5432/reloop_order
DATABASE_URL_SUPPORT=postgresql://reloop:ci-test-only-password@postgres:5432/reloop_support
DATABASE_URL_CHAT=mongodb://mongo:27017/reloop_chat?replicaSet=rs0&directConnection=true
'@
[IO.File]::WriteAllText($fixture, $envText)
$before = @(Get-ChildItem (Join-Path $PSScriptRoot '.state') -Directory -ErrorAction SilentlyContinue | ForEach-Object Name)
function global:docker {
    $global:Calls.Add('docker ' + ($args -join ' '))
    $global:LASTEXITCODE = if (($global:Mode -eq 'build-failure' -and $args[0] -eq 'build') -or ($global:Mode -eq 'docker-unavailable' -and $args[0] -eq 'info')) { 7 } else { 0 }
}
function global:kind {
    $global:Calls.Add('kind ' + ($args -join ' '))
    $global:LASTEXITCODE = 0
    if ($args[0] -eq 'get') { 'reloop-production-local' }
}
function global:kubectl {
    $a = @($args)
    $global:Calls.Add('kubectl ' + ($a -join ' '))
    $global:LASTEXITCODE = 0
    if ($a[0] -eq 'kustomize') { & $global:RealKubectl @a; return }
    if ($a[0] -ne '--context' -or $a[1] -ne 'kind-reloop-production-local' -or $a[3] -ne 'reloop-production-local') { throw 'Unsafe context or namespace in kubectl call.' }
    $text = $a -join ' '
    if ($text -match 'get namespace') {
        if ($global:Mode -eq 'unmarked-namespace') { '{"metadata":{"labels":{"reloop-mode":"development"}}}' }
        else { '{"metadata":{"labels":{"reloop-mode":"production-local"}}}' }
        return
    }
    if ($text -match 'get jobs') {
        if ($global:Mode -eq 'active-job') { '{"items":[{"status":{"active":1}}]}' }
        else { '{"items":[]}' }
        return
    }
    if ($text -match 'get configmap deployment-state') {
        $hash = if ($global:Mode -eq 'schema-change') { 'changed' } else { $global:ExpectedHash }
        '{"data":{"schemaHash":"' + $hash + '"}}'; return
    }
    if ($text -match 'get secret') {
        '{"data":{"POSTGRES_PASSWORD":"' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('test-only-password')) + '"}}'; return
    }
    if ($text -match 'get deployments') { '{"items":[]}'; return }
    if ($text -match 'create secret') { '{"apiVersion":"v1","kind":"Secret","metadata":{"name":"reloop-secrets"}}'; return }
    if ($text -match 'apply -f (.+\.json)$') {
        $job = [IO.File]::ReadAllText($matches[1]) | ConvertFrom-Json
        if ($job.kind -eq 'Job') { $global:RenderedJobs.Add($job) }
    }
    if ($global:Mode -eq 'job-failure' -and $text -match 'wait --for=condition=complete job/auth-service-check') { $global:LASTEXITCODE = 1 }
}
function Assert-Fails {
    param([string]$Mode, [string]$Message)
    $global:Mode = $Mode; $global:Calls.Clear()
    $failed = $false
    try { & $Deploy -SecretsFile $fixture } catch {
        $failed = $true
        if ($_.Exception.Message -notmatch $Message) { throw "Unexpected failure: $_" }
    }
    if (-not $failed) { throw "Expected failure for $Mode" }
    if (@($global:Calls | Where-Object { $_ -match 'apply -f .*apps.rendered.yaml' }).Count) { throw 'Application replaced despite failure.' }
    Write-Host "PASS: $Mode blocks application replacement"
}
try {
    Assert-Fails 'docker-unavailable' 'docker failed'
    if (@($global:Calls | Where-Object { $_ -match '^kind |^kubectl ' }).Count) { throw 'Bootstrap or deployment ran before Docker was ready.' }
    Assert-Fails 'unmarked-namespace' 'unmarked existing namespace'
    Assert-Fails 'active-job' 'database Job is still active'
    Assert-Fails 'schema-change' 'database files changed'
    if (@($global:Calls | Where-Object { $_ -match 'docker build|kubectl .* apply' }).Count) { throw 'Schema gate mutated the deployment.' }
    Assert-Fails 'build-failure' 'docker failed'
    Assert-Fails 'job-failure' 'kubectl failed'
    $global:Mode = 'normal'; $global:Calls.Clear(); $global:RenderedJobs.Clear()
    & $Deploy -SecretsFile $fixture
    if (@($global:Calls | Where-Object { $_ -match 'apply -f .*apps.rendered.yaml' }).Count -ne 1) { throw 'Expected application apply.' }
    if (@($global:Calls | Where-Object { $_ -match '^docker build' }).Count -ne 7) { throw 'Expected seven image builds.' }
    if (@($global:Calls | Where-Object { $_ -match '^kind load docker-image' }).Count -ne 7) { throw 'Expected seven image loads.' }
    if ($global:RenderedJobs.Count -ne 4) { throw 'Expected four SQL status Jobs.' }
    foreach ($job in $global:RenderedJobs) {
        $command = $job.spec.template.spec.containers[0].command -join ' '
        if ($command -ne 'npx --no-install prisma migrate status') { throw 'Normal deploy must not migrate.' }
        if ($job.spec.backoffLimit -ne 0) { throw 'Database Jobs must not auto retry.' }
    }
    if (@($global:Calls | Where-Object { $_ -match 'scale|delete|use-context' }).Count) { throw 'Normal update changed scale, deleted resources, or changed context.' }
    Write-Host 'PASS: normal update builds seven images, checks migrations, applies apps, and smokes'
    # Exercise the actual migration-Job generator without touching any database.
    foreach ($functionName in @('Write-Utf8', 'Invoke-Native', 'K', 'Run-DatabaseJob')) {
        $node = $ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $functionName}, $true)
        Invoke-Expression $node.Extent.Text
    }
    $Run = Join-Path $PSScriptRoot ('.state/job-test-' + [Guid]::NewGuid().ToString('N'))
    [void][IO.Directory]::CreateDirectory($Run)
    $Tag = 'offline-test'; $Context = 'kind-reloop-production-local'; $Namespace = 'reloop-production-local'
    $global:RenderedJobs.Clear()
    foreach ($service in @('auth-service', 'product-service', 'order-service', 'support-service')) {
        Run-DatabaseJob $service @('node', 'prisma/migrate.js') 'migrate'
    }
    Run-DatabaseJob 'chat-service' @('npx', '--no-install', 'prisma', 'db', 'push', '--skip-generate') 'migrate'
    if ($global:RenderedJobs.Count -ne 5) { throw 'Expected five migration Jobs.' }
    foreach ($job in $global:RenderedJobs) {
        $c = $job.spec.template.spec.containers[0]
        if ($c.command -contains '--accept-data-loss') { throw 'Destructive migration flag.' }
        if ($job.spec.backoffLimit -ne 0 -or $job.spec.activeDeadlineSeconds -ne 600) { throw 'Unsafe Job retry/deadline.' }
        if ($c.env[0].valueFrom.secretKeyRef.key -notmatch '^DATABASE_URL_(AUTH|PRODUCT|ORDER|SUPPORT|CHAT)$') { throw 'Incorrect database key.' }
        if ($job.spec.template.spec.securityContext.runAsUser -ne 1000) { throw 'Migration should run non-root.' }
    }
    Write-Host 'PASS: five explicit migration Jobs, correct database keys, no destructive flag'
    Write-Host 'PASS: PowerShell syntax'
} finally {
    Remove-Item $fixture -ErrorAction SilentlyContinue
    # Remove only artifacts produced by this offline test, never existing run data.
    Get-ChildItem (Join-Path $PSScriptRoot '.state') -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -notin $before } | Remove-Item -Recurse -Force
    foreach ($name in @('docker', 'kind', 'kubectl')) { Remove-Item "function:global:$name" -ErrorAction SilentlyContinue }
}
