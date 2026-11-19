$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$cloudflared = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
if (-not (Test-Path $cloudflared)) {
  $command = Get-Command cloudflared.exe -ErrorAction SilentlyContinue
  if (-not $command) { throw 'cloudflared.exe was not found.' }
  $cloudflared = $command.Source
}

$pidFile = Join-Path $ProjectRoot 'data\quick-tunnel.pid'
if (Test-Path $pidFile) {
  $existingPid = [int](Get-Content $pidFile -Raw)
  if (Get-Process -Id $existingPid -ErrorAction SilentlyContinue) {
    Write-Output "Quick Tunnel is already running (PID $existingPid)."
    exit 0
  }
}

$logRoot = Join-Path $ProjectRoot 'logs'
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
$outLog = Join-Path $logRoot 'quick-tunnel.out.log'
$errLog = Join-Path $logRoot 'quick-tunnel.err.log'
$process = Start-Process -FilePath $cloudflared `
  -ArgumentList @('tunnel', '--url', 'http://127.0.0.1:3103') `
  -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput $outLog -RedirectStandardError $errLog
Set-Content -Path $pidFile -Value $process.Id

for ($attempt = 0; $attempt -lt 30; $attempt++) {
  Start-Sleep -Seconds 1
  $log = (Get-Content $outLog, $errLog -Raw -ErrorAction SilentlyContinue) -join "`n"
  if ($log -match 'https://(?!api\.)[a-z0-9-]+\.trycloudflare\.com') {
    Write-Output "Quick Tunnel is running: $($Matches[0])"
    exit 0
  }
  if ($process.HasExited) { throw "cloudflared exited. Check $errLog." }
}
throw "Quick Tunnel did not become ready. Check $errLog."
