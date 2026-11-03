'use strict';

process.env.NODE_ENV = 'test';

const { describe, test, after } = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../backend/config/database');

describe('SOLITIQUO DATA — MIGRATION 2 VALIDATION SUITE', () => {
  // Helper pour créer les dépendances nécessaires (user, indicator, territory, source)
  async function createTestFixtures(suffix) {
    const uRes = await pool.query(
      "INSERT INTO users (username, email, password, role) VALUES ($1, $2, 'secret', 'admin') RETURNING id",
      [`user_data_${suffix}`, `user_data_${suffix}@solitiquo.cm`]
    );
    const userId = uRes.rows[0].id;

    const indRes = await pool.query(
      "INSERT INTO data_indicators (code, name, category, unit) VALUES ($1, 'Indicateur Test', 'economie', 'percentage') RETURNING id",
      [`IND_${suffix}`]
    );
    const indicatorId = indRes.rows[0].id;

    // Récupérer le territoire Cameroun
    const terRes = await pool.query("SELECT id FROM territories WHERE code = 'CMR'");
    const territoryId = terRes.rows[0].id;

    const srcRes = await pool.query(
      "INSERT INTO data_sources (name, institution_type) VALUES ($1, 'national_statistical_office') RETURNING id",
      [`Source Test ${suffix}`]
    );
    const sourceId = srcRes.rows[0].id;

    return { userId, indicatorId, territoryId, sourceId };
  }

  // ============================================================
  // 1. PRÉSENCE DES CINQ TABLES
  // ============================================================
  test('Les cinq tables du cœur DATA et des imports sont présentes', async () => {
    const res = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('data_values', 'data_value_sources', 'data_value_breakdowns', 'import_batches', 'import_lines');
    `);
    const tables = res.rows.map(r => r.table_name);
    assert.ok(tables.includes('data_values'));
    assert.ok(tables.includes('data_value_sources'));
    assert.ok(tables.includes('data_value_breakdowns'));
    assert.ok(tables.includes('import_batches'));
    assert.ok(tables.includes('import_lines'));
  });

  // ============================================================
  // 2. CONTRAINTE DE VALEUR (NUMÉRIQUE, TEXTE, OU MISSING REASON)
  // ============================================================
  test('Contrainte de valeur : valeur numérique valide et cas ZÉRO', async () => {
    const suffix = Date.now();
    const { userId, indicatorId, territoryId } = await createTestFixtures(suffix);

    try {
      // Valeur standard
      const v1 = await pool.query(`
        INSERT INTO data_values (
          indicator_id, territory_id, period_type, period_start, period_end,
          value_numeric, methodology_nature, editorial_status, created_by
        ) VALUES (
          $1, $2, 'ANNUAL', '2024-01-01', '2024-12-31',
          45.75, 'sample_survey', 'draft', $3
        ) RETURNING id, value_numeric;
      `, [indicatorId, territoryId, userId]);
      assert.equal(parseFloat(v1.rows[0].value_numeric), 45.75);

      // Valeur zéro (doit être explicitement acceptée)
      const vZero = await pool.query(`
        INSERT INTO data_values (
          indicator_id, territory_id, period_type, period_start, period_end,
          value_numeric, methodology_nature, editorial_status, created_by
        ) VALUES (
          $1, $2, 'ANNUAL', '2023-01-01', '2023-12-31',
          0, 'sample_survey', 'draft', $3
        ) RETURNING id, value_numeric;
      `, [indicatorId, territoryId, userId]);
      assert.equal(parseFloat(vZero.rows[0].value_numeric), 0);

      // Valeur textuelle
      const vText = await pool.query(`
        INSERT INTO data_values (
          indicator_id, territory_id, period_type, period_start, period_end,
          value_text, methodology_nature, editorial_status, created_by
        ) VALUES (
          $1, $2, 'ANNUAL', '2022-01-01', '2022-12-31',
          'Régime présidentiel', 'administrative_record', 'draft', $3
        ) RETURNING id, value_text;
      `, [indicatorId, territoryId, userId]);
      assert.equal(vText.rows[0].value_text, 'Régime présidentiel');

      // Donnée manquante avec motif explicite (missing_reason)
      const vMissing = await pool.query(`
        INSERT INTO data_values (
          indicator_id, territory_id, period_type, period_start, period_end,
          missing_reason, methodology_nature, editorial_status, created_by
        ) VALUES (
          $1, $2, 'ANNUAL', '2021-01-01', '2021-12-31',
          'confidential', 'census', 'draft', $3
        ) RETURNING id, missing_reason;
      `, [indicatorId, territoryId, userId]);
      assert.equal(vMissing.rows[0].missing_reason, 'confidential');

      // REJET : ni valeur ni missing_reason
      await assert.rejects(async () => {
        await pool.query(`
          INSERT INTO data_values (
            indicator_id, territory_id, period_type, period_start, period_end,
            methodology_nature, editorial_status, created_by
          ) VALUES (
            $1, $2, 'ANNUAL', '2020-01-01', '2020-12-31',
            'census', 'draft', $3
          );
        `, [indicatorId, territoryId, userId]);
      }, /chk_data_values_value_or_missing|check_violation/i);

      // REJET : à la fois valeur numérique et textuelle
      await assert.rejects(async () => {
        await pool.query(`
          INSERT INTO data_values (
            indicator_id, territory_id, period_type, period_start, period_end,
            value_numeric, value_text, methodology_nature, editorial_status, created_by
          ) VALUES (
            $1, $2, 'ANNUAL', '2019-01-01', '2019-12-31',
            10, 'Texte', 'census', 'draft', $3
          );
        `, [indicatorId, territoryId, userId]);
      }, /chk_data_values_value_or_missing|check_violation/i);

    } finally {
      try {
        await pool.query('DELETE FROM data_values WHERE indicator_id = $1', [indicatorId]);
        await pool.query('DELETE FROM data_indicators WHERE id = $1', [indicatorId]);
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      } catch (err) {
        // En présence de la migration 3, l'utilisateur est référencé dans data_value_audit_log (ON DELETE RESTRICT)
      }
    }
  });

  // ============================================================
  // 3. COHÉRENCE CALENDAIRE
  // ============================================================
  test('Cohérence calendaire : contrôle strict par type de période', async () => {
    const suffix = Date.now();
    const { userId, indicatorId, territoryId } = await createTestFixtures(suffix);

    try {
      // Rejet ANNUAL non conforme (ne commence pas le 1er janvier)
      await assert.rejects(async () => {
        await pool.query(`
          INSERT INTO data_values (
            indicator_id, territory_id, period_type, period_start, period_end,
            value_numeric, methodology_nature, created_by
          ) VALUES (
            $1, $2, 'ANNUAL', '2024-02-01', '2024-12-31',
            10, 'sample_survey', $3
          );
        `, [indicatorId, territoryId, userId]);
      }, /chk_period_consistency|check_violation/i);

      // Rejet MONTHLY non conforme (ne termine pas au dernier jour du mois)
      await assert.rejects(async () => {
        await pool.query(`
          INSERT INTO data_values (
            indicator_id, territory_id, period_type, period_start, period_end,
            value_numeric, methodology_nature, created_by
          ) VALUES (
            $1, $2, 'MONTHLY', '2024-02-01', '2024-02-28', -- 2024 est bissextile (29 jours)
            10, 'sample_survey', $3
          );
        `, [indicatorId, territoryId, userId]);
      }, /chk_period_consistency|check_violation/i);

      // Succès MONTHLY bissextile valide
      const mOk = await pool.query(`
        INSERT INTO data_values (
          indicator_id, territory_id, period_type, period_start, period_end,
          value_numeric, methodology_nature, created_by
        ) VALUES (
          $1, $2, 'MONTHLY', '2024-02-01', '2024-02-29',
          15, 'sample_survey', $3
        ) RETURNING id;
      `, [indicatorId, territoryId, userId]);
      assert.ok(mOk.rows[0].id > 0);

      // Succès DAILY valide (start == end)
      const dOk = await pool.query(`
        INSERT INTO data_values (
          indicator_id, territory_id, period_type, period_start, period_end,
          value_numeric, methodology_nature, created_by
        ) VALUES (
          $1, $2, 'DAILY', '2024-10-12', '2024-10-12',
          100, 'administrative_record', $3
        ) RETURNING id;
      `, [indicatorId, territoryId, userId]);
      assert.ok(dOk.rows[0].id > 0);

      // Rejet DAILY invalide (start != end)
      await assert.rejects(async () => {
        await pool.query(`
          INSERT INTO data_values (
            indicator_id, territory_id, period_type, period_start, period_end,
            value_numeric, methodology_nature, created_by
          ) VALUES (
            $1, $2, 'DAILY', '2024-10-12', '2024-10-13',
            100, 'administrative_record', $3
          );
        `, [indicatorId, territoryId, userId]);
      }, /chk_period_consistency|check_violation/i);

    } finally {
      try {
        await pool.query('DELETE FROM data_values WHERE indicator_id = $1', [indicatorId]);
        await pool.query('DELETE FROM data_indicators WHERE id = $1', [indicatorId]);
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      } catch (err) {
        // En présence de la migration 3, l'utilisateur est référencé dans data_value_audit_log (ON DELETE RESTRICT)
      }
    }
  });

  // ============================================================
  // 4. MULTI-SOURÇAGE ET PROTECTION DE LA SOURCE PRINCIPALE
  // ============================================================
  test('Multi-sourçage et protection transactionnelle de la source principale', async () => {
    const suffix = Date.now();
    const { userId, indicatorId, territoryId, sourceId } = await createTestFixtures(suffix);

    // Créer une 2ème source pour corroboration
    const s2Res = await pool.query(
      "INSERT INTO data_sources (name, institution_type) VALUES ($1, 'academic_institute') RETURNING id",
      [`Univ Yaounde ${suffix}`]
    );
    const source2Id = s2Res.rows[0].id;

    try {
      // 1. Créer une valeur en draft
      const valRes = await pool.query(`
        INSERT INTO data_values (
          indicator_id, territory_id, period_type, period_start, period_end,
          value_numeric, methodology_nature, editorial_status, created_by
        ) VALUES (
          $1, $2, 'ANNUAL', '2024-01-01', '2024-12-31',
          55.2, 'census', 'draft', $3
        ) RETURNING id;
      `, [indicatorId, territoryId, userId]);
      const dataValueId = valRes.rows[0].id;

      // 2. Tenter de la passer en 'methodologically_validated' sans source primaire -> REJET
      await assert.rejects(async () => {
        await pool.query(
          "UPDATE data_values SET editorial_status = 'methodologically_validated' WHERE id = $1",
          [dataValueId]
        );
      }, /VIOLATION DOCUMENTAIRE/);

      // 3. Attacher une source avec rôle 'corroboration' uniquement -> Toujours REJET
      await pool.query(`
        INSERT INTO data_value_sources (
          data_value_id, source_id, source_role, documentary_tier,
          citation_reference, created_by
        ) VALUES (
          $1, $2, 'corroboration', 'TIER_3_ACADEMIC_PEER',
          'Étude comparative p. 45', $3
        );
      `, [dataValueId, source2Id, userId]);

      await assert.rejects(async () => {
        await pool.query(
          "UPDATE data_values SET editorial_status = 'methodologically_validated' WHERE id = $1",
          [dataValueId]
        );
      }, /VIOLATION DOCUMENTAIRE/);

      // 4. Attacher une source avec rôle 'primary' -> Validation et publication permises !
      const primarySource = await pool.query(`
        INSERT INTO data_value_sources (
          data_value_id, source_id, source_role, documentary_tier,
          citation_reference, created_by
        ) VALUES (
          $1, $2, 'primary', 'TIER_1_OFFICIAL',
          'Rapport officiel INS 2024, Tab. 2', $3
        ) RETURNING id;
      `, [dataValueId, sourceId, userId]);
      const primarySourceId = primarySource.rows[0].id;

      // La validation fonctionne désormais
      await pool.query(
        "UPDATE data_values SET editorial_status = 'published', is_active = TRUE WHERE id = $1",
        [dataValueId]
      );

      // 5. Tenter de supprimer la source principale de la valeur publiée -> REJET PAR TRIGGER
      await assert.rejects(async () => {
        await pool.query("DELETE FROM data_value_sources WHERE id = $1", [primarySourceId]);
      }, /INTERDICTION.*dernière source principale/);

      // 6. Tenter de rétrograder son rôle en 'methodology' -> REJET PAR TRIGGER
      await assert.rejects(async () => {
        await pool.query("UPDATE data_value_sources SET source_role = 'methodology' WHERE id = $1", [primarySourceId]);
      }, /INTERDICTION.*dernière source principale/);

      // En revanche, supprimer la source de corroboration fonctionne sans problème
      await pool.query("DELETE FROM data_value_sources WHERE source_id = $1", [source2Id]);

    } finally {
      try {
        await pool.query("UPDATE data_values SET editorial_status = 'draft', is_active = FALSE WHERE indicator_id = $1", [indicatorId]);
        await pool.query('DELETE FROM data_value_sources WHERE data_value_id IN (SELECT id FROM data_values WHERE indicator_id = $1)', [indicatorId]);
        await pool.query('DELETE FROM data_values WHERE indicator_id = $1', [indicatorId]);
        await pool.query('DELETE FROM data_sources WHERE id IN ($1, $2)', [sourceId, source2Id]);
        await pool.query('DELETE FROM data_indicators WHERE id = $1', [indicatorId]);
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      } catch (err) {
        // En présence de la migration 3, une valeur publiée est snapshotée de façon immuable
      }
    }
  });

  // ============================================================
  // 5. VENTILATIONS ET COHÉRENCE POLITIQUE
  // ============================================================
  test('Ventilations : non-duplication et cohérence du rattachement électoral', async () => {
    const suffix = Date.now();
    const { userId, indicatorId, territoryId } = await createTestFixtures(suffix);

    // Créer un parti et un candidat
    const pRes = await pool.query(
      "INSERT INTO parties (name, acronym) VALUES ($1, 'PTEST') RETURNING id",
      [`Parti Breakdown ${suffix}`]
    );
    const partyId = pRes.rows[0].id;

    const cRes = await pool.query(
      "INSERT INTO candidates (full_name) VALUES ($1) RETURNING id",
      [`Candidat Breakdown ${suffix}`]
    );
    const candidateId = cRes.rows[0].id;

    // Récupérer dimensions et items
    const dimCand = await pool.query("SELECT id FROM breakdown_dimensions WHERE code = 'CANDIDATE'");
    const dimEco = await pool.query("SELECT id FROM breakdown_dimensions WHERE code = 'ECO_SECTOR'");

    // Item candidat
    const itemCandRes = await pool.query(`
      INSERT INTO breakdown_items (dimension_id, code, label, candidate_id)
      VALUES ($1, $2, 'Candidat Item', $3) RETURNING id;
    `, [dimCand.rows[0].id, `ITEM_CAND_${suffix}`, candidateId]);
    const itemCandidateId = itemCandRes.rows[0].id;

    // Item secteur économique
    const itemEcoRes = await pool.query(`
      INSERT INTO breakdown_items (dimension_id, code, label)
      VALUES ($1, $2, 'Secteur Agri') RETURNING id;
    `, [dimEco.rows[0].id, `ITEM_ECO_${suffix}`]);
    const itemEcoId = itemEcoRes.rows[0].id;

    try {
      const valRes = await pool.query(`
        INSERT INTO data_values (
          indicator_id, territory_id, period_type, period_start, period_end,
          value_numeric, methodology_nature, created_by
        ) VALUES (
          $1, $2, 'ANNUAL', '2024-01-01', '2024-12-31',
          100, 'census', $3
        ) RETURNING id;
      `, [indicatorId, territoryId, userId]);
      const dataValueId = valRes.rows[0].id;

      // 1. Ventilation candidat avec affiliation électorale explicite -> Succès
      const b1 = await pool.query(`
        INSERT INTO data_value_breakdowns (
          data_value_id, breakdown_item_id, value_numeric, percentage, rank, electoral_party_id
        ) VALUES (
          $1, $2, 45, 45.0, 1, $3
        ) RETURNING id;
      `, [dataValueId, itemCandidateId, partyId]);
      assert.ok(b1.rows[0].id > 0);

      // 2. REJET DOUBLON : même valeur et même item de ventilation
      await assert.rejects(async () => {
        await pool.query(`
          INSERT INTO data_value_breakdowns (
            data_value_id, breakdown_item_id, value_numeric
          ) VALUES ($1, $2, 50);
        `, [dataValueId, itemCandidateId]);
      }, /uq_data_value_breakdown_item|unique/i);

      // 3. REJET INCOHÉRENCE POLITIQUE : tenter d'assigner electoral_party_id à un item économique
      await assert.rejects(async () => {
        await pool.query(`
          INSERT INTO data_value_breakdowns (
            data_value_id, breakdown_item_id, value_numeric, electoral_party_id
          ) VALUES ($1, $2, 30, $3);
        `, [dataValueId, itemEcoId, partyId]);
      }, /INCOHÉRENCE DE VENTILATION/);

      // 4. Succès de ventilation économique sans affiliation électorale
      const bEco = await pool.query(`
        INSERT INTO data_value_breakdowns (
          data_value_id, breakdown_item_id, value_numeric, percentage
        ) VALUES ($1, $2, 30, 30.0) RETURNING id;
      `, [dataValueId, itemEcoId]);
      assert.ok(bEco.rows[0].id > 0);

    } finally {
      try {
        await pool.query('DELETE FROM data_value_breakdowns WHERE data_value_id IN (SELECT id FROM data_values WHERE indicator_id = $1)', [indicatorId]);
        await pool.query('DELETE FROM data_values WHERE indicator_id = $1', [indicatorId]);
        await pool.query('DELETE FROM breakdown_items WHERE id IN ($1, $2)', [itemCandidateId, itemEcoId]);
        await pool.query('DELETE FROM candidates WHERE id = $1', [candidateId]);
        await pool.query('DELETE FROM parties WHERE id = $1', [partyId]);
        await pool.query('DELETE FROM data_indicators WHERE id = $1', [indicatorId]);
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      } catch (err) {
        // En présence de la migration 3, l'utilisateur est référencé dans data_value_audit_log (ON DELETE RESTRICT)
      }
    }
  });

  // ============================================================
  // 6. RÉVISIONS ET PROTECTION CONTRE L'ÉCRASEMENT D'UNE VALEUR PUBLIÉE
  // ============================================================
  test('Protection contre écrasement sur place et révision sans conflit d\'unicité', async () => {
    const suffix = Date.now();
    const { userId, indicatorId, territoryId, sourceId } = await createTestFixtures(suffix);

    try {
      // 1. Créer V1 publiée et active avec sa source principale
      const v1Res = await pool.query(`
        INSERT INTO data_values (
          indicator_id, territory_id, period_type, period_start, period_end,
          value_numeric, methodology_nature, editorial_status, is_active, revision_number, created_by
        ) VALUES (
          $1, $2, 'ANNUAL', '2024-01-01', '2024-12-31',
          10.5, 'sample_survey', 'draft', FALSE, 1, $3
        ) RETURNING id;
      `, [indicatorId, territoryId, userId]);
      const v1Id = v1Res.rows[0].id;

      await pool.query(`
        INSERT INTO data_value_sources (
          data_value_id, source_id, source_role, documentary_tier,
          citation_reference, created_by
        ) VALUES ($1, $2, 'primary', 'TIER_1_OFFICIAL', 'Ref V1', $3);
      `, [v1Id, sourceId, userId]);

      await pool.query(
        "UPDATE data_values SET editorial_status = 'published', is_active = TRUE WHERE id = $1",
        [v1Id]
      );

      // 2. REJET : tenter de modifier directement la valeur numérique de V1
      await assert.rejects(async () => {
        await pool.query("UPDATE data_values SET value_numeric = 99.9 WHERE id = $1", [v1Id]);
      }, /INTERDICTION D'ÉCRASEMENT/);

      // 3. REJET : tenter d'insérer une 2e valeur active sur le même quadruplet sans désactiver V1
      await assert.rejects(async () => {
        await pool.query(`
          INSERT INTO data_values (
            indicator_id, territory_id, period_type, period_start, period_end,
            value_numeric, methodology_nature, editorial_status, is_active, created_by
          ) VALUES (
            $1, $2, 'ANNUAL', '2024-01-01', '2024-12-31',
            12.0, 'sample_survey', 'published', TRUE, $3
          );
        `, [indicatorId, territoryId, userId]);
      }, /uq_data_values_published_active|unique/i);

      // 4. Procédure légitime de révision : transaction atomique
      const client = await pool.connect();
      let v2Id;
      try {
        await client.query('BEGIN');

        // Bascule de V1 vers 'superseded'
        await client.query(
          "UPDATE data_values SET editorial_status = 'superseded', is_active = FALSE WHERE id = $1",
          [v1Id]
        );

        // Insertion de V2
        const v2Res = await client.query(`
          INSERT INTO data_values (
            indicator_id, territory_id, period_type, period_start, period_end,
            value_numeric, methodology_nature, editorial_status, is_active,
            revision_number, supersedes_id, public_reason_summary, created_by
          ) VALUES (
            $1, $2, 'ANNUAL', '2024-01-01', '2024-12-31',
            11.2, 'sample_survey', 'draft', FALSE,
            2, $3, 'Correction officielle des comptes', $4
          ) RETURNING id;
        `, [indicatorId, territoryId, v1Id, userId]);
        v2Id = v2Res.rows[0].id;

        // Chaînage inverse sur V1
        await client.query("UPDATE data_values SET superseded_by_id = $1 WHERE id = $2", [v2Id, v1Id]);

        // Source primaire pour V2
        await client.query(`
          INSERT INTO data_value_sources (
            data_value_id, source_id, source_role, documentary_tier,
            citation_reference, created_by
          ) VALUES ($1, $2, 'primary', 'TIER_1_OFFICIAL', 'Ref V2 révisée', $3);
        `, [v2Id, sourceId, userId]);

        // Publication de V2
        await client.query("UPDATE data_values SET editorial_status = 'published', is_active = TRUE WHERE id = $1", [v2Id]);

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      // Vérifier le succès du chaînage
      const checkV1 = await pool.query('SELECT editorial_status, is_active, superseded_by_id FROM data_values WHERE id = $1', [v1Id]);
      const checkV2 = await pool.query('SELECT editorial_status, is_active, supersedes_id, revision_number FROM data_values WHERE id = $1', [v2Id]);

      assert.equal(checkV1.rows[0].editorial_status, 'superseded');
      assert.equal(checkV1.rows[0].is_active, false);
      assert.equal(checkV1.rows[0].superseded_by_id, v2Id);

      assert.equal(checkV2.rows[0].editorial_status, 'published');
      assert.equal(checkV2.rows[0].is_active, true);
      assert.equal(checkV2.rows[0].supersedes_id, v1Id);
      assert.equal(checkV2.rows[0].revision_number, 2);

    } finally {
      try {
        await pool.query("UPDATE data_values SET editorial_status = 'draft', is_active = FALSE WHERE indicator_id = $1", [indicatorId]);
        await pool.query('DELETE FROM data_value_sources WHERE data_value_id IN (SELECT id FROM data_values WHERE indicator_id = $1)', [indicatorId]);
        await pool.query('DELETE FROM data_values WHERE indicator_id = $1', [indicatorId]);
        await pool.query('DELETE FROM data_sources WHERE id = $1', [sourceId]);
        await pool.query('DELETE FROM data_indicators WHERE id = $1', [indicatorId]);
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      } catch (err) {
        // En présence de la migration 3, les révisions publiées sont archivées de manière immuable
      }
    }
  });

  // ============================================================
  // 7. SUIVI DES IMPORTS (BATCHES ET LINES)
  // ============================================================
  test('Structures d\'importation : cycle de vie du lot et stockage des lignes brutes', async () => {
    const suffix = Date.now();
    const { userId } = await createTestFixtures(suffix);

    let batchId;
    try {
      const bRes = await pool.query(`
        INSERT INTO import_batches (
          file_name, file_size_bytes, mime_type, sha256_checksum,
          total_lines, valid_lines, error_lines, status, uploaded_by
        ) VALUES (
          'donnees_ins_2024.csv', 1048576, 'text/csv',
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          2, 1, 1, 'validating', $1
        ) RETURNING id;
      `, [userId]);
      batchId = bRes.rows[0].id;
      assert.ok(batchId > 0);

      // Ligne 1 : Valide
      const l1 = await pool.query(`
        INSERT INTO import_lines (batch_id, line_number, raw_payload, status)
        VALUES ($1, 1, '{"code": "POP", "valeur": 25000000}'::jsonb, 'valid')
        RETURNING id;
      `, [batchId]);
      assert.ok(l1.rows[0].id > 0);

      // Ligne 2 : En erreur avec message explicatif
      const l2 = await pool.query(`
        INSERT INTO import_lines (batch_id, line_number, raw_payload, status, error_message)
        VALUES ($1, 2, '{"code": "INVALIDE", "valeur": "ABC"}'::jsonb, 'error', 'Format numérique attendu')
        RETURNING id, error_message;
      `, [batchId]);
      assert.equal(l2.rows[0].error_message, 'Format numérique attendu');

      // REJET : doublon de ligne sur le même lot
      await assert.rejects(async () => {
        await pool.query(`
          INSERT INTO import_lines (batch_id, line_number, raw_payload)
          VALUES ($1, 1, '{"doublon": true}'::jsonb);
        `, [batchId]);
      }, /uq_import_line_batch_number|unique/i);

    } finally {
      if (batchId) {
        await pool.query('DELETE FROM import_lines WHERE batch_id = $1', [batchId]);
        await pool.query('DELETE FROM import_batches WHERE id = $1', [batchId]);
      }
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    }
  });

  after(async () => {
    await pool.end();
  });
});
