const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// ============================================================
// GET /api/search?q=motcle&type=article|podcast|emission&sort=date|relevance&limit=50
// Recherche ILIKE robuste sur articles + podcasts + émissions
// ============================================================
router.get('/', async (req, res) => {
  try {
    const { q, type, sort = 'relevance', limit = 50 } = req.query;

    // --- Validation ---
    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'La recherche doit contenir au moins 2 caractères'
      });
    }

    const safeLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 100);
    const term = q.trim();
    const ilike = `%${term}%`;

    // ── Articles ────────────────────────────────────────────
    const articlesSQL = `
      SELECT
        id,
        title,
        excerpt        AS description,
        featured_image AS image_url,
        category,
        published_at   AS date,
        'article'      AS type,
        0              AS rank
      FROM articles
      WHERE status = 'published'
        AND (title ILIKE $1 OR excerpt ILIKE $1 OR content ILIKE $1)
      ORDER BY published_at DESC
      LIMIT $2
    `;

    // ── Podcasts ─────────────────────────────────────────────
    const podcastsSQL = `
      SELECT
        id,
        title,
        description,
        cover_image     AS image_url,
        category,
        created_at      AS date,
        'podcast'       AS type,
        0               AS rank
      FROM podcasts
      WHERE status = 'published'
        AND (title ILIKE $1 OR description ILIKE $1)
      ORDER BY created_at DESC
      LIMIT $2
    `;

    // ── Emissions ─────────────────────────────────────────────
    const emissionsSQL = `
      SELECT
        id,
        title,
        description,
        thumbnail_url AS image_url,
        category,
        created_at    AS date,
        'emission'    AS type,
        0             AS rank
      FROM emissions
      WHERE status = 'published'
        AND (title ILIKE $1 OR description ILIKE $1)
      ORDER BY created_at DESC
      LIMIT $2
    `;

    // ── Exécution en parallèle ────────────────────────────────
    const [artRes, podRes, emiRes] = await Promise.all([
      pool.query(articlesSQL, [ilike, safeLimit]),
      pool.query(podcastsSQL, [ilike, safeLimit]).catch(() => ({ rows: [] })),
      pool.query(emissionsSQL, [ilike, safeLimit]).catch(() => ({ rows: [] }))
    ]);

    let allResults = [...artRes.rows, ...podRes.rows, ...emiRes.rows];

    // ── Filtrage par type si demandé ──────────────────────────
    if (type && ['article', 'podcast', 'emission'].includes(type)) {
      allResults = allResults.filter(r => r.type === type);
    }

    // ── Tri final ─────────────────────────────────────────────
    allResults.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      success: true,
      results: allResults,
      count: allResults.length,
      query: term,
      mode: 'ilike'
    });

  } catch (err) {
    console.error('❌ Erreur recherche:', err.message);
    res.status(500).json({ success: false, error: 'Erreur serveur: ' + err.message });
  }
});

module.exports = router;
