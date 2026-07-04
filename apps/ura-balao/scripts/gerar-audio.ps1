# =========================================================================
# SCRIPT PARA CONVERSÃO DE ÁUDIO NO FORMATO DO ASTERISK (MONO, 8KHZ, 16-BIT)
# =========================================================================
[CmdletBinding()]
param (
    [string]$InputFile = "",
    [string]$OutputFile = ""
)

Write-Host "Conversor de Audio para Asterisk" -ForegroundColor Cyan

# Verifica se o ffmpeg está instalado
$ffmpegInstalled = $false
try {
    $null = ffmpeg -version
    $ffmpegInstalled = $true
} catch {}

if (-not $ffmpegInstalled) {
    Write-Host "AVISO: ffmpeg nao foi detectado no sistema." -ForegroundColor Yellow
    Write-Host "Para converter audios automaticamente, instale o FFmpeg (disponivel em https://ffmpeg.org/)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Como converter manualmente usando FFmpeg:" -ForegroundColor White
    Write-Host "ffmpeg -i entrada.mp3 -ar 8000 -ac 1 -ab 128k -f wav saida.wav" -ForegroundColor Green
    Write-Host ""
    Write-Host "Como converter usando Audacity:" -ForegroundColor White
    Write-Host "1. Abra o arquivo no Audacity." -ForegroundColor White
    Write-Host "2. No canto inferior esquerdo, mude a 'Taxa do Projeto (Hz)' para 8000." -ForegroundColor White
    Write-Host "3. Va em Arquivo -> Exportar -> Exportar como WAV." -ForegroundColor White
    Write-Host "4. Selecione a codificacao 'Signed 16-bit PCM' e salve." -ForegroundColor White
    Exit
}

if ([string]::IsNullOrEmpty($InputFile) -or [string]::IsNullOrEmpty($OutputFile)) {
    Write-Host "Como rodar este script:" -ForegroundColor White
    Write-Host "powershell .\gerar-audio.ps1 -InputFile 'C:\pasta\audio.mp3' -OutputFile 'C:\pasta\ura-balao-intro.wav'" -ForegroundColor Green
    Exit
}

if (-not (Test-Path $InputFile)) {
    Write-Host "ERRO: O arquivo de entrada nao existe: $InputFile" -ForegroundColor Red
    Exit
}

# Realiza a conversão
Write-Host "Convertendo '$InputFile' para '$OutputFile'..." -ForegroundColor Yellow
try {
    ffmpeg -y -i $InputFile -acodec pcm_s16le -ac 1 -ar 8000 $OutputFile
    Write-Host "Conversao concluida com sucesso!" -ForegroundColor Green
    Write-Host "O arquivo de saida esta pronto para ser copiado para /var/lib/asterisk/sounds/ no Asterisk." -ForegroundColor Green
} catch {
    Write-Host "Erro ao realizar a conversao com ffmpeg: $_" -ForegroundColor Red
}
