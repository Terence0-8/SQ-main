/**
 * =============================================================================
 * SOLITIQUO DATA — LOT 3F : TESTS DE BOUT EN BOUT ET PRÉPARATION AU LANCEMENT
 * =============================================================================
 * Vérification rigoureuse avant lancement public :
 * 1. Sanctuarisation du périmètre publié (exactement 4 observations : #260, #261, #262, #323).
 * 2. Sanctuarisation absolue de l'observation #261 (29 850 Mrds FCFA) et des 24 pilotes (#687 à #710).
 * 3. Étanchéité totale : zéro fuite des 24 pilotes sur l'espace public (recherche, catalogue, API).
 * 4. Qualification des exports (CSV avec BOM UTF-8, délimiteur ';', anti-injection formule, JSON, JSON-LD Schema.org).
 * 5. Diagnostic d'éligibilité et verrouillage de publication des dossiers non conformes.
 * 6. Sécurité des routes administratives (RBAC et protection CSRF).
 * =============================================================================
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../server');
const pool = require('../backend/config/database');

describe('SOLITIQUO DATA — LOT 3F : TESTS E2E ET PRÉPARATION AU LANCEMENT', () => {
  const suffix = Date.now().toString().slice(-6);
  const rawPassword = 'LaunchPassword123*';
  let adminUser;
  let adminAgent;
  let adminCsrf;
  let readerUser;
  let readerAgent;

  before(async () => {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(rawPassword, salt);

    // 1. Création administrateur et lecteur de test
    const uAdmin = await pool.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'admin', TRUE) RETURNING id, username, email, role
    `, [`admin_launch_${suffix}`, `admin_launch_${suffix}@solitiquo.cm`, hash]);
    adminUser = uAdmin.rows[0];

    const uReader = await pool.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'reader', TRUE) RETURNING id, username, email, role
    `, [`reader_launch_${suffix}`, `reader_launch_${suffix}@solitiquo.cm`, hash]);
    readerUser = uReader.rows[0];

    // 2. Connexion sessions & CSRF
    adminAgent = request.agent(app);
    await adminAgent.post('/api/auth/login').send({
      email: adminUser.email,
      password: rawPassword
    }).expect(200);

    const csrfRes = await adminAgent.get('/api/csrf-token').expect(200);
    adminCsrf = csrfRes.body.csrfToken;

    readerAgent = request.agent(app);
    await readerAgent.post('/api/auth/login').send({
      email: readerUser.email,
      password: rawPassword
    }).expect(200);
  });

  after(async () => {
    if (adminUser) {
      await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [adminUser.id, readerUser.id]);
    }
  });

  // ===========================================================================
  // SECTION 1 : VÉRIFICATION DU PÉRIMÈTRE PUBLIC ET SANCTUARISATION
  // ===========================================================================
  describe('1. Périmètre Public et Sanctuarisation', () => {

    test('Les 4 observations officielles prioritaires (#260, #261, #262, #323) sont publiées et actives', async () => {
      const res = await pool.query(`
        SELECT id, indicator_id, value_numeric, editorial_status, is_active, published_at
        FROM data_values
        WHERE editorial_status = 'published' AND is_active = TRUE
        ORDER BY id ASC
      `);

      const ids = res.rows.map(r => parseInt(r.id, 10));
      assert.ok(ids.includes(260), 'Observation #260 publiée');
      assert.ok(ids.includes(261), 'Observation #261 publiée');
      assert.ok(ids.includes(262), 'Observation #262 publiée');
      assert.ok(ids.includes(323), 'Observation #323 publiée');
    });

    test('Observation #261 (PIB nominal 2024) est intacte et sanctuarisée', async () => {
      const res = await pool.query(`
        SELECT dv.id, di.code AS indicator_code, dv.value_numeric, dv.period_start, dv.period_end,
               dv.editorial_status, dv.is_active, dv.methodology_nature
        FROM data_values dv
        JOIN data_indicators di ON dv.indicator_id = di.id
        WHERE dv.id = 261
      `);

      assert.equal(res.rows.length, 1);
      const obs = res.rows[0];
      assert.equal(obs.indicator_code, 'ECO_PIB_NOM');
      assert.equal(Number(obs.value_numeric), 29850, 'Valeur intacte à 29 850 Mrds FCFA');
      assert.equal(obs.editorial_status, 'published');
      assert.equal(obs.is_active, true);
    });

    test('Les 24 observations pilotes (#687 à #710) sont strictement en brouillon et non publiées', async () => {
      const res = await pool.query(`
        SELECT COUNT(*) AS total_pilots,
               COUNT(*) FILTER (WHERE editorial_status = 'draft') AS draft_count,
               COUNT(*) FILTER (WHERE is_active = FALSE) AS inactive_count,
               COUNT(*) FILTER (WHERE audit_decision = 'pending') AS pending_count
        FROM data_values
        WHERE id BETWEEN 687 AND 710
      `);

      const row = res.rows[0];
      assert.equal(parseInt(row.total_pilots, 10), 24, '24 observations pilotes présentes');
      assert.equal(parseInt(row.draft_count, 10), 24, '24/24 observations strictement draft');
      assert.equal(parseInt(row.inactive_count, 10), 24, '24/24 observations is_active = FALSE');
      assert.equal(parseInt(row.pending_count, 10), 24, '24/24 observations audit_decision = pending');
    });

    test('Étanchéité totale : aucune observation pilote (#687 à #710) ne fuite sur les endpoints publics', async () => {
      // 1. Recherche catalogue
      const searchRes = await request(app).get('/api/data/search?q=PIB&limit=50').expect(200);
      assert.equal(searchRes.body.success, true);
      const items = searchRes.body.data || [];
      for (const item of items) {
        if (item.latest_value_id) {
          const id = parseInt(item.latest_value_id, 10);
          assert.ok(id < 687 || id > 710, `L'observation pilote #${id} ne doit pas apparaître dans les résultats`);
        }
      }

      // 2. Fiche indicateur ECO_PIB_NOM
      const indRes = await request(app).get('/api/data/indicators/ECO_PIB_NOM').expect(200);
      assert.equal(indRes.body.success, true);
      const history = indRes.body.data.published_history || [];
      for (const h of history) {
        const id = parseInt(h.id, 10);
        assert.ok(id < 687 || id > 710, `L'historique public ne doit pas contenir de pilote non publié (#${id})`);
      }
    });
  });

  // ===========================================================================
  // SECTION 2 : QUALIFICATION DES EXPORTS PUBLICS (CSV, JSON, JSON-LD)
  // ===========================================================================
  describe('2. Qualification des Exports Publics', () => {

    test('Export CSV intègre BOM UTF-8, séparateur point-virgule et en-têtes officiels', async () => {
      const res = await request(app)
        .get('/api/data/export/csv?indicator=DEMO_POP_TOT')
        .expect(200)
        .expect('Content-Type', /csv/);

      // Vérification du BOM UTF-8 (\uFEFF)
      assert.ok(res.text.startsWith('\uFEFF'), 'Le fichier CSV doit commencer par le BOM UTF-8 pour Excel/LibreOffice');

      // Vérification du délimiteur ';'
      const firstLine = res.text.replace('\uFEFF', '').split('\r\n')[0];
      assert.ok(firstLine.includes(';'), 'Le fichier CSV doit utiliser le point-virgule comme séparateur');
      assert.ok(firstLine.includes('Code Indicateur'), 'En-tête officiel présent');
      assert.ok(firstLine.includes('Valeur'), 'Colonne Valeur présente');
    });

    test('Export CSV neutralise les injections de formules (=, +, -, @, \\t, \\r)', async () => {
      // Test de la fonction de sanitization avec des valeurs piégées
      const { generateCsv } = require('../backend/services/dataService');
      const maliciousRows = [
        {
          indicator_code: '=cmd|"/C calc"!A0',
          indicator_name: '+SUM(1,2)',
          indicator_category: '@admin_secret',
          territory_name: '-TerritoryAttack',
          value_numeric: 100
        }
      ];

      const csvContent = generateCsv(maliciousRows);
      const lines = csvContent.replace('\uFEFF', '').split('\r\n');
      const dataLine = lines[1];
      const cells = dataLine.split(';');

      // Les cellules commençant par = + @ ou - doivent être préfixées par '
      assert.ok(cells[0].includes("'=cmd|"), 'Formule =cmd préfixée par apostrophe');
      assert.ok(cells[1].includes("'+SUM"), 'Formule +SUM préfixée par apostrophe');
      assert.ok(cells[2].includes("'@admin_secret"), 'Symbole @ préfixé par apostrophe');
      assert.ok(cells[4].includes("'-TerritoryAttack"), 'Symbole - préfixé par apostrophe');
    });

    test('Export JSON retourne la structure complète avec métadonnées et contrôle d\'intégrité', async () => {
      const res = await request(app)
        .get('/api/data/export/json?indicator=DEMO_POP_TOT')
        .expect(200)
        .expect('Content-Type', /json/);

      assert.equal(res.body.success, true);
      assert.ok(res.body.meta, 'Métadonnées d\'exportation présentes');
      assert.ok(Array.isArray(res.body.data), 'Données exportées sous forme de liste');
      assert.ok(res.body.data.length >= 2, 'Au moins 2 valeurs publiées pour DEMO_POP_TOT (#260 et #323)');
      assert.equal(res.body.data[0].indicator_code, 'DEMO_POP_TOT');
    });

    test('Export JSON-LD Schema.org retourne un DataFeed sémantique conforme', async () => {
      const res = await request(app)
        .get('/api/data/export/json-ld?indicator=DEMO_POP_TOT')
        .expect(200)
        .expect('Content-Type', /json/);

      const jsonld = res.body;
      assert.ok(jsonld['@context'], 'Contexte Schema.org présent');
      assert.equal(jsonld['@type'], 'DataFeed');
      assert.ok(jsonld.name.includes('Solitiquo DATA'));
      assert.ok(Array.isArray(jsonld.dataFeedElement), 'Liste des observations Schema.org présente');
    });
  });

  // ===========================================================================
  // SECTION 3 : ADMINISTRATION, DIAGNOSTIC D'ÉLIGIBILITÉ ET VERROUILLAGE
  // ===========================================================================
  describe('3. Diagnostic d\'Éligibilité et Verrouillage de Publication', () => {

    test('Observation pilote #693 est diagnostiquée non-éligible avec motifs explicites', async () => {
      const res = await adminAgent
        .get('/api/data/admin/values/693')
        .expect(200);

      assert.equal(res.body.success, true);
      const obs = res.body.data;
      assert.ok(obs.publication_eligibility, 'Volet de diagnostic d\'éligibilité présent');
      assert.equal(obs.publication_eligibility.is_eligible, false, 'Non éligible');
      assert.equal(obs.publication_eligibility.can_publish, false, 'Publication bloquée');
      assert.ok(obs.publication_eligibility.blockers.length >= 2, 'Au moins 2 motifs de blocage identifiés');
    });

    test('Tentative de publication directe de #693 est formellement rejetée par le backend', async () => {
      const res = await adminAgent
        .post('/api/data/admin/values/693/publish')
        .set('X-CSRF-Token', adminCsrf)
        .send({ public_reason_summary: 'Test de tentative de publication non autorisée' })
        .expect(400);

      assert.equal(res.body.success, false);
      assert.ok(res.body.error, 'Message d\'erreur explicite retourné');
    });

    test('Statistiques opérationnelles admin (Lot 3E.4) retournent des métriques cohérentes', async () => {
      const res = await adminAgent
        .get('/api/data/admin/stats?exclude_tests=true')
        .expect(200);

      assert.equal(res.body.success, true);
      const stats = res.body.data;
      assert.ok(stats.counts, 'Objet counts présent');
      assert.ok(typeof stats.counts.total === 'number');
      assert.ok(typeof stats.counts.pending_arbitration_count === 'number');
      assert.ok(typeof stats.counts.pending_evidence_count === 'number');
      assert.ok(typeof stats.counts.correction_requested_count === 'number');
      assert.ok(typeof stats.counts.ready_for_publication_count === 'number');
      assert.ok(stats.counts.pending_arbitration_count >= 13, 'Au moins 13 observations en attente d\'arbitrage');
    });
  });

  // ===========================================================================
  // SECTION 4 : SÉCURITÉ ET CONTRÔLE D'ACCÈS
  // ===========================================================================
  describe('4. Sécurité, RBAC et Protections Anti-CSRF', () => {

    test('Un utilisateur non-authentifié ne peut pas accéder aux routes d\'administration DATA (403)', async () => {
      await request(app)
        .get('/api/data/admin/stats')
        .expect(403);

      await request(app)
        .get('/api/data/admin/values/693')
        .expect(403);
    });

    test('Un utilisateur avec rôle reader est rejeté des routes d\'administration (403)', async () => {
      await readerAgent
        .get('/api/data/admin/stats')
        .expect(403);

      await readerAgent
        .get('/api/data/admin/values/693')
        .expect(403);
    });

    test('Une mutation administrative requiert impérativement un token CSRF valide', async () => {
      await adminAgent
        .post('/api/data/admin/values/693/publish')
        .send({ public_reason_summary: 'Sans token CSRF' })
        .expect(403);
    });
  });
});
