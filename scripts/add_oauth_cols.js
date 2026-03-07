// D:\Downloads\SQ-main\scripts\add_oauth_cols.js
require('dotenv').config();
const pool = require('../backend/config/database');

async function migrate() {
    try {
        console.log("Migration OAuth en cours...");
        await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;');
        await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_id VARCHAR(255) UNIQUE;');
        await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;');
        await pool.query('ALTER TABLE users ALTER COLUMN password DROP NOT NULL;');
        console.log("Migration réussie !");
    } catch (error) {
        console.error("Erreur de migration :", error);
    } finally {
        process.exit(0);
    }
}

migrate();
