const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../utils/db');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_pokemon_battle';

async function register(req, res) {
  try {
    const { username, password } = req.body;
    if (!username || !password || username.trim().length < 3 || password.length < 4) {
      return res.status(400).json({ error: 'Username (min 3) and password (min 4) required' });
    }

    if (db.findUserByUsername(username)) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = {
      id: Math.random().toString(36).substring(2, 10) + Date.now().toString(36),
      username: username.trim(),
      password: hashedPassword,
      team: null,
      createdAt: new Date().toISOString()
    };

    const users = db.getUsers();
    users.push(newUser);
    db.saveUsers(users);

    const token = jwt.sign({ id: newUser.id, username: newUser.username }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({ token, user: { id: newUser.id, username: newUser.username } });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Server error during registration' });
  }
}

async function login(req, res) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = db.findUserByUsername(username);
    if (!user) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
}

function getMe(req, res) {
  // auth middleware already populated req.user
  res.json({ user: req.user });
}

module.exports = {
  register,
  login,
  getMe
};
