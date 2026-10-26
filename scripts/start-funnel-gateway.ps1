param([string]$PublicOrigin)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'node-runtime.ps1')
$nodePath = Get-ProjectNodeExecutable
if (-not $PublicOrigin) {
    $tailscale = Get-Command tailscale -ErrorAction SilentlyContinue
    $tailscalePath = if ($tailscale) { $tailscale.Source } else { 'C:\Program Files\Tailscale\tailscale.exe' }
    if (-not (Test-Path -LiteralPath $tailscalePath)) { throw 'Install Tailscale or provide -PublicOrigin https://your-host.your-tailnet.ts.net' }
    $status = (& $tailscalePath status --json | ConvertFrom-Json)
    if ($LASTEXITCODE -ne 0 -or $status.BackendState -ne 'Running' -or -not $status.Self.DNSName) { throw 'Sign in and connect Tailscale first.' }
    $PublicOrigin = 'https://' + $status.Self.DNSName.TrimEnd('.')
}
$uri = [Uri]$PublicOrigin
if ($uri.Scheme -ne 'https' -or $uri.AbsolutePath -ne '/' -or $uri.Query -or $uri.Fragment -or $uri.UserInfo -or -not $uri.IsDefaultPort) { throw 'Use only the HTTPS hostname, without a path.' }
$previousToken = $env:APC_MCP_TOKEN
$previousOrigin = $env:APC_PUBLIC_ORIGIN
try {
    $secureToken = Read-Host 'MCP bearer token from the running Node.js server (not the Android pairing token)' -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    try { $env:APC_MCP_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $secureToken.Dispose() }
    & $nodePath (Join-Path $projectRoot 'server\scripts\check-mcp.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Local MCP preflight failed. Check the running server and token.' }
    $env:APC_PUBLIC_ORIGIN = $uri.GetLeftPart([UriPartial]::Authority)
    & $nodePath (Join-Path $projectRoot 'server\scripts\start-oauth-gateway.mjs')
    $resultCode = $LASTEXITCODE
} finally {
    $env:APC_MCP_TOKEN = $previousToken
    $env:APC_PUBLIC_ORIGIN = $previousOrigin
}
exit $resultCode
