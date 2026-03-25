'use strict';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-only';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../server');

// ---------------------------------------------------------------------------
// GET /admin.html — protégée côté serveur
// ---------------------------------------------------------------------------
describe('GET /admin.html — protection serveur', () => {
  test('redirige vers auth.html si non connecté', async () => {
    const res = await request(app).get('/admin.html');
    assert.equal(res.status, 302);
    assert.ok(res.headers.location?.includes('auth.html'));
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/me — sans session
// ---------------------------------------------------------------------------
describe('GET /api/auth/me', () => {
  test('retourne isLoggedIn:false sans session', async () => {
    const res = await request(app).get('/api/auth/me');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.isLoggedIn, false);
    assert.equal(res.body.user, null);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/register — validation Joi (aucune requête DB)
// ---------------------------------------------------------------------------
describe('POST /api/auth/register — validation', () => {
  test('400 si body vide', async () => {
    const res = await request(app).post('/api/auth/register').send({});
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  test('400 si email invalide', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'testuser', email: 'pas-un-email', password: 'Azerty123' });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  test('400 si mot de passe sans majuscule', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'testuser', email: 'test@example.com', password: 'azerty123' });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  test('400 si mot de passe trop court', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'testuser', email: 'test@example.com', password: 'Az1' });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  test('400 si username non alphanumérique', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'user name!', email: 'test@example.com', password: 'Azerty123' });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  test('400 si username trop court (< 3 chars)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'ab', email: 'test@example.com', password: 'Azerty123' });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/login — validation Joi (aucune requête DB)
// ---------------------------------------------------------------------------
describe('POST /api/auth/login — validation', () => {
  test('400 si body vide', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  test('400 si email manquant', async () => {
    const res = await request(app).post('/api/auth/login').send({ password: 'Azerty123' });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  test('400 si password manquant', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'test@example.com' });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout — protection CSRF
// ---------------------------------------------------------------------------
describe('POST /api/auth/logout — CSRF', () => {
  test('403 sans token CSRF', async () => {
    const res = await request(app).post('/api/auth/logout').send({});
    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
  });

  test('403 avec token CSRF incorrect', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('x-csrf-token', 'faux-token-invalide')
      .send({});
    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
  });
});
