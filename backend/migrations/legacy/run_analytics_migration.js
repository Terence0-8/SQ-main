// Script de migration: Ajout des colonnes analytics
// Exécutez avec: node backend/migrations/run_analytics_migration.js

const pool = require('../config/database');

async function runMigration() {
    const client = await pool.connect();

    try {
        console.log('🔧 Début de la migration analytics...');

        // Vérifier et ajouter les colonnes une par une
        const columns = [
            { name: 'reads_start', type: 'INTEGER', default: '0' },
            { name: 'reads_25', type: 'INTEGER', default: '0' },
            { name: 'reads_50', type: 'INTEGER', default: '0' },
            { name: 'reads_75', type: 'INTEGER', default: '0' },
            { name: 'reads_100', type: 'INTEGER', default: '0' },
            { name: 'updated_at', type: 'TIMESTAMP', default: 'NOW()' }
        ];

        for (const col of columns) {
            // Vérifier si la colonne existe
            const checkQuery = `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='article_analytics' AND column_name=$1
      `;
            const result = await client.query(checkQuery, [col.name]);

            if (result.rows.length === 0) {
                // La colonne n'existe pas, on l'ajoute
                const alterQuery = `ALTER TABLE article_analytics ADD COLUMN ${col.name} ${col.type} DEFAULT ${col.default}`;
                await client.query(alterQuery);
                console.log(`✅ Colonne '${col.name}' ajoutée`);
            } else {
                console.log(`ℹ️  Colonne '${col.name}' existe déjà`);
            }
        }

        // Afficher la structure finale
        const finalStructure = await client.query(`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'article_analytics'
      ORDER BY ordinal_position
    `);

        console.log('\n📊 Structure finale de article_analytics:');
        console.table(finalStructure.rows);

        console.log('\n✅ Migration terminée avec succès !');
        process.exit(0);

    } catch (err) {
        console.error('❌ Erreur migration:', err);
        process.exit(1);
    } finally {
        client.release();
    }
}

runMigration();
