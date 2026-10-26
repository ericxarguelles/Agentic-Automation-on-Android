param([string]$Destination)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'node-runtime.ps1')
$nodePath = Get-ProjectNodeExecutable
$settingsPath = Join-Path $projectRoot 'work\windows-stack\settings.dpapi'
$auditValues = @()
if (Test-Path -LiteralPath $settingsPath) {
    $secure = Get-Content -LiteralPath $settingsPath -Raw | ConvertTo-SecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $config = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) | ConvertFrom-Json }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $secure.Dispose() }
    foreach ($field in @('pairingToken','mcpToken','ownerKey','stateKey','publicOrigin')) {
        $value = $config.$field
        if (-not [string]::IsNullOrWhiteSpace($value)) { $auditValues += [string]$value }
    }
    if ($config.publicOrigin) { $auditValues += ([Uri]$config.publicOrigin).Host }
}
if (-not $Destination) { $Destination = Join-Path $projectRoot ('outputs\publication-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')) }
$priorAudit = $env:APC_PUBLICATION_AUDIT_VALUES
try {
    # Pass comparison values only in the child environment, never command-line
    # arguments, logs or the exported source. Do not run with a shared transcript.
    $env:APC_PUBLICATION_AUDIT_VALUES = ConvertTo-Json -InputObject @($auditValues) -Compress
    & $nodePath (Join-Path $PSScriptRoot 'prepare-publication.mjs') $Destination
    if ($LASTEXITCODE -ne 0) { throw 'Publication scan blocked export. See filenames/categories only; secret values were not printed.' }
} finally {
    $env:APC_PUBLICATION_AUDIT_VALUES = $priorAudit
    $auditValues = $null; $config = $null; $value = $null
}
