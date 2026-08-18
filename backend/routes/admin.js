const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const Joi = require('joi');
const { isAdmin, isWriter } = require('../middleware/auth');
const { sanitizeText, sanitizeArray } = require('../middleware/sanitize');


// ==========================================
// VALIDATION SCHEMAS
// ==========================================
const pollSchema = Joi.object({
  question: Joi.string().min(10).max(500).required(),
  options: Joi.array().items(Joi.string().min(1).max(200)).min(2).max(10).required(),
  ends_at: Joi.date().iso().optional(),
  category: Joi.string().allow('', null).optional()
});

const partySchema = Joi.object({
  name: Joi.string().min(3).max(255).required(),
  acronym: Joi.string().max(20).allow('').optional(),
  logo_url: Joi.string().uri().allow('').optional(),
  ideology: Joi.string().max(100).allow('').optional(),
  description: Joi.string().allow('').optional()
});

// ==========================================
// 1. STATISTIQUES GÉNÉRALES
// ==========================================
router.get('/stats', isAdmin, async (req, res) => {
  try {
    const articlesCount = await pool.query("SELECT COUNT(*) FROM articles WHERE status = 'published'");
    const podcastsCount = await pool.query("SELECT COUNT(*) FROM podcasts WHERE status = 'published'");
    const usersCount = await pool.query("SELECT COUNT(*) FROM users WHERE is_active = TRUE");
    const subscribersCount = await pool.query("SELECT COUNT(*) FROM users WHERE is_subscriber = TRUE");
    const commentsPending = await pool.query("SELECT COUNT(*) FROM comments WHERE is_approved = FALSE");

    res.json({
      success: true,
      stats: {
        articles: parseInt(articlesCount.rows[0].count),
        podcasts: parseInt(podcastsCount.rows[0].count),
        users: parseInt(usersCount.rows[0].count),
        subscribers: parseInt(subscribersCount.rows[0].count),
        pendingComments: parseInt(commentsPending.rows[0].count)
      }
    });
  } catch (err) {
    console.error('❌ Erreur stats:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==========================================
// 2. GESTION ARTICLES
// ==========================================
router.get('/content/articles', isWriter, async (req, res) => {
  try {
    const query = `
      SELECT 
        a.id, 
        a.title, 
        a.featured_image AS image_url, 
        a.category, 
        a.status, 
        a.published_at, 
        a.views_count, 
        a.is_premium,
        CASE 
          WHEN LOWER(COALESCE(a.language, '')) = 'en' 
            OR a.title ILIKE '% the %' 
            OR a.title ILIKE '% and %' 
            OR a.title ILIKE '% in %' 
            OR a.title ILIKE '% for %' 
            OR a.title ILIKE '% of %' 
            OR a.title ILIKE '% with %'
          THEN 'en' 
          ELSE 'fr' 
        END AS language,
        u.username as author_name
      FROM articles a
      LEFT JOIN users u ON a.author_id = u.id
      ORDER BY a.created_at DESC 
      LIMIT 100
    `;
    const result = await pool.query(query);
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    console.error('❌ Erreur liste articles:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==========================================
// 3. TOGGLE PREMIUM (Articles/Podcasts/Emissions)
// ==========================================
router.put('/content/:type/:id/toggle-premium', isAdmin, async (req, res) => {
  try {
    const { type, id } = req.params;

    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const allowedTypes = {
      'article': 'articles',
      'podcast': 'podcasts',
      'emission': 'emissions'
    };

    const table = allowedTypes[type];

    if (!table) {
      return res.status(400).json({
        success: false,
        error: 'Type non supporté. Utiliser: article, podcast ou emission'
      });
    }

    // Utilisation sécurisée - table validée avant insertion
    const query = `UPDATE ${table} SET is_premium = NOT is_premium WHERE id = $1 RETURNING is_premium`;
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Contenu introuvable'
      });
    }

    const newPremiumStatus = result.rows[0].is_premium;

    // 🌍 NOUVEAUTÉ: Si c'est un article, synchroniser le statut premium avec la traduction liée (si elle existe)
    if (type === 'article') {
      try {
        await pool.query(
          `UPDATE articles 
           SET is_premium = $1 
           WHERE id = (SELECT translation_id FROM articles WHERE id = $2) 
              OR translation_id = $2`,
          [newPremiumStatus, id]
        );
      } catch (syncErr) {
        console.error('❌ Erreur sync premium traduction:', syncErr);
        // On ne bloque pas la réponse principale en cas d'échec de synchro
      }
    }

    res.json({
      success: true,
      message: 'Statut premium mis à jour',
      is_premium: newPremiumStatus
    });
  } catch (err) {
    console.error('❌ Erreur toggle premium:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==========================================
// 4. WORKFLOW PUBLICATION (Approuver/Rejeter articles)
// ==========================================
router.put('/workflow/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;

    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'Action invalide. Utiliser: approve ou reject'
      });
    }

    const newStatus = action === 'approve' ? 'published' : 'draft';
    const publishedAt = action === 'approve' ? 'NOW()' : 'NULL';

    const query = `
      UPDATE articles 
      SET status = $1, published_at = ${publishedAt}, updated_at = NOW() 
      WHERE id = $2 
      RETURNING id, title, status
    `;

    const result = await pool.query(query, [newStatus, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Article introuvable'
      });
    }

    res.json({
      success: true,
      message: action === 'approve' ? 'Article publié' : 'Article rejeté',
      article: result.rows[0]
    });
  } catch (err) {
    console.error('❌ Erreur workflow:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==========================================
// 5. SUPPRESSION CONTENU (Article/Podcast/Emission)
// ==========================================
router.delete('/content/:type/:id', isAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { type, id } = req.params;

    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const allowedTypes = {
      'article': 'articles',
      'podcast': 'podcasts',
      'emission': 'emissions'
    };

    const table = allowedTypes[type];

    if (!table) {
      return res.status(400).json({
        success: false,
        error: 'Type invalide. Utiliser: article, podcast ou emission'
      });
    }

    await client.query('BEGIN');

    // Nettoyage des dépendances selon le type
    if (type === 'article') {
      await client.query('DELETE FROM article_analytics WHERE article_id = $1', [id]);
      await client.query('DELETE FROM comments WHERE article_id = $1', [id]);
    }

    // Suppression du contenu principal
    const deleteQuery = `DELETE FROM ${table} WHERE id = $1 RETURNING id`;
    const result = await client.query(deleteQuery, [id]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'Contenu introuvable'
      });
    }

    await client.query('COMMIT');
    res.json({
      success: true,
      message: 'Contenu supprimé avec succès'
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Erreur suppression:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// ==========================================
// 6. MODÉRATION COMMENTAIRES
// ==========================================
router.get('/comments/pending', isAdmin, async (req, res) => {
  try {
    const query = `
      SELECT 
        c.id, 
        c.content, 
        c.created_at,
        c.article_id,
        u.username,
        a.title as article_title
      FROM comments c
      JOIN users u ON c.user_id = u.id
      LEFT JOIN articles a ON c.article_id = a.id
      WHERE c.is_approved = FALSE
      ORDER BY c.created_at DESC
      LIMIT 100
    `;
    const result = await pool.query(query);
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    console.error('❌ Erreur commentaires en attente:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

router.post('/comments/:id/:action', isAdmin, async (req, res) => {
  try {
    const { id, action } = req.params;

    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    if (!['approve', 'delete'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'Action invalide. Utiliser: approve ou delete'
      });
    }

    let query, result;

    if (action === 'approve') {
      query = 'UPDATE comments SET is_approved = TRUE WHERE id = $1 RETURNING id';
      result = await pool.query(query, [id]);
    } else {
      query = 'DELETE FROM comments WHERE id = $1 RETURNING id';
      result = await pool.query(query, [id]);
    }

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Commentaire introuvable'
      });
    }

    res.json({
      success: true,
      message: action === 'approve' ? 'Commentaire approuvé' : 'Commentaire supprimé'
    });
  } catch (err) {
    console.error('❌ Erreur modération commentaire:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==========================================
// 7. GESTION SONDAGES
// ==========================================
// À insérer dans la section GESTION SONDAGES de admin.js
function normalizePollCategory(cat) {
  if (!cat || typeof cat !== 'string') return 'Politique';
  const trimmed = cat.trim().toLowerCase();
  if (trimmed === 'social') return 'Social';
  return 'Politique';
}

router.put('/polls/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { question, options, category } = req.body; // Options arrive en tableau de strings ["Oui", "Non"]

    const cleanCategory = normalizePollCategory(category);

    // Reformatage pour le JSONB : on garde les votes existants si possible, sinon 0
    // Note: C'est complexe de mapper les anciens votes aux nouvelles options.
    // Simplification : On reset les votes si on change les options, ou on met 0.
    // ✅ SANITISATION XSS
    const safeQuestion = sanitizeText(question);
    const safeOptions = sanitizeArray(options);

    if (!safeQuestion || safeQuestion.length < 5) {
      return res.status(400).json({ success: false, error: 'La question est obligatoire (minimum 5 caractères).' });
    }

    if (!safeOptions || safeOptions.length < 2) {
      return res.status(400).json({ success: false, error: 'Au moins 2 options valides sont requises.' });
    }
    const optionsJson = safeOptions.map(text => ({ text, votes: 0 }));

    const query = `
      UPDATE polls 
      SET question = $1, options = $2, category = $3 
      WHERE id = $4 
      RETURNING id
    `;
    await pool.query(query, [safeQuestion, JSON.stringify(optionsJson), cleanCategory, id]);
    await pool.query('DELETE FROM poll_votes WHERE poll_id = $1', [id]);

    res.json({ success: true, message: "Sondage mis à jour (Votes réinitialisés)" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});


router.get('/polls/stats', isAdmin, async (req, res) => {
  try {
    const query = `
      SELECT 
        p.id,
        p.question,
        p.options,
        p.is_active,
        p.ends_at,
        p.category,
        p.created_at,
        (SELECT COUNT(*) FROM poll_votes WHERE poll_id = p.id) as total_votes
      FROM polls p
      ORDER BY p.created_at DESC
    `;
    const result = await pool.query(query);
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    console.error('❌ Erreur liste sondages:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

router.post('/polls', isAdmin, async (req, res) => {
  try {
    // Validation
    const { error, value } = pollSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    const { question, options, ends_at, category } = value;
    const cleanCategory = normalizePollCategory(category);

    // ✅ SANITISATION XSS
    const safeQuestion = sanitizeText(question);
    const safeOptions = sanitizeArray(options);

    // Formater les options en JSONB
    const optionsJson = safeOptions.map(text => ({ text, votes: 0 }));

    const query = `
      INSERT INTO polls (question, options, created_by, is_active, ends_at, category, created_at)
      VALUES ($1, $2, $3, TRUE, $4, $5, NOW())
      RETURNING id, question
    `;

    const result = await pool.query(query, [
      safeQuestion,
      JSON.stringify(optionsJson),
      req.session.user.id,
      ends_at || null,
      cleanCategory
    ]);

    res.json({
      success: true,
      message: 'Sondage créé',
      poll: result.rows[0]
    });
  } catch (err) {
    console.error('❌ Erreur création sondage:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

router.put('/polls/:id/toggle', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const query = `
      UPDATE polls 
      SET is_active = NOT is_active 
      WHERE id = $1 
      RETURNING id, is_active
    `;
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Sondage introuvable'
      });
    }

    res.json({
      success: true,
      message: result.rows[0].is_active ? 'Sondage activé' : 'Sondage désactivé',
      poll: result.rows[0]
    });
  } catch (err) {
    console.error('❌ Erreur toggle sondage:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

router.post('/polls/:id/reset-votes', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    // 1. Vider les votes de la table poll_votes
    await pool.query('DELETE FROM poll_votes WHERE poll_id = $1', [id]);

    // 2. Réinitialiser les compteurs de votes dans la colonne options
    const pollRes = await pool.query('SELECT options FROM polls WHERE id = $1', [id]);
    if (pollRes.rows.length > 0) {
      let options = pollRes.rows[0].options;
      if (typeof options === 'string') {
        try { options = JSON.parse(options); } catch (e) {}
      }
      if (Array.isArray(options)) {
        options = options.map(opt => ({
          text: typeof opt === 'string' ? opt : (opt.text || 'Option'),
          votes: 0
        }));
        await pool.query('UPDATE polls SET options = $1 WHERE id = $2', [JSON.stringify(options), id]);
      }
    }

    res.json({
      success: true,
      message: 'Tous les votes de ce sondage ont été réinitialisés à 0'
    });
  } catch (err) {
    console.error('❌ Erreur réinitialisation votes:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

router.delete('/polls/:id', isAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    await client.query('BEGIN');

    // Supprimer les votes associés
    await client.query('DELETE FROM poll_votes WHERE poll_id = $1', [id]);

    // Supprimer le sondage
    const result = await client.query('DELETE FROM polls WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'Sondage introuvable'
      });
    }

    await client.query('COMMIT');
    res.json({
      success: true,
      message: 'Sondage supprimé'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Erreur suppression sondage:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// ==========================================
// 8. GESTION PARTIS POLITIQUES
// ==========================================
router.get('/parties', isAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM parties ORDER BY name ASC');
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    console.error('❌ Erreur liste partis:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==========================================
// 9. GESTION UTILISATEURS
// ⚡ AMÉLIORATION: Ajout des dates d'abonnement
// ==========================================
router.get('/users', isAdmin, async (req, res) => {
  try {
    // 🔥 On récupère maintenant les dates d'abonnement
    const query = `
      SELECT 
        id, 
        username, 
        email, 
        role, 
        is_active, 
        is_subscriber,
        subscription_start_date,
        subscription_end_date,
        created_at 
      FROM users 
      ORDER BY created_at DESC 
      LIMIT 100
    `;
    const result = await pool.query(query);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('❌ Erreur liste utilisateurs:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

router.put('/users/:id/toggle-ban', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    // Empêcher de se bannir soi-même
    if (parseInt(id) === req.session.user.id) {
      return res.status(403).json({ success: false, error: "Impossible de se bannir soi-même" });
    }

    const query = `UPDATE users SET is_active = NOT is_active WHERE id = $1 RETURNING is_active`;
    const result = await pool.query(query, [id]);
    res.json({ success: true, is_active: result.rows[0].is_active });
  } catch (err) {
    console.error('❌ Erreur toggle ban:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

module.exports = router;