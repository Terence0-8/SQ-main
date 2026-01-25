// backend/middleware/slugResolver.js
const pool = require('../config/database');
const path = require('path');

/**
 * Middleware pour résoudre un slug en ID et type de contenu
 * Exemple: /fr/politique/reforme-electorale → { id: 5, type: 'article', lang: 'fr' }
 */
const slugResolver = async (req, res, next) => {
  // Exclure les requêtes API
  if (req.path.startsWith('/api/')) return next();

  // Exclure les fichiers statiques (avec extensions)
  // Fichiers statiques déjà gérés par express.static, double check ici pour sécutité
  if (req.path.includes('.')) return next();

  const pathSegments = req.path.split('/').filter(Boolean);

  // Format attendu : /[lang]/[category]/[slug]
  if (pathSegments.length < 3) {
    return next(); // Pas une URL de contenu, passer au suivant
  }

  const [lang, category, ...slugParts] = pathSegments;
  const slug = slugParts.join('/'); // Gérer les slugs avec plusieurs segments

  // Validation langue
  if (!['fr', 'en'].includes(lang)) {
    return next();
  }

  try {
    // Mapping catégories → tables
    const categoryMap = {
      // Articles par catégorie (français)
      'politique': { table: 'articles', type: 'article', category: 'Politique' },
      'social': { table: 'articles', type: 'article', category: 'Social' },
      'economie': { table: 'articles', type: 'article', category: 'Économie' },
      'culture': { table: 'articles', type: 'article', category: 'Culture' },
      'international': { table: 'articles', type: 'article', category: 'International' },
      'dossiers': { table: 'articles', type: 'article', category: 'Dossiers' },

      // Articles (anglais)
      'politics': { table: 'articles', type: 'article', category: 'Politique' },
      'society': { table: 'articles', type: 'article', category: 'Social' },
      'economy': { table: 'articles', type: 'article', category: 'Économie' },

      // Autres contenus
      'podcasts': { table: 'podcasts', type: 'podcast' },
      'emissions': { table: 'emissions', type: 'emission' },
      'partis': { table: 'parties', type: 'party' },
      'parties': { table: 'parties', type: 'party' } // Version anglaise
    };

    const config = categoryMap[category];

    if (!config) {
      return next(); // Catégorie inconnue, laisser passer
    }

    // Requête selon le type de contenu
    let query, values;

    if (config.type === 'article') {
      query = `
        SELECT id, slug, category, language, status, is_premium, title
        FROM ${config.table}
        WHERE slug = $1 
          AND language = $2 
          AND status = 'published'
        LIMIT 1
      `;
      values = [slug, lang];
    } else {
      // Pour podcasts, emissions, parties
      query = `
        SELECT id, slug, status, is_premium
        FROM ${config.table}
        WHERE slug = $1 
          AND status = 'published'
        LIMIT 1
      `;
      values = [slug];
    }

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      // Slug introuvable → passer au prochain handler (qui gérera le 404)
      return next();
    }

    // Stocker les infos résolues dans req pour utilisation ultérieure
    req.resolvedContent = {
      id: result.rows[0].id,
      slug: result.rows[0].slug,
      type: config.type,
      lang: lang,
      category: config.category,
      isPremium: result.rows[0].is_premium || false,
      title: result.rows[0].title || '',
      originalPath: req.path
    };

    console.log(`✅ Slug résolu: ${slug} → ${config.type} #${result.rows[0].id}`);
    next();

  } catch (err) {
    console.error('❌ Erreur résolution slug:', err);
    next(err);
  }
};

module.exports = slugResolver;
