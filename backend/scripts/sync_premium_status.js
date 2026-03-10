require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
    console.log('🔄 Début de la synchronisation des statuts premium...');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Trouver tous les articles avec is_premium = true et dont on connaît l'ID ou le translation_id
        const query = `
      WITH PremiumTranslations AS (
        SELECT id, translation_id
        FROM articles
        WHERE is_premium = true AND translation_id IS NOT NULL
      )
      UPDATE articles a
      SET is_premium = true
      FROM PremiumTranslations pt
      WHERE (a.id = pt.translation_id OR a.translation_id = pt.id)
        AND a.is_premium = false
      RETURNING a.id, a.title, a.language;
    `;

        const result = await client.query(query);

        console.log(`✅ ${result.rowCount} article(s) mis à jour pour correspondre au statut premium !`);
        if (result.rowCount > 0) {
            result.rows.forEach(r => console.log(`  - [${r.language}] ${r.title}`));
        }

        // Reverse sync where child translation was marked premium but parent wasn't
        const reverseQuery = `
      WITH PremiumChildren AS (
        SELECT id, translation_id
        FROM articles
        WHERE is_premium = true AND translation_id IS NOT NULL
      )
      UPDATE articles a
      SET is_premium = true
      FROM PremiumChildren pc
      WHERE a.id = pc.translation_id
        AND a.is_premium = false
      RETURNING a.id, a.title, a.language;
    `
        const resultRev = await client.query(reverseQuery);
        console.log(`✅ ${resultRev.rowCount} article(s) source mis à jour !`);

        await client.query('COMMIT');
        console.log('🎉 Synchronisation terminée avec succès.');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Erreur lors de la synchronisation:', err);
    } finally {
        client.release();
        pool.end();
    }
}

runMigration();
