# =========================================================================
# SCRIPT DE DIAGNÓSTICO E BUSCA DE PORTA SIP ATIVA (UDP)
# =========================================================================
[CmdletBinding()]
param (
    [string]$TargetHost = "bala.pbx.telefoniafacil.com.br",
    [string]$CustomPort = ""
)

Write-Host "Iniciando Diagnostico SIP para o host: $TargetHost" -ForegroundColor Cyan

# Definir as portas a serem testadas
$portsToTest = @(5060, 5160, 5080, 5061)
if (-not [string]::IsNullOrEmpty($CustomPort)) {
    $portsToTest = @([int]$CustomPort)
    Write-Host "Testando apenas a porta manual: $CustomPort" -ForegroundColor Yellow
} else {
    Write-Host "Testando portas provaveis: 5060, 5160, 5080, 5061..." -ForegroundColor Yellow
}

# Resolve o IP do host
try {
    $ipAddresses = [System.Net.Dns]::GetHostAddresses($TargetHost)
    $targetIP = $ipAddresses[0].IPAddressToString
    Write-Host "Host $TargetHost resolvido para o IP: $targetIP" -ForegroundColor Green
} catch {
    Write-Host "ERRO: Nao foi possivel resolver o host $TargetHost. Verifique sua conexao de rede." -ForegroundColor Red
    Exit
}

# Função para enviar um pacote OPTIONS SIP via UDP e aguardar resposta
function Test-SipPortUdp {
    param (
        [string]$ip,
        [int]$port
    )

    $udpClient = New-Object System.Net.Sockets.UdpClient
    $udpClient.Client.ReceiveTimeout = 2000 # 2 segundos de timeout
    
    # Mensagem SIP OPTIONS padrão
    $sipOptions = "OPTIONS sip:$TargetHost`:$port SIP/2.0`r`n" +
                  "Via: SIP/2.0/UDP 127.0.0.1:5060;rport;branch=z9hG4bK" + [Guid]::NewGuid().ToString().Substring(0,8) + "`r`n" +
                  "Max-Forwards: 70`r`n" +
                  "To: <sip:$TargetHost`:$port>`r`n" +
                  "From: <sip:anonymous@anonymous.invalid>;tag=" + Get-Random + "`r`n" +
                  "Call-ID: " + [Guid]::NewGuid().ToString() + "`r`n" +
                  "CSeq: 1 OPTIONS`r`n" +
                  "User-Agent: UraBalaoSipProbe`r`n" +
                  "Content-Length: 0`r`n`r`n"

    $bytes = [System.Text.Encoding]::UTF8.GetBytes($sipOptions)
    
    try {
        Write-Host "Enviando probe SIP OPTIONS para $ip`:$port..." -ForegroundColor Gray
        $sent = $udpClient.Send($bytes, $bytes.Length, $ip, $port)
        
        # Aguarda resposta
        $remoteEP = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
        $receiveBytes = $udpClient.Receive([ref]$remoteEP)
        $response = [System.Text.Encoding]::UTF8.GetString($receiveBytes)
        
        $udpClient.Close()
        
        if ($response -match "^SIP/2.0") {
            $firstLine = $response.Split("`n")[0].Trim()
            return @{
                Status = "RESPONDEU";
                Details = "Retorno: $firstLine";
                Success = $true
            }
        }
        return @{
            Status = "RESPONDEU_DESCONHECIDO";
            Details = "Resposta nao-SIP recebida";
            Success = $true
        }
    } catch {
        $udpClient.Close()
        return @{
            Status = "NAO_RESPONDEU";
            Details = $_.Exception.Message;
            Success = $false
        }
    }
}

# Executa os testes
$results = @()
$foundActive = $false

foreach ($port in $portsToTest) {
    Write-Host "`n--- Testando Porta $port ---" -ForegroundColor Cyan
    $res = Test-SipPortUdp -ip $targetIP -port $port
    
    if ($res.Success) {
        Write-Host "RESULTADO: Porta $port RESPONDEU! ($($res.Details))" -ForegroundColor Green
        $foundActive = $true
        $results += [PSCustomObject]@{
            Porta = $port
            Status = "Porta respondeu"
            Detalhes = $res.Details
        }
    } else {
        Write-Host "RESULTADO: Porta $port NAO respondeu (Timeout)." -ForegroundColor Red
        $results += [PSCustomObject]@{
            Porta = $port
            Status = "Porta nao respondeu"
            Detalhes = "Timeout"
        }
    }
}

Write-Host "`n=== RESUMO DO DIAGNOSTICO ===" -ForegroundColor Cyan
$results | Format-Table -AutoSize

if ($foundActive) {
    Write-Host "SUCESSO: Pelo menos uma porta SIP ativa foi encontrada!" -ForegroundColor Green
    Write-Host "Configure a porta encontrada em seu arquivo .env:" -ForegroundColor Yellow
    Write-Host "SIP_PORT=porta_encontrada" -ForegroundColor Yellow
} else {
    Write-Host "AVISO: Nenhuma porta SIP respondeu. Verifique se o provedor SIP da Telefonia Facil esta online ou se seu provedor de internet bloqueia conexoes SIP de saida." -ForegroundColor Yellow
}
