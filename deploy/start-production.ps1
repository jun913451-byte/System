$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

if (-not (Test-Path (Join-Path $ProjectRoot 'dist\index.html'))) {
  throw 'Production build is missing. Run npm run build first.'
}

$port = 3103
$listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
if ($listener) {
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$port/" -TimeoutSec 3
    if ($response.StatusCode -eq 200) {
      Write-Output "Production server is already running at http://127.0.0.1:$port"
      exit 0
    }
  } catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 401) {
      Write-Output "Production server is already running at http://127.0.0.1:$port"
      exit 0
    }
  }
  throw "Port $port is already in use by another process."
}

New-Item -ItemType Directory -Force -Path (Join-Path $ProjectRoot 'logs') | Out-Null
$env:NODE_ENV = 'production'
$env:APP_AUTH_DISABLED = '1'
$env:HOST = '127.0.0.1'
$env:PORT = "$port"
$process = Start-Process -FilePath 'node.exe' `
  -ArgumentList @('--experimental-sqlite', 'backend/server.js') `
  -WorkingDirectory $ProjectRoot `
  -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput (Join-Path $ProjectRoot 'logs\production.out.log') `
  -RedirectStandardError (Join-Path $ProjectRoot 'logs\production.err.log')
Set-Content -Path (Join-Path $ProjectRoot 'data\production-server.pid') -Value $process.Id

for ($attempt = 0; $attempt -lt 30; $attempt++) {
  Start-Sleep -Seconds 1
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$port/" -TimeoutSec 2
    if ($response.StatusCode -eq 200) {
      Write-Output "Production server is ready at http://127.0.0.1:$port (PID $($process.Id))"
      exit 0
    }
  } catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 401) {
      Write-Output "Production server is ready at http://127.0.0.1:$port (PID $($process.Id))"
      exit 0
    }
  }
  if ($process.HasExited) {
    Get-Content (Join-Path $ProjectRoot 'logs\production.err.log')
    throw 'Production server exited during startup.'
  }
}
throw "Production server did not become ready. Check logs\production.err.log."
