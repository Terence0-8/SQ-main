'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../server');
const pool = require('../backend/config/database');
const { getAdminValueById, getStats } = require('../backend/services/dataAdminService');

test('LOT 3E.4 — PRÉPARATION OPÉRATIONNELLE DE LA PREMIÈRE DIFFUSION PUBLIQUE', async (t) => {
  const suffix = Date.now().toString().slice(-6);
  const rawPassword = 'Password123*';
  let adminUser;
  let adminAgent;
  let adminCsrf;
  let readerAgent;

  // 1. Initialisation des utilisateurs et sessions
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(rawPassword, salt);

  const uAdmin = await pool.query(`
    INSERT INTO users (username, email, password, role, is_active)
    VALUES ($1, $2, $3, 'admin', TRUE) RETURNING id, username, email, role
  `, [`admin_diff_${suffix}`, `admin_diff_${suffix}@solitiquo.cm`, hashedPassword]);
  adminUser = uAdmin.rows[0];

  const uReader = await pool.query(`
    INSERT INTO users (username, email, password, role, is_active)
    VALUES ($1, $2, $3, 'reader', TRUE) RETURNING id, username, email, role
  `, [`reader_diff_${suffix}`, `reader_diff_${suffix}@solitiquo.cm`, hashedPassword]);

  adminAgent = request.agent(app);
  await adminAgent.post('/api/auth/login').send({
    email: adminUser.email,
    password: rawPassword
  }).expect(200);

  const csrfRes = await adminAgent.get('/api/csrf-token').expect(200);
  adminCsrf = csrfRes.body.csrfToken;

  readerAgent = request.agent(app);
  await readerAgent.post('/api/auth/login').send({
    email: uReader.rows[0].email,
    password: rawPassword
  }).expect(200);

  t.after(async () => {
    try {
      if (adminUser) {
        await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [adminUser.id, uReader.rows[0].id]);
      }
    } catch {
      // Ignorer
    }
  });

  await t.test('1. Sanctuarisation absolue : 24 observations pilotes et observation #261 intègres', async () => {
    const checkRes = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE id BETWEEN 687 AND 710) as total_pilots,
        COUNT(*) FILTER (WHERE id BETWEEN 687 AND 710 AND editorial_status = 'draft') as draft_pilots,
        COUNT(*) FILTER (WHERE id BETWEEN 687 AND 710 AND is_active = false) as inactive_pilots,
        COUNT(*) FILTER (WHERE id BETWEEN 687 AND 710 AND audit_decision = 'pending') as pending_pilots,
        COUNT(*) FILTER (WHERE id = 261 AND editorial_status = 'published' AND is_active = true) as obs_261_published,
        (SELECT value_numeric FROM data_values WHERE id = 261) as obs_261_value
      FROM data_values
    `);

    const r = checkRes.rows[0];
    assert.equal(Number(r.total_pilots), 24, '24 observations pilotes');
    assert.equal(Number(r.draft_pilots), 24, '24 pilotes en draft');
    assert.equal(Number(r.inactive_pilots), 24, '24 pilotes inactifs');
    assert.equal(Number(r.pending_pilots), 24, '24 pilotes pending');
    assert.equal(Number(r.obs_261_published), 1, 'Obs #261 publiée et active');
    assert.equal(Number(r.obs_261_value), 29850, 'Obs #261 valeur 29 850 Mrds FCFA');
  });

  await t.test('2. Diagnostic d\'éligibilité à la publication : motifs bloquants explicites sur les 3 volets', async () => {
    // Vérifier sur une observation pilote sans preuve matérielle (ex: #693)
    const val693 = await getAdminValueById(693);
    assert.ok(val693);
    const elig = val693.publication_eligibility;
    assert.ok(elig, 'Diagnostic d\'éligibilité présent');
    assert.equal(elig.is_eligible, false, 'Inéligible à la publication');
    assert.equal(elig.can_publish, false, 'Bouton de publication verrouillé');
    assert.ok(elig.blockers.length >= 2, 'Au moins deux motifs bloquants identifiés');
    assert.equal(elig.breakdown.technical.passed, false, 'Volet technique en échec (draft)');
    assert.equal(elig.breakdown.documentary.passed, false, 'Volet documentaire en échec (PDF non archivé)');
    assert.equal(elig.breakdown.methodological.passed, false, 'Volet méthodologique en échec (décision pending)');

    // Tentative de publication directe d'une observation draft -> rejet 400
    const pubRes = await adminAgent
      .post('/api/data/admin/values/693/publish')
      .set('x-csrf-token', adminCsrf)
      .send({ public_reason_summary: 'Tentative illicite de publication automatique' })
      .expect(400);

    assert.equal(pubRes.body.success, false);
    assert.match(pubRes.body.error, /Transition interdite|statut attendu|methodologically_validated/i);
  });

  await t.test('3. Tableau de bord Administrateur : métriques opérationnelles du workflow', async () => {
    const stats = await getStats({ exclude_tests: true });
    assert.ok(stats.counts);
    const c = stats.counts;
    assert.ok(typeof c.total === 'number');
    assert.ok(typeof c.draft_count === 'number');
    assert.ok(typeof c.published_count === 'number');
    assert.ok(typeof c.pending_arbitration_count === 'number', 'Compteur pending_arbitration_count présent');
    assert.ok(typeof c.pending_evidence_count === 'number', 'Compteur pending_evidence_count présent');
    assert.ok(typeof c.correction_requested_count === 'number', 'Compteur correction_requested_count présent');
    assert.ok(typeof c.ready_for_publication_count === 'number', 'Compteur ready_for_publication_count présent');
    assert.ok(Array.isArray(stats.recentActivity), 'Journal d\'activité récent');
  });

  await t.test('4. Absence stricte de fuite de données non publiées sur l\'API publique', async () => {
    // 4.1 Recherche publique /api/data/search
    const searchRes = await request(app).get('/api/data/search?q=Cameroun').expect(200);
    assert.equal(searchRes.body.success, true);
    const returnedObs = searchRes.body.data || [];
    for (const obs of returnedObs) {
      // Aucun ID des 24 pilotes ne doit apparaître dans les résultats publics
      assert.ok(obs.id < 687 || obs.id > 710, `Fuite détectée : observation pilote #${obs.id} présente en recherche publique`);
    }

    // 4.2 Fiche indicateur /api/data/indicators/:code
    const gdpRes = await request(app).get('/api/data/indicators/ECO_PIB_NOM').expect(200);
    assert.equal(gdpRes.body.success, true);
    const history = gdpRes.body.data?.published_history || [];
    for (const h of history) {
      assert.ok(h.id < 687 || h.id > 710, `Fuite détectée : observation pilote #${h.id} présente dans published_history`);
    }
  });

  await t.test('5. Intégration de la recherche globale Solitiquo (/api/search)', async () => {
    // 5.1 Recherche avec mot-clé valide
    const res = await request(app).get('/api/search?q=pib').expect(200);
    assert.equal(res.body.success, true);
    const statResults = (res.body.results || []).filter(r => r.type === 'data_stat');
    assert.ok(statResults.length > 0, 'Au moins un résultat statistique publié retourné');
    const first = statResults[0];
    assert.ok(first.href.startsWith('data.html#indicator-'), 'Lien d\'ancrage vers la fiche indicateur');
    assert.equal(first.indicator_code, 'ECO_PIB_NOM');

    // 5.2 Protection contre requête trop courte
    await request(app).get('/api/search?q=a').expect(400);
  });

  await t.test('6. Exports de diffusion publique : cohérence CSV, JSON et JSON-LD', async () => {
    // 6.1 Export CSV
    const csvRes = await request(app).get('/api/data/indicators/ECO_PIB_NOM/export/csv').expect(200);
    assert.match(csvRes.headers['content-type'], /text\/csv/);
    assert.match(csvRes.text, /Code Indicateur/);
    assert.match(csvRes.text, /29850/);

    // 6.2 Export JSON
    const jsonRes = await request(app).get('/api/data/indicators/ECO_PIB_NOM/export/json').expect(200);
    assert.equal(jsonRes.body.success, true);
    assert.ok(Array.isArray(jsonRes.body.data));
    assert.ok(jsonRes.body.data.length > 0);
    assert.ok(jsonRes.body.data.some(d => d.indicator_code === 'ECO_PIB_NOM'));

    // 6.3 Export JSON-LD Schema.org
    const jsonLdRes = await request(app).get('/api/data/indicators/ECO_PIB_NOM/export/json-ld').expect(200);
    assert.match(jsonLdRes.headers['content-type'], /application\/ld\+json/);
    assert.ok(jsonLdRes.body['@context']);
    assert.ok(jsonLdRes.body['@type']);
  });

  await t.test('7. Sécurité des routes et permissions d\'administration', async () => {
    // 7.1 Rejet utilisateur non authentifié sur routes admin
    await request(app).get('/api/data/admin/stats').expect(403);
    await request(app).get('/api/data/admin/values').expect(403);

    // 7.2 Rejet d\'un lecteur (reader) sur les routes d\'administration
    await readerAgent.get('/api/data/admin/stats').expect(403);
    await readerAgent.post('/api/data/admin/values/261/publish').expect(403);

    // 7.3 Protection CSRF sur actions modificatrices
    await adminAgent
      .post('/api/data/admin/values/261/publish')
      .send({ public_reason_summary: 'Test sans CSRF' })
      .expect(403);
  });
});
