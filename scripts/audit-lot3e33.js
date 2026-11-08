const pool = require('../backend/config/database');
const dataAdminService = require('../backend/services/dataAdminService');

async function run() {
  console.log('=== CONTRÔLE DE COHÉRENCE COMPLET DES 13 OBSERVATIONS DE LA VAGUE 1 ===');
  const wave1Ids = [693, 694, 695, 696, 698, 699, 700, 701, 706, 707, 708, 709, 710];

  for (const id of wave1Ids) {
    const detail = await dataAdminService.getAdminValueById(id);
    const ev = detail.evidence_evaluation;

    console.log(`\n-----------------------------------------------------------`);
    console.log(`Dossier #${detail.id} | Indicateur: ${detail.indicator_code} (${detail.indicator_name})`);
    console.log(`Valeur: ${detail.value_numeric} ${detail.indicator_unit} | Période: ${detail.period_start?.toISOString().slice(0, 10)} -> ${detail.period_end?.toISOString().slice(0, 10)} (${detail.period_type})`);
    console.log(`Source institutionnelle: ${detail.sources?.[0]?.source_acronym} (${detail.sources?.[0]?.source_name})`);
    console.log(`Référence précise: "${detail.sources?.[0]?.citation_reference}"`);
    console.log(`Publication(s) cataloguée(s): ${detail.indicator_publications?.map(p => `Pub #${p.id} (${p.title}, ${p.publication_year})`).join(' | ')}`);
    console.log(`Contrôle technique (audit_status): ${detail.audit_status}`);
    console.log(`Décision humaine (audit_decision): ${detail.audit_decision}`);
    console.log(`Statut éditorial: ${detail.editorial_status} (is_active: ${detail.is_active})`);
    console.log(`Statut documentaire calculé: ${ev.document_status}`);
    console.log(`Robustesse méthodologique: ${ev.distinct_statuses?.methodological_robustness}`);
    console.log(`Preuve PDF archivée localement: ${ev.is_pdf_archived ? 'OUI' : 'NON (signalée absente)'}`);
    console.log(`Proposition d'arbitrage: ${ev.proposed_decision}`);
  }

  console.log('\n=== RÉCONCILIATION DOSSIER #697 (PIB NOMINAL 2022) ===');
  const d697 = await dataAdminService.getAdminValueById(697);
  const ev697 = d697.evidence_evaluation;
  console.log(`Observation #697 : ${d697.value_numeric} ${d697.indicator_unit} (${d697.indicator_code})`);
  console.log(`Période: ${d697.period_start?.toISOString().slice(0, 10)} -> ${d697.period_end?.toISOString().slice(0, 10)}`);
  console.log(`Source: ${d697.sources?.[0]?.source_acronym} | Réf: "${d697.sources?.[0]?.citation_reference}"`);
  console.log(`Publication: Pub #${d697.indicator_publications?.[0]?.id} (${d697.indicator_publications?.[0]?.title})`);
  console.log(`Statut des comptes: ${d697.survey_or_account_status}`);
  console.log(`Contrôle technique: ${d697.audit_status} (Caveat: "${d697.audit_caveat}")`);
  console.log(`Décision humaine: ${d697.audit_decision}`);
  console.log(`Preuve PDF archivée: ${ev697.is_pdf_archived ? 'OUI' : 'NON'}`);

  console.log('\n=== VÉRIFICATION GLOBALE DES 24 OBSERVATIONS ET #261 ===');
  const pilotsRes = await pool.query(`
    SELECT count(*) as total,
           count(*) filter (where editorial_status = 'draft' and is_active = false and audit_decision = 'pending') as valid_pilots
    FROM data_values WHERE id BETWEEN 687 AND 710
  `);
  console.log('24 Pilotes :', pilotsRes.rows[0]);

  const v261 = await pool.query('SELECT id, value_numeric, editorial_status, is_active FROM data_values WHERE id = 261');
  console.log('Observation #261 :', v261.rows[0]);

  await pool.end();
}

run().catch(console.error);
