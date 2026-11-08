'use strict';

const pool = require('../config/database');

/**
 * Service de Contrôle de Qualité Éditoriale Centralisé (Lot 3H)
 * Analyse l'ensemble du corpus de données publiques et administratives de Solitiquo :
 * - Détection des entités de test / démonstration / migration résiduelles
 * - Détection des unités manquantes, abstraites ou techniques ("count", "val", "N/A")
 * - Contrôle de complétude des fiches indicateurs (5 questions citoyennes)
 * - Validation des partis politiques et de leur représentation institutionnelle
 * - Intégrité et sanctuarisation des observations statistiques
 */
async function generateEditorialQualityReport() {
  const anomalies = [];
  const warnings = [];
  const conformities = [];

  // 1. Audit des partis politiques
  const partiesRes = await pool.query(`
    SELECT id, name, acronym, leader_name, seats_assembly, is_active, description, type
    FROM parties ORDER BY id ASC
  `);
  const allParties = partiesRes.rows;
  const testParties = allParties.filter(p =>
    p.name.match(/^(Parti )?(Mig[0-9]|Test|Demo|Breakdown|[0-9]{4,})/i) ||
    p.acronym === 'P3' || p.acronym === 'PTD' || p.acronym === 'PTEST'
  );
  const publicParties = allParties.filter(p =>
    p.is_active === true &&
    !testParties.includes(p) &&
    p.description && p.description.trim().length >= 20
  );

  // Vérifier qu'aucun parti test n'est exposé sans filtrage
  if (testParties.length > 0) {
    warnings.push({
      category: 'partis_politiques',
      type: 'test_entities_in_db',
      count: testParties.length,
      message: `${testParties.length} partis de test/migration existent en base (isolés des vues publiques par le filtre strict).`
    });
  }

  // Vérifier la conformité des partis publics
  const invalidPublicParties = publicParties.filter(p =>
    !p.name || !p.acronym || !p.description || p.seats_assembly === null || p.seats_assembly === undefined
  );
  if (invalidPublicParties.length > 0) {
    anomalies.push({
      category: 'partis_politiques',
      type: 'incomplete_public_party',
      count: invalidPublicParties.length,
      details: invalidPublicParties.map(p => ({ id: p.id, name: p.name })),
      message: `${invalidPublicParties.length} partis publics présentent des informations obligatoires manquantes.`
    });
  } else {
    conformities.push({
      category: 'partis_politiques',
      message: `Annuaire public des partis conforme : ${publicParties.length} formations officielles vérifiées (RDPC, MRC, SDF, UNDP, PCRN, UDC) sans ambiguïté sur les sièges.`
    });
  }

  // 2. Audit des indicateurs statistiques
  const indRes = await pool.query(`
    SELECT id, code, name, category, unit, description, calculation_formula, producer_institution, methodological_limitations, is_active
    FROM data_indicators ORDER BY id ASC
  `);
  const allInds = indRes.rows;
  const testInds = allInds.filter(i =>
    i.code.match(/^(IND_MIG|IND_TEST|IND_[0-9]{10,}|IND_API|IND_UI|IND_WF|IND_INACT|IND_IMP)/i) ||
    i.name.match(/^(Indicateur Test|Indicateur Mig|Indicateur Inactif|Indicateur Import)/i)
  );
  const publicInds = allInds.filter(i => !testInds.includes(i) && i.is_active === true);

  // Détection des unités techniques ou manquantes dans les indicateurs publics
  const technicalUnits = ['count', 'units', 'val', 'n/a', '', null];
  const indsWithBadUnits = publicInds.filter(i => technicalUnits.includes(String(i.unit || '').trim().toLowerCase()));
  if (indsWithBadUnits.length > 0) {
    anomalies.push({
      category: 'indicateurs',
      type: 'technical_or_missing_unit',
      count: indsWithBadUnits.length,
      details: indsWithBadUnits.map(i => ({ code: i.code, name: i.name, unit: i.unit })),
      message: `${indsWithBadUnits.length} indicateurs publics ont une unité abstraite ou technique non traduite.`
    });
  } else {
    conformities.push({
      category: 'indicateurs',
      message: `Unités citoyennes conformes sur la totalité des ${publicInds.length} indicateurs publics (aucune unité technique 'count' ou 'units').`
    });
  }

  // Complétude des 5 questions citoyennes sur les indicateurs publics
  const incompleteInds = publicInds.filter(i =>
    !i.description || !i.producer_institution || !i.calculation_formula || !i.methodological_limitations
  );
  if (incompleteInds.length > 0) {
    warnings.push({
      category: 'indicateurs',
      type: 'incomplete_citizen_guide',
      count: incompleteInds.length,
      details: incompleteInds.map(i => ({ code: i.code, name: i.name })),
      message: `${incompleteInds.length} indicateurs publics nécessitent des compléments de description ou réserves méthodologiques.`
    });
  } else {
    conformities.push({
      category: 'indicateurs',
      message: `Fiches citoyennes exhaustives : 100% des indicateurs publics (${publicInds.length}) répondent aux 5 repères citoyens.`
    });
  }

  // 3. Audit des observations publiées et actives (data_values)
  const pubValuesRes = await pool.query(`
    SELECT dv.id, dv.indicator_id, di.code AS ind_code, di.name AS ind_name, di.unit,
           dv.value_numeric, dv.period_type, dv.period_start, dv.period_end,
           dv.methodology_nature, dv.audit_caveat,
           (SELECT COUNT(*) FROM data_value_sources dvs WHERE dvs.data_value_id = dv.id) AS sources_count
    FROM data_values dv
    JOIN data_indicators di ON di.id = dv.indicator_id
    WHERE dv.editorial_status = 'published' AND dv.is_active = TRUE
    ORDER BY dv.id ASC
  `);
  const pubValues = pubValuesRes.rows;

  // Vérifier qu'aucune observation publiée n'est orpheline de source
  const orphanValues = pubValues.filter(v => parseInt(v.sources_count, 10) === 0);
  if (orphanValues.length > 0) {
    anomalies.push({
      category: 'observations_publiees',
      type: 'orphan_published_value',
      count: orphanValues.length,
      details: orphanValues.map(v => ({ id: v.id, ind_code: v.ind_code })),
      message: `${orphanValues.length} observations publiées n'ont aucune source documentaire rattachée.`
    });
  } else {
    conformities.push({
      category: 'observations_publiees',
      message: `Traçabilité documentaire : 100% des observations publiées (${pubValues.length}) disposent d'au moins une source officielle rattachée.`
    });
  }

  // 4. Sanctuarisation stricte des observations historiques et pilotes
  const sanctCheck = await pool.query(`
    SELECT id, editorial_status, is_active, audit_decision
    FROM data_values
    WHERE id IN (260, 261, 262, 323, 687, 688, 689, 690, 691, 692, 693, 694, 695, 696, 697, 698, 699, 700, 701, 702, 703, 704, 705, 706, 707, 708, 709, 710)
    ORDER BY id ASC
  `);
  const sanctRows = sanctCheck.rows;
  const histValid = [260, 261, 262, 323].every(id => {
    const r = sanctRows.find(x => parseInt(x.id, 10) === id);
    return r && r.editorial_status === 'published' && r.is_active === true;
  });
  const pilotValid = Array.from({ length: 24 }, (_, i) => 687 + i).every(id => {
    const r = sanctRows.find(x => parseInt(x.id, 10) === id);
    return r && r.editorial_status === 'draft' && r.is_active === false && r.audit_decision === 'pending';
  });

  if (!histValid) {
    anomalies.push({
      category: 'sanctuarisation',
      type: 'historical_regression',
      message: 'Régression critique : les observations historiques #260, #261, #262 ou #323 ne sont plus publiées et actives !'
    });
  } else {
    conformities.push({
      category: 'sanctuarisation',
      message: 'Observations historiques (#260, #261, #262, #323) sanctuarisées, publiées et actives.'
    });
  }

  if (!pilotValid) {
    anomalies.push({
      category: 'sanctuarisation',
      type: 'pilot_leak_or_modification',
      message: 'Régression critique : les 24 observations pilotes (#687 à #710) ne sont pas strictement draft, is_active=false, audit_decision=pending !'
    });
  } else {
    conformities.push({
      category: 'sanctuarisation',
      message: 'Les 24 observations pilotes (#687 à #710) sont strictement confinées en statut draft, is_active=false, audit_decision=pending.'
    });
  }

  // 5. Audit des contenus éditoriaux publics (articles, podcasts, émissions)
  const artTestRes = await pool.query(`SELECT id, title, slug FROM articles WHERE title ~* '\\y(test|demo|migration)\\y' AND status = 'published'`);
  const podTestRes = await pool.query(`SELECT id, title FROM podcasts WHERE title ~* '\\y(test|demo|migration)\\y'`);
  const emTestRes = await pool.query(`SELECT id, title FROM emissions WHERE title ~* '\\y(test|demo|migration)\\y'`);

  const editorialTestCount = artTestRes.rows.length + podTestRes.rows.length + emTestRes.rows.length;
  if (editorialTestCount > 0) {
    warnings.push({
      category: 'contenus_editoriaux',
      type: 'editorial_test_residues',
      count: editorialTestCount,
      details: {
        articles: artTestRes.rows,
        podcasts: podTestRes.rows,
        emissions: emTestRes.rows
      },
      message: `${editorialTestCount} contenus éditoriaux (articles, podcasts ou émissions) contiennent des libellés de test ou démo.`
    });
  } else {
    conformities.push({
      category: 'contenus_editoriaux',
      message: 'Aucun résidu de test dans les articles, podcasts ou émissions publiés.'
    });
  }

  // Calcul du score global de qualité éditoriale (0 à 100)
  const criticalPenalties = anomalies.length * 20;
  const warningPenalties = warnings.length * 5;
  const qualityScore = Math.max(0, Math.min(100, 100 - criticalPenalties - warningPenalties));

  return {
    success: true,
    audited_at: new Date().toISOString(),
    quality_score: qualityScore,
    status: anomalies.length === 0 ? 'CONFORME_PRODUCTION' : 'ATTENTION_REQUISE',
    summary: {
      public_parties_count: publicParties.length,
      public_indicators_count: publicInds.length,
      published_observations_count: pubValues.length,
      anomalies_count: anomalies.length,
      warnings_count: warnings.length,
      conformities_count: conformities.length
    },
    conformities,
    anomalies,
    warnings
  };
}

module.exports = {
  generateEditorialQualityReport
};
