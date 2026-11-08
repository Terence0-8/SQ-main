const pool = require('../backend/config/database');

async function test() {
  const hist = await pool.query('SELECT id, editorial_status, is_active, audit_decision FROM data_values WHERE id IN (260, 261, 262, 323) ORDER BY id');
  console.log('Historical rows:');
  console.table(hist.rows);

  const pilots = await pool.query('SELECT id, editorial_status, is_active, audit_decision FROM data_values WHERE id BETWEEN 687 AND 710 ORDER BY id');
  console.log(`Pilots count: ${pilots.rows.length}`);
  console.table(pilots.rows);
  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});

