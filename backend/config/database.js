// backend/config/database.js
'use strict';

const { Pool } = require('pg');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';
const dbSslEnv = process.env.DB_SSL;

let poolConfig = {
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
  connectionTimeoutMillis: parseInt(process.env.DB_CONN_TIMEOUT || '5000', 10),
};

// 1. Détermination de la source de connexion (DATABASE_URL prioritaire, sinon DB_*)
if (process.env.DATABASE_URL) {
  let connectionUrl = process.env.DATABASE_URL;

  // Précision critique : DB_SSL=false est une désactivation SSL explicite et prioritaire
  if (dbSslEnv === 'false') {
    try {
      const parsedUrl = new URL(connectionUrl);
      parsedUrl.searchParams.delete('ssl');
      parsedUrl.searchParams.delete('sslmode');
      parsedUrl.searchParams.delete('sslrootcert');
      parsedUrl.searchParams.delete('sslcert');
      parsedUrl.searchParams.delete('sslkey');
      connectionUrl = parsedUrl.toString();
    } catch (_e) {
      // Si l'URL n'est pas un format standard URL RFC, suppression par regex
      connectionUrl = connectionUrl
        .replace(/[?&]sslmode=[^&]+/g, '')
        .replace(/[?&]ssl=[^&]+/g, '');
    }
    poolConfig.connectionString = connectionUrl;
    poolConfig.ssl = false;
  } else if (dbSslEnv === 'true') {
    poolConfig.connectionString = connectionUrl;
    poolConfig.ssl = {
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true'
    };
  } else {
    // Si DB_SSL n'est pas spécifié, laisser la chaîne DATABASE_URL ou le défaut opérer
    poolConfig.connectionString = connectionUrl;
  }
} else {
  poolConfig.user = process.env.DB_USER;
  poolConfig.password = process.env.DB_PASSWORD;
  poolConfig.host = process.env.DB_HOST;
  poolConfig.port = parseInt(process.env.DB_PORT || '5432', 10);
  poolConfig.database = process.env.DB_NAME;

  // Détermination SSL si variables DB_*
  if (dbSslEnv === 'false') {
    poolConfig.ssl = false;
  } else if (dbSslEnv === 'true') {
    poolConfig.ssl = {
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true'
    };
  } else if (isProduction && process.env.DB_HOST && process.env.DB_HOST !== 'localhost' && process.env.DB_HOST !== '127.0.0.1') {
    // Fallback de sécurité historique si hôte externe en production sans désactivation explicite
    poolConfig.ssl = {
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true'
    };
  }
}

const pool = new Pool(poolConfig);

// Écoute des erreurs inattendues sur les clients inactifs pour éviter le crash silencieux
pool.on('error', (err) => {
  console.error('❌ Erreur inattendue sur un client PostgreSQL inactif :', err.message);
});

// Fermeture propre du pool (Graceful Shutdown)
async function closePool() {
  try {
    await pool.end();
  } catch (err) {
    console.error('❌ Erreur fermeture pool PostgreSQL :', err.message);
  }
}

pool.closePool = closePool;

module.exports = pool;
