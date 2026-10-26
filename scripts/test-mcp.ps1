param([switch]$ReadScreen)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'node-runtime.ps1')
$nodePath = Get-ProjectNodeExecutable
$projectRoot = Split-Path -Parent $PSScriptRoot
$secureToken = Read-Host 'Paste the MCP bearer token (not the Android pairing token)' -AsSecureString
$previousToken = $env:APC_MCP_TOKEN
$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try {
    $env:APC_MCP_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
    $clientArgs = @((Join-Path $projectRoot 'server\scripts\check-mcp.mjs'))
    if ($ReadScreen) { $clientArgs += '--read' }
    & $nodePath @clientArgs
    $resultCode = $LASTEXITCODE
} finally {
    $env:APC_MCP_TOKEN = $previousToken
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
    $secureToken.Dispose()
}
exit $resultCode
