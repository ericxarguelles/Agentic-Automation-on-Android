$ErrorActionPreference = 'Stop'
$healthy = $false
$ready = $false
$connected = $false
try {
    $health = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8790/healthz' -TimeoutSec 5
    $healthy = $health.StatusCode -eq 200
} catch { Write-Output 'Health endpoint unavailable. Check the tunnel terminal.' }
try {
    $readiness = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8790/readyz' -TimeoutSec 5
    $ready = $readiness.StatusCode -eq 200
} catch { Write-Output 'Tunnel is not ready yet. Inspect the tunnel terminal for the exact reason.' }
Write-Output ('Healthy: {0}' -f $healthy)
Write-Output ('Ready: {0}' -f $ready)
try {
    $details = Invoke-RestMethod -Uri 'http://127.0.0.1:8790/health?details=true' -TimeoutSec 5
    $control = $details.components.'control-plane'
    $connected = $control.status -eq 'ok' -and $control.state -eq 'polling' -and $control.details.consecutive_failures -eq 0
    Write-Output ('Control-plane status: {0}; state: {1}; consecutive failures: {2}' -f $control.status, $control.state, $control.details.consecutive_failures)
    if ($control.details.http_status) { Write-Output ('Last control-plane HTTP status: {0}' -f $control.details.http_status) }
    if ($control.details.http_status -eq 401) {
        Write-Output 'OpenAI rejected tunnel authentication. Check the runtime API key, its organization, and Tunnels Read + Use permissions; then restart the tunnel.'
    }
} catch { Write-Output 'Detailed connection status unavailable; remote connectivity is not verified.' }
Write-Output ('Control-plane connected: {0}' -f $connected)
Write-Output 'Local operator UI: http://127.0.0.1:8790/ui'
if (-not ($healthy -and $ready -and $connected)) { exit 1 }
