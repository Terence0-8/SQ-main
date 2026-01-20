const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Fix #3 - Import des middlewares de permissions
const { isAdmin, isWriter, isModerator } = require('../middleware/auth');

// 1. STATISTIQUES
router.get('/stats', isAdmin, async (req, res) => {
  try {
    const articlesCount = await pool.query("SELECT COUNT(*) FROM articles WHERE status = 'published'");
    const podcastsCount = await pool.query("SELECT COUNT(*) FROM podcasts WHERE status = 'published'");
    const commentsPending = await pool.query("SELECT COUNT(*) FROM comments WHERE status = 'flagged'");

    res.json({
      success: true,
      stats: {
        articles: articlesCount.rows[0].count,
        podcasts: podcastsCount.rows[0].count,
        pendingComments: commentsPending.rows[0].count
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. LISTE ARTICLES (Writers peuvent voir)
router.get('/content/articles', isWriter, async (req, res) => {
  try {
    const query = `
      SELECT a.id, a.title, a.image_url, a.category, a.status, a.published_at, a.views_count, a.is_premium,
      u.username as author_name
      FROM articles a
      LEFT JOIN users u ON a.author_id = u.id
      ORDER BY a.published_at DESC LIMIT 50
    `;
    const result = await pool.query(query);
    const articles = result.rows.map(art => ({
      ...art,
      is_premium: (art.is_premium === true || art.is_premium === 't')
    }));
    res.json({ success: true, data: articles });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. TOGGLE PREMIUM
router.put('/content/:type/:id/toggle-premium', isAdmin, async (req, res) => {
  try {
    const { type, id } = req.params;
    const table = type === 'article' ? 'articles' : null;
    if (!table) return res.status(400).json({ error: "Type non supporté" });
    await pool.query(`UPDATE ${table} SET is_premium = NOT is_premium WHERE id = $1`, [id]);
    res.json({ success: true, message: "Statut mis à jour" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. WORKFLOW
router.put('/workflow/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;
    let newStatus = action === 'approve' ? 'published' : 'draft';
    const dateUpdate = action === 'approve' ? ', published_at = NOW()' : '';
    await pool.query(`UPDATE articles SET status = $1 ${dateUpdate} WHERE id = $2`, [newStatus, id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. SUPPRESSION UNIVERSELLE (Avec nettoyage des liens)
router.delete('/content/:type/:id', isAdmin, async (req, res) => {
  try {
    const { type, id } = req.params;
    const tables = { 'article': 'articles', 'podcast': 'podcasts', 'emission': 'emissions' };

    if (!tables[type]) return res.status(400).json({ error: "Type invalide" });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // CAS 1 : ARTICLES (Nettoyage existant)
      if (type === 'article') {
        await client.query('DELETE FROM article_analytics WHERE article_id = $1', [id]);
        await client.query('DELETE FROM comments WHERE article_id = $1', [id]);
      }

      // CAS 2 : PODCASTS (NOUVEAU - Correction du bug)
      if (type === 'podcast') {
        // On "détache" le podcast des partis qui l'utilisent (on met le champ à NULL)
        // Cela permet de garder le Parti intact, juste sans podcast associé.
        await client.query('UPDATE parties SET podcast_id = NULL WHERE podcast_id = $1', [id]);
      }

      // Suppression effective du contenu
      await client.query(`DELETE FROM ${tables[type]} WHERE id = $1`, [id]);

      await client.query('COMMIT');
      res.json({ success: true });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error("Erreur suppression:", e); // Utile pour voir l'erreur dans le terminal
      // On renvoie l'erreur exacte pour le debug si besoin, ou un message générique
      res.status(500).json({ error: e.message });
    }
    finally { client.release(); }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 6. MODÉRATION (Admins uniquement)
router.get('/comments/pending', isModerator, async (req, res) => {
  try {
    const result = await pool.query(`SELECT c.id, c.content, c.flag_reason, u.username FROM comments c JOIN users u ON c.user_id = u.id WHERE c.status = 'flagged'`);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/comments/:id/:action', isModerator, async (req, res) => {
  try {
    const { id, action } = req.params;
    if (action === 'approve') await pool.query("UPDATE comments SET status = 'approved' WHERE id = $1", [id]);
    else if (action === 'delete') await pool.query("DELETE FROM comments WHERE id = $1", [id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- 7. SONDAGES (C'est ce qui manquait ou était mal placé) ---
router.get('/polls/stats', isAdmin, async (req, res) => {
  try {
    // CORRECTION : On récupère directement 'votes_count' depuis la table des options
    // au lieu d'essayer de le recalculer depuis la table des votes (poll_votes).
    const query = `
            SELECT 
                p.id, 
                p.question, 
                p.is_active, 
                p.category, 
                p.created_at,
                (SELECT COUNT(*) FROM poll_votes WHERE poll_id = p.id) as total_votes,
                json_agg(json_build_object(
                    'id', po.id, 
                    'text', po.label, 
                    'votes', po.votes_count 
                )) as options
            FROM polls p
            LEFT JOIN poll_options po ON p.id = po.poll_id
            GROUP BY p.id, p.question, p.is_active, p.category, p.created_at
            ORDER BY p.created_at DESC
        `;
    const result = await pool.query(query);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("ERREUR SQL POLLS:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/polls', isAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { question, options, category } = req.body;
    const cat = category || 'Général';
    await client.query('BEGIN');
    await client.query("UPDATE polls SET is_active = false WHERE category = $1", [cat]);
    const resPoll = await client.query("INSERT INTO polls (question, category, is_active) VALUES ($1, $2, true) RETURNING id", [question, cat]);
    const pollId = resPoll.rows[0].id;
    for (const opt of options) {
      await client.query("INSERT INTO poll_options (poll_id, label) VALUES ($1, $2)", [pollId, opt]);
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

router.delete('/polls/:id', isAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM polls WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- 8. PARTIS (C'est ce qui manquait ou était mal placé) ---
router.get('/parties', isAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM parties ORDER BY name ASC");
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/parties', isAdmin, async (req, res) => {
  try {
    const { name, orientation, logo_url, description } = req.body;
    await pool.query("INSERT INTO parties (name, orientation, logo_url, description) VALUES ($1, $2, $3, $4)", [name, orientation, logo_url, description]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/parties/:id', isAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM parties WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DÉFINIR UN PODCAST À LA UNE (Politique ou Social)
router.put('/podcasts/:id/feature', isAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { scope } = req.body; // 'politique', 'social' ou 'none'

    await client.query('BEGIN');

    // 1. Si on définit une nouvelle "Une", on retire l'ancienne pour cette catégorie
    if (scope && scope !== 'none') {
      await client.query("UPDATE podcasts SET featured_scope = NULL WHERE featured_scope = $1", [scope]);
      // 2. On applique le tag au nouveau podcast
      await client.query("UPDATE podcasts SET featured_scope = $1 WHERE id = $2", [scope, id]);
    } else {
      // 3. Si 'none', on retire juste le tag de ce podcast
      await client.query("UPDATE podcasts SET featured_scope = NULL WHERE id = $1", [id]);
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// IMPORTANT : CETTE LIGNE DOIT ÊTRE LA TOUTE DERNIÈRE
module.exports = router;