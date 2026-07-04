[OPEN] Debug session: f5-tts-natural-voice

## Symptom
- `scripts\f5_tts_generate.py` responde a `--help` e compila, mas a geração real do WAV ainda não foi comprovada.
- A URA segue com voz insuficientemente natural porque o fluxo ainda cai em fallback (`Piper`/Windows) ou não conclui a inferência do `F5-TTS`.

## Goal
- Confirmar por evidência em runtime por que o `F5-TTS` não gera um WAV utilizável no Windows.
- Validar o caminho principal para depois regenerar os áudios fixos e dinâmicos da URA com voz mais natural.

## Initial Hypotheses
1. O wrapper Python falha ao inicializar o modelo `F5TTS` com o checkpoint pt-BR atual.
2. A inferência roda, mas falha ao carregar ou usar `ref_audio` / `ref_text`.
3. O áudio é gerado, porém falha na escrita do arquivo WAV final ou no caminho de saída.
4. Existe dependência de runtime ausente ou mal resolvida em execução real (`ffmpeg`, `torch`, backend de áudio ou pacote do `f5_tts`).
5. O processo Node/PowerShell chama o script corretamente, mas a falha ocorre apenas em modo real por parâmetros incompatíveis com esse checkpoint.

## Evidence Plan
- Executar o wrapper Python diretamente com logging explícito.
- Confirmar presença e conteúdo dos arquivos de modelo e referência.
- Capturar stdout/stderr e código de saída da execução real.
- Só depois aplicar uma correção mínima baseada na evidência coletada.

## Evidence Collected
- O processo morria durante `from f5_tts.api import F5TTS`; a trilha de import isolou a causa em `f5_tts.model.modules -> from librosa.filters import mel`.
- O modelo `F5TTS_Base` usa `mel_spec_type: vocos`, então esse import de `librosa` era desnecessário no caminho de inferência usado pela URA.
- Após adiar o import de `librosa` para dentro de `get_bigvgan_mel_spectrogram`, o runtime passou a inicializar `F5TTS` corretamente.
- A etapa seguinte falhou porque `ref_text` estava vazio; o F5 tentou transcrever `ref_audio` com Whisper, o que acionou `torchcodec` e quebrou no Windows por DLLs ausentes.
- Depois de criar `ref_ptbr_default.txt` e do fallback embutido no wrapper, a geração real de `debug-f5.wav` foi validada com sucesso.

## Minimal Fix Applied
- Wrapper `scripts\f5_tts_generate.py` agora:
  - aplica automaticamente o patch de import preguiçoso em `f5_tts.model.modules` quando necessário;
  - usa `ref_ptbr_default.txt` ou um texto fallback local, evitando a transcrição automática via Whisper.
- Criado `scripts\tools\f5tts\reference\ref_ptbr_default.txt`.
- Instalador `scripts\instalar.ps1` passa a criar esse arquivo de referência textual.
- Áudios fixos da URA foram regenerados e os caches dinâmicos antigos foram limpos para forçar nova síntese com F5-TTS.

## Current Status
- `F5-TTS` gera WAV localmente no Windows com o checkpoint pt-BR.
- A sessão permanece aberta até a validação do usuário em chamadas reais da URA.
