/**
 * =============================================================================
 * SOLITIQUO DATA — LOT 3C.4
 * SUITE DE TESTS : FIABILISATION DU WORKFLOW DE VALIDATION HUMAINE
 * ET DE LA QUALIFICATION DOCUMENTAIRE
 * =============================================================================
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../server');
const pool = require('../backend/config/database');

describe('SOLITIQUO DATA — LOT 3C.4 WORKFLOW HUMAIN ET QUALIFICATION DOCUMENTAIRE', () => {
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

  let testIndicatorId;
  let testTerritoryId;
  let testSourceId;
  const testIsoValues = [];

  before(async () => {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(rawPassword, salt);

    // 1. Créer administrateur
    const uAdmin = await pool.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'admin', TRUE) RETURNING id, username, email, role
    `, [`adm_lot3c4_${suffix}`, `adm_lot3c4_${suffix}@solitiquo.cm`, hashedPassword]);
    adminUser = uAdmin.rows[0];

    // 2. Créer rédacteur (writer)
    const uWriter = await pool.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'writer', TRUE) RETURNING id, username, email, role
    `, [`wri_lot3c4_${suffix}`, `wri_lot3c4_${suffix}@solitiquo.cm`, hashedPassword]);
    writerUser = uWriter.rows[0];

    // 3. Créer lecteur simple (reader)
    const uReader = await pool.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'reader', TRUE) RETURNING id, username, email, role
    `, [`rdr_lot3c4_${suffix}`, `rdr_lot3c4_${suffix}@solitiquo.cm`, hashedPassword]);
    readerUser = uReader.rows[0];

    // Sessions & CSRF
    adminAgent = request.agent(app);
    await adminAgent.post('/api/auth/login').send({
      email: adminUser.email,
      password: rawPassword
    }).expect(200);
    const csrfAdminRes = await adminAgent.get('/api/csrf-token');
    adminCsrf = csrfAdminRes.body.csrfToken;

    writerAgent = request.agent(app);
    await writerAgent.post('/api/auth/login').send({
      email: writerUser.email,
      password: rawPassword
    }).expect(200);
    const csrfWriterRes = await writerAgent.get('/api/csrf-token');
    writerCsrf = csrfWriterRes.body.csrfToken;

    readerAgent = request.agent(app);
    await readerAgent.post('/api/auth/login').send({
      email: readerUser.email,
      password: rawPassword
    }).expect(200);
    const csrfReaderRes = await readerAgent.get('/api/csrf-token');
    readerCsrf = csrfReaderRes.body.csrfToken;

    // Référentiels pour les observations de test isolées
    const indRes = await pool.query("SELECT id FROM data_indicators WHERE code = 'ECO_PIB_NOM'");
    testIndicatorId = indRes.rows[0].id;
    const terRes = await pool.query("SELECT id FROM territories WHERE code = 'CMR'");
    testTerritoryId = terRes.rows[0].id;
    const srcRes = await pool.query("SELECT id FROM data_sources WHERE acronym = 'INS'");
    testSourceId = srcRes.rows[0].id;
  });

  after(async () => {
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
        console.warn('Nettoyage testIsoValues Lot 3C.4:', err.message);
      }
    }
    try {
      if (adminUser) await pool.query('DELETE FROM users WHERE id = $1', [adminUser.id]);
      if (writerUser) await pool.query('DELETE FROM users WHERE id = $1', [writerUser.id]);
      if (readerUser) await pool.query('DELETE FROM users WHERE id = $1', [readerUser.id]);
    } catch (_) {}
  });

  // ===========================================================================
  // SECTION 1 : CORRECTION DE LA QUALIFICATION AUTOMATIQUE DES SOURCES
  // ===========================================================================
  describe('1. Qualification documentaire explicite et suppression des valeurs par défaut', () => {

    test('1.1 Création d\'observation sans qualification : conserve l\'observation sans source artificielle', async () => {
      const res = await writerAgent
        .post('/api/data/admin/values')
        .set('X-CSRF-Token', writerCsrf)
        .send({
          indicator_id: testIndicatorId,
          territory_id: testTerritoryId,
          period_type: 'ANNUAL',
          period_start: '2091-01-01',
          period_end: '2091-12-31',
          value_numeric: 31000,
          methodology_nature: 'administrative_record',
          internal_notes: 'Brouillon initial sans source'
        });

      assert.equal(res.status, 201);
      const val = res.body.data;
      testIsoValues.push(val.id);
      assert.equal(val.editorial_status, 'draft');
      assert.equal(val.is_active, false);
      assert.equal(val.sources.length, 0, 'Aucune source ne doit être inventée');
    });

    test('1.2 Ajout d\'une source sans qualification : ne doit JAMAIS attribuer TIER 1 ni high d\'office', async () => {
      const valId = testIsoValues[0];
      const res = await writerAgent
        .post(`/api/data/admin/values/${valId}/sources`)
        .set('X-CSRF-Token', writerCsrf)
        .send({
          source_id: testSourceId,
          source_role: 'primary'
          // Ni documentary_tier, ni methodological_robustness, ni citation_reference
        });

      assert.equal(res.status, 201);

      // Vérification en base : les champs doivent être STRICTEMENT null
      const dbCheck = await pool.query(
        'SELECT id, documentary_tier, methodological_robustness, citation_reference FROM data_value_sources WHERE data_value_id = $1',
        [valId]
      );
      assert.equal(dbCheck.rows.length, 1);
      const src = dbCheck.rows[0];
      assert.equal(src.documentary_tier, null, 'Le tier documentaire ne doit pas être TIER 1 d\'office');
      assert.equal(src.methodological_robustness, null, 'La robustesse ne doit pas être high d\'office');
      assert.equal(src.citation_reference, null, 'Aucune référence bibliographique ne doit être inventée');
    });

    test('1.3 Source institutionnelle sans document consulté : reste non qualifiée sans preuve fabriquée', async () => {
      const createRes = await writerAgent
        .post('/api/data/admin/values')
        .set('X-CSRF-Token', writerCsrf)
        .send({
          indicator_id: testIndicatorId,
          territory_id: testTerritoryId,
          period_type: 'ANNUAL',
          period_start: '2092-01-01',
          period_end: '2092-12-31',
          value_numeric: 32000,
          methodology_nature: 'sample_survey',
          sources: [
            {
              source_id: testSourceId,
              source_role: 'primary',
              citation_url: 'https://ins-cameroun.cm' // Juste l'URL institutionnelle, sans document consulté
            }
          ]
        });

      assert.equal(createRes.status, 201);
      const valId = createRes.body.data.id;
      testIsoValues.push(valId);

      const dbCheck = await pool.query(
        'SELECT documentary_tier, methodological_robustness, citation_reference, citation_url FROM data_value_sources WHERE data_value_id = $1',
        [valId]
      );
      const s = dbCheck.rows[0];
      assert.equal(s.documentary_tier, null, 'Non déduit du nom de l\'institution');
      assert.equal(s.methodological_robustness, null, 'Non déduit de l\'institution');
      assert.equal(s.citation_reference, null, 'Aucune preuve de consultation fabriquée');
      assert.equal(s.citation_url, 'https://ins-cameroun.cm');
    });

    test('1.4 Source explicitement qualifiée par un administrateur : enregistre fidèlement la qualification', async () => {
      const createRes = await adminAgent
        .post('/api/data/admin/values')
        .set('X-CSRF-Token', adminCsrf)
        .send({
          indicator_id: testIndicatorId,
          territory_id: testTerritoryId,
          period_type: 'ANNUAL',
          period_start: '2093-01-01',
          period_end: '2093-12-31',
          value_numeric: 33000,
          methodology_nature: 'administrative_record',
          sources: [
            {
              source_id: testSourceId,
              source_role: 'primary',
              documentary_tier: 'TIER_1_OFFICIAL',
              methodological_robustness: 'medium',
              citation_reference: 'Comptes Nationaux du Cameroun, INS, Rapport 2024, Tableau 2.1 p. 30',
              citation_url: 'https://ins-cameroun.cm/comptes-2024.pdf'
            }
          ]
        });

      assert.equal(createRes.status, 201);
      const valId = createRes.body.data.id;
      testIsoValues.push(valId);

      const dbCheck = await pool.query(
        'SELECT documentary_tier, methodological_robustness, citation_reference FROM data_value_sources WHERE data_value_id = $1',
        [valId]
      );
      const s = dbCheck.rows[0];
      assert.equal(s.documentary_tier, 'TIER_1_OFFICIAL');
      assert.equal(s.methodological_robustness, 'medium');
      assert.equal(s.citation_reference, 'Comptes Nationaux du Cameroun, INS, Rapport 2024, Tableau 2.1 p. 30');
    });

    test('1.5 Impossibilité de valider méthodologiquement une observation sans source primaire correctement qualifiée', async () => {
      const unqualValId = testIsoValues[0]; // Créée au test 1.1 et dotée d'une source sans qualification au 1.2

      // 1. Soumission pour revue
      await writerAgent
        .post(`/api/data/admin/values/${unqualValId}/submit`)
        .set('X-CSRF-Token', writerCsrf)
        .expect(200);

      // 2. Audit accepté (pour isoler la règle sur la qualification de la source)
      await adminAgent
        .post(`/api/data/admin/values/${unqualValId}/audit-decision`)
        .set('X-CSRF-Token', adminCsrf)
        .send({ decision: 'accepted', notes: 'Audit des calculs conforme' })
        .expect(200);

      // 3. Tentative de validation méthodologique -> doit échouer avec 400
      const valRes = await adminAgent
        .post(`/api/data/admin/values/${unqualValId}/validate`)
        .set('X-CSRF-Token', adminCsrf)
        .send({ validation_notes: 'Tentative de validation' });

      assert.equal(valRes.status, 400);
      assert.match(valRes.body.error, /source primaire correctement qualifiée/i);
    });
  });

  // ===========================================================================
  // SECTION 2 : WORKFLOW DE VALIDATION HUMAINE COMPLET
  // ===========================================================================
  describe('2. Épreuve du cycle de vie éditorial et des décisions d\'audit', () => {
    let workflowValId;

    test('2.1 Parcours A & B : Un rédacteur crée et consulte un dossier en brouillon', async () => {
      const createRes = await writerAgent
        .post('/api/data/admin/values')
        .set('X-CSRF-Token', writerCsrf)
        .send({
          indicator_id: testIndicatorId,
          territory_id: testTerritoryId,
          period_type: 'ANNUAL',
          period_start: '2094-01-01',
          period_end: '2094-12-31',
          value_numeric: 34000,
          methodology_nature: 'administrative_record',
          internal_notes: 'Dossier préparé pour commission',
          methodology_notes: 'Calcul basé sur les états comptables mensuels',
          sources: [
            {
              source_id: testSourceId,
              source_role: 'primary',
              documentary_tier: 'TIER_1_OFFICIAL',
              methodological_robustness: 'high',
              citation_reference: 'Journal Officiel du Cameroun, Décret n° 2024/999 du 15 Avril 2024',
              citation_url: 'https://spm.gov.cm/decret-2024-999.pdf'
            }
          ]
        });

      assert.equal(createRes.status, 201);
      workflowValId = createRes.body.data.id;
      testIsoValues.push(workflowValId);

      // Consultation du dossier documentaire et historique
      const viewRes = await writerAgent.get(`/api/data/admin/values/${workflowValId}`);
      assert.equal(viewRes.status, 200);
      assert.equal(viewRes.body.data.editorial_status, 'draft');
      assert.equal(viewRes.body.data.sources.length, 1);
      assert.equal(viewRes.body.data.sources[0].documentary_tier, 'TIER_1_OFFICIAL');

      // Soumission à la revue
      await writerAgent
        .post(`/api/data/admin/values/${workflowValId}/submit`)
        .set('X-CSRF-Token', writerCsrf)
        .expect(200);
    });

    test('2.2 Parcours C & D : Décision correction_requested avec motif et rétrogradation en draft', async () => {
      const res = await adminAgent
        .post(`/api/data/admin/values/${workflowValId}/audit-decision`)
        .set('X-CSRF-Token', adminCsrf)
        .send({
          decision: 'correction_requested',
          notes: 'Vérifier la concordance entre le solde net et les impôts indirects.'
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.audit_decision, 'correction_requested');
      assert.equal(res.body.data.editorial_status, 'draft');
      assert.equal(res.body.data.audit_decision_by_username, adminUser.username);
      assert.ok(res.body.data.audit_decision_at);

      // Resoumission pour le test suivant
      await writerAgent
        .post(`/api/data/admin/values/${workflowValId}/submit`)
        .set('X-CSRF-Token', writerCsrf)
        .expect(200);
    });

    test('2.3 Parcours C & D : Décision pending_evidence avec pièce justificative demandée', async () => {
      const res = await adminAgent
        .post(`/api/data/admin/values/${workflowValId}/audit-decision`)
        .set('X-CSRF-Token', adminCsrf)
        .send({
          decision: 'pending_evidence',
          notes: 'Preuve documentaire insuffisante : fournir l\'annexe statistique certifiée.',
          evidence_reference: 'Bordereau de transmission MINFI n° 8872/DGB/2024'
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.audit_decision, 'pending_evidence');
      assert.equal(res.body.data.audit_evidence_reference, 'Bordereau de transmission MINFI n° 8872/DGB/2024');

      // Impossible de valider pendant pending_evidence
      const tryVal = await adminAgent
        .post(`/api/data/admin/values/${workflowValId}/validate`)
        .set('X-CSRF-Token', adminCsrf)
        .send({ validation_notes: 'Tentative sans preuve' });
      assert.equal(tryVal.status, 400);
    });

    test('2.4 Parcours C, E & F : Audit accepté, validation méthodologique et publication explicite', async () => {
      // 1. Audit accepté
      const auditRes = await adminAgent
        .post(`/api/data/admin/values/${workflowValId}/audit-decision`)
        .set('X-CSRF-Token', adminCsrf)
        .send({
          decision: 'accepted',
          notes: 'Annexe statistique certifiée reçue et vérifiée. Audit accepté.',
          evidence_url: 'https://minfi.gov.cm/annexes/bordereau-8872.pdf',
          evidence_reference: 'Bordereau n° 8872 certifié par le Directeur Général du Budget'
        });
      assert.equal(auditRes.status, 200);
      assert.equal(auditRes.body.data.audit_decision, 'accepted');

      // 2. Validation méthodologique
      const valRes = await adminAgent
        .post(`/api/data/admin/values/${workflowValId}/validate`)
        .set('X-CSRF-Token', adminCsrf)
        .send({ validation_notes: 'Méthodologie conforme aux normes nationales.' });
      assert.equal(valRes.status, 200);
      assert.equal(valRes.body.data.editorial_status, 'methodologically_validated');
      assert.equal(valRes.body.data.validated_by_username, adminUser.username);

      // 3. Publication explicite
      const pubRes = await adminAgent
        .post(`/api/data/admin/values/${workflowValId}/publish`)
        .set('X-CSRF-Token', adminCsrf)
        .send({ public_reason_summary: 'Publication officielle validée par le comité éditorial DATA' });
      assert.equal(pubRes.status, 200);
      assert.equal(pubRes.body.data.editorial_status, 'published');
      assert.equal(pubRes.body.data.is_active, true);
      assert.equal(pubRes.body.data.published_by_username, adminUser.username);
      assert.ok(pubRes.body.data.published_at);
    });

    test('2.5 Historique intégral des décisions et révisions vérifié', async () => {
      const histRes = await adminAgent.get(`/api/data/admin/values/${workflowValId}/history`);
      assert.equal(histRes.status, 200);
      const log = histRes.body.data.audit_log || [];
      assert.ok(log.length >= 3, 'Au moins 3 traces d\'audit attendues');

      const actions = log.map(l => l.action);
      assert.ok(actions.includes('REQUEST_CORRECTION'), 'Action REQUEST_CORRECTION tracée');
      assert.ok(actions.includes('KEEP_PENDING'), 'Action KEEP_PENDING tracée');
      assert.ok(actions.includes('AUDIT_DECISION'), 'Action AUDIT_DECISION tracée');
    });
  });

  // ===========================================================================
  // SECTION 3 : CONTRÔLES DE SÉCURITÉ, RÔLES ET BARRIÈRES
  // ===========================================================================
  describe('3. Barrières de sécurité et contrôles d\'accès', () => {
    let rejectedValId;

    before(async () => {
      const res = await adminAgent
        .post('/api/data/admin/values')
        .set('X-CSRF-Token', adminCsrf)
        .send({
          indicator_id: testIndicatorId,
          territory_id: testTerritoryId,
          period_type: 'ANNUAL',
          period_start: '2095-01-01',
          period_end: '2095-12-31',
          value_numeric: 35000,
          methodology_nature: 'administrative_record',
          sources: [
            {
              source_id: testSourceId,
              source_role: 'primary',
              documentary_tier: 'TIER_1_OFFICIAL',
              methodological_robustness: 'high',
              citation_reference: 'Réf test 2095',
            }
          ]
        });
      rejectedValId = res.body.data.id;
      testIsoValues.push(rejectedValId);

      await adminAgent
        .post(`/api/data/admin/values/${rejectedValId}/audit-decision`)
        .set('X-CSRF-Token', adminCsrf)
        .send({ decision: 'rejected', notes: 'Données falsifiées ou erronées' })
        .expect(200);
    });

    test('3.1 Refus d\'accès pour les rôles non autorisés (reader et writer sur endpoints admin)', async () => {
      // Reader refusé sur consultation admin
      await readerAgent
        .get(`/api/data/admin/values/${rejectedValId}`)
        .expect(403);

      // Writer refusé sur audit-decision
      await writerAgent
        .post(`/api/data/admin/values/${rejectedValId}/audit-decision`)
        .set('X-CSRF-Token', writerCsrf)
        .send({ decision: 'accepted', notes: 'Tentative illégale' })
        .expect(403);

      // Writer refusé sur publish
      await writerAgent
        .post(`/api/data/admin/values/${rejectedValId}/publish`)
        .set('X-CSRF-Token', writerCsrf)
        .send({ public_reason_summary: 'Tentative rédacteur' })
        .expect(403);
    });

    test('3.2 Protection CSRF stricte sur toutes les mutations', async () => {
      await adminAgent
        .post(`/api/data/admin/values/${rejectedValId}/publish`)
        .send({ public_reason_summary: 'Attaque sans CSRF' })
        .expect(403);
    });

    test('3.3 Impossibilité de publication après rejet', async () => {
      const res = await adminAgent
        .post(`/api/data/admin/values/${rejectedValId}/publish`)
        .set('X-CSRF-Token', adminCsrf)
        .send({ public_reason_summary: 'Publication d\'une observation rejetée' });
      assert.equal(res.status, 400);
    });

    test('3.4 Impossibilité de publication sans audit accepté et sans validation méthodologique', async () => {
      const draftRes = await adminAgent
        .post('/api/data/admin/values')
        .set('X-CSRF-Token', adminCsrf)
        .send({
          indicator_id: testIndicatorId,
          territory_id: testTerritoryId,
          period_type: 'ANNUAL',
          period_start: '2097-01-01',
          period_end: '2097-12-31',
          value_numeric: 36000,
          methodology_nature: 'administrative_record',
          sources: [
            {
              source_id: testSourceId,
              source_role: 'primary',
              documentary_tier: 'TIER_1_OFFICIAL',
              methodological_robustness: 'high',
              citation_reference: 'Comptes Nationaux 2024'
            }
          ]
        });
      const draftId = draftRes.body.data.id;
      testIsoValues.push(draftId);

      // Tentative directe de publication depuis draft -> 400
      const pubRes = await adminAgent
        .post(`/api/data/admin/values/${draftId}/publish`)
        .set('X-CSRF-Token', adminCsrf)
        .send({ public_reason_summary: 'Publication illégale directe' });
      assert.equal(pubRes.status, 400);
      assert.match(pubRes.body.error, /methodologically_validated/i);
    });
  });

  // ===========================================================================
  // SECTION 4 : NON-RÉGRESSION DES 24 OBSERVATIONS PILOTES ET DE #261
  // ===========================================================================
  describe('4. Contrôle d\'intégrité absolue des observations pilotes et de #261', () => {

    test('4.1 Les 24 observations pilotes (#687 à #710) demeurent STRICTEMENT inchangées', async () => {
      const res = await pool.query(`
        SELECT dv.id, di.code AS indicator_code, dv.editorial_status, dv.is_active, dv.audit_decision,
               (SELECT COUNT(*) FROM data_value_sources dvs WHERE dvs.data_value_id = dv.id) AS sources_count
        FROM data_values dv
        JOIN data_indicators di ON di.id = dv.indicator_id
        WHERE dv.id BETWEEN 687 AND 710
        ORDER BY dv.id ASC;
      `);

      assert.equal(res.rows.length, 24, 'Les 24 observations doivent être présentes');
      res.rows.forEach(r => {
        assert.equal(r.editorial_status, 'draft', `Observation #${r.id} doit rester en 'draft'`);
        assert.equal(r.is_active, false, `Observation #${r.id} doit avoir is_active = FALSE`);
        assert.equal(r.audit_decision, 'pending', `Observation #${r.id} doit avoir audit_decision = 'pending'`);
        assert.ok(parseInt(r.sources_count, 10) >= 1, `Observation #${r.id} doit avoir ses sources conservées`);
      });
    });

    test('4.2 L\'observation historique #261 demeure STRICTEMENT publiée, active et à 29 850 milliards FCFA', async () => {
      const res = await pool.query(`
        SELECT dv.id, di.code AS indicator_code, dv.value_numeric, dv.editorial_status, dv.is_active,
               dv.period_type, dv.period_start, dv.period_end
        FROM data_values dv
        JOIN data_indicators di ON di.id = dv.indicator_id
        WHERE dv.id = 261;
      `);

      assert.equal(res.rows.length, 1);
      const row = res.rows[0];
      assert.equal(row.indicator_code, 'ECO_PIB_NOM');
      assert.equal(parseFloat(row.value_numeric), 29850);
      assert.equal(row.editorial_status, 'published');
      assert.equal(row.is_active, true);
    });
  });
});
