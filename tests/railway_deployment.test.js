'use strict';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-only';

const { describe, test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../server');
const appConfig = require('../backend/config/appConfig');
const db = require('../backend/config/database');

const TEST_USER = 'solitiquo_beta';
const TEST_PASS = 'P@ssw0rdSecurise2026!';
const VALID_AUTH_HEADER = 'Basic ' + Buffer.from(`${TEST_USER}:${TEST_PASS}`).toString('base64');
const INVALID_AUTH_HEADER = 'Basic ' + Buffer.from(`hacker:wrongpass`).toString('base64');

describe('PRÉPARATION AU DÉPLOIEMENT RAILWAY — SUITE DE SÉCURITÉ ET CONFIGURATION', () => {

  beforeEach(() => {
    // Activer l'accès restreint pour les tests de ce bloc
    appConfig.siteAccess.enabled = true;
    appConfig.siteAccess.user = TEST_USER;
    appConfig.siteAccess.password = TEST_PASS;
  });

  afterEach(() => {
    // Rétablir pour ne pas perturber les tests ultérieurs
    appConfig.siteAccess.enabled = false;
  });

  after(async () => {
    // Fermer le pool de connexion DB principal pour terminer proprement le processus
    await db.closePool();
  });

  // 1. Health check : /api/ping exempté
  describe('1. Health check et sondes de disponibilité', () => {
    test('GET /api/ping répond 200 { ok: true } même avec SITE_ACCESS activé et sans identifiants', async () => {
      const res = await request(app).get('/api/ping');
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.ok(typeof res.body.timestamp === 'number');
    });

    test('GET /api/health/live répond 200 sans authentification', async () => {
      const res = await request(app).get('/api/health/live');
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'live');
    });
  });

  // 2. Blocage absolu sans identifiants
  describe('2. Protection globale du site (Rejet sans identifiants)', () => {
    test('GET / renvoie 401 et l\'en-tête WWW-Authenticate sans identifiants', async () => {
      const res = await request(app).get('/');
      assert.equal(res.status, 401);
      assert.ok(res.headers['www-authenticate']);
      assert.ok(res.headers['www-authenticate'].includes('Basic realm='));
    });

    test('GET /index.html renvoie 401', async () => {
      const res = await request(app).get('/index.html');
      assert.equal(res.status, 401);
    });

    test('GET /css/global.css renvoie 401 (assets statiques protégés)', async () => {
      const res = await request(app).get('/css/global.css');
      assert.equal(res.status, 401);
    });

    test('GET /api/articles renvoie 401 (API protégée)', async () => {
      const res = await request(app).get('/api/articles');
      assert.equal(res.status, 401);
    });

    test('GET /api/health renvoie 401 (métadonnées internes BDD/RAM protégées)', async () => {
      const res = await request(app).get('/api/health');
      assert.equal(res.status, 401);
    });
  });

  // 3. Mauvais identifiants
  describe('3. Rejet avec identifiants erronés', () => {
    test('Requête avec identifiants invalides renvoie 401 Unauthorized', async () => {
      const res = await request(app)
        .get('/')
        .set('Authorization', INVALID_AUTH_HEADER);
      assert.equal(res.status, 401);
      assert.ok(res.headers['www-authenticate']);
    });

    test('Requête avec format Basic corrompu renvoie 401', async () => {
      const res = await request(app)
        .get('/')
        .set('Authorization', 'Basic ' + Buffer.from('sansDeuxPoints').toString('base64'));
      assert.equal(res.status, 401);
    });
  });

  // 4. Bons identifiants
  describe('4. Accès autorisé avec identifiants valides', () => {
    test('GET / avec identifiants valides autorise l\'accès (200 OK)', async () => {
      const res = await request(app)
        .get('/')
        .set('Authorization', VALID_AUTH_HEADER);
      assert.equal(res.status, 200);
    });

    test('GET /api/csrf-token avec identifiants valides répond 200', async () => {
      const res = await request(app)
        .get('/api/csrf-token')
        .set('Authorization', VALID_AUTH_HEADER);
      assert.equal(res.status, 200);
      assert.ok('csrfToken' in res.body);
    });
  });

  // 5. Maintien de la double-barrière Admin
  describe('5. Indépendance et étanchéité de l\'espace Administrateur', () => {
    test('GET /admin.html avec Basic Auth mais sans session admin redirige vers /auth.html', async () => {
      const res = await request(app)
        .get('/admin.html')
        .set('Authorization', VALID_AUTH_HEADER);
      assert.equal(res.status, 302);
      assert.ok(res.headers.location?.includes('/auth.html?error=access_denied'));
    });
  });

  // 6. Directives SEO NoIndex Bêta
  describe('6. Directives SEO pour environnement de préproduction', () => {
    test('L\'en-tête X-Robots-Tag: noindex, nofollow, noarchive est présent', async () => {
      const res = await request(app).get('/api/ping');
      assert.ok(res.headers['x-robots-tag']);
      assert.ok(res.headers['x-robots-tag'].includes('noindex'));
    });

    test('GET /robots.txt dynamique renvoie Disallow: / en mode noindex', async () => {
      const res = await request(app)
        .get('/robots.txt')
        .set('Authorization', VALID_AUTH_HEADER);
      assert.equal(res.status, 200);
      assert.ok(res.text.includes('Disallow: /'));
    });
  });

  // 7. Exceptions ciblées des webhooks
  describe('7. Gestion sécurisée des Webhooks (Stripe / Flutterwave)', () => {
    test('POST /api/stripe/webhook sans stripe-signature est intercepté par le Basic Auth (401)', async () => {
      const res = await request(app)
        .post('/api/stripe/webhook')
        .send({ id: 'evt_test' });
      assert.equal(res.status, 401);
    });

    test('POST /api/stripe/webhook avec stripe-signature et secret configuré passe outre le Basic Auth', async () => {
      const oldSecret = process.env.STRIPE_WEBHOOK_SECRET;
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';

      const res = await request(app)
        .post('/api/stripe/webhook')
        .set('stripe-signature', 't=123,v1=fakesig')
        .send(JSON.stringify({ id: 'evt_test' }));

      // Ne doit PAS être 401 (Basic Auth passé). Stripe retourne 400 (signature invalide) ce qui prouve l'accès à la route Stripe
      assert.notEqual(res.status, 401);
      assert.equal(res.status, 400);

      process.env.STRIPE_WEBHOOK_SECRET = oldSecret;
    });

    test('POST /api/subscriptions/webhook Flutterwave sans signature valide est bloqué (401)', async () => {
      const oldSecret = process.env.FLUTTERWAVE_WEBHOOK_SECRET;
      process.env.FLUTTERWAVE_WEBHOOK_SECRET = 'flw_secret_test';

      const res = await request(app)
        .post('/api/subscriptions/webhook')
        .set('verif-hash', 'wrong_hash')
        .send({ status: 'successful' });

      assert.equal(res.status, 401);
      process.env.FLUTTERWAVE_WEBHOOK_SECRET = oldSecret;
    });
  });

  // 8. Robustesse de la configuration de démarrage
  describe('8. Validation de configuration au démarrage', () => {
    test('validateSiteAccessConfig lève une erreur explicite si identifiants manquants', () => {
      appConfig.siteAccess.enabled = true;
      appConfig.siteAccess.user = '';
      appConfig.siteAccess.password = '';

      assert.throws(() => {
        appConfig.validateSiteAccessConfig();
      }, /SITE_ACCESS_USER ou SITE_ACCESS_PASSWORD est manquant/);
    });

    test('validateSiteAccessConfig réussit quand utilisateur et mot de passe sont fournis', () => {
      appConfig.siteAccess.enabled = true;
      appConfig.siteAccess.user = 'admin_user';
      appConfig.siteAccess.password = 'super_secret';

      assert.doesNotThrow(() => {
        appConfig.validateSiteAccessConfig();
      });
    });
  });

  // 9. Précision PostgreSQL SSL (Priorité absolue de DB_SSL=false)
  describe('9. Priorité SSL de la connexion PostgreSQL', () => {
    test('DB_SSL=false désactive formellement le SSL même en présence de DATABASE_URL avec sslmode=require', async () => {
      // Nettoyage du cache require pour tester la logique de construction du pool
      const originalDbSsl = process.env.DB_SSL;
      const originalDbUrl = process.env.DATABASE_URL;

      process.env.DB_SSL = 'false';
      process.env.DATABASE_URL = 'postgresql://user:secret@postgres.railway.internal:5432/solitiquo?sslmode=require&ssl=true';

      // Re-charger database.js
      delete require.cache[require.resolve('../backend/config/database')];
      const freshPool = require('../backend/config/database');

      // Vérifier que ssl est false et que les paramètres sslmode de la chaîne ont été retirés
      assert.equal(freshPool.options.ssl, false);
      assert.ok(!freshPool.options.connectionString.includes('sslmode=require'));
      assert.ok(!freshPool.options.connectionString.includes('ssl=true'));

      // Fermeture immédiate du pool testé
      await freshPool.end();

      // Rétablir
      process.env.DB_SSL = originalDbSsl;
      process.env.DATABASE_URL = originalDbUrl;
      delete require.cache[require.resolve('../backend/config/database')];
    });
  });
});
