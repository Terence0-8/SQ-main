/**
 * =============================================================================
 * SOLITIQUO DATA — LOT 3C.3
 * SUITE DE TESTS : VALIDATION HUMAINE, DOCUMENTAIRE ET DÉCISIONS EXPLICITES
 * =============================================================================
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../server');
const pool = require('../backend/config/database');

describe('SOLITIQUO DATA — LOT 3C.3 VALIDATION HUMAINE ET DOCUMENTAIRE', () => {
  const suffix = Date.now().toString().slice(-6);
  const rawPassword = 'Password123*';
  let adminUser;
  let readerUser;
  let adminAgent;
  let adminCsrf;
  let readerAgent;
  let readerCsrf;

  // Données isolées pour les tests
  const testIsoValues = [];

  before(async () => {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(rawPassword, salt);

    // 1. Créer administrateur
    const uAdmin = await pool.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'admin', TRUE) RETURNING id, username, email, role
    `, [`adm_val3_${suffix}`, `adm_val3_${suffix}@solitiquo.cm`, hashedPassword]);
    adminUser = uAdmin.rows[0];

    // 2. Créer lecteur simple
    const uReader = await pool.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'reader', TRUE) RETURNING id, username, email, role
    `, [`rdr_val3_${suffix}`, `rdr_val3_${suffix}@solitiquo.cm`, hashedPassword]);
    readerUser = uReader.rows[0];

    adminAgent = request.agent(app);
    await adminAgent.post('/api/auth/login').send({
      email: adminUser.email,
      password: rawPassword
    }).expect(200);

    const csrfAdminRes = await adminAgent.get('/api/csrf-token');
    adminCsrf = csrfAdminRes.body.csrfToken;

    readerAgent = request.agent(app);
    await readerAgent.post('/api/auth/login').send({
      email: readerUser.email,
      password: rawPassword
    }).expect(200);

    const csrfReaderRes = await readerAgent.get('/api/csrf-token');
    readerCsrf = csrfReaderRes.body.csrfToken;

    // 3. Créer 4 observations de test isolées avec année 2098 (pour ne pas interférer avec d'autres tests)
    const indRes = await pool.query("SELECT id FROM data_indicators WHERE code = 'ECO_PIB_NOM'");
    const indId = indRes.rows[0].id;
    const terRes = await pool.query("SELECT id FROM territories WHERE code = 'CMR'");
    const terId = terRes.rows[0].id;
    const srcRes = await pool.query("SELECT id FROM data_sources WHERE acronym = 'INS'");
    const srcId = srcRes.rows[0].id;

    for (let i = 1; i <= 4; i++) {
      const insVal = await pool.query(`
        INSERT INTO data_values (
          indicator_id, territory_id, period_type, period_start, period_end,
          value_numeric, methodology_nature, editorial_status, is_active,
          created_by, audit_status, audit_decision, audit_caveat
        ) VALUES (
          $1, $2, 'ANNUAL', '2098-01-01', '2098-12-31',
          25000 + $3, 'administrative_record', 'under_review', FALSE,
          $4, 'confirmed', 'pending', 'Réserve de test isolée pour le Lot 3C.3'
        ) RETURNING id;
      `, [indId, terId, i * 10, adminUser.id]);

      const valId = insVal.rows[0].id;
      testIsoValues.push(valId);

      await pool.query(`
        INSERT INTO data_value_sources (
          data_value_id, source_id, source_role, documentary_tier,
          citation_reference, citation_url, methodological_robustness, created_by
        ) VALUES (
          $1, $2, 'primary', 'TIER_1_OFFICIAL',
          'Comptes Nationaux de test, INS, Tableau 1.2, p. 15',
          'https://ins-cameroun.cm/test-comptes-2098.pdf', 'medium', $3
        );
      `, [valId, srcId, adminUser.id]);
    }
  });

  after(async () => {
    if (testIsoValues.length > 0) {
      try {
        await pool.query("UPDATE data_values SET is_active = FALSE, editorial_status = 'draft' WHERE id = ANY($1)", [testIsoValues]);
        await pool.query('DELETE FROM data_value_sources WHERE data_value_id = ANY($1)', [testIsoValues]);
        await pool.query(`
          DELETE FROM data_values 
          WHERE id = ANY($1) 
            AND id NOT IN (SELECT DISTINCT data_value_id FROM data_value_versions);
        `, [testIsoValues]);
      } catch (err) {
        console.warn('Nettoyage testIsoValues Lot 3C.3:', err.message);
      }
    }
    try {
      if (readerUser) await pool.query('DELETE FROM users WHERE id = $1', [readerUser.id]);
    } catch (_) {}
  });

  // ---------------------------------------------------------------------------
  // 1. Contrôles de sécurité et CSRF
  // ---------------------------------------------------------------------------
  describe('1. Contrôles de sécurité, rôles et CSRF', () => {
    test('1.1 Rejet si token CSRF manquant sur audit-decision', async () => {
      const res = await adminAgent
        .post(`/api/data/admin/values/${testIsoValues[0]}/audit-decision`)
        .send({ decision: 'accepted', notes: 'Validation test' });
      assert.equal(res.status, 403, 'CSRF manquant doit être rejeté avec 403');
    });

    test('1.2 Rejet si rôle insuffisant (reader au lieu d\'admin)', async () => {
      const res = await readerAgent
        .post(`/api/data/admin/values/${testIsoValues[0]}/audit-decision`)
        .set('X-CSRF-Token', readerCsrf)
        .send({ decision: 'accepted', notes: 'Tentative lecteur' });
      assert.equal(res.status, 403, 'Un rôle reader doit être rejeté avec 403');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Décisions humaines et motifs obligatoires
  // ---------------------------------------------------------------------------
  describe('2. Décisions humaines et exigences de motifs obligatoires', () => {
    test('2.1 Rejet de refuser audit sans motif obligatoire', async () => {
      const res = await adminAgent
        .post(`/api/data/admin/values/${testIsoValues[0]}/audit-decision`)
        .set('X-CSRF-Token', adminCsrf)
        .send({ decision: 'rejected', notes: '' });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.includes('motif obligatoire'));
    });

    test('2.2 Rejet de demander correction sans motif obligatoire', async () => {
      const res = await adminAgent
        .post(`/api/data/admin/values/${testIsoValues[0]}/audit-decision`)
        .set('X-CSRF-Token', adminCsrf)
        .send({ decision: 'correction_requested', notes: 'abc' }); // Moins de 5 chars
      assert.equal(res.status, 400);
      assert.ok(res.body.error.includes('au moins 5 caractères'));
    });

    test('2.3 Rejet de maintien en attente sans motif obligatoire', async () => {
      const res = await adminAgent
        .post(`/api/data/admin/values/${testIsoValues[0]}/audit-decision`)
        .set('X-CSRF-Token', adminCsrf)
        .send({ decision: 'pending_evidence', notes: '  ' });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.includes('motif obligatoire'));
    });

    test('2.4 Décision : Accepter l\'audit avec horodatage et auteur', async () => {
      const res = await adminAgent
        .post(`/api/data/admin/values/${testIsoValues[0]}/audit-decision`)
        .set('X-CSRF-Token', adminCsrf)
        .send({ decision: 'accepted', notes: 'Audit accepté après vérification du Tableau 1.2' });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.audit_decision, 'accepted');
      assert.equal(res.body.data.audit_decision_by_username, adminUser.username);
      assert.ok(res.body.data.audit_decision_at);
    });

    test('2.5 Décision : Demander une correction (remet au statut draft)', async () => {
      const valId = testIsoValues[1];
      const res = await adminAgent
        .post(`/api/data/admin/values/${valId}/audit-decision`)
        .set('X-CSRF-Token', adminCsrf)
        .send({
          decision: 'correction_requested',
          notes: 'Divergence constatée sur le montant net des impôts indirects.'
        });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.audit_decision, 'correction_requested');
      assert.equal(res.body.data.editorial_status, 'draft', 'Doit rétrograder au statut draft');
    });

    test('2.6 Décision : Maintenir en attente faute de preuve suffisante avec pièce demandée', async () => {
      const valId = testIsoValues[2];
      const res = await adminAgent
        .post(`/api/data/admin/values/${valId}/audit-decision`)
        .set('X-CSRF-Token', adminCsrf)
        .send({
          decision: 'pending_evidence',
          notes: 'Preuve documentaire originale non consultable : PDF complet manquant.',
          evidence_reference: 'Courrier N° 102/INS relatif aux comptes nationaux 2022'
        });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.audit_decision, 'pending_evidence');
      assert.equal(res.body.data.audit_evidence_reference, 'Courrier N° 102/INS relatif aux comptes nationaux 2022');
    });

    test('2.7 Décision : Refuser formellement l\'audit', async () => {
      const valId = testIsoValues[3];
      const res = await adminAgent
        .post(`/api/data/admin/values/${valId}/audit-decision`)
        .set('X-CSRF-Token', adminCsrf)
        .send({
          decision: 'rejected',
          notes: 'Incohérence majeure non documentée avec le rapport définitif.'
        });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.audit_decision, 'rejected');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Journal d'audit inaltérable et traçabilité des décisions
  // ---------------------------------------------------------------------------
  describe('3. Registre d\'audit et immutabilité de la traçabilité', () => {
    test('3.1 Chaque décision génère une trace d\'audit avec auteur, horodatage et diff d\'état', async () => {
      const res = await adminAgent.get(`/api/data/admin/values/${testIsoValues[0]}/history`);
      assert.equal(res.status, 200);
      const auditLog = res.body.data.audit_log || [];
      const auditDecisions = auditLog.filter(l => l.action === 'AUDIT_DECISION');
      assert.ok(auditDecisions.length >= 1, 'Au moins un événement AUDIT_DECISION attendu');
      const latest = auditDecisions[0];
      assert.equal(latest.performed_by, adminUser.id);
      assert.ok(latest.diff_payload.previous_state, 'Doit consigner l\'état précédent');
      assert.ok(latest.diff_payload.new_state, 'Doit consigner le nouvel état');
      assert.equal(latest.diff_payload.new_state.audit_decision, 'accepted');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Règles de publication étanches
  // ---------------------------------------------------------------------------
  describe('4. Règles de publication et absence de publication automatique', () => {
    test('4.1 Une observation avec audit refusé ne peut être ni validée ni publiée', async () => {
      const rejectedId = testIsoValues[3];
      // Tentative de validation méthodologique
      const valRes = await adminAgent
        .post(`/api/data/admin/values/${rejectedId}/validate`)
        .set('X-CSRF-Token', adminCsrf)
        .send({ validation_notes: 'Tentative illégale' });
      assert.equal(valRes.status, 400);

      // Tentative de publication directe
      const pubRes = await adminAgent
        .post(`/api/data/admin/values/${rejectedId}/publish`)
        .set('X-CSRF-Token', adminCsrf)
        .send({ public_reason_summary: 'Tentative publication observation refusée' });
      assert.equal(pubRes.status, 400);
    });

    test('4.2 Une observation en attente de preuve ne peut être validée méthodologiquement', async () => {
      const pendingId = testIsoValues[2];
      const res = await adminAgent
        .post(`/api/data/admin/values/${pendingId}/validate`)
        .set('X-CSRF-Token', adminCsrf)
        .send({ validation_notes: 'Tentative sans preuve' });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.includes('doit être formellement accepté'));
    });

    test('4.3 Une observation acceptée peut être validée méthodologiquement puis publiée explicitement', async () => {
      const acceptedId = testIsoValues[0];
      // 1. Valider méthodologiquement
      const valRes = await adminAgent
        .post(`/api/data/admin/values/${acceptedId}/validate`)
        .set('X-CSRF-Token', adminCsrf)
        .send({ validation_notes: 'Revue méthodologique complète validée.' });
      assert.equal(valRes.status, 200);
      assert.equal(valRes.body.data.editorial_status, 'methodologically_validated');

      // 2. Publier explicitement
      const pubRes = await adminAgent
        .post(`/api/data/admin/values/${acceptedId}/publish`)
        .set('X-CSRF-Token', adminCsrf)
        .send({ public_reason_summary: 'Publication officielle validée par commission' });
      assert.equal(pubRes.status, 200);
      assert.equal(pubRes.body.data.editorial_status, 'published');
      assert.equal(pubRes.body.data.is_active, true);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Intégrité des 24 observations réelles et de l'historique #261
  // ---------------------------------------------------------------------------
  describe('5. Intégrité des 24 observations pilotes et de l\'observation historique #261', () => {
    test('5.1 Les 24 observations pilotes restent strictement non publiées (draft)', async () => {
      const res = await pool.query(`
        SELECT id, editorial_status, is_active
        FROM data_values
        WHERE id BETWEEN 687 AND 710;
      `);
      assert.equal(res.rows.length, 24);
      res.rows.forEach(r => {
        assert.equal(r.editorial_status, 'draft', `L'observation #${r.id} doit rester en 'draft'`);
        assert.equal(r.is_active, false, `L'observation #${r.id} doit rester inactive`);
      });
    });

    test('5.2 L\'observation historique #261 reste strictement publiée, active et inchangée (29850)', async () => {
      const res = await pool.query('SELECT * FROM data_values WHERE id = 261');
      assert.equal(res.rows.length, 1);
      const obs = res.rows[0];
      assert.equal(obs.editorial_status, 'published');
      assert.equal(obs.is_active, true);
      assert.equal(parseFloat(obs.value_numeric), 29850);
      assert.equal(obs.methodology_nature, 'nowcast_estimate');
    });
  });
});
