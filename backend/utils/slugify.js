// backend/utils/slugify.js
const pool = require('../config/database');

/**
 * Génère un slug SEO-friendly depuis un titre
 * Exemple: "Réforme Électorale au Cameroun 2025" → "reforme-electorale-au-cameroun-2025"
 */
function generateSlug(text) {
  if (!text) return '';
  
  // Convertir en minuscules
  let slug = text.toLowerCase();

  // Remplacer les caractères accentués
  const accents = {
    'à': 'a', 'á': 'a', 'â': 'a', 'ä': 'a', 'ã': 'a', 'å': 'a',
    'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
    'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
    'ò': 'o', 'ó': 'o', 'ô': 'o', 'ö': 'o', 'õ': 'o',
    'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u',
    'ñ': 'n', 'ç': 'c', 'ÿ': 'y',
    'œ': 'oe', 'æ': 'ae'
  };

  slug = slug.replace(/[àáâäãåèéêëìíîïòóôöõùúûüñçÿœæ]/g, char => accents[char] || char);

  // Remplacer les apostrophes et quotes par rien
  slug = slug.replace(/['"`]/g, '');

  // Remplacer les espaces et caractères spéciaux par des tirets
  slug = slug.replace(/[^a-z0-9]+/g, '-');

  // Supprimer les tirets multiples
  slug = slug.replace(/-+/g, '-');

  // Supprimer les tirets au début/fin
  slug = slug.replace(/^-|-$/g, '');

  // Limiter à 100 caractères
  slug = slug.substring(0, 100);

  // Supprimer le tiret final si la coupure en a créé un
  slug = slug.replace(/-$/g, '');

  return slug;
}

/**
 * Garantir l'unicité du slug en ajoutant un suffixe si nécessaire
 * @param {string} baseSlug - Slug de base généré
 * @param {string} table - Table à vérifier (articles, podcasts, emissions, parties)
 * @param {number|null} excludeId - ID à exclure (pour les modifications)
 * @returns {Promise<string>} Slug unique
 */
async function ensureUniqueSlug(baseSlug, table, excludeId = null) {
  // Validation du nom de table (sécurité)
  const allowedTables = ['articles', 'podcasts', 'emissions', 'parties'];
  if (!allowedTables.includes(table)) {
    throw new Error(`Table non autorisée: ${table}`);
  }

  let slug = baseSlug;
  let counter = 1;

  while (true) {
    // Vérifier si le slug existe déjà
    const query = excludeId
      ? `SELECT id FROM ${table} WHERE slug = $1 AND id != $2`
      : `SELECT id FROM ${table} WHERE slug = $1`;
    
    const values = excludeId ? [slug, excludeId] : [slug];
    
    try {
      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        // Slug disponible
        return slug;
      }

      // Slug existe, ajouter un suffixe numérique
      slug = `${baseSlug}-${counter}`;
      counter++;

      // Sécurité: éviter les boucles infinies
      if (counter > 1000) {
        throw new Error('Impossible de générer un slug unique');
      }
    } catch (err) {
      console.error('❌ Erreur vérification unicité slug:', err);
      throw err;
    }
  }
}

/**
 * Génère un slug complet et vérifie son unicité
 * @param {string} title - Titre à convertir
 * @param {string} table - Table cible
 * @param {number|null} excludeId - ID à exclure (optionnel)
 * @returns {Promise<string>} Slug unique et valide
 */
async function createUniqueSlug(title, table, excludeId = null) {
  const baseSlug = generateSlug(title);
  
  if (!baseSlug) {
    throw new Error('Impossible de générer un slug depuis ce titre');
  }

  return await ensureUniqueSlug(baseSlug, table, excludeId);
}

module.exports = {
  generateSlug,
  ensureUniqueSlug,
  createUniqueSlug
};
