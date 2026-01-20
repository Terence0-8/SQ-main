const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// 1. Récupérer les commentaires d'un article (Seulement les "approved")
router.get('/:articleId', async (req, res) => {
  try {
    const { articleId } = req.params;
    const query = `
      SELECT c.id, c.content, c.created_at, 
             u.username, u.avatar_url
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.article_id = $1 AND c.status = 'approved'
      ORDER BY c.created_at DESC
    `;
    const { rows } = await pool.query(query, [articleId]);
    res.json({ success: true, comments: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Poster un commentaire (Avec MODÉRATION AUTO)
router.post('/', async (req, res) => {
  try {
    const { article_id, user_id, content } = req.body;

    if (!content || !article_id) {
      return res.status(400).json({ success: false, error: "Contenu manquant" });
    }

    // --- MODÉRATION AUTOMATIQUE ---
    // 1. On récupère la liste des mots interdits depuis la BDD
    const bannedResult = await pool.query('SELECT word FROM banned_words');
    const bannedWords = bannedResult.rows.map(row => row.word.toLowerCase());

    // 2. On vérifie si le commentaire contient un mot interdit
    let status = 'approved';
    let flagReason = null;
    const contentLower = content.toLowerCase();

    for (const word of bannedWords) {
      if (contentLower.includes(word)) {
        status = 'flagged'; // On le marque comme suspect (ne s'affichera pas)
        flagReason = `Mot interdit détecté : ${word}`;
        break; // Pas besoin de chercher plus loin
      }
    }

    // 3. Insertion en base
    // Note: user_id est forcé à 1 (Admin) temporairement tant qu'on n'a pas la page de connexion
    const finalUserId = user_id || 1; 

    const insertQuery = `
      INSERT INTO comments (article_id, user_id, content, status, flag_reason, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING id, status
    `;

    const { rows } = await pool.query(insertQuery, [
      article_id, finalUserId, content, status, flagReason
    ]);

    const newComment = rows[0];

    // Réponse au front
    if (newComment.status === 'flagged') {
      res.json({ success: true, modere: true, message: "Commentaire en attente de validation (mot suspect détecté)." });
    } else {
      res.json({ success: true, modere: false, message: "Commentaire publié !" });
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
});

module.exports = router;