'use strict';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-only';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../server');

// ---------------------------------------------------------------------------
// GET /api/subscriptions/pricing — public, aucune auth requise
// ---------------------------------------------------------------------------
describe('GET /api/subscriptions/pricing', () => {
  test('200 avec les champs de tarification', async () => {
    const res = await request(app).get('/api/subscriptions/pricing');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.currency, 'currency manquant');
    assert.ok(res.body.amount, 'amount manquant');
    assert.ok(res.body.provider, 'provider manquant');
  });

  test('provider est stripe ou cinetpay', async () => {
    const res = await request(app).get('/api/subscriptions/pricing');
    assert.ok(['stripe', 'cinetpay'].includes(res.body.provider));
  });
});

// ---------------------------------------------------------------------------
// POST /api/subscriptions/init-payment — CSRF global s'exécute avant isAuthenticated
// ---------------------------------------------------------------------------
describe('POST /api/subscriptions/init-payment — CSRF + auth', () => {
  test('403 sans token CSRF (CSRF vérifié avant auth)', async () => {
    const res = await request(app).post('/api/subscriptions/init-payment').send({ plan: 'monthly' });
    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
  });
});

// ---------------------------------------------------------------------------
// POST /api/subscriptions/init-stripe-payment — CSRF global s'exécute avant isAuthenticated
// ---------------------------------------------------------------------------
describe('POST /api/subscriptions/init-stripe-payment — CSRF + auth', () => {
  test('403 sans token CSRF (CSRF vérifié avant auth)', async () => {
    const res = await request(app)
      .post('/api/subscriptions/init-stripe-payment')
      .send({ plan: 'monthly' });
    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
  });
});

// ---------------------------------------------------------------------------
// POST /api/subscriptions/simulate-payment — CSRF global s'exécute avant isAuthenticated
// ---------------------------------------------------------------------------
describe('POST /api/subscriptions/simulate-payment — CSRF + auth', () => {
  test('403 sans token CSRF (CSRF vérifié avant auth)', async () => {
    const res = await request(app)
      .post('/api/subscriptions/simulate-payment')
      .send({ plan: 'monthly' });
    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
  });
});

// ---------------------------------------------------------------------------
// POST /api/subscriptions/cancel — CSRF global s'exécute avant isAuthenticated
// ---------------------------------------------------------------------------
describe('POST /api/subscriptions/cancel — CSRF + auth', () => {
  test('403 sans token CSRF (CSRF vérifié avant auth)', async () => {
    const res = await request(app).post('/api/subscriptions/cancel').send({});
    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
  });
});

// ---------------------------------------------------------------------------
// GET /api/subscriptions/confirm-stripe — auth requise
// ---------------------------------------------------------------------------
describe('GET /api/subscriptions/confirm-stripe — auth', () => {
  test('401 sans session', async () => {
    const res = await request(app)
      .get('/api/subscriptions/confirm-stripe')
      .query({ payment_intent: 'pi_test_fake' });
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });
});
