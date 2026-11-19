$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$startScript = Join-Path $PSScriptRoot 'start-production.ps1'
$tunnelScript = Join-Path $PSScriptRoot 'start-quick-tunnel.ps1'
$actions = @(
  (New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`""),
  (New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$tunnelScript`"")
)
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName 'Trip Coordination Demo' `
  -Description 'Start the local trip coordination demo on user sign-in.' `
  -Action $actions[0] -Trigger $trigger -Settings $settings -Force | Out-Null
Register-ScheduledTask -TaskName 'Trip Coordination Demo Tunnel' `
  -Description 'Start the Cloudflare Quick Tunnel on user sign-in.' `
  -Action $actions[1] -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Output 'Installed per-user logon tasks for the local server and Cloudflare Quick Tunnel.'
