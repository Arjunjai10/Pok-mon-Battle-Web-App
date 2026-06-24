const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_pokemon_battle';

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, username }
    
    // Auto-recreate user if they don't exist (e.g. server restarted and wiped ephemeral DB)
    const db = require('../utils/db');
    const users = db.getUsers();
    if (!users.find(u => u.id === req.user.id)) {
      users.push({
        id: req.user.id,
        username: req.user.username,
        password: '', // Unusable password, but session stays valid
        team: null,
        createdAt: new Date().toISOString()
      });
      db.saveUsers(users);
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
}

module.exports = authMiddleware;
