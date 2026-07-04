# =========================================================================
# SCRIPT DE GERAÇÃO DE TEXT-TO-SPEECH (TTS) EM PORTUGUÊS PARA A URA DO BALÃO
# Prioriza F5-TTS local, com fallback para Piper e, por último, voz do Windows
# =========================================================================

Write-Host "Iniciando geração de áudios TTS para o Balão da Informática Castelo..." -ForegroundColor Cyan

# 1. Definir os textos e arquivos correspondentes
$empresa = "Balão da Informática Castelo"
$site = "www.balao.info"

$audioList = @{
    "ura-balao-intro.wav" = "Olá, tudo bem? Aqui é a equipe do $empresa. Temos uma oferta rápida para você."
    
    # 5 Produtos promocionais
    "ura-balao-motivo-ssd.wav" = "Temos uma oferta especial para deixar seu computador mais rápido. SSD Kingston N V 2 de um tera, N V M e, por trezentos e oitenta e nove reais à vista no $empresa."
    "ura-balao-motivo-memoria.wav" = "Temos uma oferta para melhorar o desempenho do seu computador. Memória RAM Corsair Vengeance, dezesseis giga, D D R quatro, por duzentos e sessenta e nove reais à vista no $empresa."
    "ura-balao-motivo-gpu.wav" = "Temos uma oferta para quem busca mais desempenho em jogos. Placa de vídeo R T X 4060 Galax, oito giga, por mil oitocentos e noventa reais à vista no $empresa."
    "ura-balao-motivo-monitor.wav" = "Temos uma oferta para renovar sua experiência no dia a dia e nos jogos. Monitor Gamer L G Ultragear, vinte e quatro polegadas, I P S, cento e quarenta e quatro hertz, por oitocentos e quarenta e nove reais."
    "ura-balao-motivo-cpu.wav" = "Temos uma oferta para turbinar o seu computador. Processador A M D Ryzen 5 5600, com seis núcleos e doze threads, por setecentos e vinte e nove reais à vista no $empresa."

    # Motivos legados / fallback (mantém compatibilidade com o painel e campanhas antigas)
    "ura-balao-motivo-orcamento.wav" = "A gente está entrando em contato por uma oferta especial do $empresa. Para ver mais promoções, acesse $site."
    "ura-balao-motivo-assistencia.wav" = "Aqui é do $empresa. Se você precisa de suporte ou assistência técnica, fale com a nossa equipe. Mais informações em $site."
    "ura-balao-motivo-cobranca.wav" = "Aqui é do $empresa. Esta é uma mensagem de lembrete sobre uma pendência. Se preferir, fale com um atendente para confirmar os dados."
    "ura-balao-motivo-posvenda.wav" = "Aqui é do $empresa. Queremos saber como foi sua experiência. Se preferir receber o link de avaliação no WhatsApp, escolha a opção 2."
    "ura-balao-motivo-entrega.wav" = "Aqui é do $empresa. Se a sua compra está pronta para retirada, fale com um atendente para confirmar os detalhes."
    
    # Opções e Ações da URA
    "ura-balao-opcoes.wav" = "Para falar com um atendente, digite 1. Para receber o link no WhatsApp, digite 2. Para remover seu número da nossa lista, digite 9."
    "ura-balao-atendente.wav" = "Aguarde um momento. Estamos transferindo você para um dos nossos atendentes."
    "ura-balao-whatsapp.wav" = "Certo. Em instantes enviaremos o link no seu WhatsApp. Você também pode acessar $site. Obrigado!"
    "ura-balao-bloqueado.wav" = "Entendido. Seu número foi removido da nossa lista de ofertas. O $empresa agradece."
    "ura-balao-timeout.wav" = "Não identificamos nenhuma tecla digitada. Para falar com a gente, acesse $site. Obrigado!"
    "ura-balao-invalido.wav" = "Opção inválida. Para falar com um atendente, digite 1. Ou acesse $site."
}

# 2. Criar diretório temporário para os arquivos no Windows
$tempDir = Join-Path $PSScriptRoot "temp_tts"
if (-not (Test-Path $tempDir)) {
    New-Item -ItemType Directory -Path $tempDir | Out-Null
}

function Get-FirstExistingFile {
    param(
        [string[]]$Candidates
    )

    foreach ($candidate in $Candidates) {
        if ($candidate -and (Test-Path $candidate)) {
            return $candidate
        }
    }

    return $null
}

function Test-F5ModelAvailable {
    param(
        [string]$ModelRoot
    )

    if (-not (Test-Path $ModelRoot)) {
        return $false
    }

    $match = Get-ChildItem -Path $ModelRoot -Recurse -File | Where-Object {
        @(".safetensors", ".pt", ".ckpt") -contains $_.Extension.ToLowerInvariant()
    } | Select-Object -First 1

    return $null -ne $match
}

# 3. Inicializar mecanismo TTS preferencial
$pythonExe = Join-Path $env:LOCALAPPDATA "Programs\Python\Python311\python.exe"
$f5Script = Join-Path $PSScriptRoot "f5_tts_generate.py"
$f5ModelRoot = Join-Path $PSScriptRoot "tools\f5tts\model"
$f5Reference = Get-FirstExistingFile -Candidates @(
    (Join-Path $PSScriptRoot "tools\f5tts\reference\current_ref.wav"),
    (Join-Path $PSScriptRoot "tools\f5tts\reference\ref_ptbr_default.wav")
)
$ffmpegRoot = Join-Path $PSScriptRoot "tools\ffmpeg"
$ffmpegBin = $null
if (Test-Path $ffmpegRoot) {
    $ffmpegDir = Get-ChildItem $ffmpegRoot -Directory | Select-Object -First 1
    if ($ffmpegDir -and (Test-Path (Join-Path $ffmpegDir.FullName "bin\ffmpeg.exe"))) {
        $ffmpegBin = Join-Path $ffmpegDir.FullName "bin"
        $env:PATH = "$ffmpegBin;$env:PATH"
    }
}
$useF5 = (Test-Path $pythonExe) -and (Test-Path $f5Script) -and (Test-F5ModelAvailable -ModelRoot $f5ModelRoot) -and $null -ne $f5Reference
$piperExe = Join-Path $PSScriptRoot "tools\piper\piper.exe"
$piperModel = Join-Path $PSScriptRoot "tools\piper\pt_BR-faber-medium.onnx"
$usePiper = (Test-Path $piperExe) -and (Test-Path $piperModel)

if (-not $useF5 -and -not $usePiper) {
    try {
        Add-Type -AssemblyName System.Speech
        $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
        $synth.SelectVoice("Microsoft Maria Desktop")
        $synth.Rate = -1
    } catch {
        Write-Host "ERRO: Piper local não encontrado e a voz do Windows também não carregou." -ForegroundColor Red
        Exit 1
    }
}

# 4. Gerar os áudios temporários e converter usando SOX do WSL
$wslSoundDir = "/usr/share/asterisk/sounds"
$wslSoundDirEn = "/usr/share/asterisk/sounds/en"
$wslSoundDirPtBr = "/usr/share/asterisk/sounds/pt_BR"

wsl -u root sh -lc "mkdir -p '$wslSoundDir' '$wslSoundDirEn' '$wslSoundDirPtBr'"
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO: Não foi possível criar diretórios de som no WSL." -ForegroundColor Red
    Exit 1
}

foreach ($fileName in $audioList.Keys) {
    $text = $audioList[$fileName]
    $winTempFile = Join-Path $tempDir $fileName
    $drive = $winTempFile.Substring(0, 1).ToLower()
    $rest = $winTempFile.Substring(2).Replace('\', '/').TrimStart('/')
    $wslTempFile = "/mnt/$drive/$rest"
    $wslDestFile = "$wslSoundDir/$fileName"
    
    Write-Host "Gerando áudio para: $fileName -> '$text'" -ForegroundColor Yellow
    
    if ($useF5) {
        & $pythonExe $f5Script --text $text --output $winTempFile | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "AVISO: F5-TTS falhou para $fileName. Tentando fallback..." -ForegroundColor Yellow
            if ($usePiper) {
                $text | & $piperExe --model $piperModel --output_file $winTempFile | Out-Null
            } else {
                $synth.SetOutputToWaveFile($winTempFile)
                $synth.Speak($text)
            }
        }
    } elseif ($usePiper) {
        $text | & $piperExe --model $piperModel --output_file $winTempFile | Out-Null
    } else {
        $synth.SetOutputToWaveFile($winTempFile)
        $synth.Speak($text)
    }

    # Converte o áudio para o formato exigido pelo Asterisk (8000Hz, mono, PCM)
    wsl -u root sox $wslTempFile -r 8000 -c 1 $wslDestFile
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERRO: Falha ao converter áudio via SOX: $fileName" -ForegroundColor Red
        Exit 1
    }

    wsl -u root sh -lc "cp '$wslDestFile' '$wslSoundDirEn/$fileName' && cp '$wslDestFile' '$wslSoundDirPtBr/$fileName'"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERRO: Falha ao copiar áudio para pastas de idioma: $fileName" -ForegroundColor Red
        Exit 1
    }
}

if ($synth) {
    $synth.Dispose()
}

# 5. Ajustar permissões no Asterisk WSL
Write-Host "Ajustando permissões dos arquivos no Asterisk..." -ForegroundColor Cyan
wsl -u root sh -lc "chown asterisk:asterisk '$wslSoundDir'/ura-balao-*.wav '$wslSoundDirEn'/ura-balao-*.wav '$wslSoundDirPtBr'/ura-balao-*.wav 2>/dev/null || true"
wsl -u root sh -lc "chmod 644 '$wslSoundDir'/ura-balao-*.wav '$wslSoundDirEn'/ura-balao-*.wav '$wslSoundDirPtBr'/ura-balao-*.wav 2>/dev/null || true"

# 6. Limpar arquivos temporários do Windows
Write-Host "Limpando diretório temporário..." -ForegroundColor Cyan
Remove-Item -Recurse -Force $tempDir

Write-Host "ÁUDIOS TTS GERADOS E INSTALADOS COM SUCESSO!" -ForegroundColor Green
