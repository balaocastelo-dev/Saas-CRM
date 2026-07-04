import argparse
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import importlib.util
import json
import os
from pathlib import Path
import re
import time
import traceback
import urllib.request

try:
    from num2words import num2words
except Exception:
    num2words = None

FALLBACK_REF_TEXT = (
    "Ola, esta e uma referencia de voz em portugues do Brasil, com diccao clara, "
    "ritmo natural e entonacao neutra, para gerar falas mais suaves na URA."
)

MODEL_EXTENSIONS = {".safetensors", ".pt", ".ckpt"}
PREFERRED_MODEL_FILENAMES = ("model_last.safetensors", "model.safetensors", "model.pt")
SPECIAL_SPOKEN_FORMS = (
    (r"\bwww\.balao\.info\b", "balao ponto info"),
    (r"\bbalao\.info\b", "balao ponto info"),
    (r"\bnvme\b", "ene ve eme e"),
    (r"\bssd\b", "esse esse de"),
    (r"\brtx\b", "erre te xis"),
    (r"\bgtx\b", "ge te xis"),
    (r"\bips\b", "i pe esse"),
    (r"\bddr4\b", "de de erre quatro"),
    (r"\bddr5\b", "de de erre cinco"),
    (r"\bamd\b", "a eme de"),
    (r"\bpcie\b", "pe ci i"),
    (r"\bm\.?2\b", "eme dois"),
)


def build_default_paths(base_dir: Path):
    ffmpeg_root = base_dir / "tools" / "ffmpeg"
    model_root = base_dir / "tools" / "f5tts" / "model"
    reference_root = base_dir / "tools" / "f5tts" / "reference"
    ffmpeg_bin = ""
    if ffmpeg_root.exists():
        subdirs = [item for item in ffmpeg_root.iterdir() if item.is_dir()]
        if subdirs:
            ffmpeg_bin = str(subdirs[0] / "bin")

    return {
        "model_root": model_root,
        "model": model_root / "pt-br" / "model_last.safetensors",
        "reference_root": reference_root,
        "ref_audio": reference_root / "ref_ptbr_default.wav",
        "ref_text": reference_root / "ref_ptbr_default.txt",
        "current_ref_audio": reference_root / "current_ref.wav",
        "current_ref_text": reference_root / "current_ref.txt",
        "ffmpeg_bin": ffmpeg_bin,
    }


def find_first_existing_file(paths):
    for candidate in paths:
        if not candidate:
            continue
        candidate = Path(candidate)
        if candidate.exists() and candidate.is_file():
            return candidate
    return None


def score_model_path(candidate: Path):
    name = candidate.name.lower()
    parent = str(candidate.parent).lower().replace("\\", "/")
    preferred_rank = PREFERRED_MODEL_FILENAMES.index(name) if name in PREFERRED_MODEL_FILENAMES else len(PREFERRED_MODEL_FILENAMES)
    pt_br_bonus = 0 if "pt-br" in parent or "pt_br" in parent else 1
    return (preferred_rank, pt_br_bonus, len(parent), name)


def resolve_model_path(defaults, explicit_model_path=None):
    direct_match = find_first_existing_file(
        [
            explicit_model_path,
            os.getenv("URA_F5_MODEL_PATH"),
            defaults["model"],
        ]
    )
    if direct_match:
        return direct_match

    model_root = defaults["model_root"]
    if not model_root.exists():
        return defaults["model"]

    candidates = [
        item
        for item in model_root.rglob("*")
        if item.is_file() and item.suffix.lower() in MODEL_EXTENSIONS
    ]
    if not candidates:
        return defaults["model"]

    return sorted(candidates, key=score_model_path)[0]


def resolve_ref_audio_path(defaults, explicit_ref_audio=None):
    resolved = find_first_existing_file(
        [
            explicit_ref_audio,
            os.getenv("URA_F5_REF_AUDIO"),
            defaults["current_ref_audio"],
            defaults["ref_audio"],
        ]
    )
    return resolved or defaults["ref_audio"]


def resolve_ref_text_file(defaults, ref_audio: Path, explicit_ref_text_file=None):
    sibling_text = ref_audio.with_suffix(".txt") if ref_audio else None
    resolved = find_first_existing_file(
        [
            explicit_ref_text_file,
            os.getenv("URA_F5_REF_TEXT_FILE"),
            sibling_text,
            defaults["current_ref_text"],
            defaults["ref_text"],
        ]
    )
    return resolved or defaults["ref_text"]


def normalize_ref_text(explicit_text: str, ref_text_file: Path):
    if explicit_text is not None:
        stripped = explicit_text.strip()
        return stripped or FALLBACK_REF_TEXT

    if ref_text_file.exists():
        stripped = ref_text_file.read_text(encoding="utf-8").strip()
        if stripped:
            return stripped

    return FALLBACK_REF_TEXT


def number_to_words_pt_br(value: Decimal):
    if num2words is None:
        return str(value)
    return num2words(value, lang="pt_BR")


def currency_to_words(raw_value: str):
    normalized = raw_value.strip().replace(".", "").replace(",", ".")
    try:
        amount = Decimal(normalized).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except InvalidOperation:
        return raw_value

    inteiro = int(amount)
    centavos = int((amount - Decimal(inteiro)) * 100)
    parts = []

    if inteiro:
        moeda = "real" if inteiro == 1 else "reais"
        parts.append(f"{number_to_words_pt_br(inteiro)} {moeda}")
    if centavos:
        sufixo = "centavo" if centavos == 1 else "centavos"
        parts.append(f"{number_to_words_pt_br(centavos)} {sufixo}")

    return " e ".join(parts) if parts else "zero real"


def generic_number_to_words(match):
    token = match.group(0)
    try:
        if "," in token:
            value = Decimal(token.replace(".", "").replace(",", "."))
        else:
            value = Decimal(token)
    except InvalidOperation:
        return token

    if value == int(value):
        value = int(value)
    return str(number_to_words_pt_br(value))


def preprocess_text_for_f5(text: str):
    prepared = " ".join((text or "").split())
    if not prepared:
        return prepared

    for pattern, replacement in SPECIAL_SPOKEN_FORMS:
        prepared = re.sub(pattern, replacement, prepared, flags=re.IGNORECASE)

    prepared = re.sub(r"(?i)\br\$\s*([0-9][0-9\.,]*)", lambda match: currency_to_words(match.group(1)), prepared)
    prepared = re.sub(r"(?<![\w/])\d+(?:[.,]\d+)?(?![\w/])", generic_number_to_words, prepared)
    prepared = prepared.replace("@", " arroba ").replace("&", " e ")
    prepared = prepared.lower()
    prepared = re.sub(r"\s+", " ", prepared).strip()
    return prepared


def pick_device(requested: str):
    if requested and requested != "auto":
        return requested

    import torch

    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch, "xpu", None) and torch.xpu.is_available():
        return "xpu"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def debug_event(hypothesis_id: str, msg: str, data=None):
    env_path = Path(__file__).resolve().parent.parent / ".dbg" / "f5-tts-natural-voice.env"
    debug_url = "http://127.0.0.1:7777/event"
    session_id = "f5-tts-natural-voice"

    try:
        content = env_path.read_text(encoding="utf-8")
        for line in content.splitlines():
            if line.startswith("DEBUG_SERVER_URL="):
                debug_url = line.split("=", 1)[1].strip() or debug_url
            elif line.startswith("DEBUG_SESSION_ID="):
                session_id = line.split("=", 1)[1].strip() or session_id
    except Exception:
        pass

    payload = {
        "sessionId": session_id,
        "runId": "pre-fix",
        "hypothesisId": hypothesis_id,
        "location": "scripts/f5_tts_generate.py",
        "msg": f"[DEBUG] {msg}",
        "data": data or {},
        "ts": int(time.time() * 1000),
    }

    try:
        request = urllib.request.Request(
            debug_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        urllib.request.urlopen(request, timeout=2).read()
    except Exception:
        pass


def ensure_f5_runtime_patch():
    spec = importlib.util.find_spec("f5_tts.api")
    if not spec or not spec.origin:
        return None

    modules_path = Path(spec.origin).resolve().parent / "model" / "modules.py"
    if not modules_path.exists():
        return None

    source = modules_path.read_text(encoding="utf-8")
    eager_import = "from librosa.filters import mel as librosa_mel_fn"
    lazy_import = "    from librosa.filters import mel as librosa_mel_fn\n\n    device = waveform.device"

    if eager_import not in source:
        return modules_path

    patched = source.replace(eager_import + "\n", "", 1).replace("    device = waveform.device", lazy_import, 1)
    modules_path.write_text(patched, encoding="utf-8")
    return modules_path


def main():
    parser = argparse.ArgumentParser(description="Gera audio offline com F5-TTS pt-BR.")
    parser.add_argument("--text", required=True, help="Texto a ser falado.")
    parser.add_argument("--output", required=True, help="Arquivo WAV de saida.")
    parser.add_argument("--model-path", help="Checkpoint local do modelo.")
    parser.add_argument("--model-name", default=os.getenv("URA_F5_MODEL_NAME", "F5TTS_Base"), help="Nome do modelo F5.")
    parser.add_argument("--ref-audio", help="Arquivo de referencia PT-BR.")
    parser.add_argument("--ref-text", help="Transcricao da referencia.")
    parser.add_argument("--ref-text-file", help="Arquivo TXT com a transcricao da referencia.")
    parser.add_argument("--speed", type=float, default=1.0, help="Velocidade da fala.")
    parser.add_argument("--device", default="auto", help="cuda|cpu|xpu|mps|auto")
    parser.add_argument("--remove-silence", action="store_true", help="Remove silencios longos da saida.")
    parser.add_argument("--no-text-normalization", action="store_true", help="Desabilita a normalizacao do texto para o modelo.")
    parser.add_argument("--nfe-step", type=int, default=32, help="Passos de inferencia.")
    args = parser.parse_args()

    base_dir = Path(__file__).resolve().parent
    defaults = build_default_paths(base_dir)
    model_path = resolve_model_path(defaults, args.model_path)
    ref_audio = resolve_ref_audio_path(defaults, args.ref_audio)
    ref_text_file = resolve_ref_text_file(defaults, ref_audio, args.ref_text_file)
    ref_text = normalize_ref_text(args.ref_text, ref_text_file)
    prepared_text = args.text if args.no_text_normalization else preprocess_text_for_f5(args.text)
    output = Path(args.output).resolve()
    # #region debug-point A:resolved-paths
    debug_event(
        "A",
        "Resolved runtime paths and arguments.",
        {
            "model_exists": model_path.exists(),
            "model_path": str(model_path),
            "ref_audio_exists": ref_audio.exists(),
            "ref_audio": str(ref_audio),
            "ref_text_file": str(ref_text_file),
            "ref_text_len": len(ref_text or ""),
            "text_len_original": len(args.text or ""),
            "text_len_prepared": len(prepared_text or ""),
            "output": str(output),
            "device_arg": args.device,
            "model_name": args.model_name,
            "speed": args.speed,
            "nfe_step": args.nfe_step,
            "remove_silence": args.remove_silence,
            "normalization_enabled": not args.no_text_normalization,
        },
    )
    # #endregion

    if defaults["ffmpeg_bin"]:
      os.environ["PATH"] = defaults["ffmpeg_bin"] + os.pathsep + os.environ.get("PATH", "")
      # #region debug-point D:ffmpeg-path
      debug_event("D", "Prepended ffmpeg bin to PATH.", {"ffmpeg_bin": defaults["ffmpeg_bin"]})
      # #endregion

    if not model_path.exists():
        # #region debug-point A:model-missing
        debug_event("A", "Model checkpoint missing before initialization.", {"model_path": str(model_path)})
        # #endregion
        raise SystemExit(f"Modelo F5-TTS nao encontrado: {model_path}")
    if not ref_audio.exists():
        # #region debug-point B:ref-audio-missing
        debug_event("B", "Reference audio missing before inference.", {"ref_audio": str(ref_audio)})
        # #endregion
        raise SystemExit(f"Audio de referencia nao encontrado: {ref_audio}")

    output.parent.mkdir(parents=True, exist_ok=True)

    try:
        try:
            patched_modules = ensure_f5_runtime_patch()
        except PermissionError as patch_exc:
            patched_modules = None
            debug_event(
                "D",
                "Skipping runtime patch write because the installed package is locked.",
                {"error": str(patch_exc)},
            )
        # #region debug-point D:runtime-patch
        debug_event(
            "D",
            "Ensured runtime patch for lazy librosa import.",
            {"patched_modules": str(patched_modules) if patched_modules else None},
        )
        # #endregion
        # #region debug-point D:import-f5
        debug_event("D", "Importing F5TTS API.", {})
        # #endregion
        from f5_tts.api import F5TTS

        device = pick_device(args.device)
        # #region debug-point A:device-picked
        debug_event("A", "Selected runtime device.", {"device": device})
        # #endregion
        tts = F5TTS(
            model=args.model_name,
            ckpt_file=str(model_path),
            device=device,
        )
        # #region debug-point A:model-loaded
        debug_event("A", "F5TTS instance created.", {"device": device, "ref_text_len": len(ref_text or "")})
        # #endregion
        # #region debug-point B:infer-start
        debug_event(
            "B",
            "Starting inference.",
            {
                "text_len": len(args.text),
                "prepared_text": prepared_text,
                "ref_text_len": len(ref_text or ""),
                "output": str(output),
            },
        )
        # #endregion
        tts.infer(
            ref_file=str(ref_audio),
            ref_text=ref_text,
            gen_text=prepared_text,
            speed=args.speed,
            nfe_step=args.nfe_step,
            remove_silence=args.remove_silence,
            file_wave=str(output),
            show_info=lambda *msg: None,
            progress=None,
        )
        # #region debug-point C:infer-done
        debug_event(
            "C",
            "Inference finished.",
            {
                "output_exists": output.exists(),
                "output_size": output.stat().st_size if output.exists() else 0,
            },
        )
        # #endregion
        print(f"ok|device={device}|output={output}")
    except Exception as exc:
        # #region debug-point E:exception
        debug_event(
            "E",
            "Unhandled exception during F5-TTS generation.",
            {
                "error_type": type(exc).__name__,
                "error": str(exc),
                "traceback": traceback.format_exc(),
            },
        )
        # #endregion
        raise


if __name__ == "__main__":
    main()
