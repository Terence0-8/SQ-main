'use strict';

process.env.NODE_ENV = 'test';

const { describe, test, after } = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../backend/config/database');

describe('SOLITIQUO DATA — MIGRATION 3 VALIDATION SUITE (AUDIT & VERSIONS)', () => {
  async function createTestFixtures(suffix) {
    const uRes = await pool.query(
      "INSERT INTO users (username, email, password, role) VALUES ($1, $2, 'secret', 'admin') RETURNING id",
      [`user_mig3_${suffix}`, `user_mig3_${suffix}@solitiquo.cm`]
    );
    const userId = uRes.rows[0].id;

    const indRes = await pool.query(
      "INSERT INTO data_indicators (code, name, category, unit) VALUES ($1, 'Indicateur Mig3', 'politique', 'count') RETURNING id",
      [`IND_MIG3_${suffix}`]
    );
    const indicatorId = indRes.rows[0].id;

    const terRes = await pool.query("SELECT id FROM territories WHERE code = 'CMR'");
    const territoryId = terRes.rows[0].id;

    const srcRes = await pool.query(
      "INSERT INTO data_sources (name, institution_type) VALUES ($1, 'electoral_commission') RETURNING id",
      [`ELECAM Source ${suffix}`]
    );
    const sourceId = srcRes.rows[0].id;

    const pRes = await pool.query(
      "INSERT INTO parties (name, acronym) VALUES ($1, 'P3') RETURNING id",
      [`Parti Mig3 ${suffix}`]
    );
    const partyId = pRes.rows[0].id;

    const cRes = await pool.query(
      "INSERT INTO candidates (full_name) VALUES ($1) RETURNING id",
      [`Candidat Mig3 ${suffix}`]
    );
    const candidateId = cRes.rows[0].id;

    const dimCand = await pool.query("SELECT id FROM breakdown_dimensions WHERE code = 'CANDIDATE'");
    const itemCandRes = await pool.query(`
      INSERT INTO breakdown_items (dimension_id, code, label, candidate_id)
      VALUES ($1, $2, 'Candidat Item Mig3', $3) RETURNING id;
    `, [dimCand.rows[0].id, `ITEM_MIG3_${suffix}`, candidateId]);
    const breakdownItemId = itemCandRes.rows[0].id;

    return { userId, indicatorId, territoryId, sourceId, partyId, candidateId, breakdownItemId };
  }

  // ============================================================
  // 1. VÉRIFICATION DES TABLES D'AUDIT ET DE VERSIONS
  // ============================================================
  test('Les tables data_value_versions et data_value_audit_log sont créées', async () => {
    const res = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('data_value_versions', 'data_value_audit_log');
    `);
    const tables = res.rows.map(r => r.table_name);
    assert.ok(tables.includes('data_value_versions'));
    assert.ok(tables.includes('data_value_audit_log'));
  });

  // ============================================================
  // 2. SNAPSHOT AUTOMATIQUE LORS DE LA PUBLICATION ET COMPLÉTUDE
  // ============================================================
  test('Création automatique d\'un snapshot complet lors de la publication', async () => {
    const suffix = Date.now();
    const { userId, indicatorId, territoryId, sourceId, partyId, candidateId, breakdownItemId } = await createTestFixtures(suffix);

    let dataValueId;
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Créer l'observation en brouillon
        const vRes = await client.query(`
          INSERT INTO data_values (
            indicator_id, territory_id, period_type, period_start, period_end,
            value_numeric, methodology_nature, editorial_status, created_by,
            public_reason_summary, internal_notes
          ) VALUES (
            $1, $2, 'ANNUAL', '2024-01-01', '2024-12-31',
            1500000, 'census', 'draft', $3,
            'Publication initiale officielle', 'Contrôlé conforme'
          ) RETURNING id;
        `, [indicatorId, territoryId, userId]);
        dataValueId = vRes.rows[0].id;

        // Attacher une source primaire
        await client.query(`
          INSERT INTO data_value_sources (
            data_value_id, source_id, source_role, documentary_tier,
            citation_reference, created_by
          ) VALUES ($1, $2, 'primary', 'TIER_1_OFFICIAL', 'Décret officiel 2024/01', $3);
        `, [dataValueId, sourceId, userId]);

        // Attacher une ventilation
        await client.query(`
          INSERT INTO data_value_breakdowns (
            data_value_id, breakdown_item_id, value_numeric, percentage, rank, electoral_party_id
          ) VALUES ($1, $2, 950000, 63.333, 1, $3);
        `, [dataValueId, breakdownItemId, partyId]);

        // Publication
        await client.query(`
          UPDATE data_values 
          SET editorial_status = 'published', is_active = TRUE, published_by = $1, published_at = NOW()
          WHERE id = $2;
        `, [userId, dataValueId]);

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      // Vérifier la présence du snapshot généré par le trigger
      const snapRes = await pool.query(
        'SELECT * FROM data_value_versions WHERE data_value_id = $1',
        [dataValueId]
      );
      assert.equal(snapRes.rows.length, 1, 'Un snapshot doit avoir été généré');
      const snap = snapRes.rows[0];

      // Vérifier les champs de l'observation
      assert.equal(snap.revision_number, 1);
      assert.equal(parseFloat(snap.value_numeric), 1500000);
      assert.equal(snap.editorial_status, 'published');
      assert.equal(snap.period_type, 'ANNUAL');
      assert.equal(snap.public_reason_summary, 'Publication initiale officielle');

      // Vérifier la complétude des ventilations dénormalisées en JSONB
      assert.ok(Array.isArray(snap.breakdowns_snapshot));
      assert.equal(snap.breakdowns_snapshot.length, 1);
      const bSnap = snap.breakdowns_snapshot[0];
      assert.equal(bSnap.breakdown_item_id, breakdownItemId);
      assert.equal(parseFloat(bSnap.value_numeric), 950000);
      assert.equal(parseFloat(bSnap.percentage), 63.333);
      assert.equal(bSnap.electoral_party_id, partyId);
      assert.ok(bSnap.electoral_party_name.includes(`Parti Mig3 ${suffix}`));

      // Vérifier la complétude des sources dénormalisées en JSONB
      assert.ok(Array.isArray(snap.sources_snapshot));
      assert.equal(snap.sources_snapshot.length, 1);
      const sSnap = snap.sources_snapshot[0];
      assert.equal(sSnap.source_id, sourceId);
      assert.equal(sSnap.source_role, 'primary');
      assert.equal(sSnap.citation_reference, 'Décret officiel 2024/01');

    } finally {
      // Nettoyage sécurisé
      try {
        if (dataValueId) {
          await pool.query("UPDATE data_values SET editorial_status = 'draft', is_active = FALSE WHERE id = $1", [dataValueId]);
          await pool.query('DELETE FROM data_value_breakdowns WHERE data_value_id = $1', [dataValueId]);
          await pool.query('DELETE FROM data_value_sources WHERE data_value_id = $1', [dataValueId]);
          await pool.query('DELETE FROM data_values WHERE id = $1', [dataValueId]);
        }
        await pool.query('DELETE FROM breakdown_items WHERE id = $1', [breakdownItemId]);
        await pool.query('DELETE FROM candidates WHERE id = $1', [candidateId]);
        await pool.query('DELETE FROM parties WHERE id = $1', [partyId]);
        await pool.query('DELETE FROM data_sources WHERE id = $1', [sourceId]);
        await pool.query('DELETE FROM data_indicators WHERE id = $1', [indicatorId]);
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      } catch (err) {
        // En présence de la migration 3, une valeur publiée est archivée de manière immuable
      }
    }
  });

  // ============================================================
  // 3. RÉVISION PUBLIÉE : CONSERVATION DES SNAPSHOTS SUCCESSIFS
  // ============================================================
  test('Création d\'un nouveau snapshot lors d\'une révision et conservation des versions antérieures', async () => {
    const suffix = Date.now();
    const { userId, indicatorId, territoryId, sourceId, partyId, candidateId, breakdownItemId } = await createTestFixtures(suffix);

    let v1Id;
    let v2Id;
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Créer V1 publiée
        const v1 = await client.query(`
          INSERT INTO data_values (
            indicator_id, territory_id, period_type, period_start, period_end,
            value_numeric, methodology_nature, editorial_status, is_active, revision_number, created_by
          ) VALUES (
            $1, $2, 'ANNUAL', '2024-01-01', '2024-12-31',
            100, 'census', 'draft', FALSE, 1, $3
          ) RETURNING id;
        `, [indicatorId, territoryId, userId]);
        v1Id = v1.rows[0].id;

        await client.query(`
          INSERT INTO data_value_sources (
            data_value_id, source_id, source_role, documentary_tier,
            citation_reference, created_by
          ) VALUES ($1, $2, 'primary', 'TIER_1_OFFICIAL', 'Source V1', $3);
        `, [v1Id, sourceId, userId]);

        await client.query("UPDATE data_values SET editorial_status = 'published', is_active = TRUE WHERE id = $1", [v1Id]);

        await client.query('COMMIT');
      } finally {
        client.release();
      }

      // Réviser vers V2 dans une nouvelle transaction
      const client2 = await pool.connect();
      try {
        await client2.query('BEGIN');

        // V1 devient superseded
        await client2.query("UPDATE data_values SET editorial_status = 'superseded', is_active = FALSE WHERE id = $1", [v1Id]);

        // V2 créée
        const v2 = await client2.query(`
          INSERT INTO data_values (
            indicator_id, territory_id, period_type, period_start, period_end,
            value_numeric, methodology_nature, editorial_status, is_active,
            revision_number, supersedes_id, public_reason_summary, created_by
          ) VALUES (
            $1, $2, 'ANNUAL', '2024-01-01', '2024-12-31',
            105, 'census', 'draft', FALSE,
            2, $3, 'Ajustement officiel recensement V2', $4
          ) RETURNING id;
        `, [indicatorId, territoryId, v1Id, userId]);
        v2Id = v2.rows[0].id;

        await client2.query("UPDATE data_values SET superseded_by_id = $1 WHERE id = $2", [v2Id, v1Id]);

        await client2.query(`
          INSERT INTO data_value_sources (
            data_value_id, source_id, source_role, documentary_tier,
            citation_reference, created_by
          ) VALUES ($1, $2, 'primary', 'TIER_1_OFFICIAL', 'Source V2', $3);
        `, [v2Id, sourceId, userId]);

        await client2.query("UPDATE data_values SET editorial_status = 'published', is_active = TRUE WHERE id = $1", [v2Id]);

        await client2.query('COMMIT');
      } finally {
        client2.release();
      }

      // Vérifier les snapshots
      const s1 = await pool.query('SELECT * FROM data_value_versions WHERE data_value_id = $1', [v1Id]);
      const s2 = await pool.query('SELECT * FROM data_value_versions WHERE data_value_id = $1', [v2Id]);

      assert.equal(s1.rows.length, 1);
      assert.equal(s1.rows[0].revision_number, 1);
      assert.equal(parseFloat(s1.rows[0].value_numeric), 100);

      assert.equal(s2.rows.length, 1);
      assert.equal(s2.rows[0].revision_number, 2);
      assert.equal(parseFloat(s2.rows[0].value_numeric), 105);
      assert.equal(s2.rows[0].supersedes_id, v1Id);

    } finally {
      try {
        if (v1Id) {
          await pool.query("UPDATE data_values SET editorial_status = 'draft', is_active = FALSE WHERE id = $1", [v1Id]);
          await pool.query('DELETE FROM data_value_sources WHERE data_value_id = $1', [v1Id]);
          await pool.query('DELETE FROM data_values WHERE id = $1', [v1Id]);
        }
        if (v2Id) {
          await pool.query("UPDATE data_values SET editorial_status = 'draft', is_active = FALSE WHERE id = $1", [v2Id]);
          await pool.query('DELETE FROM data_value_sources WHERE data_value_id = $1', [v2Id]);
          await pool.query('DELETE FROM data_values WHERE id = $1', [v2Id]);
        }
        await pool.query('DELETE FROM breakdown_items WHERE id = $1', [breakdownItemId]);
        await pool.query('DELETE FROM candidates WHERE id = $1', [candidateId]);
        await pool.query('DELETE FROM parties WHERE id = $1', [partyId]);
        await pool.query('DELETE FROM data_sources WHERE id = $1', [sourceId]);
        await pool.query('DELETE FROM data_indicators WHERE id = $1', [indicatorId]);
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      } catch (err) {
        // En présence de la migration 3, les révisions publiées sont archivées de manière immuable
      }
    }
  });

  // ============================================================
  // 4. JOURNAL D'AUDIT AUTOMATIQUE (TRANSITIONS ET DIFFS)
  // ============================================================
  test('Le journal d\'audit enregistre automatiquement chaque étape du cycle de vie', async () => {
    const suffix = Date.now();
    const { userId, indicatorId, territoryId, sourceId } = await createTestFixtures(suffix);

    let dataValueId;
    try {
      // 1. CREATE
      const v = await pool.query(`
        INSERT INTO data_values (
          indicator_id, territory_id, period_type, period_start, period_end,
          value_numeric, methodology_nature, editorial_status, created_by
        ) VALUES (
          $1, $2, 'ANNUAL', '2024-01-01', '2024-12-31',
          200, 'sample_survey', 'draft', $3
        ) RETURNING id;
      `, [indicatorId, territoryId, userId]);
      dataValueId = v.rows[0].id;

      // 2. SUBMIT_REVIEW
      await pool.query("UPDATE data_values SET editorial_status = 'under_review' WHERE id = $1", [dataValueId]);

      // Attacher source pour valider
      await pool.query(`
        INSERT INTO data_value_sources (
          data_value_id, source_id, source_role, documentary_tier,
          citation_reference, created_by
        ) VALUES ($1, $2, 'primary', 'TIER_1_OFFICIAL', 'Ref audit', $3);
      `, [dataValueId, sourceId, userId]);

      // 3. VALIDATE_METHODOLOGY
      await pool.query("UPDATE data_values SET editorial_status = 'methodologically_validated' WHERE id = $1", [dataValueId]);

      // 4. PUBLISH
      await pool.query("UPDATE data_values SET editorial_status = 'published', is_active = TRUE WHERE id = $1", [dataValueId]);

      // 5. ARCHIVE
      await pool.query("UPDATE data_values SET editorial_status = 'archived', is_active = FALSE WHERE id = $1", [dataValueId]);

      // Vérifier les entrées d'audit générées
      const auditRes = await pool.query(
        'SELECT action, old_status, new_status FROM data_value_audit_log WHERE data_value_id = $1 ORDER BY id ASC',
        [dataValueId]
      );
      const actions = auditRes.rows.map(r => r.action);

      assert.ok(actions.includes('CREATE'), 'Action CREATE attendue');
      assert.ok(actions.includes('SUBMIT_REVIEW'), 'Action SUBMIT_REVIEW attendue');
      assert.ok(actions.includes('VALIDATE_METHODOLOGY'), 'Action VALIDATE_METHODOLOGY attendue');
      assert.ok(actions.includes('PUBLISH'), 'Action PUBLISH attendue');
      assert.ok(actions.includes('ARCHIVE'), 'Action ARCHIVE attendue');

    } finally {
      try {
        if (dataValueId) {
          await pool.query("UPDATE data_values SET editorial_status = 'draft', is_active = FALSE WHERE id = $1", [dataValueId]);
          await pool.query('DELETE FROM data_value_sources WHERE data_value_id = $1', [dataValueId]);
          await pool.query('DELETE FROM data_values WHERE id = $1', [dataValueId]);
        }
        await pool.query('DELETE FROM data_sources WHERE id = $1', [sourceId]);
        await pool.query('DELETE FROM data_indicators WHERE id = $1', [indicatorId]);
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      } catch (err) {
        // En présence de la migration 3, une valeur publiée est archivée de manière immuable
      }
    }
  });

  // ============================================================
  // 5. IMMUTABILITÉ TECHNIQUE (PROTECTION CONTRE MODIFICATION ET SUPPRESSION)
  // ============================================================
  test('Immutabilité : interdiction absolue d\'UPDATE et DELETE sur les tables d\'audit et de versions', async () => {
    // 1. Tenter un UPDATE sur data_value_audit_log -> DOIT ÉCHOUER
    await assert.rejects(async () => {
      await pool.query("UPDATE data_value_audit_log SET action = 'HACKED' WHERE id = (SELECT min(id) FROM data_value_audit_log)");
    }, /VIOLATION D'IMMUTABILITÉ/);

    // 2. Tenter un DELETE sur data_value_audit_log -> DOIT ÉCHOUER
    await assert.rejects(async () => {
      await pool.query("DELETE FROM data_value_audit_log WHERE id = (SELECT min(id) FROM data_value_audit_log)");
    }, /VIOLATION D'IMMUTABILITÉ/);

    // 3. Tenter un TRUNCATE sur data_value_audit_log -> DOIT ÉCHOUER
    await assert.rejects(async () => {
      await pool.query("TRUNCATE TABLE data_value_audit_log");
    }, /VIOLATION D'IMMUTABILITÉ/);

    // 4. Tenter un UPDATE sur data_value_versions -> DOIT ÉCHOUER
    await assert.rejects(async () => {
      await pool.query("UPDATE data_value_versions SET value_numeric = 0 WHERE id = (SELECT min(id) FROM data_value_versions)");
    }, /VIOLATION D'IMMUTABILITÉ/);

    // 5. Tenter un DELETE sur data_value_versions -> DOIT ÉCHOUER
    await assert.rejects(async () => {
      await pool.query("DELETE FROM data_value_versions WHERE id = (SELECT min(id) FROM data_value_versions)");
    }, /VIOLATION D'IMMUTABILITÉ/);

    // 6. Tenter un TRUNCATE sur data_value_versions -> DOIT ÉCHOUER
    await assert.rejects(async () => {
      await pool.query("TRUNCATE TABLE data_value_versions");
    }, /VIOLATION D'IMMUTABILITÉ/);
  });

  after(async () => {
    await pool.end();
  });
});
