const express = require('express');
const router = express.Router();
const { db, hashPassword } = require('../database');

// Middleware de verificação de autenticação
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.status(401).json({ error: 'Não autorizado. Por favor, faça login.' });
}

// Rota de login (POST)
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
  }

  const passHash = hashPassword(password);

  db.get(
    'SELECT * FROM users WHERE username = ? AND password_hash = ?',
    [username, passHash],
    (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Erro no servidor durante login.' });
      }

      if (!user) {
        return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
      }

      // Salva sessão
      req.session.userId = user.id;
      req.session.username = user.username;
      
      return res.json({ success: true, message: 'Login bem-sucedido.' });
    }
  );
});

// Verifica estado da sessão atual
router.get('/session', (req, res) => {
  if (req.session && req.session.userId) {
    return res.json({ authenticated: true, username: req.session.username });
  }
  return res.json({ authenticated: false });
});

// Rota de logout (POST)
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Falha ao encerrar a sessão.' });
    }
    return res.json({ success: true, message: 'Logout realizado.' });
  });
});

module.exports = {
  router,
  requireAuth
};
