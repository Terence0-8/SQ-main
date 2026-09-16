const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { isAuthenticated } = require('../middleware/auth');
const { verifyCsrf } = require('../middleware/csrf');
const Stripe = require('stripe');

const BASE_URL = process.env.NODE_ENV === 'production'
  ? 'https://solitiquo.com'
  : (process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`);

const EU_COUNTRIES = [
  'AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI',
  'FR','GR','HR','HU','IE','IT','LT','LU','LV','MT',
  'NL','PL','PT','RO','SE','SI','SK','AD','MC','SM','VA','ME','XK'
];

const PRICES = {
  EUR: { monthly: 'price_1UFzGmBu1609TRVioGJNPs0S', yearly: 'price_1UFzlGBu1609TRVi0N0nwHDU', monthlyAmount: 6.99, yearlyAmount: 69.90 },
  GBP: { monthly: 'price_1UFzGoBu1609TRVi94S3LG6L', yearly: 'price_1UFzlMBu1609TRViq4oUU8Q9', monthlyAmount: 6.99, yearlyAmount: 69.90 },
  CAD: { monthly: 'price_1UFzGvBu1609TRViybjdFN73', yearly: 'price_1UFzlRBu1609TRVi9gYqKvJe', monthlyAmount: 9.99, yearlyAmount: 99.90 },
  USD: { monthly: 'price_1UFzGsBu1609TRVilmCqGmWC', yearly: 'price_1UFzlXBu1609TRViVWobItpS', monthlyAmount: 7.99, yearlyAmount: 79.90 },
};

function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.startsWith('sk_test_REMPLACER')) {
    return null;
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function countryFromReq(req) {
  if (process.env.NODE_ENV !== 'production' && req.query?.testCountry) {
    return String(req.query.testCountry).toUpperCase();
  }
  if (process.env.NODE_ENV !== 'production' && req.headers?.['x-test-country']) {
    return String(req.headers['x-test-country']).toUpperCase();
  }
  try {
    const geoip = require('geoip-lite');
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || req.ip;
    if (!ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('::ffff:127.')) return null;
    return geoip.lookup(ip.replace('::ffff:', ''))?.country || null;
  } catch (_) {
    return null;
  }
}

function pricing(country) {
  if (country === 'CM') {
    return { country: 'CM', currency: 'XAF', provider: 'flutterwave', monthly: 3000, yearly: 30000, amount: 3000 };
  }
  if (['BJ', 'TG', 'SN', 'CI'].includes(country)) {
    return { country, currency: 'XOF', provider: 'flutterwave', monthly: 3000, yearly: 30000, amount: 3000 };
  }

  let cfg, curr;
  if (country === 'GB') {
    cfg = PRICES.GBP;
    curr = 'GBP';
  } else if (country === 'CA') {
    cfg = PRICES.CAD;
    curr = 'CAD';
  } else if (EU_COUNTRIES.includes(country)) {
    cfg = PRICES.EUR;
    curr = 'EUR';
  } else {
    cfg = PRICES.USD;
    curr = 'USD';
  }

  return {
    country: country || 'US',
    currency: curr,
    provider: 'stripe',
    monthly: cfg.monthlyAmount,
    yearly: cfg.yearlyAmount,
    amount: cfg.monthlyAmount,
    monthlyPriceId: cfg.monthly,
    yearlyPriceId: cfg.yearly,
    monthly_price_id: cfg.monthly,
    yearly_price_id: cfg.yearly,
  };
}

async function setLocalEntitlement(userId, active, periodEnd) {
  await pool.query(
    `UPDATE users SET is_subscriber = $1, subscription_end_date = $2, updated_at = NOW() WHERE id = $3`,
    [Boolean(active), periodEnd || null, userId]
  );
}

async function syncUserEntitlement(userId) {
  const subRes = await pool.query(
    `SELECT * FROM subscriptions
     WHERE user_id = $1 AND stripe_subscription_id IS NOT NULL
     ORDER BY id DESC LIMIT 1`,
    [userId]
  );
  const sub = subRes.rows[0];
  if (!sub) {
    const otherSub = await pool.query(
      `SELECT * FROM subscriptions WHERE user_id = $1 AND status = 'active' AND ends_at > NOW() ORDER BY id DESC LIMIT 1`,
      [userId]
    );
    if (!otherSub.rows[0]) {
      await setLocalEntitlement(userId, false, null);
      return { is_subscriber: false, subscription_end_date: null };
    }
    return { is_subscriber: true, subscription_end_date: otherSub.rows[0].ends_at };
  }

  const now = new Date();
  let entitled = false;
  let endDate = sub.stripe_current_period_end ? new Date(sub.stripe_current_period_end) : (sub.ends_at ? new Date(sub.ends_at) : null);

  if (['active', 'trialing'].includes(sub.stripe_status)) {
    if (sub.stripe_cancel_at_period_end) {
      entitled = endDate ? endDate > now : false;
    } else {
      entitled = true;
    }
  } else if (sub.stripe_status === 'past_due') {
    if (sub.payment_grace_ends_at) {
      const graceEnd = new Date(sub.payment_grace_ends_at);
      entitled = graceEnd > now;
      if (entitled) endDate = graceEnd;
    } else {
      entitled = false;
    }
  } else {
    entitled = false;
  }

  await setLocalEntitlement(userId, entitled, endDate);
  return { is_subscriber: entitled, subscription_end_date: endDate };
}

async function getOrCreateStripeCustomer(stripe, user) {
  const localSub = await pool.query(
    `SELECT stripe_customer_id FROM subscriptions
     WHERE user_id = $1 AND stripe_customer_id IS NOT NULL
     ORDER BY id DESC LIMIT 1`,
    [user.id]
  );
  let customerId = localSub.rows[0]?.stripe_customer_id;

  if (customerId) {
    try {
      const existing = await stripe.customers.retrieve(customerId);
      if (existing && !existing.deleted) {
        return customerId;
      }
    } catch (_) {
      customerId = null;
    }
  }

  try {
    const searchRes = await stripe.customers.search({
      query: `metadata['solitiquo_user_id']:'${user.id}'`,
      limit: 1
    });
    if (searchRes.data && searchRes.data.length > 0 && !searchRes.data[0].deleted) {
      return searchRes.data[0].id;
    }
  } catch (_) {
    try {
      const listRes = await stripe.customers.list({ email: user.email, limit: 10 });
      const match = listRes.data.find(c => c.metadata?.solitiquo_user_id === String(user.id) && !c.deleted);
      if (match) return match.id;
    } catch (__) {}
  }

  const customer = await stripe.customers.create({
    email: user.email,
    name: user.username,
    metadata: { solitiquo_user_id: String(user.id) }
  }, {
    idempotencyKey: `create_customer_user_${user.id}`
  });
  return customer.id;
}

async function upsertSubscription(subscription, session, userId) {
  if (!subscription || !subscription.id) return null;

  const price = subscription.items?.data?.[0]?.price;
  const productId = typeof price?.product === 'string' ? price.product : price?.product?.id || null;
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id || null;
  const status = subscription.status;
  const plan = price?.recurring?.interval === 'year' ? 'yearly' : 'monthly';
  const amount = price?.unit_amount ? price.unit_amount / 100 : 0;
  const currency = (price?.currency || 'usd').toUpperCase();
  const txId = `STRIPE-${subscription.id}`;

  const start = subscription.current_period_start ? new Date(subscription.current_period_start * 1000) : new Date();
  const end = subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : new Date();
  const trialStart = subscription.trial_start ? new Date(subscription.trial_start * 1000) : null;
  const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;
  const cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);

  const latestInvoiceId = typeof subscription.latest_invoice === 'string'
    ? subscription.latest_invoice
    : subscription.latest_invoice?.id || null;

  const defaultPm = typeof subscription.default_payment_method === 'string'
    ? subscription.default_payment_method
    : subscription.default_payment_method?.id || null;

  let localStatus = 'active';
  if (status === 'canceled') localStatus = 'cancelled';
  else if (['incomplete', 'incomplete_expired'].includes(status)) localStatus = 'pending';
  else if (status === 'past_due') localStatus = 'active';
  else if (['active', 'trialing'].includes(status)) localStatus = 'active';

  let paymentFailedAt = null;
  let paymentGraceEndsAt = null;
  if (status === 'past_due') {
    const prevSub = await pool.query(
      `SELECT payment_failed_at, payment_grace_ends_at FROM subscriptions WHERE stripe_subscription_id = $1`,
      [subscription.id]
    );
    if (prevSub.rows[0]?.payment_failed_at) {
      paymentFailedAt = prevSub.rows[0].payment_failed_at;
      paymentGraceEndsAt = prevSub.rows[0].payment_grace_ends_at;
    } else {
      paymentFailedAt = new Date();
      paymentGraceEndsAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    }
  }

  try {
    await pool.query(
      `INSERT INTO subscriptions (
        user_id, plan, amount, currency, payment_method, transaction_id, status, starts_at, ends_at,
        stripe_customer_id, stripe_subscription_id, stripe_price_id, stripe_product_id, stripe_status,
        stripe_cancel_at_period_end, stripe_current_period_start, stripe_current_period_end,
        stripe_trial_start, stripe_trial_end, stripe_latest_invoice_id, stripe_default_payment_method,
        payment_failed_at, payment_grace_ends_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, 'stripe', $5, $6, $7, $8,
        $9, $10, $11, $12, $13,
        $14, $15, $16,
        $17, $18, $19, $20,
        $21, $22, NOW()
      )
      ON CONFLICT (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL DO UPDATE SET
        plan = EXCLUDED.plan,
        amount = EXCLUDED.amount,
        currency = EXCLUDED.currency,
        status = EXCLUDED.status,
        ends_at = EXCLUDED.ends_at,
        stripe_customer_id = EXCLUDED.stripe_customer_id,
        stripe_price_id = EXCLUDED.stripe_price_id,
        stripe_product_id = EXCLUDED.stripe_product_id,
        stripe_status = EXCLUDED.stripe_status,
        stripe_cancel_at_period_end = EXCLUDED.stripe_cancel_at_period_end,
        stripe_current_period_start = EXCLUDED.stripe_current_period_start,
        stripe_current_period_end = EXCLUDED.stripe_current_period_end,
        stripe_trial_start = EXCLUDED.stripe_trial_start,
        stripe_trial_end = EXCLUDED.stripe_trial_end,
        stripe_latest_invoice_id = EXCLUDED.stripe_latest_invoice_id,
        stripe_default_payment_method = EXCLUDED.stripe_default_payment_method,
        payment_failed_at = CASE WHEN EXCLUDED.stripe_status = 'past_due' THEN COALESCE(EXCLUDED.payment_failed_at, subscriptions.payment_failed_at) ELSE NULL END,
        payment_grace_ends_at = CASE WHEN EXCLUDED.stripe_status = 'past_due' THEN COALESCE(EXCLUDED.payment_grace_ends_at, subscriptions.payment_grace_ends_at) ELSE NULL END,
        updated_at = NOW()`,
      [
        userId, plan, amount, currency, txId, localStatus, start, end,
        customerId, subscription.id, price?.id || null, productId, status,
        cancelAtPeriodEnd, start, end,
        trialStart, trialEnd, latestInvoiceId, defaultPm,
        paymentFailedAt, paymentGraceEndsAt,
      ]
    );
  } catch (err) {
    if (err.code === '23505') {
      console.warn(`⚠️ Conflit abonnement live pour user ${userId}:`, err.message);
      await pool.query(
        `UPDATE subscriptions SET
          stripe_status = $1, status = $2, ends_at = $3,
          stripe_current_period_end = $3, updated_at = NOW()
         WHERE stripe_subscription_id = $4`,
        [status, localStatus, end, subscription.id]
      );
    } else {
      throw err;
    }
  }

  if (trialEnd || status === 'trialing') {
    await pool.query(
      'UPDATE users SET subscription_trial_used_at = COALESCE(subscription_trial_used_at, NOW()) WHERE id = $1',
      [userId]
    );
  }

  await syncUserEntitlement(userId);
}

async function recordWebhook(eventOrId, type) {
  const id = typeof eventOrId === 'string' ? eventOrId : eventOrId?.id;
  const eventType = typeof eventOrId === 'string' ? type : eventOrId?.type;
  if (!id) return false;
  const result = await pool.query(
    `INSERT INTO stripe_webhook_events (event_id, event_type)
     VALUES ($1, $2)
     ON CONFLICT (event_id) DO NOTHING
     RETURNING event_id`,
    [id, eventType || 'unknown']
  );
  return result.rowCount === 1;
}

function generateIntegrationIdentifier() {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let suffix = '';
  for (let i = 0; i < 8; i++) {
    suffix += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  return `solitiquo_${suffix}`;
}

// ---------------------------------------------------------------------------
// GET /api/stripe/pricing — Public
// ---------------------------------------------------------------------------
router.get('/pricing', (req, res) => {
  const p = pricing(countryFromReq(req));
  if (p.provider === 'stripe' && process.env.STRIPE_PUBLISHABLE_KEY) {
    p.publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  }
  res.json({ success: true, ...p });
});

async function executeCheckoutTransaction({
  stripe,
  userId,
  userEmail,
  plan,
  country,
  p,
  idempotencyKey
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verrouillage exclusif FOR UPDATE de la ligne user pour sérialiser tout checkout concurrent
    const userRow = await client.query(
      'SELECT id, email, username, subscription_trial_used_at FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    const user = userRow.rows[0];
    if (!user) {
      await client.query('ROLLBACK');
      return { status: 404, data: { success: false, error: 'Utilisateur introuvable' } };
    }

    // 2. Contrôle de l'abonnement actif/trialing/past_due sous verrou
    const existing = await client.query(
      `SELECT id, stripe_subscription_id, stripe_status, payment_grace_ends_at
       FROM subscriptions
       WHERE user_id = $1 AND stripe_subscription_id IS NOT NULL
         AND stripe_status IN ('active', 'trialing', 'past_due')
       ORDER BY id DESC LIMIT 1`,
      [userId]
    );

    if (existing.rows[0]) {
      const sub = existing.rows[0];
      const isPastGrace = sub.stripe_status === 'past_due' && sub.payment_grace_ends_at && new Date(sub.payment_grace_ends_at) <= new Date();
      if (!isPastGrace) {
        await client.query('ROLLBACK');
        return { status: 409, data: { success: false, error: 'Vous avez déjà un abonnement actif en cours.' } };
      }
    }

    // 3. Contrôle d'une réservation temporaire récente (moins de 60 secondes)
    const pendingRes = await client.query(
      `SELECT id, transaction_id, stripe_customer_id, created_at FROM subscriptions
       WHERE user_id = $1 AND status = 'pending' AND stripe_subscription_id IS NULL
         AND created_at > NOW() - INTERVAL '60 seconds'
       ORDER BY id DESC LIMIT 1`,
      [userId]
    );
    if (pendingRes.rows.length > 0) {
      await client.query('ROLLBACK');
      return {
        status: 409,
        data: {
          success: false,
          error: 'Une demande de paiement est déjà en cours. Veuillez finaliser ou patienter un instant.'
        }
      };
    }

    // 4. Recherche et réutilisation du Customer Stripe (ou création sous verrou avec clé idempotente)
    let customerId;
    const localCustRes = await client.query(
      `SELECT stripe_customer_id FROM subscriptions
       WHERE user_id = $1 AND stripe_customer_id IS NOT NULL
       ORDER BY id DESC LIMIT 1`,
      [userId]
    );
    if (localCustRes.rows[0]?.stripe_customer_id) {
      customerId = localCustRes.rows[0].stripe_customer_id;
    } else {
      const searchRes = await stripe.customers.search({
        query: `metadata['solitiquo_user_id']:'${userId}'`,
        limit: 1
      });
      if (searchRes.data && searchRes.data.length > 0 && !searchRes.data[0].deleted) {
        customerId = searchRes.data[0].id;
      } else {
        const newCust = await stripe.customers.create({
          email: user.email || userEmail,
          name: user.username,
          metadata: { solitiquo_user_id: String(userId) }
        }, {
          idempotencyKey: `create_customer_user_${userId}`
        });
        customerId = newCust.id;
      }
    }

    // 5. Création de la réservation locale (status='pending', stripe_subscription_id=NULL) AVANT l'appel Stripe
    const tempTxId = `pending_${userId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const pendingInsert = await client.query(
      `INSERT INTO subscriptions (
         user_id, plan, amount, currency, payment_method, transaction_id,
         status, starts_at, ends_at, stripe_customer_id, stripe_subscription_id,
         stripe_status, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, 'stripe', $5,
         'pending', NOW(), NOW() + INTERVAL '1 hour', $6, NULL,
         NULL, NOW(), NOW()
       ) RETURNING id`,
      [userId, plan, p[plan] || p.monthly, p.currency, tempTxId, customerId]
    );
    const reservationId = pendingInsert.rows[0].id;

    const trialEligible = plan === 'monthly' && !user.subscription_trial_used_at;
    const priceId = plan === 'yearly' ? p.yearlyPriceId : p.monthlyPriceId;
    const integrationId = generateIntegrationIdentifier();

    const metadata = {
      solitiquo_user_id: String(userId),
      solitiquo_plan: plan,
      solitiquo_currency: p.currency,
      solitiquo_trial_eligible: trialEligible ? 'true' : 'false',
      integration_identifier: integrationId
    };

    const sessionConfig = {
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${BASE_URL}/paiement-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/paiement.html?plan=${plan}&cancelled=true`,
      client_reference_id: String(userId),
      metadata,
      subscription_data: {
        metadata
      },
      payment_method_collection: 'always',
      integration_identifier: integrationId
    };

    if (trialEligible) {
      sessionConfig.subscription_data.trial_period_days = 30;
    }

    // 6. Appel Stripe Checkout avec clé d'idempotence pour dédupliquer tout retry
    const requestOptions = {};
    if (idempotencyKey) {
      requestOptions.idempotencyKey = idempotencyKey;
    }

    const session = await stripe.checkout.sessions.create(sessionConfig, requestOptions);

    // 7. Mise à jour de la réservation locale avec session.id / customer ID
    await client.query(
      `UPDATE subscriptions SET
         transaction_id = $1,
         stripe_customer_id = $2,
         updated_at = NOW()
       WHERE id = $3`,
      [session.id, customerId, reservationId]
    );

    await client.query('COMMIT');

    return {
      status: 200,
      data: {
        success: true,
        checkout_url: session.url,
        session_id: session.id,
        trial_applied: trialEligible
      }
    };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Stripe Checkout error:', err);
    return { status: 500, data: { success: false, error: 'Impossible de créer la session de paiement.' } };
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// POST /api/stripe/checkout — Authentifié + CSRF (Sérialisation robuste)
// ---------------------------------------------------------------------------
router.post('/checkout', verifyCsrf, isAuthenticated, async (req, res) => {
  const stripe = stripeClient();
  if (!stripe) return res.status(503).json({ success: false, error: 'Stripe non configuré' });

  const userId = req.session.user.id;
  const userEmail = req.session.user.email;
  const plan = req.body.plan === 'yearly' ? 'yearly' : req.body.plan === 'monthly' ? 'monthly' : null;
  if (!plan) return res.status(400).json({ success: false, error: 'Plan invalide (monthly ou yearly requis)' });

  const country = countryFromReq(req);
  const p = pricing(country);
  if (p.provider !== 'stripe') {
    return res.status(400).json({ success: false, error: 'Ce pays utilise un moyen de paiement local.' });
  }

  // Clé d'idempotence déterministe pour cette tentative logique de checkout
  const clientKey = req.headers['idempotency-key'] || req.body.idempotency_key || req.body.attempt_id;
  let idempotencyKey = clientKey;

  if (!idempotencyKey && req.session) {
    const now = Date.now();
    const existing = req.session.checkout_attempt;
    // Réutilisation de la même tentative logique si même plan et < 15 minutes
    if (existing && existing.plan === plan && (now - existing.timestamp) < 15 * 60 * 1000) {
      idempotencyKey = existing.key;
    } else {
      const randomSuffix = require('crypto').randomBytes(8).toString('hex');
      idempotencyKey = `cs_attempt_${userId}_${plan}_${randomSuffix}`;
      req.session.checkout_attempt = { key: idempotencyKey, plan, timestamp: now };
      if (typeof req.session.save === 'function') {
        await new Promise((resolve) => req.session.save(resolve));
      }
    }
  }

  const result = await executeCheckoutTransaction({
    stripe,
    userId,
    userEmail,
    plan,
    country,
    p,
    idempotencyKey
  });

  if (result.status === 200 && req.session?.checkout_attempt) {
    delete req.session.checkout_attempt;
    if (typeof req.session.save === 'function') {
      req.session.save(() => {});
    }
  }

  return res.status(result.status).json(result.data);
});

// ---------------------------------------------------------------------------
// POST /api/stripe/portal — Authentifié + CSRF
// ---------------------------------------------------------------------------
router.post('/portal', verifyCsrf, isAuthenticated, async (req, res) => {
  try {
    const stripe = stripeClient();
    if (!stripe) return res.status(503).json({ success: false, error: 'Stripe non configuré' });

    const userId = req.session.user.id;
    const userRes = await pool.query('SELECT id, email, username FROM users WHERE id = $1', [userId]);
    const user = userRes.rows[0];
    if (!user) return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });

    const customerId = await getOrCreateStripeCustomer(stripe, user);
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${BASE_URL}/profil.html`
    });
    res.json({ success: true, url: portal.url });
  } catch (err) {
    console.error('Stripe Portal error:', err);
    res.status(500).json({ success: false, error: 'Impossible d’ouvrir la gestion de votre abonnement.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/stripe/cancel — Authentifié + CSRF
// ---------------------------------------------------------------------------
router.post('/cancel', verifyCsrf, isAuthenticated, async (req, res) => {
  try {
    const stripe = stripeClient();
    if (!stripe) return res.status(503).json({ success: false, error: 'Stripe non configuré' });

    const userId = req.session.user.id;
    const result = await pool.query(
      `SELECT * FROM subscriptions
       WHERE user_id = $1 AND stripe_subscription_id IS NOT NULL
         AND stripe_status IN ('active', 'trialing', 'past_due')
       ORDER BY id DESC LIMIT 1`,
      [userId]
    );
    const sub = result.rows[0];
    if (!sub) return res.status(404).json({ success: false, error: 'Aucun abonnement actif.' });

    const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);

    if (stripeSub.status === 'trialing') {
      const canceled = await stripe.subscriptions.cancel(sub.stripe_subscription_id);
      const canceledAt = (canceled && canceled.canceled_at)
        ? new Date(canceled.canceled_at * 1000)
        : new Date();

      await pool.query(
        `UPDATE subscriptions
         SET stripe_status = 'canceled', status = 'cancelled',
             stripe_cancel_at_period_end = false, ends_at = $1,
             stripe_current_period_end = $1, updated_at = NOW()
         WHERE id = $2`,
        [canceledAt, sub.id]
      );
      await setLocalEntitlement(userId, false, null);
      if (req.session?.user) req.session.user.is_subscriber = false;

      return res.json({
        success: true,
        immediate: true,
        ends_at: canceledAt.toISOString()
      });
    }

    const updated = await stripe.subscriptions.update(sub.stripe_subscription_id, {
      cancel_at_period_end: true
    });
    const end = (updated && updated.current_period_end)
      ? new Date(updated.current_period_end * 1000)
      : (sub.stripe_current_period_end ? new Date(sub.stripe_current_period_end) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

    await pool.query(
      `UPDATE subscriptions
       SET stripe_cancel_at_period_end = true,
           stripe_current_period_end = $1,
           ends_at = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [end, sub.id]
    );
    await setLocalEntitlement(userId, true, end);
    if (req.session?.user) {
      req.session.user.is_subscriber = true;
      req.session.user.subscription_end_date = end;
    }

    res.json({
      success: true,
      immediate: false,
      ends_at: end.toISOString()
    });
  } catch (err) {
    console.error('Stripe cancellation error:', err);
    res.status(500).json({ success: false, error: 'Impossible de résilier l’abonnement.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/stripe/reactivate — Authentifié + CSRF
// ---------------------------------------------------------------------------
router.post('/reactivate', verifyCsrf, isAuthenticated, async (req, res) => {
  try {
    const stripe = stripeClient();
    if (!stripe) return res.status(503).json({ success: false, error: 'Stripe non configuré' });

    const userId = req.session.user.id;
    const result = await pool.query(
      `SELECT * FROM subscriptions
       WHERE user_id = $1 AND stripe_subscription_id IS NOT NULL
         AND stripe_status IN ('active', 'trialing', 'past_due')
         AND stripe_cancel_at_period_end = true
       ORDER BY id DESC LIMIT 1`,
      [userId]
    );
    const sub = result.rows[0];
    if (!sub) return res.status(404).json({ success: false, error: 'Aucun abonnement résiliable à réactiver.' });

    const updated = await stripe.subscriptions.update(sub.stripe_subscription_id, {
      cancel_at_period_end: false
    });
    const end = (updated && updated.current_period_end)
      ? new Date(updated.current_period_end * 1000)
      : (sub.stripe_current_period_end ? new Date(sub.stripe_current_period_end) : new Date(Date.now() + 30 * 86400000));

    await pool.query(
      `UPDATE subscriptions
       SET stripe_cancel_at_period_end = false,
           stripe_current_period_end = $1,
           ends_at = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [end, sub.id]
    );
    await setLocalEntitlement(userId, true, end);
    if (req.session?.user) {
      req.session.user.is_subscriber = true;
      req.session.user.subscription_end_date = end;
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Stripe reactivation error:', err);
    res.status(500).json({ success: false, error: 'Impossible de réactiver l’abonnement.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/stripe/change-plan — Authentifié + CSRF
// Prend effet uniquement à la prochaine échéance (subscription schedule)
// ---------------------------------------------------------------------------
router.post('/change-plan', verifyCsrf, isAuthenticated, async (req, res) => {
  try {
    const stripe = stripeClient();
    if (!stripe) return res.status(503).json({ success: false, error: 'Stripe non configuré' });

    const userId = req.session.user.id;
    const targetPlan = req.body.targetPlan === 'yearly' ? 'yearly' : req.body.targetPlan === 'monthly' ? 'monthly' : null;
    if (!targetPlan) {
      return res.status(400).json({ success: false, error: 'Formule cible invalide (monthly ou yearly attendu).' });
    }

    const subRes = await pool.query(
      `SELECT * FROM subscriptions
       WHERE user_id = $1 AND stripe_subscription_id IS NOT NULL
         AND stripe_status IN ('active', 'trialing')
       ORDER BY id DESC LIMIT 1`,
      [userId]
    );
    const sub = subRes.rows[0];
    if (!sub) {
      return res.status(404).json({ success: false, error: 'Aucun abonnement actif trouvé pour changer de formule.' });
    }

    // Gestion explicite de l'incompatibilité avec cancel_at_period_end
    if (sub.stripe_cancel_at_period_end) {
      return res.status(400).json({
        success: false,
        error: 'Votre abonnement est en attente de résiliation. Veuillez le réactiver avant de changer de formule.'
      });
    }

    if (sub.plan === targetPlan) {
      return res.status(400).json({ success: false, error: `Vous êtes déjà sur la formule ${targetPlan}.` });
    }

    const curr = (sub.currency || 'USD').toUpperCase();
    const priceConfig = PRICES[curr] || PRICES.USD;
    const newPriceId = targetPlan === 'yearly' ? priceConfig.yearly : priceConfig.monthly;

    const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
    if (!stripeSub || ['canceled', 'incomplete_expired'].includes(stripeSub.status)) {
      return res.status(400).json({ success: false, error: 'Abonnement Stripe introuvable ou résilié.' });
    }

    if (stripeSub.cancel_at_period_end) {
      return res.status(400).json({
        success: false,
        error: 'Votre abonnement est en cours de résiliation. Veuillez le réactiver avant de changer de formule.'
      });
    }

    let scheduleId = stripeSub.schedule;
    let schedule;
    if (!scheduleId) {
      schedule = await stripe.subscriptionSchedules.create({
        from_subscription: stripeSub.id,
      });
      scheduleId = schedule.id;
    } else {
      schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
    }

    const currentPhase = schedule.phases[schedule.phases.length - 1];
    const effectiveDate = new Date(currentPhase.end_date * 1000);

    await stripe.subscriptionSchedules.update(scheduleId, {
      end_behavior: 'release',
      phases: [
        {
          items: [{ price: currentPhase.items[0].price, quantity: currentPhase.items[0].quantity || 1 }],
          start_date: currentPhase.start_date,
          end_date: currentPhase.end_date,
          proration_behavior: 'none',
        },
        {
          items: [{ price: newPriceId, quantity: 1 }],
          start_date: currentPhase.end_date,
          proration_behavior: 'none',
        }
      ]
    });

    res.json({
      success: true,
      message: `Votre formule passera en ${targetPlan} à la prochaine échéance (${effectiveDate.toLocaleDateString()}).`,
      effective_date: effectiveDate.toISOString(),
      target_plan: targetPlan
    });
  } catch (err) {
    console.error('Stripe change-plan error:', err);
    res.status(500).json({ success: false, error: 'Impossible de programmer le changement de formule.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/stripe/webhook — Raw body requis, signature obligatoire
// ---------------------------------------------------------------------------
router.post('/webhook', async (req, res) => {
  const stripe = stripeClient();
  if (!stripe) return res.status(503).send('Stripe non configuré');
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature invalide:', err.message);
    return res.status(400).send('Webhook signature invalide');
  }

  try {
    if (!(await recordWebhook(event))) return res.json({ received: true, duplicate: true });

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode !== 'subscription' || !session.subscription) break;
        const userId = Number(session.client_reference_id || session.metadata?.solitiquo_user_id);
        const subscription = await stripe.subscriptions.retrieve(session.subscription, {
          expand: ['items.data.price.product', 'default_payment_method']
        });
        if (userId) {
          await upsertSubscription(subscription, session, userId);
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
        let userId = Number(subscription.metadata?.solitiquo_user_id || 0);

        if (!userId && customerId) {
          const r = await pool.query(
            'SELECT user_id FROM subscriptions WHERE stripe_customer_id = $1 ORDER BY id DESC LIMIT 1',
            [customerId]
          );
          userId = Number(r.rows[0]?.user_id || 0);
        }

        if (!userId && customerId) {
          try {
            const cust = await stripe.customers.retrieve(customerId);
            userId = Number(cust.metadata?.solitiquo_user_id || 0);
          } catch (_) {}
        }

        if (userId) {
          await upsertSubscription(subscription, null, userId);
        } else {
          console.warn(`⚠️ Impossible de résoudre user_id pour subscription ${subscription.id}`);
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object;
        const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
        if (!subId) break;

        let subscription = null;
        try {
          subscription = await stripe.subscriptions.retrieve(subId, {
            expand: ['items.data.price.product', 'default_payment_method']
          });
        } catch (e) {
          console.warn(`⚠️ Impossible de récupérer la subscription Stripe ${subId} dans invoice.paid:`, e.message);
        }

        const realStatus = subscription?.status || 'active';
        const currentPeriodEnd = (subscription && subscription.current_period_end)
          ? new Date(subscription.current_period_end * 1000)
          : null;

        const updateRes = await pool.query(
          `UPDATE subscriptions
           SET stripe_status = $1,
               status = CASE WHEN $1 IN ('active', 'trialing') THEN 'active'
                             WHEN $1 = 'canceled' THEN 'cancelled'
                             ELSE 'expired' END,
               payment_failed_at = NULL,
               payment_grace_ends_at = NULL,
               stripe_current_period_end = COALESCE($2, stripe_current_period_end),
               ends_at = COALESCE($2, ends_at),
               stripe_latest_invoice_id = $3,
               updated_at = NOW()
           WHERE stripe_subscription_id = $4
           RETURNING user_id, stripe_current_period_end`,
          [realStatus, currentPeriodEnd, invoice.id, subId]
        );

        if (updateRes.rows[0]) {
          const { user_id, stripe_current_period_end: subEnd } = updateRes.rows[0];
          const shouldHavePremium = ['active', 'trialing'].includes(realStatus);
          await setLocalEntitlement(user_id, shouldHavePremium, shouldHavePremium ? subEnd : null);
        } else if (subscription) {
          let userId = Number(subscription.metadata?.solitiquo_user_id || 0);
          if (!userId && subscription.customer) {
            const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
            const r = await pool.query('SELECT user_id FROM subscriptions WHERE stripe_customer_id = $1 ORDER BY id DESC LIMIT 1', [customerId]);
            userId = Number(r.rows[0]?.user_id || 0);
          }
          if (userId) {
            await upsertSubscription(subscription, null, userId);
          }
        }
        break;
      }

      case 'invoice.payment_failed':
      case 'invoice.payment_action_required': {
        const invoice = event.data.object;
        const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
        if (!subId) break;

        const updateRes = await pool.query(
          `UPDATE subscriptions
           SET payment_failed_at = COALESCE(payment_failed_at, NOW()),
               payment_grace_ends_at = COALESCE(payment_grace_ends_at, NOW() + INTERVAL '5 days'),
               stripe_status = 'past_due',
               status = 'active',
               stripe_latest_invoice_id = $1,
               updated_at = NOW()
           WHERE stripe_subscription_id = $2
           RETURNING user_id, payment_grace_ends_at`,
          [invoice.id, subId]
        );

        if (updateRes.rows[0]) {
          const { user_id, payment_grace_ends_at } = updateRes.rows[0];
          const isGraceActive = payment_grace_ends_at && new Date(payment_grace_ends_at) > new Date();
          await setLocalEntitlement(user_id, isGraceActive, isGraceActive ? payment_grace_ends_at : null);
        }
        break;
      }

      default:
        break;
    }

    return res.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook processing error:', err);
    return res.status(500).send('Webhook processing error');
  }
});

module.exports = router;
module.exports.PRICES = PRICES;
module.exports.EU_COUNTRIES = EU_COUNTRIES;
module.exports.pricing = pricing;
module.exports.countryFromReq = countryFromReq;
module.exports.setLocalEntitlement = setLocalEntitlement;
module.exports.syncUserEntitlement = syncUserEntitlement;
module.exports.upsertSubscription = upsertSubscription;
module.exports.recordWebhook = recordWebhook;
module.exports.getOrCreateStripeCustomer = getOrCreateStripeCustomer;
module.exports.generateIntegrationIdentifier = generateIntegrationIdentifier;
module.exports.executeCheckoutTransaction = executeCheckoutTransaction;
