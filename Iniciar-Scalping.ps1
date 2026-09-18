$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) { throw 'Instala Node.js 22 o superior antes de iniciar.' }
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules/lightweight-charts'))) {
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias.' }
}
$scalpingUrl = 'http://127.0.0.1:4173'
try {
    $response = Invoke-WebRequest -Uri $scalpingUrl -TimeoutSec 2 -UseBasicParsing
    if ($response.Content -match 'Scalping Lab') { Start-Process $scalpingUrl; exit }
    throw 'El puerto 4173 lo está usando otra aplicación.'
} catch {
    if ($_.Exception.Message -like '*otra aplicación*') { throw }
}
$scalpingLog = Join-Path $PSScriptRoot 'scalping.log'
$scalpingErrors = Join-Path $PSScriptRoot 'scalping-error.log'
$scalpingServerPath = Join-Path $PSScriptRoot 'server.mjs'
Start-Process -FilePath $nodeCommand.Source -ArgumentList @('"' + $scalpingServerPath + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput $scalpingLog -RedirectStandardError $scalpingErrors
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 300
    try {
        $response = Invoke-WebRequest -Uri $scalpingUrl -TimeoutSec 2 -UseBasicParsing
        if ($response.Content -match 'Scalping Lab') { Start-Process $scalpingUrl; exit }
    } catch { }
}
throw 'No se pudo iniciar. Revisa scalping-error.log en la carpeta del programa.'
