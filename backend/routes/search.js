const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// ============================================================
// GET /api/search?q=motcle&type=article|podcast|emission&sort=date|relevance&limit=15
// Recherche Full-Text PostgreSQL avec tsvector + ts_rank
// Fallback automatique vers ILIKE si search_vector absent
// ============================================================
router.get('/', async (req, res) => {
  try {
    const { q, type, sort = 'relevance', limit = 15 } = req.query;

    // --- Validation ---
    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'La recherche doit contenir au moins 2 caractères'
      });
    }

    const safeLimit = Math.min(Math.max(parseInt(limit) || 15, 1), 50);
    const term      = q.trim();

    // Préparer la query PostgreSQL full-text
    // websearch_to_tsquery accepte les mots naturels ("paul biya" → paul & biya)
    // et est plus robuste que to_tsquery sur des entrées utilisateur
    const tsQuery = `websearch_to_tsquery('french', $1)`;

    // Ordre : relevance (ts_rank) ou date
    const orderClause = sort === 'date'
      ? 'ORDER BY date DESC'
      : 'ORDER BY rank DESC, date DESC';

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
        ts_rank(search_vector, ${tsQuery}) AS rank
      FROM articles
      WHERE status = 'published'
        AND search_vector @@ ${tsQuery}
      ${orderClause}
      LIMIT $2
    `;

    // ── Podcasts ─────────────────────────────────────────────
    const podcastsSQL = `
      SELECT
        id,
        title,
        description,
        cover_image_url AS image_url,
        category,
        created_at      AS date,
        'podcast'       AS type,
        ts_rank(search_vector, ${tsQuery}) AS rank
      FROM podcasts
      WHERE status = 'published'
        AND search_vector @@ ${tsQuery}
      ${orderClause}
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
        ts_rank(search_vector, ${tsQuery}) AS rank
      FROM emissions
      WHERE status = 'published'
        AND search_vector @@ ${tsQuery}
      ${orderClause}
      LIMIT $2
    `;

    // ── Fallback ILIKE (si migration pas encore appliquée) ────
    const ilikeTerm = `%${term}%`;
    const articlesFallbackSQL = `
      SELECT id, title, excerpt AS description, featured_image AS image_url,
             category, published_at AS date, 'article' AS type, 0 AS rank
      FROM articles
      WHERE status = 'published'
        AND (title ILIKE $1 OR excerpt ILIKE $1 OR content ILIKE $1)
      ORDER BY published_at DESC LIMIT $2`;
    const podcastsFallbackSQL = `
      SELECT id, title, description, cover_image_url AS image_url,
             category, created_at AS date, 'podcast' AS type, 0 AS rank
      FROM podcasts
      WHERE status = 'published'
        AND (title ILIKE $1 OR description ILIKE $1)
      ORDER BY created_at DESC LIMIT $2`;
    const emissionsFallbackSQL = `
      SELECT id, title, description, thumbnail_url AS image_url,
             category, created_at AS date, 'emission' AS type, 0 AS rank
      FROM emissions
      WHERE status = 'published'
        AND (title ILIKE $1 OR description ILIKE $1)
      ORDER BY created_at DESC LIMIT $2`;

    // ── Exécution avec détection auto du mode ────────────────
    let artRows, podRows, emiRows;
    let usedFallback = false;

    try {
      // Tenter Full-Text Search
      const [artRes, podRes, emiRes] = await Promise.all([
        pool.query(articlesSQL,  [term, safeLimit]),
        pool.query(podcastsSQL,  [term, safeLimit]),
        pool.query(emissionsSQL, [term, safeLimit])
      ]);
      artRows = artRes.rows;
      podRows = podRes.rows;
      emiRows = emiRes.rows;
    } catch (ftsError) {
      // Fallback automatique si search_vector n'existe pas encore
      console.warn('⚠️  FTS non disponible, fallback ILIKE:', ftsError.message);
      usedFallback = true;
      const [artRes, podRes, emiRes] = await Promise.all([
        pool.query(articlesFallbackSQL,  [ilikeTerm, safeLimit]),
        pool.query(podcastsFallbackSQL,  [ilikeTerm, safeLimit]),
        pool.query(emissionsFallbackSQL, [ilikeTerm, safeLimit])
      ]);
      artRows = artRes.rows;
      podRows = podRes.rows;
      emiRows = emiRes.rows;
    }

    // ── Filtrage par type si demandé ──────────────────────────
    let allResults = [...artRows, ...podRows, ...emiRows];
    if (type && ['article', 'podcast', 'emission'].includes(type)) {
      allResults = allResults.filter(r => r.type === type);
    }

    // ── Tri final ─────────────────────────────────────────────
    if (sort === 'date') {
      allResults.sort((a, b) => new Date(b.date) - new Date(a.date));
    } else {
      allResults.sort((a, b) => (b.rank - a.rank) || (new Date(b.date) - new Date(a.date)));
    }

    res.json({
      success:      true,
      results:      allResults,
      count:        allResults.length,
      query:        term,
      mode:         usedFallback ? 'ilike' : 'fulltext'
    });

  } catch (err) {
    console.error('❌ Erreur recherche:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

module.exports = router;
