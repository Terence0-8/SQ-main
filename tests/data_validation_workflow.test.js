/**
 * =============================================================================
 * SOLITIQUO DATA — LOTS 3C.2 & 3C.2.1
 * SUITE DE TESTS : RÉCONCILIATION, SÉCURISATION DU WORKFLOW ET VALIDATION
 * =============================================================================
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../server');
const pool = require('../backend/config/database');
const dataAdminService = require('../backend/services/dataAdminService');

describe('SOLITIQUO DATA — LOTS 3C.2 & 3C.2.1 WORKFLOW, RÉCONCILIATION ET SÉCURISATION SUITE', () => {
  const suffix = Date.now().toString().slice(-6);
  const rawPassword = 'Password123*';
  let adminUser;
  let readerUser;
  let adminAgent;
  let adminCsrf;
  let readerAgent;

  // Données isolées pour les tests de mutation du workflow
  const testIsoValues = [];

  before(async () => {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(rawPassword, salt);

    // 1. Créer l'administrateur de test
    const uAdmin = await pool.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'admin', TRUE) RETURNING id, username, email, role
    `, [`admin_val_${suffix}`, `admin_val_${suffix}@solitiquo.cm`, hashedPassword]);
    adminUser = uAdmin.rows[0];

    // 2. Créer un lecteur simple de test
    const uReader = await pool.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'reader', TRUE) RETURNING id, username, email, role
    `, [`reader_val_${suffix}`, `reader_val_${suffix}@solitiquo.cm`, hashedPassword]);
    readerUser = uReader.rows[0];

    adminAgent = request.agent(app);
    await adminAgent.post('/api/auth/login').send({
      email: adminUser.email,
      password: rawPassword
    }).expect(200);

    const csrfRes = await adminAgent.get('/api/csrf-token');
    adminCsrf = csrfRes.body.csrfToken;

    readerAgent = request.agent(app);
    await readerAgent.post('/api/auth/login').send({
      email: readerUser.email,
      password: rawPassword
    }).expect(200);

    // 3. Créer 5 observations ISOLÉES pour tester les mutations de workflow sans altérer les 24 données réelles pilotes
    const sampleIndicators = [
      'POP_TOT_COUNT',
      'ECO_PIB_NOM',
      'ECO_PIB_GROWTH',
      'LAB_UNEMP_RATE',
      'EDU_PRIM_GROSS'
    ];

    const indRes = await pool.query('SELECT id, code FROM data_indicators WHERE code = ANY($1)', [sampleIndicators]);
    const indMap = {};
    indRes.rows.forEach(r => { indMap[r.code] = r.id; });

    const terRes = await pool.query("SELECT id FROM territories WHERE code = 'CMR'");
    const cmrId = terRes.rows[0].id;

    const srcRes = await pool.query("SELECT id FROM data_sources WHERE acronym = 'INS'");
    const insId = srcRes.rows[0].id;

    for (const code of sampleIndicators) {
      const insVal = await pool.query(`
        INSERT INTO data_values (
          indicator_id, territory_id, period_type, period_start, period_end,
          value_numeric, methodology_nature, editorial_status, is_active,
          created_by, audit_status, audit_decision, audit_caveat
        ) VALUES (
          $1, $2, 'ANNUAL', '2099-01-01', '2099-12-31',
          123.45, 'sample_survey', 'draft', FALSE,
          $3, 'confirmed', 'pending', 'Observation de test isolée pour le workflow'
        ) RETURNING id;
      `, [indMap[code], cmrId, adminUser.id]);

      const valId = insVal.rows[0].id;
      testIsoValues.push({ id: valId, code });

      await pool.query(`
        INSERT INTO data_value_sources (
          data_value_id, source_id, source_role, documentary_tier,
          citation_reference, methodological_robustness, created_by
        ) VALUES (
          $1, $2, 'primary', 'TIER_1_OFFICIAL',
          'Rapport de test pour observation isolée', 'medium', $3
        );
      `, [valId, insId, adminUser.id]);
    }
  });

  after(async () => {
    // 1. Nettoyer les sources et ventilations des observations isolées de test
    if (testIsoValues.length > 0) {
      try {
        const ids = testIsoValues.map(v => v.id);
        await pool.query("UPDATE data_values SET is_active = FALSE, editorial_status = 'draft' WHERE id = ANY($1)", [ids]);
        await pool.query('DELETE FROM data_value_sources WHERE data_value_id = ANY($1)', [ids]);
        await pool.query('DELETE FROM data_values WHERE id = ANY($1)', [ids]);
      } catch (err) {
        console.warn('Nettoyage testIsoValues:', err.message);
      }
    }

    // 2. Réinitialisation de sécurité des 24 observations pilotes au statut draft immaculé
    await pool.query(`
      UPDATE data_values 
      SET editorial_status = 'draft',
          is_active = FALSE,
          validated_by = NULL,
          published_by = NULL,
          published_at = NULL,
          audit_decision = 'pending',
          audit_decision_by = NULL,
          audit_decision_at = NULL,
          audit_decision_notes = NULL
      WHERE id BETWEEN 687 AND 710;
    `);

    // 3. Désactiver les utilisateurs de test
    if (adminUser) {
      try { await pool.query('UPDATE users SET is_active = FALSE WHERE id = $1', [adminUser.id]); } catch {}
    }
    if (readerUser) {
      try { await pool.query('UPDATE users SET is_active = FALSE WHERE id = $1', [readerUser.id]); } catch {}
    }
  });

  // ---------------------------------------------------------------------------
  // 1. CONFORMITÉ DU RÉSULTAT DE L'AUDIT 3C.1 ET DES 24 OBSERVATIONS
  // ---------------------------------------------------------------------------
  describe('1. Audit 3C.1 et qualification des 24 observations pilotes', () => {
    test('1.1 Exactement 13 observations confirmed et 11 confirmed_with_caveat', async () => {
      const res = await pool.query(`
        SELECT audit_status, count(*) AS count 
        FROM data_values 
        WHERE id BETWEEN 687 AND 710 
        GROUP BY audit_status
        ORDER BY audit_status ASC;
      `);

      const statusMap = {};
      res.rows.forEach(r => { statusMap[r.audit_status] = parseInt(r.count, 10); });

      assert.equal(statusMap['confirmed'], 13, '13 observations doivent être confirmées sans réserve');
      assert.equal(statusMap['confirmed_with_caveat'], 11, '11 observations doivent être confirmées avec réserves');
      assert.equal(statusMap['unverified'] || 0, 0, '0 observation unverified');
      assert.equal(statusMap['discrepancy'] || 0, 0, '0 divergence');
      assert.equal(statusMap['rejected'] || 0, 0, '0 rejet parmi les conservées');
    });

    test('1.2 Toutes les 24 observations demeurent au statut draft, audit_decision pending, et inactives', async () => {
      const res = await pool.query(`
        SELECT id, editorial_status, is_active, audit_decision
        FROM data_values 
        WHERE id BETWEEN 687 AND 710;
      `);

      assert.equal(res.rows.length, 24);
      res.rows.forEach(obs => {
        assert.equal(obs.editorial_status, 'draft', `L'observation #${obs.id} doit rester en 'draft'`);
        assert.equal(obs.is_active, false, `L'observation #${obs.id} doit avoir is_active = FALSE`);
        assert.equal(obs.audit_decision, 'pending', `L'observation #${obs.id} doit avoir audit_decision = 'pending'`);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 2. VÉRIFICATION DES RÈGLES MÉTHODOLOGIQUES PAR INDICATEUR
  // ---------------------------------------------------------------------------
  describe('2. Traitement et affichage des 5 réserves méthodologiques', () => {
    test('2.1 Population : mention projection démographique, base RGPH-3 2005, réserves arrondis', async () => {
      const res = await pool.query(`
        SELECT dv.id, dv.audit_status, dv.audit_caveat, dv.survey_or_account_status
        FROM data_values dv
        JOIN data_indicators di ON di.id = dv.indicator_id
        WHERE di.code = 'POP_TOT_COUNT' AND dv.id BETWEEN 687 AND 710
        ORDER BY dv.id ASC;
      `);

      assert.equal(res.rows.length, 6);
      res.rows.forEach(r => {
        assert.equal(r.audit_status, 'confirmed_with_caveat');
        assert.ok(r.survey_or_account_status.includes('Projection démographique'), 'Doit afficher Projection démographique');
        assert.ok(r.audit_caveat.includes('RGPH-3') && r.audit_caveat.includes('2005'), 'Doit citer RGPH-3 (2005)');
        assert.ok(r.audit_caveat.includes('arrondi') || r.audit_caveat.includes('RGPH-4'), 'Doit signaler les réserves d\'arrondi / RGPH-4');
      });
    });

    test('2.2 PIB nominal : distinction comptes définitifs vs semi-définitifs et robustesse', async () => {
      const res = await pool.query(`
        SELECT dv.id, TO_CHAR(dv.period_start, 'YYYY') AS year, dv.audit_status, dv.survey_or_account_status,
               dvs.methodological_robustness
        FROM data_values dv
        JOIN data_indicators di ON di.id = dv.indicator_id
        JOIN data_value_sources dvs ON dvs.data_value_id = dv.id
        WHERE di.code = 'ECO_PIB_NOM' AND dv.id BETWEEN 687 AND 710
        ORDER BY dv.id ASC;
      `);

      assert.equal(res.rows.length, 5);
      const obs2021 = res.rows.find(r => r.year === '2021');
      assert.equal(obs2021.audit_status, 'confirmed');
      assert.ok(obs2021.survey_or_account_status.includes('définitifs'));
      assert.equal(obs2021.methodological_robustness, 'high', 'Comptes définitifs = robustesse high');

      const obs2022 = res.rows.find(r => r.year === '2022');
      assert.equal(obs2022.audit_status, 'confirmed_with_caveat');
      assert.ok(obs2022.survey_or_account_status.includes('semi-définitifs'));
      assert.equal(obs2022.methodological_robustness, 'medium', 'Comptes semi-définitifs = robustesse medium');
    });

    test('2.3 Croissance du PIB : taux réel en volume, SCN 2008 base 2016, 2022 semi-définitif', async () => {
      const res = await pool.query(`
        SELECT dv.id, TO_CHAR(dv.period_start, 'YYYY') AS year, dv.audit_status, dv.survey_or_account_status,
               dvs.methodological_robustness
        FROM data_values dv
        JOIN data_indicators di ON di.id = dv.indicator_id
        JOIN data_value_sources dvs ON dvs.data_value_id = dv.id
        WHERE di.code = 'ECO_PIB_GROWTH' AND dv.id BETWEEN 687 AND 710
        ORDER BY dv.id ASC;
      `);

      assert.equal(res.rows.length, 5);
      const obs2022 = res.rows.find(r => r.year === '2022');
      assert.equal(obs2022.audit_status, 'confirmed_with_caveat');
      assert.ok(obs2022.survey_or_account_status.includes('SCN 2008') && obs2022.survey_or_account_status.includes('base 2016'));
      assert.equal(obs2022.methodological_robustness, 'medium', 'Croissance 2022 semi-définitive = medium');
    });

    test('2.4 Chômage : ruptures méthodologiques, instruments et tranches d\'âge distinctes', async () => {
      const res = await pool.query(`
        SELECT dv.id, TO_CHAR(dv.period_start, 'YYYY') AS year, dv.audit_status, dv.audit_caveat, dv.survey_or_account_status
        FROM data_values dv
        JOIN data_indicators di ON di.id = dv.indicator_id
        WHERE di.code = 'LAB_UNEMP_RATE' AND dv.id BETWEEN 687 AND 710
        ORDER BY dv.id ASC;
      `);

      assert.equal(res.rows.length, 3);
      const obs2010 = res.rows.find(r => r.year === '2010');
      assert.ok(obs2010.survey_or_account_status.includes('EESI 2') && obs2010.survey_or_account_status.includes('15 ans et plus'));

      const obs2014 = res.rows.find(r => r.year === '2014');
      assert.ok(obs2014.survey_or_account_status.includes('ECAM 4') && obs2014.survey_or_account_status.includes('15-64 ans'));

      const obs2021 = res.rows.find(r => r.year === '2021');
      assert.ok(obs2021.survey_or_account_status.includes('ECAM 5') && obs2021.survey_or_account_status.includes('15-64 ans'));
      assert.ok(obs2021.audit_caveat.includes('interpolation'), 'Interdiction d\'interpolation formulée');
    });

    test('2.5 Scolarisation : années scolaires exactes et explication TBS > 100%', async () => {
      const res = await pool.query(`
        SELECT dv.id, dv.school_year, dv.value_numeric, dv.audit_caveat, dv.audit_status
        FROM data_values dv
        JOIN data_indicators di ON di.id = dv.indicator_id
        WHERE di.code = 'EDU_PRIM_GROSS' AND dv.id BETWEEN 687 AND 710
        ORDER BY dv.id ASC;
      `);

      assert.equal(res.rows.length, 5);
      const expectedSchoolYears = ['2018/2019', '2019/2020', '2020/2021', '2021/2022', '2022/2023'];
      res.rows.forEach((r, idx) => {
        assert.equal(r.audit_status, 'confirmed');
        assert.equal(r.school_year, expectedSchoolYears[idx]);
        assert.ok(parseFloat(r.value_numeric) > 100, 'Le TBS primaire doit être > 100%');
        assert.ok(r.audit_caveat.includes('100%'), 'La réserve doit expliquer le dépassement de 100%');
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 3. FICHE INDIVIDUELLE D'OBSERVATION (API DE CONSULTATION APPROFONDIE)
  // ---------------------------------------------------------------------------
  describe('3. Fiches individuelles des observations (API /values/:id)', () => {
    test('3.1 L\'endpoint d\'administration retourne tous les 12 champs requis pour la fiche', async () => {
      const res = await adminAgent.get('/api/data/admin/values/697').expect(200);
      const obs = res.body.data;

      // 12 composantes obligatoires de la fiche
      assert.ok(obs.indicator_name, '1. Indicateur requis');
      assert.ok(obs.indicator_description, '2. Définition requise');
      assert.ok(obs.indicator_calculation_formula, '3. Formule requise');
      assert.equal(obs.indicator_unit, 'milliards_fcfa', '4. Unité requise');
      assert.equal(obs.period_type, 'ANNUAL', '5. Période requise');
      assert.equal(obs.territory_code, 'CMR', '6. Territoire requis');
      assert.equal(obs.methodology_nature, 'administrative_record', '7. Nature requise');
      assert.equal(obs.survey_or_account_status, 'Comptes semi-définitifs (SCN 2008, base 2016, prix courants)', '8. Statut des comptes requis');
      assert.equal(obs.audit_status, 'confirmed_with_caveat', '9. Résultat d\'audit 3C.1 requis');
      assert.ok(obs.audit_caveat, '10. Réserves méthodologiques requises');

      // Sources
      assert.ok(obs.sources && obs.sources.length >= 1, '11. Sources requises');
      const src = obs.sources[0];
      assert.equal(src.source_acronym, 'INS', 'Institution productrice');
      assert.ok(src.citation_reference.includes('Comptes Nationaux'), 'Publication requise');
      assert.ok(src.citation_reference.includes('Tableau') && src.citation_reference.includes('p.'), 'Tableau et page requis');
      assert.equal(src.methodological_robustness, 'medium', '12. Robustesse medium pour le semi-définitif');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. SÉCURISATION DU WORKFLOW ET TRANSITIONS SUR DONNÉES ISOLÉES
  // ---------------------------------------------------------------------------
  describe('4. Sécurisation du workflow et étanchéité (Données de test isolées)', () => {
    test('4.1 Rejet strict : Impossible de valider méthodologiquement si l\'audit 3C.1 est pending (non accepté)', async () => {
      const target = testIsoValues[0];
      // Avancer le brouillon en under_review
      await adminAgent
        .post(`/api/data/admin/values/${target.id}/submit`)
        .set('x-csrf-token', adminCsrf)
        .send({})
        .expect(200);

      // Tenter la validation méthodologique alors que audit_decision = 'pending'
      const valRes = await adminAgent
        .post(`/api/data/admin/values/${target.id}/validate`)
        .set('x-csrf-token', adminCsrf)
        .send({ validation_notes: 'Tentative de validation prématurée' });

      assert.equal(valRes.status, 400);
      assert.match(valRes.body.error, /accepté/i);
    });

    test('4.2 Rejet strict : Impossible de valider méthodologiquement si l\'audit 3C.1 est formellement refusé (rejected)', async () => {
      const target = testIsoValues[1];
      // Refuser l'audit
      await adminAgent
        .post(`/api/data/admin/values/${target.id}/audit-decision`)
        .set('x-csrf-token', adminCsrf)
        .send({ decision: 'rejected', notes: 'Audit rejeté pour incohérence documentaire' })
        .expect(200);

      // Soumettre à l'examen
      await adminAgent
        .post(`/api/data/admin/values/${target.id}/submit`)
        .set('x-csrf-token', adminCsrf)
        .send({})
        .expect(200);

      // Tenter la validation méthodologique
      const valRes = await adminAgent
        .post(`/api/data/admin/values/${target.id}/validate`)
        .set('x-csrf-token', adminCsrf)
        .send({ validation_notes: 'Tentative sur audit refusé' });

      assert.equal(valRes.status, 400);
      assert.match(valRes.body.error, /refusé/i);
    });

    test('4.3 Rejet strict : Impossible de publier une observation rejetée ou non validée méthodologiquement', async () => {
      const target = testIsoValues[1];
      const pubRes = await adminAgent
        .post(`/api/data/admin/values/${target.id}/publish`)
        .set('x-csrf-token', adminCsrf)
        .send({ public_reason_summary: 'Publication illégale' });

      assert.equal(pubRes.status, 400);
      assert.match(pubRes.body.error, /Transition interdite|Publication impossible/i);
    });

    test('4.4 Parcours nominal : Accepter audit -> Soumettre -> Correction -> Re-soumission -> Validation méthodologique', async () => {
      const target = testIsoValues[2];

      // Étape 1 : Accepter l'audit formellement
      const auditRes = await adminAgent
        .post(`/api/data/admin/values/${target.id}/audit-decision`)
        .set('x-csrf-token', adminCsrf)
        .send({ decision: 'accepted', notes: 'Audit 3C.1 validé par le responsable méthodologique.' })
        .expect(200);
      assert.equal(auditRes.body.data.audit_decision, 'accepted');

      // Étape 2 : Soumission à l'examen (draft -> under_review)
      const subRes = await adminAgent
        .post(`/api/data/admin/values/${target.id}/submit`)
        .set('x-csrf-token', adminCsrf)
        .send({})
        .expect(200);
      assert.equal(subRes.body.data.editorial_status, 'under_review');

      // Étape 3 : Demande de correction (under_review -> draft) avec motif explicite
      const corrRes = await adminAgent
        .post(`/api/data/admin/values/${target.id}/request-correction`)
        .set('x-csrf-token', adminCsrf)
        .send({ correction_notes: 'Vérification de la table des matières requise.' })
        .expect(200);
      assert.equal(corrRes.body.data.editorial_status, 'draft');

      // Étape 4 : Re-soumission
      await adminAgent
        .post(`/api/data/admin/values/${target.id}/submit`)
        .set('x-csrf-token', adminCsrf)
        .send({})
        .expect(200);

      // Étape 5 : Validation méthodologique formelle
      const valRes = await adminAgent
        .post(`/api/data/admin/values/${target.id}/validate`)
        .set('x-csrf-token', adminCsrf)
        .send({ validation_notes: 'Méthodologie formellement validée par le comité.' })
        .expect(200);
      assert.equal(valRes.body.data.editorial_status, 'methodologically_validated');
      assert.equal(valRes.body.data.is_active, false, 'Doit impérativement rester inactive');

      // Étape 6 : Vérification de l'étanchéité publique
      const pubCheck = await readerAgent.get(`/api/data/indicators/${target.code}/values`).expect(200);
      const pubIds = pubCheck.body.data.map(d => parseInt(d.id, 10));
      assert.ok(!pubIds.includes(target.id), 'L\'observation validée méthodologiquement ne doit PAS être visible publiquement');

      // Étape 7 : Vérification du journal d'audit inaltérable
      const histRes = await adminAgent.get(`/api/data/admin/values/${target.id}/history`).expect(200);
      const auditLog = histRes.body.data.audit_log || histRes.body.data.auditTrail || [];
      const actions = auditLog.map(a => a.action);

      assert.ok(actions.includes('AUDIT_DECISION'), 'Action AUDIT_DECISION enregistrée');
      assert.ok(actions.includes('SUBMIT_REVIEW'), 'Action SUBMIT_REVIEW enregistrée');
      assert.ok(actions.includes('REQUEST_CORRECTION'), 'Action REQUEST_CORRECTION enregistrée');
      assert.ok(actions.includes('VALIDATE_METHODOLOGY'), 'Action VALIDATE_METHODOLOGY enregistrée');
    });

    test('4.5 Sécurité : Rejet CSRF (token manquant) et permissions par rôle (lecteur)', async () => {
      const target = testIsoValues[3];

      // Rejet si pas de token CSRF
      const noCsrfRes = await adminAgent
        .post(`/api/data/admin/values/${target.id}/audit-decision`)
        .send({ decision: 'accepted' });
      assert.equal(noCsrfRes.status, 403);

      // Rejet si utilisateur non-admin (reader)
      const readerCsrfRes = await readerAgent.get('/api/csrf-token');
      const readerToken = readerCsrfRes.body.csrfToken;

      const nonAdminRes = await readerAgent
        .post(`/api/data/admin/values/${target.id}/audit-decision`)
        .set('x-csrf-token', readerToken)
        .send({ decision: 'accepted' });
      assert.equal(nonAdminRes.status, 403);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. INTÉGRITÉ ABSOLUE DES 24 DONNÉES PILOTES ET DE L'HISTORIQUE #261
  // ---------------------------------------------------------------------------
  describe('5. Intégrité des données pilotes et de l\'observation historique #261', () => {
    test('5.1 Les 24 observations pilotes restent strictement en draft et audit_decision pending', async () => {
      const res = await pool.query(`
        SELECT count(*) AS total,
               count(*) FILTER (WHERE editorial_status = 'draft') AS draft_count,
               count(*) FILTER (WHERE is_active = FALSE) AS inactive_count,
               count(*) FILTER (WHERE audit_decision = 'pending') AS pending_decision_count
        FROM data_values 
        WHERE id BETWEEN 687 AND 710;
      `);

      const row = res.rows[0];
      assert.equal(parseInt(row.total, 10), 24, 'Exactement 24 observations pilotes');
      assert.equal(parseInt(row.draft_count, 10), 24, 'Toutes les 24 en draft');
      assert.equal(parseInt(row.inactive_count, 10), 24, 'Toutes les 24 inactives');
      assert.equal(parseInt(row.pending_decision_count, 10), 24, 'Toutes en audit_decision pending');
    });

    test('5.2 L\'observation historique #261 reste strictement publiée, active et inchangée (29850)', async () => {
      const res = await pool.query('SELECT id, value_numeric, editorial_status, is_active FROM data_values WHERE id = 261');
      assert.equal(res.rows.length, 1);
      const obs261 = res.rows[0];
      assert.equal(obs261.editorial_status, 'published');
      assert.equal(obs261.is_active, true);
      assert.equal(parseFloat(obs261.value_numeric), 29850);
    });
  });
});
