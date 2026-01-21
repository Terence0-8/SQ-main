/**
 * Configuration API Solitiquo
 * Détecte automatiquement l'environnement (dev/prod)
 */
const API_CONFIG = {
  // Détection automatique de l'URL de base
  get baseUrl() {
    // Si on est en local (file:// ou localhost sans port spécifique)
    if (window.location.protocol === 'file:' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1') {
      // IMPORTANT : Si le backend tourne sur 5000, on pointe dessus
      return 'http://localhost:5000';
    }
    // En production (domaine réel), on utilise l'origine relative
    return window.location.origin;
  },

  get apiUrl() {
    return this.baseUrl + '/api';
  }
};

// Export global pour compatibilité
window.API_URL = API_CONFIG.apiUrl;
