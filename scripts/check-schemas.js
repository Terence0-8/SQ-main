const db = require('../backend/config/database');

async function main() {
  const vCols = await db.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'data_values' ORDER BY ordinal_position`);
  console.log('data_values columns:', vCols.rows.map(r => `${r.column_name} (${r.data_type})`));

  const iCols = await db.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'data_indicators' ORDER BY ordinal_position`);
  console.log('data_indicators columns:', iCols.rows.map(r => `${r.column_name} (${r.data_type})`));

  const pCols = await db.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'parties' ORDER BY ordinal_position`);
  console.log('parties columns:', pCols.rows.map(r => `${r.column_name} (${r.data_type})`));

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });

