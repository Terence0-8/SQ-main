// backend/routes/subscriptions.js
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const axios = require('axios');
const { isAuthenticated } = require('../middleware/auth');
const { verifyCsrf } = require('../middleware/csrf');

// ==========================================
// GEO-PRICING CONFIGURATION
// ==========================================

const EU_COUNTRIES = [
  'AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI',
  'FR','GR','HR','HU','IE','IT','LT','LU','LV','MT',
  'NL','PL','PT','RO','SE','SI','SK'
];

const CURRENCY_PRICING = {
  'XAF': { symbol: 'FCFA', amount: 3000,  stripe_cents: null, provider: 'cinetpay' },
  'EUR': { symbol: '€',    amount: 6.99,  stripe_cents: 699,  provider: 'stripe'   },
  'GBP': { symbol: '£',    amount: 6.99,  stripe_cents: 699,  provider: 'stripe'   },
  'USD': { symbol: '$',    amount: 7.99,  stripe_cents: 799,  provider: 'stripe'   },
  'CAD': { symbol: 'CA$',  amount: 9.99,  stripe_cents: 999,  provider: 'stripe'   },
};

function getPricingForCountry(countryCode) {
  if (countryCode === 'CM')
    return { country: 'CM', currency: 'XAF', ...CURRENCY_PRICING['XAF'] };
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
  } catch { /* geoip indisponible */ }
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
    xaf_amount: 30000
  }
};

function validatePlan(plan) {
  return PLAN_CONFIG[plan] || null;
}

// ==========================================
// CONFIG CINETPAY
// ==========================================
const CINETPAY_API_KEY = process.env.CINETPAY_API_KEY;
const CINETPAY_SITE_ID = process.env.CINETPAY_SITE_ID;
const BASE_URL = process.env.NODE_ENV === 'production'
  ? 'https://solitiquo.com'
  : 'http://localhost:5000';

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

    res.json(response);
  } catch (err) {
    console.error('❌ Erreur pricing:', err);
    res.json({ success: true, ...getPricingForCountry(null) });
  }
});

// ==========================================
// 1. INIT PAIEMENT — CinetPay (XAF)
// POST /api/subscriptions/init-payment
// ==========================================
router.post('/init-payment', isAuthenticated, verifyCsrf, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { plan } = req.body;

    const planConfig = validatePlan(plan);
    if (!planConfig) {
      return res.status(400).json({ success: false, error: "Plan invalide" });
    }

    const activeCheck = await pool.query(
      "SELECT id FROM subscriptions WHERE user_id = $1 AND status = 'active' AND ends_at > NOW()",
      [userId]
    );
    if (activeCheck.rows.length > 0) {
      return res.status(400).json({ success: false, error: "Vous avez déjà un abonnement actif" });
    }

    const amount = plan === 'yearly'
      ? PLAN_CONFIG['yearly'].xaf_amount
      : CURRENCY_PRICING['XAF'].amount;

    const transactionId = `SOL-${Date.now()}-${userId}`;

    await pool.query(
      `INSERT INTO subscriptions (user_id, plan, amount, currency, transaction_id, status, starts_at, ends_at)
       VALUES ($1, $2, $3, 'XAF', $4, 'pending', NOW(), NOW())`,
      [userId, plan, amount, transactionId]
    );

    const payload = {
      apikey: CINETPAY_API_KEY,
      site_id: CINETPAY_SITE_ID,
      transaction_id: transactionId,
      amount: amount,
      currency: 'XAF',
      channels: 'ALL',
      description: planConfig.description,
      customer_id: userId.toString(),
      customer_name: req.session.user.username || 'Client',
      customer_email: req.session.user.email || 'client@solitiquo.com',
      return_url: `${BASE_URL}/paiement-success.html?transaction_id=${transactionId}`,
      notify_url: `${BASE_URL}/api/subscriptions/webhook`
    };

    const response = await axios.post(`${process.env.CINETPAY_BASE_URL}`, payload);

    if (response.data.code === '201') {
      res.json({ success: true, payment_url: response.data.data.payment_url });
    } else {
      console.error('❌ Erreur CinetPay:', response.data);
      res.status(500).json({ success: false, error: "Erreur initialisation paiement" });
    }
  } catch (err) {
    console.error('❌ Erreur init-payment:', err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
});

// ==========================================
// 2. WEBHOOK CINETPAY
// POST /api/subscriptions/webhook
// ==========================================
router.post('/webhook', async (req, res) => {
  try {
    const { cpm_trans_id, cpm_site_id } = req.body;

    if (cpm_site_id !== CINETPAY_SITE_ID) {
      return res.status(400).send("Invalid Site ID");
    }

    const checkPayload = {
      apikey: CINETPAY_API_KEY,
      site_id: CINETPAY_SITE_ID,
      transaction_id: cpm_trans_id
    };

    const checkRes = await axios.post(`${process.env.CINETPAY_BASE_URL}/check`, checkPayload);
    const data = checkRes.data.data;

    if (data.payment_method && data.status === 'ACCEPTED') {
      console.log('✅ Paiement CinetPay validé');

      const subInfo = await pool.query(
        'SELECT user_id, plan FROM subscriptions WHERE transaction_id = $1',
        [cpm_trans_id]
      );

      if (subInfo.rows.length === 0) return res.status(404).send('Transaction introuvable');

      const { user_id, plan } = subInfo.rows[0];
      const planConfig = validatePlan(plan);
      if (!planConfig) return res.status(400).send('Plan invalide');

      await pool.query(
        `UPDATE subscriptions
         SET status = 'active', payment_method = $1, updated_at = NOW(),
             starts_at = NOW(), ends_at = NOW() + $2::INTERVAL
         WHERE transaction_id = $3`,
        [data.payment_method, planConfig.interval, cpm_trans_id]
      );
      await pool.query(
        `UPDATE users
         SET is_subscriber = TRUE, subscription_start_date = NOW(),
             subscription_end_date = NOW() + $1::INTERVAL, updated_at = NOW()
         WHERE id = $2`,
        [planConfig.interval, user_id]
      );
      res.status(200).send('OK');
    } else {
      console.log(`⚠️ Paiement CinetPay échoué : ${data.status}`);
      await pool.query(
        "UPDATE subscriptions SET status = 'failed' WHERE transaction_id = $1",
        [cpm_trans_id]
      );
      res.status(200).send('OK (Failed)');
    }
  } catch (err) {
    console.error('❌ Erreur Webhook CinetPay:', err);
    res.status(500).send('Webhook Error');
  }
});

// ==========================================
// 3. INIT PAIEMENT — Stripe Payment Element
// POST /api/subscriptions/init-stripe-payment
// Retourne un clientSecret pour monter le Payment Element côté front.
// Apple Pay, Google Pay et PayPal sont automatiquement inclus via
// automatic_payment_methods: { enabled: true }.
// ==========================================
router.post('/init-stripe-payment', isAuthenticated, verifyCsrf, async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.startsWith('sk_test_REMPLACER')) {
      return res.status(503).json({ success: false, error: "Stripe non configuré — ajoutez STRIPE_SECRET_KEY dans .env" });
    }

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const userId = req.session.user.id;
    const { plan } = req.body;

    if (!plan) {
      return res.status(400).json({ success: false, error: "plan requis" });
    }

    const planConfig = validatePlan(plan);
    if (!planConfig) {
      return res.status(400).json({ success: false, error: "Plan invalide" });
    }

    const activeCheckStripe = await pool.query(
      "SELECT id FROM subscriptions WHERE user_id = $1 AND status = 'active' AND ends_at > NOW()",
      [userId]
    );
    if (activeCheckStripe.rows.length > 0) {
      return res.status(400).json({ success: false, error: "Vous avez déjà un abonnement actif" });
    }

    // Dériver la devise depuis l'IP serveur — le client ne peut pas l'influencer
    const country = getCountryFromReq(req);
    const geoPricing = getPricingForCountry(country);
    const currency = geoPricing.currency;

    const currencyConfig = CURRENCY_PRICING[currency];
    if (!currencyConfig || currencyConfig.provider !== 'stripe') {
      return res.status(400).json({ success: false, error: "Devise invalide pour Stripe" });
    }

    const transactionId = `STR-${Date.now()}-${userId}`;

    // Créer le PaymentIntent — active automatiquement carte, Apple Pay, Google Pay, PayPal
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
    res.status(500).json({ success: false, error: "Erreur serveur Stripe" });
  }
});

// ==========================================
// 4. WEBHOOK STRIPE
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

  // Payment Element → payment_intent.succeeded
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
// 5. CONFIRM STRIPE (fallback depuis paiement-success.html)
// GET /api/subscriptions/confirm-stripe
// Accepte ?payment_intent=pi_... (Payment Element)
// ==========================================
router.get('/confirm-stripe', isAuthenticated, async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.startsWith('sk_test_REMPLACER')) {
      return res.status(503).json({ success: false, error: "Stripe non configuré" });
    }

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const { payment_intent } = req.query;

    if (!payment_intent) {
      return res.status(400).json({ success: false, error: "payment_intent requis" });
    }

    const pi = await stripe.paymentIntents.retrieve(payment_intent);

    if (pi.status !== 'succeeded') {
      return res.json({ success: false, error: `Paiement non confirmé (status: ${pi.status})` });
    }

    const { userId, plan, transactionId } = pi.metadata || {};
    if (!userId || !plan || !transactionId) {
      return res.status(400).json({ success: false, error: "Metadata manquante" });
    }

    // Sécurité : la transaction doit appartenir à l'utilisateur connecté
    if (parseInt(userId) !== req.session.user.id) {
      return res.status(403).json({ success: false, error: "Accès refusé" });
    }

    const planConfig = validatePlan(plan);
    if (!planConfig) return res.status(400).json({ success: false, error: "Plan invalide" });

    // Vérifier si déjà activé (le webhook a peut-être déjà agi)
    const existing = await pool.query(
      'SELECT status FROM subscriptions WHERE transaction_id = $1',
      [transactionId]
    );
    if (existing.rows[0]?.status === 'active') {
      return res.json({ success: true, already_active: true });
    }

    await _activateStripeSubscription(userId, transactionId, planConfig);

    // Mettre à jour la session immédiatement
    if (req.session?.user) {
      req.session.user.is_subscriber = true;
      await new Promise((resolve, reject) =>
        req.session.save(err => err ? reject(err) : resolve())
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Erreur confirm-stripe:', err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
});

// Helper partagé
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
// 6. SIMULATEUR (MODE DEV)
// POST /api/subscriptions/simulate-payment
// ==========================================
router.post('/simulate-payment', isAuthenticated, verifyCsrf, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ success: false, error: "Interdit en production" });
  }

  const userId = req.session.user.id;
  const { plan, currency = 'XAF' } = req.body;

  const planConfig = validatePlan(plan);
  if (!planConfig) return res.status(400).json({ success: false, error: "Plan invalide" });

  const currencyConfig = CURRENCY_PRICING[currency];
  if (!currencyConfig) return res.status(400).json({ success: false, error: "Devise invalide" });

  const amount = (currency === 'XAF' && plan === 'yearly')
    ? PLAN_CONFIG['yearly'].xaf_amount
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
        if (err) return res.status(500).json({ success: false, error: "Erreur session" });
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
    res.status(500).json({ success: false, error: "Erreur simulateur" });
  }
});

// ==========================================
// 7. RÉSILIER ABONNEMENT
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
        if (err) return res.status(500).json({ success: false, error: "Erreur session" });
        console.log('❌ Abonnement résilié');
        res.json({ success: true, message: "Votre abonnement a été résilié avec succès." });
      });
    } else {
      res.json({ success: true, message: "Votre abonnement a été résilié avec succès." });
    }
  } catch (err) {
    console.error('Erreur résiliation:', err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
});

module.exports = router;
