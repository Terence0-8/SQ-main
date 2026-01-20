const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const Joi = require('joi');
const { isAuthenticated } = require('../middleware/auth');

// ==========================================
// VALIDATION SCHEMA
// ==========================================
const subscriptionSchema = Joi.object({
  plan: Joi.string().valid('monthly', 'yearly').required()
    .messages({
      'any.only': 'Plan invalide. Choix disponibles : monthly, yearly',
      'any.required': 'Le plan est requis'
    })
});

// ==========================================
// POST /api/subscriptions/upgrade
// Passer en mode abonné
// ==========================================
router.post('/upgrade', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user.id;

    // Validation
    const { error, value } = subscriptionSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    const { plan } = value;

    console.log(`🔔 Abonnement ${plan} pour utilisateur ID: ${userId}`);

    // Mise à jour du statut abonné
    await pool.query(`
      UPDATE users 
      SET is_subscriber = TRUE, updated_at = NOW()
      WHERE id = $1
    `, [userId]);

    // Mise à jour de la session
    req.session.user.is_subscriber = true;

    res.json({
      success: true,
      message: `Abonnement ${plan} activé avec succès ! Bienvenue au club 🎉`,
      plan: plan
    });

  } catch (err) {
    console.error("❌ Erreur abonnement:", err);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'activation de l\'abonnement'
    });
  }
});

// ==========================================
// POST /api/subscriptions/cancel
// Annuler son abonnement
// ==========================================
router.post('/cancel', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user.id;

    // Vérifier que l'utilisateur est bien abonné
    const checkQuery = 'SELECT is_subscriber FROM users WHERE id = $1';
    const checkResult = await pool.query(checkQuery, [userId]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur introuvable'
      });
    }

    if (!checkResult.rows[0].is_subscriber) {
      return res.status(400).json({
        success: false,
        error: 'Aucun abonnement actif à annuler'
      });
    }

    // Annulation
    await pool.query(
      'UPDATE users SET is_subscriber = FALSE, updated_at = NOW() WHERE id = $1',
      [userId]
    );

    // Mise à jour session
    req.session.user.is_subscriber = false;

    res.json({
      success: true,
      message: 'Votre abonnement a été annulé. Vous conservez l\'accès jusqu\'à la fin de la période payée.'
    });

  } catch (err) {
    console.error("❌ Erreur annulation:", err);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'annulation'
    });
  }
});

// ==========================================
// GET /api/subscriptions/status
// Vérifier le statut d'abonnement
// ==========================================
router.get('/status', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user.id;

    const query = `
      SELECT 
        is_subscriber,
        email,
        username,
        role
      FROM users 
      WHERE id = $1
    `;

    const result = await pool.query(query, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur introuvable'
      });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      subscription: {
        is_active: user.is_subscriber,
        role: user.role
      }
    });

  } catch (err) {
    console.error("❌ Erreur status:", err);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

module.exports = router;
