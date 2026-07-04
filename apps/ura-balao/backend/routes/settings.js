const express = require('express');
const router = express.Router();
const { settings, db } = require('../database');
const { requireAuth } = require('./auth');
const amiClient = require('../ami');

// GET /api/settings - Retorna todas as configurações
router.get('/', requireAuth, async (req, res) => {
  try {
    const allSettings = await settings.getAll();
    
    // Máscara de senha para segurança no painel frontend
    if (allSettings.SIP_PASSWORD) {
      allSettings.SIP_PASSWORD = '********';
    }
    if (allSettings.ASTERISK_AMI_PASSWORD) {
      allSettings.ASTERISK_AMI_PASSWORD = '********';
    }
    if (allSettings.GEMINI_API_KEY) {
      allSettings.GEMINI_API_KEY = '********';
    }
    if (allSettings.ELEVENLABS_API_KEY) {
      allSettings.ELEVENLABS_API_KEY = '********';
    }

    // Adiciona o status de conexão AMI ativo no retorno para informação rápida
    allSettings.AMI_CONNECTED = amiClient.connected && amiClient.loggedIn;

    res.json(allSettings);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar configurações.' });
  }
});

// POST /api/settings - Atualiza as configurações
router.post('/', requireAuth, async (req, res) => {
  const newSettings = req.body;

  try {
    for (const [key, value] of Object.entries(newSettings)) {
      // Se a senha foi enviada como mascarada (********), ignora a atualização dela
      if ((key === 'SIP_PASSWORD' || key === 'ASTERISK_AMI_PASSWORD' || key === 'GEMINI_API_KEY' || key === 'ELEVENLABS_API_KEY') && value === '********') {
        continue;
      }
      await settings.set(key, value);
    }

    // Força o cliente AMI a se reconectar se as credenciais AMI mudaram
    if (newSettings.ASTERISK_AMI_HOST || newSettings.ASTERISK_AMI_PORT || newSettings.ASTERISK_AMI_USER || newSettings.ASTERISK_AMI_PASSWORD) {
      console.log('Detectada alteração de credenciais AMI. Reconectando...');
      amiClient.connect().catch(err => console.error('Erro ao reconectar AMI com novas credenciais:', err.message));
    }

    res.json({ success: true, message: 'Configurações salvas com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar configurações.' });
  }
});

// POST /api/settings/test-ami - Testa a conexão AMI manualmente
router.post('/test-ami', requireAuth, async (req, res) => {
  const result = await amiClient.testAmiConnection();
  res.json(result);
});

module.exports = router;
