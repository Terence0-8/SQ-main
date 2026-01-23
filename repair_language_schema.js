const pool = require('./backend/config/database');

async function repairDatabase() {
    console.log('🔄 Démarrage de la réparation de la base de données (Support Langue)...');

    try {
        // 1. Ajouter la colonne preferred_language à la table users
        console.log('👉 Vérification de la table users...');
        try {
            await pool.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(5) DEFAULT 'fr';
      `);
            console.log('✅ Colonne preferred_language ajoutée/vérifiée sur users.');
        } catch (e) {
            console.error('❌ Erreur users:', e.message);
        }

        // 2. Créer la table language_preferences pour les anonymes
        console.log('👉 Vérification de la table language_preferences...');
        try {
            await pool.query(`
        CREATE TABLE IF NOT EXISTS language_preferences (
            ip_address VARCHAR(45) PRIMARY KEY,
            preferred_language VARCHAR(5) NOT NULL DEFAULT 'fr',
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
            console.log('✅ Table language_preferences créée/vérifiée.');
        } catch (e) {
            console.error('❌ Erreur language_preferences:', e.message);
        }

        console.log('✨ Réparation terminée avec succès.');
        process.exit(0);

    } catch (err) {
        console.error('💥 Erreur critique:', err);
        process.exit(1);
    }
}

repairDatabase();
