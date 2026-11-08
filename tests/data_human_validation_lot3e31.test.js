/**
 * =============================================================================
 * SOLITIQUO DATA — LOT 3E.3.1
 * SUITE DE TESTS : AUDIT CONTRADICTOIRE DES RATTACHEMENTS DOCUMENTAIRES ET
 * VÉRIFICATION FONCTIONNELLE DE L'ARBITRAGE HUMAIN
 * =============================================================================
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../server');
const pool = require('../backend/config/database');

describe('SOLITIQUO DATA — LOT 3E.3.1 : AUDIT CONTRADICTOIRE ET VÉRIFICATION D\'ARBITRAGE', () => {
  const suffix = Date.now().toString().slice(-6);
  const rawPassword = 'Password123*';
  let adminUser;
  let writerUser;
  let readerUser;
  let adminAgent;
  let adminCsrf;
  let writerAgent;
  let _writerCsrf;
  let readerAgent;
  let _readerCsrf;

  const _wave1Ids = [693, 694, 695, 696, 698, 699, 700, 701, 706, 707, 708, 709, 710];
  const tbsPrimaryIds = [706, 707, 708, 709, 710];
  const _allPilotIds = Array.from({ length: 24 }, (_, i) => 687 + i);

  const testIsoValues = [];

  before(async () => {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(rawPassword, salt);

    // 1. Admin
    const uAdmin = await pool.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'admin', TRUE) RETURNING id, username, email, role
    `, [`adm_lot3e31_${suffix}`, `adm_lot3e31_${suffix}@solitiquo.cm`, hashedPassword]);
    adminUser = uAdmin.rows[0];

    // 2. Writer
    const uWriter = await pool.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'writer', TRUE) RETURNING id, username, email, role
    `, [`wri_lot3e31_${suffix}`, `wri_lot3e31_${suffix}@solitiquo.cm`, hashedPassword]);
    writerUser = uWriter.rows[0];

    // 3. Reader
    const uReader = await pool.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'reader', TRUE) RETURNING id, username, email, role
    `, [`rdr_lot3e31_${suffix}`, `rdr_lot3e31_${suffix}@solitiquo.cm`, hashedPassword]);
    readerUser = uReader.rows[0];

    // Agents & Sessions
    adminAgent = request.agent(app);
    await adminAgent.post('/api/auth/login').send({ email: adminUser.email, password: rawPassword }).expect(200);
    const csrfAdminRes = await adminAgent.get('/api/csrf-token');
    adminCsrf = csrfAdminRes.body.csrfToken;

    writerAgent = request.agent(app);
    await writerAgent.post('/api/auth/login').send({ email: writerUser.email, password: rawPassword }).expect(200);
    const csrfWriterRes = await writerAgent.get('/api/csrf-token');
    _writerCsrf = csrfWriterRes.body.csrfToken;

    readerAgent = request.agent(app);
    await readerAgent.post('/api/auth/login').send({ email: readerUser.email, password: rawPassword }).expect(200);
    const csrfReaderRes = await readerAgent.get('/api/csrf-token');
    _readerCsrf = csrfReaderRes.body.csrfToken;
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
        console.warn('Nettoyage testIsoValues Lot 3E.3.1:', err.message);
      }
    }

    // Nettoyage des utilisateurs de test
    const userIds = [adminUser?.id, writerUser?.id, readerUser?.id].filter(Boolean);
    if (userIds.length > 0) {
      try {
        await pool.query('DELETE FROM users WHERE id = ANY($1)', [userIds]);
      } catch (err) {
        if (err.code !== '23001') console.warn('Nettoyage users Lot 3E.3.1:', err.message);
      }
    }
  });

  // ===========================================================================
  // SECTION 1 : AUDIT CONTRADICTOIRE DES OBSERVATIONS TBS PRIMAIRE (#706 À #710)
  // ===========================================================================
  describe('1. Audit contradictoire du rattachement documentaire du TBS primaire (#706 à #710)', () => {
    test('1.1 Identification exacte des sources et publications pour chacune des 5 observations', async () => {
      const res = await pool.query(`
        SELECT dv.id, dv.school_year, dv.value_numeric,
               dvs.source_id, ds.acronym AS source_acronym, ds.name AS source_name,
               dvs.citation_reference, dvs.citation_url, dvs.documentary_tier, dvs.methodological_robustness
        FROM data_values dv
        JOIN data_value_sources dvs ON dvs.data_value_id = dv.id
        JOIN data_sources ds ON ds.id = dvs.source_id
        WHERE dv.id BETWEEN 706 AND 710
        ORDER BY dv.id ASC;
      `);

      assert.strictEqual(res.rows.length, 5, 'Exactement 5 observations pour EDU_PRIM_GROSS');

      // #706 à #709 : Source déclarée INS (Annuaire Statistique 2023, Tab 4.3, p. 76)
      for (let i = 0; i < 4; i++) {
        const row = res.rows[i];
        assert.strictEqual(row.source_acronym, 'INS', `Obs #${row.id} est rattachée à l'INS`);
        assert.strictEqual(row.documentary_tier, 'TIER_1_OFFICIAL');
        assert.strictEqual(row.methodological_robustness, 'medium');
        assert.ok(row.citation_reference.includes('Tableau 4.3, p. 76'));
        assert.ok(row.citation_reference.includes('Annuaire Statistique du Cameroun — Édition 2023'));
      }

      // #710 : Source déclarée MINEDUB (Annuaire 2022/2023, Tab 3.4, p. 45)
      const obs710 = res.rows[4];
      assert.strictEqual(obs710.source_acronym, 'MINEDUB', 'Obs #710 est rattachée au MINEDUB');
      assert.strictEqual(obs710.documentary_tier, 'TIER_1_OFFICIAL');
      assert.strictEqual(obs710.methodological_robustness, 'medium');
      assert.ok(obs710.citation_reference.includes('Tableau 3.4, p. 45'));
      assert.ok(obs710.citation_reference.includes('Annuaire Statistique de l\'Éducation de Base — Année scolaire 2022/2023'));
    });

    test('1.2 Concordance des valeurs statistiques 106.8%, 105.2%, 104.1%, 105.7% et 107.3%', async () => {
      const res = await pool.query(`
        SELECT id, school_year, value_numeric
        FROM data_values
        WHERE id BETWEEN 706 AND 710
        ORDER BY id ASC;
      `);

      const expected = [
        { id: 706, year: '2018/2019', val: 106.8 },
        { id: 707, year: '2019/2020', val: 105.2 },
        { id: 708, year: '2020/2021', val: 104.1 },
        { id: 709, year: '2021/2022', val: 105.7 },
        { id: 710, year: '2022/2023', val: 107.3 },
      ];

      for (let i = 0; i < 5; i++) {
        assert.strictEqual(parseInt(res.rows[i].id, 10), expected[i].id);
        assert.strictEqual(res.rows[i].school_year, expected[i].year);
        assert.strictEqual(parseFloat(res.rows[i].value_numeric), expected[i].val);
      }
    });

    test('1.3 Les preuves documentaires des 5 observations TBS restent non archivées (unavailable) et recommandent pending_evidence', async () => {
      for (const id of tbsPrimaryIds) {
        const res = await adminAgent
          .get(`/api/data/admin/values/${id}`)
          .expect(200);

        const ev = res.body.data.evidence_evaluation;
        assert.ok(ev, 'evidence_evaluation obligatoire');
        assert.strictEqual(ev.is_pdf_archived, false, 'Aucun PDF original certifié archivé');
        assert.strictEqual(ev.document_status, 'unavailable', 'Statut documentaire unavailable (timeout portail / DNS non résolu)');
        assert.strictEqual(ev.proposed_decision, 'pending_evidence', 'Arbitrage technique proposé : pending_evidence');
        assert.ok(ev.guidance_message.includes('unavailable') || ev.guidance_message.includes('inaccessible') || ev.guidance_message.includes('pending_evidence'));
      }
    });
  });

  // ===========================================================================
  // SECTION 2 : CONTRÔLE DES AUTRES SOURCES DE LA VAGUE 1 (#693-#696, #698-#701)
  // ===========================================================================
  describe('2. Audit des observations PIB nominal (#693-#696) et Croissance (#698-#701)', () => {
    test('2.1 Cohérence complète des 4 dossiers du PIB nominal (SCN 2008, INS, Tableau 1 p. 12)', async () => {
      const res = await adminAgent
        .get('/api/data/admin/values?wave=wave1&indicator_code=ECO_PIB_NOM')
        .expect(200);

      assert.strictEqual(res.body.data.length, 4);
      for (const obs of res.body.data) {
        assert.strictEqual(obs.indicator_unit, 'milliards_fcfa');
        assert.strictEqual(obs.methodology_nature, 'administrative_record');
        assert.ok(obs.sources[0].citation_reference.includes('Tableau 1, p. 12'));
        assert.strictEqual(obs.sources[0].methodological_robustness, 'high');
        assert.strictEqual(obs.sources[0].documentary_tier, 'TIER_1_OFFICIAL');
      }
    });

    test('2.2 Cohérence complète des 4 dossiers de Croissance du PIB (volume réel, INS, Tableau 2 p. 14)', async () => {
      const res = await adminAgent
        .get('/api/data/admin/values?wave=wave1&indicator_code=ECO_PIB_GROWTH')
        .expect(200);

      assert.strictEqual(res.body.data.length, 4);
      for (const obs of res.body.data) {
        assert.strictEqual(obs.indicator_unit, 'pourcentage');
        assert.strictEqual(obs.methodology_nature, 'administrative_record');
        assert.ok(obs.sources[0].citation_reference.includes('Tableau 2, p. 14'));
        assert.strictEqual(obs.sources[0].methodological_robustness, 'high');
        assert.strictEqual(obs.sources[0].documentary_tier, 'TIER_1_OFFICIAL');
      }
    });

    test('2.3 Statut documentaire institutional_reference_only et absence de fausse preuve consultée', async () => {
      for (const id of [693, 694, 695, 696, 698, 699, 700, 701]) {
        const res = await adminAgent
          .get(`/api/data/admin/values/${id}`)
          .expect(200);

        const ev = res.body.data.evidence_evaluation;
        assert.strictEqual(ev.is_pdf_archived, false);
        assert.strictEqual(ev.document_status, 'institutional_reference_only');
        assert.strictEqual(ev.proposed_decision, 'pending_evidence');
        assert.ok(ev.guidance_message.includes('institutional_reference_only') || ev.guidance_message.includes('institutionnelle'));
      }
    });
  });

  // ===========================================================================
  // SECTION 3 : AUDIT FONCTIONNEL DE L'INTERFACE ET DE L'API D'ARBITRAGE
  // ===========================================================================
  describe('3. Audit fonctionnel approfondi du moteur d\'arbitrage humain', () => {
    let blankObsId;
    let fullObsId;

    before(async () => {
      // 1. Observation SANS source (preuves nulles / dossier vide)
      const insBlank = await pool.query(`
        INSERT INTO data_values (
          indicator_id, territory_id, period_type, period_start, period_end,
          value_numeric, methodology_nature, editorial_status, is_active,
          audit_status, audit_decision, created_by
        ) VALUES (
          137, 1, 'ANNUAL', '2014-01-01', '2014-12-31',
          15000.0, 'administrative_record', 'under_review', FALSE,
          'confirmed', 'pending', $1
        ) RETURNING id;
      `, [adminUser.id]);
      blankObsId = insBlank.rows[0].id;
      testIsoValues.push(blankObsId);

      // 2. Observation avec source primaire qualifiée
      const insFull = await pool.query(`
        INSERT INTO data_values (
          indicator_id, territory_id, period_type, period_start, period_end,
          value_numeric, methodology_nature, editorial_status, is_active,
          audit_status, audit_decision, created_by
        ) VALUES (
          137, 1, 'ANNUAL', '2013-01-01', '2013-12-31',
          14000.0, 'administrative_record', 'under_review', FALSE,
          'confirmed', 'pending', $1
        ) RETURNING id;
      `, [adminUser.id]);
      fullObsId = insFull.rows[0].id;
      testIsoValues.push(fullObsId);

      await pool.query(`
        INSERT INTO data_value_sources (
          data_value_id, source_id, source_role, documentary_tier,
          citation_reference, methodological_robustness, created_by
        ) VALUES (
          $1, 282, 'primary', 'TIER_1_OFFICIAL',
          'Comptes Nationaux Test Audit Ref Tab 1 p 10', 'high', $2
        );
      `, [fullObsId, adminUser.id]);
    });

    test('3.1 Impossibilité formelle d\'accepter un audit dont le dossier est dépourvu de toute preuve (400)', async () => {
      const res = await adminAgent
        .post(`/api/data/admin/values/${blankObsId}/audit-decision`)
        .set('X-CSRF-Token', adminCsrf)
        .send({
          decision: 'accepted',
          notes: 'Tentative d acceptation sur dossier vide sans sources'
        })
        .expect(400);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.error.includes('preuve') || res.body.error.includes('source'));
    });

    test('3.2 Traçabilité inaltérable de la décision, de l\'administrateur et de l\'horodatage', async () => {
      const res = await adminAgent
        .post(`/api/data/admin/values/${fullObsId}/audit-decision`)
        .set('X-CSRF-Token', adminCsrf)
        .send({
          decision: 'pending_evidence',
          notes: 'Attente formelle du rapport original certifié',
          evidence_reference: 'Courrier commission N°2026/05'
        })
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.audit_decision, 'pending_evidence');
      assert.strictEqual(res.body.data.audit_decision_by, adminUser.id);
      assert.strictEqual(res.body.data.audit_decision_by_username, adminUser.username);
      assert.ok(res.body.data.audit_decision_at);
      assert.strictEqual(res.body.data.audit_decision_notes, 'Attente formelle du rapport original certifié');

      // Vérification dans le journal d'audit immuable
      const logRes = await pool.query(`
        SELECT * FROM data_value_audit_log
        WHERE data_value_id = $1
        ORDER BY id DESC LIMIT 1;
      `, [fullObsId]);

      assert.strictEqual(logRes.rows.length, 1);
      assert.strictEqual(logRes.rows[0].action, 'KEEP_PENDING');
      assert.strictEqual(logRes.rows[0].performed_by, adminUser.id);
      assert.strictEqual(logRes.rows[0].reason, 'Attente formelle du rapport original certifié');
    });

    test('3.3 Résistance aux doubles soumissions concurrentes (SELECT FOR UPDATE)', async () => {
      // Exécution simultanée de deux décisions d'audit sur la même observation
      const [req1, req2] = await Promise.all([
        adminAgent
          .post(`/api/data/admin/values/${fullObsId}/audit-decision`)
          .set('X-CSRF-Token', adminCsrf)
          .send({ decision: 'correction_requested', notes: 'Demande de correction concurrente A' }),
        adminAgent
          .post(`/api/data/admin/values/${fullObsId}/audit-decision`)
          .set('X-CSRF-Token', adminCsrf)
          .send({ decision: 'accepted', notes: 'Acceptation concurrente B' })
      ]);

      // Les deux requêtes doivent être sérialisées proprement sans deadlock ni corruption
      assert.ok(req1.status === 200);
      assert.ok(req2.status === 200);

      const finalRes = await pool.query('SELECT audit_decision FROM data_values WHERE id = $1', [fullObsId]);
      assert.ok(['accepted', 'correction_requested'].includes(finalRes.rows[0].audit_decision));
    });
  });

  // ===========================================================================
  // SECTION 4 : NON-ALTÉRATION STRICTE DU CORPUS RÉEL (#687 À #710 ET #261)
  // ===========================================================================
  describe('4. Préservation absolue et non-altération du corpus', () => {
    test('4.1 Les 24 observations pilotes (#687 à #710) demeurent strictement en draft, is_active=FALSE, audit_decision=pending', async () => {
      const res = await pool.query(`
        SELECT id, editorial_status, is_active, audit_decision
        FROM data_values
        WHERE id BETWEEN 687 AND 710
        ORDER BY id ASC;
      `);

      assert.strictEqual(res.rows.length, 24);
      for (const row of res.rows) {
        assert.strictEqual(row.editorial_status, 'draft', `Obs #${row.id} doit rester au statut draft`);
        assert.strictEqual(row.is_active, false, `Obs #${row.id} doit être inactive`);
        assert.strictEqual(row.audit_decision, 'pending', `Obs #${row.id} doit rester pending`);
      }
    });

    test('4.2 L\'observation historique #261 est strictement intacte (29 850 Mrds, 2024, published, is_active=TRUE)', async () => {
      const res = await pool.query(`
        SELECT dv.id, di.code, dv.value_numeric, dv.period_start, dv.editorial_status, dv.is_active
        FROM data_values dv
        JOIN data_indicators di ON di.id = dv.indicator_id
        WHERE dv.id = 261;
      `);

      assert.strictEqual(res.rows.length, 1);
      const row = res.rows[0];
      assert.strictEqual(row.code, 'ECO_PIB_NOM');
      assert.strictEqual(parseFloat(row.value_numeric), 29850);
      assert.strictEqual(new Date(row.period_start).getFullYear(), 2024);
      assert.strictEqual(row.editorial_status, 'published');
      assert.strictEqual(row.is_active, true);
    });
  });
});
