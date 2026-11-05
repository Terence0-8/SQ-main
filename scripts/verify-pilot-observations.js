'use strict';

const pool = require('../backend/config/database');

async function verify() {
  try {
    // 1. Observation 261
    const obs261 = await pool.query(`
      SELECT dv.id, di.code AS indicator_code, dv.value_numeric, dv.period_type,
             dv.period_start, dv.period_end, dv.editorial_status, dv.is_active,
             dv.methodology_nature
      FROM data_values dv
      JOIN data_indicators di ON di.id = dv.indicator_id
      WHERE dv.id = 261;
    `);
    console.log('=== OBSERVATION HISTORIQUE #261 ===');
    console.table(obs261.rows);

    // 2. Observations pilotes 687-710
    const pilots = await pool.query(`
      SELECT dv.id, di.code AS indicator_code, t.code AS territory_code,
             dv.period_type, dv.period_start, dv.period_end, dv.value_numeric,
             dv.editorial_status, dv.is_active, dv.audit_status, dv.audit_decision,
             dv.survey_or_account_status,
             SUBSTRING(dv.audit_caveat FROM 1 FOR 45) AS caveat_prefix,
             (SELECT COUNT(*) FROM data_value_sources dvs WHERE dvs.data_value_id = dv.id) AS sources_count
      FROM data_values dv
      JOIN data_indicators di ON di.id = dv.indicator_id
      JOIN territories t ON t.id = dv.territory_id
      WHERE dv.id BETWEEN 687 AND 710
      ORDER BY dv.id ASC;
    `);
    console.log(`\n=== OBSERVATIONS PILOTES #687 À #710 (${pilots.rows.length} enregistrements) ===`);
    console.table(pilots.rows);

    // Contrôles stricts
    const allDraft = pilots.rows.every(r => r.editorial_status === 'draft');
    const allInactive = pilots.rows.every(r => r.is_active === false);
    const allPending = pilots.rows.every(r => r.audit_decision === 'pending');
    const allHaveSources = pilots.rows.every(r => parseInt(r.sources_count, 10) >= 1);

    console.log('\n--- VÉRIFICATIONS D\'INTÉGRITÉ ---');
    console.log('1. Nombre d\'observations pilotes == 24 :', pilots.rows.length === 24);
    console.log('2. Toutes en statut "draft" :', allDraft);
    console.log('3. Toutes avec is_active == FALSE :', allInactive);
    console.log('4. Toutes avec audit_decision == "pending" :', allPending);
    console.log('5. Toutes pourvues d\'au moins une source :', allHaveSources);
    console.log('6. Obs 261 est ECO_PIB_NOM, 29850, published, active :',
      obs261.rows.length === 1 &&
      obs261.rows[0].indicator_code === 'ECO_PIB_NOM' &&
      parseFloat(obs261.rows[0].value_numeric) === 29850 &&
      obs261.rows[0].editorial_status === 'published' &&
      obs261.rows[0].is_active === true
    );
  } catch (err) {
    console.error('Erreur vérification:', err);
  } finally {
    await pool.end();
  }
}

verify();

