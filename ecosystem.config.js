/**
 * =============================================================================
 * SOLITIQUO DATA — CONFIGURATION PM2 CLUSTER PRODUCTION (LOT 3G)
 * =============================================================================
 * Utilisation :
 *   pm2 start ecosystem.config.js --env production
 *   pm2 reload ecosystem.config.js --env production (Rechargement sans interruption)
 *   pm2 status
 *   pm2 logs solitiquo-data-app
 * =============================================================================
 */

module.exports = {
  apps: [
    {
      name: 'solitiquo-data-app',
      script: './server.js',
      instances: 'max', // Utilise tous les cœurs CPU disponibles en mode cluster
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
        TRUST_PROXY: 'true'
      },
      // Gestion des logs structurés
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      // Arrêt gracieux des connexions HTTP actives
      kill_timeout: 5000,
      listen_timeout: 10000,
      exp_backoff_restart_delay: 100
    }
  ]
};

