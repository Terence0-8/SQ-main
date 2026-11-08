'use strict';

const pool = require('../backend/config/database');

async function main() {
  console.log('=== AUDIT CONTRADICTOIRE LOT 3E.3.1 ===\n');

  // 1. Indicateur EDU_PRIM_GROSS
  const ind = await pool.query("SELECT * FROM data_indicators WHERE code = 'EDU_PRIM_GROSS'");
  console.log('1. INDICATEUR EDU_PRIM_GROSS :');
  console.log({
    id: ind.rows[0].id,
    code: ind.rows[0].code,
    name: ind.rows[0].name,
    producer_institution: ind.rows[0].producer_institution,
    unit: ind.rows[0].unit,
    calculation_formula: ind.rows[0].calculation_formula,
    methodological_limitations: ind.rows[0].methodological_limitations
  });

  // 2. Observations #706 à #710
  const vals = await pool.query(`
    SELECT dv.id, dv.value_numeric, dv.period_start, dv.period_end, dv.school_year,
           dv.survey_or_account_status, dv.methodology_nature, dv.editorial_status,
           dv.audit_status, dv.audit_decision, dv.audit_caveat, dv.internal_notes, dv.methodology_notes
    FROM data_values dv
    WHERE dv.id BETWEEN 706 AND 710
    ORDER BY dv.id ASC
  `);
  console.log('\n2. OBSERVATIONS #706 À #710 :');
  vals.rows.forEach(v => {
    console.log(`- #${v.id}: ${v.school_year} -> ${v.value_numeric} % | nature: ${v.methodology_nature} | survey_or_account: ${v.survey_or_account_status}`);
    console.log(`   audit_status: ${v.audit_status} | caveat: ${v.audit_caveat ? v.audit_caveat.slice(0, 60) + '...' : 'null'}`);
  });

  // 3. Sources rattachées dans data_value_sources
  const srcs = await pool.query(`
    SELECT dvs.data_value_id, dvs.source_id, ds.name AS source_name, ds.acronym AS source_acronym,
           dvs.source_role, dvs.documentary_tier, dvs.methodological_robustness,
           dvs.citation_reference, dvs.citation_url, dvs.notes
    FROM data_value_sources dvs
    JOIN data_sources ds ON ds.id = dvs.source_id
    WHERE dvs.data_value_id BETWEEN 706 AND 710
    ORDER BY dvs.data_value_id, dvs.id
  `);
  console.log('\n3. SOURCES DE #706 À #710 (data_value_sources) :');
  srcs.rows.forEach(s => {
    console.log(`- Obs #${s.data_value_id}: Source #${s.source_id} (${s.source_acronym}) [${s.source_role}]`);
    console.log(`   Tier: ${s.documentary_tier} | Robustesse: ${s.methodological_robustness}`);
    console.log(`   Réf: ${s.citation_reference}`);
    console.log(`   URL: ${s.citation_url}`);
  });

  // 4. Publications dans le catalogue liées à EDU_PRIM_GROSS (ID 313)
  const pubs = await pool.query(`
    SELECT dpi.publication_id, dp.title, dp.publisher_organization, dp.publication_year,
           dp.verification_status, dp.url, dp.bibliographic_reference, dpi.specific_section
    FROM data_publication_indicators dpi
    JOIN data_publications dp ON dp.id = dpi.publication_id
    WHERE dpi.indicator_id = 313
    ORDER BY dp.id ASC
  `);
  console.log('\n4. PUBLICATIONS DU CATALOGUE LIÉES À EDU_PRIM_GROSS (data_publication_indicators) :');
  pubs.rows.forEach(p => {
    console.log(`- Pub #${p.publication_id}: "${p.title}" (${p.publisher_organization}, ${p.publication_year})`);
    console.log(`   Status: ${p.verification_status} | URL: ${p.url}`);
    console.log(`   Section: ${p.specific_section}`);
    console.log(`   Biblio: ${p.bibliographic_reference}`);
  });

  // 5. data_document_evidence pour EDU_PRIM_GROSS (ID 313)
  const ev = await pool.query(`
    SELECT id, publication_id, indicator_id, title, institution_acronym, publication_year,
           original_url, document_status, file_path, sha256_hash, page_section_reference, verification_notes
    FROM data_document_evidence
    WHERE indicator_id = 313 OR publication_id IN (1, 12)
    ORDER BY id ASC
  `);
  console.log('\n5. PREUVES DOCUMENTAIRES (data_document_evidence) :');
  ev.rows.forEach(e => {
    console.log(`- Evidence #${e.id} (Pub #${e.publication_id}): "${e.title}" [${e.institution_acronym}]`);
    console.log(`   Status: ${e.document_status} | Hash: ${e.sha256_hash || 'aucun'} | File: ${e.file_path || 'aucun'}`);
    console.log(`   Section: ${e.page_section_reference}`);
    console.log(`   Notes: ${e.verification_notes}`);
  });

  // 6. Observations PIB nominal (#693-#696) et Croissance (#698-#701)
  const gdp = await pool.query(`
    SELECT dv.id, di.code, dv.value_numeric, dv.period_start, dv.period_end,
           dv.methodology_nature, dv.survey_or_account_status,
           dvs.source_role, ds.acronym AS source_acronym, dvs.documentary_tier,
           dvs.methodological_robustness, dvs.citation_reference, dvs.citation_url
    FROM data_values dv
    JOIN data_indicators di ON di.id = dv.indicator_id
    JOIN data_value_sources dvs ON dvs.data_value_id = dv.id
    JOIN data_sources ds ON ds.id = dvs.source_id
    WHERE dv.id IN (693, 694, 695, 696, 698, 699, 700, 701)
    ORDER BY dv.id ASC
  `);
  console.log('\n6. OBSERVATIONS PIB (#693-#696) ET CROISSANCE (#698-#701) :');
  gdp.rows.forEach(g => {
    console.log(`- #${g.id} [${g.code}]: ${g.value_numeric} | Période: ${g.period_start.toISOString().slice(0, 10)} | Nature: ${g.methodology_nature}`);
    console.log(`   Source: ${g.source_acronym} (${g.documentary_tier}, ${g.methodological_robustness}) | Réf: ${g.citation_reference}`);
  });

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

