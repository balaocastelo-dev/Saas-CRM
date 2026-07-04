const express = require('express');
const router = express.Router();
const { settings, db } = require('../database');
const { requireAuth } = require('./auth');
const { diagnosePorts, testUdpPort, resolveHost, getAsteriskRegistryStatus } = require('../sip-diagnostic');
const amiClient = require('../ami');
const { normalizePhone } = require('./clients');
const {
  decodeProductReason,
  encodeProductReason,
  ensureProductAudioFile,
  sanitizeProduct
} = require('../promo-engine');

// GET /api/sip-diagnostic/ports - Varredura automática das portas prováveis
router.get('/ports', requireAuth, async (req, res) => {
  try {
    const s = await settings.getAll();
    const host = s.SIP_HOST || 'bala.pbx.telefoniafacil.com.br';
    const possiblePorts = s.SIP_POSSIBLE_PORTS || '5179,5060,5160,5080,5061';

    const result = await diagnosePorts(host, possiblePorts);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: `Erro na varredura: ${err.message}` });
  }
});

// POST /api/sip-diagnostic/test-port - Testar uma porta manual
router.post('/test-port', requireAuth, async (req, res) => {
  const { port } = req.body;

  if (!port) {
    return res.status(400).json({ error: 'Porta é obrigatória.' });
  }

  try {
    const s = await settings.getAll();
    const host = s.SIP_HOST || 'bala.pbx.telefoniafacil.com.br';
    const ip = await resolveHost(host);

    const result = await testUdpPort(ip, host, parseInt(port, 10));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: `Erro ao testar porta: ${err.message}` });
  }
});

// POST /api/sip-diagnostic/test-registration - Testar registro SIP no Asterisk
router.post('/test-registration', requireAuth, async (req, res) => {
  const result = await getAsteriskRegistryStatus();
  res.json(result);
});

// POST /api/sip-diagnostic/save-port - Salva a porta ativa encontrada
router.post('/save-port', requireAuth, async (req, res) => {
  const { port } = req.body;

  if (!port) {
    return res.status(400).json({ error: 'Porta é obrigatória.' });
  }

  try {
    await settings.set('SIP_PORT', port.toString());
    res.json({ success: true, message: `Porta SIP alterada para ${port} no banco de dados.` });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar porta ativa.' });
  }
});

// POST /api/sip-diagnostic/test-call - Disparar chamada de teste avulsa
router.post('/test-call', requireAuth, async (req, res) => {
  const { phone, reason, product } = req.body;

  if (!phone) {
    return res.status(400).json({ error: 'Telefone é obrigatório.' });
  }

  const normalized = normalizePhone(phone);
  if (!normalized) {
    return res.status(400).json({ error: 'Número de telefone inválido.' });
  }

  try {
    // ID fictício para campanha de teste (ex: ID 0)
    const campaignId = 0;
    const clientId = 0; // Fictício
    const cleanProduct = product ? sanitizeProduct(product) : decodeProductReason(reason);
    const finalReason = cleanProduct && cleanProduct.title ? encodeProductReason(cleanProduct) : (reason || 'Chamada de teste manual');
    const dynamicAudioFile = cleanProduct && cleanProduct.title
      ? await ensureProductAudioFile(cleanProduct)
      : null;
    await new Promise((resolve, reject) => {
      const stmt = `INSERT INTO calls (campaign_id, client_id, phone, reason, status, attempt, created_at, updated_at)
                    VALUES (?, ?, ?, ?, "DISPARANDO", ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
      db.run(stmt, [campaignId, clientId, normalized, finalReason, 1], function onInsert(err) {
        if (err) return reject(err);
        resolve(this.lastID);
      });
    });
    // #region debug-point C:test-call-route
    (()=>{const fs=require('fs'),p='c:/Users/User/Desktop/URA-Bal-o-main/.dbg/call-drop-early.env';let u='http://127.0.0.1:7777/event',s='call-drop-early';try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'C',location:'backend/routes/sip-diagnostic.js:test-call',msg:'[DEBUG] test-call accepted',data:{phone:normalized,hasDynamicAudio:Boolean(dynamicAudioFile),reasonPreview:String(finalReason).slice(0,80)},ts:Date.now()})}).catch(()=>{})})();
    // #endregion
    
    // Dispara originate no Asterisk
    await amiClient.originateCall(normalized, campaignId, clientId, finalReason, { dynamicAudioFile });
    
    res.json({ success: true, message: `Chamada de teste disparada com sucesso para ${normalized}.` });
  } catch (err) {
    db.run(
      `UPDATE calls
       SET status = "FALHA_CONEXAO", result = ?, updated_at = CURRENT_TIMESTAMP
       WHERE campaign_id = 0 AND client_id = 0 AND phone = ? AND status = "DISPARANDO"`,
      [err.message, normalized]
    );
    res.status(500).json({ error: `Falha ao originar chamada: ${err.message}` });
  }
});

module.exports = router;
