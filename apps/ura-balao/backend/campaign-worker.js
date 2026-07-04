const { db, settings } = require('./database');
const amiClient = require('./ami');
const {
  decodeProductReason,
  ensureProductAudioFile
} = require('./promo-engine');

class CampaignWorker {
  constructor() {
    this.running = false;
    this.timer = null;
    this.lastDialTime = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    console.log('Campaign Worker iniciado.');
    this.loop();
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log('Campaign Worker parado.');
  }

  async loop() {
    if (!this.running) return;

    try {
      await this.processNextCall();
    } catch (err) {
      console.error('Erro no Campaign Worker loop:', err.message);
    }

    // Roda novamente após 2 segundos
    this.timer = setTimeout(() => this.loop(), 2000);
  }

  // Verifica se a hora atual está dentro do intervalo permitido (formato HH:MM)
  isWithinAllowedHours(start, end) {
    if (!start || !end) return true;
    const now = new Date();
    const currentStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return currentStr >= start && currentStr <= end;
  }

  async processNextCall() {
    // 1. Procurar campanhas ativas
    const campaign = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM campaigns WHERE status = "ATIVA" LIMIT 1',
        [],
        (err, row) => {
          if (err) return reject(err);
          resolve(row);
        }
      );
    });

    if (!campaign) return;

    // 2. Verificar horário permitido para a campanha
    if (!this.isWithinAllowedHours(campaign.start_hour, campaign.end_hour)) {
      console.log(`Campanha '${campaign.name}' ativa, mas fora do horário permitido (${campaign.start_hour} - ${campaign.end_hour}).`);
      return;
    }

    // 3. Respeitar o limite seguro de chamadas por minuto
    const cpm = campaign.calls_per_minute || 1;
    const minDelayMs = (60 / cpm) * 1000;
    const now = Date.now();
    if (now - this.lastDialTime < minDelayMs) {
      // Pacing ativo, espera próxima volta
      return;
    }

    // 4. Buscar o próximo cliente pendente desta campanha
    const target = await new Promise((resolve, reject) => {
      db.get(
        `SELECT cc.*, c.name, c.phone, c.reason, c.note
         FROM campaign_clients cc
         JOIN clients c ON cc.client_id = c.id
         WHERE cc.campaign_id = ? AND cc.status IN ("PENDENTE", "FALHOU") AND cc.attempts < ?
         LIMIT 1`,
        [campaign.id, campaign.max_attempts],
        (err, row) => {
          if (err) return reject(err);
          resolve(row);
        }
      );
    });

    if (!target) {
      // Se não há mais clientes elegíveis, finaliza a campanha
      console.log(`Campanha '${campaign.name}' concluída ou sem clientes pendentes.`);
      db.run('UPDATE campaigns SET status = "COMPLETADA", updated_at = CURRENT_TIMESTAMP WHERE id = ?', [campaign.id]);
      return;
    }

    // 5. Verificar se o telefone está na Blacklist
    const isBlacklisted = await new Promise((resolve) => {
      db.get('SELECT * FROM blacklist WHERE phone = ?', [target.phone], (err, row) => {
        resolve(!!row);
      });
    });

    if (isBlacklisted) {
      console.log(`Cliente ${target.name} (${target.phone}) está na Blacklist. Bloqueando na campanha.`);
      db.run(
        'UPDATE campaign_clients SET status = "BLOQUEADO", last_attempt_at = CURRENT_TIMESTAMP WHERE campaign_id = ? AND client_id = ?',
        [campaign.id, target.client_id]
      );
      db.run(
        'UPDATE clients SET status = "BLOQUEADO", updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [target.client_id]
      );
      return;
    }

    // 6. Tenta disparar a chamada pelo AMI
    this.lastDialTime = now;
    
    // Atualiza status local para evitar dupla discagem concorrente
    db.run(
      'UPDATE campaign_clients SET status = "EM_CHAMADA", attempts = attempts + 1, last_attempt_at = CURRENT_TIMESTAMP WHERE campaign_id = ? AND client_id = ?',
      [campaign.id, target.client_id]
    );
    db.run(
      'UPDATE clients SET status = "EM_CHAMADA", updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [target.client_id]
    );

    try {
      const nextAttempt = target.attempts + 1;
      const reason = target.reason || campaign.message;
      const selectedProduct = decodeProductReason(reason);
      const dynamicAudioFile = selectedProduct ? await ensureProductAudioFile(selectedProduct) : null;
      
      // Registra a chamada na tabela calls
      db.run(
        `INSERT INTO calls (campaign_id, client_id, phone, reason, status, attempt, created_at, updated_at)
         VALUES (?, ?, ?, ?, "DISPARANDO", ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [campaign.id, target.client_id, target.phone, reason, nextAttempt]
      );

      // Efetua a ligação via AMI
      const amiResponse = await amiClient.originateCall(
        target.phone,
        campaign.id,
        target.client_id,
        reason,
        { dynamicAudioFile }
      );

      console.log(`Chamada iniciada via AMI para ${target.name} (${target.phone}). Resposta:`, amiResponse.Response);
    } catch (err) {
      console.error(`Erro ao disparar chamada para ${target.name} (${target.phone}):`, err.message);
      
      // Volta status para FALHOU para tentar novamente se permitido
      db.run(
        'UPDATE campaign_clients SET status = "FALHOU", last_attempt_at = CURRENT_TIMESTAMP WHERE campaign_id = ? AND client_id = ?',
        [campaign.id, target.client_id]
      );
      db.run(
        'UPDATE clients SET status = "FALHOU", updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [target.client_id]
      );
      
      // Atualiza o registro da chamada com erro
      db.run(
        `UPDATE calls SET status = "FALHA_CONEXAO", result = ?, updated_at = CURRENT_TIMESTAMP
         WHERE campaign_id = ? AND client_id = ? AND status = "DISPARANDO"`,
        [err.message, campaign.id, target.client_id]
      );
    }
  }
}

const campaignWorker = new CampaignWorker();
module.exports = campaignWorker;
