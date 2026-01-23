const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const Joi = require('joi');
const { isAdmin, isWriter } = require('../middleware/auth');

// ==========================================
// VALIDATION SCHEMAS
// ==========================================
const pollSchema = Joi.object({
  question: Joi.string().min(10).max(500).required(),
  options: Joi.array().items(Joi.string().min(1).max(200)).min(2).max(10).required(),
  ends_at: Joi.date().iso().optional()
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

    res.json({
      success: true,
      message: 'Statut premium mis à jour',
      is_premium: result.rows[0].is_premium
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
router.put('/polls/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { question, options } = req.body; // Options arrive en tableau de strings ["Oui", "Non"]

    // Reformatage pour le JSONB : on garde les votes existants si possible, sinon 0
    // Note: C'est complexe de mapper les anciens votes aux nouvelles options.
    // Simplification : On reset les votes si on change les options, ou on met 0.
    const optionsJson = options.map(text => ({ text, votes: 0 }));

    const query = `
      UPDATE polls 
      SET question = $1, options = $2, updated_at = NOW() 
      WHERE id = $3 
      RETURNING id
    `;
    await pool.query(query, [question, JSON.stringify(optionsJson), id]);

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

    const { question, options, ends_at } = value;

    // Formater les options en JSONB
    const optionsJson = options.map(text => ({ text, votes: 0 }));

    const query = `
      INSERT INTO polls (question, options, created_by, is_active, ends_at, created_at)
      VALUES ($1, $2, $3, TRUE, $4, NOW())
      RETURNING id, question
    `;

    const result = await pool.query(query, [
      question,
      JSON.stringify(optionsJson),
      req.session.user.id,
      ends_at || null
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
// 9. GESTION UTILISATEURS (MANQUANT)
// ==========================================
router.get('/users', isAdmin, async (req, res) => {
  try {
    // On récupère tout sauf les mots de passe
    const query = `
      SELECT id, username, email, role, is_active, is_subscriber, created_at 
      FROM users 
      ORDER BY created_at DESC LIMIT 100
    `;
    const result = await pool.query(query);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error(err);
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
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

module.exports = router;
