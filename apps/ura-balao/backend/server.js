require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Inicializa banco de dados
const { db } = require('./database');

// Importa módulos
const amiClient = require('./ami');
const campaignWorker = require('./campaign-worker');

// Importa rotas
const authModule = require('./routes/auth');
const clientsModule = require('./routes/clients');
const campaignsRouter = require('./routes/campaigns');
const callsRouter = require('./routes/calls');
const settingsRouter = require('./routes/settings');
const sipDiagRouter = require('./routes/sip-diagnostic');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'troque_essa_senha_padrao_123',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 // 24 horas
    }
  })
);

// Servir frontend estático
app.use(express.static(path.join(__dirname, 'public')));

// Registro das rotas API
app.use('/api', authModule.router);
app.use('/api/clients', clientsModule.router);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/calls', callsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/sip-diagnostic', sipDiagRouter);

// Rota de estatísticas do Dashboard
app.get('/api/dashboard', authModule.requireAuth, (req, res) => {
  const stats = {};
  
  db.get('SELECT COUNT(*) as count FROM clients', [], (err, row) => {
    stats.total_clients = row ? row.count : 0;
    
    db.get('SELECT COUNT(*) as count FROM calls', [], (err2, row2) => {
      stats.total_calls = row2 ? row2.count : 0;
      
      db.get('SELECT COUNT(*) as count FROM calls WHERE status = "ATENDIDA" OR status = "COMPLETADA"', [], (err3, row3) => {
        stats.calls_answered = row3 ? row3.count : 0;
        
        db.get('SELECT COUNT(*) as count FROM calls WHERE status = "FALHOU"', [], (err4, row4) => {
          stats.calls_failed = row4 ? row4.count : 0;
          
          db.get('SELECT COUNT(*) as count FROM calls WHERE digit = "1"', [], (err5, row5) => {
            stats.pressed_1 = row5 ? row5.count : 0;
            
            db.get('SELECT COUNT(*) as count FROM calls WHERE digit = "2"', [], (err6, row6) => {
              stats.pressed_2 = row6 ? row6.count : 0;
              
              db.get('SELECT COUNT(*) as count FROM blacklist', [], (err7, row7) => {
                stats.blacklist_count = row7 ? row7.count : 0;
                
                // Status AMI
                stats.ami_connected = amiClient.connected && amiClient.loggedIn;
                
                res.json(stats);
              });
            });
          });
        });
      });
    });
  });
});

// Redireciona raiz para dashboard ou login conforme sessão
app.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard.html');
  }
  return res.redirect('/login.html');
});

// Inicialização segura das conexões ao iniciar o servidor
app.listen(PORT, async () => {
  console.log(`===================================================`);
  console.log(`Servidor URA-ATIVA-BALAO rodando na porta ${PORT}`);
  console.log(`Acesse: http://localhost:${PORT}`);
  console.log(`===================================================`);

  // 1. Tenta conexão inicial ao Asterisk AMI
  try {
    await amiClient.connect();
  } catch (err) {
    console.error('AVISO: Não foi possível conectar ao Asterisk AMI durante a inicialização.');
    console.error('O painel funcionará, mas o Diagnóstico de Rede AMI e as ligações exigirão conexão manual.');
  }

  // 2. Inicia o Worker de Campanhas em segundo plano
  campaignWorker.start();
});
