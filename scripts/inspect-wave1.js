const pool = require('../backend/config/database');

(async () => {
  const wave1Ids = [693, 694, 695, 696, 698, 699, 700, 701, 706, 707, 708, 709, 710];
  const query = `
    SELECT dv.id, di.code as ind_code, di.name as ind_name, di.unit as ind_unit,
           TO_CHAR(dv.period_start, 'YYYY-MM-DD') as period_start,
           TO_CHAR(dv.period_end, 'YYYY-MM-DD') as period_end,
           dv.value_numeric, dv.methodology_nature, dv.editorial_status, dv.is_active,
           dv.audit_status, dv.audit_caveat, dv.audit_decision,
           dvs.source_role, dvs.documentary_tier, dvs.citation_reference, dvs.citation_url,
           dvs.methodological_robustness,
           ds.name as source_institution_name, ds.acronym as source_institution_acronym
    FROM data_values dv
    JOIN data_indicators di ON di.id = dv.indicator_id
    LEFT JOIN data_value_sources dvs ON dvs.data_value_id = dv.id
    LEFT JOIN data_sources ds ON ds.id = dvs.source_id
    WHERE dv.id = ANY($1::int[])
    ORDER BY dv.id ASC
  `;

  const res = await pool.query(query, [wave1Ids]);
  console.log(`Found ${res.rows.length} observations in Wave 1:`);
  for (const r of res.rows) {
    console.log(`\n--- [#${r.id}] ${r.ind_code} (${r.period_start}) ---`);
    console.log(`  Valeur: ${r.value_numeric} ${r.ind_unit} | Nature: ${r.methodology_nature}`);
    console.log(`  Statuts: editorial=${r.editorial_status} | is_active=${r.is_active} | audit_decision=${r.audit_decision}`);
    console.log(`  Source: ${r.source_institution_acronym} (${r.source_institution_name})`);
    console.log(`  Tier: ${r.documentary_tier} | Robustesse: ${r.methodological_robustness}`);
    console.log(`  Citation: ${r.citation_reference}`);
    console.log(`  URL: ${r.citation_url}`);
  }

  console.log('\n--- Documents liés dans data_document_evidence pour Wave 1 ---');
  const dde = await pool.query(`
    SELECT DISTINCT dde.id, dde.publication_id, dde.title, dde.institution_acronym,
           dde.document_status, dde.file_path, dde.sha256_hash, dde.page_section_reference
    FROM data_document_evidence dde
    JOIN data_publication_indicators dpi ON dpi.publication_id = dde.publication_id
    JOIN data_indicators di ON di.id = dpi.indicator_id
    WHERE di.code IN ('ECO_PIB_NOM', 'ECO_PIB_GROWTH', 'EDU_PRIM_GROSS')
  `);
  console.log(dde.rows);

  await pool.end();
})();

