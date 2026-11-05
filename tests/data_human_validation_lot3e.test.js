/**
 * =============================================================================
 * SOLITIQUO DATA — LOT 3E
 * SUITE DE TESTS : PRÉPARATION ET CONDUITE DE LA VALIDATION HUMAINE
 * DES 24 OBSERVATIONS PILOTES (#687 À #710)
 * =============================================================================
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../server');
const pool = require('../backend/config/database');

describe('SOLITIQUO DATA — LOT 3E VALIDATION HUMAINE DES 24 OBSERVATIONS PILOTES', () => {
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

  const pilotIds = Array.from({ length: 24 }, (_, i) => 687 + i);
  const testIsoValues = [];

  before(async () => {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(rawPassword, salt);

    // 1. Admin
    const uAdmin = await pool.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'admin', TRUE) RETURNING id, username, email, role
    `, [`adm_lot3e_${suffix}`, `adm_lot3e_${suffix}@solitiquo.cm`, hashedPassword]);
    adminUser = uAdmin.rows[0];

    // 2. Writer
    const uWriter = await pool.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'writer', TRUE) RETURNING id, username, email, role
    `, [`wri_lot3e_${suffix}`, `wri_lot3e_${suffix}@solitiquo.cm`, hashedPassword]);
    writerUser = uWriter.rows[0];

    // 3. Reader
    const uReader = await pool.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'reader', TRUE) RETURNING id, username, email, role
    `, [`rdr_lot3e_${suffix}`, `rdr_lot3e_${suffix}@solitiquo.cm`, hashedPassword]);
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
        console.warn('Nettoyage testIsoValues Lot 3E:', err.message);
      }
    }

    // Nettoyage des utilisateurs de test (les utilisateurs ayant posé un audit append-only sont préservés)
    const userIds = [adminUser?.id, writerUser?.id, readerUser?.id].filter(Boolean);
    if (userIds.length > 0) {
      try {
        await pool.query('DELETE FROM users WHERE id = ANY($1)', [userIds]);
      } catch (err) {
        // Ignorer l'erreur d'intégrité référentielle en cas d'audit immutabilisé
        if (err.code !== '23001') console.warn('Nettoyage users Lot 3E:', err.message);
      }
    }
  });

  // ===========================================================================
  // SECTION 1 : AUDIT INDIVIDUEL ET COMPLET DES 24 OBSERVATIONS PILOTES
  // ===========================================================================
  describe('1. Audit individuel et exhaustivité du dossier des 24 observations (#687 à #710)', () => {
    test('1.1 Les 24 observations sont accessibles via GET /api/data/admin/values/:id avec leur dossier complet', async () => {
      for (const id of pilotIds) {
        const res = await adminAgent
          .get(`/api/data/admin/values/${id}`)
          .expect(200);

        assert.equal(res.body.success, true);
        const obs = res.body.data;

        // Contrôle de l'identité et de l'indicateur
        assert.equal(Number(obs.id), id, `L'ID retourné doit correspondre à ${id}`);
        assert.ok(obs.indicator_code, `Code indicateur manquant pour #${id}`);
        assert.ok(obs.indicator_name, `Nom indicateur manquant pour #${id}`);
        assert.ok(obs.indicator_unit, `Unité manquante pour #${id}`);
        assert.ok(obs.territory_code === 'CMR', `Territoire CMR attendu pour #${id}`);

        // Valeur et période
        assert.ok(obs.value_numeric !== null && obs.value_numeric !== undefined, `Valeur numérique manquante pour #${id}`);
        assert.ok(obs.period_start, `Date de début manquante pour #${id}`);
        assert.ok(obs.period_end, `Date de fin manquante pour #${id}`);

        // Statut éditorial et d'audit initial
        assert.equal(obs.editorial_status, 'draft', `L'observation #${id} doit être au statut 'draft'`);
        assert.equal(obs.is_active, false, `L'observation #${id} doit avoir is_active = FALSE`);
        assert.equal(obs.audit_decision, 'pending', `L'observation #${id} doit avoir audit_decision = 'pending'`);

        // Nature méthodologique
        assert.ok(['projection', 'definitive', 'provisional', 'sample_survey', 'administrative_record', 'nowcast_estimate', 'exhaustive_census'].includes(obs.methodology_nature),
          `Nature méthodologique invalide pour #${id}: ${obs.methodology_nature}`);

        // Source primaire qualifiée
        assert.ok(Array.isArray(obs.sources) && obs.sources.length >= 1, `Au moins une source requise pour #${id}`);
        const primSource = obs.sources.find(s => s.source_role === 'primary');
        assert.ok(primSource, `Source primaire manquante pour #${id}`);
        assert.equal(primSource.documentary_tier, 'TIER_1_OFFICIAL', `Niveau documentaire TIER_1_OFFICIAL attendu pour #${id}`);
        assert.ok(primSource.citation_reference && primSource.citation_reference.length >= 10,
          `Référence bibliographique détaillée (>= 10 car) attendue pour #${id}`);
        assert.ok(primSource.citation_url && primSource.citation_url.startsWith('http'),
          `URL source valide attendue pour #${id}`);

        // Publications officielles rattachées à l'indicateur (Lot 3E enrichissement)
        assert.ok(Array.isArray(obs.indicator_publications), `indicator_publications doit être un tableau pour #${id}`);
        assert.ok(obs.indicator_publications.length >= 1, `Au moins une publication canonique rattachée pour #${id}`);
        obs.indicator_publications.forEach(pub => {
          assert.ok(pub.title, `Titre publication manquant pour #${id}`);
          assert.ok(pub.publication_year, `Année publication manquante pour #${id}`);
          if (pub.verification_status === 'verified_consulted') {
            assert.ok(pub.url && pub.url.startsWith('http'), `URL publication invalide pour #${id}`);
          }
        });
      }
    });

    test('1.2 Contrôle d\'absence de citation générique ou simple page d\'accueil sans preuve de consultation', async () => {
      const res = await pool.query(`
        SELECT dvs.data_value_id, dvs.citation_reference, dvs.citation_url, ds.acronym
        FROM data_value_sources dvs
        JOIN data_sources ds ON ds.id = dvs.source_id
        WHERE dvs.data_value_id BETWEEN 687 AND 710
      `);

      assert.equal(res.rows.length, 24);
      for (const row of res.rows) {
        // Aucune référence ne doit être une simple page d'accueil vide
        assert.ok(row.citation_reference.length > 15, `Référence trop courte pour #${row.data_value_id}`);
        // Doit préciser la page, le tableau ou le rapport
        const hasSpecificProof = /Tableau|p\.|Perspectives|Annuaire|Rapport|Comptes/i.test(row.citation_reference);
        assert.ok(hasSpecificProof, `La référence pour #${row.data_value_id} doit mentionner le tableau/page/rapport: "${row.citation_reference}"`);
      }
    });
  });

  // ===========================================================================
  // SECTION 2 : CONTRÔLE DE COHÉRENCE DES SÉRIES ET ÉTANCHÉITÉ DE DIFFUSION
  // ===========================================================================
  describe('2. Contrôle de cohérence statistique et étanchéité publique', () => {
    test('2.1 Série POP_TOT_COUNT (2018-2023) : vérification de la rupture d\'extrapolation 2022-2023', async () => {
      const res = await pool.query(`
        SELECT dv.id, dv.period_start, dv.value_numeric, dv.methodology_nature, dv.methodology_notes
        FROM data_values dv
        JOIN data_indicators di ON di.id = dv.indicator_id
        WHERE di.code = 'POP_TOT_COUNT' AND dv.id BETWEEN 687 AND 692
        ORDER BY dv.period_start ASC
      `);

      assert.equal(res.rows.length, 6);
      const values = res.rows.map(r => ({
        id: r.id,
        year: new Date(r.period_start).getFullYear(),
        val: parseFloat(r.value_numeric),
        notes: r.methodology_notes
      }));

      // 2018: 24 348 251, 2019: 24 997 000, 2020: 25 660 000, 2021: 26 348 251, 2022: 27 050 000, 2023: 28 088 845
      assert.equal(values[0].val, 24348251);
      assert.equal(values[4].val, 27050000); // Valeur arrondie
      assert.equal(values[5].val, 28088845); // Saut à 28.08M (+1 038 845)

      // Le saut entre 2022 et 2023 est de 1 038 845 hab (+3.84%), supérieur au rythme naturel (~2.6%)
      const jumpRatio = (values[5].val - values[4].val) / values[4].val;
      assert.ok(jumpRatio > 0.035, `Saut anormal détecté: ${(jumpRatio * 100).toFixed(2)}%`);
    });

    test('2.2 Série ECO_PIB_NOM et ECO_PIB_GROWTH : conformité Comptes Nationaux SCN 2008 base 2016', async () => {
      const pibRes = await pool.query(`
        SELECT dv.id, dv.period_start, dv.value_numeric, dv.methodology_nature
        FROM data_values dv
        JOIN data_indicators di ON di.id = dv.indicator_id
        WHERE di.code = 'ECO_PIB_NOM' AND dv.id BETWEEN 693 AND 697
        ORDER BY dv.period_start ASC
      `);

      assert.equal(pibRes.rows.length, 5);
      const pibValues = pibRes.rows.map(r => parseFloat(r.value_numeric));
      // Valeurs réelles en base issues des Comptes Nationaux définitifs/semi-définitifs SCN 2008
      // 2018: 21829.0, 2019: 22925.2, 2020: 22935.6, 2021: 25244.1, 2022: 27671.2
      assert.deepEqual(pibValues, [21829, 22925.2, 22935.6, 25244.1, 27671.2]);

      const growthRes = await pool.query(`
        SELECT dv.id, dv.period_start, dv.value_numeric, dv.methodology_nature
        FROM data_values dv
        JOIN data_indicators di ON di.id = dv.indicator_id
        WHERE di.code = 'ECO_PIB_GROWTH' AND dv.id BETWEEN 698 AND 702
        ORDER BY dv.period_start ASC
      `);

      assert.equal(growthRes.rows.length, 5);
      const growthValues = growthRes.rows.map(r => parseFloat(r.value_numeric));
      // 2018: 4.0%, 2019: 3.4%, 2020: 0.5% (ralentissement Covid), 2021: 3.6%, 2022: 3.6%
      assert.deepEqual(growthValues, [4.0, 3.4, 0.5, 3.6, 3.6]);
    });

    test('2.3 Série LAB_UNEMP_RATE : vérification de la rupture de champ d\'enquête EESI 2 vs ECAM 4/5', async () => {
      const res = await pool.query(`
        SELECT dv.id, dv.period_start, dv.value_numeric, dv.methodology_notes, dv.audit_caveat
        FROM data_values dv
        JOIN data_indicators di ON di.id = dv.indicator_id
        WHERE di.code = 'LAB_UNEMP_RATE' AND dv.id BETWEEN 703 AND 705
        ORDER BY dv.period_start ASC
      `);

      assert.equal(res.rows.length, 3);
      // #703: 2010 (3.8%, EESI 2 15+ ans), #704: 2014 (3.9%, ECAM 4 15-64 ans), #705: 2021 (4.3%, ECAM 5 15-64 ans)
      assert.equal(parseFloat(res.rows[0].value_numeric), 3.8);
      assert.equal(parseFloat(res.rows[1].value_numeric), 3.9);
      assert.equal(parseFloat(res.rows[2].value_numeric), 4.3);

      // Les notes méthodologiques ou les réserves doivent expliciter la rupture d'enquête et l'interdiction d'interpolation
      res.rows.forEach(r => {
        const text = `${r.methodology_notes || ''} ${r.audit_caveat || ''}`;
        assert.ok(text.includes('comparable') || text.includes('interpolable') || text.includes('Rupture'),
          `Note ou réserve sur la rupture de série attendue pour #${r.id}`);
      });
    });

    test('2.4 Série EDU_PRIM_GROSS : validation des taux bruts (> 100%) et années scolaires', async () => {
      const res = await pool.query(`
        SELECT dv.id, dv.period_start, dv.value_numeric, dv.methodology_notes, dv.audit_caveat
        FROM data_values dv
        JOIN data_indicators di ON di.id = dv.indicator_id
        WHERE di.code = 'EDU_PRIM_GROSS' AND dv.id BETWEEN 706 AND 710
        ORDER BY dv.period_start ASC
      `);

      assert.equal(res.rows.length, 5);
      // Taux compris entre 104% et 108%
      res.rows.forEach(r => {
        const val = parseFloat(r.value_numeric);
        assert.ok(val >= 104 && val <= 110, `Taux brut attendu entre 104% et 110%, obtenu: ${val}`);
        assert.ok(r.audit_caveat && r.audit_caveat.includes('100%'),
          `Explication du dépassement de 100% attendue pour #${r.id}`);
      });
    });

    test('2.5 Étanchéité publique absolue : aucune des 24 observations n\'est visible publiquement', async () => {
      // 1. Recherche statistique publique
      const searchRes = await readerAgent
        .get('/api/data/search?q=Cameroun&limit=50')
        .expect(200);

      const returnedIds = (searchRes.body.data || []).map(item => Number(item.id));
      for (const id of pilotIds) {
        assert.ok(!returnedIds.includes(id), `L'observation pilote #${id} ne doit PAS fuiter dans la recherche publique`);
      }

      // 2. Consultation des valeurs par indicateur public
      const indValRes = await readerAgent
        .get('/api/data/indicators/POP_TOT_COUNT/values')
        .expect(200);

      const indValIds = (indValRes.body.data || []).map(v => Number(v.id));
      for (const id of pilotIds) {
        assert.ok(!indValIds.includes(id), `L'observation pilote #${id} ne doit PAS fuiter sur la route indicateur`);
      }

      // 3. Préservation de l'observation historique #261
      const obs261Res = await readerAgent
        .get('/api/data/indicators/ECO_PIB_NOM/values')
        .expect(200);

      const pub261 = (obs261Res.body.data || []).find(v => Number(v.id) === 261);
      assert.ok(pub261, 'L\'observation #261 doit rester visible publiquement');
      assert.equal(parseFloat(pub261.value_numeric), 29850, 'Valeur #261 non altérée (29 850)');
    });
  });

  // ===========================================================================
  // SECTION 3 : ESPACE DE DÉCISION HUMAINE (API & SÉCURITÉ)
  // ===========================================================================
  describe('3. Espace de décision humaine : actions, contrôles et traçabilité', () => {
    let testObservationId;

    before(async () => {
      // Création d'une observation isolée dédiée aux tests de décision humaine
      const indRes = await pool.query("SELECT id FROM data_indicators WHERE code = 'ECO_PIB_NOM'");
      const terRes = await pool.query("SELECT id FROM territories WHERE code = 'CMR'");
      const srcRes = await pool.query("SELECT id FROM data_sources WHERE acronym = 'INS'");

      const insVal = await pool.query(`
        INSERT INTO data_values (
          indicator_id, territory_id, period_type, period_start, period_end,
          value_numeric, methodology_nature, editorial_status, is_active,
          audit_status, audit_decision, created_by
        ) VALUES (
          $1, $2, 'ANNUAL', '2025-01-01', '2025-12-31',
          31500.0, 'projection', 'draft', FALSE,
          'discrepancy', 'pending', $3
        ) RETURNING id
      `, [indRes.rows[0].id, terRes.rows[0].id, writerUser.id]);

      testObservationId = insVal.rows[0].id;
      testIsoValues.push(testObservationId);

      // Rattachement d'une source primaire qualifiée
      await pool.query(`
        INSERT INTO data_value_sources (
          data_value_id, source_id, source_role, documentary_tier,
          citation_reference, citation_url, methodological_robustness, created_by
        ) VALUES ($1, $2, 'primary', 'TIER_1_OFFICIAL', 'INS Rapport Perspectives 2025, Tableau 5, p. 42', 'https://ins-cameroun.cm/persp2025', 'high', $3)
      `, [testObservationId, srcRes.rows[0].id, writerUser.id]);
    });

    test('3.1 Contrôle d\'accès : refus pour les rôles non-admin (reader & writer)', async () => {
      // Reader doit être refusé (403)
      await readerAgent
        .post(`/api/data/admin/values/${testObservationId}/audit-decision`)
        .set('x-csrf-token', readerCsrf)
        .send({ decision: 'accepted', notes: 'Tentative non autorisée reader' })
        .expect(403);

      // Writer doit être refusé (403 car décision audit réservée aux admins)
      await writerAgent
        .post(`/api/data/admin/values/${testObservationId}/audit-decision`)
        .set('x-csrf-token', writerCsrf)
        .send({ decision: 'accepted', notes: 'Tentative non autorisée writer' })
        .expect(403);
    });

    test('3.2 Protection CSRF : requête admin sans jeton CSRF rejetée (403)', async () => {
      await adminAgent
        .post(`/api/data/admin/values/${testObservationId}/audit-decision`)
        .send({ decision: 'accepted', notes: 'Sans CSRF token' })
        .expect(403);
    });

    test('3.3 Validation des 4 décisions : rejet si motif manquant ou trop court', async () => {
      // Motif < 5 caractères pour rejected -> 400
      const rejRes = await adminAgent
        .post(`/api/data/admin/values/${testObservationId}/audit-decision`)
        .set('x-csrf-token', adminCsrf)
        .send({ decision: 'rejected', notes: 'bad' })
        .expect(400);
      assert.match(rejRes.body.error, /motif obligatoire/i);

      // Motif < 5 caractères pour pending_evidence -> 400
      const pendRes = await adminAgent
        .post(`/api/data/admin/values/${testObservationId}/audit-decision`)
        .set('x-csrf-token', adminCsrf)
        .send({ decision: 'pending_evidence', notes: 'non' })
        .expect(400);
      assert.match(pendRes.body.error, /motif obligatoire/i);

      // Motif < 5 caractères pour correction_requested -> 400
      const corrRes = await adminAgent
        .post(`/api/data/admin/values/${testObservationId}/audit-decision`)
        .set('x-csrf-token', adminCsrf)
        .send({ decision: 'correction_requested', notes: 'fix' })
        .expect(400);
      assert.match(corrRes.body.error, /motif obligatoire/i);
    });

    test('3.4 Décision "pending_evidence" avec pièces justificatives : enregistrement et traçabilité', async () => {
      const res = await adminAgent
        .post(`/api/data/admin/values/${testObservationId}/audit-decision`)
        .set('x-csrf-token', adminCsrf)
        .send({
          decision: 'pending_evidence',
          notes: 'Attente du procès-verbal officiel du Comité des Comptes Nationaux 2025.',
          evidence_url: 'https://ins-cameroun.cm/audit/pv-comite-2025.pdf',
          evidence_reference: 'Bordereau MINFI n° 4412/DGTCP/2025'
        })
        .expect(200);

      assert.equal(res.body.success, true);
      const val = res.body.data;
      assert.equal(val.audit_decision, 'pending_evidence');
      assert.equal(val.audit_evidence_url, 'https://ins-cameroun.cm/audit/pv-comite-2025.pdf');
      assert.equal(val.audit_evidence_reference, 'Bordereau MINFI n° 4412/DGTCP/2025');

      // Vérification de la journalisation dans data_value_audit_log
      const logRes = await pool.query(
        'SELECT * FROM data_value_audit_log WHERE data_value_id = $1 ORDER BY id DESC LIMIT 1',
        [testObservationId]
      );
      assert.equal(logRes.rows.length, 1);
      const log = logRes.rows[0];
      assert.equal(log.action, 'KEEP_PENDING');
      assert.equal(log.performed_by, adminUser.id);
      assert.match(log.reason, /Attente du procès-verbal/);
      assert.equal(log.diff_payload.evidence_reference, 'Bordereau MINFI n° 4412/DGTCP/2025');
    });

    test('3.5 Décision "correction_requested" : bascule le statut éditorial en "draft"', async () => {
      // D'abord basculer en under_review
      await pool.query("UPDATE data_values SET editorial_status = 'under_review' WHERE id = $1", [testObservationId]);

      const res = await adminAgent
        .post(`/api/data/admin/values/${testObservationId}/audit-decision`)
        .set('x-csrf-token', adminCsrf)
        .send({
          decision: 'correction_requested',
          notes: 'Rectifier la colonne utilisée : prendre le montant en prix courants et non constants.'
        })
        .expect(200);

      assert.equal(res.body.data.audit_decision, 'correction_requested');
      assert.equal(res.body.data.editorial_status, 'draft', 'Statut éditorial doit être draft suite à correction_requested');
    });

    test('3.6 Décision "accepted" : enregistre la décision et autorise la suite du workflow', async () => {
      const res = await adminAgent
        .post(`/api/data/admin/values/${testObservationId}/audit-decision`)
        .set('x-csrf-token', adminCsrf)
        .send({
          decision: 'accepted',
          notes: 'Preuve reçue et concordance vérifiée avec le document officiel certifié.',
          evidence_url: 'https://ins-cameroun.cm/audit/certificat-concordance-2025.pdf',
          evidence_reference: 'Certificat INS-DDS-2025-098'
        })
        .expect(200);

      assert.equal(res.body.data.audit_decision, 'accepted');
      assert.equal(res.body.data.audit_evidence_reference, 'Certificat INS-DDS-2025-098');
    });
  });

  // ===========================================================================
  // SECTION 4 : GARDE-FOUS ÉDITORIAUX ET CONTRÔLE DE PUBLICATION
  // ===========================================================================
  describe('4. Garde-fous éditoriaux et interdiction de publication illicite', () => {
    let guardObservationId;

    before(async () => {
      const indRes = await pool.query("SELECT id FROM data_indicators WHERE code = 'ECO_PIB_NOM'");
      const terRes = await pool.query("SELECT id FROM territories WHERE code = 'CMR'");
      const srcRes = await pool.query("SELECT id FROM data_sources WHERE acronym = 'INS'");

      const insVal = await pool.query(`
        INSERT INTO data_values (
          indicator_id, territory_id, period_type, period_start, period_end,
          value_numeric, methodology_nature, editorial_status, is_active,
          audit_status, audit_decision, created_by
        ) VALUES (
          $1, $2, 'ANNUAL', '2026-01-01', '2026-12-31',
          33000.0, 'projection', 'draft', FALSE,
          'discrepancy', 'pending', $3
        ) RETURNING id
      `, [indRes.rows[0].id, terRes.rows[0].id, writerUser.id]);

      guardObservationId = insVal.rows[0].id;
      testIsoValues.push(guardObservationId);

      // Source primaire sans qualification explicite (documentary_tier = null)
      await pool.query(`
        INSERT INTO data_value_sources (
          data_value_id, source_id, source_role, documentary_tier,
          citation_reference, created_by
        ) VALUES ($1, $2, 'primary', NULL, 'Référence sommaire', $3)
      `, [guardObservationId, srcRes.rows[0].id, writerUser.id]);
    });

    test('4.1 Impossibilité de valider méthodologiquement sans audit préalablement accepté', async () => {
      // Passer en under_review
      await pool.query("UPDATE data_values SET editorial_status = 'under_review' WHERE id = $1", [guardObservationId]);

      // Tenter la validation alors que audit_decision = 'pending'
      const resPending = await adminAgent
        .post(`/api/data/admin/values/${guardObservationId}/validate`)
        .set('x-csrf-token', adminCsrf)
        .send({ notes: 'Tentative de validation prématurée' })
        .expect(400);

      assert.match(resPending.body.error, /audit/i);

      // Mettre en pending_evidence
      await pool.query("UPDATE data_values SET audit_decision = 'pending_evidence' WHERE id = $1", [guardObservationId]);
      const resPendingEv = await adminAgent
        .post(`/api/data/admin/values/${guardObservationId}/validate`)
        .set('x-csrf-token', adminCsrf)
        .send({ notes: 'Tentative sous pending_evidence' })
        .expect(400);

      assert.match(resPendingEv.body.error, /attente de preuve/i);

      // Mettre en rejected
      await pool.query("UPDATE data_values SET audit_decision = 'rejected' WHERE id = $1", [guardObservationId]);
      const resRej = await adminAgent
        .post(`/api/data/admin/values/${guardObservationId}/validate`)
        .set('x-csrf-token', adminCsrf)
        .send({ notes: 'Tentative sous rejected' })
        .expect(400);

      assert.match(resRej.body.error, /refusé/i);
    });

    test('4.2 Impossibilité de valider méthodologiquement sans source primaire qualifiée', async () => {
      // Passer audit en 'accepted' mais la source primaire n'a pas de documentary_tier
      await pool.query("UPDATE data_values SET audit_decision = 'accepted' WHERE id = $1", [guardObservationId]);

      const res = await adminAgent
        .post(`/api/data/admin/values/${guardObservationId}/validate`)
        .set('x-csrf-token', adminCsrf)
        .send({ notes: 'Validation avec source non qualifiée' })
        .expect(400);

      assert.match(res.body.error, /source primaire correctement qualifiée/i);
    });

    test('4.3 Impossibilité absolue de publier une observation rejetée ou non validée méthodologiquement', async () => {
      // Tentative de publication directe depuis under_review
      const pubResDirect = await adminAgent
        .post(`/api/data/admin/values/${guardObservationId}/publish`)
        .set('x-csrf-token', adminCsrf)
        .send({ publicReasonSummary: 'Publication forcée' })
        .expect(400);

      assert.match(pubResDirect.body.error, /methodologically_validated/i);

      // Mettre en statut rejected
      await pool.query("UPDATE data_values SET editorial_status = 'rejected' WHERE id = $1", [guardObservationId]);
      const pubResRejected = await adminAgent
        .post(`/api/data/admin/values/${guardObservationId}/publish`)
        .set('x-csrf-token', adminCsrf)
        .send({ publicReasonSummary: 'Publication sur rejet' })
        .expect(400);

      assert.match(pubResRejected.body.error, /refusé|methodologically_validated/i);
    });

    test('4.4 Parcours de publication nominal complet d\'une observation pilote avec toutes ses garanties', async () => {
      // 1. Corriger la qualification de la source primaire
      await pool.query(`
        UPDATE data_value_sources
        SET documentary_tier = 'TIER_1_OFFICIAL',
            methodological_robustness = 'high',
            citation_reference = 'INS Perspectives Macroéconomiques 2026, Tableau 1.2, p. 15',
            citation_url = 'https://ins-cameroun.cm/rapport2026.pdf'
        WHERE data_value_id = $1
      `, [guardObservationId]);

      // 2. Basculer en under_review et accepter l'audit
      await pool.query("UPDATE data_values SET editorial_status = 'under_review', audit_decision = 'accepted' WHERE id = $1", [guardObservationId]);

      // 3. Valider la méthodologie
      const valRes = await adminAgent
        .post(`/api/data/admin/values/${guardObservationId}/validate`)
        .set('x-csrf-token', adminCsrf)
        .send({ notes: 'Méthodologie vérifiée et approuvée par l\'expert statisticien.' })
        .expect(200);

      assert.equal(valRes.body.data.editorial_status, 'methodologically_validated');

      // 4. Publier explicitement avec motif public
      const pubRes = await adminAgent
        .post(`/api/data/admin/values/${guardObservationId}/publish`)
        .set('x-csrf-token', adminCsrf)
        .send({ public_reason_summary: 'Donnée validée par la commission statistique Lot 3E.' })
        .expect(200);

      assert.equal(pubRes.body.data.editorial_status, 'published');
      assert.equal(pubRes.body.data.is_active, true);
      assert.equal(pubRes.body.data.public_reason_summary, 'Donnée validée par la commission statistique Lot 3E.');
    });

    test('4.5 Non-régression totale : Les 24 observations du pilote #687 à #710 restent intactes en brouillon', async () => {
      const res = await pool.query(`
        SELECT COUNT(*) AS draft_count
        FROM data_values
        WHERE id BETWEEN 687 AND 710
          AND editorial_status = 'draft'
          AND is_active = FALSE
          AND audit_decision = 'pending'
      `);

      assert.equal(parseInt(res.rows[0].draft_count, 10), 24,
        'Les 24 observations pilotes doivent impérativement demeurer en draft, inactives et audit pending');
    });
  });
});
