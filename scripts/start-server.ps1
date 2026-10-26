$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'node-runtime.ps1')
$nodePath = Get-ProjectNodeExecutable
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'server\node_modules\@modelcontextprotocol\sdk\package.json'))) {
    throw 'Server dependencies are missing. In the server folder run: pnpm install --frozen-lockfile --ignore-scripts'
}
& $nodePath (Join-Path $projectRoot 'server\src\index.mjs')
