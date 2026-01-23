// js/config.js - Configuration centralisée de l'API
(function () {
  const hostname = window.location.hostname;

  // Détection automatique de l'environnement
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';

  // URL de l'API selon l'environnement
  const API_BASE_URL = isLocal
    ? 'http://localhost:5000/api'            // Développement local
    : 'https://api.solitiquo.com/api';       // Production (à modifier plus tard)

  // Variable globale accessible partout
  window.API_URL = API_BASE_URL;

  console.log('🔧 Config chargée - Environnement:', isLocal ? 'LOCAL' : 'PRODUCTION', '- API:', API_BASE_URL);
})();
