// backend/config/database.js

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Test simple
pool.query('SELECT NOW()', (err, _res) => {
  if (err) {
    console.error('❌ Erreur PostgreSQL:', err.message);
  } else {
    console.log('✅ PostgreSQL OK');
  }
});

module.exports = pool;
