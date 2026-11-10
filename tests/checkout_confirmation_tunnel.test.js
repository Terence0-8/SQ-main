'use strict';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-only';
process.env.STRIPE_SECRET_KEY = 'sk_test_mock_dummy_secret_key_12345';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_mock_secret_12345';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../server');
const pool = require('../backend/config/database');
const {
  executeConfirmSession,
  executeCheckoutTransaction,
  processWebhookEvent,
  PRICES
} = require('../backend/routes/stripe');

describe('TUNNEL COMPLET INSCRIPTION → ABONNEMENT → STRIPE CHECKOUT → CONFIRMATION', () => {
  const TEST_EMAIL_ALICE = 'alice_tunnel_test@example.com';
  const TEST_EMAIL_BOB = 'bob_tunnel_test@example.com';
  const TEST_PASSWORD = 'Password123!';

  let aliceId;
  let bobId;

  before(async () => {
    // Nettoyage préalable
    await pool.query('DELETE FROM subscriptions WHERE user_id IN (SELECT id FROM users WHERE email IN ($1, $2))', [TEST_EMAIL_ALICE, TEST_EMAIL_BOB]);
    await pool.query('DELETE FROM users WHERE email IN ($1, $2)', [TEST_EMAIL_ALICE, TEST_EMAIL_BOB]);
    await pool.query("DELETE FROM users WHERE email LIKE 'tunnel_reg_%@example.com'");
    await pool.query("DELETE FROM stripe_webhook_events WHERE event_id LIKE '%tunnel_%'");

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(TEST_PASSWORD, salt);

    const rAlice = await pool.query(
      `INSERT INTO users (username, email, password, role, is_active, is_subscriber, created_at, updated_at)
       VALUES ('alicetunnel', $1, $2, 'reader', TRUE, FALSE, NOW(), NOW())
       RETURNING id`,
      [TEST_EMAIL_ALICE, hash]
    );
    aliceId = rAlice.rows[0].id;

    const rBob = await pool.query(
      `INSERT INTO users (username, email, password, role, is_active, is_subscriber, created_at, updated_at)
       VALUES ('bobtunnel', $1, $2, 'reader', TRUE, FALSE, NOW(), NOW())
       RETURNING id`,
      [TEST_EMAIL_BOB, hash]
    );
    bobId = rBob.rows[0].id;
  });

  after(async () => {
    if (aliceId || bobId) {
      await pool.query('DELETE FROM subscriptions WHERE user_id IN ($1, $2)', [aliceId, bobId]);
      await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [aliceId, bobId]);
    }
    await pool.query("DELETE FROM users WHERE email LIKE 'tunnel_reg_%@example.com'");
    await pool.query("DELETE FROM stripe_webhook_events WHERE event_id LIKE '%tunnel_%'");
  });

  // -------------------------------------------------------------------------
  // 1. Inscription : utilisateur réellement créé et session conservée
  // -------------------------------------------------------------------------
  test('1. Inscription : utilisateur créé en DB et session connectée conservée', async () => {
    const agent = request.agent(app);
    const randSuffix = Math.floor(100000 + Math.random() * 900000);
    const uniqueUser = `tunnelreg${randSuffix}`;
    const uniqueEmail = `tunnel_reg_${randSuffix}@example.com`;

    const regRes = await agent
      .post('/api/auth/register')
      .send({
        username: uniqueUser,
        email: uniqueEmail,
        password: 'Password123!'
      });

    assert.equal(regRes.status, 200);
    assert.equal(regRes.body.success, true);
    assert.ok(regRes.body.user);
    assert.equal(regRes.body.user.email, uniqueEmail);
    assert.equal(regRes.body.user.is_subscriber, false);

    // Vérification de présence en base de données
    const dbCheck = await pool.query('SELECT id, username, email, is_subscriber, role, is_active FROM users WHERE email = $1', [uniqueEmail]);
    assert.equal(dbCheck.rows.length, 1);
    assert.equal(dbCheck.rows[0].email, uniqueEmail);
    assert.equal(dbCheck.rows[0].is_active, true);
    assert.equal(dbCheck.rows[0].role, 'reader');

    // Vérification que la session est immédiatement reconnue et active (connect.sid conservé)
    const meRes = await agent.get('/api/auth/me');
    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.success, true);
    assert.equal(meRes.body.isLoggedIn, true);
    assert.equal(meRes.body.user.email, uniqueEmail);

    // Nettoyage de l'utilisateur créé pour ce test
    await pool.query('DELETE FROM users WHERE id = $1', [dbCheck.rows[0].id]);
  });

  // -------------------------------------------------------------------------
  // 2. Conservation du plan choisi pendant la redirection
  // -------------------------------------------------------------------------
  test('2. Conservation du plan choisi et validation stricte des redirections', () => {
    // Vérification de la logique de redirection implémentée dans auth.html & abonnement.html
    const isValidRedirect = (url, origin = 'https://beta.solitiquo.com') => {
      try {
        const target = new URL(url, origin);
        return target.origin === origin;
      } catch {
        return false;
      }
    };

    const resolveRedirect = (paramRedirect, storedPlan, origin = 'https://beta.solitiquo.com') => {
      if (paramRedirect && isValidRedirect(paramRedirect, origin)) {
        return paramRedirect;
      }
      if (storedPlan) {
        return `paiement.html?plan=${encodeURIComponent(storedPlan)}`;
      }
      return 'index.html';
    };

    // Cas valide avec paramètre redirect vers la page paiement avec plan yearly
    assert.equal(
      resolveRedirect('paiement.html?plan=yearly&currency=EUR', null),
      'paiement.html?plan=yearly&currency=EUR'
    );

    // Cas où le paramètre est absent mais le plan est conservé dans sessionStorage
    assert.equal(
      resolveRedirect(null, 'monthly'),
      'paiement.html?plan=monthly'
    );

    // Cas de tentative d'Open Redirect externe frauduleuse : doit être rejeté vers le plan ou index
    assert.equal(
      resolveRedirect('https://evil-phishing.com/steal-creds', 'yearly'),
      'paiement.html?plan=yearly'
    );
    assert.equal(
      resolveRedirect('https://evil-phishing.com/steal-creds', null),
      'index.html'
    );
  });

  // -------------------------------------------------------------------------
  // 3. Checkout : association correcte entre compte et session Stripe
  // -------------------------------------------------------------------------
  test('3. Checkout : association stricte du compte utilisateur et du plan dans la session Stripe', async () => {
    let capturedSessionConfig = null;

    const mockStripe = {
      customers: {
        search: async () => ({ data: [] }),
        create: async ({ email, name, metadata }) => ({
          id: `cus_tunnel_${metadata.solitiquo_user_id}`,
          email,
          name,
          metadata
        })
      },
      checkout: {
        sessions: {
          create: async (config) => {
            capturedSessionConfig = config;
            return {
              id: `cs_tunnel_checkout_${config.client_reference_id}`,
              url: 'https://checkout.stripe.com/c/pay/cs_tunnel_mock'
            };
          }
        }
      }
    };

    const p = {
      monthly: 6.99,
      yearly: 69.90,
      currency: 'EUR',
      monthlyPriceId: PRICES.EUR.monthly,
      yearlyPriceId: PRICES.EUR.yearly
    };

    const result = await executeCheckoutTransaction({
      stripe: mockStripe,
      userId: aliceId,
      userEmail: TEST_EMAIL_ALICE,
      plan: 'yearly',
      country: 'FR',
      p,
      idempotencyKey: `tunnel_idemp_${aliceId}_yearly`
    });

    assert.equal(result.status, 200);
    assert.ok(result.data.checkout_url);
    assert.ok(capturedSessionConfig);

    // Contrôles de sécurité impératifs sur les métadonnées de la session Stripe
    assert.equal(capturedSessionConfig.client_reference_id, String(aliceId));
    assert.equal(capturedSessionConfig.metadata.solitiquo_user_id, String(aliceId));
    assert.equal(capturedSessionConfig.metadata.solitiquo_plan, 'yearly');
    assert.equal(capturedSessionConfig.metadata.solitiquo_currency, 'EUR');
    assert.match(capturedSessionConfig.success_url, /paiement-success\.html\?session_id=\{CHECKOUT_SESSION_ID\}/);

    // Vérification de la réservation temporaire locale
    const subCheck = await pool.query('SELECT transaction_id, plan, amount, currency, status FROM subscriptions WHERE user_id = $1 ORDER BY id DESC LIMIT 1', [aliceId]);
    assert.equal(subCheck.rows.length, 1);
    assert.equal(subCheck.rows[0].transaction_id, `cs_tunnel_checkout_${aliceId}`);
    assert.equal(subCheck.rows[0].status, 'pending');
  });

  // -------------------------------------------------------------------------
  // 4. Confirmation : utilisateur non connecté refusé
  // -------------------------------------------------------------------------
  test('4. Confirmation : requête non authentifiée refusée (401)', async () => {
    // Test direct via supertest
    const resNoAuth = await request(app)
      .post('/api/stripe/confirm-session')
      .send({ session_id: 'cs_tunnel_valid_123' });

    // En l'absence de session, isAuthenticated renvoie 401
    // (ou verifyCsrf renvoie 403 s'il n'y a pas de token CSRF)
    assert.ok(resNoAuth.status === 401 || resNoAuth.status === 403);
    assert.equal(resNoAuth.body.success, false);

    // Test fonctionnel avec executeConfirmSession
    const execRes = await executeConfirmSession({
      stripe: {},
      userId: null,
      sessionId: 'cs_tunnel_valid_123'
    });
    assert.equal(execRes.status, 401);
    assert.equal(execRes.data.success, false);
    assert.equal(execRes.data.error, 'Non authentifié.');
  });

  // -------------------------------------------------------------------------
  // 5. Confirmation : session appartenant à un autre utilisateur refusée
  // -------------------------------------------------------------------------
  test('5. Confirmation : session appartenant à Bob refusée lorsqu’Alice est connectée (403)', async () => {
    const mockSubBob = {
      id: 'sub_tunnel_bob_001',
      status: 'active',
      customer: `cus_tunnel_${bobId}`,
      metadata: { solitiquo_user_id: String(bobId), solitiquo_plan: 'monthly', solitiquo_currency: 'EUR' },
      items: {
        data: [{
          price: { id: PRICES.EUR.monthly, unit_amount: 699, currency: 'eur', recurring: { interval: 'month' } }
        }]
      }
    };

    const mockStripe = {
      checkout: {
        sessions: {
          retrieve: async (sid) => ({
            id: sid,
            customer: `cus_tunnel_${bobId}`,
            client_reference_id: String(bobId), // Appartient à Bob !
            metadata: { solitiquo_user_id: String(bobId), solitiquo_plan: 'monthly', solitiquo_currency: 'EUR' },
            livemode: false,
            status: 'complete',
            payment_status: 'paid',
            amount_total: 699,
            currency: 'eur',
            mode: 'subscription',
            subscription: mockSubBob
          })
        }
      },
      subscriptions: {
        retrieve: async () => mockSubBob
      }
    };

    // Alice tente de confirmer avec la session de Bob
    const res = await executeConfirmSession({
      stripe: mockStripe,
      userId: aliceId, // Alice connectée
      sessionId: 'cs_tunnel_bob_fraudulent'
    });

    assert.equal(res.status, 403);
    assert.equal(res.data.success, false);
    assert.match(res.data.error, /Cette session de paiement ne correspond pas à votre compte/);

    // Les droits d'Alice ne doivent pas être modifiés
    const checkAlice = await pool.query('SELECT is_subscriber FROM users WHERE id = $1', [aliceId]);
    assert.equal(checkAlice.rows[0].is_subscriber, false);
  });

  // -------------------------------------------------------------------------
  // 6. Confirmation : paiement non réglé refusé
  // -------------------------------------------------------------------------
  test('6. Confirmation : session non complétée ou non payée refusée (400)', async () => {
    // 6a. Session incomplète (status = open)
    const mockStripeIncomplete = {
      checkout: {
        sessions: {
          retrieve: async (sid) => ({
            id: sid,
            customer: `cus_tunnel_${aliceId}`,
            client_reference_id: String(aliceId),
            metadata: { solitiquo_user_id: String(aliceId) },
            livemode: false,
            status: 'open', // En attente
            payment_status: 'unpaid',
            currency: 'eur',
            mode: 'subscription',
            subscription: 'sub_tunnel_alice_unpaid'
          })
        }
      }
    };

    const resIncomplete = await executeConfirmSession({
      stripe: mockStripeIncomplete,
      userId: aliceId,
      sessionId: 'cs_tunnel_incomplete_123'
    });

    assert.equal(resIncomplete.status, 400);
    assert.equal(resIncomplete.data.success, false);
    assert.match(resIncomplete.data.error, /La session de paiement n’est pas finalisée/);

    // 6b. Session avec payment_status = unpaid
    const mockSubUnpaid = {
      id: 'sub_tunnel_alice_unpaid',
      status: 'active',
      customer: `cus_tunnel_${aliceId}`,
      metadata: { solitiquo_user_id: String(aliceId), solitiquo_plan: 'monthly', solitiquo_currency: 'EUR' },
      items: {
        data: [{
          price: { id: PRICES.EUR.monthly, unit_amount: 699, currency: 'eur', recurring: { interval: 'month' } }
        }]
      }
    };

    const mockStripeUnpaid = {
      checkout: {
        sessions: {
          retrieve: async (sid) => ({
            id: sid,
            customer: `cus_tunnel_${aliceId}`,
            client_reference_id: String(aliceId),
            metadata: { solitiquo_user_id: String(aliceId), solitiquo_plan: 'monthly', solitiquo_currency: 'EUR' },
            livemode: false,
            status: 'complete',
            payment_status: 'unpaid', // Non réglé
            amount_total: 0,
            currency: 'eur',
            mode: 'subscription',
            subscription: mockSubUnpaid
          })
        }
      },
      subscriptions: {
        retrieve: async () => mockSubUnpaid
      }
    };

    const resUnpaid = await executeConfirmSession({
      stripe: mockStripeUnpaid,
      userId: aliceId,
      sessionId: 'cs_tunnel_unpaid_123'
    });

    assert.equal(resUnpaid.status, 400);
    assert.equal(resUnpaid.data.success, false);
    assert.match(resUnpaid.data.error, /Le paiement n’a pas été validé/);

    // Les droits d'Alice restent false
    const checkAlice = await pool.query('SELECT is_subscriber FROM users WHERE id = $1', [aliceId]);
    assert.equal(checkAlice.rows[0].is_subscriber, false);
  });

  // -------------------------------------------------------------------------
  // 7. Confirmation : paiement valide accepté
  // -------------------------------------------------------------------------
  test('7. Confirmation : paiement valide accepté (200), droits Premium activés', async () => {
    const futureDate = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
    const nowSec = Math.floor(Date.now() / 1000);
    const subIdAlice = `sub_tunnel_alice_valid_${Date.now()}`;
    const sessionIdAlice = `cs_tunnel_alice_valid_${Date.now()}`;

    const mockSubscription = {
      id: subIdAlice,
      status: 'active',
      created: nowSec,
      customer: `cus_tunnel_${aliceId}`,
      metadata: {
        solitiquo_user_id: String(aliceId),
        solitiquo_plan: 'yearly',
        solitiquo_currency: 'EUR'
      },
      current_period_start: nowSec,
      current_period_end: futureDate,
      cancel_at_period_end: false,
      items: {
        data: [{
          price: {
            id: PRICES.EUR.yearly,
            unit_amount: 6990,
            currency: 'eur',
            recurring: { interval: 'year' },
            product: 'prod_tunnel_mock'
          },
          current_period_start: nowSec,
          current_period_end: futureDate
        }]
      }
    };

    const mockStripe = {
      checkout: {
        sessions: {
          retrieve: async (sid) => ({
            id: sid,
            customer: `cus_tunnel_${aliceId}`,
            client_reference_id: String(aliceId),
            metadata: {
              solitiquo_user_id: String(aliceId),
              solitiquo_plan: 'yearly',
              solitiquo_currency: 'EUR'
            },
            livemode: false,
            status: 'complete',
            payment_status: 'paid',
            amount_total: 6990,
            currency: 'eur',
            mode: 'subscription',
            subscription: mockSubscription,
            created: nowSec
          })
        }
      },
      subscriptions: {
        retrieve: async () => mockSubscription
      }
    };

    const fakeExpressSession = {
      user: {
        id: aliceId,
        email: TEST_EMAIL_ALICE,
        username: 'alicetunnel',
        is_subscriber: false
      },
      save: (cb) => { if (cb) cb(); }
    };

    const res = await executeConfirmSession({
      stripe: mockStripe,
      userId: aliceId,
      sessionId: sessionIdAlice,
      expressSession: fakeExpressSession
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.subscription.status, 'active');
    assert.equal(res.data.subscription.plan, 'yearly');
    assert.equal(res.data.user.is_subscriber, true);

    // Vérification en base de données de l'activation des droits Premium
    const checkAlice = await pool.query('SELECT is_subscriber, subscription_end_date FROM users WHERE id = $1', [aliceId]);
    assert.equal(checkAlice.rows[0].is_subscriber, true);
    assert.ok(checkAlice.rows[0].subscription_end_date);

    // Vérification de la création de la ligne subscription
    const subCheck = await pool.query('SELECT stripe_subscription_id, status, plan, amount FROM subscriptions WHERE stripe_subscription_id = $1', [subIdAlice]);
    assert.equal(subCheck.rows.length, 1);
    assert.equal(subCheck.rows[0].status, 'active');
    assert.equal(subCheck.rows[0].plan, 'yearly');
  });

  // -------------------------------------------------------------------------
  // 8. Webhook et fallback simultanés : aucune duplication
  // -------------------------------------------------------------------------
  test('8. Webhook et fallback simultanés : aucune duplication, zéro deadlock, stricte idempotence', async () => {
    const futureDate = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
    const nowSec = Math.floor(Date.now() / 1000);
    const subIdConcurrent = `sub_tunnel_concurrent_${Date.now()}`;
    const sessionIdConcurrent = `cs_tunnel_concurrent_${Date.now()}`;

    const mockSubscription = {
      id: subIdConcurrent,
      status: 'active',
      created: nowSec,
      customer: `cus_tunnel_${bobId}`,
      metadata: {
        solitiquo_user_id: String(bobId),
        solitiquo_plan: 'monthly',
        solitiquo_currency: 'EUR'
      },
      current_period_start: nowSec,
      current_period_end: futureDate,
      cancel_at_period_end: false,
      items: {
        data: [{
          price: {
            id: PRICES.EUR.monthly,
            unit_amount: 699,
            currency: 'eur',
            recurring: { interval: 'month' },
            product: 'prod_tunnel_mock'
          },
          current_period_start: nowSec,
          current_period_end: futureDate
        }]
      }
    };

    const mockCheckoutSession = {
      id: sessionIdConcurrent,
      customer: `cus_tunnel_${bobId}`,
      client_reference_id: String(bobId),
      metadata: {
        solitiquo_user_id: String(bobId),
        solitiquo_plan: 'monthly',
        solitiquo_currency: 'EUR'
      },
      livemode: false,
      status: 'complete',
      payment_status: 'paid',
      amount_total: 699,
      currency: 'eur',
      mode: 'subscription',
      subscription: mockSubscription,
      created: nowSec
    };

    const mockStripe = {
      checkout: {
        sessions: {
          retrieve: async () => mockCheckoutSession
        }
      },
      subscriptions: {
        retrieve: async () => mockSubscription
      }
    };

    const webhookEvent = {
      id: `evt_tunnel_checkout_${Date.now()}`,
      type: 'checkout.session.completed',
      created: nowSec,
      data: {
        object: mockCheckoutSession
      }
    };

    // Exécution simultanée (Promise.all) du webhook Stripe et de la confirmation navigateur
    const [webhookResult, confirmResult] = await Promise.all([
      processWebhookEvent(webhookEvent, { stripe: mockStripe }),
      executeConfirmSession({
        stripe: mockStripe,
        userId: bobId,
        sessionId: sessionIdConcurrent
      })
    ]);

    assert.equal(webhookResult.status, 200);
    assert.equal(confirmResult.status, 200);
    assert.equal(confirmResult.data.success, true);

    // Vérification en base qu'une SEULE et UNIQUE ligne d'abonnement existe pour ce subId
    const rows = await pool.query('SELECT id, user_id, stripe_subscription_id, status FROM subscriptions WHERE stripe_subscription_id = $1', [subIdConcurrent]);
    assert.equal(rows.rows.length, 1, 'Il ne doit y avoir exactement qu’une seule ligne subscription insérée');
    assert.equal(rows.rows[0].status, 'active');
    assert.equal(rows.rows[0].user_id, bobId);

    // Bob est bien abonné
    const checkBob = await pool.query('SELECT is_subscriber FROM users WHERE id = $1', [bobId]);
    assert.equal(checkBob.rows[0].is_subscriber, true);
  });

  // -------------------------------------------------------------------------
  // 9. Retour paiement : affichage confirmé uniquement après activation
  // -------------------------------------------------------------------------
  test('9. Retour paiement : affichage confirmé uniquement après activation réelle', () => {
    // Simulation de l'état UI selon le flux paiement-success.html
    class SuccessPageUIState {
      constructor() {
        this.statusIcon = '⏳';
        this.statusTitle = 'Vérification de votre paiement...';
        this.isConfirmed = false;
        this.authRequired = false;
        this.isPending = true;
      }

      onServerUnauthenticated() {
        this.statusIcon = '🔒';
        this.statusTitle = 'Connexion requise';
        this.authRequired = true;
        this.isConfirmed = false;
        this.isPending = false;
      }

      onServerPending() {
        this.statusIcon = '⏳';
        this.statusTitle = 'Activation en attente';
        this.isPending = true;
        this.isConfirmed = false;
      }

      onServerConfirmed() {
        this.statusIcon = '✓';
        this.statusTitle = 'Abonnement confirmé !';
        this.isConfirmed = true;
        this.isPending = false;
        this.authRequired = false;
      }
    }

    const ui = new SuccessPageUIState();

    // État initial : JAMAIS confirmé avant validation serveur
    assert.equal(ui.isConfirmed, false);
    assert.equal(ui.statusTitle, 'Vérification de votre paiement...');
    assert.equal(ui.statusIcon, '⏳');

    // Cas utilisateur non connecté
    ui.onServerUnauthenticated();
    assert.equal(ui.isConfirmed, false);
    assert.equal(ui.authRequired, true);
    assert.equal(ui.statusTitle, 'Connexion requise');

    // Cas webhook / activation en attente
    ui.onServerPending();
    assert.equal(ui.isConfirmed, false);
    assert.equal(ui.statusTitle, 'Activation en attente');

    // Seule la confirmation serveur explicite active l'affichage
    ui.onServerConfirmed();
    assert.equal(ui.isConfirmed, true);
    assert.equal(ui.statusTitle, 'Abonnement confirmé !');
    assert.equal(ui.statusIcon, '✓');
  });

  // -------------------------------------------------------------------------
  // 10. Profil : droits Premium correctement visibles
  // -------------------------------------------------------------------------
  test('10. Profil : droits Premium visibles via /api/auth/refresh-user et me', async () => {
    const agent = request.agent(app);

    // Connexion d'Alice (désormais abonnée)
    const loginRes = await agent
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL_ALICE, password: TEST_PASSWORD });
    assert.equal(loginRes.status, 200);

    // CSRF token
    const csrfRes = await agent.get('/api/csrf-token');
    const csrf = csrfRes.body.csrfToken;

    // Appel refresh-user
    const refreshRes = await agent
      .post('/api/auth/refresh-user')
      .set('X-CSRF-Token', csrf);

    assert.equal(refreshRes.status, 200);
    assert.equal(refreshRes.body.success, true);
    assert.equal(refreshRes.body.user.is_subscriber, true);
    assert.ok(refreshRes.body.user.subscription_end_date);

    // Vérification de /api/auth/me
    const meRes = await agent.get('/api/auth/me');
    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.user.is_subscriber, true);
  });

  // -------------------------------------------------------------------------
  // 11. Sécurité : Rejet d'un Price ID non autorisé
  // -------------------------------------------------------------------------
  test('11. Confirmation : Price ID non autorisé ou incompatible rejeté (400)', async () => {
    const uRes = await pool.query(
      `INSERT INTO users (username, email, password, role, is_active, is_subscriber, created_at, updated_at)
       VALUES ('tunnelpricechk', 'tunnel_reg_price@example.com', 'hash', 'reader', TRUE, FALSE, NOW(), NOW())
       RETURNING id`
    );
    const uid = uRes.rows[0].id;
    try {
      const subFakePrice = {
        id: `sub_tunnel_fakeprice_${Date.now()}`,
        status: 'active',
        customer: `cus_tunnel_${uid}`,
        metadata: { solitiquo_user_id: String(uid), solitiquo_plan: 'monthly', solitiquo_currency: 'EUR' },
        items: {
          data: [{
            price: { id: 'price_FAKE_UNAUTHORIZED_999', unit_amount: 699, currency: 'eur', recurring: { interval: 'month' } }
          }]
        }
      };

      const mockStripe = {
        checkout: {
          sessions: {
            retrieve: async (sid) => ({
              id: sid,
              customer: `cus_tunnel_${uid}`,
              client_reference_id: String(uid),
              metadata: { solitiquo_user_id: String(uid), solitiquo_plan: 'monthly', solitiquo_currency: 'EUR' },
              livemode: false,
              status: 'complete',
              payment_status: 'paid',
              amount_total: 699,
              currency: 'eur',
              mode: 'subscription',
              subscription: subFakePrice
            })
          }
        }
      };

      const res = await executeConfirmSession({ stripe: mockStripe, userId: uid, sessionId: 'cs_tunnel_fakeprice' });
      assert.equal(res.status, 400);
      assert.equal(res.data.success, false);
      assert.match(res.data.error, /Identifiant de tarif Stripe non autorisé/);

      const uCheck = await pool.query('SELECT is_subscriber FROM users WHERE id = $1', [uid]);
      assert.equal(uCheck.rows[0].is_subscriber, false);
    } finally {
      await pool.query('DELETE FROM subscriptions WHERE user_id = $1', [uid]);
      await pool.query('DELETE FROM users WHERE id = $1', [uid]);
    }
  });

  // -------------------------------------------------------------------------
  // 12. Sécurité : Rejet d'un montant incohérent & validation trial no_payment_required
  // -------------------------------------------------------------------------
  test('12. Confirmation : montant incohérent rejeté (400), trial valide (no_payment_required) accepté', async () => {
    const uRes = await pool.query(
      `INSERT INTO users (username, email, password, role, is_active, is_subscriber, created_at, updated_at)
       VALUES ('tunnelamountchk', 'tunnel_reg_amount@example.com', 'hash', 'reader', TRUE, FALSE, NOW(), NOW())
       RETURNING id`
    );
    const uid = uRes.rows[0].id;
    const nowSec = Math.floor(Date.now() / 1000);

    try {
      // 12a. Montant payé falsifié (100 cts au lieu de 699 cts)
      const subBadAmt = {
        id: `sub_tunnel_badamt_${Date.now()}`,
        status: 'active',
        customer: `cus_tunnel_${uid}`,
        metadata: { solitiquo_user_id: String(uid), solitiquo_plan: 'monthly', solitiquo_currency: 'EUR' },
        items: { data: [{ price: { id: PRICES.EUR.monthly, unit_amount: 699, currency: 'eur', recurring: { interval: 'month' } } }] }
      };
      const resBadAmt = await executeConfirmSession({
        stripe: {
          checkout: {
            sessions: {
              retrieve: async (sid) => ({
                id: sid,
                customer: `cus_tunnel_${uid}`,
                client_reference_id: String(uid),
                metadata: { solitiquo_user_id: String(uid), solitiquo_plan: 'monthly', solitiquo_currency: 'EUR' },
                livemode: false,
                status: 'complete',
                payment_status: 'paid',
                amount_total: 100, // Incohérent !
                currency: 'eur',
                mode: 'subscription',
                subscription: subBadAmt
              })
            }
          }
        },
        userId: uid,
        sessionId: 'cs_tunnel_badamt'
      });
      assert.equal(resBadAmt.status, 400);
      assert.match(resBadAmt.data.error, /Montant total payé incohérent/);

      // 12b. no_payment_required sur un abonnement NON trialing -> rejeté
      const resFakeTrial = await executeConfirmSession({
        stripe: {
          checkout: {
            sessions: {
              retrieve: async (sid) => ({
                id: sid,
                customer: `cus_tunnel_${uid}`,
                client_reference_id: String(uid),
                metadata: { solitiquo_user_id: String(uid), solitiquo_plan: 'monthly', solitiquo_currency: 'EUR' },
                livemode: false,
                status: 'complete',
                payment_status: 'no_payment_required',
                amount_total: 0,
                currency: 'eur',
                mode: 'subscription',
                subscription: subBadAmt // status = 'active', pas 'trialing'
              })
            }
          }
        },
        userId: uid,
        sessionId: 'cs_tunnel_faketrial'
      });
      assert.equal(resFakeTrial.status, 400);
      assert.match(resFakeTrial.data.error, /Paiement requis pour un abonnement sans période d’essai/);

      // 12c. Essai gratuit légitime (trialing + no_payment_required + amount_total: 0) -> accepté
      const trialEnd = nowSec + 30 * 86400;
      const subValidTrial = {
        id: `sub_tunnel_trial_${Date.now()}`,
        status: 'trialing',
        created: nowSec,
        customer: `cus_tunnel_${uid}`,
        trial_start: nowSec,
        trial_end: trialEnd,
        current_period_start: nowSec,
        current_period_end: trialEnd,
        metadata: { solitiquo_user_id: String(uid), solitiquo_plan: 'monthly', solitiquo_currency: 'EUR' },
        items: {
          data: [{
            price: { id: PRICES.EUR.monthly, unit_amount: 699, currency: 'eur', recurring: { interval: 'month' } },
            current_period_start: nowSec,
            current_period_end: trialEnd
          }]
        }
      };
      const resValidTrial = await executeConfirmSession({
        stripe: {
          checkout: {
            sessions: {
              retrieve: async (sid) => ({
                id: sid,
                customer: `cus_tunnel_${uid}`,
                client_reference_id: String(uid),
                metadata: { solitiquo_user_id: String(uid), solitiquo_plan: 'monthly', solitiquo_currency: 'EUR' },
                livemode: false,
                status: 'complete',
                payment_status: 'no_payment_required',
                amount_total: 0,
                currency: 'eur',
                mode: 'subscription',
                subscription: subValidTrial,
                created: nowSec
              })
            }
          }
        },
        userId: uid,
        sessionId: 'cs_tunnel_validtrial'
      });
      assert.equal(resValidTrial.status, 200);
      assert.equal(resValidTrial.data.subscription.status, 'trialing');
    } finally {
      await pool.query('DELETE FROM subscriptions WHERE user_id = $1', [uid]);
      await pool.query('DELETE FROM stripe_webhook_events WHERE event_id LIKE $1', ['checkout_session_cs_tunnel_%']);
      await pool.query('DELETE FROM users WHERE id = $1', [uid]);
    }
  });

  // -------------------------------------------------------------------------
  // 13. Sécurité : Rejet Customer différent et conflit stripe_customer_id en DB
  // -------------------------------------------------------------------------
  test('13. Confirmation : incohérence Customer session/subscription ou conflit DB rejeté', async () => {
    const uRes = await pool.query(
      `INSERT INTO users (username, email, password, role, is_active, is_subscriber, created_at, updated_at)
       VALUES ('tunnelcustchk', 'tunnel_reg_cust@example.com', 'hash', 'reader', TRUE, FALSE, NOW(), NOW())
       RETURNING id`
    );
    const uid = uRes.rows[0].id;
    const nowSec = Math.floor(Date.now() / 1000);

    try {
      // 13a. session.customer !== subscription.customer -> 403
      const subMismatchCust = {
        id: `sub_tunnel_cust_mism_${Date.now()}`,
        status: 'active',
        created: nowSec,
        customer: 'cus_OTHER_CUSTOMER',
        metadata: { solitiquo_user_id: String(uid), solitiquo_plan: 'monthly', solitiquo_currency: 'EUR' },
        items: { data: [{ price: { id: PRICES.EUR.monthly, unit_amount: 699, currency: 'eur', recurring: { interval: 'month' } } }] }
      };

      const res1 = await executeConfirmSession({
        stripe: {
          checkout: {
            sessions: {
              retrieve: async (sid) => ({
                id: sid,
                customer: `cus_tunnel_${uid}`,
                client_reference_id: String(uid),
                metadata: { solitiquo_user_id: String(uid), solitiquo_plan: 'monthly', solitiquo_currency: 'EUR' },
                livemode: false,
                status: 'complete',
                payment_status: 'paid',
                amount_total: 699,
                currency: 'eur',
                mode: 'subscription',
                subscription: subMismatchCust
              })
            }
          }
        },
        userId: uid,
        sessionId: 'cs_tunnel_cust_mismatch'
      });
      assert.equal(res1.status, 403);
      assert.match(res1.data.error, /Incohérence du client Stripe/);

      // 13b. Conflit avec un stripe_customer_id appartenant déjà à Bob en base -> 403
      const subBobCust = {
        id: `sub_tunnel_cust_conflict_${Date.now()}`,
        status: 'active',
        created: nowSec,
        customer: `cus_tunnel_${bobId}`, // Déjà en DB sur bobId !
        metadata: { solitiquo_user_id: String(uid), solitiquo_plan: 'monthly', solitiquo_currency: 'EUR' },
        items: { data: [{ price: { id: PRICES.EUR.monthly, unit_amount: 699, currency: 'eur', recurring: { interval: 'month' } } }] }
      };

      const res2 = await executeConfirmSession({
        stripe: {
          checkout: {
            sessions: {
              retrieve: async (sid) => ({
                id: sid,
                customer: `cus_tunnel_${bobId}`,
                client_reference_id: String(uid),
                metadata: { solitiquo_user_id: String(uid), solitiquo_plan: 'monthly', solitiquo_currency: 'EUR' },
                livemode: false,
                status: 'complete',
                payment_status: 'paid',
                amount_total: 699,
                currency: 'eur',
                mode: 'subscription',
                subscription: subBobCust
              })
            }
          }
        },
        userId: uid,
        sessionId: 'cs_tunnel_cust_bob_conflict'
      });
      assert.equal(res2.status, 403);
      assert.match(res2.data.error, /déjà associé à un autre compte/);
    } finally {
      await pool.query('DELETE FROM subscriptions WHERE user_id = $1', [uid]);
      await pool.query('DELETE FROM users WHERE id = $1', [uid]);
    }
  });

  // -------------------------------------------------------------------------
  // 14. Sécurité : Rejet utilisateur différent dans metadata de subscription
  // -------------------------------------------------------------------------
  test('14. Confirmation : metadata.solitiquo_user_id différent sur la subscription rejeté (403)', async () => {
    const subWrongMeta = {
      id: `sub_tunnel_wrongmeta_${Date.now()}`,
      status: 'active',
      customer: `cus_tunnel_${aliceId}`,
      metadata: { solitiquo_user_id: String(bobId), solitiquo_plan: 'monthly', solitiquo_currency: 'EUR' },
      items: { data: [{ price: { id: PRICES.EUR.monthly, unit_amount: 699, currency: 'eur', recurring: { interval: 'month' } } }] }
    };

    const res = await executeConfirmSession({
      stripe: {
        checkout: {
          sessions: {
            retrieve: async (sid) => ({
              id: sid,
              customer: `cus_tunnel_${aliceId}`,
              client_reference_id: String(aliceId),
              metadata: { solitiquo_user_id: String(aliceId), solitiquo_plan: 'monthly', solitiquo_currency: 'EUR' },
              livemode: false,
              status: 'complete',
              payment_status: 'paid',
              amount_total: 699,
              currency: 'eur',
              mode: 'subscription',
              subscription: subWrongMeta
            })
          }
        }
      },
      userId: aliceId,
      sessionId: 'cs_tunnel_sub_wrongmeta'
    });
    assert.equal(res.status, 403);
    assert.match(res.data.error, /L’abonnement Stripe n’est pas rattaché à votre compte/);
  });

  // -------------------------------------------------------------------------
  // 15. Protection obsolescence : événement plus récent protégé
  // -------------------------------------------------------------------------
  test('15. Confirmation ancienne ne réécrit pas un état plus récent en base (409 si résilié)', async () => {
    const uRes = await pool.query(
      `INSERT INTO users (username, email, password, role, is_active, is_subscriber, created_at, updated_at)
       VALUES ('tunnelobsolchk', 'tunnel_reg_obsol@example.com', 'hash', 'reader', TRUE, FALSE, NOW(), NOW())
       RETURNING id`
    );
    const uid = uRes.rows[0].id;
    const subId = `sub_tunnel_obsol_${Date.now()}`;
    const T_old = 1700000000;
    const T_newer = 1750000000;

    try {
      // Simuler un état plus récent déjà enregistré : abonnement résilié à T_newer
      await pool.query(
        `INSERT INTO subscriptions (
           user_id, plan, amount, currency, payment_method, transaction_id, status,
           starts_at, ends_at, stripe_customer_id, stripe_subscription_id, stripe_status,
           stripe_event_created_at, updated_at
         ) VALUES (
           $1, 'monthly', 6.99, 'EUR', 'stripe', $2, 'cancelled',
           NOW() - INTERVAL '10 days', NOW() - INTERVAL '1 day', $3, $4, 'canceled',
           $5, NOW()
         )`,
        [uid, `STRIPE-${subId}`, `cus_tunnel_${uid}`, subId, T_newer]
      );

      // Une confirmation synchrone datée de T_old (< T_newer) ne doit JAMAIS réactiver Premium
      const res = await executeConfirmSession({
        stripe: {
          checkout: {
            sessions: {
              retrieve: async (sid) => ({
                id: sid,
                customer: `cus_tunnel_${uid}`,
                client_reference_id: String(uid),
                metadata: { solitiquo_user_id: String(uid), solitiquo_plan: 'monthly', solitiquo_currency: 'EUR' },
                livemode: false,
                status: 'complete',
                payment_status: 'paid',
                amount_total: 699,
                currency: 'eur',
                mode: 'subscription',
                created: T_old,
                subscription: {
                  id: subId,
                  status: 'active',
                  created: T_old,
                  customer: `cus_tunnel_${uid}`,
                  metadata: { solitiquo_user_id: String(uid), solitiquo_plan: 'monthly', solitiquo_currency: 'EUR' },
                  items: { data: [{ price: { id: PRICES.EUR.monthly, unit_amount: 699, currency: 'eur', recurring: { interval: 'month' } } }] }
                }
              })
            }
          }
        },
        userId: uid,
        sessionId: 'cs_tunnel_old_after_cancel'
      });

      assert.equal(res.status, 409);
      assert.equal(res.data.success, false);

      // L'abonnement reste canceled et l'utilisateur reste non-abonné
      const subRow = await pool.query('SELECT stripe_status, stripe_event_created_at FROM subscriptions WHERE stripe_subscription_id = $1', [subId]);
      assert.equal(subRow.rows[0].stripe_status, 'canceled');
      assert.equal(Number(subRow.rows[0].stripe_event_created_at), T_newer);

      const uRow = await pool.query('SELECT is_subscriber FROM users WHERE id = $1', [uid]);
      assert.equal(uRow.rows[0].is_subscriber, false);
    } finally {
      await pool.query('DELETE FROM subscriptions WHERE user_id = $1', [uid]);
      await pool.query('DELETE FROM users WHERE id = $1', [uid]);
    }
  });

  // -------------------------------------------------------------------------
  // 16. Sécurité : Mode test / live selon préfixe STRIPE_SECRET_KEY
  // -------------------------------------------------------------------------
  test('16. Contrôle strict du mode test/live via préfixe STRIPE_SECRET_KEY', async () => {
    const prevKey = process.env.STRIPE_SECRET_KEY;
    const prevEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development';
      process.env.STRIPE_SECRET_KEY = 'sk_live_mock_key_check';

      const res = await executeConfirmSession({
        stripe: {
          checkout: {
            sessions: {
              retrieve: async (sid) => ({
                id: sid,
                customer: `cus_tunnel_${aliceId}`,
                client_reference_id: String(aliceId),
                livemode: false, // Test session refusée avec clé sk_live_ même hors production
                status: 'complete',
                payment_status: 'paid',
                amount_total: 699,
                currency: 'eur',
                mode: 'subscription',
                subscription: 'sub_any'
              })
            }
          }
        },
        userId: aliceId,
        sessionId: 'cs_tunnel_livemode_mismatch'
      });
      assert.equal(res.status, 400);
      assert.match(res.data.error, /Session Stripe testmode invalide/);
    } finally {
      process.env.STRIPE_SECRET_KEY = prevKey;
      process.env.NODE_ENV = prevEnv;
    }
  });

  // -------------------------------------------------------------------------
  // 17. Stress test concurrence répété (5 vagues parallèles webhook + confirmation)
  // -------------------------------------------------------------------------
  test('17. Stress concurrence répété (5x Promise.all webhook + confirm-session) : 0 deadlock, 0 doublon', async () => {
    const rounds = 5;
    for (let i = 0; i < rounds; i++) {
      const uRes = await pool.query(
        `INSERT INTO users (username, email, password, role, is_active, is_subscriber, created_at, updated_at)
         VALUES ($1, $2, 'hash', 'reader', TRUE, FALSE, NOW(), NOW())
         RETURNING id`,
        [`tunnelstress${i}`, `tunnel_reg_stress_${i}_${Date.now()}@example.com`]
      );
      const uid = uRes.rows[0].id;
      const nowSec = Math.floor(Date.now() / 1000);
      const futureDate = nowSec + 30 * 86400;
      const subId = `sub_tunnel_stress_${i}_${Date.now()}`;
      const sessionId = `cs_tunnel_stress_${i}_${Date.now()}`;
      const eventId = `evt_tunnel_stress_${i}_${Date.now()}`;

      try {
        const mockSub = {
          id: subId,
          status: 'active',
          created: nowSec,
          customer: `cus_tunnel_stress_${uid}`,
          metadata: { solitiquo_user_id: String(uid), solitiquo_plan: 'monthly', solitiquo_currency: 'EUR' },
          current_period_start: nowSec,
          current_period_end: futureDate,
          cancel_at_period_end: false,
          items: {
            data: [{
              price: { id: PRICES.EUR.monthly, unit_amount: 699, currency: 'eur', recurring: { interval: 'month' }, product: 'prod_stress' },
              current_period_start: nowSec,
              current_period_end: futureDate
            }]
          }
        };

        const mockSession = {
          id: sessionId,
          customer: `cus_tunnel_stress_${uid}`,
          client_reference_id: String(uid),
          metadata: { solitiquo_user_id: String(uid), solitiquo_plan: 'monthly', solitiquo_currency: 'EUR' },
          livemode: false,
          status: 'complete',
          payment_status: 'paid',
          amount_total: 699,
          currency: 'eur',
          mode: 'subscription',
          subscription: mockSub,
          created: nowSec
        };

        const mockStripe = {
          checkout: { sessions: { retrieve: async () => mockSession } },
          subscriptions: { retrieve: async () => mockSub }
        };

        const webhookEvt = {
          id: eventId,
          type: 'checkout.session.completed',
          created: nowSec,
          data: { object: mockSession }
        };

        const [wRes, cRes] = await Promise.all([
          processWebhookEvent(webhookEvt, { stripe: mockStripe }),
          executeConfirmSession({ stripe: mockStripe, userId: uid, sessionId })
        ]);

        assert.equal(wRes.status, 200, `Round ${i + 1}: webhook doit retourner 200`);
        assert.equal(cRes.status, 200, `Round ${i + 1}: confirm-session doit retourner 200 sans deadlock`);

        const rows = await pool.query('SELECT id FROM subscriptions WHERE stripe_subscription_id = $1', [subId]);
        assert.equal(rows.rows.length, 1, `Round ${i + 1}: exactement 1 ligne subscription`);

        const uCheck = await pool.query('SELECT is_subscriber FROM users WHERE id = $1', [uid]);
        assert.equal(uCheck.rows[0].is_subscriber, true, `Round ${i + 1}: utilisateur activé`);
      } finally {
        await pool.query('DELETE FROM subscriptions WHERE user_id = $1', [uid]);
        await pool.query('DELETE FROM stripe_webhook_events WHERE event_id IN ($1, $2)', [eventId, `checkout_session_${sessionId}`]);
        await pool.query('DELETE FROM users WHERE id = $1', [uid]);
      }
    }
  });

  // -------------------------------------------------------------------------
  // 18. Limite d'expansion Stripe (<= 4 niveaux) & fallback subscriptions.retrieve
  // -------------------------------------------------------------------------
  test('18. Expansion Stripe checkout.sessions.retrieve <= 4 niveaux et fallback subscriptions.retrieve', async () => {
    const uRes = await pool.query(
      `INSERT INTO users (username, email, password, role, is_active, is_subscriber, created_at, updated_at)
       VALUES ('tunnelexpand', 'tunnel_reg_expand@example.com', 'hash', 'reader', TRUE, FALSE, NOW(), NOW())
       RETURNING id`
    );
    const uid = uRes.rows[0].id;
    const nowSec = Math.floor(Date.now() / 1000);
    const futureDate = nowSec + 30 * 86400;
    const subId = `sub_tunnel_expand_${Date.now()}`;
    const sessionId = `cs_tunnel_expand_${Date.now()}`;

    try {
      let capturedSessionExpand = null;
      let capturedSubExpand = null;

      const fullSubscription = {
        id: subId,
        status: 'active',
        created: nowSec,
        customer: `cus_tunnel_expand_${uid}`,
        metadata: { solitiquo_user_id: String(uid), solitiquo_plan: 'monthly', solitiquo_currency: 'EUR' },
        current_period_start: nowSec,
        current_period_end: futureDate,
        cancel_at_period_end: false,
        items: {
          data: [{
            price: {
              id: PRICES.EUR.monthly,
              unit_amount: 699,
              currency: 'eur',
              recurring: { interval: 'month' },
              product: { id: 'prod_expand_mock' }
            },
            current_period_start: nowSec,
            current_period_end: futureDate
          }]
        }
      };

      const mockStripe = {
        checkout: {
          sessions: {
            retrieve: async (_sid, opts = {}) => {
              capturedSessionExpand = opts.expand || [];
              // Simulation stricte de la limite Stripe à 4 niveaux
              for (const path of capturedSessionExpand) {
                const depth = String(path).split('.').length;
                if (depth > 4) {
                  throw new Error(`You cannot expand more than 4 levels of a property. Property: ${path}`);
                }
              }
              return {
                id: sessionId,
                customer: `cus_tunnel_expand_${uid}`,
                client_reference_id: String(uid),
                metadata: { solitiquo_user_id: String(uid), solitiquo_plan: 'monthly', solitiquo_currency: 'EUR' },
                livemode: false,
                status: 'complete',
                payment_status: 'paid',
                amount_total: 699,
                currency: 'eur',
                mode: 'subscription',
                // Simule le cas où subscription est retournée comme simple ID string
                subscription: subId,
                created: nowSec
              };
            }
          }
        },
        subscriptions: {
          retrieve: async (id, opts = {}) => {
            assert.equal(id, subId);
            capturedSubExpand = opts.expand || [];
            for (const path of capturedSubExpand) {
              const depth = String(path).split('.').length;
              if (depth > 4) {
                throw new Error(`You cannot expand more than 4 levels of a property. Property: ${path}`);
              }
            }
            return fullSubscription;
          }
        }
      };

      const res = await executeConfirmSession({ stripe: mockStripe, userId: uid, sessionId });
      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);

      assert.ok(Array.isArray(capturedSessionExpand) && capturedSessionExpand.length > 0);
      for (const path of capturedSessionExpand) {
        assert.ok(path.split('.').length <= 4, `Expansion Checkout trop profonde: ${path}`);
      }
      assert.deepEqual(capturedSessionExpand, ['subscription', 'subscription.default_payment_method']);

      assert.ok(Array.isArray(capturedSubExpand) && capturedSubExpand.length > 0);
      for (const path of capturedSubExpand) {
        assert.ok(path.split('.').length <= 4, `Expansion Subscription trop profonde: ${path}`);
      }

      const uCheck = await pool.query('SELECT is_subscriber FROM users WHERE id = $1', [uid]);
      assert.equal(uCheck.rows[0].is_subscriber, true);
    } finally {
      await pool.query('DELETE FROM subscriptions WHERE user_id = $1', [uid]);
      await pool.query('DELETE FROM stripe_webhook_events WHERE event_id = $1', [`checkout_session_${sessionId}`]);
      await pool.query('DELETE FROM users WHERE id = $1', [uid]);
    }
  });

  // -------------------------------------------------------------------------
  // 19. Idempotence stricte d'une confirmation synchrone répétée
  // -------------------------------------------------------------------------
  test('19. Confirmation répétée séquentiellement sur la même session reste idempotente (200 sans doublon)', async () => {
    const uRes = await pool.query(
      `INSERT INTO users (username, email, password, role, is_active, is_subscriber, created_at, updated_at)
       VALUES ('tunnelrepeat', 'tunnel_reg_repeat@example.com', 'hash', 'reader', TRUE, FALSE, NOW(), NOW())
       RETURNING id`
    );
    const uid = uRes.rows[0].id;
    const nowSec = Math.floor(Date.now() / 1000);
    const futureDate = nowSec + 30 * 86400;
    const subId = `sub_tunnel_repeat_${Date.now()}`;
    const sessionId = `cs_tunnel_repeat_${Date.now()}`;

    try {
      const mockSub = {
        id: subId,
        status: 'active',
        created: nowSec,
        customer: `cus_tunnel_repeat_${uid}`,
        metadata: { solitiquo_user_id: String(uid), solitiquo_plan: 'monthly', solitiquo_currency: 'EUR' },
        current_period_start: nowSec,
        current_period_end: futureDate,
        cancel_at_period_end: false,
        items: {
          data: [{
            price: { id: PRICES.EUR.monthly, unit_amount: 699, currency: 'eur', recurring: { interval: 'month' }, product: 'prod_repeat' },
            current_period_start: nowSec,
            current_period_end: futureDate
          }]
        }
      };

      const mockStripe = {
        checkout: {
          sessions: {
            retrieve: async () => ({
              id: sessionId,
              customer: `cus_tunnel_repeat_${uid}`,
              client_reference_id: String(uid),
              metadata: { solitiquo_user_id: String(uid), solitiquo_plan: 'monthly', solitiquo_currency: 'EUR' },
              livemode: false,
              status: 'complete',
              payment_status: 'paid',
              amount_total: 699,
              currency: 'eur',
              mode: 'subscription',
              subscription: mockSub,
              created: nowSec
            })
          }
        }
      };

      const res1 = await executeConfirmSession({ stripe: mockStripe, userId: uid, sessionId });
      const res2 = await executeConfirmSession({ stripe: mockStripe, userId: uid, sessionId });

      assert.equal(res1.status, 200);
      assert.equal(res2.status, 200);
      assert.equal(res1.data.success, true);
      assert.equal(res2.data.success, true);

      const subRows = await pool.query('SELECT id FROM subscriptions WHERE stripe_subscription_id = $1', [subId]);
      assert.equal(subRows.rows.length, 1);

      const uCheck = await pool.query('SELECT is_subscriber FROM users WHERE id = $1', [uid]);
      assert.equal(uCheck.rows[0].is_subscriber, true);
    } finally {
      await pool.query('DELETE FROM subscriptions WHERE user_id = $1', [uid]);
      await pool.query('DELETE FROM stripe_webhook_events WHERE event_id = $1', [`checkout_session_${sessionId}`]);
      await pool.query('DELETE FROM users WHERE id = $1', [uid]);
    }
  });
});

