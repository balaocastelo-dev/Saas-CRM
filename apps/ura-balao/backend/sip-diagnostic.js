const dgram = require('dgram');
const dns = require('dns');
const amiClient = require('./ami');
const { db } = require('./database');

// Resolve o host SIP para IP
function resolveHost(host) {
  return new Promise((resolve, reject) => {
    dns.lookup(host, (err, address) => {
      if (err) return reject(err);
      if (!address) return reject(new Error('Nenhum IP encontrado para o host.'));
      resolve(address);
    });
  });
}

// Testa uma porta UDP enviando um pacote SIP OPTIONS
function testUdpPort(hostIp, hostName, port, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const client = dgram.createSocket('udp4');
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        client.close();
        resolve({
          port,
          success: false,
          status: 'porta não respondeu',
          details: 'Timeout (servidor não enviou dados de volta)'
        });
      }
    }, timeoutMs);

    client.on('message', (msg) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        client.close();
        const responseStr = msg.toString();
        
        if (responseStr.startsWith('SIP/2.0')) {
          const firstLine = responseStr.split('\r\n')[0];
          resolve({
            port,
            success: true,
            status: 'porta respondeu',
            details: `Resposta SIP válida recebida: "${firstLine}"`
          });
        } else {
          resolve({
            port,
            success: true,
            status: 'porta respondeu',
            details: 'Servidor respondeu, mas os dados não parecem ser do protocolo SIP.'
          });
        }
      }
    });

    client.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        client.close();
        resolve({
          port,
          success: false,
          status: 'erro de rede',
          details: `Erro no socket UDP: ${err.message}`
        });
      }
    });

    const callId = Math.random().toString(36).substring(2) + '@127.0.0.1';
    const sipOptions = 
      `OPTIONS sip:${hostName}:${port} SIP/2.0\r\n` +
      `Via: SIP/2.0/UDP 127.0.0.1:5060;rport;branch=z9hG4bK${Math.floor(Math.random() * 1000000)}\r\n` +
      `Max-Forwards: 70\r\n` +
      `To: <sip:${hostName}:${port}>\r\n` +
      `From: <sip:anonymous@anonymous.invalid>;tag=${Math.floor(Math.random() * 1000000)}\r\n` +
      `Call-ID: ${callId}\r\n` +
      `CSeq: 1 OPTIONS\r\n` +
      `User-Agent: UraBalaoSipProbe\r\n` +
      `Content-Length: 0\r\n\r\n`;

    const message = Buffer.from(sipOptions);
    client.send(message, 0, message.length, port, hostIp, (err) => {
      if (err && !resolved) {
        resolved = true;
        clearTimeout(timer);
        client.close();
        resolve({
          port,
          success: false,
          status: 'erro de rede',
          details: `Falha ao enviar pacote UDP: ${err.message}`
        });
      }
    });
  });
}

// Executa teste em lote de portas prováveis
async function diagnosePorts(host, possiblePortsString) {
  try {
    const ip = await resolveHost(host);
    const ports = possiblePortsString.split(',').map(p => parseInt(p.trim(), 10));
    const results = [];

    for (const port of ports) {
      const res = await testUdpPort(ip, host, port);
      results.push(res);

      // Grava no banco de dados para histórico
      db.run(
        `INSERT INTO sip_diagnostics (host, port, transport, test_type, result, details, created_at)
         VALUES (?, ?, "udp", "PORT_SCAN", ?, ?, CURRENT_TIMESTAMP)`,
        [host, port.toString(), res.status, res.details]
      );
    }

    return { success: true, results };
  } catch (err) {
    return { success: false, error: `Falha ao resolver host: ${err.message}` };
  }
}

// Verifica status do registro do Asterisk usando comando AMI
async function getAsteriskRegistryStatus() {
  if (!amiClient.connected || !amiClient.loggedIn) {
    return { success: false, status: 'registro SIP falhou', details: 'AMI do Asterisk não está conectado ou autenticado.' };
  }

  try {
    // Executa comando da CLI do Asterisk via AMI
    const response = await amiClient.sendAction('Command', { Command: 'pjsip show registrations' });
    const output = response.Output || '';
    
    // Procura por 'Registered' ou linhas contendo a telefonia facil
    if (output.toLowerCase().includes('registered')) {
      return {
        success: true,
        status: 'registro SIP OK',
        details: output
      };
    } else if (output.toLowerCase().includes('rejected') || output.toLowerCase().includes('auth')) {
      return {
        success: false,
        status: 'erro de usuário/senha',
        details: `Asterisk recusou registro. Resposta:\n${output}`
      };
    } else {
      return {
        success: false,
        status: 'registro SIP falhou',
        details: `Asterisk não registrou no provedor. Resposta:\n${output}`
      };
    }
  } catch (err) {
    return {
      success: false,
      status: 'erro de rede',
      details: `Falha ao enviar comando para o Asterisk: ${err.message}`
    };
  }
}

module.exports = {
  diagnosePorts,
  testUdpPort,
  resolveHost,
  getAsteriskRegistryStatus
};
