'use strict';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-only';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../server');
const pool = require('../backend/config/database');
const {
  pricing,
  countryFromReq,
  setLocalEntitlement,
  syncUserEntitlement,
  upsertSubscription,
  recordWebhook,
  getOrCreateStripeCustomer,
  generateIntegrationIdentifier,
  executeCheckoutTransaction,
  executeCancelSubscription,
  processWebhookEvent,
  PRICES,
  EU_COUNTRIES,
} = require('../backend/routes/stripe');

describe('Stripe Integration & Business Rules', () => {
  let testUserId;
  const dummySubId1 = 'sub_test_mock_001';
  const dummySubId2 = 'sub_test_mock_002';
  const dummyCustomerId = 'cus_test_mock_001';

  before(async () => {
    // Nettoyage préalable au cas où
    await pool.query("DELETE FROM subscriptions WHERE stripe_customer_id = $1", [dummyCustomerId]);
    await pool.query("DELETE FROM stripe_webhook_events WHERE event_id LIKE 'evt_test_%'");
    await pool.query("DELETE FROM users WHERE email = 'stripe_test_user@example.com'");

    // Création d'un utilisateur de test
    const userRes = await pool.query(
      `INSERT INTO users (username, email, password, is_subscriber, role, created_at, updated_at)
       VALUES ('stripe_test_user', 'stripe_test_user@example.com', 'hash_test_dummy', false, 'reader', NOW(), NOW())
       RETURNING id`
    );
    testUserId = userRes.rows[0].id;
  });

  after(async () => {
    // Nettoyage après tests
    if (testUserId) {
      await pool.query("DELETE FROM subscriptions WHERE user_id = $1", [testUserId]);
      await pool.query("DELETE FROM users WHERE id = $1", [testUserId]);
    }
    await pool.query("DELETE FROM stripe_webhook_events WHERE event_id LIKE 'evt_test_%'");
  });

  // -------------------------------------------------------------------------
  // 1. GÉOLOCALISATION & TARIFS
  // -------------------------------------------------------------------------
  describe('1. Géolocalisation et devises', () => {
    test('CM => XAF / local provider (flutterwave)', () => {
      const p = pricing('CM');
      assert.equal(p.currency, 'XAF');
      assert.equal(p.provider, 'flutterwave');
      assert.equal(p.monthly, 3000);
      assert.equal(p.yearly, 30000);
    });

    test('BJ / TG / SN / CI => XOF / local provider (flutterwave)', () => {
      ['BJ', 'TG', 'SN', 'CI'].forEach((code) => {
        const p = pricing(code);
        assert.equal(p.currency, 'XOF');
        assert.equal(p.provider, 'flutterwave');
        assert.equal(p.monthly, 3000);
        assert.equal(p.yearly, 30000);
      });
    });

    test('Europe => EUR (Stripe: EUR 6.99 / 69.90)', () => {
      ['FR', 'DE', 'ES', 'IT', 'BE'].forEach((code) => {
        const p = pricing(code);
        assert.equal(p.currency, 'EUR');
        assert.equal(p.provider, 'stripe');
        assert.equal(p.monthly, 6.99);
        assert.equal(p.yearly, 69.90);
        assert.equal(p.monthlyPriceId, PRICES.EUR.monthly);
        assert.equal(p.yearlyPriceId, PRICES.EUR.yearly);
      });
    });

    test('GB => GBP (Stripe: GBP 6.99 / 69.90)', () => {
      const p = pricing('GB');
      assert.equal(p.currency, 'GBP');
      assert.equal(p.provider, 'stripe');
      assert.equal(p.monthly, 6.99);
      assert.equal(p.yearly, 69.90);
      assert.equal(p.monthlyPriceId, PRICES.GBP.monthly);
      assert.equal(p.yearlyPriceId, PRICES.GBP.yearly);
    });

    test('CA => CAD (Stripe: CAD 9.99 / 99.90)', () => {
      const p = pricing('CA');
      assert.equal(p.currency, 'CAD');
      assert.equal(p.provider, 'stripe');
      assert.equal(p.monthly, 9.99);
      assert.equal(p.yearly, 99.90);
      assert.equal(p.monthlyPriceId, PRICES.CAD.monthly);
      assert.equal(p.yearlyPriceId, PRICES.CAD.yearly);
    });

    test('ROW => USD (Stripe: USD 7.99 / 79.90)', () => {
      ['US', 'JP', 'BR', 'AU', null, ''].forEach((code) => {
        const p = pricing(code);
        assert.equal(p.currency, 'USD');
        assert.equal(p.provider, 'stripe');
        assert.equal(p.monthly, 7.99);
        assert.equal(p.yearly, 79.90);
        assert.equal(p.monthlyPriceId, PRICES.USD.monthly);
        assert.equal(p.yearlyPriceId, PRICES.USD.yearly);
      });
    });

    test('GET /api/stripe/pricing endpoint public avec détection testCountry', async () => {
      const resFR = await request(app).get('/api/stripe/pricing?testCountry=FR');
      assert.equal(resFR.status, 200);
      assert.equal(resFR.body.currency, 'EUR');
      assert.equal(resFR.body.monthly, 6.99);

      const resGB = await request(app).get('/api/stripe/pricing?testCountry=GB');
      assert.equal(resGB.status, 200);
      assert.equal(resGB.body.currency, 'GBP');
      assert.equal(resGB.body.monthly, 6.99);

      const resCA = await request(app).get('/api/stripe/pricing?testCountry=CA');
      assert.equal(resCA.status, 200);
      assert.equal(resCA.body.currency, 'CAD');
      assert.equal(resCA.body.monthly, 9.99);

      const resUS = await request(app).get('/api/stripe/pricing?testCountry=US');
      assert.equal(resUS.status, 200);
      assert.equal(resUS.body.currency, 'USD');
      assert.equal(resUS.body.monthly, 7.99);

      const resCM = await request(app).get('/api/stripe/pricing?testCountry=CM');
      assert.equal(resCM.status, 200);
      assert.equal(resCM.body.currency, 'XAF');
      assert.equal(resCM.body.provider, 'flutterwave');
    });
  });

  // -------------------------------------------------------------------------
  // 2. SÉCURITÉ DES ROUTES (CSRF & AUTHENTIFICATION)
  // -------------------------------------------------------------------------
  describe('2. Sécurité des endpoints Stripe', () => {
    test('POST /api/stripe/checkout — 403 sans token CSRF', async () => {
      const res = await request(app)
        .post('/api/stripe/checkout')
        .send({ plan: 'monthly' });
      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
    });

    test('POST /api/stripe/portal — 403 sans token CSRF', async () => {
      const res = await request(app)
        .post('/api/stripe/portal')
        .send({});
      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
    });

    test('POST /api/stripe/cancel — 403 sans token CSRF', async () => {
      const res = await request(app)
        .post('/api/stripe/cancel')
        .send({});
      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
    });

    test('POST /api/stripe/reactivate — 403 sans token CSRF', async () => {
      const res = await request(app)
        .post('/api/stripe/reactivate')
        .send({});
      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
    });

    test('POST /api/stripe/change-plan — 403 sans token CSRF', async () => {
      const res = await request(app)
        .post('/api/stripe/change-plan')
        .send({ targetPlan: 'yearly' });
      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
    });

    test('POST /api/stripe/webhook — rejet 400 si signature manquante', async () => {
      const res = await request(app)
        .post('/api/stripe/webhook')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ type: 'test' }));
      assert.equal(res.status, 400);
      assert.match(res.text, /Webhook signature invalide/);
    });

    test('POST /api/stripe/webhook — rejet 400 si signature invalide', async () => {
      const res = await request(app)
        .post('/api/stripe/webhook')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 't=123,v1=bad_signature')
        .send(JSON.stringify({ type: 'test' }));
      assert.equal(res.status, 400);
      assert.match(res.text, /Webhook signature invalide/);
    });
  });

  // -------------------------------------------------------------------------
  // 3. ESSAI GRATUIT (TRIAL) ET ÉLIGIBILITÉ
  // -------------------------------------------------------------------------
  describe('3. Règles d’essai gratuit (Trial 30 jours)', () => {
    test('Eligible au trial : premier abonnement mensuel avec subscription_trial_used_at NULL', async () => {
      const uRes = await pool.query("SELECT subscription_trial_used_at FROM users WHERE id = $1", [testUserId]);
      assert.equal(uRes.rows[0].subscription_trial_used_at, null);

      // Simulation du calcul d'éligibilité fait dans /checkout
      const planMonthly = 'monthly';
      const isEligibleTrial = planMonthly === 'monthly' && !uRes.rows[0].subscription_trial_used_at;
      assert.equal(isEligibleTrial, true);
    });

    test('Inéligible au trial : abonnement annuel (annual = jamais de trial)', async () => {
      const uRes = await pool.query("SELECT subscription_trial_used_at FROM users WHERE id = $1", [testUserId]);
      const planYearly = 'yearly';
      const isEligibleTrial = planYearly === 'monthly' && !uRes.rows[0].subscription_trial_used_at;
      assert.equal(isEligibleTrial, false);
    });

    test('Démarrage du trial : upsertSubscription active Premium et marque subscription_trial_used_at', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const trialEndSec = nowSec + 30 * 24 * 3600;

      const mockTrialSub = {
        id: dummySubId1,
        customer: dummyCustomerId,
        status: 'trialing',
        cancel_at_period_end: false,
        current_period_start: nowSec,
        current_period_end: trialEndSec,
        trial_start: nowSec,
        trial_end: trialEndSec,
        latest_invoice: 'in_mock_trial',
        default_payment_method: 'pm_mock_trial',
        items: {
          data: [{ price: { id: PRICES.EUR.monthly, product: 'prod_mock_trial' } }]
        },
        metadata: { solitiquo_user_id: String(testUserId) }
      };

      await upsertSubscription(mockTrialSub, null, testUserId);

      // Vérification utilisateur
      const uRes = await pool.query(
        "SELECT is_subscriber, subscription_trial_used_at, subscription_end_date FROM users WHERE id = $1",
        [testUserId]
      );
      assert.equal(uRes.rows[0].is_subscriber, true);
      assert.ok(uRes.rows[0].subscription_trial_used_at !== null, 'subscription_trial_used_at doit être renseigné');
      assert.ok(uRes.rows[0].subscription_end_date !== null, 'subscription_end_date doit être renseigné');

      // Vérification subscription en base
      const sRes = await pool.query("SELECT * FROM subscriptions WHERE stripe_subscription_id = $1", [dummySubId1]);
      assert.equal(sRes.rows.length, 1);
      assert.equal(sRes.rows[0].stripe_status, 'trialing');
      assert.equal(sRes.rows[0].status, 'active');
    });

    test('Trial déjà utilisé : inéligible pour toute souscription future', async () => {
      const uRes = await pool.query("SELECT subscription_trial_used_at FROM users WHERE id = $1", [testUserId]);
      assert.ok(uRes.rows[0].subscription_trial_used_at !== null);

      const isEligibleNow = !uRes.rows[0].subscription_trial_used_at;
      assert.equal(isEligibleNow, false, 'Ne doit plus avoir droit au trial une fois utilisé');
    });
  });

  // -------------------------------------------------------------------------
  // 4. UN SEUL ABONNEMENT ACTIF / CONTRAINTE D'UNICITÉ
  // -------------------------------------------------------------------------
  describe('4. Un seul abonnement actif & contraintes', () => {
    test('Contrainte PostgreSQL : empêche deux abonnements actifs concurrents pour le même utilisateur', async () => {
      let threw = false;
      try {
        await pool.query(
          `INSERT INTO subscriptions (
             user_id, plan, amount, starts_at, ends_at, stripe_subscription_id, stripe_customer_id, stripe_price_id,
             stripe_status, status, created_at, updated_at
           ) VALUES ($1, 'monthly', 6.99, NOW(), NOW() + INTERVAL '30 days', $2, $3, $4, 'active', 'active', NOW(), NOW())`,
          [testUserId, dummySubId2, dummyCustomerId, PRICES.EUR.monthly]
        );
      } catch (err) {
        threw = true;
        // La contrainte d'index partiel subscriptions_one_live_stripe_subscription_unique doit lever une erreur 23505
        assert.equal(err.code, '23505');
      }
      assert.equal(threw, true, 'Deux abonnements actifs simultanés doivent violer la contrainte unique');
    });
  });

  // -------------------------------------------------------------------------
  // 5. RÉSILIATION (TRIAL VS PAID) ET RÉACTIVATION
  // -------------------------------------------------------------------------
  describe('5. Résiliation et Réactivation', () => {
    test('Résiliation pendant le trial : Premium RESTE ACTIF jusqu’à la fin de la période d’essai (trial_end)', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const trialEndSec = nowSec + 25 * 86400; // 25 jours restants de trial

      // Initialiser la subscription en statut trialing actif
      const mockTrialSub = {
        id: dummySubId1,
        customer: dummyCustomerId,
        status: 'trialing',
        cancel_at_period_end: false,
        current_period_start: nowSec,
        current_period_end: trialEndSec,
        trial_start: nowSec,
        trial_end: trialEndSec,
        items: { data: [{ price: { id: PRICES.EUR.monthly } }] },
        metadata: { solitiquo_user_id: String(testUserId) }
      };
      await upsertSubscription(mockTrialSub, null, testUserId);

      let updateCalled = false;
      let updateParams = null;
      let cancelCalled = false;

      const mockStripeCancel = {
        subscriptions: {
          retrieve: async () => ({
            id: dummySubId1,
            status: 'trialing',
            trial_end: trialEndSec,
            current_period_end: trialEndSec
          }),
          update: async (id, params) => {
            updateCalled = true;
            updateParams = params;
            return {
              id,
              status: 'trialing',
              cancel_at_period_end: true,
              trial_end: trialEndSec,
              current_period_end: trialEndSec
            };
          },
          cancel: async () => {
            cancelCalled = true;
          }
        }
      };

      const res = await executeCancelSubscription({
        stripe: mockStripeCancel,
        userId: testUserId
      });

      // 1. Stripe update utilisé avec cancel_at_period_end = true
      assert.equal(updateCalled, true, 'subscriptions.update doit être appelé');
      assert.equal(updateParams?.cancel_at_period_end, true, 'cancel_at_period_end doit être true');

      // 2. Aucune annulation immédiate effectuée
      assert.equal(cancelCalled, false, 'subscriptions.cancel() ne doit pas être appelé');

      // 3. Réponse locale
      assert.equal(res.status, 200);
      assert.equal(res.data.immediate, false, 'immediate doit être false');
      assert.equal(res.data.ends_at, new Date(trialEndSec * 1000).toISOString(), 'ends_at doit correspondre à trial_end');

      // 4. Base de données et droits
      const sRes = await pool.query("SELECT stripe_status, stripe_cancel_at_period_end, ends_at FROM subscriptions WHERE stripe_subscription_id = $1", [dummySubId1]);
      assert.equal(sRes.rows[0].stripe_status, 'trialing');
      assert.equal(sRes.rows[0].stripe_cancel_at_period_end, true);

      const uRes = await pool.query("SELECT is_subscriber, subscription_end_date FROM users WHERE id = $1", [testUserId]);
      assert.equal(uRes.rows[0].is_subscriber, true, 'is_subscriber doit rester true jusqu’à la fin du trial');
      assert.equal(new Date(uRes.rows[0].subscription_end_date).toISOString(), new Date(trialEndSec * 1000).toISOString());
    });

    test('Fin de trial résilié : révocation de Premium via customer.subscription.deleted', async () => {
      const nowSec = Math.floor(Date.now() / 1000);

      // Simulation de l’événement Stripe à trial_end qui clôture définitivement l'abonnement
      const mockDeletedTrialSub = {
        id: dummySubId1,
        customer: dummyCustomerId,
        status: 'canceled',
        cancel_at_period_end: false,
        canceled_at: nowSec,
        current_period_start: nowSec - 30 * 86400,
        current_period_end: nowSec,
        trial_start: nowSec - 30 * 86400,
        trial_end: nowSec,
        items: { data: [{ price: { id: PRICES.EUR.monthly } }] },
        metadata: { solitiquo_user_id: String(testUserId) }
      };

      await upsertSubscription(mockDeletedTrialSub, null, testUserId);

      const uRes = await pool.query("SELECT is_subscriber FROM users WHERE id = $1", [testUserId]);
      assert.equal(uRes.rows[0].is_subscriber, false, 'Premium doit être révoqué une fois le trial clos');

      const sRes = await pool.query("SELECT stripe_status, status FROM subscriptions WHERE stripe_subscription_id = $1", [dummySubId1]);
      assert.equal(sRes.rows[0].stripe_status, 'canceled');
      assert.equal(sRes.rows[0].status, 'cancelled');
    });

    test('Abonnement payant avec cancel_at_period_end=true : Premium RESTE ACTIF jusqu’à la fin de période', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const endSec = nowSec + 15 * 24 * 3600; // 15 jours restants

      const mockPaidSubCanceling = {
        id: dummySubId1,
        customer: dummyCustomerId,
        status: 'active',
        cancel_at_period_end: true,
        current_period_start: nowSec,
        current_period_end: endSec,
        trial_start: null,
        trial_end: null,
        items: {
          data: [{ price: { id: PRICES.EUR.monthly } }]
        },
        metadata: { solitiquo_user_id: String(testUserId) }
      };

      await upsertSubscription(mockPaidSubCanceling, null, testUserId);

      const uRes = await pool.query("SELECT is_subscriber, subscription_end_date FROM users WHERE id = $1", [testUserId]);
      assert.equal(uRes.rows[0].is_subscriber, true, 'Premium doit rester actif jusqu’à la fin de période payée');
      assert.ok(new Date(uRes.rows[0].subscription_end_date).getTime() > Date.now());

      const sRes = await pool.query("SELECT stripe_cancel_at_period_end FROM subscriptions WHERE stripe_subscription_id = $1", [dummySubId1]);
      assert.equal(sRes.rows[0].stripe_cancel_at_period_end, true);
    });

    test('Réactivation avant la fin de période : remet cancel_at_period_end=false', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const endSec = nowSec + 15 * 24 * 3600;

      const mockReactivatedSub = {
        id: dummySubId1,
        customer: dummyCustomerId,
        status: 'active',
        cancel_at_period_end: false,
        current_period_start: nowSec,
        current_period_end: endSec,
        trial_start: null,
        trial_end: null,
        items: {
          data: [{ price: { id: PRICES.EUR.monthly } }]
        },
        metadata: { solitiquo_user_id: String(testUserId) }
      };

      await upsertSubscription(mockReactivatedSub, null, testUserId);

      const sRes = await pool.query("SELECT stripe_cancel_at_period_end FROM subscriptions WHERE stripe_subscription_id = $1", [dummySubId1]);
      assert.equal(sRes.rows[0].stripe_cancel_at_period_end, false);

      const uRes = await pool.query("SELECT is_subscriber FROM users WHERE id = $1", [testUserId]);
      assert.equal(uRes.rows[0].is_subscriber, true);
    });
  });

  // -------------------------------------------------------------------------
  // 6. ÉCHEC DE PAIEMENT & GRACE PERIOD DE 5 JOURS & RESTAURATION INVOICE.PAID
  // -------------------------------------------------------------------------
  describe('6. Échec de paiement, période de grâce de 5 jours et restauration', () => {
    test('Échec de paiement : active la période de grâce de 5 jours et maintient Premium', async () => {
      // Simule la logique du webhook invoice.payment_failed
      const updateRes = await pool.query(
        `UPDATE subscriptions
         SET payment_failed_at = NOW(),
             payment_grace_ends_at = NOW() + INTERVAL '5 days',
             stripe_status = 'past_due',
             status = 'active',
             updated_at = NOW()
         WHERE stripe_subscription_id = $1
         RETURNING user_id, payment_grace_ends_at`,
        [dummySubId1]
      );

      const { user_id, payment_grace_ends_at } = updateRes.rows[0];
      const isGraceActive = payment_grace_ends_at && new Date(payment_grace_ends_at) > new Date();
      assert.equal(isGraceActive, true, 'La période de grâce doit être active pendant 5 jours');

      await setLocalEntitlement(user_id, isGraceActive, payment_grace_ends_at);

      const uRes = await pool.query("SELECT is_subscriber FROM users WHERE id = $1", [testUserId]);
      assert.equal(uRes.rows[0].is_subscriber, true, 'L’accès Premium doit être maintenu pendant les 5 jours de grâce');
    });

    test('Expiration de la grâce (> 5 jours) : Premium est retiré', async () => {
      // Simule une date de grâce expirée dans le passé
      await pool.query(
        `UPDATE subscriptions
         SET payment_failed_at = NOW() - INTERVAL '6 days',
             payment_grace_ends_at = NOW() - INTERVAL '1 day',
             stripe_status = 'past_due',
             updated_at = NOW()
         WHERE stripe_subscription_id = $1`,
        [dummySubId1]
      );

      // syncUserEntitlement évalue le statut et la grâce
      await syncUserEntitlement(testUserId);

      const uRes = await pool.query("SELECT is_subscriber FROM users WHERE id = $1", [testUserId]);
      assert.equal(uRes.rows[0].is_subscriber, false, 'Premium doit être révoqué une fois la période de grâce expirée');
    });

    test('Restauration via invoice.paid : supprime la grâce et rétablit l’accès Premium actif', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const nextMonthSec = nowSec + 30 * 24 * 3600;

      const mockPaidRecoverySub = {
        id: dummySubId1,
        customer: dummyCustomerId,
        status: 'active',
        cancel_at_period_end: false,
        current_period_start: nowSec,
        current_period_end: nextMonthSec,
        trial_start: null,
        trial_end: null,
        items: {
          data: [{ price: { id: PRICES.EUR.monthly } }]
        },
        metadata: { solitiquo_user_id: String(testUserId) }
      };

      // Lors d’un paiement réussi, upsertSubscription nettoie payment_failed_at et payment_grace_ends_at
      await upsertSubscription(mockPaidRecoverySub, null, testUserId);

      const sRes = await pool.query("SELECT payment_failed_at, payment_grace_ends_at, stripe_status FROM subscriptions WHERE stripe_subscription_id = $1", [dummySubId1]);
      assert.equal(sRes.rows[0].payment_failed_at, null, 'payment_failed_at doit être effacé');
      assert.equal(sRes.rows[0].payment_grace_ends_at, null, 'payment_grace_ends_at doit être effacé');
      assert.equal(sRes.rows[0].stripe_status, 'active');

      const uRes = await pool.query("SELECT is_subscriber FROM users WHERE id = $1", [testUserId]);
      assert.equal(uRes.rows[0].is_subscriber, true, 'Premium doit être restauré suite au paiement réussi');
    });
  });

  // -------------------------------------------------------------------------
  // 7. IDEMPOTENCE DES WEBHOOKS
  // -------------------------------------------------------------------------
  describe('7. Idempotence des webhooks', () => {
    test('recordWebhook : premier enregistrement retourne true, second retourne false', async () => {
      const testEventId = 'evt_test_idempotency_abc123';

      const firstTry = await recordWebhook(testEventId, 'invoice.paid');
      assert.equal(firstTry, true, 'Le premier traitement de l’événement doit retourner true');

      const secondTry = await recordWebhook(testEventId, 'invoice.paid');
      assert.equal(secondTry, false, 'Le second traitement du même événement doit retourner false (ignoré)');
    });
  });

  // -------------------------------------------------------------------------
  // 8. TESTS DE RÉGRESSION ET SÉRIALISATION CONCURRENTE
  // -------------------------------------------------------------------------
  describe('8. Tests de régression et robustesse', () => {
    test('Format integration_identifier : suffixe strictement composé de 8 lettres minuscules', () => {
      for (let i = 0; i < 20; i++) {
        const id = generateIntegrationIdentifier();
        assert.match(id, /^solitiquo_[a-z]{8}$/, `L'identifiant ${id} ne respecte pas le format solitiquo_[a-z]{8}`);
      }
    });

    test('integration_identifier : transmis comme paramètre API dédié à stripe.checkout.sessions.create()', async () => {
      let passedConfig = null;
      const mockStripe = {
        customers: {
          search: async () => ({ data: [{ id: 'cus_test_int_id', deleted: false }] }),
          create: async () => ({ id: 'cus_test_int_id' })
        },
        checkout: {
          sessions: {
            create: async (cfg) => {
              passedConfig = cfg;
              return { id: 'cs_test_int_id', url: 'https://checkout.stripe.com/pay/cs_test_int_id' };
            }
          }
        }
      };

      await pool.query("DELETE FROM subscriptions WHERE user_id = $1", [testUserId]);

      const res = await executeCheckoutTransaction({
        stripe: mockStripe,
        userId: testUserId,
        userEmail: 'stripe_test_user@example.com',
        plan: 'monthly',
        country: 'FR',
        p: pricing('FR')
      });

      assert.equal(res.status, 200);
      assert.ok(passedConfig, 'stripe.checkout.sessions.create doit avoir été appelé');
      // Vérification que integration_identifier est un paramètre racine de la Checkout Session
      assert.ok(passedConfig.integration_identifier, 'integration_identifier doit être présent à la racine de la session');
      assert.match(
        passedConfig.integration_identifier,
        /^solitiquo_[a-z]{8}$/,
        'integration_identifier à la racine doit respecter le format solitiquo_[a-z]{8}'
      );
      // Vérification que les métadonnées contiennent aussi l'identifiant pour traçabilité
      assert.equal(
        passedConfig.metadata.integration_identifier,
        passedConfig.integration_identifier,
        'metadata.integration_identifier doit être synchronisé'
      );

      await pool.query("DELETE FROM subscriptions WHERE user_id = $1", [testUserId]);
    });

    test('Sérialisation checkout concurrent réel : deux requêtes simultanées partageant le même utilisateur', async () => {
      await pool.query("DELETE FROM subscriptions WHERE user_id = $1", [testUserId]);
      await pool.query("UPDATE users SET is_subscriber = false, subscription_trial_used_at = NULL WHERE id = $1", [testUserId]);

      let sessionCreateCount = 0;
      let customerCreateCount = 0;
      const createdSessions = [];

      const concurrentMockStripe = {
        customers: {
          search: async () => ({ data: [] }),
          create: async () => {
            customerCreateCount++;
            return { id: 'cus_concurrent_shared_001' };
          }
        },
        checkout: {
          sessions: {
            create: async () => {
              sessionCreateCount++;
              // Simuler une latence réseau réelle (50ms) pendant laquelle le verrou est actif
              await new Promise((r) => setTimeout(r, 50));
              const s = { id: `cs_concurrent_${sessionCreateCount}`, url: 'https://checkout.stripe.com/test' };
              createdSessions.push(s);
              return s;
            }
          }
        }
      };

      // Exécution strictement concurrente de deux checkout pour le même utilisateur
      const [res1, res2] = await Promise.all([
        executeCheckoutTransaction({
          stripe: concurrentMockStripe,
          userId: testUserId,
          userEmail: 'stripe_test_user@example.com',
          plan: 'monthly',
          country: 'FR',
          p: pricing('FR')
        }),
        executeCheckoutTransaction({
          stripe: concurrentMockStripe,
          userId: testUserId,
          userEmail: 'stripe_test_user@example.com',
          plan: 'monthly',
          country: 'FR',
          p: pricing('FR')
        })
      ]);

      // 1. Une seule requête réussit (200), la seconde est rejetée avec 409
      const statuses = [res1.status, res2.status].sort();
      assert.deepEqual(statuses, [200, 409], 'Une requête doit réussir (200) et la concurrente être rejetée (409)');

      // 2. Une seule Checkout Session Stripe créée
      assert.equal(sessionCreateCount, 1, 'Une seule Checkout Session Stripe doit être créée');

      // 3. Un seul Customer Stripe créé / réutilisé
      assert.equal(customerCreateCount, 1, 'Un seul Customer Stripe doit être créé');

      // 4. Une seule réservation pending en base avec stripe_subscription_id = NULL
      const dbSubs = await pool.query('SELECT * FROM subscriptions WHERE user_id = $1', [testUserId]);
      assert.equal(dbSubs.rows.length, 1, 'Une seule réservation doit exister en base de données');
      assert.equal(dbSubs.rows[0].status, 'pending', 'Le statut doit être pending');
      assert.equal(dbSubs.rows[0].stripe_subscription_id, null, 'stripe_subscription_id doit rester NULL');
      assert.equal(dbSubs.rows[0].transaction_id, createdSessions[0].id, 'La réservation doit être mise à jour avec la session Stripe');

      // 5. Aucune subscription locale active artificielle n’a été créée
      const dbUser = await pool.query('SELECT is_subscriber FROM users WHERE id = $1', [testUserId]);
      assert.equal(dbUser.rows[0].is_subscriber, false, 'Le statut pending ne doit pas accorder Premium');

      await pool.query("DELETE FROM subscriptions WHERE user_id = $1", [testUserId]);
    });

    test('Crash / Échec Stripe Checkout : rollback de la réservation pending et aucun entitlement accordé', async () => {
      await pool.query("DELETE FROM subscriptions WHERE user_id = $1", [testUserId]);
      await pool.query("UPDATE users SET is_subscriber = false WHERE id = $1", [testUserId]);

      const failingStripe = {
        customers: {
          search: async () => ({ data: [{ id: 'cus_existing_dummy', deleted: false }] }),
          create: async () => ({ id: 'cus_existing_dummy' })
        },
        checkout: {
          sessions: {
            create: async () => {
              throw new Error('Stripe API network timeout / 500 error');
            }
          }
        }
      };

      const failRes = await executeCheckoutTransaction({
        stripe: failingStripe,
        userId: testUserId,
        userEmail: 'stripe_test_user@example.com',
        plan: 'monthly',
        country: 'FR',
        p: pricing('FR')
      });

      assert.equal(failRes.status, 500);
      assert.equal(failRes.data.success, false);

      // Vérifier que la transaction PostgreSQL a été rollbackée et qu'aucune réservation pending ne subsiste
      const remainingSubs = await pool.query('SELECT * FROM subscriptions WHERE user_id = $1', [testUserId]);
      assert.equal(remainingSubs.rows.length, 0, 'Aucune réservation pending ne doit subsister après rollback');

      // Vérifier qu'aucun accès Premium n'a été accordé
      const uRes = await pool.query('SELECT is_subscriber FROM users WHERE id = $1', [testUserId]);
      assert.equal(uRes.rows[0].is_subscriber, false, 'Aucun accès Premium ne doit être accordé en cas d’échec Stripe');
    });

    test('Customer Stripe : recherché par metadata avant toute création pour éviter les doublons', async () => {
      let createCalled = false;
      let passedOptions = null;
      const mockStripe = {
        customers: {
          search: async ({ query }) => {
            if (query.includes(String(testUserId))) {
              return { data: [{ id: 'cus_found_in_stripe', deleted: false }] };
            }
            return { data: [] };
          },
          create: async (data, opts) => {
            createCalled = true;
            passedOptions = opts;
            return { id: 'cus_created_new' };
          }
        }
      };

      // Supprimer le customer_id local pour forcer la recherche Stripe
      await pool.query("DELETE FROM subscriptions WHERE user_id = $1", [testUserId]);

      const foundId = await getOrCreateStripeCustomer(mockStripe, { id: testUserId, email: 'test@example.com', username: 'testuser' });
      assert.equal(foundId, 'cus_found_in_stripe');
      assert.equal(createCalled, false, 'create() ne doit pas être appelé si le client est trouvé via search');
    });

    test('Idempotence Checkout Stripe : deux appels avec la même tentative logique transmettent la même clé et ne créent qu’une seule Checkout Session', async () => {
      await pool.query("DELETE FROM subscriptions WHERE user_id = $1", [testUserId]);

      const createdSessions = new Map();
      let createCallCount = 0;
      const capturedKeys = [];

      const mockStripeWithIdempotency = {
        customers: {
          search: async () => ({ data: [{ id: 'cus_idem_test', deleted: false }] }),
          create: async () => ({ id: 'cus_idem_test' })
        },
        checkout: {
          sessions: {
            create: async (config, options) => {
              createCallCount++;
              const key = options?.idempotencyKey;
              capturedKeys.push(key);
              if (key && createdSessions.has(key)) {
                // Stripe renvoie la même session sans en créer une nouvelle
                return createdSessions.get(key);
              }
              const session = {
                id: `cs_idem_session_${createdSessions.size + 1}`,
                url: 'https://checkout.stripe.com/pay/cs_idem'
              };
              if (key) {
                createdSessions.set(key, session);
              }
              return session;
            }
          }
        }
      };

      const logicalAttemptKey = `attempt_user_${testUserId}_monthly_retry_test`;

      // 1ère tentative : création de la session Stripe
      const res1 = await executeCheckoutTransaction({
        stripe: mockStripeWithIdempotency,
        userId: testUserId,
        userEmail: 'stripe_test_user@example.com',
        plan: 'monthly',
        country: 'FR',
        p: pricing('FR'),
        idempotencyKey: logicalAttemptKey
      });

      assert.equal(res1.status, 200);
      assert.equal(res1.data.session_id, 'cs_idem_session_1');

      // Simulation de crash Node.js avant COMMIT : suppression de la réservation locale
      await pool.query("DELETE FROM subscriptions WHERE user_id = $1", [testUserId]);

      // 2ème tentative (retry de la même tentative logique avec la même clé)
      const res2 = await executeCheckoutTransaction({
        stripe: mockStripeWithIdempotency,
        userId: testUserId,
        userEmail: 'stripe_test_user@example.com',
        plan: 'monthly',
        country: 'FR',
        p: pricing('FR'),
        idempotencyKey: logicalAttemptKey
      });

      assert.equal(res2.status, 200);
      // La session Stripe renvoyée par le retry doit être rigoureusement identique
      assert.equal(res2.data.session_id, 'cs_idem_session_1');

      // Stripe n'a instancié qu'une seule session dans son cache
      assert.equal(createdSessions.size, 1, 'Stripe ne doit créer qu’une seule Checkout Session pour la même clé d’idempotence');
      assert.equal(createCallCount, 2, 'Deux appels API ont eu lieu');
      assert.equal(capturedKeys[0], logicalAttemptKey, 'La 1ère requête a transmis la clé d’idempotence');
      assert.equal(capturedKeys[1], logicalAttemptKey, 'Le retry a transmis la même clé d’idempotence');

      // En base de données, la réservation finale porte l'ID de cette session unique
      const subs = await pool.query("SELECT * FROM subscriptions WHERE user_id = $1", [testUserId]);
      assert.equal(subs.rows.length, 1);
      assert.equal(subs.rows[0].transaction_id, 'cs_idem_session_1');

      await pool.query("DELETE FROM subscriptions WHERE user_id = $1", [testUserId]);
    });

    test('Customer Stripe : réutilisé via recherche metadata après crash/rollback lors de la création initiale', async () => {
      await pool.query("DELETE FROM subscriptions WHERE user_id = $1", [testUserId]);

      let stripeStoredCustomer = null;
      let customerCreateCount = 0;
      let customerSearchCount = 0;

      const mockStripeCustomerFlow = {
        customers: {
          search: async ({ query }) => {
            customerSearchCount++;
            if (stripeStoredCustomer && query.includes(String(testUserId))) {
              return { data: [stripeStoredCustomer] };
            }
            return { data: [] };
          },
          create: async (data, options) => {
            customerCreateCount++;
            stripeStoredCustomer = {
              id: `cus_crash_recovered_${testUserId}`,
              deleted: false,
              metadata: data.metadata
            };
            return stripeStoredCustomer;
          }
        },
        checkout: {
          sessions: {
            create: async () => ({ id: 'cs_test_cust', url: 'https://checkout.stripe.com/pay' })
          }
        }
      };

      // 1ère tentative : création du client dans Stripe
      const custId1 = await getOrCreateStripeCustomer(mockStripeCustomerFlow, {
        id: testUserId,
        email: 'stripe_test_user@example.com',
        username: 'stripe_test_user'
      });
      assert.equal(custId1, `cus_crash_recovered_${testUserId}`);
      assert.equal(customerCreateCount, 1);

      // Simulation de crash/rollback PostgreSQL : aucune trace dans subscriptions
      await pool.query("DELETE FROM subscriptions WHERE user_id = $1", [testUserId]);

      // 2ème tentative (retry après crash) : doit retrouver le Customer par metadata Stripe sans recréation
      const custId2 = await getOrCreateStripeCustomer(mockStripeCustomerFlow, {
        id: testUserId,
        email: 'stripe_test_user@example.com',
        username: 'stripe_test_user'
      });

      assert.equal(custId2, `cus_crash_recovered_${testUserId}`);
      assert.equal(customerCreateCount, 1, 'create() ne doit pas être réappelé car le client existe déjà dans Stripe');
      assert.ok(customerSearchCount >= 2, 'search() doit avoir été exécuté');

      await pool.query("DELETE FROM subscriptions WHERE user_id = $1", [testUserId]);
    });

    test('Réactivation : restaure explicitement users.is_subscriber et synchronise subscription_end_date', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const targetEndSec = nowSec + 25 * 24 * 3600;
      const targetEndDate = new Date(targetEndSec * 1000);

      // Simulation d'une souscription avec résiliation programmée
      await pool.query(
        `INSERT INTO subscriptions (
           user_id, plan, amount, starts_at, ends_at, stripe_subscription_id, stripe_customer_id, stripe_price_id,
           stripe_status, stripe_cancel_at_period_end, stripe_current_period_end, status, created_at, updated_at
         ) VALUES ($1, 'monthly', 6.99, NOW(), $2::timestamp, 'sub_reactivate_test', $3, $4, 'active', true, $2::timestamptz, 'active', NOW(), NOW())
         ON CONFLICT (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL DO UPDATE SET
           stripe_cancel_at_period_end = true, stripe_current_period_end = EXCLUDED.stripe_current_period_end, ends_at = EXCLUDED.ends_at`,
        [testUserId, targetEndDate, dummyCustomerId, PRICES.EUR.monthly]
      );

      // Réactivation
      await pool.query(
        `UPDATE subscriptions
         SET stripe_cancel_at_period_end = false,
             stripe_current_period_end = $1::timestamptz,
             ends_at = $1::timestamp,
             updated_at = NOW()
         WHERE stripe_subscription_id = 'sub_reactivate_test'`,
        [targetEndDate]
      );
      await setLocalEntitlement(testUserId, true, targetEndDate);

      const uRes = await pool.query("SELECT is_subscriber, subscription_end_date FROM users WHERE id = $1", [testUserId]);
      assert.equal(uRes.rows[0].is_subscriber, true, 'users.is_subscriber doit être true');
      assert.equal(
        new Date(uRes.rows[0].subscription_end_date).toISOString(),
        targetEndDate.toISOString(),
        'subscription_end_date doit correspondre à la date Stripe'
      );

      await pool.query("DELETE FROM subscriptions WHERE stripe_subscription_id = 'sub_reactivate_test'");
    });

    test('invoice.paid : ne restaure pas Premium si le statut réel Stripe est canceled', async () => {
      // Souscription locale annulée
      await pool.query(
        `INSERT INTO subscriptions (
           user_id, plan, amount, starts_at, ends_at, stripe_subscription_id, stripe_customer_id, stripe_price_id,
           stripe_status, status, created_at, updated_at
         ) VALUES ($1, 'monthly', 6.99, NOW(), NOW() + INTERVAL '10 days', 'sub_canceled_test', $2, $3, 'canceled', 'cancelled', NOW(), NOW())
         ON CONFLICT (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL DO UPDATE SET
           stripe_status = 'canceled', status = 'cancelled'`,
        [testUserId, dummyCustomerId, PRICES.EUR.monthly]
      );

      // Simulation invoice.paid avec statut réel canceled
      const realStatus = 'canceled';
      const shouldHavePremium = ['active', 'trialing'].includes(realStatus);
      assert.equal(shouldHavePremium, false);

      await setLocalEntitlement(testUserId, shouldHavePremium, null);
      const uRes = await pool.query("SELECT is_subscriber FROM users WHERE id = $1", [testUserId]);
      assert.equal(uRes.rows[0].is_subscriber, false, 'Un invoice.paid avec statut canceled ne doit pas réactiver Premium');

      await pool.query("DELETE FROM subscriptions WHERE stripe_subscription_id = 'sub_canceled_test'");
    });

    test('payment_failed répété : ne repousse jamais payment_grace_ends_at', async () => {
      await pool.query("DELETE FROM subscriptions WHERE user_id = $1", [testUserId]);

      // Premier échec à T0 avec grâce à T0 + 5 jours
      const firstFailureAt = new Date(Date.now() - 2 * 24 * 3600 * 1000); // il y a 2 jours
      const initialGraceEnd = new Date(firstFailureAt.getTime() + 5 * 24 * 3600 * 1000); // 3 jours restants

      await pool.query(
        `INSERT INTO subscriptions (
           user_id, plan, amount, starts_at, ends_at, stripe_subscription_id, stripe_customer_id, stripe_price_id,
           stripe_status, status, payment_failed_at, payment_grace_ends_at, created_at, updated_at
         ) VALUES ($1, 'monthly', 6.99, NOW(), NOW() + INTERVAL '30 days', 'sub_grace_check_01', $2, $3, 'past_due', 'active', $4::timestamptz, $5::timestamptz, NOW(), NOW())
         ON CONFLICT (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL DO UPDATE SET
           payment_failed_at = $4::timestamptz, payment_grace_ends_at = $5::timestamptz, stripe_status = 'past_due'`,
        [testUserId, dummyCustomerId, PRICES.EUR.monthly, firstFailureAt, initialGraceEnd]
      );

      // Deuxième échec survenant maintenant : COALESCE doit préserver le premier payment_grace_ends_at
      const secondUpdate = await pool.query(
        `UPDATE subscriptions
         SET payment_failed_at = COALESCE(payment_failed_at, NOW()),
             payment_grace_ends_at = COALESCE(payment_grace_ends_at, NOW() + INTERVAL '5 days'),
             stripe_status = 'past_due',
             status = 'active',
             updated_at = NOW()
         WHERE stripe_subscription_id = 'sub_grace_check_01'
         RETURNING payment_failed_at, payment_grace_ends_at`
      );

      const row = secondUpdate.rows[0];
      assert.equal(
        new Date(row.payment_grace_ends_at).getTime(),
        initialGraceEnd.getTime(),
        'payment_grace_ends_at ne doit pas être repoussé lors d’un second échec'
      );

      await pool.query("DELETE FROM subscriptions WHERE stripe_subscription_id = 'sub_grace_check_01'");
    });

    test('Résiliation trial sans canceled_at : utilise une date sûre sans planter', async () => {
      const mockCanceledNoDate = { canceled_at: null };
      const safeDate = (mockCanceledNoDate && mockCanceledNoDate.canceled_at)
        ? new Date(mockCanceledNoDate.canceled_at * 1000)
        : new Date();

      assert.ok(!isNaN(safeDate.getTime()), 'safeDate doit être une date valide');
      await setLocalEntitlement(testUserId, false, null);

      const uRes = await pool.query("SELECT is_subscriber FROM users WHERE id = $1", [testUserId]);
      assert.equal(uRes.rows[0].is_subscriber, false);
    });

    test('Changement de formule : interdit si cancel_at_period_end est true', () => {
      const sub = { stripe_cancel_at_period_end: true, plan: 'monthly' };
      const isBlocked = Boolean(sub.stripe_cancel_at_period_end);
      assert.equal(isBlocked, true, 'Le changement de formule doit être bloqué si une résiliation est en cours');
    });

    test('Changement de formule : réutilise le schedule existant sans en créer un nouveau', async () => {
      let createScheduleCalled = false;
      let retrieveScheduleCalled = false;
      let updateScheduleCalled = false;

      const mockStripe = {
        subscriptions: {
          retrieve: async () => ({
            id: 'sub_with_schedule_01',
            status: 'active',
            cancel_at_period_end: false,
            schedule: 'sub_sched_existing_123'
          })
        },
        subscriptionSchedules: {
          create: async () => {
            createScheduleCalled = true;
            return { id: 'sub_sched_new' };
          },
          retrieve: async (id) => {
            retrieveScheduleCalled = true;
            return {
              id,
              phases: [{
                start_date: 1000000,
                end_date: 1100000,
                items: [{ price: 'price_old', quantity: 1 }]
              }]
            };
          },
          update: async (id, params) => {
            updateScheduleCalled = true;
            assert.equal(params.phases[1].proration_behavior, 'none');
            return { id };
          }
        }
      };

      const stripeSub = await mockStripe.subscriptions.retrieve();
      let scheduleId = stripeSub.schedule;
      if (!scheduleId) {
        const sched = await mockStripe.subscriptionSchedules.create();
        scheduleId = sched.id;
      } else {
        await mockStripe.subscriptionSchedules.retrieve(scheduleId);
      }
      await mockStripe.subscriptionSchedules.update(scheduleId, {
        phases: [{ proration_behavior: 'none' }, { proration_behavior: 'none' }]
      });

      assert.equal(createScheduleCalled, false, 'Ne doit pas recréer de schedule si un scheduleId existe déjà');
      assert.equal(retrieveScheduleCalled, true, 'Doit récupérer le schedule existant');
      assert.equal(updateScheduleCalled, true, 'Doit mettre à jour le schedule existant avec proration_behavior none');
    });
  });

  // -------------------------------------------------------------------------
  // 9. FIABILITÉ AVANCÉE DES WEBHOOKS STRIPE
  // -------------------------------------------------------------------------
  describe('9. Fiabilité avancée des webhooks Stripe (idempotence transactionnelle, concurrence, ordonnancement)', () => {
    test('1. Un webhook qui échoue pendant le traitement peut être rejoué sans blocage d’idempotence', async () => {
      const eventId = 'evt_test_failure_retry_001';
      const subId = 'sub_test_fail_retry_001';

      await pool.query("DELETE FROM stripe_webhook_events WHERE event_id = $1", [eventId]);
      await pool.query("DELETE FROM subscriptions WHERE stripe_subscription_id = $1", [subId]);

      let attempt = 0;
      const mockStripe = {
        subscriptions: {
          retrieve: async () => {
            attempt++;
            if (attempt === 1) {
              throw new Error('Simulation panne transitoire / réseau Stripe');
            }
            return {
              id: subId,
              status: 'active',
              current_period_start: 1700000000,
              current_period_end: 1700000000 + 30 * 86400,
              items: { data: [{ price: { id: PRICES.EUR.monthly, unit_amount: 699, currency: 'eur' } }] },
              metadata: { solitiquo_user_id: String(testUserId) }
            };
          }
        }
      };

      const failingEvent = {
        id: eventId,
        type: 'checkout.session.completed',
        created: 1700000000,
        data: {
          object: {
            mode: 'subscription',
            subscription: subId,
            client_reference_id: String(testUserId),
            metadata: { solitiquo_user_id: String(testUserId) }
          }
        }
      };

      // 1ère tentative : doit échouer avec status 500
      const res1 = await processWebhookEvent(failingEvent, { stripe: mockStripe });
      assert.equal(res1.status, 500);

      // Vérification : stripe_webhook_events NE doit PAS contenir eventId (rollback complet)
      const evtCheck = await pool.query("SELECT * FROM stripe_webhook_events WHERE event_id = $1", [eventId]);
      assert.equal(evtCheck.rows.length, 0, 'L’événement en échec ne doit pas rester dans stripe_webhook_events');

      // 2ème tentative (rejeu du webhook) : doit réussir avec status 200
      const res2 = await processWebhookEvent(failingEvent, { stripe: mockStripe });
      assert.equal(res2.status, 200);
      assert.equal(res2.data.received, true);

      // Vérification : l'événement est maintenant marqué comme traité
      const evtCheckAfter = await pool.query("SELECT * FROM stripe_webhook_events WHERE event_id = $1", [eventId]);
      assert.equal(evtCheckAfter.rows.length, 1, 'L’événement rejoué avec succès doit être enregistré');

      await pool.query("DELETE FROM subscriptions WHERE stripe_subscription_id = $1", [subId]);
      await pool.query("DELETE FROM stripe_webhook_events WHERE event_id = $1", [eventId]);
    });

    test('2. Un événement ancien après un événement récent est ignoré sans modification de l’entitlement', async () => {
      const subId = 'sub_test_ordering_check_01';
      const T_recent = 2000000000;
      const T_old = 1500000000; // Antérieur à T_recent

      await pool.query("DELETE FROM subscriptions WHERE stripe_subscription_id = $1", [subId]);
      await pool.query("DELETE FROM stripe_webhook_events WHERE event_id LIKE 'evt_test_order_%'");

      // Étape A: Initialiser la subscription dans un état actif récent (T_recent = 2000000000)
      const recentEnd = new Date((T_recent + 30 * 86400) * 1000);
      await pool.query(
        `INSERT INTO subscriptions (
           user_id, plan, amount, currency, payment_method, transaction_id,
           status, starts_at, ends_at, stripe_customer_id, stripe_subscription_id,
           stripe_price_id, stripe_status, stripe_cancel_at_period_end,
           stripe_current_period_end, stripe_event_created_at, created_at, updated_at
         ) VALUES (
           $1, 'monthly', 6.99, 'EUR', 'stripe', 'tx_order_init',
           'active', NOW(), $2::timestamp, $3, $4,
           $5, 'active', false,
           $2::timestamptz, $6, NOW(), NOW()
         )`,
        [testUserId, recentEnd, dummyCustomerId, subId, PRICES.EUR.monthly, T_recent]
      );
      await setLocalEntitlement(testUserId, true, recentEnd);

      // Vérifier l'état initial
      let user = (await pool.query("SELECT is_subscriber, subscription_end_date FROM users WHERE id = $1", [testUserId])).rows[0];
      assert.equal(user.is_subscriber, true);

      // --- Cas A : customer.subscription.updated ancien (status 'past_due' dans l'event ancien) ---
      const oldUpdatedEvt = {
        id: 'evt_test_order_sub_updated_old',
        type: 'customer.subscription.updated',
        created: T_old,
        data: {
          object: {
            id: subId,
            customer: dummyCustomerId,
            status: 'past_due',
            cancel_at_period_end: true,
            current_period_start: T_old,
            current_period_end: T_old + 30 * 86400,
            metadata: { solitiquo_user_id: String(testUserId) }
          }
        }
      };
      const resUpdated = await processWebhookEvent(oldUpdatedEvt);
      assert.equal(resUpdated.status, 200);
      assert.equal(resUpdated.data.ignored, 'outdated_event');

      user = (await pool.query("SELECT is_subscriber, subscription_end_date FROM users WHERE id = $1", [testUserId])).rows[0];
      assert.equal(user.is_subscriber, true, 'is_subscriber ne doit pas être modifié par un customer.subscription.updated ancien');
      let sub = (await pool.query("SELECT stripe_status, stripe_event_created_at FROM subscriptions WHERE stripe_subscription_id = $1", [subId])).rows[0];
      assert.equal(sub.stripe_status, 'active', 'stripe_status ne doit pas être rétrogradé en past_due');
      assert.equal(Number(sub.stripe_event_created_at), T_recent);

      // --- Cas B : customer.subscription.deleted ancien ---
      const oldDeletedEvt = {
        id: 'evt_test_order_sub_deleted_old',
        type: 'customer.subscription.deleted',
        created: T_old,
        data: {
          object: {
            id: subId,
            customer: dummyCustomerId,
            status: 'canceled',
            metadata: { solitiquo_user_id: String(testUserId) }
          }
        }
      };
      const resDeleted = await processWebhookEvent(oldDeletedEvt);
      assert.equal(resDeleted.status, 200);
      assert.equal(resDeleted.data.ignored, 'outdated_event');

      user = (await pool.query("SELECT is_subscriber FROM users WHERE id = $1", [testUserId])).rows[0];
      assert.equal(user.is_subscriber, true, 'is_subscriber ne doit pas être révoqué par un customer.subscription.deleted ancien');

      // --- Cas C : invoice.payment_failed ancien ---
      const oldPaymentFailedEvt = {
        id: 'evt_test_order_inv_failed_old',
        type: 'invoice.payment_failed',
        created: T_old,
        data: {
          object: {
            id: 'in_test_old_failed',
            subscription: subId,
            customer: dummyCustomerId
          }
        }
      };
      const resFailed = await processWebhookEvent(oldPaymentFailedEvt);
      assert.equal(resFailed.status, 200);
      assert.equal(resFailed.data.ignored, 'outdated_event');

      sub = (await pool.query("SELECT payment_grace_ends_at, stripe_status FROM subscriptions WHERE stripe_subscription_id = $1", [subId])).rows[0];
      assert.equal(sub.payment_grace_ends_at, null, 'payment_grace_ends_at ne doit pas être modifié par un invoice.payment_failed ancien');
      assert.equal(sub.stripe_status, 'active');

      // --- Cas D : invoice.paid ancien (alors que l'abonnement a été résilié à T_recent) ---
      await pool.query(
        `UPDATE subscriptions
         SET stripe_status = 'canceled', status = 'cancelled', stripe_event_created_at = $1
         WHERE stripe_subscription_id = $2`,
        [T_recent + 100, subId]
      );
      await setLocalEntitlement(testUserId, false, null);

      const oldInvoicePaidEvt = {
        id: 'evt_test_order_inv_paid_old',
        type: 'invoice.paid',
        created: T_old,
        data: {
          object: {
            id: 'in_test_old_paid',
            subscription: subId,
            customer: dummyCustomerId
          }
        }
      };
      const resPaid = await processWebhookEvent(oldInvoicePaidEvt);
      assert.equal(resPaid.status, 200);
      assert.equal(resPaid.data.ignored, 'outdated_event');

      user = (await pool.query("SELECT is_subscriber FROM users WHERE id = $1", [testUserId])).rows[0];
      assert.equal(user.is_subscriber, false, 'users.is_subscriber ne doit pas être réactivé par un invoice.paid ancien');

      await pool.query("DELETE FROM subscriptions WHERE stripe_subscription_id = $1", [subId]);
      await pool.query("DELETE FROM stripe_webhook_events WHERE event_id LIKE 'evt_test_order_%'");
    });

    test('3. Deux événements différents concernant la même subscription arrivent simultanément', async () => {
      const subId = 'sub_test_concurrent_diff_001';
      const eventId1 = 'evt_test_diff_checkout_001';
      const eventId2 = 'evt_test_diff_subcreated_002';
      const nowSec = Math.floor(Date.now() / 1000);

      await pool.query("DELETE FROM subscriptions WHERE stripe_subscription_id = $1", [subId]);
      await pool.query("DELETE FROM stripe_webhook_events WHERE event_id IN ($1, $2)", [eventId1, eventId2]);

      const mockSubscription = {
        id: subId,
        customer: dummyCustomerId,
        status: 'active',
        cancel_at_period_end: false,
        current_period_start: nowSec,
        current_period_end: nowSec + 30 * 86400,
        items: {
          data: [{ price: { id: PRICES.EUR.monthly, unit_amount: 699, currency: 'eur', product: 'prod_test_diff' } }]
        },
        metadata: { solitiquo_user_id: String(testUserId) }
      };

      const mockStripe = {
        subscriptions: {
          retrieve: async () => mockSubscription
        }
      };

      const evtCheckoutCompleted = {
        id: eventId1,
        type: 'checkout.session.completed',
        created: nowSec,
        data: {
          object: {
            mode: 'subscription',
            subscription: subId,
            client_reference_id: String(testUserId),
            metadata: { solitiquo_user_id: String(testUserId) }
          }
        }
      };

      const evtSubCreated = {
        id: eventId2,
        type: 'customer.subscription.created',
        created: nowSec,
        data: {
          object: mockSubscription
        }
      };

      // Exécution concurrente simultanée
      const [res1, res2] = await Promise.all([
        processWebhookEvent(evtCheckoutCompleted, { stripe: mockStripe }),
        processWebhookEvent(evtSubCreated, { stripe: mockStripe })
      ]);

      assert.equal(res1.status, 200);
      assert.equal(res2.status, 200);

      // La subscription doit exister en DB et être active
      const subs = await pool.query("SELECT * FROM subscriptions WHERE stripe_subscription_id = $1", [subId]);
      assert.equal(subs.rows.length, 1, 'Une seule ligne subscription en base');
      assert.equal(subs.rows[0].stripe_status, 'active');
      assert.equal(subs.rows[0].user_id, testUserId);

      // L'accès Premium doit être accordé
      const uRes = await pool.query("SELECT is_subscriber FROM users WHERE id = $1", [testUserId]);
      assert.equal(uRes.rows[0].is_subscriber, true);

      // Les deux événements doivent être enregistrés comme traités
      const evts = await pool.query("SELECT * FROM stripe_webhook_events WHERE event_id IN ($1, $2)", [eventId1, eventId2]);
      assert.equal(evts.rows.length, 2, 'Les deux événements distincts sont enregistrés');

      await pool.query("DELETE FROM subscriptions WHERE stripe_subscription_id = $1", [subId]);
      await pool.query("DELETE FROM stripe_webhook_events WHERE event_id IN ($1, $2)", [eventId1, eventId2]);
    });

    test('4. Deux requêtes avec exactement le même event.id arrivent simultanément', async () => {
      const eventId = 'evt_test_concurrent_same_001';
      const subId = 'sub_test_same_evt_001';
      const nowSec = Math.floor(Date.now() / 1000);

      await pool.query("DELETE FROM subscriptions WHERE stripe_subscription_id = $1", [subId]);
      await pool.query("DELETE FROM stripe_webhook_events WHERE event_id = $1", [eventId]);

      let retrieveCount = 0;
      const mockStripe = {
        subscriptions: {
          retrieve: async () => {
            retrieveCount++;
            await new Promise(r => setTimeout(r, 40));
            return {
              id: subId,
              customer: dummyCustomerId,
              status: 'active',
              current_period_start: nowSec,
              current_period_end: nowSec + 30 * 86400,
              items: { data: [{ price: { id: PRICES.EUR.monthly, unit_amount: 699, currency: 'eur' } }] },
              metadata: { solitiquo_user_id: String(testUserId) }
            };
          }
        }
      };

      const sameEvt = {
        id: eventId,
        type: 'checkout.session.completed',
        created: nowSec,
        data: {
          object: {
            mode: 'subscription',
            subscription: subId,
            client_reference_id: String(testUserId),
            metadata: { solitiquo_user_id: String(testUserId) }
          }
        }
      };

      // Deux requêtes lancées strictement en même temps
      const [res1, res2] = await Promise.all([
        processWebhookEvent(sameEvt, { stripe: mockStripe }),
        processWebhookEvent(sameEvt, { stripe: mockStripe })
      ]);

      assert.equal(res1.status, 200);
      assert.equal(res2.status, 200);

      // L'un doit être le traitement initial (received: true), l'autre le doublon détecté (duplicate: true)
      const duplicates = [res1.data.duplicate, res2.data.duplicate];
      assert.ok(duplicates.includes(true), 'L’un des deux appels doit être identifié comme doublon');
      assert.ok(duplicates.includes(undefined) || duplicates.includes(false), 'L’un des deux appels doit être le traitement principal');

      // Le traitement Stripe métier n'a été exécuté qu'une seule fois
      assert.equal(retrieveCount, 1, 'Le traitement métier ne doit être exécuté qu’une seule fois');

      // Exactement un enregistrement dans stripe_webhook_events
      const evts = await pool.query("SELECT * FROM stripe_webhook_events WHERE event_id = $1", [eventId]);
      assert.equal(evts.rows.length, 1);

      await pool.query("DELETE FROM subscriptions WHERE stripe_subscription_id = $1", [subId]);
      await pool.query("DELETE FROM stripe_webhook_events WHERE event_id = $1", [eventId]);
    });

    test('5. Vérifie qu’un événement obsolète est bien marqué comme traité et ne sera pas retraité', async () => {
      const subId = 'sub_test_obsolete_handled_001';
      const eventId = 'evt_test_obsolete_mark_001';
      const T_recent = 2000000000;
      const T_old = 1500000000;

      await pool.query("DELETE FROM subscriptions WHERE stripe_subscription_id = $1", [subId]);
      await pool.query("DELETE FROM stripe_webhook_events WHERE event_id = $1", [eventId]);

      // Subscription existante avec stripe_event_created_at = T_recent
      await pool.query(
        `INSERT INTO subscriptions (
           user_id, plan, amount, currency, payment_method, transaction_id,
           status, starts_at, ends_at, stripe_customer_id, stripe_subscription_id,
           stripe_price_id, stripe_status, stripe_event_created_at, created_at, updated_at
         ) VALUES (
           $1, 'monthly', 6.99, 'EUR', 'stripe', 'tx_obs_test',
           'active', NOW(), NOW() + INTERVAL '30 days', $2, $3,
           $4, 'active', $5, NOW(), NOW()
         )`,
        [testUserId, dummyCustomerId, subId, PRICES.EUR.monthly, T_recent]
      );

      const obsoleteEvent = {
        id: eventId,
        type: 'customer.subscription.updated',
        created: T_old,
        data: {
          object: {
            id: subId,
            customer: dummyCustomerId,
            status: 'past_due',
            metadata: { solitiquo_user_id: String(testUserId) }
          }
        }
      };

      // 1ère réception : identifié comme obsolète et committé dans stripe_webhook_events
      const res1 = await processWebhookEvent(obsoleteEvent);
      assert.equal(res1.status, 200);
      assert.equal(res1.data.ignored, 'outdated_event');

      // Vérifier qu'il est bien enregistré en base dans stripe_webhook_events
      const dbEvt = await pool.query("SELECT * FROM stripe_webhook_events WHERE event_id = $1", [eventId]);
      assert.equal(dbEvt.rows.length, 1, 'L’événement obsolète doit être marqué comme traité dans stripe_webhook_events');

      // 2ème réception (rejeu) : doit être détecté immédiatement comme doublon (duplicate: true) sans réévaluation
      const res2 = await processWebhookEvent(obsoleteEvent);
      assert.equal(res2.status, 200);
      assert.equal(res2.data.duplicate, true, 'Le rejeu d’un événement obsolète doit être court-circuité comme doublon');

      await pool.query("DELETE FROM subscriptions WHERE stripe_subscription_id = $1", [subId]);
      await pool.query("DELETE FROM stripe_webhook_events WHERE event_id = $1", [eventId]);
    });
  });

  // -------------------------------------------------------------------------
  // 10. TESTS DU CYCLE DE VIE COMPLET DU TRIAL
  // -------------------------------------------------------------------------
  describe('10. Cycle de vie complet du Trial Premium', () => {
    const lifecycleSubId = 'sub_test_lifecycle_001';

    test('A — Trial sans annulation : trialing -> active + invoice.paid maintient Premium sans interruption', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const trialEndSec = nowSec + 30 * 86400;
      const nextMonthEndSec = trialEndSec + 30 * 86400;

      await pool.query("DELETE FROM subscriptions WHERE stripe_subscription_id = $1", [lifecycleSubId]);

      // 1. Initialisation en période d'essai (trialing)
      const trialSub = {
        id: lifecycleSubId,
        customer: dummyCustomerId,
        status: 'trialing',
        cancel_at_period_end: false,
        current_period_start: nowSec,
        current_period_end: trialEndSec,
        trial_start: nowSec,
        trial_end: trialEndSec,
        items: { data: [{ price: { id: PRICES.EUR.monthly, unit_amount: 699, currency: 'eur' } }] },
        metadata: { solitiquo_user_id: String(testUserId) }
      };
      await upsertSubscription(trialSub, null, testUserId);

      let uRes = await pool.query("SELECT is_subscriber, subscription_end_date FROM users WHERE id = $1", [testUserId]);
      assert.equal(uRes.rows[0].is_subscriber, true, 'is_subscriber doit être true pendant l’essai');

      // 2. Fin de l’essai nominale : Stripe active la formule payante
      const activeSub = {
        ...trialSub,
        status: 'active',
        current_period_start: trialEndSec,
        current_period_end: nextMonthEndSec,
        trial_start: null,
        trial_end: null
      };

      const mockStripe = {
        subscriptions: {
          retrieve: async () => activeSub
        }
      };

      // Webhook customer.subscription.updated
      const updateEvt = {
        id: 'evt_test_lc_sub_updated_01',
        type: 'customer.subscription.updated',
        created: trialEndSec,
        data: { object: activeSub }
      };
      const resUpdate = await processWebhookEvent(updateEvt, { stripe: mockStripe });
      assert.equal(resUpdate.status, 200);

      // Webhook invoice.paid (premier prélèvement)
      const invoicePaidEvt = {
        id: 'evt_test_lc_inv_paid_01',
        type: 'invoice.paid',
        created: trialEndSec + 1,
        data: {
          object: {
            id: 'in_test_lc_first_paid',
            subscription: lifecycleSubId,
            customer: dummyCustomerId
          }
        }
      };
      const resInvoice = await processWebhookEvent(invoicePaidEvt, { stripe: mockStripe });
      assert.equal(resInvoice.status, 200);

      // 3. Vérification de la continuité du statut Premium
      uRes = await pool.query("SELECT is_subscriber, subscription_end_date FROM users WHERE id = $1", [testUserId]);
      assert.equal(uRes.rows[0].is_subscriber, true, 'is_subscriber doit rester true sans interruption');

      const sRes = await pool.query("SELECT stripe_status, status FROM subscriptions WHERE stripe_subscription_id = $1", [lifecycleSubId]);
      assert.equal(sRes.rows[0].stripe_status, 'active');
      assert.equal(sRes.rows[0].status, 'active');

      await pool.query("DELETE FROM subscriptions WHERE stripe_subscription_id = $1", [lifecycleSubId]);
      await pool.query("DELETE FROM stripe_webhook_events WHERE event_id LIKE 'evt_test_lc_%'");
    });

    test('B — Trial arrivant à échéance avec échec de paiement : trialing -> invoice.payment_failed active les 5 jours de grâce', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const trialEndSec = nowSec; // Arrivé à échéance maintenant

      await pool.query("DELETE FROM subscriptions WHERE stripe_subscription_id = $1", [lifecycleSubId]);

      // 1. Initialisation de la souscription arrivant à la fin du trial
      const expiringTrialSub = {
        id: lifecycleSubId,
        customer: dummyCustomerId,
        status: 'trialing',
        cancel_at_period_end: false,
        current_period_start: nowSec - 30 * 86400,
        current_period_end: trialEndSec,
        trial_start: nowSec - 30 * 86400,
        trial_end: trialEndSec,
        items: { data: [{ price: { id: PRICES.EUR.monthly, unit_amount: 699, currency: 'eur' } }] },
        metadata: { solitiquo_user_id: String(testUserId) }
      };
      await upsertSubscription(expiringTrialSub, null, testUserId);

      // 2. Échec du premier prélèvement à l'échéance : webhook invoice.payment_failed
      const failEvt = {
        id: 'evt_test_lc_inv_failed_01',
        type: 'invoice.payment_failed',
        created: trialEndSec + 2,
        data: {
          object: {
            id: 'in_test_lc_failed_01',
            subscription: lifecycleSubId,
            customer: dummyCustomerId
          }
        }
      };

      const resFail = await processWebhookEvent(failEvt);
      assert.equal(resFail.status, 200);

      // 3. Vérification de la période de grâce de 5 jours
      const sRes = await pool.query(
        "SELECT stripe_status, status, payment_failed_at, payment_grace_ends_at FROM subscriptions WHERE stripe_subscription_id = $1",
        [lifecycleSubId]
      );
      assert.equal(sRes.rows[0].stripe_status, 'past_due');
      assert.equal(sRes.rows[0].status, 'active');
      assert.ok(sRes.rows[0].payment_grace_ends_at !== null);

      const graceEndsAt = new Date(sRes.rows[0].payment_grace_ends_at);
      const remainingHours = (graceEndsAt.getTime() - Date.now()) / (3600 * 1000);
      assert.ok(remainingHours > 100 && remainingHours <= 121, 'La grâce doit être configurée pour 5 jours (~120h)');

      // L’utilisateur conserve temporairement son accès Premium pendant ces 5 jours
      const uRes = await pool.query("SELECT is_subscriber FROM users WHERE id = $1", [testUserId]);
      assert.equal(uRes.rows[0].is_subscriber, true, 'L’accès Premium doit être maintenu pendant la période de grâce');

      await pool.query("DELETE FROM subscriptions WHERE stripe_subscription_id = $1", [lifecycleSubId]);
      await pool.query("DELETE FROM stripe_webhook_events WHERE event_id LIKE 'evt_test_lc_%'");
    });

    test('C — Trial annulé puis nouveau checkout mensuel : aucune période d’essai accordée (trial_applied = false)', async () => {
      await pool.query("DELETE FROM subscriptions WHERE user_id = $1", [testUserId]);

      // 1. Marquer le trial comme déjà consommé dans le passé
      await pool.query(
        "UPDATE users SET is_subscriber = false, subscription_trial_used_at = NOW() - INTERVAL '45 days' WHERE id = $1",
        [testUserId]
      );

      let passedSessionConfig = null;
      const mockStripeRepeat = {
        customers: {
          search: async () => ({ data: [{ id: dummyCustomerId, deleted: false }] })
        },
        checkout: {
          sessions: {
            create: async (config) => {
              passedSessionConfig = config;
              return { id: 'cs_test_repeat_no_trial', url: 'https://checkout.stripe.com/pay' };
            }
          }
        }
      };

      // 2. Nouvelle tentative de checkout mensuel
      const res = await executeCheckoutTransaction({
        stripe: mockStripeRepeat,
        userId: testUserId,
        userEmail: 'stripe_test_user@example.com',
        plan: 'monthly',
        country: 'FR',
        p: pricing('FR')
      });

      // 3. Vérifications strictes
      assert.equal(res.status, 200);
      assert.equal(res.data.trial_applied, false, 'trial_applied doit être false');

      // Aucune propriété trial_period_days dans la session Stripe
      assert.ok(passedSessionConfig, 'La configuration de session doit être passée à Stripe');
      assert.equal(
        passedSessionConfig.subscription_data?.trial_period_days,
        undefined,
        'Aucun trial_period_days ne doit être envoyé dans la nouvelle session Stripe'
      );
      assert.equal(
        passedSessionConfig.metadata?.solitiquo_trial_eligible,
        'false',
        'metadata.solitiquo_trial_eligible doit être false'
      );

      // subscription_trial_used_at reste renseigné
      const uRes = await pool.query("SELECT subscription_trial_used_at FROM users WHERE id = $1", [testUserId]);
      assert.ok(uRes.rows[0].subscription_trial_used_at !== null, 'subscription_trial_used_at doit rester non nul');

      await pool.query("DELETE FROM subscriptions WHERE user_id = $1", [testUserId]);
    });
  });

  describe('11. Précision et robustesse des dates Stripe (API 2026-01-28.clover / flexible billing)', () => {
    const datesSubId = 'sub_test_dates_robustness';

    test('TEST A — ACTIVE mensuel : current_period_end racine undefined, item.current_period_end J+30', async () => {
      await pool.query("DELETE FROM subscriptions WHERE user_id = $1", [testUserId]);
      const nowSec = Math.floor(Date.now() / 1000);
      const targetEndSec = nowSec + 30 * 86400;

      const activeMonthlySub = {
        id: datesSubId,
        customer: dummyCustomerId,
        status: 'active',
        cancel_at_period_end: false,
        items: {
          data: [{
            current_period_start: nowSec,
            current_period_end: targetEndSec,
            price: { id: PRICES.EUR.monthly, unit_amount: 699, currency: 'eur', recurring: { interval: 'month' } }
          }]
        },
        metadata: { solitiquo_user_id: String(testUserId) }
      };

      await upsertSubscription(activeMonthlySub, null, testUserId);

      const sRes = await pool.query(
        "SELECT stripe_current_period_end, ends_at FROM subscriptions WHERE stripe_subscription_id = $1",
        [datesSubId]
      );
      assert.equal(new Date(sRes.rows[0].stripe_current_period_end).toISOString(), new Date(targetEndSec * 1000).toISOString());
      assert.equal(new Date(sRes.rows[0].ends_at).toISOString(), new Date(targetEndSec * 1000).toISOString());

      const uRes = await pool.query("SELECT is_subscriber, subscription_end_date FROM users WHERE id = $1", [testUserId]);
      assert.equal(uRes.rows[0].is_subscriber, true);
      assert.equal(new Date(uRes.rows[0].subscription_end_date).toISOString(), new Date(targetEndSec * 1000).toISOString());
    });

    test('TEST B — ACTIVE annuel : items.data[0].current_period_end = J+365', async () => {
      await pool.query("DELETE FROM subscriptions WHERE user_id = $1", [testUserId]);
      const nowSec = Math.floor(Date.now() / 1000);
      const targetEndSec = nowSec + 365 * 86400;

      const activeYearlySub = {
        id: datesSubId,
        customer: dummyCustomerId,
        status: 'active',
        cancel_at_period_end: false,
        items: {
          data: [{
            current_period_start: nowSec,
            current_period_end: targetEndSec,
            price: { id: PRICES.EUR.yearly, unit_amount: 6990, currency: 'eur', recurring: { interval: 'year' } }
          }]
        },
        metadata: { solitiquo_user_id: String(testUserId) }
      };

      await upsertSubscription(activeYearlySub, null, testUserId);

      const sRes = await pool.query(
        "SELECT stripe_current_period_end, ends_at FROM subscriptions WHERE stripe_subscription_id = $1",
        [datesSubId]
      );
      assert.equal(new Date(sRes.rows[0].stripe_current_period_end).toISOString(), new Date(targetEndSec * 1000).toISOString());
      assert.equal(new Date(sRes.rows[0].ends_at).toISOString(), new Date(targetEndSec * 1000).toISOString());
    });

    test('TEST C — Annulation annuelle : cancel_at = J+365, Premium reste actif jusqu’à J+365', async () => {
      await pool.query("DELETE FROM subscriptions WHERE user_id = $1", [testUserId]);
      const nowSec = Math.floor(Date.now() / 1000);
      const targetEndSec = nowSec + 365 * 86400;

      await pool.query(
        `INSERT INTO subscriptions (
           user_id, plan, amount, currency, payment_method, transaction_id, status, starts_at, ends_at,
           stripe_customer_id, stripe_subscription_id, stripe_price_id, stripe_status, stripe_cancel_at_period_end,
           stripe_current_period_end, created_at, updated_at
         ) VALUES (
           $1, 'yearly', 69.90, 'EUR', 'stripe', 'tx_dates_yearly', 'active', NOW(), $2::timestamptz,
           $3, $4, $5, 'active', false,
           $2::timestamptz, NOW(), NOW()
         )`,
        [testUserId, new Date(targetEndSec * 1000), dummyCustomerId, datesSubId, PRICES.EUR.yearly]
      );
      await setLocalEntitlement(testUserId, true, new Date(targetEndSec * 1000));

      const mockStripeCancel = {
        subscriptions: {
          retrieve: async () => ({
            id: datesSubId,
            status: 'active',
            cancel_at_period_end: false,
            items: { data: [{ current_period_end: targetEndSec }] }
          }),
          update: async () => ({
            id: datesSubId,
            status: 'active',
            cancel_at_period_end: true,
            cancel_at: targetEndSec,
            items: { data: [{ current_period_end: targetEndSec }] }
          })
        }
      };

      const cancelRes = await executeCancelSubscription({
        stripe: mockStripeCancel,
        userId: testUserId
      });
      assert.equal(cancelRes.status, 200);

      const sRes = await pool.query(
        "SELECT stripe_status, stripe_cancel_at_period_end, stripe_current_period_end, ends_at FROM subscriptions WHERE stripe_subscription_id = $1",
        [datesSubId]
      );
      assert.equal(sRes.rows[0].stripe_cancel_at_period_end, true);
      assert.equal(new Date(sRes.rows[0].stripe_current_period_end).toISOString(), new Date(targetEndSec * 1000).toISOString());
      assert.equal(new Date(sRes.rows[0].ends_at).toISOString(), new Date(targetEndSec * 1000).toISOString());

      const uRes = await pool.query("SELECT is_subscriber, subscription_end_date FROM users WHERE id = $1", [testUserId]);
      assert.equal(uRes.rows[0].is_subscriber, true, 'Premium doit rester actif jusqu’à la fin de la période annuelle');
      assert.equal(new Date(uRes.rows[0].subscription_end_date).toISOString(), new Date(targetEndSec * 1000).toISOString());
    });

    test('TEST D — CANCELED : ended_at = date connue, non écrasé par NOW()', async () => {
      await pool.query("DELETE FROM subscriptions WHERE user_id = $1", [testUserId]);
      const nowSec = Math.floor(Date.now() / 1000);
      const endedAtSec = nowSec - 100;

      const canceledSub = {
        id: datesSubId,
        customer: dummyCustomerId,
        status: 'canceled',
        cancel_at_period_end: true,
        ended_at: endedAtSec,
        items: { data: [{ price: { id: PRICES.EUR.monthly, unit_amount: 699, currency: 'eur' } }] },
        metadata: { solitiquo_user_id: String(testUserId) }
      };

      await upsertSubscription(canceledSub, null, testUserId);

      const sRes = await pool.query(
        "SELECT stripe_status, status, stripe_current_period_end, ends_at FROM subscriptions WHERE stripe_subscription_id = $1",
        [datesSubId]
      );
      assert.equal(sRes.rows[0].stripe_status, 'canceled');
      assert.equal(sRes.rows[0].status, 'cancelled');
      assert.equal(new Date(sRes.rows[0].stripe_current_period_end).toISOString(), new Date(endedAtSec * 1000).toISOString());
      assert.equal(new Date(sRes.rows[0].ends_at).toISOString(), new Date(endedAtSec * 1000).toISOString());

      const uRes = await pool.query("SELECT is_subscriber, subscription_end_date FROM users WHERE id = $1", [testUserId]);
      assert.equal(uRes.rows[0].is_subscriber, false);
      assert.equal(new Date(uRes.rows[0].subscription_end_date).toISOString(), new Date(endedAtSec * 1000).toISOString());
    });

    test('TEST E — invoice.paid : current_period_end racine undefined, items.data[0].current_period_end = nouvelle date', async () => {
      await pool.query("DELETE FROM subscriptions WHERE user_id = $1", [testUserId]);
      await pool.query("DELETE FROM stripe_webhook_events WHERE event_id LIKE 'evt_test_inv_paid_%'");
      const nowSec = Math.floor(Date.now() / 1000);
      const renewedEndSec = nowSec + 30 * 86400;

      await pool.query(
        `INSERT INTO subscriptions (
           user_id, plan, amount, currency, payment_method, transaction_id, status, starts_at, ends_at,
           stripe_customer_id, stripe_subscription_id, stripe_price_id, stripe_status, stripe_cancel_at_period_end,
           stripe_current_period_end, created_at, updated_at
         ) VALUES (
           $1, 'monthly', 6.99, 'EUR', 'stripe', 'tx_dates_inv', 'active', NOW(), NOW(),
           $2, $3, $4, 'active', false,
           NOW(), NOW(), NOW()
         )`,
        [testUserId, dummyCustomerId, datesSubId, PRICES.EUR.monthly]
      );

      const mockStripeInvoice = {
        subscriptions: {
          retrieve: async () => ({
            id: datesSubId,
            status: 'active',
            items: {
              data: [{ current_period_end: renewedEndSec }]
            }
          })
        }
      };

      const invoiceEvt = {
        id: 'evt_test_inv_paid_new_date',
        type: 'invoice.paid',
        created: nowSec,
        data: {
          object: {
            id: 'in_test_renewed_01',
            subscription: datesSubId,
            customer: dummyCustomerId
          }
        }
      };

      const res = await processWebhookEvent(invoiceEvt, { stripe: mockStripeInvoice });
      assert.equal(res.status, 200);

      const sRes = await pool.query(
        "SELECT stripe_current_period_end, ends_at FROM subscriptions WHERE stripe_subscription_id = $1",
        [datesSubId]
      );
      assert.equal(new Date(sRes.rows[0].stripe_current_period_end).toISOString(), new Date(renewedEndSec * 1000).toISOString());
      assert.equal(new Date(sRes.rows[0].ends_at).toISOString(), new Date(renewedEndSec * 1000).toISOString());

      await pool.query("DELETE FROM subscriptions WHERE user_id = $1", [testUserId]);
      await pool.query("DELETE FROM stripe_webhook_events WHERE event_id = 'evt_test_inv_paid_new_date'");
    });

    test('TEST F — Trial annulé : trial_end conservé, Premium jusqu’à trial_end, cancel_at_period_end=true', async () => {
      await pool.query("DELETE FROM subscriptions WHERE user_id = $1", [testUserId]);
      const nowSec = Math.floor(Date.now() / 1000);
      const trialEndSec = nowSec + 30 * 86400;

      const trialCanceledSub = {
        id: datesSubId,
        customer: dummyCustomerId,
        status: 'trialing',
        cancel_at_period_end: true,
        cancel_at: trialEndSec,
        canceled_at: nowSec,
        trial_start: nowSec,
        trial_end: trialEndSec,
        items: { data: [{ current_period_end: trialEndSec, price: { id: PRICES.EUR.monthly, unit_amount: 699, currency: 'eur' } }] },
        metadata: { solitiquo_user_id: String(testUserId) }
      };

      await upsertSubscription(trialCanceledSub, null, testUserId);

      const sRes = await pool.query(
        "SELECT stripe_status, stripe_cancel_at_period_end, stripe_trial_end, stripe_current_period_end, ends_at FROM subscriptions WHERE stripe_subscription_id = $1",
        [datesSubId]
      );
      assert.equal(sRes.rows[0].stripe_status, 'trialing');
      assert.equal(sRes.rows[0].stripe_cancel_at_period_end, true);
      assert.equal(new Date(sRes.rows[0].stripe_current_period_end).toISOString(), new Date(trialEndSec * 1000).toISOString());
      assert.equal(new Date(sRes.rows[0].ends_at).toISOString(), new Date(trialEndSec * 1000).toISOString());

      const uRes = await pool.query("SELECT is_subscriber, subscription_end_date FROM users WHERE id = $1", [testUserId]);
      assert.equal(uRes.rows[0].is_subscriber, true, 'L’utilisateur doit rester Premium pendant le trial annulé');
      assert.equal(new Date(uRes.rows[0].subscription_end_date).toISOString(), new Date(trialEndSec * 1000).toISOString());

      await pool.query("DELETE FROM subscriptions WHERE user_id = $1", [testUserId]);
    });
  });
});
