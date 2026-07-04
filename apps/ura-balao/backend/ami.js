const net = require('net');
const { settings } = require('./database');

class AmiClient {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.loggedIn = false;
    this.buffer = '';
    this.actionCallbacks = new Map();
    this.reconnectTimer = null;
  }

  async getConfigs() {
    const s = await settings.getAll();
    return {
      host: s.ASTERISK_AMI_HOST || '127.0.0.1',
      port: parseInt(s.ASTERISK_AMI_PORT || '5038', 10),
      user: s.ASTERISK_AMI_USER || 'uraadmin',
      password: s.ASTERISK_AMI_PASSWORD || 'troque_essa_senha'
    };
  }

  async connect() {
    if (this.socket) {
      this.socket.destroy();
    }
    
    const configs = await this.getConfigs();
    console.log(`Conectando ao AMI do Asterisk em ${configs.host}:${configs.port}...`);
    
    return new Promise((resolve, reject) => {
      let resolved = false;

      this.socket = new net.Socket();

      this.socket.connect(configs.port, configs.host, () => {
        this.connected = true;
        console.log('Conexão TCP com AMI estabelecida.');
      });

      this.socket.on('data', (data) => {
        this.buffer += data.toString();
        this.processBuffer();

        // Se recebermos o banner do Asterisk e ainda não logamos
        if (this.connected && !this.loggedIn && this.buffer.includes('Asterisk Call Manager')) {
          this.login(configs.user, configs.password)
            .then(() => {
              this.loggedIn = true;
              console.log('Login no AMI do Asterisk realizado com sucesso.');
              if (!resolved) {
                resolved = true;
                resolve(true);
              }
            })
            .catch((err) => {
              console.error('Falha no login do AMI:', err.message);
              if (!resolved) {
                resolved = true;
                reject(err);
              }
            });
        }
      });

      this.socket.on('error', (err) => {
        console.error('Erro na conexão AMI:', err.message);
        this.connected = false;
        this.loggedIn = false;
        if (!resolved) {
          resolved = true;
          reject(err);
        }
        this.scheduleReconnect();
      });

      this.socket.on('close', () => {
        console.log('Conexão AMI fechada.');
        this.connected = false;
        this.loggedIn = false;
        this.scheduleReconnect();
      });
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch (err) {
        // Ignora erro e tentará novamente mais tarde
      }
    }, 10000); // Tenta reconectar a cada 10 segundos
  }

  login(user, password) {
    const actionId = `login_${Date.now()}`;
    const cmd = `Action: Login\r\nUsername: ${user}\r\nSecret: ${password}\r\nActionID: ${actionId}\r\n\r\n`;
    
    return new Promise((resolve, reject) => {
      this.actionCallbacks.set(actionId, (response) => {
        if (response.Response === 'Success') {
          resolve(true);
        } else {
          reject(new Error(response.Message || 'Falha de login'));
        }
      });
      this.socket.write(cmd);
    });
  }

  processBuffer() {
    // Pacotes AMI são separados por \r\n\r\n
    let index;
    while ((index = this.buffer.indexOf('\r\n\r\n')) !== -1) {
      const packetStr = this.buffer.substring(0, index);
      this.buffer = this.buffer.substring(index + 4);
      this.parsePacket(packetStr);
    }
  }

  parsePacket(str) {
    const lines = str.split('\r\n');
    const response = {};
    for (const line of lines) {
      const splitIndex = line.indexOf(': ');
      if (splitIndex !== -1) {
        const key = line.substring(0, splitIndex).trim();
        const value = line.substring(splitIndex + 2).trim();
        response[key] = value;
      }
    }

    if (response.ActionID && this.actionCallbacks.has(response.ActionID)) {
      const cb = this.actionCallbacks.get(response.ActionID);
      this.actionCallbacks.delete(response.ActionID);
      cb(response);
    }
  }

  sendAction(action, fields = {}) {
    if (!this.connected || !this.loggedIn) {
      return Promise.reject(new Error('AMI não conectado ou não logado.'));
    }

    const actionId = `action_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    let cmd = `Action: ${action}\r\nActionID: ${actionId}\r\n`;
    
    for (const [key, value] of Object.entries(fields)) {
      cmd += `${key}: ${value}\r\n`;
    }
    cmd += '\r\n';

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.actionCallbacks.delete(actionId);
        reject(new Error('Tempo limite da ação AMI esgotado.'));
      }, 5000);

      this.actionCallbacks.set(actionId, (response) => {
        clearTimeout(timeout);
        resolve(response);
      });

      this.socket.write(cmd);
    });
  }

  mapReasonToAudio(reason, phone, campaignId, clientId) {
    const promoKeys = ['ssd', 'memoria', 'gpu', 'monitor', 'cpu'];

    const pickPromoKey = () => {
      const seed = `${phone || ''}|${campaignId || ''}|${clientId || ''}`;
      let sum = 0;
      for (let i = 0; i < seed.length; i += 1) sum += seed.charCodeAt(i);
      return promoKeys[sum % promoKeys.length];
    };

    if (!reason) return pickPromoKey();

    const clean = reason
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

    if (promoKeys.includes(clean)) return clean;
    if (clean.includes('promocao') || clean.includes('promo') || clean.includes('oferta')) return pickPromoKey();
    if (clean.includes('ssd')) return 'ssd';
    if (clean.includes('memoria') || clean.includes('ram')) return 'memoria';
    if (clean.includes('gpu') || clean.includes('video') || clean.includes('rtx') || clean.includes('placa')) return 'gpu';
    if (clean.includes('monitor') || clean.includes('tela')) return 'monitor';
    if (clean.includes('cpu') || clean.includes('processador') || clean.includes('ryzen')) return 'cpu';
    if (clean.includes('assistencia') || clean.includes('garantia') || clean.includes('suporte')) return 'assistencia';
    if (clean.includes('cobranca') || clean.includes('pagamento') || clean.includes('vencimento') || clean.includes('devedor')) return 'cobranca';
    if (clean.includes('pos-venda') || clean.includes('pos venda') || clean.includes('pesquisa')) return 'posvenda';
    if (clean.includes('entrega') || clean.includes('retirada') || clean.includes('pronto')) return 'entrega';
    if (clean.includes('orcamento') || clean.includes('orçamento')) return 'orcamento';

    return pickPromoKey();
  }

  async originateCall(phone, campaignId, clientId, reason) {
    const audioFile = this.mapReasonToAudio(reason, phone, campaignId, clientId);
    console.log(`Disparando chamada AMI para o número ${phone} com áudio do motivo '${audioFile}'...`);
    
    const fields = {
      Channel: `PJSIP/${phone}@telefoniafacil-out`,
      Context: 'ura-outbound',
      Exten: 's',
      Priority: '1',
      Variable: `CLIENT_ID=${clientId},CAMPAIGN_ID=${campaignId},PHONE=${phone},MOTIVO_AUDIO=${audioFile}`,
      Async: 'true'
    };

    return this.sendAction('Originate', fields);
  }
  
  async testAmiConnection() {
    try {
      await this.connect();
      return { success: true, message: 'Conexão e Login no AMI efetuados com sucesso!' };
    } catch (err) {
      return { success: false, message: `Erro ao testar conexão AMI: ${err.message}` };
    }
  }
}

const amiClient = new AmiClient();
module.exports = amiClient;
