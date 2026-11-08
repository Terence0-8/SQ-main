'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../server');
const pool = require('../backend/config/database');
const bcrypt = require('bcrypt');

describe('SOLITIQUO DATA — LOT 3I : TESTS D\'INTÉGRITÉ VISUELLE & TECHNIQUE BACK-OFFICE', () => {
  let adminCookie;
  let testAdminId;

  before(async () => {
    const suffix = Date.now().toString().slice(-6);
    const rawPassword = 'PasswordLot3i*';
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(rawPassword, salt);

    const uRes = await pool.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'admin', TRUE) RETURNING id, email
    `, [`adm_lot3i_${suffix}`, `adm_lot3i_${suffix}@solitiquo.cm`, hashedPassword]);
    testAdminId = uRes.rows[0].id;

    const csrfRes = await request(app).get('/api/csrf-token');
    const csrfToken = csrfRes.body.csrfToken;
    const cookieHeader = csrfRes.headers['set-cookie'];

    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .send({ email: uRes.rows[0].email, password: rawPassword });

    adminCookie = loginRes.headers['set-cookie'];
  });

  after(async () => {
    if (testAdminId) {
      await pool.query('DELETE FROM users WHERE id = $1', [testAdminId]);
    }
  });

  test('1. Les fichiers SVG de logo existent et ne contiennent aucun fond carré blanc opaque plein écran', () => {
    const publicDir = path.resolve(__dirname, '..');
    const logoAdminPath = path.join(publicDir, 'logo-admin.svg');
    const logoMarkPath = path.join(publicDir, 'logo-mark.svg');
    const logoWhitePath = path.join(publicDir, 'logo-white.svg');

    assert.equal(fs.existsSync(logoAdminPath), true, 'logo-admin.svg doit exister');
    assert.equal(fs.existsSync(logoMarkPath), true, 'logo-mark.svg doit exister');
    assert.equal(fs.existsSync(logoWhitePath), true, 'logo-white.svg doit exister');

    const adminSvg = fs.readFileSync(logoAdminPath, 'utf8');
    assert.ok(adminSvg.includes('viewBox'), 'logo-admin.svg doit posséder un viewBox');
    assert.ok(adminSvg.includes('#37463D'), 'logo-admin.svg doit posséder le vert institutionnel');
    assert.ok(!adminSvg.includes('<path fill="#FEFEFE" d="M0 0h1080v1080H0z"/>'), 'Pas de rectangle blanc opaque');

    const markSvg = fs.readFileSync(logoMarkPath, 'utf8');
    assert.ok(markSvg.includes('viewBox'), 'logo-mark.svg doit posséder un viewBox');
    assert.ok(!markSvg.includes('<path fill="#FEFEFE" d="M0 0h1080v1080H0z"/>'), 'Pas de rectangle blanc opaque');
  });

  test('2. admin.html utilise le logo officiel et n\'applique aucun filtre d\'inversion destructeur', () => {
    const adminHtml = fs.readFileSync(path.resolve(__dirname, '../admin.html'), 'utf8');
    assert.ok(adminHtml.includes('logo-admin.svg'), 'admin.html doit référencer logo-admin.svg');

    const adminCss = fs.readFileSync(path.resolve(__dirname, '../css/pages/admin.css'), 'utf8');
    assert.ok(!adminCss.includes('filter: brightness(0) invert(1)'), 'Pas de filtre destructeur');
  });

  test('3. admin.css contient les règles de responsive et le bouton hamburger', () => {
    const adminCss = fs.readFileSync(path.resolve(__dirname, '../css/pages/admin.css'), 'utf8');
    assert.ok(adminCss.includes('.sidebar'), 'CSS doit styler .sidebar');
    assert.ok(adminCss.includes('.sidebar-toggle-btn'), 'CSS doit styler .sidebar-toggle-btn');
    assert.ok(adminCss.includes('.sidebar-overlay'), 'CSS doit styler .sidebar-overlay');
    assert.ok(adminCss.includes('.nav-item > span:not(.nav-badge)'), 'Sélecteur de libellé sans collision');
    assert.ok(adminCss.includes('.nav-badge'), 'CSS doit styler .nav-badge');
    assert.ok(adminCss.includes('@media (max-width: 991px)'), 'Règles responsive tablette');
    assert.ok(adminCss.includes('@media (max-width: 640px)'), 'Règles responsive mobile');
  });

  test('4. admin.html possède la structure off-canvas (overlay + toggle)', () => {
    const adminHtml = fs.readFileSync(path.resolve(__dirname, '../admin.html'), 'utf8');
    assert.ok(adminHtml.includes('id="btn-toggle-sidebar"'), 'admin.html doit avoir #btn-toggle-sidebar');
    assert.ok(adminHtml.includes('id="sidebar-overlay"'), 'admin.html doit avoir #sidebar-overlay');
  });

  test('5. admin.html propose les 9 sous-onglets et les 4 boutons du bandeau hero', () => {
    const adminHtml = fs.readFileSync(path.resolve(__dirname, '../admin.html'), 'utf8');
    assert.ok(adminHtml.includes('data-subnav-tabs'), 'Conteneur data-subnav-tabs');
    assert.ok(adminHtml.includes('data-subnav-actions'), 'Conteneur data-subnav-actions');
    assert.ok(adminHtml.includes('data-toggle-exclude-tests'), 'Toggle exclude tests');

    assert.ok(adminHtml.includes('Nouvelle observation'), 'Bouton Nouvelle observation');
    assert.ok(adminHtml.includes('Voir Hub Public'), 'Bouton Voir Hub Public');
    assert.ok(adminHtml.includes('Ouvrir Carte'), 'Bouton Ouvrir Carte');
    assert.ok(adminHtml.includes('Sources &amp; Méthodes'), 'Bouton Sources & Méthodes');
  });

  test('6. Le décompte en base de données réconcilie la somme des statuts avec le total catalogue', async () => {
    const totalRes = await pool.query('SELECT COUNT(*) AS total FROM data_values');
    const total = parseInt(totalRes.rows[0].total, 10);
    assert.ok(total >= 1499, 'Total catalogue doit comporter au moins 1499 observations');

    const statusRes = await pool.query(`
      SELECT editorial_status, COUNT(*) AS count
      FROM data_values
      GROUP BY editorial_status
    `);
    const counts = {};
    let sum = 0;
    statusRes.rows.forEach(r => {
      const c = parseInt(r.count, 10);
      counts[r.editorial_status] = c;
      sum += c;
    });

    assert.equal(sum, total, 'La somme de tous les statuts doit exactement égaler le total général');
    assert.ok(counts.draft >= 1000, 'Brouillons >= 1000');
    assert.ok(counts.published >= 195, 'Publiées >= 195');

    const realRes = await pool.query(`
      SELECT COUNT(*) AS count FROM data_values dv
      JOIN data_indicators di ON di.id = dv.indicator_id
      WHERE di.code NOT LIKE 'IND_MIG%'
        AND di.code NOT LIKE 'IND_TEST%'
        AND di.name NOT LIKE 'Indicateur Test%'
        AND di.name NOT LIKE 'Indicateur Mig%'
    `);
    assert.ok(parseInt(realRes.rows[0].count, 10) >= 370, 'Données réelles >= 370');
  });

  test('7. L\'endpoint GET /api/data/admin/quality-report répond avec succès pour un admin authentifié', async () => {
    const res = await request(app)
      .get('/api/data/admin/quality-report')
      .set('Cookie', adminCookie);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(typeof res.body.quality_score, 'number');
    assert.ok(res.body.quality_score >= 80, 'Score de qualité >= 80');
    assert.equal(res.body.status, 'CONFORME_PRODUCTION');
    assert.equal(Array.isArray(res.body.conformities), true);
    assert.ok(res.body.conformities.length >= 5);
    assert.equal(Array.isArray(res.body.anomalies), true);
    assert.equal(res.body.anomalies.length, 0);
    assert.equal(Array.isArray(res.body.warnings), true);
  });

  test('8. Le template admin.html et js/admin-data.js intègrent le widget de qualité avec bouton actualiser et timestamp', () => {
    const adminHtml = fs.readFileSync(path.resolve(__dirname, '../admin.html'), 'utf8');
    assert.ok(adminHtml.includes('id="editorial-quality-card"'));
    assert.ok(adminHtml.includes('id="quality-score-value"'));
    assert.ok(adminHtml.includes('id="quality-status-pill"'));
    assert.ok(adminHtml.includes('id="btn-refresh-quality"'));
    assert.ok(adminHtml.includes('id="quality-report-body"'));
    assert.ok(adminHtml.includes('id="quality-eval-timestamp"'));

    const adminDataJs = fs.readFileSync(path.resolve(__dirname, '../js/admin-data.js'), 'utf8');
    assert.ok(adminDataJs.includes('loadQualityReport()'));
    assert.ok(adminDataJs.includes('quality-kpi-grid'));
    assert.ok(adminDataJs.includes('quality-details-grid'));
    assert.ok(adminDataJs.includes('quality-loading-state'));
    assert.ok(adminDataJs.includes('quality-error-state'));
  });

  test('9. Les observations historiques (#260, #261, #262, #323) sont sanctuarisées, publiées et actives', async () => {
    const res = await pool.query(`
      SELECT id, editorial_status, is_active FROM data_values
      WHERE id IN (260, 261, 262, 323)
      ORDER BY id ASC
    `);
    assert.equal(res.rows.length, 4);
    res.rows.forEach(r => {
      assert.equal(r.editorial_status, 'published');
      assert.equal(r.is_active, true);
    });
  });

  test('10. Les 24 observations pilotes (#687 à #710) sont strictement confinées en statut draft, is_active=false, audit_decision=pending', async () => {
    const res = await pool.query(`
      SELECT id, editorial_status, is_active, audit_decision FROM data_values
      WHERE id BETWEEN 687 AND 710
      ORDER BY id ASC
    `);
    assert.equal(res.rows.length, 24);
    res.rows.forEach(r => {
      assert.equal(r.editorial_status, 'draft');
      assert.equal(r.is_active, false);
      assert.equal(r.audit_decision, 'pending');
    });
  });
});
