const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { requireAuth } = require('./auth');
const {
  encodeProductReason,
  fetchCatalogProducts,
  fetchProductByUrl,
  getReasonPreview,
  sanitizeProduct
} = require('../promo-engine');

// GET /api/campaigns - Retorna todas as campanhas com estatísticas
router.get('/', requireAuth, (req, res) => {
  db.all('SELECT * FROM campaigns ORDER BY id DESC', [], (err, campaigns) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao listar campanhas.' });
    }

    // Busca contagem de clientes e status para cada campanha
    let pendingQueries = campaigns.length;
    if (pendingQueries === 0) {
      return res.json([]);
    }

    campaigns.forEach((c) => {
      c.display_message = getReasonPreview(c.message);
      db.get(
        `SELECT 
          COUNT(*) as total,
          SUM(case when status='PENDENTE' then 1 else 0 end) as pendentes,
          SUM(case when status='EM_CHAMADA' then 1 else 0 end) as em_chamada,
          SUM(case when status='COMPLETADO' then 1 else 0 end) as completados,
          SUM(case when status='FALHOU' then 1 else 0 end) as falhados,
          SUM(case when status='BLOQUEADO' then 1 else 0 end) as bloqueados
         FROM campaign_clients WHERE campaign_id = ?`,
        [c.id],
        (err2, stats) => {
          c.stats = stats || { total: 0, pendentes: 0, em_chamada: 0, completados: 0, falhados: 0, bloqueados: 0 };
          pendingQueries--;
          if (pendingQueries === 0) {
            res.json(campaigns);
          }
        }
      );
    });
  });
});

// GET /api/campaigns/catalog/products?category=ssd
router.get('/catalog/products', requireAuth, async (req, res) => {
  try {
    const products = await fetchCatalogProducts(req.query.category || 'ssd', 20);
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: `Erro ao consultar produtos do balao.info: ${err.message}` });
  }
});

// GET /api/campaigns/catalog/product-by-url?url=https://www.balao.info/product/...
router.get('/catalog/product-by-url', requireAuth, async (req, res) => {
  try {
    const product = await fetchProductByUrl(req.query.url || '');
    res.json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/campaigns - Cria nova campanha
router.post('/', requireAuth, (req, res) => {
  const { name, message, product, calls_per_minute, max_attempts, start_hour, end_hour, client_ids } = req.body;
  const cleanMessage = (message || '').trim();
  const cleanProduct = product ? sanitizeProduct(product) : null;
  const storedMessage = cleanProduct && cleanProduct.title ? encodeProductReason(cleanProduct) : cleanMessage;

  if (!name || !storedMessage) {
    return res.status(400).json({ error: 'Nome da campanha e uma mensagem ou produto são obrigatórios.' });
  }

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    db.run(
      `INSERT INTO campaigns (name, message, status, calls_per_minute, max_attempts, start_hour, end_hour, created_at, updated_at)
       VALUES (?, ?, "INATIVA", ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        name,
        storedMessage,
        calls_per_minute || 1,
        max_attempts || 2,
        start_hour || '09:00',
        end_hour || '18:00'
      ],
      function (err) {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: 'Erro ao criar campanha.' });
        }

        const campaignId = this.lastID;

        // Se informou IDs de clientes específicos, associa-os
        if (Array.isArray(client_ids) && client_ids.length > 0) {
          const stmt = db.prepare('INSERT OR IGNORE INTO campaign_clients (campaign_id, client_id, status, attempts) VALUES (?, ?, "PENDENTE", 0)');
          client_ids.forEach((clientId) => {
            stmt.run(campaignId, clientId);
          });
          stmt.finalize();

          db.run('COMMIT', (errCommit) => {
            if (errCommit) {
              return res.status(500).json({ error: 'Erro ao salvar relacionamento.' });
            }
            res.json({ success: true, campaignId, message: 'Campanha criada e clientes associados.' });
          });
        } else {
          // Associa TODOS os clientes pendentes da empresa por padrão
          db.run(
            `INSERT INTO campaign_clients (campaign_id, client_id, status, attempts)
             SELECT ?, id, "PENDENTE", 0 FROM clients WHERE status = "PENDENTE"`,
            [campaignId],
            (err2) => {
              if (err2) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: 'Erro ao associar clientes pendentes.' });
              }
              db.run('COMMIT');
              res.json({ success: true, campaignId, message: 'Campanha criada com todos os clientes pendentes.' });
            }
          );
        }
      }
    );
  });
});

// POST /api/campaigns/:id/start - Inicia a campanha
router.post('/:id/start', requireAuth, (req, res) => {
  const id = req.params.id;

  // Primeiro, verifica se há clientes pendentes para ligar nesta campanha
  db.get('SELECT COUNT(*) as count FROM campaign_clients WHERE campaign_id = ? AND status IN ("PENDENTE", "FALHOU")', [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Erro de validação da campanha.' });
    if (!row || row.count === 0) {
      return res.status(400).json({ error: 'Não é possível iniciar uma campanha sem clientes com status PENDENTE ou FALHOU.' });
    }

    // Coloca outras campanhas ativas como INATIVAS/PAUSADAS por simplicidade, para rodar uma campanha de cada vez
    db.serialize(() => {
      db.run('UPDATE campaigns SET status = "PAUSADA" WHERE status = "ATIVA"');
      db.run('UPDATE campaigns SET status = "ATIVA", updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id], (err2) => {
        if (err2) return res.status(500).json({ error: 'Erro ao iniciar campanha.' });
        res.json({ success: true, message: 'Campanha iniciada com sucesso.' });
      });
    });
  });
});

// POST /api/campaigns/:id/pause - Pausa a campanha
router.post('/:id/pause', requireAuth, (req, res) => {
  const id = req.params.id;
  db.run('UPDATE campaigns SET status = "PAUSADA", updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id], (err) => {
    if (err) return res.status(500).json({ error: 'Erro ao pausar campanha.' });
    res.json({ success: true, message: 'Campanha pausada.' });
  });
});

// POST /api/campaigns/:id/stop - Para a campanha
router.post('/:id/stop', requireAuth, (req, res) => {
  const id = req.params.id;
  db.run('UPDATE campaigns SET status = "PARADA", updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id], (err) => {
    if (err) return res.status(500).json({ error: 'Erro ao parar campanha.' });
    res.json({ success: true, message: 'Campanha parada.' });
  });
});

module.exports = router;
