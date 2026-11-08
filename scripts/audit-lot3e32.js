const pool = require('../backend/config/database');

async function run() {
  const gdpIds = [693, 694, 695, 696, 698, 699, 700, 701];
  const diffs = await pool.query(`
    SELECT id, data_value_id, action, diff_payload, performed_at
    FROM data_value_audit_log
    WHERE data_value_id = ANY($1)
      AND diff_payload::text != '{}' AND action != 'CREATE'
  `, [gdpIds]);
  console.log('Non-empty diffs in UPDATE_DRAFT:', diffs.rows.length);
  if (diffs.rows.length > 0) {
    console.log(diffs.rows);
  }

  const createLogs = await pool.query(`
    SELECT id, data_value_id, action, diff_payload
    FROM data_value_audit_log
    WHERE data_value_id = ANY($1) AND action = 'CREATE'
  `, [gdpIds]);
  console.log('CREATE logs count:', createLogs.rows.length);
  for (const c of createLogs.rows) {
    console.log(`Obs #${c.data_value_id} CREATE payload:`, c.diff_payload);
  }

  await pool.end();
}

run().catch(console.error);
