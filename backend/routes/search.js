const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// ==========================================
// GET /api/search?q=motcle
// Recherche globale dans articles, podcasts, emissions
// ==========================================
router.get('/', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length === 0) {
      return res.json({ success: true, results: [], count: 0 });
    }

    // Sécuriser la recherche
    if (q.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'La recherche doit contenir au moins 2 caractères'
      });
    }

    const term = `%${q}%`;

    // 1. Recherche dans ARTICLES
    const articlesQuery = `
      SELECT 
        id, 
        title, 
        excerpt as description, 
        featured_image as image_url, 
        category, 
        published_at as date, 
        'article' as type 
      FROM articles 
      WHERE status = 'published' 
        AND (title ILIKE $1 OR content ILIKE $1 OR excerpt ILIKE $1)
      LIMIT 5
    `;

    // 2. Recherche dans PODCASTS
    const podcastsQuery = `
      SELECT 
        id, 
        title, 
        description, 
        cover_image_url as image_url, 
        category, 
        created_at as date, 
        'podcast' as type 
      FROM podcasts 
      WHERE status = 'published' 
        AND (title ILIKE $1 OR description ILIKE $1)
      LIMIT 5
    `;

    // 3. Recherche dans EMISSIONS
    const emissionsQuery = `
      SELECT 
        id, 
        title, 
        description, 
        thumbnail_url as image_url, 
        category, 
        created_at as date, 
        'emission' as type 
      FROM emissions 
      WHERE status = 'published' 
        AND (title ILIKE $1 OR description ILIKE $1)
      LIMIT 5
    `;

    // Lancer les 3 recherches en parallèle
    const [artRes, podRes, emiRes] = await Promise.all([
      pool.query(articlesQuery, [term]),
      pool.query(podcastsQuery, [term]),
      pool.query(emissionsQuery, [term])
    ]);

    // Fusionner et trier par date (plus récent en premier)
    const results = [
      ...artRes.rows,
      ...podRes.rows,
      ...emiRes.rows
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      success: true,
      results: results,
      count: results.length,
      query: q
    });

  } catch (err) {
    console.error('❌ Erreur recherche:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

module.exports = router;
