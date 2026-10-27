[CmdletBinding()]
param(
    [switch]$Migrate,
    [switch]$CreateCluster,
    [Alias('EnvFile')]
    [string]$SecretsFile
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# Resolve defaults after parameter binding, independently of the caller's directory.
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not $PSBoundParameters.ContainsKey('SecretsFile')) {
    $SecretsFile = Join-Path $Root '.env'
}
. (Join-Path $PSScriptRoot 'environment.ps1')
. (Join-Path $PSScriptRoot 'ports.ps1')
$Cluster = 'reloop-production-local'
$Context = "kind-$Cluster"
$Namespace = 'reloop-production-local'
$Apps = @('auth-service', 'product-service', 'order-service', 'support-service', 'chat-service', 'gateway', 'frontend')
$SqlApps = @('auth-service', 'product-service', 'order-service', 'support-service')
$Run = $null
$Lock = $null
$Stage = 'preflight'
$Stopped = $false
$TranscriptStarted = $false

# Windows PowerShell does not throw on a native command's non-zero exit code.
function Invoke-Native {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "$Program failed ($LASTEXITCODE): $($Arguments -join ' ')" }
}
function Update-ProcessPath {
    # Preserve session-only entries and pick up changes made by WinGet.
    $paths = @($env:Path, [Environment]::GetEnvironmentVariable('Path', 'User'), [Environment]::GetEnvironmentVariable('Path', 'Machine'))
    $env:Path = ($paths | Where-Object { $_ }) -join ';'
}
function Ensure-Kind {
    if (-not (Get-Command kind -ErrorAction SilentlyContinue)) {
        # A previous install may only be missing from this terminal's PATH.
        Update-ProcessPath
    }
    if (-not (Get-Command kind -ErrorAction SilentlyContinue)) {
        if ($env:OS -ne 'Windows_NT') { throw 'Automatic kind installation requires Windows and WinGet. Install kind manually, then rerun.' }
        if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { throw 'Missing kind and WinGet. Install App Installer (WinGet) or install kind manually, then rerun.' }
        Write-Host 'kind is missing; installing for the current Windows user via WinGet.'
        Invoke-Native 'winget' @('install', '--id', 'Kubernetes.kind', '--exact', '--source', 'winget', '--scope', 'user', '--accept-source-agreements', '--accept-package-agreements', '--disable-interactivity')
        Update-ProcessPath
        if (-not (Get-Command kind -ErrorAction SilentlyContinue)) { throw 'WinGet finished but kind is not available. Reopen PowerShell and check kind version before retrying.' }
    }
    Invoke-Native 'kind' @('version')
}
function K {
    param([string[]]$Arguments)
    Invoke-Native 'kubectl' (@('--context', $Context, '-n', $Namespace) + $Arguments)
}
function Read-K {
    param([string[]]$Arguments)
    $result = & kubectl --context $Context -n $Namespace @Arguments
    if ($LASTEXITCODE -ne 0) { throw "kubectl failed: $($Arguments -join ' ')" }
    return ($result -join "`n")
}
function Write-Utf8 {
    param([string]$Path, [string]$Content)
    [IO.File]::WriteAllText($Path, $Content, (New-Object Text.UTF8Encoding $false))
}
function Get-SchemaHash {
    $paths = @()
    foreach ($service in $Apps | Where-Object { $_ -like '*-service' }) {
        $paths += @(Get-ChildItem (Join-Path $Root "backend/services/$service/prisma") -Recurse -File)
    }
    foreach ($directory in @('infra/postgres', 'infra/mongo')) {
        if (Test-Path (Join-Path $Root $directory)) {
            $paths += @(Get-ChildItem (Join-Path $Root $directory) -Recurse -File)
        }
    }
    $hash = [Security.Cryptography.SHA256]::Create()
    try {
        $entries = foreach ($file in $paths | Sort-Object FullName) {
            $relative = $file.FullName.Substring($Root.Length).Replace('\', '/')
            $fileHash = (Get-FileHash -Algorithm SHA256 $file.FullName).Hash
            "$relative=$fileHash"
        }
        return ([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes(($entries -join "`n"))))).Replace('-', '').ToLowerInvariant()
    } finally { $hash.Dispose() }
}
function Save-Backup {
    param([string]$Path, [string[]]$Arguments)
    # Stream raw bytes: PowerShell 5 redirection corrupts mongodump archives.
    # All arguments here are fixed, whitespace-free identifiers, not user input.
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = (Get-Command kubectl).Source
    $info.Arguments = (@('--context', $Context, '-n', $Namespace) + $Arguments) -join ' '
    $info.UseShellExecute = $false
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $info
    $file = [IO.File]::Create($Path)
    try {
        [void]$process.Start()
        $errorTask = $process.StandardError.ReadToEndAsync()
        $process.StandardOutput.BaseStream.CopyTo($file)
        $process.WaitForExit()
        $errorText = $errorTask.Result
        if ($process.ExitCode -ne 0) { throw "Backup failed: $errorText" }
        if ($file.Length -eq 0) { throw "Empty backup: $Path" }
    } finally { $file.Dispose(); $process.Dispose() }
}
function Run-DatabaseJob {
    param([string]$Service, [string[]]$Command, [string]$Purpose)
    $name = "$Service-$Purpose-$Tag"
    $container = @{
        name = 'database-task'; image = "reloop/production-local-${Service}:$Tag"; imagePullPolicy = 'Never'
        command = $Command
        envFrom = @(@{configMapRef = @{name = 'reloop-config'}}, @{secretRef = @{name = 'reloop-secrets'}})
        env = @(@{name = 'DATABASE_URL'; valueFrom = @{secretKeyRef = @{name = 'reloop-secrets'; key = "DATABASE_URL_$($Service.Replace('-service', '').ToUpperInvariant())"}}})
        resources = @{requests = @{cpu = '100m'; memory = '128Mi'}; limits = @{cpu = '2'; memory = '512Mi'}}
    }
    $job = @{
        apiVersion = 'batch/v1'; kind = 'Job'; metadata = @{name = $name; namespace = $Namespace; labels = @{'reloop-task' = 'database'}}
        spec = @{
            backoffLimit = 0; activeDeadlineSeconds = 600; ttlSecondsAfterFinished = 86400
            template = @{spec = @{
                automountServiceAccountToken = $false
                restartPolicy = 'Never'; securityContext = @{runAsNonRoot = $true; runAsUser = 1000; runAsGroup = 1000}
                containers = @($container)
            }}
        }
    }
    $path = Join-Path $Run "$name.json"
    Write-Utf8 $path ($job | ConvertTo-Json -Depth 30)
    K @('apply', '-f', $path)
    try {
        K @('wait', '--for=condition=complete', "job/$name", '--timeout=630s')
    } finally {
        # Preserve logs even for a failed Job; do not retry migrations automatically.
        $logs = & kubectl --context $Context -n $Namespace logs "job/$name" 2>&1
        Write-Utf8 (Join-Path $Run "$name.log") ($logs -join "`n")
        $logs | Out-Host
    }
}

try {
    foreach ($tool in @('docker', 'kubectl')) {
        if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Missing command: $tool" }
    }
    $values = Read-DeploymentEnvironment $SecretsFile
    Assert-DeploymentEnvironment $values
    $null = Get-LocalPortSettings $values
    # Ports and service DNS belong to this cluster, not the host/Compose network.
    $values['NODE_ENV'] = 'production'
    $values['PORT'] = '3000'
    $values['FRONTEND_PORT'] = '3000'
    $values['POSTGRES_USER'] = 'reloop'
    foreach ($entry in @(@('GATEWAY',8080), @('AUTH',3001), @('PRODUCT',3002), @('ORDER',3003), @('CHAT',3004), @('SUPPORT',3006))) {
        $values["$($entry[0])_PORT"] = [string]$entry[1]
    }
    foreach ($service in @('AUTH','PRODUCT','ORDER','CHAT','SUPPORT')) {
        $values["${service}_SERVICE_URL"] = "http://$($service.ToLowerInvariant())-service:$($values["${service}_PORT"])"
    }
    $values['FRONTEND_SERVICE_URL'] = 'http://frontend:3000'
    $values['KYC_STORAGE_DIR'] = '/app/backend/services/auth-service/private-kyc-documents'
    $values['REPORT_EVIDENCE_STORAGE_DIR'] = $values['KYC_STORAGE_DIR'] + '/report-evidence'
    if ($values['REDIS_URL'] -ne 'redis://redis:6379') { throw 'REDIS_URL must be redis://redis:6379 for this cluster.' }
    foreach ($key in @('POSTGRES_PASSWORD', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'INTERNAL_SERVICE_TOKEN', 'DATABASE_URL_AUTH', 'DATABASE_URL_PRODUCT', 'DATABASE_URL_ORDER', 'DATABASE_URL_SUPPORT', 'DATABASE_URL_CHAT')) {
        if (-not $values.ContainsKey($key) -or -not $values[$key]) { throw "Missing secret key: $key" }
    }
    # Never accidentally connect this rehearsal to an external or Compose database.
    foreach ($key in @('AUTH', 'PRODUCT', 'ORDER', 'SUPPORT')) {
        $uri = $null
        if (-not [Uri]::TryCreate($values["DATABASE_URL_$key"], [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -notin @('postgresql', 'postgres')) { throw "Invalid DATABASE_URL_$key." }
        if ($uri.Host -ne 'postgres' -or $uri.Port -ne 5432 -or $uri.AbsolutePath -ne "/reloop_$($key.ToLowerInvariant())") { throw "DATABASE_URL_$key must target its internal postgres database." }
        if ([Uri]::UnescapeDataString($uri.UserInfo) -ne "reloop:$($values['POSTGRES_PASSWORD'])") { throw "DATABASE_URL_$key credentials must match POSTGRES_PASSWORD and user reloop." }
    }
    $mongoUri = $null
    if (-not [Uri]::TryCreate($values['DATABASE_URL_CHAT'], [UriKind]::Absolute, [ref]$mongoUri) -or $mongoUri.Scheme -ne 'mongodb') { throw 'Invalid DATABASE_URL_CHAT.' }
    if ($mongoUri.Host -ne 'mongo' -or $mongoUri.Port -ne 27017 -or $mongoUri.AbsolutePath -ne '/reloop_chat' -or $mongoUri.Query -notmatch 'replicaSet=rs0') { throw 'DATABASE_URL_CHAT must target mongo:27017/reloop_chat with replicaSet=rs0.' }
    Invoke-Native 'docker' @('info', '--format', '{{.ServerVersion}}')
    Ensure-Kind
    $state = Join-Path $PSScriptRoot '.state'
    [void][IO.Directory]::CreateDirectory($state)
    $Lock = [IO.File]::Open((Join-Path $state 'lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    $clusters = & kind get clusters
    if ($LASTEXITCODE -ne 0) { throw 'Cannot list kind clusters.' }
    if ($clusters -notcontains $Cluster) {
        if (-not $CreateCluster) { throw "Cluster missing. Rerun with -CreateCluster -Migrate for first setup." }
        Invoke-Native 'kind' @('create', 'cluster', '--name', $Cluster)
    }
    # Never rely on, or change, the user's current kubectl context.
    K @('get', 'nodes')
    $existingNamespace = Read-K @('get', 'namespace', $Namespace, '--ignore-not-found', '-o', 'json')
    if ($existingNamespace) {
        $ns = $existingNamespace | ConvertFrom-Json
        if (-not $ns.metadata.labels.PSObject.Properties['reloop-mode'] -or $ns.metadata.labels.'reloop-mode' -ne 'production-local') { throw 'Refusing to use an unmarked existing namespace.' }
    }
    if ($existingNamespace) {
        $redis = Read-K @('get', 'deployment', 'redis', '--ignore-not-found', '-o', 'json')
        if ($redis) {
            $redisDeployment = $redis | ConvertFrom-Json
            $redisSpec = $redisDeployment.spec.template.spec
            $persistentRedis = @()
            if ($redisSpec.PSObject.Properties['volumes']) {
                $persistentRedis = @($redisSpec.volumes | Where-Object { $_.PSObject.Properties['persistentVolumeClaim'] -and $_.persistentVolumeClaim.claimName -eq 'redis-data' })
            }
            $mountedRedis = @()
            if ($redisSpec.PSObject.Properties['containers']) {
                foreach ($container in $redisSpec.containers) {
                    if ($container.name -eq 'redis' -and $container.PSObject.Properties['volumeMounts'] -and $container.PSObject.Properties['args'] -and ($container.args -join ' ') -match '--appendonly yes(?:\s|$)') {
                        $mountedRedis = @($container.volumeMounts | Where-Object { $_.mountPath -eq '/data' -and $_.name -in @($persistentRedis | ForEach-Object { $_.name }) })
                    }
                }
            }
            if (-not $mountedRedis.Count) { throw 'Existing Redis is ephemeral or not AOF-backed. Stop writers, back up and migrate Redis with verified AOF into redis-data before updating; refusing to discard sessions/queues.' }
        }
    }
    $schemaHash = Get-SchemaHash
    $previousHash = ''
    if ($existingNamespace) {
        $jobs = (Read-K @('get', 'jobs', '-l', 'reloop-task=database', '-o', 'json')) | ConvertFrom-Json
        foreach ($job in $jobs.items) {
            if ($job.status.PSObject.Properties['active'] -and $job.status.active -gt 0) { throw 'A previous database Job is still active. Inspect it before retrying.' }
        }
        $previousState = Read-K @('get', 'configmap', 'deployment-state', '--ignore-not-found', '-o', 'json')
        if ($previousState) { $previousHash = ($previousState | ConvertFrom-Json).data.schemaHash }
    }
    if (-not $Migrate -and $previousHash -ne $schemaHash) { throw 'First deployment or database files changed. Review schema changes, then use -Migrate.' }
    $Tag = (Get-Date -Format 'yyyyMMddHHmmss') + '-' + ([Guid]::NewGuid().ToString('N').Substring(0, 6))
    $Run = Join-Path $state $Tag
    [void][IO.Directory]::CreateDirectory($Run)
    Start-Transcript -Path (Join-Path $Run 'deploy.log') | Out-Null
    $TranscriptStarted = $true
    $Stage = 'build'
    foreach ($service in $Apps) {
        $image = "reloop/production-local-${service}:$Tag"
        $arguments = @('build', '-f', (Join-Path $PSScriptRoot 'Dockerfile'), '-t', $image)
        if ($service -eq 'frontend') {
            $arguments += @('--target', 'frontend', '--build-arg', "NEXT_PUBLIC_API_URL=$($values['NEXT_PUBLIC_API_URL'])")
            foreach ($key in @('NEXT_PUBLIC_REPORT_TIMEZONE', 'NEXT_PUBLIC_REPORT_SEARCH_DEBOUNCE_MS', 'NEXT_PUBLIC_REPORT_REQUEST_TIMEOUT_MS')) {
                if ($values[$key]) { $arguments += @('--build-arg', "${key}=$($values[$key])") }
            }
        }
        else {
            $workspace = if ($service -eq 'gateway') { 'backend/gateway' } else { "backend/services/$service" }
            $arguments += @('--target', 'backend', '--build-arg', "WORKSPACE=$workspace")
        }
        Invoke-Native 'docker' ($arguments + @($Root))
        Invoke-Native 'kind' @('load', 'docker-image', $image, '--name', $Cluster)
    }
    $Stage = 'infrastructure'
    $rendered = & kubectl kustomize $PSScriptRoot
    if ($LASTEXITCODE -ne 0) { throw 'Cannot render Kubernetes resources.' }
    $yaml = $rendered -join "`n"
    foreach ($service in $Apps) {
        $placeholder = "reloop/production-local-${service}:unbuilt"
        if (-not $yaml.Contains($placeholder)) { throw "Missing image placeholder: $service" }
        $yaml = $yaml.Replace($placeholder, "reloop/production-local-${service}:$Tag")
    }
    $documents = @($yaml -split '(?m)^---[ \t]*\r?$' | Where-Object { $_.Trim() })
    $appDocuments = @($documents | Where-Object { $_ -match '(?m)^kind: Deployment\s*$' -and $_ -notmatch '(?m)^  name: redis\s*$' })
    if ($appDocuments.Count -ne $Apps.Count) { throw 'Expected exactly seven application Deployments.' }
    $infraDocuments = @($documents | Where-Object { $_ -notin $appDocuments })
    $infraPath = Join-Path $Run 'infra.rendered.yaml'
    $appsPath = Join-Path $Run 'apps.rendered.yaml'
    Write-Utf8 $infraPath ($infraDocuments -join "`n---`n")
    Write-Utf8 $appsPath ($appDocuments -join "`n---`n")
    # Snapshot the old application configuration before replacing it, for manual recovery.
    if ($existingNamespace) {
        Write-Utf8 (Join-Path $Run 'previous-deployments.json') (Read-K @('get', 'deployments', '-o', 'json'))
        $oldSecret = Read-K @('get', 'secret', 'reloop-secrets', '--ignore-not-found', '-o', 'json')
        if ($oldSecret) {
            $oldPassword = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(($oldSecret | ConvertFrom-Json).data.POSTGRES_PASSWORD))
            if ($oldPassword -ne $values['POSTGRES_PASSWORD']) { throw 'Changing the Secret does not rotate the existing PostgreSQL password. Rotate it separately first.' }
        }
    }
    # Namespace must exist before creating namespaced resources or the Secret.
    K @('apply', '-f', (Join-Path $PSScriptRoot 'namespace.yaml'))
    # Serialize the parsed values once; kubectl's env-file parser handles quotes differently.
    $secretYaml = @{apiVersion = 'v1'; kind = 'Secret'; metadata = @{name = 'reloop-secrets'; namespace = $Namespace}; type = 'Opaque'; stringData = $values} | ConvertTo-Json -Depth 10
    # Keep secret bytes in memory, never in a generated manifest or log.
    $secretYaml | & kubectl --context $Context -n $Namespace apply -f - | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Cannot apply Secret.' }
    K @('apply', '-f', $infraPath)
    K @('rollout', 'status', 'statefulset/postgres', '--timeout=300s')
    K @('wait', '--for=condition=complete', 'job/mongo-init', '--timeout=600s')
    K @('rollout', 'status', 'statefulset/mongo', '--timeout=300s')
    K @('rollout', 'status', 'deployment/redis', '--timeout=300s')
    if ($Migrate) {
        $Stage = 'migration-stop'
        foreach ($service in $Apps) {
            $deployment = Read-K @('get', 'deployment', $service, '--ignore-not-found', '-o', 'name')
            if ($deployment) { K @('scale', "deployment/$service", '--replicas=0') }
        }
        $Stopped = $true
        foreach ($service in $Apps) {
            $pods = Read-K @('get', 'pods', '-l', "app=$service", '-o', 'name')
            foreach ($pod in @($pods -split '\r?\n' | Where-Object { $_ })) {
                K @('wait', '--for=delete', $pod, '--timeout=180s')
            }
        }
        $Stage = 'migration-backup'
        Save-Backup (Join-Path $Run 'postgres.sql') @('exec', 'postgres-0', '--', 'pg_dumpall', '-U', 'reloop')
        Save-Backup (Join-Path $Run 'mongo.archive.gz') @('exec', 'mongo-0', '--', 'mongodump', '--archive', '--gzip')
        $Stage = 'migration-apply'
        foreach ($service in $SqlApps) { Run-DatabaseJob $service @('node', 'prisma/migrate.js') 'migrate' }
        Run-DatabaseJob 'chat-service' @('npx', '--no-install', 'prisma', 'db', 'push', '--skip-generate') 'migrate'
    }
    $Stage = 'migration-check'
    foreach ($service in $SqlApps) { Run-DatabaseJob $service @('npx', '--no-install', 'prisma', 'migrate', 'status') 'check' }
    $Stage = 'start'
    K @('apply', '-f', $appsPath)
    foreach ($service in $Apps) { K @('rollout', 'status', "deployment/$service", '--timeout=600s') }
    $Stopped = $false
    $Stage = 'smoke'
    K @('exec', 'deployment/frontend', '--', 'node', '-e', "if(process.env.NODE_ENV!=='production')process.exit(1);fetch('http://127.0.0.1:3000',{signal:AbortSignal.timeout(10000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))")
    K @('exec', 'deployment/gateway', '--', 'node', '-e', "fetch('http://127.0.0.1:8080/api/products/feed?limit=1',{signal:AbortSignal.timeout(10000)}).then(async r=>{if(!r.ok)throw Error('HTTP '+r.status);if(!Array.isArray((await r.json()).items))throw Error('Invalid feed');console.log('Product feed smoke passed')}).catch(e=>{console.error(e.message);process.exit(1)})")
    $Stage = 'local-access'
    Invoke-Native 'powershell.exe' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'expose.ps1'), '-EnvFile', $SecretsFile)
    $stateObject = @{apiVersion = 'v1'; kind = 'ConfigMap'; metadata = @{name = 'deployment-state'; namespace = $Namespace}; data = @{schemaHash = $schemaHash; imageTag = $Tag}}
    $stateObject | ConvertTo-Json -Depth 10 | & kubectl --context $Context -n $Namespace apply -f - | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Cannot record successful deployment.' }
    K @('get', 'pods,svc,pvc')
    Write-Host "Deploy OK. Image tag: $Tag; run artifacts: $Run"
} catch {
    Write-Warning "Deploy FAILED during $Stage. No automatic rollback or data reset was performed."
    if ($Run) { Write-Warning "Run artifacts: $Run" }
    if ($Stopped) { Write-Warning 'Applications may remain stopped or partially restarted. Inspect Job logs before manual recovery.' }
    throw
} finally {
    try { if ($TranscriptStarted) { Stop-Transcript | Out-Null } }
    finally { if ($Lock) { $Lock.Dispose() } }
}
