param(
    [Parameter(Mandatory = $true)]
    [string]$AudioPath,

    [string]$ReferenceText,

    [string]$ReferenceTextFile
)

$resolvedAudio = (Resolve-Path $AudioPath).Path
if (-not (Test-Path $resolvedAudio)) {
    throw "Audio de referencia nao encontrado: $AudioPath"
}

$referenceDir = Join-Path $PSScriptRoot "tools\f5tts\reference"
New-Item -ItemType Directory -Force -Path $referenceDir | Out-Null

$targetAudio = Join-Path $referenceDir "current_ref.wav"
$targetText = Join-Path $referenceDir "current_ref.txt"

$ffmpegExe = Get-ChildItem -Path (Join-Path $PSScriptRoot "tools\ffmpeg") -Recurse -File -Filter "ffmpeg.exe" -ErrorAction SilentlyContinue | Select-Object -First 1

if ($ffmpegExe) {
    & $ffmpegExe.FullName -y -i $resolvedAudio -ac 1 -ar 24000 $targetAudio | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao converter o audio de referencia com FFmpeg."
    }
} elseif ([System.IO.Path]::GetExtension($resolvedAudio).ToLowerInvariant() -eq ".wav") {
    Copy-Item -Path $resolvedAudio -Destination $targetAudio -Force
} else {
    throw "FFmpeg nao encontrado para converter o audio informado para WAV."
}

if ($ReferenceTextFile) {
    $resolvedTextFile = (Resolve-Path $ReferenceTextFile).Path
    if (-not (Test-Path $resolvedTextFile)) {
        throw "Arquivo de transcricao nao encontrado: $ReferenceTextFile"
    }

    Get-Content -Path $resolvedTextFile -Raw | Set-Content -Path $targetText -Encoding UTF8
} elseif ($ReferenceText) {
    $ReferenceText.Trim() | Set-Content -Path $targetText -Encoding UTF8
} else {
    throw "Informe -ReferenceText ou -ReferenceTextFile com a transcricao exata do audio."
}

Write-Host "Referencia F5-TTS atualizada com sucesso." -ForegroundColor Green
Write-Host "Arquivo de audio: $targetAudio"
Write-Host "Arquivo de texto: $targetText"
Write-Host "As proximas geracoes da URA vao priorizar essa nova voz."
