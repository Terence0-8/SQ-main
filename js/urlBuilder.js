// js/urlBuilder.js

/**
 * Construit une URL SEO-friendly pour un contenu
 * @param {Object} content - Objet contenu avec type, slug, language, category
 * @returns {string} URL complète SEO-friendly
 */
function buildContentUrl(content) {
  const { type, slug, language, category } = content;
  
  // Mapping catégories DB → URLs
  const categoryMap = {
    'Politique': 'politique',
    'Social': 'social',
    'Économie': 'economie',
    'Culture': 'culture',
    'International': 'international',
    'Dossiers': 'dossiers'
  };

  const lang = language || 'fr';

  switch (type) {
    case 'article':
      const urlCategory = categoryMap[category] || 'politique';
      return `/${lang}/${urlCategory}/${slug}`;
    
    case 'podcast':
      return `/${lang}/podcasts/${slug}`;
    
    case 'emission':
      return `/${lang}/emissions/${slug}`;
    
    case 'party':
      return `/${lang}/partis/${slug}`;
    
    default:
      console.warn('Type de contenu inconnu:', type);
      return '/fr';
  }
}

/**
 * Extrait l'ID depuis l'URL actuelle (compatibilité anciennes URLs)
 * @returns {string|null} ID du contenu ou null
 */
function getContentIdFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('id');
}

/**
 * Extrait le slug depuis l'URL actuelle (nouvelles URLs SEO)
 * Format attendu: /fr/politique/slug-article
 * @returns {string|null} Slug du contenu ou null
 */
function getSlugFromUrl() {
  const pathSegments = window.location.pathname.split('/').filter(Boolean);
  // Format: /fr/politique/slug-article → ["fr", "politique", "slug-article"]
  return pathSegments.length >= 3 ? pathSegments.slice(2).join('/') : null;
}

/**
 * Extrait la langue depuis l'URL actuelle
 * @returns {string} Code langue (fr ou en)
 */
function getLangFromUrl() {
  const pathSegments = window.location.pathname.split('/').filter(Boolean);
  const lang = pathSegments[0];
  return ['fr', 'en'].includes(lang) ? lang : 'fr';
}

/**
 * Extrait la catégorie depuis l'URL actuelle
 * @returns {string|null} Catégorie URL ou null
 */
function getCategoryFromUrl() {
  const pathSegments = window.location.pathname.split('/').filter(Boolean);
  return pathSegments.length >= 2 ? pathSegments[1] : null;
}

/**
 * Construit l'URL de l'API pour récupérer un contenu par slug
 * @param {string} type - Type de contenu (article, podcast, emission)
 * @param {string} slug - Slug du contenu
 * @param {string} lang - Langue (fr ou en)
 * @returns {string} URL de l'API
 */
function buildApiUrl(type, slug, lang = 'fr') {
  const typeMap = {
    'article': 'articles',
    'podcast': 'podcasts',
    'emission': 'emissions',
    'party': 'parties'
  };

  const endpoint = typeMap[type] || 'articles';
  return `/api/${endpoint}/by-slug/${slug}?lang=${lang}`;
}

/**
 * Remplace les anciens liens ?id= par les nouveaux slugs dans le DOM
 * À appeler au chargement de la page pour la compatibilité
 */
function upgradeLegacyLinks() {
  const links = document.querySelectorAll('a[href*="?id="]');
  
  links.forEach(link => {
    const href = link.getAttribute('href');
    const match = href.match(/\/(article|podcast|emission|partis)\.html\?id=(\d+)/);
    
    if (match) {
      const [, type, id] = match;
      
      // Faire une requête pour récupérer le slug
      // (en production, cela devrait être fait côté serveur)
      console.log(`⚠️ Ancien lien détecté: ${href}`);
      
      // Pour l'instant, on le laisse tel quel
      // La redirection 301 côté serveur gèrera le cas
    }
  });
}

/**
 * Génère l'URL canonique pour le SEO
 * @returns {string} URL canonique complète
 */
function getCanonicalUrl() {
  const baseUrl = window.location.origin;
  const path = window.location.pathname;
  return `${baseUrl}${path}`;
}

/**
 * Met à jour dynamiquement le lien canonical dans le <head>
 * @param {string} url - URL canonique
 */
function updateCanonicalLink(url) {
  let canonical = document.querySelector('link[rel="canonical"]');
  
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    document.head.appendChild(canonical);
  }
  
  canonical.setAttribute('href', url);
  console.log('✅ URL canonique mise à jour:', url);
}

// Export pour utilisation dans d'autres scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildContentUrl,
    getContentIdFromUrl,
    getSlugFromUrl,
    getLangFromUrl,
    getCategoryFromUrl,
    buildApiUrl,
    upgradeLegacyLinks,
    getCanonicalUrl,
    updateCanonicalLink
  };
}
