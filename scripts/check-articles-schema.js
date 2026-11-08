const db = require('../backend/config/database');

async function main() {
  const aCols = await db.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'articles' ORDER BY ordinal_position`);
  console.log('articles columns:', aCols.rows.map(r => `${r.column_name} (${r.data_type})`));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });

