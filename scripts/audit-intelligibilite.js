const db = require('../backend/config/database');

async function main() {
  console.log('=== AUDIT LOT 3H : INTELLIGIBILITE & QUALITE EDITORIALE ===\n');

  // 1. Partis politiques
  console.log('--- 1. PARTIS POLITIQUES ---');
  const partiesRes = await db.query(`
    SELECT id, name, acronym, leader_name, seats_assembly, is_active, founded_year, creation_date, description
    FROM parties ORDER BY id
  `);
  console.log(`Total partis en base : ${partiesRes.rows.length}`);
  const testParties = partiesRes.rows.filter(p => 
    p.name.match(/^(Parti )?(Mig|Test|Demo|Breakdown|[0-9]{4,})/i) || 
    p.acronym === 'P3' || p.acronym === 'PTD' || p.acronym === 'PTEST'
  );
  console.log(`Partis de test / démo / migration détectés : ${testParties.length}`);
  const realParties = partiesRes.rows.filter(p => !testParties.includes(p));
  console.log(`Partis réels identifiés : ${realParties.length}`);
  realParties.forEach(p => {
    console.log(`  [ID ${p.id}] ${p.acronym} - ${p.name} | Leader: ${p.leader_name} | Sièges: ${p.seats_assembly} | Actif: ${p.is_active}`);
  });

  // 2. Observations publiées
  console.log('\n--- 2. OBSERVATIONS PUBLIEES DANS DATA_VALUES ---');
  const pubValues = await db.query(`
    SELECT v.id, v.indicator_id, i.code as ind_code, i.name as ind_name, i.unit, v.value_numeric,
           v.period_type, v.period_start, v.period_end, v.is_active, v.editorial_status,
           v.is_estimation, v.methodology_nature, v.audit_caveat
    FROM data_values v
    JOIN data_indicators i ON v.indicator_id = i.id
    WHERE v.editorial_status = 'published' AND v.is_active = true
    ORDER BY v.id
  `);
  console.log(`Total observations publiées actives : ${pubValues.rows.length}`);
  pubValues.rows.forEach(v => {
    const yr = v.period_start ? (new Date(v.period_start)).getFullYear() : '';
    console.log(`  [ID ${v.id}] ${v.ind_code} (${v.ind_name}) : ${v.value_numeric} ${v.unit} [${v.period_type} ${yr}] is_est=${v.is_estimation} nature: ${v.methodology_nature}`);
  });

  // 3. Sanctuarisation check
  console.log('\n--- 3. VERIFICATION SANCTUARISATION ---');
  const sanctObs = await db.query(`
    SELECT id, editorial_status, is_active, audit_decision FROM data_values WHERE id IN (260, 261, 262, 323, 687, 693, 706, 710) ORDER BY id
  `);
  sanctObs.rows.forEach(r => {
    console.log(`  Observation #${r.id} : editorial_status=${r.editorial_status}, is_active=${r.is_active}, audit_decision=${r.audit_decision}`);
  });

  // 4. Articles, Podcasts, Émissions
  console.log('\n--- 4. AUTRES CONTENUS PUBLICS (Articles, Podcasts, Émissions) ---');
  const artCount = await db.query('SELECT count(*) FROM articles');
  const podCount = await db.query('SELECT count(*) FROM podcasts');
  const emCount = await db.query('SELECT count(*) FROM emissions');
  console.log(`Articles: ${artCount.rows[0].count}, Podcasts: ${podCount.rows[0].count}, Émissions: ${emCount.rows[0].count}`);

  const testArticles = await db.query(`SELECT id, title, slug FROM articles WHERE title ILIKE '%test%' OR title ILIKE '%demo%' OR title ILIKE '%article migration%'`);
  console.log(`Articles test: ${testArticles.rows.length}`);
  testArticles.rows.forEach(a => console.log(`  Article test [ID ${a.id}] : ${a.title}`));

  const testPodcasts = await db.query(`SELECT id, title FROM podcasts WHERE title ILIKE '%test%' OR title ILIKE '%demo%'`);
  console.log(`Podcasts test: ${testPodcasts.rows.length}`);

  const testEmissions = await db.query(`SELECT id, title FROM emissions WHERE title ILIKE '%test%' OR title ILIKE '%demo%'`);
  console.log(`Émissions test: ${testEmissions.rows.length}`);

  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
