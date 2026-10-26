param([switch]$Remove)
$ErrorActionPreference = 'Stop'
if (-not $Remove) { throw 'Automatic startup is disabled. Run scripts/start-windows-stack.ps1 manually.' }
$name = 'Android Phone Control'
if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $name -Confirm:$false
    Write-Output 'Removed login startup task. Running processes and Tailscale routes were not stopped.'
} else {
    Write-Output 'No Android Phone Control login startup task exists.'
}
