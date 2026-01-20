const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// GET /api/search?q=motcle
router.get('/', async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q) return res.json({ success: true, results: [], count: 0 });

    const term = `%${q}%`; // Le "%" permet de chercher "mot" dans "mot-clé"

    // 1. Recherche dans ARTICLES (Titre ou Contenu)
    const articlesQuery = `
      SELECT id, title, excerpt as description, image_url, category, published_at as date, 'article' as type 
      FROM articles 
      WHERE status = 'published' AND (title ILIKE $1 OR content ILIKE $1)
      LIMIT 5
    `;
    
    // 2. Recherche dans PODCASTS (Titre ou Description)
    const podcastsQuery = `
      SELECT id, title, description, image_url, category, created_at as date, 'podcast' as type 
      FROM podcasts 
      WHERE status = 'published' AND (title ILIKE $1 OR description ILIKE $1)
      LIMIT 5
    `;

    // 3. Recherche dans EMISSIONS (Titre ou Description)
    const emissionsQuery = `
      SELECT id, title, description, image_url, category, published_at as date, 'emission' as type 
      FROM emissions 
      WHERE status = 'published' AND (title ILIKE $1 OR description ILIKE $1)
      LIMIT 5
    `;

    // On lance les 3 recherches en parallèle
    const [artRes, podRes, emiRes] = await Promise.all([
      pool.query(articlesQuery, [term]),
      pool.query(podcastsQuery, [term]),
      pool.query(emissionsQuery, [term])
    ]);

    // On mélange tout et on trie par date (le plus récent en premier)
    const results = [
      ...artRes.rows,
      ...podRes.rows,
      ...emiRes.rows
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({ success: true, results: results, count: results.length });

  } catch (err) {
    console.error("Erreur Search:", err);
    res.status(500).json({ success: false, error: "Erreur serveur lors de la recherche" });
  }
});

module.exports = router;