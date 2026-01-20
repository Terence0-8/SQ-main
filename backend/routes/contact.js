const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// POST /api/contact
router.post('/', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    
    if (!name || !email || !message) {
      return res.status(400).json({ success: false, error: "Champs requis." });
    }

    await pool.query(
      'INSERT INTO contact_messages (name, email, subject, message) VALUES ($1, $2, $3, $4)',
      [name, email, subject, message]
    );

    // (Ici on pourrait ajouter l'envoi d'email réel via Brevo/Sendgrid plus tard)

    res.json({ success: true, message: "Message reçu !" });
  } catch (err) {
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
});

module.exports = router;