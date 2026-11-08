/**
 * =============================================================================
 * SOLITIQUO DATA — LOT 3E.3
 * SUITE DE TESTS : PREMIÈRE CAMPAGNE DE VALIDATION HUMAINE CONTRÔLÉE (VAGUE 1)
 * =============================================================================
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../server');
const pool = require('../backend/config/database');

describe('SOLITIQUO DATA — LOT 3E.3 : VALIDATION HUMAINE CONTRÔLÉE (VAGUE 1)', () => {
  const suffix = Date.now().toString().slice(-6);
  const rawPassword = 'Password123*';
  let adminUser;
  let writerUser;
  let readerUser;
  let adminAgent;
  let adminCsrf;
  let writerAgent;
  let writerCsrf;
  let readerAgent;
  let readerCsrf;

  // 13 observations pilotes de la Vague 1
  const wave1Ids = [693, 694, 695, 696, 698, 699, 700, 701, 706, 707, 708, 709, 710];
  const gdpNominalIds = [693, 694, 695, 696];
  const gdpGrowthIds = [698, 699, 700, 701];
  const tbsPrimaryIds = [706, 707, 708, 709, 710];

  // 11 observations restantes (Vagues 2 et 3)
  const otherPilotIds = [687, 688, 689, 690, 691, 692, 697, 702, 703, 704, 705];

  const testIsoValues = [];

  before(async () => {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(rawPassword, salt);

    // 1. Admin
    const uAdmin = await pool.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'admin', TRUE) RETURNING id, username, email, role
    `, [`adm_lot3e3_${suffix}`, `adm_lot3e3_${suffix}@solitiquo.cm`, hashedPassword]);
    adminUser = uAdmin.rows[0];

    // 2. Writer
    const uWriter = await pool.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'writer', TRUE) RETURNING id, username, email, role
    `, [`wri_lot3e3_${suffix}`, `wri_lot3e3_${suffix}@solitiquo.cm`, hashedPassword]);
    writerUser = uWriter.rows[0];

    // 3. Reader
    const uReader = await pool.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'reader', TRUE) RETURNING id, username, email, role
    `, [`rdr_lot3e3_${suffix}`, `rdr_lot3e3_${suffix}@solitiquo.cm`, hashedPassword]);
    readerUser = uReader.rows[0];

    // Agents & Sessions
    adminAgent = request.agent(app);
    await adminAgent.post('/api/auth/login').send({ email: adminUser.email, password: rawPassword }).expect(200);
    const csrfAdminRes = await adminAgent.get('/api/csrf-token');
    adminCsrf = csrfAdminRes.body.csrfToken;

    writerAgent = request.agent(app);
    await writerAgent.post('/api/auth/login').send({ email: writerUser.email, password: rawPassword }).expect(200);
    const csrfWriterRes = await writerAgent.get('/api/csrf-token');
    writerCsrf = csrfWriterRes.body.csrfToken;

    readerAgent = request.agent(app);
    await readerAgent.post('/api/auth/login').send({ email: readerUser.email, password: rawPassword }).expect(200);
    const csrfReaderRes = await readerAgent.get('/api/csrf-token');
    readerCsrf = csrfReaderRes.body.csrfToken;
  });

  after(async () => {
    // Nettoyage des observations de test isolées
    if (testIsoValues.length > 0) {
      try {
        await pool.query("UPDATE data_values SET is_active = FALSE, editorial_status = 'draft' WHERE id = ANY($1)", [testIsoValues]);
        await pool.query('DELETE FROM data_value_sources WHERE data_value_id = ANY($1)', [testIsoValues]);
        await pool.query(`
          DELETE FROM data_values 
          WHERE id = ANY($1) 
            AND id NOT IN (SELECT DISTINCT data_value_id FROM data_value_versions)
            AND id NOT IN (SELECT DISTINCT data_value_id FROM data_value_audit_log);
        `, [testIsoValues]);
      } catch (err) {
        console.warn('Nettoyage testIsoValues Lot 3E.3:', err.message);
      }
    }

    // Nettoyage des utilisateurs de test
    const userIds = [adminUser?.id, writerUser?.id, readerUser?.id].filter(Boolean);
    if (userIds.length > 0) {
      try {
        await pool.query('DELETE FROM users WHERE id = ANY($1)', [userIds]);
      } catch (err) {
        if (err.code !== '23001') console.warn('Nettoyage users Lot 3E.3:', err.message);
      }
    }
  });

  // ===========================================================================
  // SECTION 1 : PÉRIMÈTRE ET CONTRÔLE PRÉALABLE DES PREUVES DE LA VAGUE 1
  // ===========================================================================
  describe('1. Périmètre strict et contrôle préalable des preuves (13 observations)', () => {
    test('1.1 Le filtre de file d\'attente ?wave=wave1 renvoie exactement les 13 observations cibles', async () => {
      const res = await adminAgent
        .get('/api/data/admin/values?wave=wave1')
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.length, 13, 'Exactement 13 observations en Vague 1');

      const returnedIds = res.body.data.map(v => parseInt(v.id, 10)).sort((a, b) => a - b);
      assert.deepStrictEqual(returnedIds, wave1Ids.slice().sort((a, b) => a - b));
    });

    test('1.2 Les 4 dossiers du PIB nominal 2018-2021 (#693-#696) présentent toutes leurs preuves et recommandent pending_evidence', async () => {
      for (const id of gdpNominalIds) {
        const res = await adminAgent
          .get(`/api/data/admin/values/${id}`)
          .expect(200);

        const obs = res.body.data;
        assert.strictEqual(obs.indicator_code, 'ECO_PIB_NOM');
        assert.strictEqual(obs.indicator_unit, 'milliards_fcfa');
        assert.ok(obs.value_numeric > 20000 && obs.value_numeric < 30000, `Valeur PIB nominal réaliste : ${obs.value_numeric}`);
        assert.strictEqual(obs.methodology_nature, 'administrative_record');

        // Preuves documentaires
        assert.ok(Array.isArray(obs.sources) && obs.sources.length >= 1);
        const primSource = obs.sources.find(s => s.source_role === 'primary');
        assert.strictEqual(primSource.source_acronym, 'INS');
        assert.strictEqual(primSource.documentary_tier, 'TIER_1_OFFICIAL');
        assert.strictEqual(primSource.methodological_robustness, 'high');
        assert.ok(primSource.citation_reference.includes('Tableau 1, p. 12'));

        // Évaluation des preuves Lot 3E.3
        const evEval = obs.evidence_evaluation;
        assert.ok(evEval, 'evidence_evaluation doit être présent');
        assert.strictEqual(evEval.is_pdf_archived, false, 'Le PDF Comptes Nationaux n\'est pas archivé localement');
        assert.strictEqual(evEval.document_status, 'institutional_reference_only');
        assert.strictEqual(evEval.proposed_decision, 'pending_evidence', 'Proposition pending_evidence');

        // 4 statuts distincts
        assert.strictEqual(evEval.distinct_statuses.audit_decision, 'pending');
        assert.strictEqual(evEval.distinct_statuses.editorial_status, 'draft');
        assert.strictEqual(evEval.distinct_statuses.document_status, 'institutional_reference_only');
        assert.strictEqual(evEval.distinct_statuses.methodological_robustness, 'high');
      }
    });

    test('1.3 Les 4 dossiers de Croissance du PIB 2018-2021 (#698-#701) présentent toutes leurs preuves et recommandent pending_evidence', async () => {
      for (const id of gdpGrowthIds) {
        const res = await adminAgent
          .get(`/api/data/admin/values/${id}`)
          .expect(200);

        const obs = res.body.data;
        assert.strictEqual(obs.indicator_code, 'ECO_PIB_GROWTH');
        assert.strictEqual(obs.indicator_unit, 'pourcentage');
        assert.ok(obs.value_numeric >= 0 && obs.value_numeric <= 10, `Croissance réaliste : ${obs.value_numeric}`);
        assert.strictEqual(obs.methodology_nature, 'administrative_record');

        // Source primaire
        const primSource = obs.sources.find(s => s.source_role === 'primary');
        assert.strictEqual(primSource.source_acronym, 'INS');
        assert.strictEqual(primSource.documentary_tier, 'TIER_1_OFFICIAL');
        assert.strictEqual(primSource.methodological_robustness, 'high');
        assert.ok(primSource.citation_reference.includes('Tableau 2, p. 14'));

        // Évaluation des preuves Lot 3E.3
        const evEval = obs.evidence_evaluation;
        assert.ok(evEval);
        assert.strictEqual(evEval.is_pdf_archived, false);
        assert.strictEqual(evEval.document_status, 'institutional_reference_only');
        assert.strictEqual(evEval.proposed_decision, 'pending_evidence');

        // 4 statuts distincts
        assert.strictEqual(evEval.distinct_statuses.audit_decision, 'pending');
        assert.strictEqual(evEval.distinct_statuses.editorial_status, 'draft');
        assert.strictEqual(evEval.distinct_statuses.document_status, 'institutional_reference_only');
        assert.strictEqual(evEval.distinct_statuses.methodological_robustness, 'high');
      }
    });

    test('1.4 Les 5 dossiers du TBS primaire (#706-#710) présentent toutes leurs preuves, années scolaires et recommandent pending_evidence', async () => {
      for (const id of tbsPrimaryIds) {
        const res = await adminAgent
          .get(`/api/data/admin/values/${id}`)
          .expect(200);

        const obs = res.body.data;
        assert.strictEqual(obs.indicator_code, 'EDU_PRIM_GROSS');
        assert.strictEqual(obs.indicator_unit, 'pourcentage');
        assert.ok(obs.value_numeric > 100, `TBS excède 100 % (explication documentée) : ${obs.value_numeric}`);
        assert.ok(obs.school_year, 'Année scolaire obligatoire présente');

        // Sources primaires (INS pour #706-#709, MINEDUB pour #710)
        const primSource = obs.sources.find(s => s.source_role === 'primary');
        assert.strictEqual(primSource.documentary_tier, 'TIER_1_OFFICIAL');
        assert.strictEqual(primSource.methodological_robustness, 'medium');

        if (id === 710) {
          assert.strictEqual(primSource.source_acronym, 'MINEDUB');
          assert.ok(primSource.citation_reference.includes('Tableau 3.4, p. 45'));
        } else {
          assert.strictEqual(primSource.source_acronym, 'INS');
          assert.ok(primSource.citation_reference.includes('Tableau 4.3, p. 76'));
        }

        // Évaluation des preuves Lot 3E.3
        const evEval = obs.evidence_evaluation;
        assert.ok(evEval);
        assert.strictEqual(evEval.is_pdf_archived, false);
        assert.strictEqual(evEval.document_status, 'unavailable');
        assert.strictEqual(evEval.proposed_decision, 'pending_evidence');

        // 4 statuts distincts
        assert.strictEqual(evEval.distinct_statuses.audit_decision, 'pending');
        assert.strictEqual(evEval.distinct_statuses.editorial_status, 'draft');
        assert.strictEqual(evEval.distinct_statuses.document_status, 'unavailable');
        assert.strictEqual(evEval.distinct_statuses.methodological_robustness, 'medium');
      }
    });
  });

  // ===========================================================================
  // SECTION 2 : CONTRÔLE D'ACCÈS RBAC ET ARBITRAGE DES 4 DÉCISIONS
  // ===========================================================================
  describe('2. Contrôle RBAC, 4 décisions d\'arbitrage et motifs obligatoires', () => {
    let testObsId;

    before(async () => {
      // Création d'une observation isolée dédiée aux tests d'arbitrage
      const insRes = await pool.query(`
        INSERT INTO data_values (
          indicator_id, territory_id, period_type, period_start, period_end,
          value_numeric, methodology_nature, editorial_status, is_active,
          audit_status, audit_decision, created_by
        ) VALUES (
          137, 1, 'ANNUAL', '2017-01-01', '2017-12-31',
          20000.0, 'administrative_record', 'under_review', FALSE,
          'confirmed', 'pending', $1
        ) RETURNING id;
      `, [adminUser.id]);
      testObsId = insRes.rows[0].id;
      testIsoValues.push(testObsId);

      // Rattachement d'une source primaire qualifiée
      await pool.query(`
        INSERT INTO data_value_sources (
          data_value_id, source_id, source_role, documentary_tier,
          citation_reference, methodological_robustness, created_by
        ) VALUES (
          $1, 282, 'primary', 'TIER_1_OFFICIAL',
          'Comptes Nationaux Test Réf Tab 1 p 10', 'high', $2
        );
      `, [testObsId, adminUser.id]);
    });

    test('2.1 Les utilisateurs non administrateurs (reader, writer) sont rejetés en 403', async () => {
      await readerAgent
        .post(`/api/data/admin/values/${testObsId}/audit-decision`)
        .set('X-CSRF-Token', readerCsrf)
        .send({ decision: 'accepted', notes: 'Tentative reader' })
        .expect(403);

      await writerAgent
        .post(`/api/data/admin/values/${testObsId}/audit-decision`)
        .set('X-CSRF-Token', writerCsrf)
        .send({ decision: 'accepted', notes: 'Tentative writer' })
        .expect(403);
    });

    test('2.2 Une décision rejetée, en attente ou correctionnelle sans motif explicite est refusée (400)', async () => {
      // 1. Rejected sans motif
      const res1 = await adminAgent
        .post(`/api/data/admin/values/${testObsId}/audit-decision`)
        .set('X-CSRF-Token', adminCsrf)
        .send({ decision: 'rejected', notes: '' })
        .expect(400);
      assert.ok(res1.body.error.includes('motif'));

      // 2. Correction sans motif
      const res2 = await adminAgent
        .post(`/api/data/admin/values/${testObsId}/audit-decision`)
        .set('X-CSRF-Token', adminCsrf)
        .send({ decision: 'correction_requested', notes: 'abc' }) // < 5 cars
        .expect(400);
      assert.ok(res2.body.error.includes('motif'));

      // 3. Pending_evidence sans motif
      const res3 = await adminAgent
        .post(`/api/data/admin/values/${testObsId}/audit-decision`)
        .set('X-CSRF-Token', adminCsrf)
        .send({ decision: 'pending_evidence', notes: '   ' })
        .expect(400);
      assert.ok(res3.body.error.includes('motif'));
    });

    test('2.3 Enregistrement réussi d\'un arbitrage pending_evidence avec motif explicite', async () => {
      const res = await adminAgent
        .post(`/api/data/admin/values/${testObsId}/audit-decision`)
        .set('X-CSRF-Token', adminCsrf)
        .send({
          decision: 'pending_evidence',
          notes: 'Attente du versement du PDF original certifié des Comptes Nationaux',
          evidence_reference: 'Courrier demande d archive N°2026/04'
        })
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.audit_decision, 'pending_evidence');
      assert.strictEqual(res.body.data.audit_decision_by, adminUser.id);
      assert.ok(res.body.data.audit_decision_at);
      assert.strictEqual(res.body.data.audit_evidence_reference, 'Courrier demande d archive N°2026/04');

      // Vérification du journal d'audit (traçabilité inaltérable)
      const logRes = await pool.query(`
        SELECT action, old_status, new_status, reason, performed_by
        FROM data_value_audit_log
        WHERE data_value_id = $1
        ORDER BY id DESC LIMIT 1;
      `, [testObsId]);
      assert.strictEqual(logRes.rows.length, 1);
      assert.strictEqual(logRes.rows[0].action, 'KEEP_PENDING');
      assert.strictEqual(logRes.rows[0].performed_by, adminUser.id);
    });

    test('2.4 Enregistrement réussi d\'un arbitrage accepted autorisant la poursuite du workflow', async () => {
      const res = await adminAgent
        .post(`/api/data/admin/values/${testObsId}/audit-decision`)
        .set('X-CSRF-Token', adminCsrf)
        .send({
          decision: 'accepted',
          notes: 'Validation des éléments documentaires vérifiés par la commission',
          evidence_url: 'https://ins-cameroun.cm/comptes-nationaux-valides.pdf'
        })
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.audit_decision, 'accepted');
      assert.strictEqual(res.body.data.audit_decision_by, adminUser.id);
    });
  });

  // ===========================================================================
  // SECTION 3 : GARDE-FOUS DE VALIDATION ET DE PUBLICATION
  // ===========================================================================
  describe('3. Garde-fous de workflow : blocage si audit non accepté ou réserves manquantes', () => {
    let unacceptedObsId;
    let caveatObsId;

    before(async () => {
      // 1. Observation avec audit pending_evidence
      const ins1 = await pool.query(`
        INSERT INTO data_values (
          indicator_id, territory_id, period_type, period_start, period_end,
          value_numeric, methodology_nature, editorial_status, is_active,
          audit_status, audit_decision, created_by
        ) VALUES (
          137, 1, 'ANNUAL', '2016-01-01', '2016-12-31',
          18000.0, 'administrative_record', 'under_review', FALSE,
          'confirmed', 'pending_evidence', $1
        ) RETURNING id;
      `, [adminUser.id]);
      unacceptedObsId = ins1.rows[0].id;
      testIsoValues.push(unacceptedObsId);

      await pool.query(`
        INSERT INTO data_value_sources (
          data_value_id, source_id, source_role, documentary_tier,
          citation_reference, methodological_robustness, created_by
        ) VALUES (
          $1, 282, 'primary', 'TIER_1_OFFICIAL',
          'Comptes Nationaux Test Réf Tab 1 p 10', 'high', $2
        );
      `, [unacceptedObsId, adminUser.id]);

      // 2. Observation avec confirmed_with_caveat mais AUCUNE réserve documentée
      const ins2 = await pool.query(`
        INSERT INTO data_values (
          indicator_id, territory_id, period_type, period_start, period_end,
          value_numeric, methodology_nature, editorial_status, is_active,
          audit_status, audit_decision, audit_caveat, created_by
        ) VALUES (
          137, 1, 'ANNUAL', '2015-01-01', '2015-12-31',
          17000.0, 'administrative_record', 'under_review', FALSE,
          'confirmed_with_caveat', 'accepted', NULL, $1
        ) RETURNING id;
      `, [adminUser.id]);
      caveatObsId = ins2.rows[0].id;
      testIsoValues.push(caveatObsId);

      await pool.query(`
        INSERT INTO data_value_sources (
          data_value_id, source_id, source_role, documentary_tier,
          citation_reference, methodological_robustness, created_by
        ) VALUES (
          $1, 282, 'primary', 'TIER_1_OFFICIAL',
          'Comptes Nationaux Test Réf Tab 1 p 10', 'high', $2
        );
      `, [caveatObsId, adminUser.id]);
    });

    test('3.1 Blocage absolu de la validation méthodologique si audit_decision est pending_evidence', async () => {
      const res = await adminAgent
        .post(`/api/data/admin/values/${unacceptedObsId}/validate`)
        .set('X-CSRF-Token', adminCsrf)
        .send({ notes: 'Tentative de validation indue' })
        .expect(400);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.error.includes('pending_evidence'));
    });

    test('3.2 Blocage absolu de la validation méthodologique si confirmed_with_caveat sans réserve documentée', async () => {
      const res = await adminAgent
        .post(`/api/data/admin/values/${caveatObsId}/validate`)
        .set('X-CSRF-Token', adminCsrf)
        .send({ notes: 'Validation sans réserves' })
        .expect(400);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.error.includes('confirmed_with_caveat'));
    });

    test('3.3 Blocage absolu de la publication si l\'observation n\'est pas methodologically_validated', async () => {
      const res = await adminAgent
        .post(`/api/data/admin/values/${unacceptedObsId}/publish`)
        .set('X-CSRF-Token', adminCsrf)
        .send({ comment: 'Publication directe interdite' })
        .expect(400);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.error.includes('methodologically_validated'));
    });
  });

  // ===========================================================================
  // SECTION 4 : NON-ALTÉRATION STRICTE DU CORPUS RÉEL ET DE #261
  // ===========================================================================
  describe('4. Non-altération des 24 observations pilotes et préservation absolue de #261', () => {
    test('4.1 Les 13 observations de la Vague 1 demeurent strictement en draft, is_active=FALSE, audit_decision=pending', async () => {
      const res = await pool.query(`
        SELECT id, editorial_status, is_active, audit_decision
        FROM data_values
        WHERE id = ANY($1)
        ORDER BY id ASC;
      `, [wave1Ids]);

      assert.strictEqual(res.rows.length, 13);
      for (const row of res.rows) {
        assert.strictEqual(row.editorial_status, 'draft', `Observation #${row.id} doit rester draft`);
        assert.strictEqual(row.is_active, false, `Observation #${row.id} doit rester inactive (FALSE)`);
        assert.strictEqual(row.audit_decision, 'pending', `Observation #${row.id} doit rester pending (décision humaine requise)`);
      }
    });

    test('4.2 Les 11 observations des Vagues 2 et 3 demeurent strictement intactes', async () => {
      const res = await pool.query(`
        SELECT id, editorial_status, is_active, audit_decision
        FROM data_values
        WHERE id = ANY($1)
        ORDER BY id ASC;
      `, [otherPilotIds]);

      assert.strictEqual(res.rows.length, 11);
      for (const row of res.rows) {
        assert.strictEqual(row.editorial_status, 'draft');
        assert.strictEqual(row.is_active, false);
        assert.strictEqual(row.audit_decision, 'pending');
      }
    });

    test('4.3 L\'observation historique #261 est strictement intègre (29 850 Mrds, 2024, published, is_active=TRUE)', async () => {
      const res = await pool.query(`
        SELECT dv.id, di.code, dv.value_numeric, dv.period_start, dv.editorial_status, dv.is_active
        FROM data_values dv
        JOIN data_indicators di ON di.id = dv.indicator_id
        WHERE dv.id = 261;
      `, []);

      assert.strictEqual(res.rows.length, 1, 'Observation #261 trouvée');
      const obs261 = res.rows[0];
      assert.strictEqual(obs261.code, 'ECO_PIB_NOM');
      assert.strictEqual(parseFloat(obs261.value_numeric), 29850);
      assert.strictEqual(new Date(obs261.period_start).getFullYear(), 2024);
      assert.strictEqual(obs261.editorial_status, 'published');
      assert.strictEqual(obs261.is_active, true);
    });
  });
});
