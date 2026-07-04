const express = require('express');
const router = express.Router();
const { db, settings } = require('../database');
const { requireAuth } = require('./auth');
const {
  COMPANY_NAME,
  SITE_URL,
  decodeProductReason,
  getReasonPreview
} = require('../promo-engine');
const { normalizePhone } = require('./clients');

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

function extractFirstName(name = '') {
  return String(name || '').trim().split(/\s+/)[0] || 'tudo bem';
}

function onlyDigits(value = '') {
  return String(value || '').replace(/\D/g, '');
}

function buildWhatsappUrl(phone, text) {
  const digits = onlyDigits(phone);
  if (!digits) return '';
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function buildDialUrl(phone) {
  const normalizedPhone = normalizePhone(phone) || phone;
  return normalizedPhone ? `tel:${String(normalizedPhone).replace(/\s+/g, '')}` : '';
}

function enrichCall(call, appSettings = {}) {
  const reasonSource = call.reason || call.client_reason || call.campaign_message || '';
  const product = decodeProductReason(reasonSource);
  const companyName = (appSettings.COMPANY_NAME || COMPANY_NAME || '').trim() || COMPANY_NAME;
  const catalogUrl = (appSettings.CATALOG_BASE_URL || SITE_URL || '').trim() || SITE_URL;
  const targetPhone = normalizePhone(call.phone) || call.phone;
  const firstName = extractFirstName(call.client_name);
  const offerUrl = product?.url || catalogUrl;
  const reasonPreview = getReasonPreview(reasonSource) || '-';
  const attendantMessage = `Olá ${firstName}, aqui é a equipe do ${companyName}. Recebemos seu pedido para falar com um atendente na ligação. Podemos continuar seu atendimento por aqui?`;
  const linkMessage = product?.url
    ? `Olá ${firstName}, aqui é a equipe do ${companyName}. Você pediu o link da oferta na ligação. Segue: ${product.url}`
    : `Olá ${firstName}, aqui é a equipe do ${companyName}. Você pediu mais informações na ligação. Segue nosso catálogo: ${catalogUrl}`;

  return {
    ...call,
    reason_preview: reasonPreview,
    offer_title: product?.title || '',
    offer_url: offerUrl,
    attendant_whatsapp_url: buildWhatsappUrl(targetPhone, attendantMessage),
    whatsapp_link_url: buildWhatsappUrl(targetPhone, linkMessage),
    dial_url: buildDialUrl(targetPhone)
  };
}

// GET /api/calls - Retorna o histórico de chamadas realizadas com detalhes do cliente e campanha
router.get('/', requireAuth, async (req, res) => {
  try {
    const [rows, appSettings] = await Promise.all([
      dbAll(
        `SELECT c.*, cl.name as client_name, cl.reason as client_reason, cp.name as campaign_name, cp.message as campaign_message
         FROM calls c
         LEFT JOIN clients cl ON c.client_id = cl.id
         LEFT JOIN campaigns cp ON c.campaign_id = cp.id
         ORDER BY c.id DESC`
      ),
      settings.getAll()
    ]);

    res.json(rows.map((row) => enrichCall(row, appSettings)));
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao buscar histórico de chamadas.' });
  }
});

// POST /api/asterisk/dtmf-result - Callback da URA com a tecla digitada pelo cliente
router.post('/asterisk/dtmf-result', (req, res) => {
  const { uniqueid, campaign_id, client_id, phone, digit } = req.body;
  console.log(`Callback DTMF recebido: UniqueID=${uniqueid}, Cliente=${client_id}, Digito=${digit}`);
  // #region debug-point A:dtmf-callback
  (()=>{const fs=require('fs'),p='c:/Users/User/Desktop/URA-Bal-o-main/.dbg/call-drop-early.env';let u='http://127.0.0.1:7777/event',s='call-drop-early';try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'A',location:'backend/routes/calls.js:dtmf',msg:'[DEBUG] dtmf callback received',data:{uniqueid,campaign_id,client_id,phone,digit},ts:Date.now()})}).catch(()=>{})})();
  // #endregion

  // 1. Associa o asterisk_uniqueid ao registro da chamada que foi disparada
  db.serialize(() => {
    // Localiza e atualiza a chamada disparada correspondente que ainda não tem UniqueID associado
    db.run(
      `UPDATE calls 
       SET asterisk_uniqueid = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = (
         SELECT id FROM calls 
         WHERE campaign_id = ? AND client_id = ? AND asterisk_uniqueid IS NULL
         ORDER BY id DESC LIMIT 1
       )`,
      [uniqueid, campaign_id, client_id]
    );

    // Mapeia o resultado com base no dígito pressionado
    let resultStatus = 'SEM_RESPOSTA';
    let clientStatus = 'SEM_RESPOSTA';

    if (digit === '1') {
      resultStatus = 'PEDIU_ATENDENTE';
      clientStatus = 'PEDIU_ATENDENTE';
    } else if (digit === '2') {
      resultStatus = 'QUER_WHATSAPP';
      clientStatus = 'QUER_WHATSAPP';
    } else if (digit === '9') {
      resultStatus = 'BLOQUEADO';
      clientStatus = 'BLOQUEADO';
      
      // Insere o número na blacklist para não receber mais ligações
      db.run('INSERT OR IGNORE INTO blacklist (phone) VALUES (?)', [phone]);
    } else if (digit && digit.trim() !== '') {
      resultStatus = 'OPCAO_INVALIDA';
      clientStatus = 'OPCAO_INVALIDA';
    }

    // 2. Atualiza a chamada com o dígito e resultado
    db.run(
      `UPDATE calls 
       SET digit = ?, result = ?, status = 'ATENDIDA', updated_at = CURRENT_TIMESTAMP
       WHERE asterisk_uniqueid = ?`,
      [digit || '', resultStatus, uniqueid]
    );

    // 3. Atualiza o status do cliente na campanha
    db.run(
      `UPDATE campaign_clients 
       SET status = ?, last_attempt_at = CURRENT_TIMESTAMP
       WHERE campaign_id = ? AND client_id = ?`,
      [clientStatus, campaign_id, client_id]
    );

    // 4. Atualiza o status global do cliente
    db.run(
      `UPDATE clients 
       SET status = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [clientStatus, client_id]
    );
  });

  return res.json({ success: true });
});

// POST /api/asterisk/call-status - Callback com o status final de encerramento da chamada
router.post('/asterisk/call-status', (req, res) => {
  const { uniqueid, campaign_id, client_id, phone, status, duration } = req.body;
  console.log(`Callback de status da chamada: UniqueID=${uniqueid}, Status=${status}, Duracao=${duration}s`);
  // #region debug-point B:hangup-callback
  (()=>{const fs=require('fs'),p='c:/Users/User/Desktop/URA-Bal-o-main/.dbg/call-drop-early.env';let u='http://127.0.0.1:7777/event',s='call-drop-early';try{const e=fs.readFileSync(p,'utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'B',location:'backend/routes/calls.js:call-status',msg:'[DEBUG] hangup callback received',data:{uniqueid,campaign_id,client_id,phone,status,duration},ts:Date.now()})}).catch(()=>{})})();
  // #endregion

  db.serialize(() => {
    // Vincula o uniqueid se ainda não estiver vinculado
    db.run(
      `UPDATE calls 
       SET asterisk_uniqueid = ?, duration = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = (
         SELECT id FROM calls 
         WHERE campaign_id = ? AND client_id = ? AND asterisk_uniqueid IS NULL
         ORDER BY id DESC LIMIT 1
       )`,
      [uniqueid, duration || 0, campaign_id, client_id]
    );

    // Se a chamada não foi atendida (ex: Ocupado, Sem Resposta, etc.)
    // Asterisk Dial status comuns: BUSY, NOANSWER, CANCEL, CONGESTION, FAILED
    const cleanStatus = (status || '').toUpperCase();
    const isAnswered = cleanStatus === 'ANSWER' || cleanStatus === 'ANSWERED' || parseInt(duration || '0', 10) > 0;

    // Busca o registro para ver se já foi gravado dígito (se foi, mantemos status ATENDIDA)
    db.get('SELECT digit, result FROM calls WHERE asterisk_uniqueid = ?', [uniqueid], (err, call) => {
      if (err) return;

      let finalCallStatus = 'COMPLETADA';
      let finalClientStatus = 'COMPLETADA';

      if (!isAnswered) {
        finalCallStatus = 'FALHOU';
        finalClientStatus = 'FALHOU';
        
        let failReason = 'SEM_RESPOSTA';
        if (cleanStatus === 'BUSY') failReason = 'OCUPADO';
        if (cleanStatus === 'CONGESTION') failReason = 'CONGESTIONAMENTO';
        if (cleanStatus === 'FAILED') failReason = 'FALHA_CONEXAO';

        db.run(
          `UPDATE calls 
           SET status = ?, result = ?, updated_at = CURRENT_TIMESTAMP
           WHERE asterisk_uniqueid = ?`,
          [finalCallStatus, failReason, uniqueid]
        );
      } else {
        // Se foi atendida, mas o cliente desligou sem digitar nada
        const hasResult = call && call.result;
        if (!hasResult) {
          db.run(
            `UPDATE calls 
             SET status = 'ATENDIDA', result = 'SEM_RESPOSTA', updated_at = CURRENT_TIMESTAMP
             WHERE asterisk_uniqueid = ?`,
            [uniqueid]
          );
          finalClientStatus = 'SEM_RESPOSTA';
        } else {
          // Mantém o status/result do DTMF
          finalClientStatus = call.result;
        }
      }

      // Se falhou, atualiza status na campanha e cliente
      db.run(
        `UPDATE campaign_clients 
         SET status = ?, last_attempt_at = CURRENT_TIMESTAMP
         WHERE campaign_id = ? AND client_id = ? AND status = 'EM_CHAMADA'`,
        [finalClientStatus, campaign_id, client_id]
      );

      db.run(
        `UPDATE clients 
         SET status = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ? AND status = 'EM_CHAMADA'`,
        [finalClientStatus, client_id]
      );
    });
  });

  return res.json({ success: true });
});

// GET /api/export/calls.csv - Exporta relatório completo de chamadas em CSV
router.get('/export/calls.csv', requireAuth, (req, res) => {
  db.all(
    `SELECT c.id, cp.name as campaign_name, cl.name as client_name, c.phone, c.status, c.digit, c.result, c.duration, c.attempt, c.created_at
     FROM calls c
     LEFT JOIN clients cl ON c.client_id = cl.id
     LEFT JOIN campaigns cp ON c.campaign_id = cp.id
     ORDER BY c.id DESC`,
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).send('Erro ao gerar relatório CSV.');
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=relatorio_chamadas_ura.csv');

      // Cabeçalho CSV
      let csv = 'ID;Campanha;Cliente;Telefone;Status;Tecla Digitada;Resultado;Duração (s);Tentativa;Data e Hora\n';

      rows.forEach((r) => {
        const campaignName = (r.campaign_name || '').replace(/;/g, ',');
        const clientName = (r.client_name || '').replace(/;/g, ',');
        const phone = r.phone || '';
        const status = r.status || '';
        const digit = r.digit || '';
        const result = r.result || '';
        const duration = r.duration || 0;
        const attempt = r.attempt || 1;
        const createdAt = r.created_at || '';

        csv += `${r.id};${campaignName};${clientName};${phone};${status};${digit};${result};${duration};${attempt};${createdAt}\n`;
      });

      return res.send('\uFEFF' + csv); // Adiciona BOM para abrir corretamente no Excel brasileiro
    }
  );
});

module.exports = router;
