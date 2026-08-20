const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const Joi = require('joi');
const { isAuthenticated } = require('../middleware/auth');
const { sanitizeText } = require('../middleware/sanitize');
const { verifyCsrf } = require('../middleware/csrf');


// ==========================================
// LISTE DE MOTS BANNIS (FR + EN)
// ==========================================
const BANNED_WORDS = [
  // Français - Insultes
  'connard', 'connasse', 'salaud', 'salope', 'pute', 'putain', 'merde',
  'enculé', 'enculée', 'encule', 'fils de pute', 'fdp', 'nique', 'niquer',
  'ntm', 'ta mere', 'ta gueule', 'ferme ta gueule', 'con', 'conne',
  'débile', 'debile', 'idiot', 'crétin', 'cretin', 'abruti', 'imbécile',
  'imbecile', 'taré', 'tare', 'pd', 'pédé', 'pede', 'tapette', 'gouine',
  'salaud', 'ordure', 'pourriture', 'raclure', 'chiotte',

  // Français - Discriminations
  'nègre', 'negre', 'negro', 'bamboula', 'bougnoule', 'raton', 'bicot',
  'youpin', 'feuj', 'schleu', 'boche', 'chintok', 'niakoué', 'niakwe',
  'bounty', 'arabe de merde', 'sale arabe', 'sale noir', 'sale juif',

  // Français - Vulgarités
  'couille', 'couilles', 'bite', 'queue', 'chatte', 'vagin', 'penis',
  'cul', 'fesse', 'nichon', 'nichons', 'teub', 'chier', 'pisser',

  // Anglais - Insultes
  'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bitch', 'bastard',
  'asshole', 'ass', 'damn', 'dumb', 'stupid', 'idiot', 'moron', 'loser',
  'retard', 'retarded', 'jerk', 'dick', 'dickhead', 'cunt', 'whore',
  'slut', 'prick', 'twat', 'wanker', 'bloody',

  // Anglais - Discriminations
  'nigger', 'nigga', 'negro', 'faggot', 'fag', 'dyke', 'chink', 'gook',
  'spic', 'wetback', 'kike', 'cracker', 'honky', 'nazi',

  // Anglais - Vulgarités
  'cock', 'pussy', 'penis', 'vagina', 'boob', 'boobs', 'tits', 'balls',
  'piss', 'pissed', 'crap', 'shag'
];

// ==========================================
// VALIDATION SCHEMA
// ==========================================
const commentSchema = Joi.object({
  article_id: Joi.alternatives().try(Joi.number().integer(), Joi.string()).required(),
  content: Joi.string().min(3).max(1000).required()
    .messages({
      'string.min': 'Le commentaire doit contenir au moins 3 caractères',
      'string.max': 'Le commentaire ne doit pas dépasser 1000 caractères',
      'any.required': 'Le contenu du commentaire est requis'
    })
});

// ==========================================
// FONCTION : Détection de mots bannis
// ==========================================
function containsBannedWord(text) {
  const textLower = text.toLowerCase();

  // Normaliser le texte (supprimer accents, espaces multiples, etc.)
  const normalized = textLower
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Supprimer accents
    .replace(/[^a-z0-9\s]/g, ' ') // Garder que lettres/chiffres/espaces
    .replace(/\s+/g, ' ') // Espaces multiples -> 1 seul
    .trim();

  for (const word of BANNED_WORDS) {
    // Recherche avec délimiteurs de mots (\b) pour éviter faux positifs
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    if (regex.test(normalized)) {
      return { found: true, word: word };
    }
  }

  return { found: false, word: null };
}

// ==========================================
// 1A. RÉCUPÉRER LES COMMENTAIRES DE L'UTILISATEUR CONNECTÉ (Max 30)
// (Placé avant /:articleId pour éviter le conflit de routage Express)
// ==========================================
router.get('/user/my-comments', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const query = `
      SELECT 
        c.id, 
        c.content, 
        c.created_at, 
        c.is_approved, 
        COALESCE(c.is_edited, false) AS is_edited,
        a.id AS article_id, 
        a.title AS article_title, 
        a.slug AS article_slug
      FROM comments c
      LEFT JOIN articles a ON c.article_id = a.id
      WHERE c.user_id = $1
      ORDER BY c.created_at DESC
      LIMIT 30
    `;
    const { rows } = await pool.query(query, [userId]);
    res.json({ success: true, comments: rows });
  } catch (err) {
    console.error('❌ Erreur récupération commentaires utilisateur:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==========================================
// 1B. RÉCUPÉRER LES COMMENTAIRES D'UN ARTICLE
// ==========================================
router.get(['/:articleId', '/article/:articleId'], async (req, res) => {
  try {
    const { articleId } = req.params;
    const currentUserId = (req.session && req.session.user) ? req.session.user.id : null;

    let numericId = parseInt(articleId, 10);
    if (isNaN(numericId)) {
      const artRes = await pool.query('SELECT id FROM articles WHERE slug = $1 OR id::text = $1', [articleId]);
      if (artRes.rows.length > 0) {
        numericId = artRes.rows[0].id;
      } else {
        return res.json({ success: true, count: 0, comments: [] });
      }
    }

    try {
      await pool.query('ALTER TABLE comments ADD COLUMN IF NOT EXISTS upvotes INT DEFAULT 0;');
      await pool.query('ALTER TABLE comments ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;');
      await pool.query('CREATE TABLE IF NOT EXISTS comment_upvotes (user_id INT NOT NULL, comment_id INT NOT NULL, created_at TIMESTAMP DEFAULT NOW(), PRIMARY KEY (user_id, comment_id));');
    } catch (_err) {
      /* ignore */
    }

    let rows;
    try {
      const query = `
        SELECT 
          c.id, 
          c.content, 
          c.created_at,
          c.user_id,
          COALESCE(c.is_edited, false) AS is_edited,
          COALESCE(c.upvotes, 0) AS upvotes,
          COALESCE(u.username, 'Lecteur Solitiquo') AS username,
          EXISTS(SELECT 1 FROM comment_upvotes cu WHERE cu.comment_id = c.id AND cu.user_id = $2) AS user_voted
        FROM comments c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.article_id = $1 AND (c.is_approved = TRUE OR c.is_approved IS NULL)
        ORDER BY COALESCE(c.upvotes, 0) DESC, c.created_at DESC
      `;
      const result = await pool.query(query, [numericId, currentUserId || -1]);
      rows = result.rows;
    } catch (dbErr) {
      console.warn('⚠️ Fallback query commentaires:', dbErr.message);
      const fallbackQuery = `
        SELECT 
          c.id, 
          c.content, 
          c.created_at,
          c.user_id,
          COALESCE(c.is_edited, false) AS is_edited,
          0 AS upvotes,
          COALESCE(u.username, 'Lecteur Solitiquo') AS username,
          false AS user_voted
        FROM comments c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.article_id = $1 AND (c.is_approved = TRUE OR c.is_approved IS NULL)
        ORDER BY c.created_at DESC
      `;
      const result = await pool.query(fallbackQuery, [numericId]);
      rows = result.rows;
    }

    res.json({
      success: true,
      count: rows.length,
      comments: rows
    });
  } catch (err) {
    console.error('❌ Erreur récupération commentaires:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==========================================
// 1B. UPVOTER / RETIRER SON UPVOTE D'UN COMMENTAIRE (1 Vote strict par compte)
// ==========================================
router.post('/:id/upvote', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const commentId = parseInt(id, 10);
    const userId = req.session.user.id;

    if (isNaN(commentId)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    try {
      await pool.query('ALTER TABLE comments ADD COLUMN IF NOT EXISTS upvotes INT DEFAULT 0;');
      await pool.query('CREATE TABLE IF NOT EXISTS comment_upvotes (user_id INT NOT NULL, comment_id INT NOT NULL, created_at TIMESTAMP DEFAULT NOW(), PRIMARY KEY (user_id, comment_id));');
    } catch (_err) {
      /* ignore */
    }

    // Vérifier si l'utilisateur a déjà liké ce commentaire
    const checkVote = await pool.query(
      'SELECT 1 FROM comment_upvotes WHERE user_id = $1 AND comment_id = $2',
      [userId, commentId]
    );

    let newUpvotes = 0;
    let isVoted = false;

    if (checkVote.rows.length > 0) {
      // Retirer le vote
      await pool.query('DELETE FROM comment_upvotes WHERE user_id = $1 AND comment_id = $2', [userId, commentId]);
      const updateRes = await pool.query(
        'UPDATE comments SET upvotes = GREATEST(COALESCE(upvotes, 0) - 1, 0) WHERE id = $1 RETURNING upvotes',
        [commentId]
      );
      newUpvotes = updateRes.rows[0] ? updateRes.rows[0].upvotes : 0;
      isVoted = false;
    } else {
      // Ajouter le vote (1 seul vote par compte)
      await pool.query('INSERT INTO comment_upvotes (user_id, comment_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, commentId]);
      const updateRes = await pool.query(
        'UPDATE comments SET upvotes = COALESCE(upvotes, 0) + 1 WHERE id = $1 RETURNING upvotes',
        [commentId]
      );
      newUpvotes = updateRes.rows[0] ? updateRes.rows[0].upvotes : 0;
      isVoted = true;
    }

    res.json({
      success: true,
      upvoted: isVoted,
      upvotes: newUpvotes
    });
  } catch (err) {
    console.error('❌ Erreur upvote commentaire:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==========================================
// 2. POSTER UN COMMENTAIRE (Avec modération auto)
// ==========================================
router.post('/', isAuthenticated, verifyCsrf, async (req, res) => {
  try {
    // Validation
    const { error, value } = commentSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    const { article_id, content } = value;
    const user_id = req.session.user.id;

    let targetArticleId = parseInt(article_id, 10);
    if (isNaN(targetArticleId)) {
      const artCheck = await pool.query('SELECT id FROM articles WHERE slug = $1 OR id::text = $1', [article_id]);
      if (artCheck.rows.length > 0) {
        targetArticleId = artCheck.rows[0].id;
      } else {
        return res.status(404).json({
          success: false,
          error: 'Article introuvable'
        });
      }
    }

    // --- MODÉRATION AUTOMATIQUE ---
    const bannedCheck = containsBannedWord(content);

    let is_approved = true;
    let flag_reason = null;
    let message = 'Commentaire publié !';

    if (bannedCheck.found) {
      is_approved = false;
      flag_reason = `Mot sensible détecté : "${bannedCheck.word}"`;
      message = 'Votre commentaire a été soumis et sera vérifié par un modérateur avant publication.';

      console.log(`🚨 Commentaire soumis à modération (raison: ${flag_reason})`);
    }

    // ✅ SANITISATION XSS — strip tout HTML du commentaire
    const safeContent = sanitizeText(content);

    try {
      await pool.query('ALTER TABLE comments ADD COLUMN IF NOT EXISTS flag_reason VARCHAR(255);');
    } catch (_err) {
      /* ignore */
    }

    // Insertion en base
    const insertQuery = `
      INSERT INTO comments (article_id, user_id, content, is_approved, flag_reason, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING id, is_approved
    `;

    const { rows } = await pool.query(insertQuery, [
      targetArticleId,
      user_id,
      safeContent,
      is_approved,
      flag_reason
    ]);

    const newComment = rows[0];

    res.json({
      success: true,
      comment_id: newComment.id,
      moderated: !newComment.is_approved,
      message: message
    });

  } catch (err) {
    console.error('❌ Erreur création commentaire:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});



// ==========================================
// 3. SUPPRIMER SON PROPRE COMMENTAIRE
// ==========================================
router.delete('/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.session.user.id;

    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    // Vérifier que le commentaire appartient à l'utilisateur
    const checkQuery = `
      SELECT id, user_id FROM comments WHERE id = $1
    `;
    const checkResult = await pool.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Commentaire introuvable'
      });
    }

    const user = req.session.user;

    if (checkResult.rows[0].user_id !== user.id && user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Vous ne pouvez supprimer que vos propres commentaires'
      });
    }

    await pool.query('DELETE FROM comments WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Commentaire supprimé'
    });

  } catch (err) {
    console.error('❌ Erreur suppression commentaire:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==========================================
// 4. MODIFIER SON PROPRE COMMENTAIRE (1 seule fois)
// ==========================================
router.put('/:id', isAuthenticated, verifyCsrf, async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.session.user.id;

    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    // Validation du nouveau contenu
    const contentSchema = Joi.string().min(3).max(1000).required();
    const { error, value: content } = contentSchema.validate(req.body.content);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    // Vérifier que le commentaire appartient à l'utilisateur
    const checkQuery = `
      SELECT id, user_id, COALESCE(is_edited, false) AS is_edited FROM comments WHERE id = $1
    `;
    const checkResult = await pool.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Commentaire introuvable'
      });
    }

    if (checkResult.rows[0].user_id !== user_id) {
      return res.status(403).json({
        success: false,
        error: 'Vous ne pouvez modifier que vos propres commentaires'
      });
    }

    if (checkResult.rows[0].is_edited) {
      return res.status(403).json({
        success: false,
        error: 'Ce commentaire a déjà été modifié une fois. Modification supplémentaire non autorisée.'
      });
    }

    // Modération automatique du nouveau contenu
    const bannedCheck = containsBannedWord(content);

    let is_approved = true;
    let message = 'Commentaire modifié !';

    if (bannedCheck.found) {
      is_approved = false;
      message = 'Votre commentaire modifié sera vérifié par un modérateur avant publication.';
    }

    // ✅ SANITISATION XSS — strip tout HTML du commentaire modifié
    const safeContent = sanitizeText(content);

    try {
      await pool.query('ALTER TABLE comments ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;');
    } catch (_e) {}

    await pool.query(
      'UPDATE comments SET content = $1, is_approved = $2, is_edited = TRUE, updated_at = NOW() WHERE id = $3',
      [safeContent, is_approved, id]
    );

    res.json({
      success: true,
      moderated: !is_approved,
      message: message
    });

  } catch (err) {
    console.error('❌ Erreur modification commentaire:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

module.exports = router;
