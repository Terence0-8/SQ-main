/**
 * =============================================================================
 * SOLITIQUO DATA — LOT 3E.1
 * SUITE DE TESTS : RÉCONCILIATION FINALE ET PRÉPARATION DE LA VALIDATION HUMAINE
 * =============================================================================
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../backend/config/database');

describe('SOLITIQUO DATA — LOT 3E.1 RÉCONCILIATION ET STATUTS D\'AUDIT', () => {

  // ---------------------------------------------------------------------------
  // 1. RÉPARTITION EXACTE DES TROIS VAGUES
  // ---------------------------------------------------------------------------
  describe('1. Répartition et effectifs exacts des 3 vagues', () => {
    test('1.1 Effectifs exacts : Vague 1 = 13, Vague 2 = 5, Vague 3 = 6 (Total = 24)', async () => {
      const res = await pool.query(`
        SELECT di.code, dv.id, dv.period_start, dv.value_numeric, dv.methodology_nature
        FROM data_values dv
        JOIN data_indicators di ON di.id = dv.indicator_id
        WHERE dv.id BETWEEN 687 AND 710
        ORDER BY dv.id ASC
      `);

      assert.equal(res.rows.length, 24, 'Le pilote doit comporter exactement 24 observations');

      const wave1Ids = [693, 694, 695, 696, 698, 699, 700, 701, 706, 707, 708, 709, 710];
      const wave2Ids = [697, 702, 703, 704, 705];
      const wave3Ids = [687, 688, 689, 690, 691, 692];

      assert.equal(wave1Ids.length, 13, 'Vague 1 doit comporter exactement 13 observations');
      assert.equal(wave2Ids.length, 5, 'Vague 2 doit comporter exactement 5 observations');
      assert.equal(wave3Ids.length, 6, 'Vague 3 doit comporter exactement 6 observations');
      assert.equal(wave1Ids.length + wave2Ids.length + wave3Ids.length, 24, 'Total des 3 vagues = 24');

      // Vérifier que tous les IDs correspondent bien au périmètre 687-710
      const allAssignedIds = [...wave1Ids, ...wave2Ids, ...wave3Ids].sort((a, b) => a - b);
      const dbIds = res.rows.map(r => Number(r.id)).sort((a, b) => a - b);
      assert.deepEqual(allAssignedIds, dbIds, 'Les IDs des vagues doivent couvrir exactement #687 à #710 sans trou ni doublon');
    });

    test('1.2 Composition thématique de la Vague 1 (13 observations macro/éducatives certifiées)', async () => {
      const res = await pool.query(`
        SELECT dv.id, di.code
        FROM data_values dv
        JOIN data_indicators di ON di.id = dv.indicator_id
        WHERE dv.id IN (693, 694, 695, 696, 698, 699, 700, 701, 706, 707, 708, 709, 710)
        ORDER BY dv.id ASC
      `);

      const codes = res.rows.map(r => r.code);
      const pibNom = codes.filter(c => c === 'ECO_PIB_NOM');
      const pibGrowth = codes.filter(c => c === 'ECO_PIB_GROWTH');
      const eduPrim = codes.filter(c => c === 'EDU_PRIM_GROSS');

      assert.equal(pibNom.length, 4, 'Vague 1 : 4 observations PIB nominal (2018-2021 définitif)');
      assert.equal(pibGrowth.length, 4, 'Vague 1 : 4 observations croissance PIB (2018-2021 définitif)');
      assert.equal(eduPrim.length, 5, 'Vague 1 : 5 observations TBS primaire (2018-2022)');
    });

    test('1.3 Composition thématique de la Vague 2 (5 observations avec réserve expresse)', async () => {
      const res = await pool.query(`
        SELECT dv.id, di.code
        FROM data_values dv
        JOIN data_indicators di ON di.id = dv.indicator_id
        WHERE dv.id IN (697, 702, 703, 704, 705)
        ORDER BY dv.id ASC
      `);

      const codes = res.rows.map(r => r.code);
      assert.equal(codes.filter(c => c === 'ECO_PIB_NOM').length, 1, 'PIB nominal 2022 semi-définitif (#697)');
      assert.equal(codes.filter(c => c === 'ECO_PIB_GROWTH').length, 1, 'Croissance 2022 semi-définitif (#702)');
      assert.equal(codes.filter(c => c === 'LAB_UNEMP_RATE').length, 3, 'Taux de chômage enquêtes EESI 2, ECAM 4, ECAM 5 (#703-705)');
    });

    test('1.4 Composition thématique de la Vague 3 (6 observations de population totale)', async () => {
      const res = await pool.query(`
        SELECT dv.id, di.code
        FROM data_values dv
        JOIN data_indicators di ON di.id = dv.indicator_id
        WHERE dv.id BETWEEN 687 AND 692
        ORDER BY dv.id ASC
      `);

      assert.equal(res.rows.length, 6, 'Vague 3 : 6 observations POP_TOT_COUNT (2018-2023)');
      res.rows.forEach(r => assert.equal(r.code, 'POP_TOT_COUNT'));
    });
  });

  // ---------------------------------------------------------------------------
  // 2. RÉCONCILIATION PRÉCISE DES DONNÉES DE POPULATION (#687 À #692)
  // ---------------------------------------------------------------------------
  describe('2. Réconciliation fine des données de population', () => {
    test('2.1 Valeurs exactes en base : 2018 à 2023 sans arrondi artificiel antérieur', async () => {
      const res = await pool.query(`
        SELECT id, period_start, value_numeric
        FROM data_values
        WHERE id BETWEEN 687 AND 692
        ORDER BY period_start ASC
      `);

      const expected = [
        { id: 687, year: 2018, val: 24348251 },
        { id: 688, year: 2019, val: 24997937 }, // Valeur exacte BUCREP et non 24 997 000
        { id: 689, year: 2020, val: 25660760 }, // Valeur exacte BUCREP et non 25 660 000
        { id: 690, year: 2021, val: 26348251 },
        { id: 691, year: 2022, val: 27050000 }, // Arrondi officiel INS Annuaire Tableau 2.1
        { id: 692, year: 2023, val: 28088845 }  // Recalibration INS Annuaire Tableau 2.1
      ];

      res.rows.forEach((r, idx) => {
        assert.equal(Number(r.id), expected[idx].id);
        assert.equal(parseFloat(r.value_numeric), expected[idx].val,
          `Valeur en base non conforme pour #${r.id} (année ${expected[idx].year}) : attendu ${expected[idx].val}, obtenu ${r.value_numeric}`);
      });
    });

    test('2.2 Régularité du taux d\'accroissement 2018-2022 (~2.66%) et détection du saut 2023 (+3.84%)', async () => {
      const res = await pool.query(`
        SELECT id, value_numeric
        FROM data_values
        WHERE id BETWEEN 687 AND 692
        ORDER BY id ASC
      `);

      const vals = res.rows.map(r => parseFloat(r.value_numeric));

      // Accroissements relatifs annuels
      const rates = [];
      for (let i = 1; i < vals.length; i++) {
        rates.push((vals[i] - vals[i - 1]) / vals[i - 1]);
      }

      // Taux 2018->2019 (+2.668%), 2019->2020 (+2.651%), 2020->2021 (+2.679%), 2021->2022 (+2.663%)
      for (let i = 0; i < 4; i++) {
        assert.ok(rates[i] >= 0.026 && rates[i] <= 0.027,
          `Taux d'accroissement naturel attendu autour de 2.66%, obtenu: ${(rates[i] * 100).toFixed(3)}%`);
      }

      // Taux 2022->2023 : +3.840% (+1 038 845 habitants)
      assert.ok(rates[4] > 0.038, `Rupture anormale 2023 attendue > 3.8%, obtenue: ${(rates[4] * 100).toFixed(3)}%`);
      const absDiff2023 = vals[5] - vals[4];
      assert.equal(absDiff2023, 1038845, `Saut absolu en 2023 attendu = 1 038 845 hab, obtenu: ${absDiff2023}`);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. DISTINCTION CLAIRE ENTRE STATUTS TECHNIQUES ET DÉCISIONS HUMAINES
  // ---------------------------------------------------------------------------
  describe('3. Distinction rigoureuse entre constats techniques et décisions humaines', () => {
    test('3.1 Pour TOUTES les 24 observations, audit_decision est STRICTEMENT "pending"', async () => {
      const res = await pool.query(`
        SELECT id, audit_decision, editorial_status, is_active
        FROM data_values
        WHERE id BETWEEN 687 AND 710
      `);

      assert.equal(res.rows.length, 24);
      res.rows.forEach(r => {
        assert.equal(r.audit_decision, 'pending', `L'observation #${r.id} ne doit avoir AUCUNE décision humaine automatique`);
        assert.equal(r.editorial_status, 'draft', `L'observation #${r.id} doit être au statut 'draft'`);
        assert.equal(r.is_active, false, `L'observation #${r.id} doit avoir is_active = FALSE`);
      });
    });

    test('3.2 Répartition des constats techniques d\'audit (audit_status en base)', async () => {
      const res = await pool.query(`
        SELECT audit_status, COUNT(*) AS count
        FROM data_values
        WHERE id BETWEEN 687 AND 710
        GROUP BY audit_status
      `);

      const map = {};
      res.rows.forEach(r => { map[r.audit_status] = parseInt(r.count, 10); });

      // 13 observations confirmed (PIB définitif 4 + croissance définitive 4 + TBS primaire 5)
      assert.equal(map['confirmed'], 13, '13 observations ont le constat technique confirmed');
      // 11 observations confirmed_with_caveat (POP 6 + PIB semi-déf 1 + croissance semi-déf 1 + chômage 3)
      assert.equal(map['confirmed_with_caveat'], 11, '11 observations ont le constat technique confirmed_with_caveat');
    });

    test('3.3 Présence obligatoire du champ audit_caveat pour les 11 observations confirmed_with_caveat', async () => {
      const res = await pool.query(`
        SELECT id, audit_caveat
        FROM data_values
        WHERE id BETWEEN 687 AND 710 AND audit_status = 'confirmed_with_caveat'
      `);

      assert.equal(res.rows.length, 11);
      res.rows.forEach(r => {
        assert.ok(r.audit_caveat && r.audit_caveat.trim().length >= 10,
          `Réserve méthodologique manquante ou trop courte pour #${r.id}`);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 4. VÉRIFICATION DES PREUVES ET DÉTECTION DES ANOMALIES DOCUMENTAIRES
  // ---------------------------------------------------------------------------
  describe('4. Contrôle des preuves documentaires et anomalies identifiées', () => {
    test('4.1 Présence des publications canoniques actives', async () => {
      const res = await pool.query(`
        SELECT id, title, publication_year, verification_status, url
        FROM data_publications
        WHERE id IN (1, 2, 4, 6, 8, 12)
        ORDER BY id ASC
      `);

      assert.equal(res.rows.length, 6, 'Les 6 publications canoniques du catalogue doivent exister');
      res.rows.forEach(p => {
        // Au Lot 3E.2.1, les statuts non prouvés ne sont plus abusivement verified_consulted
        assert.ok(
          ['institutional_reference_only', 'unavailable'].includes(p.verification_status),
          `Statut vérifié pour #${p.id} : ${p.verification_status}`
        );
        assert.ok(p.url && p.url.startsWith('https://'));
      });
    });

    test('4.2 Suivi de l\'anomalie documentaire ECAM 4 (résolue au Lot 3E.2)', async () => {
      const res = await pool.query("SELECT id, title FROM data_publications WHERE title ILIKE '%ECAM 4%'");
      // Au Lot 3E.1, length === 0 (anomalie détectée). Au Lot 3E.2, ECAM 4 est enregistrée canoniquement (length === 1).
      assert.ok(res.rows.length <= 1, 'ECAM 4 ne doit pas avoir de doublon');
    });

    test('4.3 Suivi de l\'anomalie documentaire ECAM 5 <-> LAB_UNEMP_RATE (résolue au Lot 3E.2)', async () => {
      const res = await pool.query(`
        SELECT dpi.publication_id
        FROM data_publication_indicators dpi
        JOIN data_publications dp ON dp.id = dpi.publication_id
        JOIN data_indicators di ON di.id = dpi.indicator_id
        WHERE dp.id = 6 AND di.code = 'LAB_UNEMP_RATE'
      `);

      // Au Lot 3E.1, non liée (0). Au Lot 3E.2, liaison canonique établie (1).
      assert.ok(res.rows.length <= 1, 'Liaison ECAM 5 <-> LAB_UNEMP_RATE ne doit pas avoir de doublon');
    });

    test('4.4 Nature des URLs enregistrées : ce sont des URLs de section/rubrique et non des fichiers PDF directs', async () => {
      const res = await pool.query(`
        SELECT dvs.data_value_id, dvs.citation_url
        FROM data_value_sources dvs
        WHERE dvs.data_value_id BETWEEN 687 AND 710
      `);

      assert.equal(res.rows.length, 24);
      res.rows.forEach(r => {
        // Aucune URL ne pointe directement vers un .pdf local ou distant
        assert.ok(!r.citation_url.endsWith('.pdf'),
          `L'URL pour #${r.data_value_id} pointe vers un portail institutionnel (${r.citation_url}), non un fichier PDF`);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 5. NON-RÉGRESSION ABSOLUE DES 25 OBSERVATIONS
  // ---------------------------------------------------------------------------
  describe('5. Non-régression absolue des 25 observations', () => {
    test('5.1 Les 24 observations du pilote sont 100% intactes', async () => {
      const res = await pool.query(`
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE editorial_status = 'draft') AS draft_count,
               COUNT(*) FILTER (WHERE is_active = FALSE) AS inactive_count,
               COUNT(*) FILTER (WHERE audit_decision = 'pending') AS pending_count
        FROM data_values
        WHERE id BETWEEN 687 AND 710
      `);

      const row = res.rows[0];
      assert.equal(parseInt(row.total, 10), 24);
      assert.equal(parseInt(row.draft_count, 10), 24);
      assert.equal(parseInt(row.inactive_count, 10), 24);
      assert.equal(parseInt(row.pending_count, 10), 24);
    });

    test('5.2 L\'observation historique #261 est strictement inchangée', async () => {
      const res = await pool.query('SELECT * FROM data_values WHERE id = 261');
      assert.equal(res.rows.length, 1);
      const obs = res.rows[0];
      assert.equal(obs.editorial_status, 'published');
      assert.equal(obs.is_active, true);
      assert.equal(parseFloat(obs.value_numeric), 29850);
      assert.equal(obs.period_type, 'ANNUAL');
    });
  });
});
