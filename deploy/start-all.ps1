$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot

& (Join-Path $PSScriptRoot 'start-production.ps1')
& (Join-Path $PSScriptRoot 'start-quick-tunnel.ps1')

Write-Output 'Public access: no login required.'
