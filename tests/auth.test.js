'use strict';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-only';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../server');
const pool = require('../backend/config/database');

// ---------------------------------------------------------------------------
// CONFIGURATION ET UTILISATEURS DE TEST
// ---------------------------------------------------------------------------
const ACTIVE_USER_EMAIL = 'auth_test_active@example.com';
const INACTIVE_USER_EMAIL = 'auth_test_inactive@example.com';
const TEST_PASSWORD = 'Password123!';

describe('SUITE COMPLÈTE AUTHENTIFICATION & OAUTH', () => {
  let activeUserId;
  let inactiveUserId;

  before(async () => {
    // Nettoyage au cas où
    await pool.query('DELETE FROM users WHERE email IN ($1, $2)', [ACTIVE_USER_EMAIL, INACTIVE_USER_EMAIL]);
    await pool.query("DELETE FROM users WHERE username LIKE 'regusertest%'");

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(TEST_PASSWORD, salt);

    // 1. Compte actif
    const actRes = await pool.query(
      `INSERT INTO users (username, email, password, role, is_active, created_at, updated_at)
       VALUES ('authactiveuser', $1, $2, 'reader', TRUE, NOW(), NOW())
       RETURNING id`,
      [ACTIVE_USER_EMAIL, hashedPassword]
    );
    activeUserId = actRes.rows[0].id;

    // 2. Compte inactif (suspendu)
    const inactRes = await pool.query(
      `INSERT INTO users (username, email, password, role, is_active, created_at, updated_at)
       VALUES ('authinactiveuser', $1, $2, 'reader', FALSE, NOW(), NOW())
       RETURNING id`,
      [INACTIVE_USER_EMAIL, hashedPassword]
    );
    inactiveUserId = inactRes.rows[0].id;
  });

  after(async () => {
    if (activeUserId || inactiveUserId) {
      await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [activeUserId, inactiveUserId]);
    }
    await pool.query("DELETE FROM users WHERE username LIKE 'regusertest%'");
  });

  // ---------------------------------------------------------------------------
  // 1. GET /admin.html — protégée côté serveur
  // ---------------------------------------------------------------------------
  describe('1. Protection serveur des routes sensibles', () => {
    test('redirige vers auth.html si non connecté', async () => {
      const res = await request(app).get('/admin.html');
      assert.equal(res.status, 302);
      assert.ok(res.headers.location?.includes('auth.html'));
    });
  });

  // ---------------------------------------------------------------------------
  // 2. GET /api/auth/me
  // ---------------------------------------------------------------------------
  describe('2. GET /api/auth/me', () => {
    test('retourne isLoggedIn:false sans session', async () => {
      const res = await request(app).get('/api/auth/me');
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.isLoggedIn, false);
      assert.equal(res.body.user, null);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. POST /api/auth/login — Contrôle de mot de passe et de compte actif
  // ---------------------------------------------------------------------------
  describe('3. POST /api/auth/login — Contrôle de mot de passe et de compte actif', () => {
    test('400 si body vide', async () => {
      const res = await request(app).post('/api/auth/login').send({});
      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
    });

    test('400 si identifiants inexistants', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'inconnu@example.com', password: 'Password123!' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Email ou mot de passe incorrect.');
    });

    test('400 si mauvais mot de passe pour un compte existant', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: ACTIVE_USER_EMAIL, password: 'MauvaisMotDePasse123!' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Email ou mot de passe incorrect.');
    });

    test('403 si le compte est inactif ou suspendu (is_active = FALSE)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: INACTIVE_USER_EMAIL, password: TEST_PASSWORD });
      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error, 'Ce compte est suspendu ou inactif.');
    });

    test('200 connexion réussie avec un compte actif', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: ACTIVE_USER_EMAIL, password: TEST_PASSWORD });
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.user.email, ACTIVE_USER_EMAIL);
      assert.equal(res.body.user.username, 'authactiveuser');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. POST /api/auth/register — Validation et inscription
  // ---------------------------------------------------------------------------
  describe('4. POST /api/auth/register — Inscription et validation Joi', () => {
    test('400 si body vide', async () => {
      const res = await request(app).post('/api/auth/register').send({});
      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
    });

    test('400 si email invalide', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'testuser', email: 'pas-un-email', password: 'Password123' });
      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
    });

    test('400 si mot de passe sans majuscule', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'testuser', email: 'test@example.com', password: 'password123' });
      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
    });

    test('400 si mot de passe trop court (< 8 car.)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'testuser', email: 'test@example.com', password: 'Pass1' });
      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
    });

    test('200 inscription réussie pour un compte conforme', async () => {
      const randSuffix = Math.floor(100000 + Math.random() * 900000);
      const uniqueUsername = `regusertest${randSuffix}`;
      const uniqueEmail = `${uniqueUsername}@example.com`;
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: uniqueUsername,
          email: uniqueEmail,
          password: 'ValidPassword123'
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.user.username, uniqueUsername);
    });

    test('bloque après dépassement du quota d’inscription avec HTTP 429', async () => {
      let lastRes;
      for (let i = 0; i < 11; i++) {
        lastRes = await request(app)
          .post('/api/auth/register')
          .send({ username: `spamuser${i}`, email: 'invalid-email', password: 'bad' });
      }

      assert.equal(lastRes.status, 429);
      assert.equal(lastRes.body.success, false);
      assert.ok(lastRes.body.error.includes("Trop de tentatives d'inscription"));
    });

    test('le limiteur d’inscription ne perturbe pas la route de connexion', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'inconnu@example.com', password: 'Password123!' });

      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Email ou mot de passe incorrect.');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. OAUTH GOOGLE & FACEBOOK — Disponibilité et erreurs maîtrisées
  // ---------------------------------------------------------------------------
  describe('5. OAuth Google & Facebook — Protection contre erreurs 500 et état non configuré', () => {
    test('GET /api/auth/google répond 503 si non configuré', async () => {
      const savedId = process.env.GOOGLE_CLIENT_ID;
      try {
        delete process.env.GOOGLE_CLIENT_ID;
        const res = await request(app).get('/api/auth/google');
        assert.equal(res.status, 503);
        assert.equal(res.body.success, false);
        assert.ok(res.body.error.includes('non configuré'));
      } finally {
        process.env.GOOGLE_CLIENT_ID = savedId;
      }
    });

    test('GET /api/auth/google/callback répond 503 si non configuré', async () => {
      const savedId = process.env.GOOGLE_CLIENT_ID;
      try {
        delete process.env.GOOGLE_CLIENT_ID;
        const res = await request(app).get('/api/auth/google/callback');
        assert.equal(res.status, 503);
        assert.equal(res.body.success, false);
      } finally {
        process.env.GOOGLE_CLIENT_ID = savedId;
      }
    });

    test('GET /api/auth/facebook répond 503 si non configuré', async () => {
      const savedId = process.env.FACEBOOK_APP_ID;
      try {
        delete process.env.FACEBOOK_APP_ID;
        const res = await request(app).get('/api/auth/facebook');
        assert.equal(res.status, 503);
        assert.equal(res.body.success, false);
        assert.ok(res.body.error.includes('non configuré'));
      } finally {
        process.env.FACEBOOK_APP_ID = savedId;
      }
    });

    test('GET /api/auth/facebook/callback répond 503 si non configuré', async () => {
      const savedId = process.env.FACEBOOK_APP_ID;
      try {
        delete process.env.FACEBOOK_APP_ID;
        const res = await request(app).get('/api/auth/facebook/callback');
        assert.equal(res.status, 503);
        assert.equal(res.body.success, false);
      } finally {
        process.env.FACEBOOK_APP_ID = savedId;
      }
    });

    test('GET /api/auth/google redirige vers Google (302) quand les clés sont présentes', async () => {
      if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
        const res = await request(app).get('/api/auth/google');
        assert.equal(res.status, 302);
        assert.ok(res.headers.location?.includes('accounts.google.com'));
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 6. /api/auth/logout — Déconnexion
  // ---------------------------------------------------------------------------
  describe('6. /api/auth/logout — Déconnexion', () => {
    test('200 déconnexion réussie via POST /api/auth/logout', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .send({});
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.message, 'Déconnecté.');
    });

    test('200 déconnexion réussie via GET /api/auth/logout', async () => {
      const res = await request(app)
        .get('/api/auth/logout');
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.message, 'Déconnecté.');
    });
  });
});
