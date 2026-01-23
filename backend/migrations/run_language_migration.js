/**
 * ============================================
 * MIGRATION SCRIPT: Add Language Preferences
 * Executes SQL migration to add language support
 * ============================================
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
    user: process.env.PGUSER || 'postgres',
    host: process.env.PGHOST || 'localhost',
    database: process.env.PGDATABASE || 'solitiquo',
    password: process.env.PGPASSWORD,
    port: process.env.PGPORT || 5432,
});

async function runMigration() {
    try {
        console.log('🚀 Starting language preferences migration...');

        // Read SQL file
        const sqlPath = path.join(__dirname, 'add_language_preferences.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        // Execute migration
        await pool.query(sql);

        console.log('✅ Migration completed successfully!');
        console.log('📊 Changes:');
        console.log('   - Added preferred_language column to users table');
        console.log('   - Created language_preferences table for anonymous users');
        console.log('   - Added indexes for performance');

        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

runMigration();
