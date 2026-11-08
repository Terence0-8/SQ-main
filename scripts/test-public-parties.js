const db = require('../backend/config/database');

async function test() {
  const query = `
    SELECT id, name, acronym, leader_name, seats_assembly, type, is_active
    FROM parties
    WHERE is_active = TRUE
      AND name !~* '^(Parti )?(Mig[0-9]|Test|Demo|Breakdown|[0-9]{4,})'
      AND (acronym IS NULL OR acronym !~* '^(P3|PTD|PTEST)$')
      AND description IS NOT NULL AND length(trim(description)) >= 20
    ORDER BY CASE WHEN acronym = 'RDPC' THEN 1 WHEN acronym = 'MRC' THEN 2 WHEN acronym = 'SDF' THEN 3 WHEN acronym = 'UNDP' THEN 4 WHEN acronym = 'PCRN' THEN 5 WHEN acronym = 'UDC' THEN 6 ELSE 7 END, name ASC
  `;
  const res = await db.query(query);
  console.log('Public parties count:', res.rows.length);
  console.table(res.rows);
  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});

