$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$targets = @(
  @{ Path = (Join-Path $ProjectRoot 'data\production-server.pid'); Name = 'Production server'; Match = 'backend[\\/]server\.js' },
  @{ Path = (Join-Path $ProjectRoot 'data\quick-tunnel.pid'); Name = 'Cloudflare Tunnel'; Match = 'cloudflared\.exe' }
)

foreach ($target in $targets) {
  if (-not (Test-Path $target.Path)) { continue }
  $processId = 0
  if (-not [int]::TryParse((Get-Content -LiteralPath $target.Path -Raw).Trim(), [ref]$processId)) {
    throw "Invalid PID file: $($target.Path)"
  }
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId"
  if (-not $process) {
    Write-Output "$($target.Name) is already stopped."
    continue
  }
  if ($process.CommandLine -notmatch $target.Match) {
    throw "PID $processId no longer matches $($target.Name); refusing to stop it."
  }
  Stop-Process -Id $processId -Force
  Write-Output "Stopped $($target.Name) (PID $processId)"
}

foreach ($taskName in @('Trip Coordination Demo', 'Trip Coordination Demo Tunnel')) {
  if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Output "Removed auto-start task: $taskName"
  }
}

Start-Sleep -Seconds 1
if (Get-NetTCPConnection -State Listen -LocalPort 3103 -ErrorAction SilentlyContinue) {
  throw 'Port 3103 is still listening.'
}
Write-Output 'Production server and tunnel are stopped.'
