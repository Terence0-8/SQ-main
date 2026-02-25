// ═══════════════════════════════════════════════════════════
// SCRIPT MIGRATION: Ajout colonnes analytics dans table articles
// Exécutez avec: node backend/migrations/run_fix_analytics.js
// ═══════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

async function runMigration() {
    const client = await pool.connect();

    try {
        console.log('\n🔧 Début de la migration analytics...');
        console.log('📁 Lecture du fichier SQL...');

        // Lire le fichier SQL
        const sqlPath = path.join(__dirname, 'fix_analytics_columns.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('🚀 Exécution des requêtes SQL...\n');

        // Exécuter la migration
        await client.query(sql);

        console.log('\n✔️ Migration terminée avec succès !');
        console.log('\n📊 Vérification de la structure...');

        // Vérifier que les colonnes existent
        const result = await client.query(`
            SELECT 
                column_name, 
                data_type, 
                column_default
            FROM information_schema.columns 
            WHERE table_name = 'articles'
              AND column_name LIKE 'reads%'
            ORDER BY column_name
        `);

        if (result.rows.length === 5) {
            console.log('\n✅ Toutes les colonnes analytics sont présentes :\n');
            result.rows.forEach(col => {
                console.log(`   • ${col.column_name.padEnd(15)} (${col.data_type}) = ${col.column_default}`);
            });
        } else {
            console.log('\n⚠️  Attention : Seulement', result.rows.length, 'colonnes trouvées sur 5 attendues');
        }

        console.log('\n🎉 Dashboard Analytics maintenant opérationnel !');
        console.log('👉 Accès: http://localhost:5000/admin.html > Analytics\n');

        process.exit(0);

    } catch (err) {
        console.error('\n❌ Erreur lors de la migration:', err.message);
        console.error(err);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

// Lancer la migration
runMigration();