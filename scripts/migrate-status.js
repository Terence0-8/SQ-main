// scripts/migrate-status.js
// Affiche l'état des migrations node-pg-migrate (table pgmigrations)

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
});

async function main() {
  const client = await pool.connect();
  try {
    // Vérifie si la table pgmigrations existe
    const { rows: tableExists } = await client.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'pgmigrations'
    `);

    if (tableExists.length === 0) {
      console.log('⚠️  Table pgmigrations introuvable — aucune migration n\'a encore été appliquée.');
      console.log('   Lancez : npm run migrate');
      return;
    }

    const { rows } = await client.query(
      'SELECT id, name, run_on FROM pgmigrations ORDER BY run_on ASC'
    );

    if (rows.length === 0) {
      console.log('ℹ️  Aucune migration enregistrée dans pgmigrations.');
      return;
    }

    console.log(`\n✅ Migrations appliquées (${rows.length}) :\n`);
    console.log('  ID  | Date appliquée          | Nom');
    console.log('  ----|-------------------------|' + '-'.repeat(50));
    for (const r of rows) {
      const date = new Date(r.run_on).toISOString().replace('T', ' ').slice(0, 19);
      console.log(`  ${String(r.id).padEnd(3)} | ${date} | ${r.name}`);
    }

    // Migrations non encore appliquées
    const migrationsDir = path.join(__dirname, '../backend/migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => /^\d+.*\.js$/.test(f))
      .map(f => f.replace(/\.js$/, ''))
      .sort();

    const applied = new Set(rows.map(r => r.name));
    const pending = files.filter(f => !applied.has(f));

    if (pending.length > 0) {
      console.log(`\n⏳ Migrations en attente (${pending.length}) :\n`);
      for (const p of pending) {
        console.log(`  - ${p}`);
      }
      console.log('\n  Lancez : npm run migrate');
    } else {
      console.log('\n  Base de données à jour.');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('❌ Erreur :', err.message);
  process.exit(1);
});
