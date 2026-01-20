const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Middleware de sécurité
const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) {
    next();
  } else {
    res.status(401).json({ success: false, error: "Vous devez être connecté." });
  }
};

// POST /api/subscriptions/upgrade
router.post('/upgrade', isAuthenticated, async (req, res) => {
  console.log("🔔 Demande d'abonnement reçue pour :", req.session.user.email);
  
  try {
    const userId = req.session.user.id;
    const { plan } = req.body; 
    const duration = plan === 'yearly' ? '1 year' : '1 month';

    // 1. Mise à jour SQL
    await pool.query(`
      UPDATE users 
      SET role = 'subscriber', 
          is_subscriber = TRUE,
          subscription_start_date = NOW(),
          subscription_end_date = NOW() + INTERVAL '${duration}'
      WHERE id = $1
    `, [userId]);

    console.log("✅ SQL mis à jour pour l'utilisateur ID :", userId);

    // 2. Mise à jour Session (Sans callback bloquant cette fois)
    req.session.user.role = 'subscriber';
    req.session.user.is_subscriber = true;

    // 3. Réponse immédiate
    res.json({ success: true, message: "Bienvenue au club !" });

  } catch (err) {
    console.error("❌ Erreur SQL Abonnement:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/subscriptions/cancel
router.post('/cancel', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user.id;
    await pool.query("UPDATE users SET role = 'reader', is_subscriber = FALSE WHERE id = $1", [userId]);
    
    req.session.user.role = 'reader';
    req.session.user.is_subscriber = false;
    
    res.json({ success: true, message: "Abonnement résilié." });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;