const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const Joi = require('joi');
const { isAuthenticated } = require('../middleware/auth');

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
  article_id: Joi.number().integer().required(),
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
// 1. RÉCUPÉRER LES COMMENTAIRES D'UN ARTICLE
// ==========================================
router.get('/:articleId', async (req, res) => {
  try {
    const { articleId } = req.params;

    if (isNaN(articleId)) {
      return res.status(400).json({ success: false, error: 'ID article invalide' });
    }

    const query = `
      SELECT 
        c.id, 
        c.content, 
        c.created_at,
        u.username
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.article_id = $1 AND c.is_approved = TRUE
      ORDER BY c.created_at DESC
    `;

    const { rows } = await pool.query(query, [articleId]);

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
// 2. POSTER UN COMMENTAIRE (Avec modération auto)
// ==========================================
router.post('/', isAuthenticated, async (req, res) => {
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

    // Vérifier que l'article existe
    const articleCheck = await pool.query(
      'SELECT id FROM articles WHERE id = $1',
      [article_id]
    );

    if (articleCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Article introuvable'
      });
    }

    // --- MODÉRATION AUTOMATIQUE ---
    const bannedCheck = containsBannedWord(content);

    let is_approved = true;
    let message = 'Commentaire publié !';

    if (bannedCheck.found) {
      is_approved = false;
      message = 'Votre commentaire a été soumis et sera vérifié par un modérateur avant publication.';

      console.log(`🚨 Commentaire flaggé - Utilisateur ${user_id} - Mot détecté: ${bannedCheck.word}`);
    }

    // Insertion en base
    const insertQuery = `
      INSERT INTO comments (article_id, user_id, content, is_approved, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING id, is_approved
    `;

    const { rows } = await pool.query(insertQuery, [
      article_id,
      user_id,
      content,
      is_approved
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

    if (checkResult.rows[0].user_id !== user_id) {
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
// 4. MODIFIER SON PROPRE COMMENTAIRE
// ==========================================
router.put('/:id', isAuthenticated, async (req, res) => {
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
      SELECT id, user_id FROM comments WHERE id = $1
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

    // Modération automatique du nouveau contenu
    const bannedCheck = containsBannedWord(content);

    let is_approved = true;
    let message = 'Commentaire modifié !';

    if (bannedCheck.found) {
      is_approved = false;
      message = 'Votre commentaire modifié sera vérifié par un modérateur avant publication.';
    }

    await pool.query(
      'UPDATE comments SET content = $1, is_approved = $2, updated_at = NOW() WHERE id = $3',
      [content, is_approved, id]
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
