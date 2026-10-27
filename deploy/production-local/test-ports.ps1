# Offline tests of the real local-access consumer, with infrastructure mocked.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ports.ps1')
$global:PortCalls = New-Object 'Collections.Generic.List[string]'
$global:PortReplacements = New-Object 'Collections.Generic.List[object]'
$global:PortMode = 'new'
$values = @{FRONTEND_PORT = '13000'; GATEWAY_PORT = '18080'; APP_BASE_URL = 'http://localhost:13000'; NEXT_PUBLIC_API_URL = 'http://localhost:18080'}
function Assert-LocalPortAvailable {
    param([int]$Port)
    $global:PortCalls.Add("port-check $Port")
    if ($global:PortMode -eq 'busy') { throw 'Local port is busy' }
}
function Wait-LocalHttp {
    param([int]$Port, [string]$Path)
    $global:PortCalls.Add("http $Port $Path")
    if ($global:PortMode -eq 'http-failure') { throw 'Local HTTP check failed' }
}
function global:docker {
    $a = @($args); $global:PortCalls.Add('docker ' + ($a -join ' ')); $global:LASTEXITCODE = 0
    if ($a[0] -eq 'inspect' -and $a[1] -eq 'reloop-production-local-control-plane') {
        @{Config = @{Labels = @{'io.x-k8s.kind.cluster' = 'reloop-production-local'}}; NetworkSettings = @{Networks = @{kind = @{}}}} | ConvertTo-Json -Depth 10
    } elseif ($a[0] -eq 'container') {
        if ($global:PortMode -in @('owned', 'foreign', 'same')) { 'reloop-production-local-access' }
    } elseif ($a[0] -eq 'inspect') {
        $owner = if ($global:PortMode -eq 'foreign') { 'foreign' } else { 'reloop-production-local' }
        $signature = if ($global:PortMode -eq 'same') { "13000/18080/test-local-image:tag/$(Join-Path $PSScriptRoot 'port-proxy.cjs')" } else { 'previous' }
        @{Config = @{Labels = @{'reloop.local-access-owner' = $owner; 'reloop.local-access-config' = $signature}}; State = @{Running = $true}; NetworkSettings = @{Ports = @{'3000/tcp' = @(@{HostIp = '127.0.0.1'; HostPort = '13000'}); '8080/tcp' = @(@{HostIp = '127.0.0.1'; HostPort = '18080'})}}} | ConvertTo-Json -Depth 10
    } elseif ($a[0] -eq 'image') {
        if ($global:PortMode -eq 'missing-image') { $global:LASTEXITCODE = 1 } else { '[{"Id":"test-image"}]' }
    }
}
function global:kubectl {
    $a = @($args); $global:PortCalls.Add('kubectl ' + ($a -join ' ')); $global:LASTEXITCODE = 0
    if ($a[0] -ne '--context' -or $a[1] -ne 'kind-reloop-production-local' -or $a[3] -ne 'reloop-production-local') { throw 'Unsafe local-access context' }
    $text = $a -join ' '
    if ($text -match 'get namespace') {
        $mode = if ($global:PortMode -eq 'namespace') { 'development' } else { 'production-local' }
        @{metadata = @{labels = @{'reloop-mode' = $mode}}} | ConvertTo-Json -Depth 5
    } elseif ($text -match 'get deployment gateway') {
        '{"spec":{"template":{"spec":{"containers":[{"name":"gateway","image":"test-local-image:tag"}]}}}}'
    } elseif ($text -match 'get services -A') {
        $items = @()
        foreach ($entry in @(@('frontend', 3000), @('gateway', 8080))) {
            $items += @{apiVersion = 'v1'; kind = 'Service'; metadata = @{name = $entry[0]; namespace = 'reloop-production-local'; resourceVersion = 'test-version'}; spec = @{type = 'ClusterIP'; clusterIP = '10.96.1.2'; selector = @{app = $entry[0]}; ports = @(@{name = 'tcp'; port = $entry[1]; targetPort = $entry[1]})}}
        }
        if ($global:PortMode -eq 'nodeport-collision') { $items += @{metadata = @{name = 'foreign'; namespace = 'other'}; spec = @{ports = @(@{nodePort = 30080})}} }
        if ($global:PortMode -eq 'service-layout') { $items[0].spec.selector.app = 'foreign' }
        @{items = $items} | ConvertTo-Json -Depth 12
    } elseif ($text -match 'replace -f -$') {
        $global:PortReplacements.Add((($input | Out-String) | ConvertFrom-Json))
    } else { throw "Unexpected local-access kubectl command: $text" }
}
function Reset-Ports {
    param([string]$Mode)
    $global:PortMode = $Mode; $global:PortCalls.Clear(); $global:PortReplacements.Clear()
}
function Expect-PortFailure {
    param([string]$Mode, [string]$Pattern)
    Reset-Ports $Mode
    $failed = $false
    try { Enable-LocalAccess $values } catch {
        $failed = $true
        if ($_.Exception.Message -notmatch $Pattern) { throw "Unexpected $Mode failure: $_" }
    }
    if (-not $failed) { throw "Expected $Mode to fail" }
    if ($Mode -ne 'http-failure' -and ($global:PortReplacements.Count -or @($global:PortCalls | Where-Object { $_ -match '^docker (rm|run|restart)' }).Count)) { throw 'Mutated resources before validation completed' }
    Write-Host "PASS: local ports $Mode"
}
try {
    foreach ($bad in @(@{FRONTEND_PORT='abc';GATEWAY_PORT='8080'}, @{FRONTEND_PORT='0';GATEWAY_PORT='8080'}, @{FRONTEND_PORT='3000';GATEWAY_PORT='3000'}, @{FRONTEND_PORT='65536';GATEWAY_PORT='8080'}, @{FRONTEND_PORT='3000';GATEWAY_PORT='8080';APP_BASE_URL='http://localhost:4000';NEXT_PUBLIC_API_URL='http://localhost:8080'})) {
        $failed = $false
        try { $null = Get-LocalPortSettings $bad } catch { $failed = $true }
        if (-not $failed) { throw 'Invalid port configuration was accepted' }
    }
    foreach ($scenario in @(@('namespace','unmarked'), @('foreign','another owner'), @('missing-image','docker failed'), @('busy','busy'), @('nodeport-collision','another Service'), @('service-layout','Unexpected Service'), @('http-failure','HTTP check failed'))) { Expect-PortFailure $scenario[0] $scenario[1] }
    Reset-Ports 'new'
    Enable-LocalAccess $values
    if ($global:PortReplacements.Count -ne 2) { throw 'Expected exactly two Service updates' }
    foreach ($service in $global:PortReplacements) {
        if ($service.spec.type -ne 'NodePort' -or $service.spec.clusterIP -ne '10.96.1.2' -or $service.metadata.resourceVersion -ne 'test-version') { throw 'Service identity or IP was changed' }
    }
    $run = @($global:PortCalls | Where-Object { $_ -match '^docker run ' })[0]
    if ($run -notmatch '127.0.0.1:13000:3000' -or $run -notmatch '127.0.0.1:18080:8080' -or $run -notmatch '--restart unless-stopped' -or $run -match '0.0.0.0:|--privileged') { throw 'Incorrect or unsafe host bindings' }
    if (@($global:PortCalls | Where-Object { $_ -match '^http ' }).Count -ne 2) { throw 'Host HTTP checks were skipped' }
    Reset-Ports 'owned'; Enable-LocalAccess $values
    if (@($global:PortCalls | Where-Object { $_ -eq 'docker rm -f reloop-production-local-access' }).Count -ne 1) { throw 'Expected only the owned old proxy to be replaced' }
    Reset-Ports 'same'; Enable-LocalAccess $values
    if (@($global:PortCalls | Where-Object { $_ -match '^docker run |^docker rm ' }).Count -or @($global:PortCalls | Where-Object { $_ -eq 'docker restart reloop-production-local-access' }).Count -ne 1) { throw 'Repeated setup did not reuse its proxy' }
    if (@($global:PortCalls | Where-Object { $_ -match 'delete|migrate|kind create|use-context' }).Count) { throw 'Exposure touched the cluster lifecycle/data' }
    Write-Host 'PASS: local ports setup, ownership, reuse, loopback binding and host HTTP checks'
} finally {
    foreach ($name in @('docker', 'kubectl')) { Remove-Item "function:global:$name" -ErrorAction SilentlyContinue }
}
