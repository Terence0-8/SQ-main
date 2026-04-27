// backend/routes/subscriptions.js
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { isAuthenticated } = require('../middleware/auth');
const { verifyCsrf } = require('../middleware/csrf');
const axios = require('axios');
const crypto = require('crypto');

// ==========================================
// GEO-PRICING CONFIGURATION
// ==========================================
const EU_COUNTRIES = [
  'AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI',
  'FR','GR','HR','HU','IE','IT','LT','LU','LV','MT',
  'NL','PL','PT','RO','SE','SI','SK'
];

const CURRENCY_PRICING = {
  'XOF': { symbol: 'FCFA', amount: 3000,  stripe_cents: null, provider: 'flutterwave' },
  'XAF': { symbol: 'FCFA', amount: 3000,  stripe_cents: null, provider: 'flutterwave' },
  'EUR': { symbol: '€',    amount: 6.99,  stripe_cents: 699,  provider: 'stripe'      },
  'GBP': { symbol: '£',    amount: 6.99,  stripe_cents: 699,  provider: 'stripe'      },
  'USD': { symbol: '$',    amount: 7.99,  stripe_cents: 799,  provider: 'stripe'      },
  'CAD': { symbol: 'CA$',  amount: 9.99,  stripe_cents: 999,  provider: 'stripe'      },
};

function getPricingForCountry(countryCode) {
  if (['CM', 'BJ', 'TG', 'SN', 'CI'].includes(countryCode))
    return { country: countryCode, currency: 'XOF', ...CURRENCY_PRICING['XOF'] };
  if (EU_COUNTRIES.includes(countryCode))
    return { country: countryCode, currency: 'EUR', ...CURRENCY_PRICING['EUR'] };
  if (countryCode === 'GB')
    return { country: 'GB', currency: 'GBP', ...CURRENCY_PRICING['GBP'] };
  if (countryCode === 'CA')
    return { country: 'CA', currency: 'CAD', ...CURRENCY_PRICING['CAD'] };
  return { country: countryCode || 'US', currency: 'USD', ...CURRENCY_PRICING['USD'] };
}

function getCountryFromReq(req) {
  if (process.env.NODE_ENV !== 'production' && req.query.testCountry) {
    return req.query.testCountry.toUpperCase();
  }
  try {
    const geoip = require('geoip-lite');
    const rawIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || req.socket?.remoteAddress || req.ip || '127.0.0.1';
    const isLocalhost = rawIp === '::1' || rawIp === '127.0.0.1' || rawIp.startsWith('::ffff:127.');
    if (!isLocalhost) {
      const geo = geoip.lookup(rawIp.replace('::ffff:', ''));
      if (geo?.country) return geo.country;
    }
  } catch (e) { /* geoip indisponible */ }
  return null;
}

// ==========================================
// PLAN CONFIG
// ==========================================
const PLAN_CONFIG = {
  'monthly': {
    interval: '1 month',
    description: 'Abonnement Mensuel Solitiquo'
  },
  'yearly': {
    interval: '1 year',
    description: 'Abonnement Annuel Solitiquo',
    xof_amount: 30000
  }
};

function validatePlan(plan) {
  return PLAN_CONFIG[plan] || null;
}

const BASE_URL = process.env.NODE_ENV === 'production'
  ? 'https://solitiquo.com'
  : 'http://localhost:5000';

// ==========================================
// FLUTTERWAVE HELPERS
// ==========================================

/**
 * Vérifie que les clés Flutterwave sont bien configurées dans .env
 */
function isFlutterwaveConfigured() {
  return (
    process.env.FLUTTERWAVE_SECRET_KEY &&
    !process.env.FLUTTERWAVE_SECRET_KEY.startsWith('FLWSECK_TEST-REMPLACER') &&
    process.env.FLUTTERWAVE_PUBLIC_KEY &&
    !process.env.FLUTTERWAVE_PUBLIC_KEY.startsWith('FLWPUBK_TEST-REMPLACER')
  );
}

/**
 * Vérifie la signature du webhook Flutterwave
 * Flutterwave envoie le header "verif-hash" contenant le hash secret configuré
 * dans le dashboard Flutterwave (champ "Secret Hash")
 */
function verifyFlutterwaveWebhook(req) {
  const secretHash = process.env.FLUTTERWAVE_WEBHOOK_SECRET;
  if (!secretHash) return true; // En dev sans secret configuré, on laisse passer
  const signature = req.headers['verif-hash'];
  return signature === secretHash;
}

// ==========================================
// 0. GEO PRICING ENDPOINT
// GET /api/subscriptions/pricing
// ==========================================
router.get('/pricing', async (req, res) => {
  try {
    const country = getCountryFromReq(req);
    const pricing = getPricingForCountry(country);
    const response = { success: true, ...pricing };

    // Exposer la clé publique Stripe côté front (clé publique = safe)
    if (pricing.provider === 'stripe' && process.env.STRIPE_PUBLISHABLE_KEY &&
        !process.env.STRIPE_PUBLISHABLE_KEY.startsWith('pk_test_REMPLACER')) {
      response.publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
    }

    // Exposer la clé publique Flutterwave côté front (clé publique = safe)
    if (pricing.provider === 'flutterwave' && process.env.FLUTTERWAVE_PUBLIC_KEY &&
        !process.env.FLUTTERWAVE_PUBLIC_KEY.startsWith('FLWPUBK_TEST-REMPLACER')) {
      response.publishableKey = process.env.FLUTTERWAVE_PUBLIC_KEY;
    }

    res.json(response);
  } catch (err) {
    console.error('❌ Erreur pricing:', err);
    res.json({ success: true, ...getPricingForCountry(null) });
  }
});

// ==========================================
// 1. INIT PAIEMENT — Flutterwave (XOF/XAF)
// POST /api/subscriptions/init-payment
// Retourne un payment_link vers la page de paiement Flutterwave
// Compatible Orange Money, MTN MoMo, Visa (Cameroun + UEMOA)
// ==========================================
router.post('/init-payment', isAuthenticated, verifyCsrf, async (req, res) => {
  try {
    if (!isFlutterwaveConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Flutterwave non configuré — ajoutez FLUTTERWAVE_SECRET_KEY et FLUTTERWAVE_PUBLIC_KEY dans .env'
      });
    }

    const userId = req.session.user.id;
    const { plan } = req.body;

    const planConfig = validatePlan(plan);
    if (!planConfig) {
      return res.status(400).json({ success: false, error: 'Plan invalide' });
    }

    // Vérifier abonnement actif existant
    const activeCheck = await pool.query(
      "SELECT id FROM subscriptions WHERE user_id = $1 AND status = 'active' AND ends_at > NOW()",
      [userId]
    );
    if (activeCheck.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'Vous avez déjà un abonnement actif' });
    }

    // Détecter le pays pour choisir la devise (XOF ou XAF)
    const country = getCountryFromReq(req);
    const pricing = getPricingForCountry(country);
    const currency = pricing.currency; // 'XOF' pour Cameroun/UEMOA

    const amount = plan === 'yearly'
      ? PLAN_CONFIG['yearly'].xof_amount
      : CURRENCY_PRICING[currency].amount;

    const transactionId = `FLW-${Date.now()}-${userId}`;

    // Appel API Flutterwave — Standard Payment (hosted page)
    // Docs: https://developer.flutterwave.com/reference/endpoints/collect-payments
    const flwPayload = {
      tx_ref: transactionId,
      amount: amount,
      currency: currency,
      redirect_url: `${BASE_URL}/paiement-success.html?transaction_id=${transactionId}&provider=flutterwave`,
      meta: {
        user_id: userId.toString(),
        plan: plan
      },
      customer: {
        email: req.session.user.email || 'client@solitiquo.com',
        name: req.session.user.username || 'Client Solitiquo',
      },
      customizations: {
        title: 'Solitiquo',
        description: planConfig.description,
        logo: `${BASE_URL}/assets/logo.png`
      },
      payment_options: 'mobilemoneyfranco,card', // Orange Money + MTN MoMo + Visa
    };

    const flwResponse = await axios.post(
      'https://api.flutterwave.com/v3/payments',
      flwPayload,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (flwResponse.data.status !== 'success') {
      console.error('❌ Flutterwave API error:', flwResponse.data.message);
      return res.status(500).json({ success: false, error: 'Erreur initialisation paiement Flutterwave' });
    }

    const paymentLink = flwResponse.data.data.link;

    // Enregistrer en BDD
    await pool.query(
      `INSERT INTO subscriptions (user_id, plan, amount, currency, transaction_id, status, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', NOW(), NOW())`,
      [userId, plan, amount, currency, transactionId]
    );

    console.log(`✅ Flutterwave payment link créé — tx: ${transactionId}`);
    res.json({ success: true, payment_url: paymentLink });

  } catch (err) {
    console.error('❌ Erreur init-payment Flutterwave:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: 'Erreur initialisation paiement' });
  }
});

// ==========================================
// 2. CONFIRM FLUTTERWAVE (retour depuis redirect_url)
// GET /api/subscriptions/confirm-flutterwave
// Appelé depuis paiement-success.html quand provider=flutterwave
// Vérifie le statut du paiement via l'API Flutterwave
// ==========================================
router.get('/confirm-flutterwave', isAuthenticated, async (req, res) => {
  try {
    if (!isFlutterwaveConfigured()) {
      return res.status(503).json({ success: false, error: 'Flutterwave non configuré' });
    }

    const { transaction_id, tx_ref, status } = req.query;

    // Flutterwave passe status=successful et tx_ref dans l'URL de redirect
    if (status === 'cancelled') {
      return res.json({ success: false, error: 'Paiement annulé' });
    }

    if (!tx_ref && !transaction_id) {
      return res.status(400).json({ success: false, error: 'tx_ref requis' });
    }

    const txRef = tx_ref || transaction_id;

    // Vérifier côté BDD si déjà activé (idempotence)
    const existing = await pool.query(
      'SELECT status, user_id, plan FROM subscriptions WHERE transaction_id = $1',
      [txRef]
    );
    if (existing.rows[0]?.status === 'active') {
      return res.json({ success: true, already_active: true });
    }

    // Vérifier le paiement via l'API Flutterwave (source de vérité)
    const verifyResponse = await axios.get(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${txRef}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`
        }
      }
    );

    const flwData = verifyResponse.data?.data;

    if (!flwData || flwData.status !== 'successful') {
      return res.json({ success: false, error: `Paiement non confirmé (status: ${flwData?.status || 'unknown'})` });
    }

    // Double vérification du montant (sécurité anti-fraude)
    const expectedAmount = CURRENCY_PRICING[flwData.currency]?.amount;
    if (expectedAmount && flwData.amount < expectedAmount) {
      console.error('❌ Montant Flutterwave incorrect:', flwData.amount, 'vs attendu:', expectedAmount);
      return res.status(400).json({ success: false, error: 'Montant incorrect' });
    }

    const row = existing.rows[0];
    if (!row) return res.status(404).json({ success: false, error: 'Transaction introuvable' });

    const userId = row.user_id;
    const planConfig = validatePlan(row.plan);
    if (!planConfig) return res.status(400).json({ success: false, error: 'Plan invalide' });

    // Sécurité : l'utilisateur connecté doit être le propriétaire
    if (parseInt(userId) !== req.session.user.id) {
      return res.status(403).json({ success: false, error: 'Accès refusé' });
    }

    await _activateFlutterwaveSubscription(userId, txRef, flwData.payment_type || 'flutterwave', planConfig);

    if (req.session?.user) {
      req.session.user.is_subscriber = true;
      await new Promise((resolve, reject) =>
        req.session.save(err => err ? reject(err) : resolve())
      );
    }

    console.log(`✅ Abonnement Flutterwave activé — user ${userId}, tx: ${txRef}`);
    res.json({ success: true });

  } catch (err) {
    console.error('❌ Erreur confirm-flutterwave:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==========================================
// 3. WEBHOOK FLUTTERWAVE
// POST /api/subscriptions/webhook
// Flutterwave envoie l'événement charge.completed quand un paiement aboutit
// Configurer dans le dashboard Flutterwave → Webhooks
// ==========================================
router.post('/webhook', express.json(), async (req, res) => {
  try {
    // Vérification de la signature webhook
    if (!verifyFlutterwaveWebhook(req)) {
      console.error('❌ Signature webhook Flutterwave invalide');
      return res.status(401).send('Unauthorized');
    }

    const event = req.body;

    // Flutterwave envoie l'objet "data" dans le body pour charge.completed
    const flwTx = event.data;

    if (!flwTx) {
      return res.status(400).send('Payload invalide');
    }

    const txRef = flwTx.tx_ref;
    const eventType = event.event; // ex: "charge.completed"

    if (eventType === 'charge.completed') {

      if (flwTx.status !== 'successful') {
        console.log(`⚠️ Webhook Flutterwave — paiement non successful (${flwTx.status}) pour tx: ${txRef}`);
        return res.status(200).json({ received: true });
      }

      // Retrouver la subscription en BDD
      const subInfo = await pool.query(
        'SELECT user_id, plan, status FROM subscriptions WHERE transaction_id = $1',
        [txRef]
      );

      const row = subInfo.rows[0];
      if (!row) {
        console.error('❌ Transaction Flutterwave introuvable en BDD:', txRef);
        return res.status(404).send('Transaction introuvable');
      }

      if (row.status === 'active') {
        // Déjà activé (webhook en double) — répondre OK pour ne pas bloquer Flutterwave
        return res.status(200).json({ received: true, note: 'already_active' });
      }

      const planConfig = validatePlan(row.plan);
      if (!planConfig) return res.status(400).send('Plan invalide');

      await _activateFlutterwaveSubscription(
        row.user_id,
        txRef,
        flwTx.payment_type || 'flutterwave',
        planConfig
      );

      console.log(`✅ Webhook Flutterwave — abonnement activé, tx: ${txRef}`);

    } else {
      console.log(`ℹ️ Webhook Flutterwave — événement ignoré: ${eventType}`);
    }

    res.status(200).json({ received: true });

  } catch (err) {
    console.error('❌ Erreur Webhook Flutterwave:', err.message);
    res.status(500).send('Webhook Error');
  }
});

// Helper activation abonnement Flutterwave
async function _activateFlutterwaveSubscription(userId, transactionId, paymentMethod, planConfig) {
  await pool.query(
    `UPDATE subscriptions
     SET status = 'active', payment_method = $1, updated_at = NOW(),
         starts_at = NOW(), ends_at = NOW() + $2::INTERVAL
     WHERE transaction_id = $3`,
    [paymentMethod, planConfig.interval, transactionId]
  );
  await pool.query(
    `UPDATE users
     SET is_subscriber = TRUE, subscription_start_date = NOW(),
         subscription_end_date = NOW() + $1::INTERVAL, updated_at = NOW()
     WHERE id = $2`,
    [planConfig.interval, userId]
  );
}

// ==========================================
// 4. INIT PAIEMENT — Stripe Payment Element
// POST /api/subscriptions/init-stripe-payment
// Retourne un clientSecret pour monter le Payment Element côté front.
// Apple Pay, Google Pay et PayPal sont automatiquement inclus via
// automatic_payment_methods: { enabled: true }.
// ==========================================
router.post('/init-stripe-payment', isAuthenticated, verifyCsrf, async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.startsWith('sk_test_REMPLACER')) {
      return res.status(503).json({ success: false, error: 'Stripe non configuré — ajoutez STRIPE_SECRET_KEY dans .env' });
    }

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const userId = req.session.user.id;
    const { plan } = req.body;

    if (!plan) {
      return res.status(400).json({ success: false, error: 'plan requis' });
    }

    const planConfig = validatePlan(plan);
    if (!planConfig) {
      return res.status(400).json({ success: false, error: 'Plan invalide' });
    }

    const activeCheckStripe = await pool.query(
      "SELECT id FROM subscriptions WHERE user_id = $1 AND status = 'active' AND ends_at > NOW()",
      [userId]
    );
    if (activeCheckStripe.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'Vous avez déjà un abonnement actif' });
    }

    const country = getCountryFromReq(req);
    const geoPricing = getPricingForCountry(country);
    const currency = geoPricing.currency;

    const currencyConfig = CURRENCY_PRICING[currency];
    if (!currencyConfig || currencyConfig.provider !== 'stripe') {
      return res.status(400).json({ success: false, error: 'Devise invalide pour Stripe' });
    }

    const transactionId = `STR-${Date.now()}-${userId}`;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: currencyConfig.stripe_cents,
      currency: currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      description: planConfig.description,
      metadata: {
        userId: userId.toString(),
        plan,
        transactionId,
        currency
      },
    });

    await pool.query(
      `INSERT INTO subscriptions (user_id, plan, amount, currency, transaction_id, status, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', NOW(), NOW())`,
      [userId, plan, currencyConfig.amount, currency, transactionId]
    );

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      transactionId
    });
  } catch (err) {
    console.error('❌ Erreur init-stripe-payment:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur Stripe' });
  }
});

// ==========================================
// 5. WEBHOOK STRIPE
// POST /api/subscriptions/stripe-webhook
// Corps = Buffer raw (géré par express.raw() dans server.js)
// ==========================================
router.post('/stripe-webhook', async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.startsWith('sk_test_REMPLACER')) {
    return res.status(503).send('Stripe non configuré');
  }

  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('❌ Stripe webhook signature invalide:', err.message);
    return res.status(400).send('Webhook signature invalide');
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    const { userId, plan, transactionId } = pi.metadata || {};

    if (!userId || !plan || !transactionId) {
      console.error('❌ Metadata PaymentIntent manquante');
      return res.status(200).send('OK (metadata missing)');
    }

    const planConfig = validatePlan(plan);
    if (!planConfig) return res.status(200).send('OK (plan invalid)');

    try {
      await _activateStripeSubscription(userId, transactionId, planConfig);
      console.log('✅ Paiement Stripe (PaymentIntent) validé');
    } catch (dbErr) {
      console.error('❌ DB Error Stripe webhook (PI):', dbErr);
      return res.status(500).send('DB Error');
    }
  }

  res.status(200).send('OK');
});

// ==========================================
// 6. CONFIRM STRIPE (fallback depuis paiement-success.html)
// GET /api/subscriptions/confirm-stripe
// ==========================================
router.get('/confirm-stripe', isAuthenticated, async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.startsWith('sk_test_REMPLACER')) {
      return res.status(503).json({ success: false, error: 'Stripe non configuré' });
    }

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const { payment_intent } = req.query;

    if (!payment_intent) {
      return res.status(400).json({ success: false, error: 'payment_intent requis' });
    }

    const pi = await stripe.paymentIntents.retrieve(payment_intent);

    if (pi.status !== 'succeeded') {
      return res.json({ success: false, error: `Paiement non confirmé (status: ${pi.status})` });
    }

    const { userId, plan, transactionId } = pi.metadata || {};
    if (!userId || !plan || !transactionId) {
      return res.status(400).json({ success: false, error: 'Metadata manquante' });
    }

    if (parseInt(userId) !== req.session.user.id) {
      return res.status(403).json({ success: false, error: 'Accès refusé' });
    }

    const planConfig = validatePlan(plan);
    if (!planConfig) return res.status(400).json({ success: false, error: 'Plan invalide' });

    const existing = await pool.query(
      'SELECT status FROM subscriptions WHERE transaction_id = $1',
      [transactionId]
    );
    if (existing.rows[0]?.status === 'active') {
      return res.json({ success: true, already_active: true });
    }

    await _activateStripeSubscription(userId, transactionId, planConfig);

    if (req.session?.user) {
      req.session.user.is_subscriber = true;
      await new Promise((resolve, reject) =>
        req.session.save(err => err ? reject(err) : resolve())
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Erreur confirm-stripe:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Helper partagé Stripe
async function _activateStripeSubscription(userId, transactionId, planConfig) {
  await pool.query(
    `UPDATE subscriptions
     SET status = 'active', payment_method = 'stripe_card',
         starts_at = NOW(), ends_at = NOW() + $1::INTERVAL
     WHERE transaction_id = $2`,
    [planConfig.interval, transactionId]
  );
  await pool.query(
    `UPDATE users
     SET is_subscriber = TRUE, subscription_start_date = NOW(),
         subscription_end_date = NOW() + $1::INTERVAL, updated_at = NOW()
     WHERE id = $2`,
    [planConfig.interval, userId]
  );
}

// ==========================================
// 7. SIMULATEUR (MODE DEV)
// POST /api/subscriptions/simulate-payment
// ==========================================
router.post('/simulate-payment', isAuthenticated, verifyCsrf, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ success: false, error: 'Interdit en production' });
  }

  const userId = req.session.user.id;
  const { plan, currency = 'XOF' } = req.body;

  const planConfig = validatePlan(plan);
  if (!planConfig) return res.status(400).json({ success: false, error: 'Plan invalide' });

  const currencyConfig = CURRENCY_PRICING[currency];
  if (!currencyConfig) return res.status(400).json({ success: false, error: 'Devise invalide' });

  const amount = (currency === 'XOF' && plan === 'yearly')
    ? PLAN_CONFIG['yearly'].xof_amount
    : currencyConfig.amount;

  const transactionId = `MOCK-${Date.now()}-${userId}`;

  try {
    await pool.query(
      `INSERT INTO subscriptions (user_id, plan, amount, currency, transaction_id, status, payment_method, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, $5, 'active', 'SIMULATOR', NOW(), NOW() + $6::INTERVAL)`,
      [userId, plan, amount, currency, transactionId, planConfig.interval]
    );
    await pool.query(
      `UPDATE users
       SET is_subscriber = TRUE, subscription_start_date = NOW(),
           subscription_end_date = NOW() + $1::INTERVAL, updated_at = NOW()
       WHERE id = $2`,
      [planConfig.interval, userId]
    );

    if (req.session?.user) {
      req.session.user.is_subscriber = true;
      req.session.save((err) => {
        if (err) return res.status(500).json({ success: false, error: 'Erreur session' });
        console.log(`🚀 Abonnement SIMULÉ activé — user ${userId} (${currency})`);
        res.json({
          success: true,
          payment_url: `${BASE_URL}/paiement-success.html?transaction_id=${transactionId}&mock=true`
        });
      });
    } else {
      res.json({
        success: true,
        payment_url: `${BASE_URL}/paiement-success.html?transaction_id=${transactionId}&mock=true`
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur simulateur' });
  }
});

// ==========================================
// 8. RÉSILIER ABONNEMENT
// POST /api/subscriptions/cancel
// ==========================================
router.post('/cancel', isAuthenticated, verifyCsrf, async (req, res) => {
  try {
    const userId = req.session.user.id;

    await pool.query(
      `UPDATE users
       SET is_subscriber = FALSE, subscription_end_date = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [userId]
    );

    if (req.session?.user) {
      req.session.user.is_subscriber = false;
      req.session.save((err) => {
        if (err) return res.status(500).json({ success: false, error: 'Erreur session' });
        console.log('❌ Abonnement résilié');
        res.json({ success: true, message: 'Votre abonnement a été résilié avec succès.' });
      });
    } else {
      res.json({ success: true, message: 'Votre abonnement a été résilié avec succès.' });
    }
  } catch (err) {
    console.error('Erreur résiliation:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

module.exports = router;
