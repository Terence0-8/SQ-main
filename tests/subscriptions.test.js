'use strict';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-only';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../server');
const {
  getPricingForCountry,
  verifyFlutterwaveWebhook,
} = require('../backend/routes/subscriptions');

// ---------------------------------------------------------------------------
// 1. GÉOTARIFICATION FLUTTERWAVE & STRIPE
// ---------------------------------------------------------------------------
describe('Tarification et devises régionales', () => {
  test('CM (Cameroun) retourne XAF et le provider flutterwave', () => {
    const cmPricing = getPricingForCountry('CM');
    assert.equal(cmPricing.country, 'CM');
    assert.equal(cmPricing.currency, 'XAF');
    assert.equal(cmPricing.provider, 'flutterwave');
    assert.equal(cmPricing.amount, 3000);
  });

  test('Pays UEMOA (BJ, TG, SN, CI) retournent XOF et flutterwave', () => {
    ['BJ', 'TG', 'SN', 'CI'].forEach((code) => {
      const p = getPricingForCountry(code);
      assert.equal(p.country, code);
      assert.equal(p.currency, 'XOF');
      assert.equal(p.provider, 'flutterwave');
      assert.equal(p.amount, 3000);
    });
  });

  test('GET /api/subscriptions/pricing retourne une devise et un provider supporté', async () => {
    const res = await request(app).get('/api/subscriptions/pricing');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.currency, 'currency manquant');
    assert.ok(res.body.amount, 'amount manquant');
    assert.ok(['stripe', 'flutterwave'].includes(res.body.provider));
  });
});

// ---------------------------------------------------------------------------
// 2. SÉCURITÉ DU WEBHOOK FLUTTERWAVE
// ---------------------------------------------------------------------------
describe('Gestion et sécurité des Webhooks Flutterwave', () => {
  test('verifyFlutterwaveWebhook rejette si le secret est absent ou vide', () => {
    const oldSecret = process.env.FLUTTERWAVE_WEBHOOK_SECRET;
    delete process.env.FLUTTERWAVE_WEBHOOK_SECRET;

    const fakeReq = { headers: { 'verif-hash': 'random_hash' } };
    assert.equal(verifyFlutterwaveWebhook(fakeReq), false);

    process.env.FLUTTERWAVE_WEBHOOK_SECRET = '  ';
    assert.equal(verifyFlutterwaveWebhook(fakeReq), false);

    process.env.FLUTTERWAVE_WEBHOOK_SECRET = oldSecret;
  });

  test('verifyFlutterwaveWebhook valide si signature correspond au secret', () => {
    const oldSecret = process.env.FLUTTERWAVE_WEBHOOK_SECRET;
    process.env.FLUTTERWAVE_WEBHOOK_SECRET = 'mon_secret_flw_test_123';

    const validReq = { headers: { 'verif-hash': 'mon_secret_flw_test_123' } };
    assert.equal(verifyFlutterwaveWebhook(validReq), true);

    const invalidReq = { headers: { 'verif-hash': 'mauvaise_signature' } };
    assert.equal(verifyFlutterwaveWebhook(invalidReq), false);

    process.env.FLUTTERWAVE_WEBHOOK_SECRET = oldSecret;
  });

  test('POST /api/subscriptions/webhook sans signature valide est rejeté (401)', async () => {
    const oldSecret = process.env.FLUTTERWAVE_WEBHOOK_SECRET;
    process.env.FLUTTERWAVE_WEBHOOK_SECRET = 'test_webhook_secret_flw';

    const res = await request(app)
      .post('/api/subscriptions/webhook')
      .set('verif-hash', 'signature_corrompue')
      .send({ event: 'charge.completed', data: { id: 1234 } });

    assert.equal(res.status, 401);

    process.env.FLUTTERWAVE_WEBHOOK_SECRET = oldSecret;
  });

  test('POST /api/subscriptions/webhook avec payload frauduleux / manquant est rejeté (400)', async () => {
    const oldSecret = process.env.FLUTTERWAVE_WEBHOOK_SECRET;
    process.env.FLUTTERWAVE_WEBHOOK_SECRET = 'test_webhook_secret_flw';

    const res = await request(app)
      .post('/api/subscriptions/webhook')
      .set('verif-hash', 'test_webhook_secret_flw')
      .send({}); // Pas de champ data

    assert.equal(res.status, 400);

    process.env.FLUTTERWAVE_WEBHOOK_SECRET = oldSecret;
  });
});

// ---------------------------------------------------------------------------
// 3. PROTECTIONS CSRF & AUTH SUR LES ABONNEMENTS
// ---------------------------------------------------------------------------
describe('Protections CSRF & Auth', () => {
  test('POST /api/subscriptions/init-payment sans CSRF est bloqué (403)', async () => {
    const res = await request(app).post('/api/subscriptions/init-payment').send({ plan: 'monthly' });
    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
  });

  test('POST /api/subscriptions/init-stripe-payment sans CSRF est bloqué (403)', async () => {
    const res = await request(app)
      .post('/api/subscriptions/init-stripe-payment')
      .send({ plan: 'monthly' });
    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
  });

  test('POST /api/subscriptions/init-stripe-payment avec session et CSRF retourne HTTP 410 Gone sans Location header', async () => {
    const bcrypt = require('bcrypt');
    const pool = require('../backend/config/database');
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('Password123!', salt);
    const email = `sub_depr_test_${Date.now()}@example.com`;
    const userRes = await pool.query(
      `INSERT INTO users (username, email, password, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, 'reader', TRUE, NOW(), NOW()) RETURNING id`,
      [`subdepr${Math.floor(Math.random() * 100000)}`, email, hash]
    );
    const userId = userRes.rows[0].id;

    try {
      const agent = request.agent(app);
      const loginRes = await agent
        .post('/api/auth/login')
        .send({ email, password: 'Password123!' });
      assert.equal(loginRes.status, 200);

      const csrfRes = await agent.get('/api/csrf-token');
      const csrfToken = csrfRes.body.csrfToken;

      const res = await agent
        .post('/api/subscriptions/init-stripe-payment')
        .set('X-CSRF-Token', csrfToken)
        .send({ plan: 'monthly' });

      assert.equal(res.status, 410);
      assert.equal(res.body.success, false);
      assert.equal(res.body.deprecated, true);
      assert.equal(res.body.canonical_endpoint, '/api/stripe/checkout');
      assert.equal(res.headers.location, undefined); // Aucun faux header de redirection
    } finally {
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    }
  });

  test('POST /api/subscriptions/simulate-payment sans CSRF est bloqué (403)', async () => {
    const res = await request(app)
      .post('/api/subscriptions/simulate-payment')
      .send({ plan: 'monthly' });
    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
  });

  test('POST /api/subscriptions/cancel sans CSRF est bloqué (403)', async () => {
    const res = await request(app).post('/api/subscriptions/cancel').send({});
    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
  });

  test('GET /api/subscriptions/confirm-stripe sans session retourne 401', async () => {
    const res = await request(app)
      .get('/api/subscriptions/confirm-stripe')
      .query({ payment_intent: 'pi_test_fake' });
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });
});
