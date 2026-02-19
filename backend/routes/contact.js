const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const Joi = require('joi');
const rateLimit = require('express-rate-limit');

// ==========================================
// RATE LIMITING (5 messages / 15 min par IP)
// ==========================================
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, error: 'Trop de messages envoyés. Réessayez dans 15 minutes.' }
});

// ==========================================
// VALIDATION SCHEMA
// ==========================================
const contactSchema = Joi.object({
  name: Joi.string().min(2).max(100).required()
    .messages({
      'string.min': 'Le nom doit contenir au moins 2 caractères',
      'any.required': 'Le nom est requis'
    }),

  email: Joi.string().email().required()
    .messages({
      'string.email': 'Email invalide',
      'any.required': 'L\'email est requis'
    }),

  subject: Joi.string().max(200).allow('').optional(),

  message: Joi.string().min(10).max(5000).required()
    .messages({
      'string.min': 'Le message doit contenir au moins 10 caractères',
      'string.max': 'Le message ne doit pas dépasser 5000 caractères',
      'any.required': 'Le message est requis'
    })
});

// ==========================================
// POST /api/contact
// Formulaire de contact public
// ==========================================
router.post('/', contactLimiter, async (req, res) => {
  try {
    // Validation
    const { error, value } = contactSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    const { sanitizeText } = require('../middleware/sanitize');

    // ... (existing code)

    const { name, email, subject, message } = value;

    // ✅ SANITISATION XSS
    const safeName = sanitizeText(name);
    const safeSubject = subject ? sanitizeText(subject) : 'Contact général';
    const safeMessage = sanitizeText(message);

    await pool.query(
      'INSERT INTO contact_messages (name, email, subject, message, created_at) VALUES ($1, $2, $3, $4, NOW())',
      [safeName, email, safeSubject, safeMessage]
    );

    res.json({
      success: true,
      message: 'Votre message a bien été envoyé. Nous vous répondrons dans les plus brefs délais.'
    });

  } catch (err) {
    console.error('❌ Erreur contact:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

module.exports = router;
