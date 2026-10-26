param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$name = 'Android Phone Control'
if ($Remove) { Unregister-ScheduledTask -TaskName $name -Confirm:$false; Write-Output 'Removed login startup task. Running processes and Tailscale routes were not stopped.'; exit 0 }
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'work\windows-stack\settings.dpapi'))) { throw 'Run start-windows-stack.ps1 interactively and verify it before enabling login startup.' }
if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) { throw 'A task with this name already exists. Inspect it before replacing it.' }
$launcher = Join-Path $PSScriptRoot 'start-windows-stack.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $launcher + '" -Unattended') -WorkingDirectory $projectRoot
$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -RestartCount 20 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Owner phone-control host; runs after Windows login, requires Tailscale and this project folder.' | Out-Null
Write-Output 'Registered login startup. It will run at your next Windows login; current services were not restarted.'
