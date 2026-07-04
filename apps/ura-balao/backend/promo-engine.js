const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { settings } = require('./database');

const SITE_HOST = 'www.balao.info';
const SITE_URL = 'https://www.balao.info';
const COMPANY_NAME = 'Balão da Informática Castelo';
const BRAZIL_TIMEZONE = 'America/Sao_Paulo';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';
const ELEVENLABS_ENDPOINT = 'https://api.elevenlabs.io/v1';

const CATEGORY_URLS = {
  ssd: `${SITE_URL}/categoria/ssd-hd-nvme`,
  memoria: `${SITE_URL}/categoria/memoria-ram`,
  gpu: `${SITE_URL}/categoria/placas-de-video`,
  monitor: `${SITE_URL}/categoria/monitores`,
  cpu: `${SITE_URL}/categoria/processadores`
};

const WINDOWS_AUDIO_CACHE = path.resolve(__dirname, 'generated-tts');

function normalizeCategory(category) {
  const clean = (category || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (clean.includes('memo')) return 'memoria';
  if (clean.includes('placa') || clean.includes('gpu') || clean.includes('video')) return 'gpu';
  if (clean.includes('monitor') || clean.includes('tela')) return 'monitor';
  if (clean.includes('cpu') || clean.includes('process')) return 'cpu';
  return clean in CATEGORY_URLS ? clean : 'ssd';
}

function decodeHtml(text = '') {
  return text
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&ccedil;/gi, 'ç')
    .replace(/&atilde;/gi, 'ã')
    .replace(/&aacute;/gi, 'á')
    .replace(/&eacute;/gi, 'é')
    .replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó')
    .replace(/&uacute;/gi, 'ú');
}

function stripHtml(text = '') {
  return decodeHtml(text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeExtractedTitle(title = '') {
  return title
    .replace(/\s+R\$\s*[\d\.,].*$/i, '')
    .replace(/\s+à vista.*$/i, '')
    .replace(/^\w+\s+/i, (prefix) => {
      const keepPrefixes = ['SSD ', 'HD ', 'GPU ', 'CPU '];
      return keepPrefixes.includes(prefix.toUpperCase()) ? prefix : '';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeProduct(rawProduct = {}) {
  return {
    title: normalizeExtractedTitle(stripHtml(rawProduct.title || '')),
    price: (rawProduct.price || '').toString().trim(),
    url: (rawProduct.url || '').toString().trim(),
    category: normalizeCategory(rawProduct.category || '')
  };
}

function encodeProductReason(product) {
  const payload = Buffer.from(JSON.stringify(sanitizeProduct(product)), 'utf8').toString('base64url');
  return `PROMO_SITE:${payload}`;
}

function decodeProductReason(reason) {
  if (!reason || typeof reason !== 'string' || !reason.startsWith('PROMO_SITE:')) {
    return null;
  }

  try {
    const payload = reason.slice('PROMO_SITE:'.length);
    const product = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return sanitizeProduct(product);
  } catch (err) {
    return null;
  }
}

function getReasonPreview(reason) {
  const product = decodeProductReason(reason);
  if (!product) return reason || '';

  const price = product.price ? ` - R$ ${product.price}` : '';
  return `Oferta balao.info: ${product.title}${price}`;
}

function formatPriceForSpeech(price) {
  if (!price) return '';

  const normalized = price
    .toString()
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}\b)/g, '')
    .replace(',', '.');

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return `R$ ${price}`;

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(parsed);
}

function cleanupTitleForSpeech(title) {
  return title
    .replace(/\s+-\s+[A-Z0-9./-]+$/g, '')
    .replace(/"/g, '')
    .replace(/\bNVMe\b/gi, 'N V M e')
    .replace(/\bSSD\b/g, 'S S D')
    .replace(/\bRTX\b/g, 'R T X')
    .replace(/\bGTX\b/g, 'G T X')
    .replace(/\bDDR4\b/gi, 'D D R 4')
    .replace(/\bDDR5\b/gi, 'D D R 5')
    .replace(/\bM\.2\b/gi, 'M 2')
    .replace(/\bGHz\b/gi, ' gigahertz')
    .replace(/\bGB\b/gi, ' giga')
    .replace(/\bTB\b/gi, ' tera')
    .replace(/\bLED\b/gi, 'L E D')
    .replace(/\bIPS\b/gi, 'I P S')
    .replace(/\bAMD\b/gi, 'A M D')
    .replace(/\bIntel\b/gi, 'Intel')
    .replace(/\s+/g, ' ')
    .trim();
}

function getGreetingContext(date = new Date()) {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: BRAZIL_TIMEZONE
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 12);

  if (hour < 12) {
    return { key: 'manha', label: 'bom dia' };
  }
  if (hour < 18) {
    return { key: 'tarde', label: 'boa tarde' };
  }
  return { key: 'noite', label: 'boa noite' };
}

function sanitizeSpeechScript(text = '') {
  return text
    .replace(/[*_#`"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildFallbackOfferText(product, options = {}) {
  const cleanProduct = sanitizeProduct(product);
  const companyName = options.companyName || COMPANY_NAME;
  const siteHost = options.siteHost || SITE_HOST;
  const greeting = options.greeting || getGreetingContext().label;
  const title = cleanupTitleForSpeech(cleanProduct.title);
  const price = formatPriceForSpeech(cleanProduct.price);

  if (price) {
    return sanitizeSpeechScript(`${greeting}! Aqui é a equipe do ${companyName}. Temos uma oferta especial para você: ${title}, hoje no ${siteHost}, por ${price} à vista. Se quiser, a nossa equipe pode continuar o atendimento pelo WhatsApp.`);
  }

  return sanitizeSpeechScript(`${greeting}! Aqui é a equipe do ${companyName}. Temos uma oferta especial para você: ${title}. Se quiser, veja agora no ${siteHost} ou fale com a nossa equipe pelo WhatsApp.`);
}

function buildProductOfferText(product, options = {}) {
  return buildFallbackOfferText(product, options);
}

function resolveCatalogHost(catalogBaseUrl) {
  if (!catalogBaseUrl) {
    return SITE_HOST;
  }

  try {
    return new URL(catalogBaseUrl).hostname || SITE_HOST;
  } catch (err) {
    return SITE_HOST;
  }
}

function inferCategoryFromTitle(title = '') {
  const clean = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/\b(ssd|nvme|m\.?2|sata|pcie)\b/.test(clean)) return 'ssd';
  if (/\b(memoria|ram|ddr4|ddr5)\b/.test(clean)) return 'memoria';
  if (/\b(placa de video|placa de vídeo|rtx|gtx|radeon|geforce)\b/.test(clean)) return 'gpu';
  if (/\b(monitor|ultragear|odyssey|aoc)\b/.test(clean)) return 'monitor';
  if (/\b(processador|ryzen|core i3|core i5|core i7|core i9|athlon)\b/.test(clean)) return 'cpu';
  return 'ssd';
}

async function fetchCatalogProducts(category, limit = 20) {
  const normalizedCategory = normalizeCategory(category);
  const url = CATEGORY_URLS[normalizedCategory];
  const categoryPatterns = {
    ssd: /\b(ssd|nvme|m\.?2|sata|pcie)\b/i,
    memoria: /\b(memoria|memória|ram|ddr4|ddr5)\b/i,
    gpu: /\b(placa de video|placa de vídeo|rtx|gtx|radeon|geforce)\b/i,
    monitor: /\b(monitor|ultragear|odyssey|aoc|24"|27")\b/i,
    cpu: /\b(processador|ryzen|core i3|core i5|core i7|core i9|athlon)\b/i
  };

  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) URA-BALAO/1.0',
      'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8'
    }
  });

  if (!response.ok) {
    throw new Error(`Falha ao consultar catálogo: HTTP ${response.status}`);
  }

  const html = await response.text();
  const matches = [...html.matchAll(/<a[^>]+href="([^"]*\/product\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
  const products = [];

  for (const match of matches) {
    const title = stripHtml(match[2]);
    if (!title || title.length < 12) continue;

    const nearHtml = html.slice(match.index, match.index + 1500);
    const price = (nearHtml.match(/R\$\s*([\d\.,]+)/i) || [])[1] || '';
    const rawUrl = match[1].startsWith('http') ? match[1] : `${SITE_URL}${match[1]}`;
    const product = sanitizeProduct({
      title,
      price,
      url: rawUrl,
      category: normalizedCategory
    });

    if (!categoryPatterns[normalizedCategory].test(product.title)) continue;
    if (!product.url || products.some((item) => item.url === product.url)) continue;
    products.push(product);

    if (products.length >= limit) break;
  }

  return products;
}

async function fetchProductByUrl(url) {
  let parsedUrl;

  try {
    parsedUrl = new URL(url);
  } catch (err) {
    throw new Error('URL do produto inválida.');
  }

  if (!/(\.|^)balao\.info$/i.test(parsedUrl.hostname) || !parsedUrl.pathname.includes('/product/')) {
    throw new Error('A URL precisa ser de um produto do balao.info.');
  }

  const response = await fetch(parsedUrl.toString(), {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) URA-BALAO/1.0',
      'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8'
    }
  });

  if (!response.ok) {
    throw new Error(`Falha ao consultar produto: HTTP ${response.status}`);
  }

  const html = await response.text();
  const title =
    stripHtml((html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i) || [])[1]) ||
    stripHtml((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]) ||
    stripHtml((html.match(/"name":"([^"]+)"/i) || [])[1]);

  const price =
    (html.match(/<meta[^>]+property="product:price:amount"[^>]+content="([^"]+)"/i) || [])[1] ||
    (html.match(/"price":"([\d\.,]+)"/i) || [])[1] ||
    (html.match(/R\$\s*([\d\.,]+)/i) || [])[1] ||
    '';

  const product = sanitizeProduct({
    title,
    price,
    url: parsedUrl.toString(),
    category: inferCategoryFromTitle(title)
  });

  if (!product.title) {
    throw new Error('Não foi possível identificar o produto na página informada.');
  }

  return product;
}

function getPiperPaths() {
  const toolsDir = path.resolve(__dirname, '..', 'scripts', 'tools', 'piper');
  const piperExe = path.join(toolsDir, 'piper.exe');

  if (!fs.existsSync(piperExe)) {
    return { piperExe: null, modelPath: null };
  }

  const modelFile = fs.readdirSync(toolsDir).find((file) => /^pt[_-]br.*\.onnx$/i.test(file));
  return {
    piperExe,
    modelPath: modelFile ? path.join(toolsDir, modelFile) : null
  };
}

function findFirstExistingFile(candidates) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

function findFirstFileRecursive(rootDir, extensions) {
  if (!fs.existsSync(rootDir)) {
    return null;
  }

  const queue = [rootDir];
  while (queue.length) {
    const current = queue.shift();
    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(entryPath);
        continue;
      }

      if (extensions.includes(path.extname(entry.name).toLowerCase())) {
        return entryPath;
      }
    }
  }

  return null;
}

function getF5Paths() {
  const scriptsDir = path.resolve(__dirname, '..', 'scripts');
  const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
  const pythonExe = path.join(localAppData, 'Programs', 'Python', 'Python311', 'python.exe');
  const scriptPath = path.join(scriptsDir, 'f5_tts_generate.py');
  const modelRoot = path.join(scriptsDir, 'tools', 'f5tts', 'model');
  const referenceRoot = path.join(scriptsDir, 'tools', 'f5tts', 'reference');
  const modelPath = process.env.URA_F5_MODEL_PATH || findFirstFileRecursive(modelRoot, ['.safetensors', '.pt', '.ckpt']);
  const refAudioPath = findFirstExistingFile([
    process.env.URA_F5_REF_AUDIO,
    path.join(referenceRoot, 'current_ref.wav'),
    path.join(referenceRoot, 'ref_ptbr_default.wav')
  ]);
  const ffmpegRoot = path.join(scriptsDir, 'tools', 'ffmpeg');
  let ffmpegBin = null;

  if (fs.existsSync(ffmpegRoot)) {
    const childDir = fs.readdirSync(ffmpegRoot)
      .map((entry) => path.join(ffmpegRoot, entry))
      .find((entry) => fs.existsSync(entry) && fs.statSync(entry).isDirectory() && fs.existsSync(path.join(entry, 'bin', 'ffmpeg.exe')));

    if (childDir) {
      ffmpegBin = path.join(childDir, 'bin');
    }
  }

  if (!fs.existsSync(pythonExe) || !fs.existsSync(scriptPath) || !modelPath || !refAudioPath) {
    return null;
  }

  return { pythonExe, scriptPath, modelPath, refAudioPath, ffmpegBin };
}

function getFfmpegExe() {
  const scriptsDir = path.resolve(__dirname, '..', 'scripts');
  const ffmpegRoot = path.join(scriptsDir, 'tools', 'ffmpeg');

  if (!fs.existsSync(ffmpegRoot)) {
    return null;
  }

  const childDir = fs.readdirSync(ffmpegRoot)
    .map((entry) => path.join(ffmpegRoot, entry))
    .find((entry) => fs.existsSync(entry) && fs.statSync(entry).isDirectory() && fs.existsSync(path.join(entry, 'bin', 'ffmpeg.exe')));

  return childDir ? path.join(childDir, 'bin', 'ffmpeg.exe') : null;
}

function toWslPath(winPath) {
  const resolved = path.resolve(winPath);
  const drive = resolved.slice(0, 1).toLowerCase();
  const rest = resolved.slice(2).replace(/\\/g, '/').replace(/^\/+/, '');
  return `/mnt/${drive}/${rest}`;
}

function runChecked(command, args, errorMessage, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    throw new Error(`${errorMessage}${result.stderr ? `: ${result.stderr.trim()}` : ''}`);
  }
  return result;
}

function synthesizeWithPowerShell(text, outputPath) {
  const psScript = [
    'Add-Type -AssemblyName System.Speech',
    '$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    '$voice = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq "pt-BR" } | Select-Object -First 1',
    'if ($voice) { $synth.SelectVoice($voice.VoiceInfo.Name) } else { $synth.SelectVoice("Microsoft Maria Desktop") }',
    '$synth.Rate = -1',
    '$synth.SetOutputToWaveFile($env:URA_WAV_OUTPUT)',
    '$synth.Speak($env:URA_TTS_TEXT)',
    '$synth.Dispose()'
  ].join('; ');

  runChecked(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
    'Falha ao sintetizar voz local',
    {
      env: {
        ...process.env,
        URA_TTS_TEXT: text,
        URA_WAV_OUTPUT: outputPath
      }
    }
  );
}

function convertAudioWithFfmpeg(inputPath, outputPath) {
  const ffmpegExe = getFfmpegExe();
  if (!ffmpegExe) {
    return false;
  }

  const result = spawnSync(
    ffmpegExe,
    ['-y', '-i', inputPath, '-ac', '1', '-ar', '24000', outputPath],
    { encoding: 'utf8', windowsHide: true }
  );

  return result.status === 0 && fs.existsSync(outputPath);
}

async function generateOfferTextWithGemini(product, ttsConfig) {
  const apiKey = ttsConfig.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const greeting = getGreetingContext();
  const cleanProduct = sanitizeProduct(product);
  const companyName = ttsConfig.COMPANY_NAME || COMPANY_NAME;
  const siteHost = resolveCatalogHost(ttsConfig.CATALOG_BASE_URL);
  const price = cleanProduct.price ? formatPriceForSpeech(cleanProduct.price) : '';
  const prompt = [
    'Crie um texto curto para uma URA ativa de vendas em portugues do Brasil.',
    `Use exatamente a saudacao "${greeting.label}" no inicio.`,
    `Empresa: ${companyName}.`,
    `Produto: ${cleanupTitleForSpeech(cleanProduct.title)}.`,
    `Preco: ${price || 'nao informado'}.`,
    `Site: ${siteHost}.`,
    'Regras:',
    '- retorne apenas o texto final, sem aspas e sem markdown;',
    '- soar natural, simpatico e humano, sem parecer robótico;',
    '- no maximo 320 caracteres;',
    '- deixar claro que a pessoa pode falar com a equipe ou receber no WhatsApp;',
    '- evitar siglas soletradas em excesso;',
    '- texto pensado para voz sintetica em chamada telefonica.'
  ].join('\n');

  const model = ttsConfig.GEMINI_MODEL || process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  const response = await fetch(`${GEMINI_ENDPOINT}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.8,
        topP: 0.9,
        maxOutputTokens: 220
      }
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini falhou (${response.status}): ${body}`);
  }

  const data = await response.json();
  const text = (data.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || '')
    .join(' ')
    .trim();

  return text ? sanitizeSpeechScript(text) : null;
}

async function synthesizeWithElevenLabs(text, outputPath, ttsConfig) {
  const apiKey = ttsConfig.ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY;
  const voiceId = ttsConfig.ELEVENLABS_VOICE_ID || process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) {
    return null;
  }

  const modelId = ttsConfig.ELEVENLABS_MODEL_ID || process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';
  const outputFormat = ttsConfig.ELEVENLABS_OUTPUT_FORMAT || process.env.ELEVENLABS_OUTPUT_FORMAT || 'mp3_44100_128';
  const tempAudioPath = outputPath.replace(/\.wav$/i, '.eleven.tmp.mp3');
  const response = await fetch(`${ELEVENLABS_ENDPOINT}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      language_code: 'pt',
      voice_settings: {
        stability: Number(ttsConfig.ELEVENLABS_STABILITY || process.env.ELEVENLABS_STABILITY || 0.38),
        similarity_boost: Number(ttsConfig.ELEVENLABS_SIMILARITY_BOOST || process.env.ELEVENLABS_SIMILARITY_BOOST || 0.82),
        style: Number(ttsConfig.ELEVENLABS_STYLE || process.env.ELEVENLABS_STYLE || 0.25),
        speed: Number(ttsConfig.ELEVENLABS_SPEED || process.env.ELEVENLABS_SPEED || 1.0),
        use_speaker_boost: String(ttsConfig.ELEVENLABS_USE_SPEAKER_BOOST || process.env.ELEVENLABS_USE_SPEAKER_BOOST || 'true') !== 'false'
      }
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ElevenLabs falhou (${response.status}): ${body}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(tempAudioPath, Buffer.from(arrayBuffer));

  if (!convertAudioWithFfmpeg(tempAudioPath, outputPath)) {
    fs.rmSync(tempAudioPath, { force: true });
    throw new Error('Falha ao converter o audio da ElevenLabs para WAV local.');
  }

  fs.rmSync(tempAudioPath, { force: true });
  return 'elevenlabs';
}

function synthesizeWithF5(text, outputPath) {
  const f5Paths = getF5Paths();
  if (!f5Paths) return null;

  const env = { ...process.env };
  if (f5Paths.ffmpegBin) {
    env.PATH = `${f5Paths.ffmpegBin}${path.delimiter}${env.PATH || ''}`;
  }

  const result = spawnSync(
    f5Paths.pythonExe,
    [
      f5Paths.scriptPath,
      '--text',
      text,
      '--output',
      outputPath
    ],
    {
      encoding: 'utf8',
      env,
      windowsHide: true
    }
  );

  if (result.status === 0 && fs.existsSync(outputPath)) {
    return 'f5-tts';
  }

  return null;
}

async function synthesizeProductText(text, outputPath, ttsConfig = {}) {
  try {
    const elevenResult = await synthesizeWithElevenLabs(text, outputPath, ttsConfig);
    if (elevenResult) {
      return elevenResult;
    }
  } catch (err) {
    console.warn('ElevenLabs indisponivel. Usando fallback local:', err.message);
  }

  const f5Result = synthesizeWithF5(text, outputPath);
  if (f5Result) {
    return f5Result;
  }

  const { piperExe, modelPath } = getPiperPaths();

  if (piperExe && modelPath) {
    const result = spawnSync(
      piperExe,
      ['--model', modelPath, '--output_file', outputPath],
      { input: text, encoding: 'utf8' }
    );

    if (result.status === 0) {
      return 'piper';
    }
  }

  synthesizeWithPowerShell(text, outputPath);
  return 'windows';
}

function ensureAsteriskSoundDirs() {
  execFileSync('wsl', [
    '-u',
    'root',
    'sh',
    '-lc',
    'mkdir -p /usr/share/asterisk/sounds /usr/share/asterisk/sounds/en /usr/share/asterisk/sounds/pt_BR'
  ], { stdio: 'pipe' });
}

function installWaveIntoAsterisk(winTempFile, baseName) {
  const wslTempFile = toWslPath(winTempFile);
  const rootFile = `/usr/share/asterisk/sounds/${baseName}.wav`;
  const langFileEn = `/usr/share/asterisk/sounds/en/${baseName}.wav`;
  const langFilePtBr = `/usr/share/asterisk/sounds/pt_BR/${baseName}.wav`;

  ensureAsteriskSoundDirs();
  runChecked('wsl', ['-u', 'root', 'sox', wslTempFile, '-r', '8000', '-c', '1', rootFile], 'Falha ao converter áudio para o Asterisk');
  runChecked(
    'wsl',
    ['-u', 'root', 'sh', '-lc', `cp '${rootFile}' '${langFileEn}' && cp '${rootFile}' '${langFilePtBr}' && chown asterisk:asterisk '${rootFile}' '${langFileEn}' '${langFilePtBr}' && chmod 644 '${rootFile}' '${langFileEn}' '${langFilePtBr}'`],
    'Falha ao copiar áudio para as pastas do Asterisk'
  );
}

async function ensureProductAudioFile(product) {
  const cleanProduct = sanitizeProduct(product);
  if (!cleanProduct.title) return null;
  const ttsConfig = await settings.getAll();
  const greeting = getGreetingContext();
  const companyName = ttsConfig.COMPANY_NAME || COMPANY_NAME;
  const siteHost = resolveCatalogHost(ttsConfig.CATALOG_BASE_URL);

  let offerText;
  try {
    offerText = await generateOfferTextWithGemini(cleanProduct, ttsConfig);
  } catch (err) {
    console.warn('Gemini indisponivel. Usando texto fallback:', err.message);
  }

  offerText = offerText || buildFallbackOfferText(cleanProduct, {
    greeting: greeting.label,
    companyName,
    siteHost
  });

  const hashSource = JSON.stringify({
    provider: 'gemini-elevenlabs-v1',
    greeting: greeting.key,
    text: offerText,
    voice: ttsConfig.ELEVENLABS_VOICE_ID || process.env.ELEVENLABS_VOICE_ID || '',
    model: ttsConfig.ELEVENLABS_MODEL_ID || process.env.ELEVENLABS_MODEL_ID || '',
    product: cleanProduct
  });
  const baseName = `ura-balao-produto-${crypto.createHash('sha1').update(hashSource).digest('hex').slice(0, 12)}`;
  const targetRoot = `/usr/share/asterisk/sounds/${baseName}.wav`;

  try {
    const existsCheck = spawnSync('wsl', ['-u', 'root', 'test', '-f', targetRoot], { encoding: 'utf8' });
    if (existsCheck.status === 0) {
      return baseName;
    }
  } catch (err) {
    // Se o teste falhar, seguimos para gerar novamente.
  }

  fs.mkdirSync(WINDOWS_AUDIO_CACHE, { recursive: true });
  const tempWinFile = path.join(WINDOWS_AUDIO_CACHE, `${baseName}.wav`);

  await synthesizeProductText(offerText, tempWinFile, ttsConfig);
  installWaveIntoAsterisk(tempWinFile, baseName);

  return baseName;
}

module.exports = {
  CATEGORY_URLS,
  COMPANY_NAME,
  SITE_HOST,
  SITE_URL,
  buildProductOfferText,
  decodeProductReason,
  encodeProductReason,
  ensureProductAudioFile,
  fetchCatalogProducts,
  fetchProductByUrl,
  getReasonPreview,
  normalizeCategory,
  sanitizeProduct
};
