/**
 * =============================================================================
 * SOLITIQUO DATA — LOT 2C INTERFACE D'ADMINISTRATION BACKEND TESTS
 * Vérification des endpoints supportant l'interface d'administration :
 * 1. GET /api/data/admin/stats (statistiques réelles et timeline d'audit)
 * 2. GET /api/data/admin/referentials/breakdowns (dimensions et catégories)
 * 3. GET /api/data/admin/values/:id/history (instantanés de versions et journal d'audit)
 * =============================================================================
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../server');
const pool = require('../backend/config/database');

describe('SOLITIQUO DATA — LOT 2C ADMIN INTERFACE BACKEND API', () => {
  const suffix = Date.now().toString().slice(-6);
  const rawPassword = 'Password123*';
  let adminUser;
  let adminAgent;
  let adminCsrf;
  let readerAgent;
  let testValueId;
  let indicatorId;

  before(async () => {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(rawPassword, salt);

    // 1. Utilisateurs
    const uAdmin = await pool.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'admin', TRUE) RETURNING id, username, email, role
    `, [`admin_ui_${suffix}`, `admin_ui_${suffix}@solitiquo.cm`, hashedPassword]);
    adminUser = uAdmin.rows[0];

    const uReader = await pool.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'reader', TRUE) RETURNING id, username, email, role
    `, [`reader_ui_${suffix}`, `reader_ui_${suffix}@solitiquo.cm`, hashedPassword]);

    // Sessions & CSRF
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

    // 2. Territoire et Indicateur dédié
    const terRes = await pool.query("SELECT id FROM territories WHERE code = 'CMR' LIMIT 1");
    const indRes = await pool.query(
      "INSERT INTO data_indicators (code, name, category, unit, is_active) VALUES ($1, 'Indicateur UI Test', 'demographie', 'habitants', TRUE) RETURNING id",
      [`IND_UI_${suffix}`]
    );
    indicatorId = indRes.rows[0].id;

    const srcRes = await pool.query(
      "INSERT INTO data_sources (name, institution_type) VALUES ($1, 'national_statistical_office') RETURNING id",
      [`Source UI Test ${suffix}`]
    );

    const created = await adminAgent
      .post('/api/data/admin/values')
      .set('x-csrf-token', adminCsrf)
      .send({
        indicator_id: indicatorId,
        territory_id: terRes.rows[0].id,
        period_type: 'ANNUAL',
        period_start: '2025-01-01',
        period_end: '2025-12-31',
        methodology_nature: 'sample_survey',
        value_numeric: 123456.78
      })
      .expect(201);

    testValueId = created.body.data.id;

    // Ajouter une source
    await adminAgent
      .post(`/api/data/admin/values/${testValueId}/sources`)
      .set('x-csrf-token', adminCsrf)
      .send({
        source_id: srcRes.rows[0].id,
        source_role: 'primary',
        documentary_tier: 'TIER_1_OFFICIAL',
        citation_reference: 'Rapport Annuel 2025'
      })
      .expect(201);
  });

  after(async () => {
    // Note : data_value_audit_log est protégée par un trigger d'immutabilité absolue (Migration 3), aucun DELETE permis
    if (testValueId) {
      try {
        await pool.query('DELETE FROM data_value_sources WHERE data_value_id = $1', [testValueId]);
        // Désactiver ou archiver au lieu de supprimer pour respecter les FK d'audit log
        await pool.query("UPDATE data_values SET is_active = FALSE, editorial_status = 'archived' WHERE id = $1", [testValueId]);
      } catch {
        // Ignorer
      }
    }
    if (indicatorId) {
      try {
        await pool.query('UPDATE data_indicators SET is_active = FALSE WHERE id = $1', [indicatorId]);
      } catch {}
    }
  });

  test('GET /api/data/admin/stats — retourne les statistiques et comptages réels', async () => {
    const res = await adminAgent.get('/api/data/admin/stats').expect(200);

    assert.equal(res.body.success, true);
    assert.ok(res.body.data.counts);
    assert.ok(typeof res.body.data.counts.total === 'number');
    assert.ok(typeof res.body.data.counts.draft_count === 'number');
    assert.ok(typeof res.body.data.counts.under_review_count === 'number');
    assert.ok(typeof res.body.data.counts.validated_count === 'number');
    assert.ok(typeof res.body.data.counts.published_count === 'number');
    assert.ok(typeof res.body.data.counts.revoked_count === 'number');
    assert.ok(Array.isArray(res.body.data.recentActivity));
    assert.ok(Array.isArray(res.body.data.recentPublications));
  });

  test('GET /api/data/admin/referentials/breakdowns — retourne les dimensions structurées', async () => {
    const res = await adminAgent.get('/api/data/admin/referentials/breakdowns').expect(200);

    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
    if (res.body.data.length > 0) {
      const dim = res.body.data[0];
      assert.ok(dim.code);
      assert.ok(Array.isArray(dim.items));
    }
  });

  test('GET /api/data/admin/values/:id/history — retourne instantanés de versions et audit log', async () => {
    const res = await adminAgent.get(`/api/data/admin/values/${testValueId}/history`).expect(200);

    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data.versions));
    assert.ok(Array.isArray(res.body.data.auditTrail));
    assert.ok(res.body.data.auditTrail.length >= 1, 'Au moins l action CREATE doit figurer dans l audit trail');
    assert.equal(res.body.data.auditTrail[0].action, 'CREATE');
  });

  test('Sécurité : GET /api/data/admin/stats refuse un accès non-admin/writer (reader)', async () => {
    await readerAgent.get('/api/data/admin/stats').expect(403);
  });
});
