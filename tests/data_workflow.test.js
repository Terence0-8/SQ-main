'use strict';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-only';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../server');
const pool = require('../backend/config/database');

describe('SOLITIQUO DATA — LOT 2B WORKFLOW ÉDITORIAL ET API D\'ADMINISTRATION', () => {
  const suffix = Date.now().toString().slice(-6);

  let adminUser;
  let writerUser1;
  let writerUser2;
  let readerUser;

  let adminAgent;
  let adminCsrf;
  let writer1Agent;
  let writer1Csrf;
  let writer2Agent;
  let writer2Csrf;
  let readerAgent;
  let readerCsrf;

  let indicatorId;
  let territoryId;
  let sourceId;
  let source2Id;
  let dimId;
  let itemId;

  const rawPassword = 'Password123*';
  const indCode = `IND_WF_${suffix}`;
  const dimCode = `DIM_WF_${suffix}`;
  const itemCode = `ITEM_WF_${suffix}`;

  // Helper pour initialiser un agent authentifié avec cookie de session et CSRF token
  async function createAuthAgent(user) {
    const agent = request.agent(app);
    // Inscription ou connexion
    const loginRes = await agent.post('/api/auth/login').send({
      email: user.email,
      password: rawPassword
    });
    assert.equal(loginRes.status, 200, `Échec de connexion pour ${user.email}`);

    // Récupérer le token CSRF associé à cette session
    const csrfRes = await agent.get('/api/csrf-token');
    assert.equal(csrfRes.status, 200);
    const csrfToken = csrfRes.body.csrfToken;
    assert.ok(csrfToken, 'Token CSRF attendu');

    return { agent, csrfToken };
  }

  before(async () => {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(rawPassword, salt);

    // 1. Créer les utilisateurs de test aux rôles distincts
    const uAdmin = await pool.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'admin', TRUE) RETURNING id, username, email, role
    `, [`admin_wf_${suffix}`, `admin_wf_${suffix}@solitiquo.cm`, hashedPassword]);
    adminUser = uAdmin.rows[0];

    const uWriter1 = await pool.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'writer', TRUE) RETURNING id, username, email, role
    `, [`writer1_wf_${suffix}`, `writer1_wf_${suffix}@solitiquo.cm`, hashedPassword]);
    writerUser1 = uWriter1.rows[0];

    const uWriter2 = await pool.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'writer', TRUE) RETURNING id, username, email, role
    `, [`writer2_wf_${suffix}`, `writer2_wf_${suffix}@solitiquo.cm`, hashedPassword]);
    writerUser2 = uWriter2.rows[0];

    const uReader = await pool.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'reader', TRUE) RETURNING id, username, email, role
    `, [`reader_wf_${suffix}`, `reader_wf_${suffix}@solitiquo.cm`, hashedPassword]);
    readerUser = uReader.rows[0];

    // Agents de test
    const aAdmin = await createAuthAgent(adminUser);
    adminAgent = aAdmin.agent;
    adminCsrf = aAdmin.csrfToken;

    const aWriter1 = await createAuthAgent(writerUser1);
    writer1Agent = aWriter1.agent;
    writer1Csrf = aWriter1.csrfToken;

    const aWriter2 = await createAuthAgent(writerUser2);
    writer2Agent = aWriter2.agent;
    writer2Csrf = aWriter2.csrfToken;

    const aReader = await createAuthAgent(readerUser);
    readerAgent = aReader.agent;
    readerCsrf = aReader.csrfToken;

    // 2. Territoire Cameroun
    const terRes = await pool.query("SELECT id FROM territories WHERE code = 'CMR'");
    territoryId = terRes.rows[0].id;

    // 3. Indicateur de test
    const indRes = await pool.query(
      "INSERT INTO data_indicators (code, name, category, unit, is_active) VALUES ($1, 'Indicateur Workflow', 'economie', 'units', TRUE) RETURNING id",
      [indCode]
    );
    indicatorId = indRes.rows[0].id;

    // 4. Sources documentaires
    const src1Res = await pool.query(
      "INSERT INTO data_sources (name, institution_type) VALUES ($1, 'national_statistical_office') RETURNING id",
      [`Source INS ${suffix}`]
    );
    sourceId = src1Res.rows[0].id;

    const src2Res = await pool.query(
      "INSERT INTO data_sources (name, institution_type) VALUES ($1, 'un_agency') RETURNING id",
      [`Source Banque Mondiale ${suffix}`]
    );
    source2Id = src2Res.rows[0].id;

    // 5. Dimension et Item de ventilation
    const dimRes = await pool.query(
      "INSERT INTO breakdown_dimensions (code, label, dimension_type) VALUES ($1, 'Dimension Workflow', 'demographics') RETURNING id",
      [dimCode]
    );
    dimId = dimRes.rows[0].id;

    const itemRes = await pool.query(
      "INSERT INTO breakdown_items (dimension_id, code, label) VALUES ($1, $2, 'Tranche 18-25') RETURNING id",
      [dimId, itemCode]
    );
    itemId = itemRes.rows[0].id;
  });

  after(async () => {
    try {
      await pool.query("UPDATE data_indicators SET is_active = FALSE WHERE id = $1", [indicatorId]);
    } catch {
      // Nettoyage de fin
    }
  });

  // =========================================================================
  // 1. SÉCURITÉ CSRF ET RESTRICTION D'ACCÈS PAR RÔLE
  // =========================================================================
  describe('Sécurité : CSRF et Permissions par Rôle', () => {
    test('403 — Rejet d une requête mutante sans token CSRF', async () => {
      const res = await writer1Agent
        .post('/api/data/admin/values')
        .send({
          indicator_id: indicatorId,
          territory_id: territoryId,
          period_type: 'ANNUAL',
          period_start: '2024-01-01',
          period_end: '2024-12-31',
          value_numeric: 100,
          methodology_nature: 'census'
        });

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /CSRF/i);
    });

    test('403 — Rejet d un utilisateur anonyme (sans session) sur l administration', async () => {
      const res = await request(app).get('/api/data/admin/values');
      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
    });

    test('403 — Rejet d un simple lecteur (reader) sur l administration', async () => {
      const res = await readerAgent.get('/api/data/admin/values');
      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
    });

    test('403 — Rejet d un rédacteur tentant une opération d administration (publication directe)', async () => {
      const res = await writer1Agent
        .post('/api/data/admin/values/999/publish')
        .set('x-csrf-token', writer1Csrf)
        .send({});

      assert.equal(res.status, 403);
      assert.match(res.body.error, /administrateur/i);
    });
  });

  // =========================================================================
  // 2. CYCLE DE VIE : CRÉATION DU BROUILLON ET GESTION DES SOURCES / VENTILATIONS
  // =========================================================================
  describe('Cycle de vie : Création et enrichissement du brouillon', () => {
    let draftId;

    test('201 — Le rédacteur crée une observation en brouillon (draft)', async () => {
      const res = await writer1Agent
        .post('/api/data/admin/values')
        .set('x-csrf-token', writer1Csrf)
        .send({
          indicator_id: indicatorId,
          territory_id: territoryId,
          period_type: 'ANNUAL',
          period_start: '2024-01-01',
          period_end: '2024-12-31',
          value_numeric: 50.5,
          methodology_nature: 'sample_survey',
          internal_notes: 'Note interne confidentielle rédacteur 1',
          methodology_notes: 'Méthodologie par sondage stratifié'
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.editorial_status, 'draft');
      assert.equal(res.body.data.is_active, false);
      assert.equal(res.body.data.created_by, writerUser1.id);
      assert.equal(res.body.data.internal_notes, 'Note interne confidentielle rédacteur 1');

      draftId = res.body.data.id;
    });

    test('400 — Rejet de création si ni valeur ni missing_reason ou les deux', async () => {
      const res = await writer1Agent
        .post('/api/data/admin/values')
        .set('x-csrf-token', writer1Csrf)
        .send({
          indicator_id: indicatorId,
          territory_id: territoryId,
          period_type: 'ANNUAL',
          period_start: '2024-01-01',
          period_end: '2024-12-31',
          value_numeric: 50,
          value_text: 'Texte interdit en double',
          methodology_nature: 'census'
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
    });

    test('403 — Un autre rédacteur (writer 2) ne peut pas modifier le brouillon de writer 1', async () => {
      const res = await writer2Agent
        .put(`/api/data/admin/values/${draftId}`)
        .set('x-csrf-token', writer2Csrf)
        .send({ value_numeric: 75.0 });

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
    });

    test('200 — L auteur du brouillon (writer 1) peut le modifier', async () => {
      const res = await writer1Agent
        .put(`/api/data/admin/values/${draftId}`)
        .set('x-csrf-token', writer1Csrf)
        .send({ value_numeric: 55.0 });

      assert.equal(res.status, 200);
      assert.equal(Number(res.body.data.value_numeric), 55.0);
    });

    test('400 — Rejet de soumission sans source principale (source_role = primary)', async () => {
      const res = await writer1Agent
        .post(`/api/data/admin/values/${draftId}/submit`)
        .set('x-csrf-token', writer1Csrf)
        .send({});

      assert.equal(res.status, 400);
      assert.match(res.body.error, /source documentaire principale/i);
    });

    test('201 — Ajout d une source principale obligatoire et d une ventilation', async () => {
      // 1. Ajout source principale
      const srcRes = await writer1Agent
        .post(`/api/data/admin/values/${draftId}/sources`)
        .set('x-csrf-token', writer1Csrf)
        .send({
          source_id: sourceId,
          source_role: 'primary',
          documentary_tier: 'TIER_1_OFFICIAL',
          citation_reference: 'Enquête Nationale sur l Emploi 2024, Tab. 3'
        });
      assert.equal(srcRes.status, 201);
      assert.equal(srcRes.body.success, true);

      // 2. Ajout ventilation
      const brkRes = await writer1Agent
        .post(`/api/data/admin/values/${draftId}/breakdowns`)
        .set('x-csrf-token', writer1Csrf)
        .send({
          breakdown_item_id: itemId,
          value_numeric: 27.5,
          percentage: 50.0,
          rank: 1
        });
      assert.equal(brkRes.status, 201);
      assert.equal(brkRes.body.success, true);
    });
  });

  // =========================================================================
  // 3. WORKFLOW COMPLET : DRAFT -> UNDER_REVIEW -> METHODOLOGICALLY_VALIDATED -> PUBLISHED
  // =========================================================================
  describe('Workflow d approbation et publication', () => {
    let observationId;

    before(async () => {
      // Créer un brouillon propre avec source principale
      const res = await writer1Agent
        .post('/api/data/admin/values')
        .set('x-csrf-token', writer1Csrf)
        .send({
          indicator_id: indicatorId,
          territory_id: territoryId,
          period_type: 'ANNUAL',
          period_start: '2024-01-01',
          period_end: '2024-12-31',
          value_numeric: 120.0,
          methodology_nature: 'census',
          internal_notes: 'Brouillon pour workflow complet',
          sources: [
            {
              source_id: sourceId,
              source_role: 'primary',
              documentary_tier: 'TIER_1_OFFICIAL',
              citation_reference: 'Rapport Officiel RGPH 2024'
            }
          ]
        });
      observationId = res.body.data.id;
    });

    test('400 — Impossible de publier directement depuis le statut draft', async () => {
      const res = await adminAgent
        .post(`/api/data/admin/values/${observationId}/publish`)
        .set('x-csrf-token', adminCsrf)
        .send({});

      assert.equal(res.status, 400);
      assert.match(res.body.error, /methodologically_validated/i);
    });

    test('200 — Soumission à validation (draft -> under_review)', async () => {
      const res = await writer1Agent
        .post(`/api/data/admin/values/${observationId}/submit`)
        .set('x-csrf-token', writer1Csrf)
        .send({});

      assert.equal(res.status, 200);
      assert.equal(res.body.data.editorial_status, 'under_review');
    });

    test('200 — Rejet avec justification et retour au workflow', async () => {
      // Rejet par l'admin
      const rejRes = await adminAgent
        .post(`/api/data/admin/values/${observationId}/reject`)
        .set('x-csrf-token', adminCsrf)
        .send({ rejection_reason: 'Données nécessitant un recalibrage méthodologique' });

      assert.equal(rejRes.status, 200);
      assert.equal(rejRes.body.data.editorial_status, 'rejected');

      // Re-soumission par le rédacteur après correction
      const reSubRes = await writer1Agent
        .post(`/api/data/admin/values/${observationId}/submit`)
        .set('x-csrf-token', writer1Csrf)
        .send({});

      assert.equal(reSubRes.status, 200);
      assert.equal(reSubRes.body.data.editorial_status, 'under_review');
    });

    test('200 — Validation méthodologique (under_review -> methodologically_validated)', async () => {
      const res = await adminAgent
        .post(`/api/data/admin/values/${observationId}/validate`)
        .set('x-csrf-token', adminCsrf)
        .send({ validation_notes: 'Méthodologie vérifiée conforme aux normes INS' });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.editorial_status, 'methodologically_validated');
      assert.equal(res.body.data.validated_by, adminUser.id);
    });

    test('200 — Publication par l administrateur (methodologically_validated -> published)', async () => {
      const res = await adminAgent
        .post(`/api/data/admin/values/${observationId}/publish`)
        .set('x-csrf-token', adminCsrf)
        .send({ public_reason_summary: 'Publication officielle validée' });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.editorial_status, 'published');
      assert.equal(res.body.data.is_active, true);
      assert.equal(res.body.data.published_by, adminUser.id);
      assert.ok(res.body.data.published_at);
    });

    test('Vérification DB : Snapshot créé automatiquement dans data_value_versions', async () => {
      const snapRes = await pool.query(
        'SELECT * FROM data_value_versions WHERE data_value_id = $1',
        [observationId]
      );
      assert.equal(snapRes.rows.length, 1);
      assert.equal(Number(snapRes.rows[0].value_numeric), 120.0);
      assert.equal(snapRes.rows[0].revision_number, 1);
    });

    test('Immutabilité : interdiction stricte de modifier sur place une valeur publiée', async () => {
      const res = await adminAgent
        .put(`/api/data/admin/values/${observationId}`)
        .set('x-csrf-token', adminCsrf)
        .send({ value_numeric: 200.0 });

      assert.equal(res.status, 400);
      assert.match(res.body.error, /révision/i);
    });
  });

  // =========================================================================
  // 4. RÉVISION D'UNE OBSERVATION PUBLIÉE ET ARCHIVAGE / RÉVOCATION
  // =========================================================================
  describe('Révision, Révocation et Archivage', () => {
    let publishedId;
    let revisionId;

    before(async () => {
      // 1. Créer et publier une observation de référence
      const draftRes = await adminAgent
        .post('/api/data/admin/values')
        .set('x-csrf-token', adminCsrf)
        .send({
          indicator_id: indicatorId,
          territory_id: territoryId,
          period_type: 'ANNUAL',
          period_start: '2023-01-01',
          period_end: '2023-12-31',
          value_numeric: 300.0,
          methodology_nature: 'administrative_record',
          sources: [
            {
              source_id: sourceId,
              source_role: 'primary',
              documentary_tier: 'TIER_1_OFFICIAL',
              citation_reference: 'Registre 2023'
            }
          ],
          breakdowns: [
            {
              breakdown_item_id: itemId,
              value_numeric: 150.0,
              percentage: 50.0,
              rank: 1
            }
          ]
        });
      publishedId = draftRes.body.data.id;

      await adminAgent.post(`/api/data/admin/values/${publishedId}/submit`).set('x-csrf-token', adminCsrf).send({});
      await adminAgent.post(`/api/data/admin/values/${publishedId}/validate`).set('x-csrf-token', adminCsrf).send({});
      await adminAgent.post(`/api/data/admin/values/${publishedId}/publish`).set('x-csrf-token', adminCsrf).send({});
    });

    test('201 — Création d une révision (R2) d une observation publiée', async () => {
      const res = await writer1Agent
        .post(`/api/data/admin/values/${publishedId}/revise`)
        .set('x-csrf-token', writer1Csrf)
        .send({ reason: 'Correction des chiffres définitifs 2023' });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);

      const rev = res.body.data;
      revisionId = rev.id;
      assert.notEqual(revisionId, publishedId);
      assert.equal(rev.supersedes_id, publishedId);
      assert.equal(rev.revision_number, 2);
      assert.equal(rev.editorial_status, 'draft');
      assert.equal(rev.is_active, false);

      // Vérifier le clonage des sources et ventilations
      assert.equal(rev.sources.length, 1);
      assert.equal(rev.sources[0].source_id, sourceId);
      assert.equal(rev.breakdowns.length, 1);
      assert.equal(rev.breakdowns[0].breakdown_item_id, itemId);

      // Vérifier que l'originale reste toujours publiée et active
      const origRes = await adminAgent.get(`/api/data/admin/values/${publishedId}`);
      assert.equal(origRes.body.data.editorial_status, 'published');
      assert.equal(origRes.body.data.is_active, true);
    });

    test('409 — Protection concurrence : impossible de créer une deuxième révision si une est en cours', async () => {
      const res = await adminAgent
        .post(`/api/data/admin/values/${publishedId}/revise`)
        .set('x-csrf-token', adminCsrf)
        .send({ reason: 'Tentative concurrente' });

      assert.equal(res.status, 409);
      assert.match(res.body.error, /déjà en cours/i);
    });

    test('Publication de la révision R2 -> bascule atomique de R1 en superseded', async () => {
      // 1. Modifier la valeur dans la révision
      await writer1Agent
        .put(`/api/data/admin/values/${revisionId}`)
        .set('x-csrf-token', writer1Csrf)
        .send({ value_numeric: 310.0 });

      // 2. Soumettre et valider
      await writer1Agent.post(`/api/data/admin/values/${revisionId}/submit`).set('x-csrf-token', writer1Csrf).send({});
      await adminAgent.post(`/api/data/admin/values/${revisionId}/validate`).set('x-csrf-token', adminCsrf).send({});

      // 3. Publier la révision
      const pubRevRes = await adminAgent
        .post(`/api/data/admin/values/${revisionId}/publish`)
        .set('x-csrf-token', adminCsrf)
        .send({ public_reason_summary: 'Chiffres révisés validés' });

      assert.equal(pubRevRes.status, 200);
      assert.equal(pubRevRes.body.data.editorial_status, 'published');
      assert.equal(pubRevRes.body.data.is_active, true);

      // 4. Vérifier que l'observation précédente est devenue 'superseded' et inactive
      const oldRes = await adminAgent.get(`/api/data/admin/values/${publishedId}`);
      assert.equal(oldRes.body.data.editorial_status, 'superseded');
      assert.equal(oldRes.body.data.is_active, false);
      assert.equal(oldRes.body.data.superseded_by_id, revisionId);

      // 5. Vérifier sur l'API publique : pour l'année 2023, seule la révision active R2 (310.0) est renvoyée (R1 superseded est exclue)
      const pubApiRes = await request(app).get(`/api/data/indicators/${indCode}/values?year=2023`);
      assert.equal(pubApiRes.status, 200);
      assert.equal(pubApiRes.body.data.length, 1);
      assert.equal(pubApiRes.body.data[0].id, revisionId);
      assert.equal(Number(pubApiRes.body.data[0].value_numeric), 310.0);
    });

    test('200 — Révocation d une observation publiée avec motif public obligatoire', async () => {
      const res = await adminAgent
        .post(`/api/data/admin/values/${revisionId}/revoke`)
        .set('x-csrf-token', adminCsrf)
        .send({ reason: 'Erreur matérielle détectée dans les calculs sources' });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.editorial_status, 'revoked');
      assert.equal(res.body.data.is_active, false);
      assert.equal(res.body.data.public_reason_summary, 'Erreur matérielle détectée dans les calculs sources');

      // Sur l'API publique, la valeur révoquée ne doit plus être accessible
      const pubCheck = await request(app).get(`/api/data/values/${revisionId}`);
      assert.equal(pubCheck.status, 404);
    });

    test('200 — Archivage d une observation superseded', async () => {
      const res = await adminAgent
        .post(`/api/data/admin/values/${publishedId}/archive`)
        .set('x-csrf-token', adminCsrf)
        .send({});

      assert.equal(res.status, 200);
      assert.equal(res.body.data.editorial_status, 'archived');
      assert.equal(res.body.data.is_active, false);
    });
  });

  // =========================================================================
  // 5. ÉTANCHÉITÉ DES NOTES INTERNES
  // =========================================================================
  describe('Étanchéité des notes internes et métadonnées d audit', () => {
    let testValId;
    const confidentialNote = `CONFIDENTIAL_ADMIN_NOTE_${suffix}`;

    before(async () => {
      const res = await adminAgent
        .post('/api/data/admin/values')
        .set('x-csrf-token', adminCsrf)
        .send({
          indicator_id: indicatorId,
          territory_id: territoryId,
          period_type: 'ANNUAL',
          period_start: '2021-01-01',
          period_end: '2021-12-31',
          value_numeric: 400.0,
          methodology_nature: 'census',
          internal_notes: confidentialNote,
          sources: [
            {
              source_id: sourceId,
              source_role: 'primary',
              documentary_tier: 'TIER_1_OFFICIAL',
              citation_reference: 'Recensement 2021'
            }
          ]
        });
      testValId = res.body.data.id;

      await adminAgent.post(`/api/data/admin/values/${testValId}/submit`).set('x-csrf-token', adminCsrf).send({});
      await adminAgent.post(`/api/data/admin/values/${testValId}/validate`).set('x-csrf-token', adminCsrf).send({});
      await adminAgent.post(`/api/data/admin/values/${testValId}/publish`).set('x-csrf-token', adminCsrf).send({});
    });

    test('L endpoint d administration retourne bien les notes internes', async () => {
      const res = await adminAgent.get(`/api/data/admin/values/${testValId}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.data.internal_notes.includes(confidentialNote));
    });

    test('L endpoint public ne divulgue JAMAIS les notes internes ni created_by', async () => {
      const res = await request(app).get(`/api/data/values/${testValId}`);
      assert.equal(res.status, 200);

      const json = JSON.stringify(res.body);
      assert.ok(!json.includes(confidentialNote));
      assert.ok(!json.includes('internal_notes'));
      assert.ok(!json.includes('created_by'));
      assert.ok(!json.includes('validated_by'));
      assert.ok(!json.includes('published_by'));
    });
  });
});
