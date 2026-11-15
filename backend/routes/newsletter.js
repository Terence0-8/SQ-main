// backend/routes/newsletter.js
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { isAuthenticated } = require('../middleware/auth');
const { verifyCsrf } = require('../middleware/csrf');
const crypto = require('crypto');

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ============================================================
// GET /api/newsletter/status
// Retourne le statut et les préférences de l'utilisateur connecté (ou par email)
// ============================================================
router.get('/status', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const email = req.session.user.email;

    const result = await pool.query(
      `SELECT id, email, status, language, pref_daily, pref_weekly, pref_special,
              confirmed_at, created_at
       FROM newsletter_subscribers
       WHERE user_id = $1 OR email = $2
       LIMIT 1`,
      [userId, email]
    );

    if (result.rows.length === 0) {
      return res.json({ success: true, subscribed: false });
    }

    const sub = result.rows[0];
    res.json({
      success: true,
      subscribed: sub.status === 'active',
      status: sub.status,
      language: sub.language,
      preferences: {
        daily: sub.pref_daily,
        weekly: sub.pref_weekly,
        special: sub.pref_special,
      },
      confirmed: !!sub.confirmed_at,
      email: sub.email,
      since: sub.created_at,
    });
  } catch (err) {
    console.error('❌ Newsletter status error:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ============================================================
// POST /api/newsletter/subscribe
// Inscription à la newsletter
// ============================================================
router.post('/subscribe', verifyCsrf, async (req, res) => {
  try {
    const { email, language = 'fr', pref_daily = true, pref_weekly = true, pref_special = true, source = 'web' } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'Email invalide' });
    }

    const userId = req.session?.user?.id || null;
    const confirmToken = generateToken();
    const unsubscribeToken = generateToken();

    // Vérifier si déjà inscrit
    const existing = await pool.query(
      'SELECT id, status FROM newsletter_subscribers WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existing.rows.length > 0) {
      const sub = existing.rows[0];
      if (sub.status === 'active') {
        return res.json({ success: true, already_subscribed: true });
      }
      // Réactiver
      await pool.query(
        `UPDATE newsletter_subscribers
         SET status = 'active', user_id = COALESCE($2, user_id),
             pref_daily = $3, pref_weekly = $4, pref_special = $5,
             language = $6, unsubscribed_at = NULL,
             unsubscribe_token = $7, updated_at = NOW()
         WHERE id = $1`,
        [sub.id, userId, pref_daily, pref_weekly, pref_special, language, unsubscribeToken]
      );
      return res.json({ success: true, reactivated: true });
    }

    await pool.query(
      `INSERT INTO newsletter_subscribers
         (email, user_id, status, language, pref_daily, pref_weekly, pref_special,
          confirm_token, confirmed_at, unsubscribe_token, source)
       VALUES ($1, $2, 'active', $3, $4, $5, $6, $7, NOW(), $8, $9)`,
      [email.toLowerCase(), userId, language, pref_daily, pref_weekly, pref_special,
       confirmToken, unsubscribeToken, source]
    );

    res.json({ success: true, subscribed: true });
  } catch (err) {
    console.error('❌ Newsletter subscribe error:', err);
    res.status(500).json({ success: false, error: 'Erreur lors de l\'inscription' });
  }
});

// ============================================================
// POST /api/newsletter/preferences
// Mise à jour des préférences (utilisateur connecté)
// ============================================================
router.post('/preferences', verifyCsrf, isAuthenticated, async (req, res) => {
  try {
    const { email, pref_daily, pref_weekly, pref_special, language } = req.body;
    const userId = req.session.user.id;
    const userEmail = req.session.user.email;

    const result = await pool.query(
      `UPDATE newsletter_subscribers
       SET pref_daily = COALESCE($1, pref_daily),
           pref_weekly = COALESCE($2, pref_weekly),
           pref_special = COALESCE($3, pref_special),
           language = COALESCE($4, language),
           updated_at = NOW()
       WHERE (user_id = $5 OR email = $6) AND status = 'active'
       RETURNING id`,
      [
        pref_daily !== undefined ? pref_daily : null,
        pref_weekly !== undefined ? pref_weekly : null,
        pref_special !== undefined ? pref_special : null,
        language || null,
        userId,
        email || userEmail
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Abonnement introuvable. Inscrivez-vous d\'abord.' });
    }

    res.json({ success: true, updated: true });
  } catch (err) {
    console.error('❌ Newsletter preferences error:', err);
    res.status(500).json({ success: false, error: 'Erreur mise à jour des préférences' });
  }
});

// ============================================================
// POST /api/newsletter/unsubscribe
// Désinscription (par token depuis l'email ou connecté)
// ============================================================
router.post('/unsubscribe', async (req, res) => {
  try {
    const { token, email } = req.body;
    const userId = req.session?.user?.id;

    let query, params;
    if (token) {
      query = `UPDATE newsletter_subscribers
               SET status = 'unsubscribed', unsubscribed_at = NOW(), updated_at = NOW()
               WHERE unsubscribe_token = $1
               RETURNING email`;
      params = [token];
    } else if (userId) {
      query = `UPDATE newsletter_subscribers
               SET status = 'unsubscribed', unsubscribed_at = NOW(), updated_at = NOW()
               WHERE user_id = $1
               RETURNING email`;
      params = [userId];
    } else if (email) {
      query = `UPDATE newsletter_subscribers
               SET status = 'unsubscribed', unsubscribed_at = NOW(), updated_at = NOW()
               WHERE email = $1
               RETURNING email`;
      params = [email.toLowerCase()];
    } else {
      return res.status(400).json({ success: false, error: 'Token ou email requis' });
    }

    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Abonnement introuvable' });
    }

    res.json({ success: true, unsubscribed: true, email: result.rows[0].email });
  } catch (err) {
    console.error('❌ Newsletter unsubscribe error:', err);
    res.status(500).json({ success: false, error: 'Erreur lors de la désinscription' });
  }
});

// ============================================================
// GET /api/newsletter/admin/list (admin uniquement)
// Liste des abonnés avec filtres
// ============================================================
router.get('/admin/list', isAuthenticated, async (req, res) => {
  try {
    if (req.session.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Accès refusé' });
    }

    const { status = 'active', language, limit = 100, offset = 0 } = req.query;

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (status !== 'all') {
      params.push(status);
      whereClause += ` AND ns.status = $${params.length}`;
    }
    if (language) {
      params.push(language);
      whereClause += ` AND ns.language = $${params.length}`;
    }

    params.push(parseInt(limit));
    params.push(parseInt(offset));

    const result = await pool.query(
      `SELECT ns.id, ns.email, ns.status, ns.language,
              ns.pref_daily, ns.pref_weekly, ns.pref_special,
              ns.confirmed_at, ns.created_at,
              u.username
       FROM newsletter_subscribers ns
       LEFT JOIN users u ON ns.user_id = u.id
       ${whereClause}
       ORDER BY ns.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM newsletter_subscribers ns ${whereClause}`,
      params.slice(0, params.length - 2)
    );

    res.json({
      success: true,
      subscribers: result.rows,
      total: parseInt(countResult.rows[0].count),
    });
  } catch (err) {
    console.error('❌ Newsletter admin list error:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ============================================================
// GET /api/newsletter/admin/stats (admin uniquement)
// Statistiques de la newsletter
// ============================================================
router.get('/admin/stats', isAuthenticated, async (req, res) => {
  try {
    if (req.session.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Accès refusé' });
    }

    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active') AS total_active,
        COUNT(*) FILTER (WHERE status = 'unsubscribed') AS total_unsubscribed,
        COUNT(*) FILTER (WHERE status = 'active' AND language = 'fr') AS active_fr,
        COUNT(*) FILTER (WHERE status = 'active' AND language = 'en') AS active_en,
        COUNT(*) FILTER (WHERE status = 'active' AND pref_daily = true) AS pref_daily,
        COUNT(*) FILTER (WHERE status = 'active' AND pref_weekly = true) AS pref_weekly,
        COUNT(*) FILTER (WHERE status = 'active' AND pref_special = true) AS pref_special,
        COUNT(*) FILTER (WHERE status = 'active' AND created_at >= NOW() - INTERVAL '30 days') AS new_last_30d
      FROM newsletter_subscribers
    `);

    res.json({ success: true, stats: result.rows[0] });
  } catch (err) {
    console.error('❌ Newsletter admin stats error:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

module.exports = router;
