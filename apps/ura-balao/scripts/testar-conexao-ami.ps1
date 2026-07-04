# =========================================================================
# SCRIPT PARA TESTAR CONEXÃO AMI DO ASTERISK (PORTA 5038)
# =========================================================================
Write-Host "Iniciando teste de conexao AMI (Asterisk Manager Interface)..." -ForegroundColor Cyan

# Carrega configurações do .env se existir
$envPath = Join-Path $PSScriptRoot "..\backend\.env"
$amiHost = "127.0.0.1"
$amiPort = 5038

if (Test-Path $envPath) {
    Get-Content $envPath | ForEach-Object {
        if ($_ -match "^ASTERISK_AMI_HOST=(.+)$") { $amiHost = $Matches[1].Trim() }
        if ($_ -match "^ASTERISK_AMI_PORT=(.+)$") { $amiPort = [int]$Matches[1].Trim() }
    }
}

Write-Host "Testando conexao TCP com $amiHost na porta $amiPort..." -ForegroundColor Yellow

$socket = New-Object System.Net.Sockets.TcpClient
$connectionResult = $socket.BeginConnect($amiHost, $amiPort, $null, $null)
$success = $connectionResult.AsyncWaitHandle.WaitOne(3000, $true)

if ($success) {
    try {
        $socket.EndConnect($connectionResult)
        Write-Host "SUCESSO: Porta AMI ($amiPort) esta aberta e respondendo!" -ForegroundColor Green
        
        # Lê o banner inicial do Asterisk
        $stream = $socket.GetStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $banner = $reader.ReadLine()
        Write-Host "Banner retornado pelo Asterisk: $banner" -ForegroundColor Green
        
        $socket.Close()
    } catch {
        Write-Host "ERRO: A porta conectou mas falhou ao ler dados. Erro: $_" -ForegroundColor Red
    }
} else {
    Write-Host "FALHA: Nao foi possivel conectar a $amiHost na porta $amiPort." -ForegroundColor Red
    Write-Host "Verificacoes recomendadas:" -ForegroundColor Yellow
    Write-Host "1. O Asterisk esta rodando?" -ForegroundColor Yellow
    Write-Host "2. O AMI esta habilitado no manager.conf (enabled = yes)?" -ForegroundColor Yellow
    Write-Host "3. A porta 5038 esta liberada no firewall do sistema?" -ForegroundColor Yellow
}
