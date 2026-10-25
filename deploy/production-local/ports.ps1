# Shared by deploy.ps1 and expose.ps1. No actions occur when dot-sourced.
function Invoke-PortRead {
    param([string]$Program, [string[]]$Arguments)
    $result = & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program failed while configuring local access. No cluster/data reset was attempted." }
    return ($result -join "`n")
}
function Get-LocalPortSettings {
    param([hashtable]$Values)
    $ports = @{}
    foreach ($key in @('FRONTEND_PORT', 'GATEWAY_PORT')) {
        $port = 0
        if (-not [int]::TryParse([string]$Values[$key], [ref]$port) -or $port -lt 1 -or $port -gt 65535) { throw "$key must be an integer from 1 to 65535." }
        $ports[$key] = $port
    }
    if ($ports['FRONTEND_PORT'] -eq $ports['GATEWAY_PORT']) { throw 'FRONTEND_PORT and GATEWAY_PORT must be different.' }
    foreach ($pair in @(@('APP_BASE_URL', 'FRONTEND_PORT'), @('NEXT_PUBLIC_API_URL', 'GATEWAY_PORT'))) {
        $url = $null
        if (-not [Uri]::TryCreate([string]$Values[$pair[0]], [UriKind]::Absolute, [ref]$url)) { throw "Missing or invalid $($pair[0])." }
        if ($url.IsLoopback -and ($url.Scheme -ne 'http' -or $url.Port -ne $ports[$pair[1]])) { throw "$($pair[0]) must use http and match $($pair[1]) for direct localhost access." }
    }
    return $ports
}
function Assert-LocalPortAvailable {
    param([int]$Port)
    $listener = New-Object Net.Sockets.TcpListener ([Net.IPAddress]::Loopback), $Port
    try { $listener.Start() }
    catch { throw "Local port $Port is busy. Stop its port-forward or choose a free port in .env; no existing process was stopped." }
    finally { $listener.Stop() }
}
function Wait-LocalHttp {
    param([int]$Port, [string]$Path)
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        $response = $null
        try {
            $request = [Net.HttpWebRequest]::Create("http://127.0.0.1:${Port}${Path}")
            $request.Proxy = $null
            $request.Timeout = 1500
            $response = $request.GetResponse()
            if ([int]$response.StatusCode -eq 200) { return }
        } catch { # A container's listener may take a moment to start.
        } finally { if ($response) { $response.Close() } }
        Start-Sleep -Milliseconds 500
    }
    throw "Local HTTP check failed on port $Port. Inspect docker logs reloop-production-local-access; do not delete the cluster."
}
function Enable-LocalAccess {
    param([hashtable]$Values)
    $ports = Get-LocalPortSettings $Values
    $context = 'kind-reloop-production-local'
    $namespace = 'reloop-production-local'
    $node = 'reloop-production-local-control-plane'
    $name = 'reloop-production-local-access'
    $owner = 'reloop-production-local'
    $prefix = @('--context', $context, '-n', $namespace)
    $ns = (Invoke-PortRead 'kubectl' ($prefix + @('get', 'namespace', $namespace, '-o', 'json'))) | ConvertFrom-Json
    if ($ns.metadata.labels.'reloop-mode' -ne 'production-local') { throw 'Refusing local access for an unmarked namespace.' }
    $nodeInfo = @((Invoke-PortRead 'docker' @('inspect', $node)) | ConvertFrom-Json)[0]
    if ($nodeInfo.Config.Labels.'io.x-k8s.kind.cluster' -ne $owner -or -not $nodeInfo.NetworkSettings.Networks.PSObject.Properties['kind']) { throw 'Expected the owned kind node on Docker network kind.' }
    $gateway = (Invoke-PortRead 'kubectl' ($prefix + @('get', 'deployment', 'gateway', '-o', 'json'))) | ConvertFrom-Json
    $image = @($gateway.spec.template.spec.containers | Where-Object { $_.name -eq 'gateway' })[0].image
    if (-not $image) { throw 'Cannot find the deployed gateway image for the local access proxy.' }
    $null = Invoke-PortRead 'docker' @('image', 'inspect', $image)
    $source = Join-Path $PSScriptRoot 'port-proxy.cjs'
    if (-not (Test-Path $source -PathType Leaf)) { throw 'Missing port-proxy.cjs.' }
    $source = (Resolve-Path $source).Path
    $signature = "$($ports['FRONTEND_PORT'])/$($ports['GATEWAY_PORT'])/$image/$source"
    $old = $null
    $existing = Invoke-PortRead 'docker' @('container', 'ls', '-a', '--filter', "name=^/${name}$", '--format', '{{.Names}}')
    if ($existing) {
        $old = @((Invoke-PortRead 'docker' @('inspect', $name)) | ConvertFrom-Json)[0]
        $label = $old.Config.Labels.PSObject.Properties['reloop.local-access-owner']
        if (-not $label -or $label.Value -ne $owner) { throw 'The access container name belongs to another owner; refusing to replace it.' }
    }
    $ownedPorts = @()
    if ($old -and $old.State.Running) {
        foreach ($property in $old.NetworkSettings.Ports.PSObject.Properties) {
            foreach ($binding in @($property.Value)) {
                if ($binding -and $binding.HostIp -eq '127.0.0.1') { $ownedPorts += [int]$binding.HostPort }
            }
        }
    }
    foreach ($port in $ports.Values) { if ($port -notin $ownedPorts) { Assert-LocalPortAvailable $port } }
    # Check all intended changes before touching Services or the owned proxy.
    $services = (Invoke-PortRead 'kubectl' ($prefix + @('get', 'services', '-A', '-o', 'json'))) | ConvertFrom-Json
    $specs = @(@('frontend', 3000, 30080), @('gateway', 8080, 30081))
    foreach ($spec in $specs) {
        $ours = @($services.items | Where-Object { $_.metadata.namespace -eq $namespace -and $_.metadata.name -eq $spec[0] })
        if ($ours.Count -ne 1) { throw "Missing Service $($spec[0])." }
        $service = $ours[0]
        if ($service.spec.type -notin @('ClusterIP', 'NodePort') -or $service.spec.selector.app -ne $spec[0] -or @($service.spec.ports).Count -ne 1 -or $service.spec.ports[0].port -ne $spec[1] -or $service.spec.ports[0].targetPort -ne $spec[1]) { throw "Unexpected Service layout for $($spec[0]); refusing to overwrite it." }
        foreach ($other in $services.items) {
            foreach ($port in $other.spec.ports) {
                if ($port.PSObject.Properties['nodePort'] -and $port.nodePort -eq $spec[2] -and ($other.metadata.namespace -ne $namespace -or $other.metadata.name -ne $spec[0])) { throw "NodePort $($spec[2]) belongs to another Service." }
            }
        }
    }
    foreach ($spec in $specs) {
        # Use stdin rather than JSON argv: Windows PowerShell 5 strips embedded quotes.
        $service = @($services.items | Where-Object { $_.metadata.namespace -eq $namespace -and $_.metadata.name -eq $spec[0] })[0]
        $service.spec.type = 'NodePort'
        $service.spec.ports = @(@{name = 'tcp'; port = $spec[1]; targetPort = $spec[1]; nodePort = $spec[2]})
        $service | ConvertTo-Json -Depth 30 | & kubectl @prefix replace -f -
        if ($LASTEXITCODE -ne 0) { throw "Cannot configure Service $($spec[0]). No data was deleted." }
    }
    $same = $false
    if ($old) {
        $configLabel = $old.Config.Labels.PSObject.Properties['reloop.local-access-config']
        $same = $configLabel -and $configLabel.Value -eq $signature
    }
    if ($same) {
        $null = Invoke-PortRead 'docker' @('restart', $name)
    } else {
        if ($old) { $null = Invoke-PortRead 'docker' @('rm', '-f', $name) }
        $null = Invoke-PortRead 'docker' @('run', '-d', '--name', $name, '--restart', 'unless-stopped', '--init',
            '--network', 'kind', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', '1000:1000',
            '--label', "reloop.local-access-owner=$owner", '--label', "reloop.local-access-config=$signature",
            '--publish', "127.0.0.1:$($ports['FRONTEND_PORT']):3000", '--publish', "127.0.0.1:$($ports['GATEWAY_PORT']):8080",
            '--env', "PROXY_TARGET_HOST=$node", '--mount', "type=bind,source=$source,target=/port-proxy.cjs,readonly",
            '--entrypoint', 'node', $image, '/port-proxy.cjs')
    }
    Wait-LocalHttp $ports['FRONTEND_PORT'] '/'
    Wait-LocalHttp $ports['GATEWAY_PORT'] '/health'
    Write-Host "Local access ready: http://localhost:$($ports['FRONTEND_PORT']) ; API http://localhost:$($ports['GATEWAY_PORT'])"
}
