/**
 * Configuration API Solitiquo
 * Détecte automatiquement l'environnement (dev/prod)
 */
const API_CONFIG = {
  // Détection automatique de l'URL de base
  get baseUrl() {
    // En production, utilise l'origine du site
    // En dev, utilise localhost
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return window.location.origin;
    }
    return window.location.origin;
  },
  
  get apiUrl() {
    return this.baseUrl + '/api';
  }
};

// Export global pour compatibilité
window.API_URL = API_CONFIG.apiUrl;
