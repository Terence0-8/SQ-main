/**
 * =============================================================================
 * SOLITIQUO DATA — LOT 3B : CORPUS DOCUMENTAIRE STATISTIQUE TESTS
 * =============================================================================
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../server');
const pool = require('../backend/config/database');

describe('SOLITIQUO DATA — LOT 3B CORPUS DOCUMENTAIRE STATISTIQUE SUITE', () => {
  const suffix = Date.now().toString().slice(-6);
  const rawPassword = 'Password123*';
  let adminUser;
  let adminAgent;
  let _adminCsrf;
  let writerUser;
  let writerAgent;
  let writerCsrf;
  let readerAgent;

  let testSourceId;
  let testIndicatorId1;
  let testIndicatorCode1;
  let testIndicatorId2;
  let testIndicatorCode2;

  before(async () => {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(rawPassword, salt);

    // Utilisateurs
    const uAdmin = await pool.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'admin', TRUE) RETURNING id, username, email, role
    `, [`admin_pub_${suffix}`, `admin_pub_${suffix}@solitiquo.cm`, hashedPassword]);
    adminUser = uAdmin.rows[0];

    const uWriter = await pool.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'writer', TRUE) RETURNING id, username, email, role
    `, [`writer_pub_${suffix}`, `writer_pub_${suffix}@solitiquo.cm`, hashedPassword]);
    writerUser = uWriter.rows[0];

    const uReader = await pool.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'reader', TRUE) RETURNING id, username, email, role
    `, [`reader_pub_${suffix}`, `reader_pub_${suffix}@solitiquo.cm`, hashedPassword]);

    // Sessions & CSRF
    adminAgent = request.agent(app);
    await adminAgent.post('/api/auth/login').send({
      email: adminUser.email,
      password: rawPassword
    }).expect(200);
    const csrfAdminRes = await adminAgent.get('/api/csrf-token').expect(200);
    _adminCsrf = csrfAdminRes.body.csrfToken;

    writerAgent = request.agent(app);
    await writerAgent.post('/api/auth/login').send({
      email: writerUser.email,
      password: rawPassword
    }).expect(200);
    const csrfWriterRes = await writerAgent.get('/api/csrf-token').expect(200);
    writerCsrf = csrfWriterRes.body.csrfToken;

    readerAgent = request.agent(app);
    await readerAgent.post('/api/auth/login').send({
      email: uReader.rows[0].email,
      password: rawPassword
    }).expect(200);

    // Référentiels pour le test
    const srcRes = await pool.query('SELECT id FROM data_sources LIMIT 1');
    testSourceId = srcRes.rows[0].id;

    testIndicatorCode1 = `IND_PUB1_${suffix}`;
    const ind1 = await pool.query(`
      INSERT INTO data_indicators (code, name, category, unit, is_active)
      VALUES ($1, 'Indicateur Publication Test 1', 'economie', 'milliards_fcfa', TRUE)
      RETURNING id, code
    `, [testIndicatorCode1]);
    testIndicatorId1 = ind1.rows[0].id;

    testIndicatorCode2 = `IND_PUB2_${suffix}`;
    const ind2 = await pool.query(`
      INSERT INTO data_indicators (code, name, category, unit, is_active)
      VALUES ($1, 'Indicateur Publication Test 2', 'sante', 'pourcentage', TRUE)
      RETURNING id, code
    `, [testIndicatorCode2]);
    testIndicatorId2 = ind2.rows[0].id;
  });

  after(async () => {
    try {
      if (testIndicatorId1) {
        await pool.query('DELETE FROM data_publication_indicators WHERE indicator_id IN ($1, $2)', [testIndicatorId1, testIndicatorId2]);
        await pool.query('DELETE FROM data_indicators WHERE id IN ($1, $2)', [testIndicatorId1, testIndicatorId2]);
      }
      if (adminUser) {
        await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [adminUser.id, writerUser.id]);
      }
    } catch {
      // Ignorer
    }
  });

  // ===========================================================================
  // 1. SÉCURITÉ ET PERMISSIONS D'ACCÈS
  // ===========================================================================
  describe('Sécurité et Gouvernance d\'accès', () => {
    test('403 — Rejet d\'un utilisateur anonyme sur les publications d\'administration', async () => {
      await request(app)
        .get('/api/data/admin/publications')
        .expect(403);
    });

    test('403 — Rejet d\'un simple lecteur (reader) sur les publications d\'administration', async () => {
      await readerAgent
        .get('/api/data/admin/publications')
        .expect(403);
    });

    test('403 — Rejet d\'une création de publication sans token CSRF', async () => {
      await writerAgent
        .post('/api/data/admin/publications')
        .send({
          title: 'Publication test sans CSRF',
          institution_id: testSourceId,
          document_category: 'statistical_yearbook',
          verification_status: 'verified_consulted'
        })
        .expect(403);
    });
  });

  // ===========================================================================
  // 2. STATUTS DE VÉRIFICATION ET INTÉGRITÉ DE MODÈLE
  // ===========================================================================
  describe('Contraintes et typologie des statuts documentaires', () => {
    test('Rejet d\'un statut de vérification invalide (CHECK constraint)', async () => {
      const res = await writerAgent
        .post('/api/data/admin/publications')
        .set('x-csrf-token', writerCsrf)
        .send({
          title: 'Publication invalide',
          institution_id: testSourceId,
          document_category: 'survey',
          verification_status: 'statut_invalide'
        })
        .expect(400);

      assert.equal(res.body.success, false);
      assert.match(res.body.error, /Statut de vérification invalide/i);
    });

    test('Rejet d\'une catégorie documentaire non normalisée', async () => {
      const res = await writerAgent
        .post('/api/data/admin/publications')
        .set('x-csrf-token', writerCsrf)
        .send({
          title: 'Publication catégorie erronée',
          institution_id: testSourceId,
          document_category: 'categorie_inventee',
          verification_status: 'verified_consulted'
        })
        .expect(400);

      assert.equal(res.body.success, false);
      assert.match(res.body.error, /Catégorie documentaire invalide/i);
    });
  });

  // ===========================================================================
  // 3. CYCLE DE VIE COMPLET (CRUD) D'UNE PUBLICATION ET MULTI-INDICATEURS
  // ===========================================================================
  describe('Gestion opérationnelle d\'une publication et liaisons M:N', () => {
    let createdPubId;

    test('201 — Création d\'une publication avec métadonnées et liaison multi-indicateurs', async () => {
      const res = await writerAgent
        .post('/api/data/admin/publications')
        .set('x-csrf-token', writerCsrf)
        .send({
          title: `Rapport Statistique Spécifique ${suffix}`,
          institution_id: testSourceId,
          publisher_organization: 'Institut Diffuseur',
          publication_year: 2023,
          coverage_period_start: '2020',
          coverage_period_end: '2022',
          document_category: 'survey',
          documentary_tier: 'TIER_1_OFFICIAL',
          url: 'https://statistiques.cm/rapport-test',
          bibliographic_reference: 'Notice officielle Yaoundé, 2023, 120 p.',
          geographical_coverage: 'national',
          consultation_date: '2026-02-15',
          verification_status: 'verified_consulted',
          notes: 'Analyse approfondie des comptes et indicateurs sanitaires.',
          indicators: [
            { indicator_id: testIndicatorId1, specific_section: 'Chapitre 3, Tableau 3.1' },
            { indicator_id: testIndicatorId2, specific_section: 'Annexe B, p. 110' }
          ]
        })
        .expect(201);

      assert.equal(res.body.success, true);
      const pub = res.body.data;
      createdPubId = pub.id;
      assert.ok(createdPubId);
      assert.equal(pub.title, `Rapport Statistique Spécifique ${suffix}`);
      assert.equal(pub.verification_status, 'verified_consulted');
      assert.equal(pub.document_category, 'survey');
      assert.equal(pub.indicators.length, 2);
      assert.ok(pub.indicators.some(i => i.code === testIndicatorCode1));
      assert.ok(pub.indicators.some(i => i.code === testIndicatorCode2));
    });

    test('200 — Consultation détaillée de la fiche publication créée', async () => {
      const res = await writerAgent
        .get(`/api/data/admin/publications/${createdPubId}`)
        .expect(200);

      assert.equal(res.body.success, true);
      const pub = res.body.data;
      assert.equal(pub.id, createdPubId);
      assert.equal(pub.publication_year, 2023);
      assert.equal(pub.coverage_period_start, '2020');
      assert.equal(pub.coverage_period_end, '2022');
      assert.equal(pub.consultation_date, '2026-02-15');
      assert.ok(pub.institution);
      assert.equal(pub.institution.id, testSourceId);
    });

    test('200 — Modification de la publication et révision des associations d\'indicateurs', async () => {
      const res = await writerAgent
        .put(`/api/data/admin/publications/${createdPubId}`)
        .set('x-csrf-token', writerCsrf)
        .send({
          title: `Rapport Statistique Spécifique ${suffix} (Mis à jour)`,
          verification_status: 'identified_unconsulted',
          indicators: [
            { indicator_id: testIndicatorId1, specific_section: 'Chapitre Révisé 4' }
          ]
        })
        .expect(200);

      assert.equal(res.body.success, true);
      const pub = res.body.data;
      assert.match(pub.title, /Mis à jour/);
      assert.equal(pub.verification_status, 'identified_unconsulted');
      assert.equal(pub.indicators.length, 1);
      assert.equal(pub.indicators[0].code, testIndicatorCode1);
    });

    test('200 — Suppression de la publication et cascade automatique sur la liaison M:N', async () => {
      const delRes = await writerAgent
        .delete(`/api/data/admin/publications/${createdPubId}`)
        .set('x-csrf-token', writerCsrf)
        .expect(200);

      assert.equal(delRes.body.success, true);

      // Vérifier que la table de liaison a été purgée en cascade
      const linkCheck = await pool.query(
        'SELECT COUNT(*) AS total FROM data_publication_indicators WHERE publication_id = $1',
        [createdPubId]
      );
      assert.equal(parseInt(linkCheck.rows[0].total, 10), 0);
    });
  });

  // ===========================================================================
  // 4. STATISTIQUES DOCUMENTAIRES ET INDICATEURS ORPHELINS
  // ===========================================================================
  describe('Statistiques du corpus et détection des indicateurs orphelins', () => {
    test('GET /api/data/admin/publications/stats — retourne la synthèse documentaire chiffrée', async () => {
      const res = await writerAgent
        .get('/api/data/admin/publications/stats')
        .expect(200);

      assert.equal(res.body.success, true);
      const stats = res.body.data;
      assert.ok(stats.publications);
      assert.ok(stats.publications.total_publications >= 20);
      assert.ok(stats.publications.verified_consulted >= 15);
      assert.ok(stats.indicators);
      assert.ok(stats.indicators.total_active >= 40);
      assert.ok(
        stats.indicators.verified_covered >= 25,
        'Au moins 25 indicateurs couverts par des publications certifiées vérifiées (27 au Lot 3E.2.1)'
      );
      assert.ok(stats.indicators.coverage_rate_percent > 50);
    });

    test('GET /api/data/admin/publications/uncovered-indicators — identifie les indicateurs sans documentation vérifiée', async () => {
      const res = await writerAgent
        .get('/api/data/admin/publications/uncovered-indicators')
        .expect(200);

      assert.equal(res.body.success, true);
      const uncovered = res.body.data;
      assert.ok(Array.isArray(uncovered));
      assert.ok(uncovered.length > 0, 'Il doit y avoir des indicateurs transparentement identifiés comme restant à documenter');

      // Notre testIndicatorId2 n'a aucune publication vérifiée -> doit figurer dans la liste
      const foundTestInd = uncovered.find(i => i.code === testIndicatorCode2);
      assert.ok(foundTestInd, `L'indicateur sans publication vérifiée ${testIndicatorCode2} doit être listé`);
    });
  });

  // ===========================================================================
  // 5. API PUBLIQUE DE CONSULTATION DOCUMENTAIRE
  // ===========================================================================
  describe('Consultation publique du corpus vérifié', () => {
    test('GET /api/data/publications — n\'expose que les documents vérifiés et consultés au public', async () => {
      const res = await request(app)
        .get('/api/data/publications')
        .expect(200);

      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length >= 10);

      for (const pub of res.body.data) {
        assert.equal(
          pub.verification_status,
          'verified_consulted',
          'L\'API publique ne doit exposer que les publications vérifiées et consultées'
        );
      }
    });

    test('GET /api/data/publications?indicator_code=POP_TOT_COUNT — filtre les publications documentant cet indicateur', async () => {
      const res = await request(app)
        .get('/api/data/publications?indicator_code=POP_TOT_COUNT')
        .expect(200);

      assert.equal(res.body.success, true);
      assert.ok(res.body.data.length >= 1);
      const titles = res.body.data.map(p => p.title);
      assert.ok(titles.some(t => /Annuaire Statistique|RGPH/i.test(t)));
    });

    test('Vérification stricte : aucun chiffre statistique fictif n\'a été inséré dans ce lot', async () => {
      // Vérifier que la table data_values n'a pas été polluée par des observations factices
      const valCheck = await pool.query(`
        SELECT COUNT(*) AS total
        FROM data_values
        WHERE indicator_id IN ($1, $2)
      `, [testIndicatorId1, testIndicatorId2]);

      assert.equal(parseInt(valCheck.rows[0].total, 10), 0, 'Aucune observation statistique ne doit être créée dans le Lot 3B');
    });
  });
});
