const db = require('../utils/db');

function saveTeam(req, res) {
  try {
    const { team } = req.body;
    if (!team || !Array.isArray(team)) {
      return res.status(400).json({ error: 'Valid team array required' });
    }

    const userId = req.user.id;
    const users = db.getUsers();
    const userIndex = users.findIndex(u => u.id === userId);

    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    users[userIndex].team = team;
    db.saveUsers(users);

    res.json({ message: 'Team saved successfully' });
  } catch (err) {
    console.error('Save team error:', err);
    res.status(500).json({ error: 'Server error while saving team' });
  }
}

function loadTeam(req, res) {
  try {
    const userId = req.user.id;
    const user = db.findUserById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ team: user.team || [] });
  } catch (err) {
    console.error('Load team error:', err);
    res.status(500).json({ error: 'Server error while loading team' });
  }
}

module.exports = {
  saveTeam,
  loadTeam
};
