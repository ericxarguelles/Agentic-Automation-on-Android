param([switch]$ShowSecrets, [switch]$Status, [switch]$Unattended)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$stateDir = Join-Path $projectRoot 'work\windows-stack'
$settingsPath = Join-Path $stateDir 'settings.dpapi'
$tailscale = Get-Command tailscale -ErrorAction SilentlyContinue
$tailscalePath = if ($tailscale) { $tailscale.Source } else { 'C:\Program Files\Tailscale\tailscale.exe' }
if (-not (Test-Path -LiteralPath $tailscalePath)) { throw 'Install Tailscale and sign in first.' }
. (Join-Path $PSScriptRoot 'node-runtime.ps1')
$nodePath = Get-ProjectNodeExecutable
if ($Status) {
    Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in 8787,8788,8789 } | Select-Object LocalAddress,LocalPort
    & $tailscalePath serve status --json
    try { $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8789/.well-known/oauth-authorization-server' -TimeoutSec 5; Write-Output ('Local OAuth metadata: HTTP ' + $r.StatusCode) }
    catch { Write-Output 'Local OAuth metadata unavailable.' }
    exit 0
}
if ($Unattended -and $ShowSecrets) { throw 'Secrets cannot be printed in unattended mode.' }
if ($Unattended -and -not (Test-Path -LiteralPath $settingsPath)) { throw 'Run the launcher interactively once before enabling automatic startup.' }
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
$identityHash = [Convert]::ToBase64String([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($projectRoot))).Replace('/', '_')
$mutex = [Threading.Mutex]::new($false, ('Local\AndroidPhoneControl-' + $identityHash))
$locked = $false
try {
    if (-not $ShowSecrets) {
        try { $locked = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $locked = $true }
        if (-not $locked) { throw 'The managed stack is already running.' }
    }
    if (Test-Path -LiteralPath $settingsPath) {
        $secure = Get-Content -LiteralPath $settingsPath -Raw | ConvertTo-SecureString
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        try { $config = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) | ConvertFrom-Json }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $secure.Dispose() }
    } else {
        $tailStatus = (& $tailscalePath status --json | ConvertFrom-Json)
        if ($LASTEXITCODE -ne 0 -or $tailStatus.BackendState -ne 'Running' -or -not $tailStatus.Self.DNSName) { throw 'Connect Tailscale first.' }
        function New-RandomSecret([int]$Count = 32) {
            $bytes = New-Object byte[] $Count
            $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
            try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
            return $bytes
        }
        $config = [pscustomobject]@{
            publicOrigin = 'https://' + $tailStatus.Self.DNSName.TrimEnd('.')
            pairingToken = ([BitConverter]::ToString((New-RandomSecret 24))).Replace('-', '').ToLowerInvariant()
            mcpToken = ([BitConverter]::ToString((New-RandomSecret 24))).Replace('-', '').ToLowerInvariant()
            ownerKey = [Convert]::ToBase64String((New-RandomSecret))
            stateKey = [Convert]::ToBase64String((New-RandomSecret))
        }
        $secure = ($config | ConvertTo-Json -Compress) | ConvertTo-SecureString -AsPlainText -Force
        try { [IO.File]::WriteAllText($settingsPath, ($secure | ConvertFrom-SecureString)) } finally { $secure.Dispose() }
        Write-Output 'Created Windows-account-encrypted settings. First migration needs new pairing and OAuth approval.'
    }
    if ($ShowSecrets) {
        Write-Output ('Android address: ' + $config.publicOrigin + ':8443')
        Write-Output ('Pairing token: ' + $config.pairingToken)
        Write-Output ('Owner approval key: ' + $config.ownerKey)
        Write-Output 'Keep these private. This command does not start services.'
        exit 0
    }
    $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in 8787,8788,8789 })
    if ($listeners.Count) { throw 'Stop the old Node server and OAuth gateway terminals with Ctrl+C before starting the managed stack. Do not run both.' }
    $tailStatus = (& $tailscalePath status --json | ConvertFrom-Json)
    if ($LASTEXITCODE -ne 0 -or $tailStatus.BackendState -ne 'Running') { throw 'Connect Tailscale first.' }
    if (('https://' + $tailStatus.Self.DNSName.TrimEnd('.')) -ne $config.publicOrigin) { throw 'Tailscale hostname changed. Review the stored origin and OAuth connections before migration.' }
    $routes = (& $tailscalePath serve status --json | ConvertFrom-Json)
    if ($LASTEXITCODE -ne 0) { throw 'Could not inspect Tailscale routes.' }
    if ($routes.Foreground -and @($routes.Foreground.PSObject.Properties).Count) { throw 'Stop the old foreground Funnel/Serve terminals with Ctrl+C first. Existing foreground routes were not changed.' }
    $hostName = ([Uri]$config.publicOrigin).Host
    if ($routes.AllowFunnel -and $routes.AllowFunnel.PSObject.Properties[($hostName + ':8443')].Value) { throw '8443 is public. Disable that Funnel route before using the private bridge.' }
    foreach ($port in @(443,8443)) {
        $entry = if ($routes.Web) { $routes.Web.PSObject.Properties[($hostName + ':' + $port)].Value } else { $null }
        if ($entry) {
            $expectedProxy = if ($port -eq 443) { 'http://127.0.0.1:8789' } else { 'http://127.0.0.1:8787' }
            $handlers = @($entry.Handlers.PSObject.Properties)
            if ($handlers.Count -ne 1 -or $handlers[0].Name -ne '/' -or $handlers[0].Value.Proxy -ne $expectedProxy) { throw "Existing HTTPS $port route differs. Review it manually; nothing was replaced." }
        }
        if ($routes.TCP -and $routes.TCP.PSObject.Properties[([string]$port)] -and -not $entry) { throw "Existing TCP $port route is not this stack's HTTPS proxy." }
    }
    & $tailscalePath funnel --bg --https=443 http://127.0.0.1:8789
    if ($LASTEXITCODE -ne 0) { throw 'Funnel setup failed. Complete Tailscale permissions interactively and retry.' }
    & $tailscalePath serve --bg --https=8443 http://127.0.0.1:8787
    if ($LASTEXITCODE -ne 0) { throw 'Private Serve setup failed. Public Funnel may remain configured; inspect status before retrying.' }
    $prior = $env:APC_STACK_CONFIG
    try {
        $env:APC_STACK_CONFIG = $config | ConvertTo-Json -Compress
        do {
            if ($Unattended) {
                & $nodePath (Join-Path $projectRoot 'server\scripts\start-windows-stack.mjs') *>> (Join-Path $stateDir 'host.log')
            } else { & $nodePath (Join-Path $projectRoot 'server\scripts\start-windows-stack.mjs') }
            $resultCode = $LASTEXITCODE
            if ($Unattended) { Start-Sleep -Seconds 5 }
        } while ($Unattended)
    } finally { $env:APC_STACK_CONFIG = $prior }
    exit $resultCode
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
