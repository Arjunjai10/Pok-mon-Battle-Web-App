const express = require('express');
const authController = require('../controllers/authController');
const teamController = require('../controllers/teamController');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Auth Routes
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.get('/auth/me', authMiddleware, authController.getMe);

// Team Routes
router.post('/team/save', authMiddleware, teamController.saveTeam);
router.get('/team/load', authMiddleware, teamController.loadTeam);

module.exports = router;
