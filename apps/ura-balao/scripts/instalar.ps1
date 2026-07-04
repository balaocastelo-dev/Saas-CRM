# =========================================================================
# SCRIPT DE INSTALAÇÃO DO PROJETO URA-ATIVA-BALAO
# =========================================================================
Write-Host "Iniciando instalacao do projeto URA-ATIVA-BALAO..." -ForegroundColor Cyan

function Install-PiperLocal {
    param(
        [string]$BaseDir
    )

    $piperExe = Join-Path $BaseDir "piper.exe"
    $piperModel = Join-Path $BaseDir "pt_BR-faber-medium.onnx"
    $piperConfig = Join-Path $BaseDir "pt_BR-faber-medium.onnx.json"

    if ((Test-Path $piperExe) -and (Test-Path $piperModel) -and (Test-Path $piperConfig)) {
        Write-Host "Piper local ja esta instalado." -ForegroundColor Green
        return
    }

    Write-Host "Instalando Piper local (voz neural PT-BR offline)..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path $BaseDir | Out-Null

    $zipPath = Join-Path $BaseDir "piper_windows_amd64.zip"
    $tempExtractDir = Join-Path $BaseDir "piper"

    curl.exe -L "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip" -o $zipPath
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao baixar o binario do Piper."
    }

    Expand-Archive -Path $zipPath -DestinationPath $BaseDir -Force
    Remove-Item $zipPath -Force

    if (Test-Path (Join-Path $tempExtractDir "piper.exe")) {
        Get-ChildItem $tempExtractDir | Move-Item -Destination $BaseDir -Force
        Remove-Item $tempExtractDir -Recurse -Force
    }

    curl.exe -L "https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/faber/medium/pt_BR-faber-medium.onnx?download=true" -o $piperModel
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao baixar o modelo PT-BR do Piper."
    }

    curl.exe -L "https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/faber/medium/pt_BR-faber-medium.onnx.json?download=true" -o $piperConfig
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao baixar a configuracao do modelo PT-BR do Piper."
    }

    Write-Host "Piper local instalado com sucesso." -ForegroundColor Green
}

function Install-F5TTSLocal {
    param(
        [string]$ScriptsDir
    )

    $pythonExe = Join-Path $env:LOCALAPPDATA "Programs\Python\Python311\python.exe"
    if (-not (Test-Path $pythonExe)) {
        Write-Host "Instalando Python 3.11 para o F5-TTS..." -ForegroundColor Cyan
        $pythonInstaller = Join-Path $env:TEMP "python-3.11.9-amd64.exe"
        curl.exe -L "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe" -o $pythonInstaller
        if ($LASTEXITCODE -ne 0) { throw "Falha ao baixar o instalador do Python." }
        Start-Process -FilePath $pythonInstaller -ArgumentList "/quiet InstallAllUsers=0 PrependPath=1 Include_pip=1 Include_test=0 Include_launcher=1" -Wait
    }

    if (-not (Test-Path $pythonExe)) {
        throw "Python 3.11 nao esta disponivel para instalar o F5-TTS."
    }

    Write-Host "Instalando dependencias do F5-TTS local..." -ForegroundColor Cyan
    & $pythonExe -m pip install --user torch==2.8.0 torchaudio==2.8.0
    if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar torch/torchaudio." }

    & $pythonExe -m pip install --user huggingface-hub==1.21.0 safetensors==0.8.0 num2words==0.5.14 soundfile==0.14.0 f5-tts==1.1.20
    if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar o runtime do F5-TTS." }

    $ffmpegDir = Join-Path $ScriptsDir "tools\ffmpeg"
    if (-not (Test-Path $ffmpegDir)) {
        Write-Host "Baixando FFmpeg local..." -ForegroundColor Cyan
        $ffmpegZip = Join-Path $env:TEMP "ffmpeg-release-essentials.zip"
        curl.exe -L "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip" -o $ffmpegZip
        if ($LASTEXITCODE -ne 0) { throw "Falha ao baixar o FFmpeg." }
        Expand-Archive -Path $ffmpegZip -DestinationPath $ffmpegDir -Force
    }

    $referenceDir = Join-Path $ScriptsDir "tools\f5tts\reference"
    New-Item -ItemType Directory -Force -Path $referenceDir | Out-Null
    $defaultRef = Join-Path $referenceDir "ref_ptbr_default.wav"
    if (-not (Test-Path $defaultRef)) {
        curl.exe -L "https://raw.githubusercontent.com/freds0/BRSpeech-Dataset/main/audios_demo/portuguese/11247/11247_10229_000015-0001_ground_truth.wav" -o $defaultRef
        if ($LASTEXITCODE -ne 0) { throw "Falha ao baixar o audio de referencia padrao PT-BR." }
    }

    $defaultRefText = Join-Path $referenceDir "ref_ptbr_default.txt"
    if (-not (Test-Path $defaultRefText)) {
        @"
Ola, esta e uma referencia de voz em portugues do Brasil, com diccao clara, ritmo natural e entonacao neutra, para gerar falas mais suaves na URA.
"@ | Set-Content -Path $defaultRefText -Encoding UTF8
    }

    $modelRepo = if ($env:URA_F5_MODEL_REPO) { $env:URA_F5_MODEL_REPO } else { "firstpixel/F5-TTS-pt-br" }
    $modelFile = if ($env:URA_F5_MODEL_FILE) { $env:URA_F5_MODEL_FILE } else { "pt-br/model_last.safetensors" }
    $modelDir = Join-Path $ScriptsDir "tools\f5tts\model"
    New-Item -ItemType Directory -Force -Path $modelDir | Out-Null
    & $pythonExe -c "from huggingface_hub import hf_hub_download; hf_hub_download(repo_id=r'$($modelRepo -replace '\\','\\')', filename=r'$($modelFile -replace '\\','\\')', local_dir=r'$($modelDir -replace '\\','\\')')"
    if ($LASTEXITCODE -ne 0) { throw "Falha ao baixar o modelo F5-TTS pt-BR do repositorio configurado." }

    Write-Host "F5-TTS local instalado com sucesso." -ForegroundColor Green
}

# 1. Verificar Node.js
try {
    $nodeVersion = node -v
    Write-Host "Node.js detectado: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "ERRO: Node.js nao encontrado no sistema!" -ForegroundColor Red
    Write-Host "Por favor, instale o Node.js v16+ a partir de https://nodejs.org/" -ForegroundColor Yellow
    Exit
}

# 2. Criar arquivo .env se nao existir
$backendDir = Join-Path $PSScriptRoot "..\backend"
$envPath = Join-Path $backendDir ".env"
$envExamplePath = Join-Path $backendDir ".env.example"

if (-not (Test-Path $envPath)) {
    if (Test-Path $envExamplePath) {
        Copy-Item $envExamplePath $envPath
        Write-Host "Arquivo .env criado a partir de .env.example." -ForegroundColor Green
        Write-Host "IMPORTANTE: Edite backend/.env e adicione sua senha SIP antes de rodar!" -ForegroundColor Yellow
    } else {
        Write-Host "ERRO: Arquivo .env.example nao encontrado!" -ForegroundColor Red
    }
} else {
    Write-Host "Arquivo .env ja existe. Pulando criacao." -ForegroundColor Yellow
}

# 3. Instalar dependencias
Write-Host "Instalando dependencias do Node.js..." -ForegroundColor Cyan
Push-Location $backendDir
try {
    npm install
    Write-Host "Dependencias instaladas com sucesso." -ForegroundColor Green
} catch {
    Write-Host "Erro ao executar 'npm install'." -ForegroundColor Red
}
Pop-Location

# 4. Instalar F5-TTS local offline para voz mais natural na URA
$scriptsDir = $PSScriptRoot
try {
    Install-F5TTSLocal -ScriptsDir $scriptsDir
} catch {
    Write-Host "ERRO ao instalar F5-TTS local: $($_.Exception.Message)" -ForegroundColor Red
}

# 5. Manter Piper como fallback offline
$piperDir = Join-Path $PSScriptRoot "tools\piper"
try {
    Install-PiperLocal -BaseDir $piperDir
} catch {
    Write-Host "ERRO ao instalar Piper local: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "Instalacao concluida." -ForegroundColor Green
