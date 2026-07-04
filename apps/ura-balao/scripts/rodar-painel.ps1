# =========================================================================
# SCRIPT PARA RODAR O PAINEL URA-ATIVA-BALAO
# =========================================================================
Write-Host "Iniciando o servidor da URA Ativa..." -ForegroundColor Cyan
Write-Host "Painel esperado em http://localhost:3012" -ForegroundColor Yellow

$backendDir = Join-Path $PSScriptRoot "..\backend"
Push-Location $backendDir

try {
    Write-Host "Executando 'npm start' na pasta backend..." -ForegroundColor Yellow
    npm start
} catch {
    Write-Host "Erro ao iniciar o servidor." -ForegroundColor Red
} finally {
    Pop-Location
}
