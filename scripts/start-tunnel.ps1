param(
    [string]$TunnelId,
    [switch]$DoctorOnly
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$binary = Join-Path $projectRoot 'work\tools\tunnel-client\tunnel-client.exe'
$profile = Join-Path $projectRoot 'deploy\tunnel-client.yaml'
if (-not (Test-Path -LiteralPath $binary)) {
    throw 'Run scripts/install-tunnel-client.ps1 first.'
}
. (Join-Path $PSScriptRoot 'node-runtime.ps1')
$nodePath = Get-ProjectNodeExecutable
if (-not $TunnelId) { $TunnelId = Read-Host 'Tunnel ID from your Platform tunnel settings' }
if ($TunnelId -notmatch '^tunnel_(?:[a-z0-9]{4}_)?[a-z0-9]{32}$') { throw 'Use the complete tunnel ID from Platform (including its optional namespace).' }

function Read-LocalSecret([string]$Prompt) {
    $secureValue = Read-Host $Prompt -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $secureValue.Dispose() }
}

$names = @('CONTROL_PLANE_API_KEY', 'CONTROL_PLANE_TUNNEL_ID', 'APC_TUNNEL_MCP_AUTHORIZATION',
    'APC_MCP_TOKEN', 'MCP_EXTRA_HEADERS', 'MCP_DISCOVERY_EXTRA_HEADERS')
$previous = @{}
foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$resultCode = 1
try {
    $env:APC_MCP_TOKEN = Read-LocalSecret 'MCP bearer token from the running phone-control server'
    if (-not $env:APC_MCP_TOKEN) { throw 'MCP bearer token is required.' }
    & $nodePath (Join-Path $projectRoot 'server\scripts\check-mcp.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Local MCP check failed. Start the server and use its current MCP token.' }

    $env:CONTROL_PLANE_API_KEY = Read-LocalSecret 'OpenAI tunnel runtime API key (Tunnels Read + Use; not an admin key)'
    if (-not $env:CONTROL_PLANE_API_KEY) { throw 'Tunnel runtime key is required.' }
    $env:CONTROL_PLANE_TUNNEL_ID = $TunnelId
    $env:APC_TUNNEL_MCP_AUTHORIZATION = 'Bearer ' + $env:APC_MCP_TOKEN
    $env:MCP_EXTRA_HEADERS = 'Authorization: env:APC_TUNNEL_MCP_AUTHORIZATION'
    $env:MCP_DISCOVERY_EXTRA_HEADERS = 'Authorization: env:APC_TUNNEL_MCP_AUTHORIZATION'
    $commonArgs = @('--profile-file', $profile,
        '--control-plane.base-url', 'https://api.openai.com',
        '--control-plane.api-key', 'env:CONTROL_PLANE_API_KEY',
        '--mcp.server-url', 'http://127.0.0.1:8788/mcp',
        '--health.listen-addr', '127.0.0.1:8790', '--allow-remote-ui=false', '--log.file=')
    & $binary doctor @commonArgs --explain
    if ($LASTEXITCODE -ne 0) { throw 'Tunnel diagnostics failed. Resolve the reported account, permissions, or connection issue before running.' }
    $resultCode = 0
    if (-not $DoctorOnly) {
        Write-Output 'Starting private relay. Keep this terminal open. Check readiness using scripts/check-tunnel.ps1.'
        & $binary run @commonArgs
        $resultCode = $LASTEXITCODE
    }
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
}
exit $resultCode
