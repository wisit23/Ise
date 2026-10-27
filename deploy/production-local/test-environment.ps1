# Offline dotenv and production validation checks. No Docker or cluster access.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'environment.ps1')
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('reloop-env-' + [Guid]::NewGuid().ToString('N') + '.env')
function Expect-Failure {
    param([scriptblock]$Action, [string]$Pattern)
    try { & $Action } catch {
        if ($_.Exception.Message -notmatch $Pattern) { throw "Unexpected validation failure: $_" }
        return
    }
    throw "Expected validation failure: $Pattern"
}
try {
    [IO.File]::WriteAllText($fixture, "# ignored`nexport CS_TIMEOUT_MS=3000`nMAIL_FROM=`"RE-LOOP <no-reply@localhost>`" # sender`nPLATFORM_FEE_RATE=0.03 # fee`nLITERAL='a#b'`n")
    $parsed = Read-DeploymentEnvironment $fixture
    if ($parsed['MAIL_FROM'] -ne 'RE-LOOP <no-reply@localhost>' -or $parsed['CS_TIMEOUT_MS'] -ne '3000' -or $parsed['PLATFORM_FEE_RATE'] -ne '0.03' -or $parsed['LITERAL'] -ne 'a#b') { throw 'dotenv values were not preserved.' }
    foreach ($text in @(('A=1' + "`n" + 'A=2'), 'BAD LINE', 'A="unterminated', 'A=${OTHER}', 'A="escaped\n"')) {
        [IO.File]::WriteAllText($fixture, $text)
        Expect-Failure { Read-DeploymentEnvironment $fixture } 'Duplicate|Invalid|literal values'
    }
    $values = @{
        POSTGRES_PASSWORD = 'p' * 40; JWT_ACCESS_SECRET = 'a' * 40; JWT_REFRESH_SECRET = 'r' * 40; INTERNAL_SERVICE_TOKEN = 'i' * 40
        DATABASE_URL_AUTH = 'set'; DATABASE_URL_PRODUCT = 'set'; DATABASE_URL_ORDER = 'set'; DATABASE_URL_SUPPORT = 'set'; DATABASE_URL_CHAT = 'set'
        REDIS_URL = 'redis://redis:6379'; APP_BASE_URL = 'http://localhost:3000'; NEXT_PUBLIC_API_URL = 'http://localhost:8080'
        MAIL_TRANSPORT = 'log'; MAIL_FROM = 'RE-LOOP <no-reply@localhost>'
    }
    Assert-DeploymentEnvironment $values
    foreach ($key in @('POSTGRES_PASSWORD','JWT_ACCESS_SECRET','JWT_REFRESH_SECRET','INTERNAL_SERVICE_TOKEN')) {
        $copy = $values.Clone(); $copy[$key] = 'dev_secret_change_me' + ('x' * 32)
        Expect-Failure { Assert-DeploymentEnvironment $copy } $key
    }
    $copy = $values.Clone(); $copy['JWT_REFRESH_SECRET'] = $copy['JWT_ACCESS_SECRET']
    Expect-Failure { Assert-DeploymentEnvironment $copy } 'different'
    $copy = $values.Clone(); $copy['APP_BASE_URL'] = 'http://shop.test'
    Expect-Failure { Assert-DeploymentEnvironment $copy } 'HTTPS'
    $copy['APP_BASE_URL'] = 'https://shop.test'
    Expect-Failure { Assert-DeploymentEnvironment $copy } 'smtp'
    $copy['MAIL_TRANSPORT'] = 'smtp'
    Expect-Failure { Assert-DeploymentEnvironment $copy } 'SMTP_HOST'
    $copy['SMTP_HOST'] = 'smtp.test'
    Assert-DeploymentEnvironment $copy
    $copy['SMTP_USER'] = 'sender'
    Expect-Failure { Assert-DeploymentEnvironment $copy } 'together'
    $copy['SMTP_PASS'] = 'mail-password'; $copy['SMTP_PORT'] = '70000'
    Expect-Failure { Assert-DeploymentEnvironment $copy } 'SMTP_PORT'
    Write-Host 'PASS: dotenv parsing and production environment gates'
} finally {
    Remove-Item $fixture -ErrorAction SilentlyContinue
}
