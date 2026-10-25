# Read dotenv as data, never execute it. Keep credentials out of errors and logs.
function Read-DeploymentEnvironment {
    param([string]$Path)
    if (-not (Test-Path $Path -PathType Leaf)) { throw 'Missing environment file. Copy .env.example to .env at the repository root and replace example values.' }
    $values = @{}
    foreach ($line in [IO.File]::ReadAllLines((Resolve-Path $Path).Path)) {
        $text = $line.Trim()
        if (-not $text -or $text.StartsWith('#')) { continue }
        if ($text -notmatch '^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') { throw 'Invalid dotenv assignment; multiline values are not supported.' }
        $key = $matches[1]; $value = $matches[2].Trim()
        if ($values.ContainsKey($key)) { throw "Duplicate environment key: $key" }
        if ($value.StartsWith('"') -or $value.StartsWith("'")) {
            $quote = $value.Substring(0, 1)
            $end = $value.IndexOf($quote, 1)
            if ($end -lt 1 -or $value.Substring($end + 1).Trim() -notmatch '^(#.*)?$') { throw "Invalid quoted value for $key" }
            $value = $value.Substring(1, $end - 1)
        } else {
            $value = ($value -replace '\s+#.*$', '').TrimEnd()
        }
        # Compose expansion and escape sequences must not silently differ on Windows.
        if ($value.Contains('$') -or $value.Contains('\')) { throw "Use literal values without interpolation or backslash escapes for $key" }
        $values[$key] = $value
    }
    return $values
}
function Assert-DeploymentEnvironment {
    param([hashtable]$Values)
    foreach ($key in @('POSTGRES_PASSWORD', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'INTERNAL_SERVICE_TOKEN')) {
        $value = [string]$Values[$key]
        if ($value.Length -lt 32 -or $value -match '(?i)change[_-]?me|example|reloop_dev|^dev[_-]') { throw "$key must be at least 32 characters and not an example/development secret." }
    }
    $tokens = @($Values['JWT_ACCESS_SECRET'], $Values['JWT_REFRESH_SECRET'], $Values['INTERNAL_SERVICE_TOKEN'])
    if (@($tokens | Select-Object -Unique).Count -ne 3) { throw 'JWT access, refresh and internal tokens must be different.' }
    foreach ($key in @('DATABASE_URL_AUTH', 'DATABASE_URL_PRODUCT', 'DATABASE_URL_ORDER', 'DATABASE_URL_SUPPORT', 'DATABASE_URL_CHAT', 'REDIS_URL', 'APP_BASE_URL', 'NEXT_PUBLIC_API_URL', 'MAIL_TRANSPORT', 'MAIL_FROM')) {
        if (-not $Values[$key]) { throw "Missing environment key: $key" }
    }
    $loopback = $true
    foreach ($key in @('APP_BASE_URL', 'NEXT_PUBLIC_API_URL')) {
        $uri = $null
        if (-not [Uri]::TryCreate($Values[$key], [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -notin @('http', 'https') -or $uri.UserInfo -or $uri.Query -or $uri.Fragment) { throw "$key must be an absolute HTTP(S) URL without credentials, query or fragment." }
        if (-not $uri.IsLoopback) {
            $loopback = $false
            if ($uri.Scheme -ne 'https') { throw "$key requires HTTPS for non-loopback use." }
        }
    }
    if (-not $loopback -and $Values['MAIL_TRANSPORT'] -ne 'smtp') { throw 'Non-loopback deployments require MAIL_TRANSPORT=smtp; log mail exposes account links in logs.' }
    if ($Values['MAIL_TRANSPORT'] -notin @('log', 'smtp')) { throw 'MAIL_TRANSPORT must be log or smtp.' }
    if ($Values['MAIL_TRANSPORT'] -eq 'smtp') {
        if (-not $Values['SMTP_HOST']) { throw 'Missing SMTP setting: SMTP_HOST' }
        if ([bool]$Values['SMTP_USER'] -ne [bool]$Values['SMTP_PASS']) { throw 'SMTP_USER and SMTP_PASS must be set together.' }
        $port = 587
        if ($Values['SMTP_PORT'] -and (-not [int]::TryParse($Values['SMTP_PORT'], [ref]$port) -or $port -lt 1 -or $port -gt 65535)) { throw 'Invalid SMTP_PORT.' }
    }
}
