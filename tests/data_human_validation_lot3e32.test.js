/**
 * =============================================================================
 * SOLITIQUO DATA — LOT 3E.3.2 : RÉCONCILIATION DES VALEURS STATISTIQUES,
 * DES IDENTIFIANTS DOCUMENTAIRES ET DE L'INTÉGRITÉ HISTORIQUE
 * =============================================================================
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../backend/config/database');

describe('SOLITIQUO DATA — LOT 3E.3.2 : RÉCONCILIATION STATISTIQUE ET DOCUMENTAIRE', () => {
  const gdpIds = [693, 694, 695, 696, 698, 699, 700, 701];
  const wave1Ids = [693, 694, 695, 696, 698, 699, 700, 701, 706, 707, 708, 709, 710];
  const allPilotIds = Array.from({ length: 24 }, (_, i) => 687 + i);

  describe('1. Réconciliation des huit observations du PIB', () => {
    test('1.1 Les valeurs réelles en base correspondent exactement aux valeurs originellement importées', async () => {
      const res = await pool.query(`
        SELECT dv.id, di.code, dv.value_numeric, dv.period_start, dv.period_type,
               dv.methodology_nature, dv.editorial_status, dv.audit_decision
        FROM data_values dv
        JOIN data_indicators di ON di.id = dv.indicator_id
        WHERE dv.id = ANY($1)
        ORDER BY dv.id ASC
      `, [gdpIds]);

      assert.equal(res.rows.length, 8, 'Les 8 observations du PIB doivent être présentes');

      const expected = {
        693: { code: 'ECO_PIB_NOM', val: 21829.0 },
        694: { code: 'ECO_PIB_NOM', val: 22925.2 },
        695: { code: 'ECO_PIB_NOM', val: 22935.6 },
        696: { code: 'ECO_PIB_NOM', val: 25244.1 },
        698: { code: 'ECO_PIB_GROWTH', val: 4.0 },
        699: { code: 'ECO_PIB_GROWTH', val: 3.4 },
        700: { code: 'ECO_PIB_GROWTH', val: 0.5 },
        701: { code: 'ECO_PIB_GROWTH', val: 3.6 }
      };

      for (const row of res.rows) {
        const exp = expected[row.id];
        assert.equal(row.code, exp.code);
        assert.equal(parseFloat(row.value_numeric), exp.val, `Valeur divergente pour l'observation #${row.id}`);
        assert.equal(row.editorial_status, 'draft');
        assert.equal(row.audit_decision, 'pending');
      }
    });

    test('1.2 Historique de versions et audit log : aucune modification statistique depuis l\'import initial', async () => {
      // 0 version dans data_value_versions
      const versionsRes = await pool.query(
        'SELECT * FROM data_value_versions WHERE data_value_id = ANY($1)',
        [gdpIds]
      );
      assert.equal(versionsRes.rows.length, 0, 'Aucune version ne doit exister pour ces 8 observations');

      // Dans l'audit log : le payload de création initial contient les valeurs réelles
      const createLogs = await pool.query(`
        SELECT data_value_id, diff_payload
        FROM data_value_audit_log
        WHERE data_value_id = ANY($1) AND action = 'CREATE'
      `, [gdpIds]);
      assert.equal(createLogs.rows.length, 8, '8 entrées de création doivent exister');

      const expectedCreated = {
        693: 21829,
        694: 22925.2,
        695: 22935.6,
        696: 25244.1,
        698: 4,
        699: 3.4,
        700: 0.5,
        701: 3.6
      };

      for (const log of createLogs.rows) {
        const expVal = expectedCreated[log.data_value_id];
        assert.equal(log.diff_payload.value_numeric, expVal, `Payload initial non conforme pour #${log.data_value_id}`);
      }

      // Toutes les mises à jour ultérieures (re-imports idempotents) ont un diff_payload vide
      const nonNullDiffs = await pool.query(`
        SELECT id FROM data_value_audit_log
        WHERE data_value_id = ANY($1)
          AND action != 'CREATE'
          AND diff_payload::text != '{}'
      `, [gdpIds]);
      assert.equal(nonNullDiffs.rows.length, 0, 'Aucune modification de valeur n\'a été enregistrée dans l\'audit log');
    });

    test('1.3 Les valeurs divergentes (21 002.0, 22 411.0, 23 298.0, 25 156.0, 4.1 %, 3.5 %) n\'ont jamais existé dans data_values', async () => {
      const res = await pool.query(`
        SELECT id, value_numeric FROM data_values
        WHERE value_numeric IN (21002.0, 22411.0, 23298.0, 25156.0, 4.1, 3.5)
          AND id BETWEEN 687 AND 710
      `);
      assert.equal(res.rows.length, 0, 'Les valeurs textuelles du rapport ne sont pas présentes dans PostgreSQL');
    });
  });

  describe('2. Réconciliation des identifiants documentaires dans data_publications', () => {
    test('2.1 Les identifiants réels des publications canoniques sont vérifiés', async () => {
      const res = await pool.query(`
        SELECT id, title, publisher_organization, publication_year, verification_status
        FROM data_publications
        WHERE id IN (1, 2, 4, 5, 6, 12, 72)
        ORDER BY id ASC
      `);

      const pubMap = {};
      res.rows.forEach(r => { pubMap[r.id] = r; });

      // ID #1: Annuaire Statistique du Cameroun — Édition 2023 (INS)
      assert.ok(pubMap[1].title.includes('Annuaire Statistique du Cameroun — Édition 2023'));
      assert.equal(pubMap[1].publication_year, 2024);

      // ID #2: Comptes Nationaux du Cameroun — Résultats définitifs 2021 et semi-définitifs 2022 (INS)
      assert.ok(pubMap[2].title.includes('Comptes Nationaux du Cameroun'));
      assert.equal(pubMap[2].publication_year, 2023);

      // ID #4: EESI 2 (INS)
      assert.ok(pubMap[4].title.includes('Deuxième Enquête sur l\'Emploi et le Secteur Informel (EESI 2)'));
      assert.equal(pubMap[4].publication_year, 2011);

      // ID #5: Commerce Extérieur (INS) — NON lié à l'éducation
      assert.ok(pubMap[5].title.includes('Commerce Extérieur'));

      // ID #6: ECAM 5 (INS)
      assert.ok(pubMap[6].title.includes('Cinquième Enquête Camerounaise auprès des Ménages (ECAM 5)'));

      // ID #12: Annuaire Statistique de l'Éducation de Base — Année scolaire 2022/2023 (MINEDUB)
      assert.ok(pubMap[12].title.includes('Annuaire Statistique de l\'Éducation de Base — Année scolaire 2022/2023'));
      assert.ok(pubMap[12].publisher_organization.includes('MINEDUB'));

      // ID #72: ECAM 4 (INS)
      assert.ok(pubMap[72].title.includes('Quatrième Enquête Camerounaise auprès des Ménages (ECAM 4)'));
    });

    test('2.2 L\'incohérence du rapport Lot 3E.3.1 (Annuaire INS ID 4 et MINEDUB ID 5) est démontrée comme une erreur de transcription', async () => {
      // Vérifier que Pub #4 n'est pas liée à EDU_PRIM_GROSS (ID 313)
      const link4 = await pool.query(
        'SELECT * FROM data_publication_indicators WHERE publication_id = 4 AND indicator_id = 313'
      );
      assert.equal(link4.rows.length, 0, 'La publication #4 (EESI 2) ne doit pas être liée à l\'éducation');

      // Vérifier que Pub #5 n'est pas liée à EDU_PRIM_GROSS (ID 313)
      const link5 = await pool.query(
        'SELECT * FROM data_publication_indicators WHERE publication_id = 5 AND indicator_id = 313'
      );
      assert.equal(link5.rows.length, 0, 'La publication #5 (Commerce Extérieur) ne doit pas être liée à l\'éducation');

      // Vérifier que les véritables liaisons d'EDU_PRIM_GROSS sont Pub #1 et Pub #12
      const correctLinks = await pool.query(
        'SELECT publication_id FROM data_publication_indicators WHERE indicator_id = 313 ORDER BY publication_id'
      );
      const linkedPubIds = correctLinks.rows.map(r => r.publication_id);
      assert.deepEqual(linkedPubIds, [1, 12], 'EDU_PRIM_GROSS doit être relié aux publications #1 et #12');
    });
  });

  describe('3. Vérification de l\'intégrité relationnelle de la Vague 1', () => {
    test('3.1 Aucune relation orpheline dans data_value_sources ni dans data_publication_indicators', async () => {
      const orphanDvs = await pool.query(`
        SELECT dvs.id FROM data_value_sources dvs
        LEFT JOIN data_values dv ON dvs.data_value_id = dv.id
        LEFT JOIN data_sources ds ON dvs.source_id = ds.id
        WHERE dv.id IS NULL OR ds.id IS NULL
      `);
      assert.equal(orphanDvs.rows.length, 0, 'Zéro orphelin dans data_value_sources');

      const orphanDpi = await pool.query(`
        SELECT dpi.publication_id FROM data_publication_indicators dpi
        LEFT JOIN data_publications dp ON dpi.publication_id = dp.id
        LEFT JOIN data_indicators di ON dpi.indicator_id = di.id
        WHERE dp.id IS NULL OR di.id IS NULL
      `);
      assert.equal(orphanDpi.rows.length, 0, 'Zéro orphelin dans data_publication_indicators');
    });

    test('3.2 Absence de doublons dans data_publication_indicators et data_publications', async () => {
      const dupDpi = await pool.query(`
        SELECT publication_id, indicator_id, COUNT(*)
        FROM data_publication_indicators
        GROUP BY publication_id, indicator_id
        HAVING COUNT(*) > 1
      `);
      assert.equal(dupDpi.rows.length, 0, 'Zéro doublon dans data_publication_indicators');

      const dupPubs = await pool.query(`
        SELECT LOWER(TRIM(title)) AS norm_title, COUNT(*)
        FROM data_publications
        GROUP BY LOWER(TRIM(title))
        HAVING COUNT(*) > 1
      `);
      assert.equal(dupPubs.rows.length, 0, 'Zéro doublon dans data_publications');
    });

    test('3.3 Contrôle des rattachements documentaires des 13 observations de la Vague 1', async () => {
      const res = await pool.query(`
        SELECT dv.id, di.code, dvs.source_id, ds.acronym, dvs.citation_reference
        FROM data_values dv
        JOIN data_indicators di ON di.id = dv.indicator_id
        JOIN data_value_sources dvs ON dvs.data_value_id = dv.id
        JOIN data_sources ds ON ds.id = dvs.source_id
        WHERE dv.id = ANY($1)
        ORDER BY dv.id ASC
      `, [wave1Ids]);

      assert.equal(res.rows.length, 13, 'Les 13 observations doivent avoir leur rattachement de source');

      // Observations PIB (#693-#696) et Croissance (#698-#701) -> INS (ID 324)
      res.rows.filter(r => [693, 694, 695, 696, 698, 699, 700, 701].includes(Number(r.id))).forEach(r => {
        assert.equal(Number(r.source_id), 324);
        assert.equal(r.acronym, 'INS');
        assert.ok(r.citation_reference.includes('Comptes Nationaux du Cameroun'));
      });

      // Observations TBS primaire #706-#709 -> INS (ID 324) Annuaire 2023
      res.rows.filter(r => [706, 707, 708, 709].includes(Number(r.id))).forEach(r => {
        assert.equal(Number(r.source_id), 324);
        assert.equal(r.acronym, 'INS');
        assert.ok(r.citation_reference.includes('Annuaire Statistique du Cameroun — Édition 2023'));
      });

      // Observation TBS primaire #710 -> MINEDUB (ID 330)
      const obs710 = res.rows.find(r => Number(r.id) === 710);
      assert.ok(obs710, 'Observation #710 doit être présente');
      assert.equal(Number(obs710.source_id), 330);
      assert.equal(obs710.acronym, 'MINEDUB');
      assert.ok(obs710.citation_reference.includes('Annuaire Statistique de l\'Éducation de Base — Année scolaire 2022/2023'));
    });
  });

  describe('4. Sanctuarisation absolue et non-altération du corpus', () => {
    test('4.1 Les 24 observations pilotes (#687 à #710) demeurent strictement draft, is_active=FALSE, audit_decision=pending', async () => {
      const res = await pool.query(`
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE editorial_status = 'draft' AND is_active = FALSE AND audit_decision = 'pending') AS valid_count
        FROM data_values
        WHERE id = ANY($1)
      `, [allPilotIds]);

      assert.equal(parseInt(res.rows[0].total, 10), 24);
      assert.equal(parseInt(res.rows[0].valid_count, 10), 24);
    });

    test('4.2 L\'observation historique #261 est rigoureusement intacte', async () => {
      const res = await pool.query(
        'SELECT id, indicator_id, value_numeric, period_start, editorial_status, is_active FROM data_values WHERE id = 261'
      );
      assert.equal(res.rows.length, 1);
      const row = res.rows[0];
      assert.equal(Number(row.id), 261);
      assert.equal(Number(row.indicator_id), 137);
      assert.equal(parseFloat(row.value_numeric), 29850.0);
      assert.equal(row.editorial_status, 'published');
      assert.equal(row.is_active, true);
    });
  });
});
