const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { requireAuth } = require('./auth');

// Normaliza números brasileiros para o formato E.164 (+55...)
function normalizePhone(phone) {
  if (!phone) return null;
  let cleaned = phone.replace(/\D/g, ''); // Mantém apenas os dígitos

  // Se o usuário digitou sem o DDI (55) mas com DDD (ex: 19997510267 ou 1932541212)
  if (cleaned.length === 10 || cleaned.length === 11) {
    cleaned = '55' + cleaned;
  }

  // Verifica se tem tamanho válido para o Brasil com DDI (12 ou 13 dígitos)
  if (cleaned.length === 12 || cleaned.length === 13) {
    if (cleaned.startsWith('55')) {
      return '+' + cleaned;
    }
  }

  return null; // Inválido
}

// GET /api/clients - Lista todos os clientes
router.get('/', requireAuth, (req, res) => {
  db.all('SELECT * FROM clients ORDER BY id DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao buscar clientes.' });
    }
    res.json(rows);
  });
});

// POST /api/clients - Cadastro manual de cliente
router.post('/', requireAuth, (req, res) => {
  const { name, phone, reason, note } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ error: 'Nome e telefone são obrigatórios.' });
  }

  const normalized = normalizePhone(phone);
  if (!normalized) {
    return res.status(400).json({ error: 'Número de telefone brasileiro inválido. Formato esperado: (DD) 9XXXX-XXXX ou DDXXXXXXXX.' });
  }

  // Verifica se o número já está na blacklist
  db.get('SELECT * FROM blacklist WHERE phone = ?', [normalized], (err, blacklisted) => {
    if (err) return res.status(500).json({ error: 'Erro ao verificar lista de bloqueio.' });
    
    const initialStatus = blacklisted ? 'BLOQUEADO' : 'PENDENTE';

    db.run(
      `INSERT INTO clients (name, phone, reason, note, status)
       VALUES (?, ?, ?, ?, ?)`,
      [name, normalized, reason, note, initialStatus],
      function (err2) {
        if (err2) {
          if (err2.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Este número de telefone já está cadastrado.' });
          }
          return res.status(500).json({ error: 'Erro ao cadastrar cliente.' });
        }
        res.json({
          id: this.lastID,
          name,
          phone: normalized,
          reason,
          note,
          status: initialStatus
        });
      }
    );
  });
});

// POST /api/clients/import - Importação de clientes por CSV/Texto colado
// Formato: Nome;Telefone;Motivo (uma entrada por linha)
router.post('/import', requireAuth, (req, res) => {
  const { content } = req.body;

  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'Conteúdo de importação inválido.' });
  }

  const lines = content.split('\n');
  const imported = [];
  const errors = [];
  let pendingInserts = 0;

  const checkFinish = () => {
    if (pendingInserts === 0) {
      res.json({
        success: true,
        importedCount: imported.length,
        errorsCount: errors.length,
        errors
      });
    }
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const parts = trimmed.split(';');
    if (parts.length < 2) {
      errors.push(`Linha ${index + 1}: Formato inválido. Use Nome;Telefone;Motivo`);
      return;
    }

    const name = parts[0].trim();
    const phone = parts[1].trim();
    const reason = parts[2] ? parts[2].trim() : '';
    const note = parts[3] ? parts[3].trim() : 'Importado por lote';

    const normalized = normalizePhone(phone);
    if (!normalized) {
      errors.push(`Linha ${index + 1}: Telefone inválido "${phone}"`);
      return;
    }

    pendingInserts++;

    db.get('SELECT * FROM blacklist WHERE phone = ?', [normalized], (err, blacklisted) => {
      if (err) {
        errors.push(`Linha ${index + 1}: Erro de banco de dados`);
        pendingInserts--;
        checkFinish();
        return;
      }

      const initialStatus = blacklisted ? 'BLOQUEADO' : 'PENDENTE';

      db.run(
        `INSERT OR IGNORE INTO clients (name, phone, reason, note, status)
         VALUES (?, ?, ?, ?, ?)`,
        [name, normalized, reason, note, initialStatus],
        function (err2) {
          if (err2) {
            errors.push(`Linha ${index + 1}: Falha ao inserir (${err2.message})`);
          } else if (this.changes > 0) {
            imported.push({ name, phone: normalized });
          } else {
            errors.push(`Linha ${index + 1}: Telefone já cadastrado (${normalized})`);
          }
          pendingInserts--;
          checkFinish();
        }
      );
    });
  });

  if (pendingInserts === 0) {
    checkFinish();
  }
});

// DELETE /api/clients/:id - Remove um cliente
router.delete('/:id', requireAuth, (req, res) => {
  const id = req.params.id;

  db.run('DELETE FROM clients WHERE id = ?', [id], function (err) {
    if (err) {
      return res.status(500).json({ error: 'Erro ao remover cliente.' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }
    res.json({ success: true, message: 'Cliente removido.' });
  });
});

module.exports = {
  router,
  normalizePhone
};
