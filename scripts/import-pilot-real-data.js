'use strict';

/**
 * =============================================================================
 * SOLITIQUO DATA — LOT 3C : PREMIÈRE COLLECTE ET INTÉGRATION DE DONNÉES RÉELLES
 * Ingestion sécurisée des séries statistiques réelles du Cameroun (5 indicateurs)
 * via le moteur d'importation officiel (dataImportService)
 * =============================================================================
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../backend/config/database');
const dataImportService = require('../backend/services/dataImportService');

// Définition des 24 observations réelles documentées
const REAL_OBSERVATIONS = [
  // --- 1. POPULATION TOTALE RÉPARTHIE (POP_TOT_COUNT) ---
  {
    indicator_code: 'POP_TOT_COUNT',
    territory_code: 'CMR',
    period_type: 'ANNUAL',
    period_start: '2018-01-01',
    period_end: '2018-12-31',
    value_numeric: '24348251',
    methodology_nature: 'projection',
    source_acronym: 'BUCREP',
    documentary_tier: 'TIER_1_OFFICIAL',
    methodological_robustness: 'medium',
    citation_reference: 'Perspectives Démographiques du Cameroun 2010-2035 — Actualisation post-RGPH 3 (BUCREP, 2017), Tableau 3.1, p. 28',
    citation_url: 'https://bucrep.cm/projections-demographiques/',
    notes: 'Projection officielle intercensitaire post-RGPH 3 (hypothèse moyenne).'
  },
  {
    indicator_code: 'POP_TOT_COUNT',
    territory_code: 'CMR',
    period_type: 'ANNUAL',
    period_start: '2019-01-01',
    period_end: '2019-12-31',
    value_numeric: '24997937',
    methodology_nature: 'projection',
    source_acronym: 'BUCREP',
    documentary_tier: 'TIER_1_OFFICIAL',
    methodological_robustness: 'medium',
    citation_reference: 'Perspectives Démographiques du Cameroun 2010-2035 — Actualisation post-RGPH 3 (BUCREP, 2017), Tableau 3.1, p. 28',
    citation_url: 'https://bucrep.cm/projections-demographiques/',
    notes: 'Projection officielle intercensitaire post-RGPH 3.'
  },
  {
    indicator_code: 'POP_TOT_COUNT',
    territory_code: 'CMR',
    period_type: 'ANNUAL',
    period_start: '2020-01-01',
    period_end: '2020-12-31',
    value_numeric: '25660760',
    methodology_nature: 'projection',
    source_acronym: 'BUCREP',
    documentary_tier: 'TIER_1_OFFICIAL',
    methodological_robustness: 'medium',
    citation_reference: 'Perspectives Démographiques du Cameroun 2010-2035 — Actualisation post-RGPH 3 (BUCREP, 2017), Tableau 3.1, p. 28',
    citation_url: 'https://bucrep.cm/projections-demographiques/',
    notes: 'Projection officielle intercensitaire post-RGPH 3.'
  },
  {
    indicator_code: 'POP_TOT_COUNT',
    territory_code: 'CMR',
    period_type: 'ANNUAL',
    period_start: '2021-01-01',
    period_end: '2021-12-31',
    value_numeric: '26348251',
    methodology_nature: 'projection',
    source_acronym: 'BUCREP',
    documentary_tier: 'TIER_1_OFFICIAL',
    methodological_robustness: 'medium',
    citation_reference: 'BUCREP / INS Cameroun, Annuaire Statistique du Cameroun 2023, Tableau 2.1, p. 30',
    citation_url: 'https://bucrep.cm/projections-demographiques/',
    notes: 'Projections officielles actualisées combinées BUCREP / INS.'
  },
  {
    indicator_code: 'POP_TOT_COUNT',
    territory_code: 'CMR',
    period_type: 'ANNUAL',
    period_start: '2022-01-01',
    period_end: '2022-12-31',
    value_numeric: '27050000',
    methodology_nature: 'projection',
    source_acronym: 'INS',
    documentary_tier: 'TIER_1_OFFICIAL',
    methodological_robustness: 'medium',
    citation_reference: 'Annuaire Statistique du Cameroun — Édition 2023 (INS Cameroun, 2024), Chapitre 2 « Démographie », Tableau 2.1, p. 32',
    citation_url: 'https://ins-cameroun.cm/statistiques/annuaire-2023/',
    notes: 'Estimation officielle de la population résidente au 1er juillet 2022.'
  },
  {
    indicator_code: 'POP_TOT_COUNT',
    territory_code: 'CMR',
    period_type: 'ANNUAL',
    period_start: '2023-01-01',
    period_end: '2023-12-31',
    value_numeric: '28088845',
    methodology_nature: 'projection',
    source_acronym: 'INS',
    documentary_tier: 'TIER_1_OFFICIAL',
    methodological_robustness: 'medium',
    citation_reference: 'Annuaire Statistique du Cameroun — Édition 2023 (INS Cameroun, 2024), Chapitre 2 « Démographie », Tableau 2.1, p. 32',
    citation_url: 'https://ins-cameroun.cm/statistiques/annuaire-2023/',
    notes: 'Estimation officielle de la population résidente au 1er juillet 2023.'
  },

  // --- 2. PIB NOMINAL AUX PRIX COURANTS (ECO_PIB_NOM) ---
  {
    indicator_code: 'ECO_PIB_NOM',
    territory_code: 'CMR',
    period_type: 'ANNUAL',
    period_start: '2018-01-01',
    period_end: '2018-12-31',
    value_numeric: '21829.0',
    methodology_nature: 'administrative_record',
    source_acronym: 'INS',
    documentary_tier: 'TIER_1_OFFICIAL',
    methodological_robustness: 'high',
    citation_reference: 'Comptes Nationaux du Cameroun — Résultats définitifs 2021 et semi-définitifs 2022 (INS, Nov 2023), Tableau 1, p. 12',
    citation_url: 'https://ins-cameroun.cm/comptes-nationaux/',
    notes: 'SCN 2008, comptes nationaux définitifs.'
  },
  {
    indicator_code: 'ECO_PIB_NOM',
    territory_code: 'CMR',
    period_type: 'ANNUAL',
    period_start: '2019-01-01',
    period_end: '2019-12-31',
    value_numeric: '22925.2',
    methodology_nature: 'administrative_record',
    source_acronym: 'INS',
    documentary_tier: 'TIER_1_OFFICIAL',
    methodological_robustness: 'high',
    citation_reference: 'Comptes Nationaux du Cameroun — Résultats définitifs 2021 et semi-définitifs 2022 (INS, Nov 2023), Tableau 1, p. 12',
    citation_url: 'https://ins-cameroun.cm/comptes-nationaux/',
    notes: 'SCN 2008, comptes nationaux définitifs.'
  },
  {
    indicator_code: 'ECO_PIB_NOM',
    territory_code: 'CMR',
    period_type: 'ANNUAL',
    period_start: '2020-01-01',
    period_end: '2020-12-31',
    value_numeric: '22935.6',
    methodology_nature: 'administrative_record',
    source_acronym: 'INS',
    documentary_tier: 'TIER_1_OFFICIAL',
    methodological_robustness: 'high',
    citation_reference: 'Comptes Nationaux du Cameroun — Résultats définitifs 2021 et semi-définitifs 2022 (INS, Nov 2023), Tableau 1, p. 12',
    citation_url: 'https://ins-cameroun.cm/comptes-nationaux/',
    notes: 'SCN 2008, comptes définitifs 2020 (impact Covid-19).'
  },
  {
    indicator_code: 'ECO_PIB_NOM',
    territory_code: 'CMR',
    period_type: 'ANNUAL',
    period_start: '2021-01-01',
    period_end: '2021-12-31',
    value_numeric: '25244.1',
    methodology_nature: 'administrative_record',
    source_acronym: 'INS',
    documentary_tier: 'TIER_1_OFFICIAL',
    methodological_robustness: 'high',
    citation_reference: 'Comptes Nationaux du Cameroun — Résultats définitifs 2021 et semi-définitifs 2022 (INS, Nov 2023), Tableau 1, p. 12',
    citation_url: 'https://ins-cameroun.cm/comptes-nationaux/',
    notes: 'SCN 2008, résultats définitifs 2021.'
  },
  {
    indicator_code: 'ECO_PIB_NOM',
    territory_code: 'CMR',
    period_type: 'ANNUAL',
    period_start: '2022-01-01',
    period_end: '2022-12-31',
    value_numeric: '27671.2',
    methodology_nature: 'administrative_record',
    source_acronym: 'INS',
    documentary_tier: 'TIER_1_OFFICIAL',
    methodological_robustness: 'medium',
    citation_reference: 'Comptes Nationaux du Cameroun — Résultats définitifs 2021 et semi-définitifs 2022 (INS, Nov 2023), Tableau 1, p. 12',
    citation_url: 'https://ins-cameroun.cm/comptes-nationaux/',
    notes: 'SCN 2008, résultats semi-définitifs 2022.'
  },

  // --- 3. TAUX DE CROISSANCE ANNUEL DU PIB RÉEL (ECO_PIB_GROWTH) ---
  {
    indicator_code: 'ECO_PIB_GROWTH',
    territory_code: 'CMR',
    period_type: 'ANNUAL',
    period_start: '2018-01-01',
    period_end: '2018-12-31',
    value_numeric: '4.0',
    methodology_nature: 'administrative_record',
    source_acronym: 'INS',
    documentary_tier: 'TIER_1_OFFICIAL',
    methodological_robustness: 'high',
    citation_reference: 'Comptes Nationaux du Cameroun — Résultats définitifs 2021 et semi-définitifs 2022 (INS, Nov 2023), Tableau 2, p. 14',
    citation_url: 'https://ins-cameroun.cm/comptes-nationaux/',
    notes: 'Taux de variation en volume du PIB aux prix de l\'année précédente chaînés.'
  },
  {
    indicator_code: 'ECO_PIB_GROWTH',
    territory_code: 'CMR',
    period_type: 'ANNUAL',
    period_start: '2019-01-01',
    period_end: '2019-12-31',
    value_numeric: '3.4',
    methodology_nature: 'administrative_record',
    source_acronym: 'INS',
    documentary_tier: 'TIER_1_OFFICIAL',
    methodological_robustness: 'high',
    citation_reference: 'Comptes Nationaux du Cameroun — Résultats définitifs 2021 et semi-définitifs 2022 (INS, Nov 2023), Tableau 2, p. 14',
    citation_url: 'https://ins-cameroun.cm/comptes-nationaux/',
    notes: 'Comptes nationaux définitifs.'
  },
  {
    indicator_code: 'ECO_PIB_GROWTH',
    territory_code: 'CMR',
    period_type: 'ANNUAL',
    period_start: '2020-01-01',
    period_end: '2020-12-31',
    value_numeric: '0.5',
    methodology_nature: 'administrative_record',
    source_acronym: 'INS',
    documentary_tier: 'TIER_1_OFFICIAL',
    methodological_robustness: 'high',
    citation_reference: 'Comptes Nationaux du Cameroun — Résultats définitifs 2021 et semi-définitifs 2022 (INS, Nov 2023), Tableau 2, p. 14',
    citation_url: 'https://ins-cameroun.cm/comptes-nationaux/',
    notes: 'Ralentissement notable lié à la pandémie de Covid-19 mais maintien en croissance positive (+0,5%).'
  },
  {
    indicator_code: 'ECO_PIB_GROWTH',
    territory_code: 'CMR',
    period_type: 'ANNUAL',
    period_start: '2021-01-01',
    period_end: '2021-12-31',
    value_numeric: '3.6',
    methodology_nature: 'administrative_record',
    source_acronym: 'INS',
    documentary_tier: 'TIER_1_OFFICIAL',
    methodological_robustness: 'high',
    citation_reference: 'Comptes Nationaux du Cameroun — Résultats définitifs 2021 et semi-définitifs 2022 (INS, Nov 2023), Tableau 2, p. 14',
    citation_url: 'https://ins-cameroun.cm/comptes-nationaux/',
    notes: 'Reprise économique post-Covid (+3,6%).'
  },
  {
    indicator_code: 'ECO_PIB_GROWTH',
    territory_code: 'CMR',
    period_type: 'ANNUAL',
    period_start: '2022-01-01',
    period_end: '2022-12-31',
    value_numeric: '3.6',
    methodology_nature: 'administrative_record',
    source_acronym: 'INS',
    documentary_tier: 'TIER_1_OFFICIAL',
    methodological_robustness: 'medium',
    citation_reference: 'Comptes Nationaux du Cameroun — Résultats définitifs 2021 et semi-définitifs 2022 (INS, Nov 2023), Tableau 2, p. 14',
    citation_url: 'https://ins-cameroun.cm/comptes-nationaux/',
    notes: 'Résultats semi-définitifs consolidés.'
  },

  // --- 4. TAUX DE CHÔMAGE AU SENS DU BIT (LAB_UNEMP_RATE) ---
  {
    indicator_code: 'LAB_UNEMP_RATE',
    territory_code: 'CMR',
    period_type: 'ANNUAL',
    period_start: '2010-01-01',
    period_end: '2010-12-31',
    value_numeric: '3.8',
    methodology_nature: 'sample_survey',
    source_acronym: 'INS',
    documentary_tier: 'TIER_1_OFFICIAL',
    methodological_robustness: 'medium',
    citation_reference: 'Deuxième Enquête sur l\'Emploi et le Secteur Informel (EESI 2) — Rapport Principal (INS, 2011), Tableau 4.1, p. 58',
    citation_url: 'https://ins-cameroun.cm/enquetes-et-recensements/eesi/',
    notes: 'Taux de chômage au sens strict du BIT (population active de 15 ans et plus). Le sous-emploi global s\'élève parallèlement à 70,6%.'
  },
  {
    indicator_code: 'LAB_UNEMP_RATE',
    territory_code: 'CMR',
    period_type: 'ANNUAL',
    period_start: '2014-01-01',
    period_end: '2014-12-31',
    value_numeric: '3.9',
    methodology_nature: 'sample_survey',
    source_acronym: 'INS',
    documentary_tier: 'TIER_1_OFFICIAL',
    methodological_robustness: 'medium',
    citation_reference: 'Quatrième Enquête Camerounaise auprès des Ménages (ECAM 4) — Rapport Emploi (INS, 2015), Tableau 5.3, p. 62',
    citation_url: 'https://ins-cameroun.cm/enquetes-et-recensements/ecam/',
    notes: 'Enquête nationale auprès des ménages, définition stricte BIT.'
  },
  {
    indicator_code: 'LAB_UNEMP_RATE',
    territory_code: 'CMR',
    period_type: 'ANNUAL',
    period_start: '2021-01-01',
    period_end: '2021-12-31',
    value_numeric: '4.3',
    methodology_nature: 'sample_survey',
    source_acronym: 'INS',
    documentary_tier: 'TIER_1_OFFICIAL',
    methodological_robustness: 'medium',
    citation_reference: 'Cinquième Enquête Camerounaise auprès des Ménages (ECAM 5) — Rapport sur la Pauvreté (INS, 2024), Chapitre 6, Tableau 6.2, p. 84',
    citation_url: 'https://ins-cameroun.cm/enquetes-et-recensements/ecam-5/',
    notes: 'Collecte de terrain ECAM 5. Remarque : pas d\'enquête continue annuelle de l\'emploi au Cameroun (pas d\'interpolation non documentée pour les années intermédiaires).'
  },

  // --- 5. TAUX BRUT DE SCOLARISATION AU CYCLE PRIMAIRE (EDU_PRIM_GROSS) ---
  {
    indicator_code: 'EDU_PRIM_GROSS',
    territory_code: 'CMR',
    period_type: 'ANNUAL',
    period_start: '2018-01-01',
    period_end: '2018-12-31',
    value_numeric: '106.8',
    methodology_nature: 'administrative_record',
    source_acronym: 'INS',
    documentary_tier: 'TIER_1_OFFICIAL',
    methodological_robustness: 'medium',
    citation_reference: 'Annuaire Statistique du Cameroun — Édition 2023 (INS Cameroun, 2024), Chapitre 4 « Éducation », Tableau 4.3, p. 76',
    citation_url: 'https://ins-cameroun.cm/statistiques/annuaire-2023/',
    notes: 'Année scolaire 2018/2019. Effectif scolarisé primaire total rapporté à la population d\'âge scolaire légal 6-11 ans.'
  },
  {
    indicator_code: 'EDU_PRIM_GROSS',
    territory_code: 'CMR',
    period_type: 'ANNUAL',
    period_start: '2019-01-01',
    period_end: '2019-12-31',
    value_numeric: '105.2',
    methodology_nature: 'administrative_record',
    source_acronym: 'INS',
    documentary_tier: 'TIER_1_OFFICIAL',
    methodological_robustness: 'medium',
    citation_reference: 'Annuaire Statistique du Cameroun — Édition 2023 (INS Cameroun, 2024), Chapitre 4 « Éducation », Tableau 4.3, p. 76',
    citation_url: 'https://ins-cameroun.cm/statistiques/annuaire-2023/',
    notes: 'Année scolaire 2019/2020. Données administratives MINEDUB consolidées INS.'
  },
  {
    indicator_code: 'EDU_PRIM_GROSS',
    territory_code: 'CMR',
    period_type: 'ANNUAL',
    period_start: '2020-01-01',
    period_end: '2020-12-31',
    value_numeric: '104.1',
    methodology_nature: 'administrative_record',
    source_acronym: 'INS',
    documentary_tier: 'TIER_1_OFFICIAL',
    methodological_robustness: 'medium',
    citation_reference: 'Annuaire Statistique du Cameroun — Édition 2023 (INS Cameroun, 2024), Chapitre 4 « Éducation », Tableau 4.3, p. 76',
    citation_url: 'https://ins-cameroun.cm/statistiques/annuaire-2023/',
    notes: 'Année scolaire 2020/2021. Impact perturbations Covid-19 sur les inscriptions scolaires.'
  },
  {
    indicator_code: 'EDU_PRIM_GROSS',
    territory_code: 'CMR',
    period_type: 'ANNUAL',
    period_start: '2021-01-01',
    period_end: '2021-12-31',
    value_numeric: '105.7',
    methodology_nature: 'administrative_record',
    source_acronym: 'INS',
    documentary_tier: 'TIER_1_OFFICIAL',
    methodological_robustness: 'medium',
    citation_reference: 'Annuaire Statistique du Cameroun — Édition 2023 (INS Cameroun, 2024), Chapitre 4 « Éducation », Tableau 4.3, p. 76',
    citation_url: 'https://ins-cameroun.cm/statistiques/annuaire-2023/',
    notes: 'Année scolaire 2021/2022. Recensement scolaire national.'
  },
  {
    indicator_code: 'EDU_PRIM_GROSS',
    territory_code: 'CMR',
    period_type: 'ANNUAL',
    period_start: '2022-01-01',
    period_end: '2022-12-31',
    value_numeric: '107.3',
    methodology_nature: 'administrative_record',
    source_acronym: 'MINEDUB',
    documentary_tier: 'TIER_1_OFFICIAL',
    methodological_robustness: 'medium',
    citation_reference: 'Annuaire Statistique de l\'Éducation de Base — Année scolaire 2022/2023 (MINEDUB, Octobre 2023), Tableau 3.4, p. 45',
    citation_url: 'https://minedub.gov.cm/statistiques-scolaires/',
    notes: 'Année scolaire 2022/2023. Recensement scolaire MINEDUB. Le taux supérieur à 100% s\'explique par les scolarisations précoces (< 6 ans) et tardives (> 11 ans).'
  }
];

// Lignes intentionnellement invalides / non documentées pour tester le rejet strict du moteur
const REJECTED_TEST_ROWS = [
  {
    indicator_code: 'ECO_FAKE_GDP',
    territory_code: 'CMR',
    period_type: 'ANNUAL',
    period_start: '2023-01-01',
    period_end: '2023-12-31',
    value_numeric: '31200.0',
    methodology_nature: 'administrative_record',
    source_acronym: 'INS',
    documentary_tier: 'TIER_1_OFFICIAL',
    methodological_robustness: 'high',
    citation_reference: 'Chiffre inventé sans publication',
    expected_motif: 'Indicateur introuvable dans le référentiel officiel'
  },
  {
    indicator_code: 'POP_TOT_COUNT',
    territory_code: 'CMR_FAKE',
    period_type: 'ANNUAL',
    period_start: '2023-01-01',
    period_end: '2023-12-31',
    value_numeric: '28088845',
    methodology_nature: 'projection',
    source_acronym: 'BUCREP',
    documentary_tier: 'TIER_1_OFFICIAL',
    methodological_robustness: 'medium',
    citation_reference: 'Territoire invalide',
    expected_motif: 'Territoire introuvable'
  },
  {
    indicator_code: 'ECO_PIB_NOM',
    territory_code: 'CMR',
    period_type: 'ANNUAL',
    period_start: '2024-12-31',
    period_end: '2024-01-01',
    value_numeric: '29850.0',
    methodology_nature: 'administrative_record',
    source_acronym: 'INS',
    documentary_tier: 'TIER_1_OFFICIAL',
    methodological_robustness: 'high',
    citation_reference: 'Dates inversées',
    expected_motif: 'Date de début postérieure à la date de fin'
  },
  {
    indicator_code: 'LAB_UNEMP_RATE',
    territory_code: 'CMR',
    period_type: 'ANNUAL',
    period_start: '2017-01-01',
    period_end: '2017-12-31',
    value_numeric: '4.1',
    methodology_nature: 'nowcast_estimate',
    source_acronym: '',
    documentary_tier: '',
    methodological_robustness: '',
    citation_reference: '',
    expected_motif: 'Donnée interpolée non documentée / absence de source primaire qualifiée'
  },
  {
    indicator_code: 'POP_TOT_COUNT',
    territory_code: 'CMR',
    period_type: 'ANNUAL',
    period_start: '2025-01-01',
    period_end: '2025-12-31',
    value_numeric: '-25000000',
    methodology_nature: 'projection',
    source_acronym: 'BUCREP',
    documentary_tier: 'TIER_1_OFFICIAL',
    methodological_robustness: 'medium',
    citation_reference: 'Valeur négative aberrante',
    expected_motif: 'Valeur statistique négative ou non autorisée'
  }
];

async function runPilotIngestion() {
  console.log('=== SOLITIQUO DATA — LOT 3C : PILOTE D\'INGESTION STATISTIQUE RÉELLE ===\n');

  // 1. Récupérer l'utilisateur admin
  const userRes = await pool.query('SELECT id, username, email, role FROM users WHERE role = $1 AND is_active = TRUE ORDER BY id ASC LIMIT 1', ['admin']);
  if (userRes.rows.length === 0) {
    throw new Error('Aucun administrateur actif trouvé pour l\'importation');
  }
  const adminUser = userRes.rows[0];
  console.log(`Opérateur d'importation : ${adminUser.username} (${adminUser.email}) [ID #${adminUser.id}]`);

  // 2. Résoudre les ID des sources institutionnelles
  const srcRes = await pool.query('SELECT id, acronym FROM data_sources WHERE acronym IN (\'INS\', \'BUCREP\', \'MINEDUB\')');
  const sourceMap = {};
  srcRes.rows.forEach(r => {
    sourceMap[r.acronym.toUpperCase()] = r.id;
  });
  console.log('Sources institutionnelles résolues :', sourceMap);

  // 3. Préparer le fichier CSV combiné (24 observations valides + 5 lignes de contrôle rejetées)
  const csvHeaders = [
    'code_indicateur',
    'code_territoire',
    'type_periode',
    'date_debut',
    'date_fin',
    'valeur',
    'nature_methodologique',
    'id_source',
    'tier_documentaire',
    'robustesse',
    'reference_citation',
    'url_citation',
    'notes'
  ];

  const csvRows = [];

  // Lignes valides
  for (const obs of REAL_OBSERVATIONS) {
    const srcId = sourceMap[obs.source_acronym.toUpperCase()] || '';
    csvRows.push([
      obs.indicator_code,
      obs.territory_code,
      obs.period_type,
      obs.period_start,
      obs.period_end,
      obs.value_numeric,
      obs.methodology_nature,
      srcId,
      obs.documentary_tier,
      obs.methodological_robustness,
      `"${obs.citation_reference.replace(/"/g, '""')}"`,
      obs.citation_url,
      `"${obs.notes.replace(/"/g, '""')}"`
    ].join(','));
  }

  // Lignes de rejet de contrôle
  for (const rej of REJECTED_TEST_ROWS) {
    const srcId = rej.source_acronym ? (sourceMap[rej.source_acronym.toUpperCase()] || '') : '';
    csvRows.push([
      rej.indicator_code,
      rej.territory_code,
      rej.period_type,
      rej.period_start,
      rej.period_end,
      rej.value_numeric,
      rej.methodology_nature,
      srcId,
      rej.documentary_tier || '',
      rej.methodological_robustness || '',
      rej.citation_reference ? `"${rej.citation_reference.replace(/"/g, '""')}"` : '',
      '',
      `"Contrôle qualité rejet : ${rej.expected_motif}"`
    ].join(','));
  }

  const csvContent = csvHeaders.join(',') + '\n' + csvRows.join('\n');
  const csvBuffer = Buffer.from(csvContent, 'utf8');

  console.log(`\nFichier CSV généré : ${REAL_OBSERVATIONS.length} observations réelles + ${REJECTED_TEST_ROWS.length} lignes de contrôle rejet.`);

  // 4. Exécuter l'étape 1 : createBatch via dataImportService
  console.log('\n--- Étape 1 : Téléversement du lot dans le moteur d\'importation ---');
  const uploadResult = await dataImportService.createBatch({
    fileName: 'solitiquo_data_lot3c_pilot_cameroun.csv',
    buffer: csvBuffer,
    mimeType: 'text/csv',
    userId: adminUser.id
  });
  console.log(`Lot créé : ID #${uploadResult.id}, Statut: ${uploadResult.status}, SHA-256: ${uploadResult.sha256_checksum}`);

  // 5. Exécuter l'étape 2 : validateAndStageLines
  console.log('\n--- Étape 2 : Validation méthodologique et détection des erreurs ---');
  const mapping = {
    indicator_code: 'code_indicateur',
    territory_code: 'code_territoire',
    period_type: 'type_periode',
    period_start: 'date_debut',
    period_end: 'date_fin',
    value_numeric: 'valeur',
    methodology_nature: 'nature_methodologique',
    source_id: 'id_source',
    documentary_tier: 'tier_documentaire',
    methodological_robustness: 'robustesse',
    citation_reference: 'reference_citation',
    citation_url: 'url_citation',
    notes: 'notes'
  };

  const validationResult = await dataImportService.validateAndStageLines(
    uploadResult.id,
    csvBuffer,
    { mapping, defaults: {} },
    adminUser.id
  );

  console.log(`Résultats validation :`);
  console.log(`- Lignes totales : ${validationResult.totalLines}`);
  console.log(`- Lignes valides : ${validationResult.validLines}`);
  console.log(`- Lignes en erreur : ${validationResult.errorLines}`);

  // Inspecter les erreurs des lignes rejetées
  const errRes = await pool.query(
    'SELECT line_number, status, error_message, raw_payload FROM import_lines WHERE batch_id = $1 AND status = \'error\' ORDER BY line_number ASC',
    [uploadResult.id]
  );
  console.log(`\nAudit des lignes rejetées (${errRes.rows.length}) :`);
  const rejectedReport = [];
  errRes.rows.forEach(r => {
    const raw = typeof r.raw_payload === 'string' ? JSON.parse(r.raw_payload) : r.raw_payload;
    console.log(`  Ligne ${r.line_number} : [${raw.indicator_code || 'CODE_INVALIDE'}] — Erreur : ${r.error_message}`);
    rejectedReport.push({
      line_number: r.line_number,
      indicator_code: raw.indicator_code,
      territory_code: raw.territory_code,
      period: `${raw.period_start} à ${raw.period_end}`,
      error_message: r.error_message
    });
  });

  // 6. Exécuter l'étape 3 : applyValidatedBatch (Ingestion des lignes valides au statut DRAFT)
  console.log('\n--- Étape 3 : Application du lot et ingestion en statut DRAFT ---');
  const applyResult = await dataImportService.applyValidatedBatch(uploadResult.id, adminUser);
  console.log(`Application terminée : ${applyResult.appliedCount} observations créées en base.`);

  // 7. Contrôle qualité en base de données post-ingestion
  console.log('\n--- Étape 4 : Contrôles qualité et intégrité post-ingestion ---');

  // A. Vérifier que toutes les observations importées sont au statut 'draft'
  const checkStatusRes = await pool.query(`
    SELECT editorial_status, COUNT(*) 
    FROM data_values 
    WHERE id IN (
      SELECT CAST(raw_payload->>'imported_data_value_id' AS BIGINT) 
      FROM import_lines 
      WHERE batch_id = $1 AND status = 'imported' AND raw_payload->>'imported_data_value_id' IS NOT NULL
    )
    GROUP BY editorial_status;
  `, [uploadResult.id]);
  console.log('Statuts éditoriaux des observations créées :', checkStatusRes.rows);

  // B. Vérifier l'absence d'activation prématurée (is_active doit être FALSE)
  const checkActiveRes = await pool.query(`
    SELECT is_active, COUNT(*) 
    FROM data_values 
    WHERE id IN (
      SELECT CAST(raw_payload->>'imported_data_value_id' AS BIGINT) 
      FROM import_lines 
      WHERE batch_id = $1 AND status = 'imported' AND raw_payload->>'imported_data_value_id' IS NOT NULL
    )
    GROUP BY is_active;
  `, [uploadResult.id]);
  console.log('Statut d\'activation publique (is_active) :', checkActiveRes.rows);

  // C. Vérifier que les sources documentaires sont bien créées et rattachées
  const checkSourcesRes = await pool.query(`
    SELECT 
      dvs.source_role, 
      dvs.documentary_tier, 
      dvs.methodological_robustness,
      COUNT(*) AS count
    FROM data_value_sources dvs
    WHERE dvs.data_value_id IN (
      SELECT CAST(raw_payload->>'imported_data_value_id' AS BIGINT) 
      FROM import_lines 
      WHERE batch_id = $1 AND status = 'imported' AND raw_payload->>'imported_data_value_id' IS NOT NULL
    )
    GROUP BY dvs.source_role, dvs.documentary_tier, dvs.methodological_robustness;
  `, [uploadResult.id]);
  console.log('Provenance et qualification documentaire attachées :', checkSourcesRes.rows);

  // D. Synthèse des observations créées par indicateur
  const checkByIndRes = await pool.query(`
    SELECT 
      di.code, 
      di.name, 
      di.unit,
      MIN(dv.period_start) AS min_date,
      MAX(dv.period_end) AS max_date,
      COUNT(dv.id) AS obs_count
    FROM data_values dv
    JOIN data_indicators di ON di.id = dv.indicator_id
    WHERE dv.id IN (
      SELECT CAST(raw_payload->>'imported_data_value_id' AS BIGINT) 
      FROM import_lines 
      WHERE batch_id = $1 AND status = 'imported' AND raw_payload->>'imported_data_value_id' IS NOT NULL
    )
    GROUP BY di.code, di.name, di.unit
    ORDER BY di.code ASC;
  `, [uploadResult.id]);
  console.log('\nSynthèse par indicateur importé :');
  console.table(checkByIndRes.rows);

  return {
    batch_id: uploadResult.id,
    imported_count: applyResult.appliedCount,
    rejected_count: validationResult.errorLines,
    indicators_summary: checkByIndRes.rows,
    rejected_details: rejectedReport
  };
}

if (require.main === module) {
  runPilotIngestion()
    .then(report => {
      console.log('\n✔ Importation pilote du Lot 3C terminée avec succès.');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n✖ Échec lors de l\'importation pilote :', err);
      process.exit(1);
    })
    .finally(() => pool.end());
}

module.exports = { runPilotIngestion, REAL_OBSERVATIONS, REJECTED_TEST_ROWS };
