function Get-ProjectNodeExecutable {
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeCommand) { return $nodeCommand.Source }
    $bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    if (Test-Path -LiteralPath $bundledNode) { return $bundledNode }
    throw 'Node.js 22 or newer is required. Install Node.js and reopen the terminal.'
}
