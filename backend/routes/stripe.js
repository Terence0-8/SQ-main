const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { isAuthenticated } = require('../middleware/auth');
const { verifyCsrf } = require('../middleware/csrf');
const Stripe = require('stripe');

const BASE_URL = process.env.NODE_ENV === 'production' ? 'https://solitiquo.com' : 'http://localhost:5000';

const EU_COUNTRIES = [
  'AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK'
];

const PRICES = {
  EUR: { monthly: 'price_1UFzGmBu1609TRVioGJNPs0S', yearly: 'price_1UFzlGBu1609TRVi0N0nwHDU', amount: 6.99 },
  GBP: { monthly: 'price_1UFzGoBu1609TRVi94S3LG6L', yearly: 'price_1UFzlMBu1609TRViq4oUU8Q9', amount: 6.99 },
  CAD: { monthly: 'price_1UFzGvBu1609TRViybjdFN73', yearly: 'price_1UFzlRBu1609TRVi9gYqKvJe', amount: 9.99 },
  USD: { monthly: 'price_1UFzGsBu1609TRVilmCqGmWC', yearly: 'price_1UFzlXBu1609TRViVWobItpS', amount: 7.99 },
};

function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.startsWith('sk_test_REMPLACER')) return null;
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function countryFromReq(req) {
  if (process.env.NODE_ENV !== 'production' && req.query.testCountry) return req.query.testCountry.toUpperCase();
  try {
    const geoip = require('geoip-lite');
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || req.ip;
    if (!ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('::ffff:127.')) return null;
    return geoip.lookup(ip.replace('::ffff:', ''))?.country || null;
  } catch (_) { return null; }
}

function pricing(country) {
  if (country === 'CM') return { country, currency: 'XAF', provider: 'flutterwave', monthly: 3000, yearly: 30000 };
  if (['BJ','TG','SN','CI'].includes(country)) return { country, currency: 'XOF', provider: 'flutterwave', monthly: 3000, yearly: 30000 };
  if (EU_COUNTRIES.includes(country)) return { country, currency: 'EUR', provider: 'stripe', ...PRICES.EUR };
  if (country === 'GB') return { country, currency: 'GBP', provider: 'stripe', ...PRICES.GBP };
  if (country === 'CA') return { country, currency: 'CAD', provider: 'stripe', ...PRICES.CAD };
  return { country: country || 'US', currency: 'USD', provider: 'stripe', ...PRICES.USD };
}

function liveStripeStatus(row) {
  return row && ['active', 'trialing', 'past_due'].includes(row.stripe_status);
}

async function setLocalEntitlement(userId, active, periodEnd) {
  await pool.query(
    `UPDATE users SET is_subscriber = $1, subscription_end_date = $2, updated_at = NOW() WHERE id = $3`,
    [active, periodEnd || null, userId]
  );
}

async function upsertSubscription(subscription, session, userId) {
  const price = subscription.items?.data?.[0]?.price;
  const productId = typeof price?.product === 'string' ? price.product : price?.product?.id;
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
  const status = subscription.status;
  const localStatus = ['active', 'trialing', 'past_due'].includes(status) ? 'active' : (status === 'canceled' ? 'cancelled' : 'pending');
  const start = subscription.current_period_start ? new Date(subscription.current_period_start * 1000) : new Date();
  const end = subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : new Date();
  const trialStart = subscription.trial_start ? new Date(subscription.trial_start * 1000) : null;
  const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;

  await pool.query(
    `INSERT INTO subscriptions (
      user_id, plan, amount, currency, payment_method, transaction_id, status, starts_at, ends_at,
      stripe_customer_id, stripe_subscription_id, stripe_price_id, stripe_product_id, stripe_status,
      stripe_cancel_at_period_end, stripe_current_period_start, stripe_current_period_end,
      stripe_trial_start, stripe_trial_end, stripe_latest_invoice_id, stripe_default_payment_method
    ) VALUES (
      $1, $2, $3, $4, 'stripe', $5, $6, $7, $8,
      $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
    )
    ON CONFLICT (stripe_subscription_id) DO UPDATE SET
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
      updated_at = NOW()`,
    [
      userId,
      price?.recurring?.interval === 'year' ? 'yearly' : 'monthly',
      price?.unit_amount ? price.unit_amount / 100 : 0,
      (price?.currency || 'usd').toUpperCase(),
      `STRIPE-${subscription.id}`,
      localStatus,
      start,
      end,
      customerId,
      subscription.id,
      price?.id || null,
      productId || null,
      status,
      !!subscription.cancel_at_period_end,
      start,
      end,
      trialStart,
      trialEnd,
      typeof subscription.latest_invoice === 'string' ? subscription.latest_invoice : subscription.latest_invoice?.id || null,
      typeof subscription.default_payment_method === 'string' ? subscription.default_payment_method : subscription.default_payment_method?.id || null,
    ]
  );

  if (trialEnd) {
    await pool.query('UPDATE users SET subscription_trial_used_at = COALESCE(subscription_trial_used_at, NOW()) WHERE id = $1', [userId]);
  }

  const entitled = ['active', 'trialing'].includes(status);
  await setLocalEntitlement(userId, entitled, end);
}

async function recordWebhook(event) {
  const result = await pool.query(
    `INSERT INTO stripe_webhook_events (event_id, event_type) VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
    [event.id, event.type]
  );
  return result.rowCount === 1;
}

router.get('/pricing', (req, res) => {
  const p = pricing(countryFromReq(req));
  if (p.provider === 'stripe' && process.env.STRIPE_PUBLISHABLE_KEY) p.publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  res.json({ success: true, ...p });
});

router.post('/checkout', verifyCsrf, isAuthenticated, async (req, res) => {
  try {
    const stripe = stripeClient();
    if (!stripe) return res.status(503).json({ success: false, error: 'Stripe non configuré' });

    const userId = req.session.user.id;
    const plan = req.body.plan === 'yearly' ? 'yearly' : req.body.plan === 'monthly' ? 'monthly' : null;
    if (!plan) return res.status(400).json({ success: false, error: 'Plan invalide' });

    const existing = await pool.query(
      `SELECT * FROM subscriptions WHERE user_id = $1 AND stripe_subscription_id IS NOT NULL
       AND stripe_status IN ('active','trialing','past_due') ORDER BY id DESC LIMIT 1`,
      [userId]
    );
    if (existing.rows[0]) return res.status(409).json({ success: false, error: 'Vous avez déjà un abonnement actif.' });

    const country = countryFromReq(req);
    const p = pricing(country);
    if (p.provider !== 'stripe') return res.status(400).json({ success: false, error: 'Ce pays utilise un moyen de paiement local.' });

    const user = await pool.query('SELECT id, email, username, subscription_trial_used_at FROM users WHERE id = $1', [userId]);
    if (!user.rows[0]) return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });

    let customerId = existing.rows[0]?.stripe_customer_id || null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.rows[0].email,
        name: user.rows[0].username,
        metadata: { solitiquo_user_id: String(userId) },
      });
      customerId = customer.id;
    }

    const trialEligible = plan === 'monthly' && !user.rows[0].subscription_trial_used_at;
    const metadata = { solitiquo_user_id: String(userId), solitiquo_plan: plan, solitiquo_currency: p.currency };
    const sessionConfig = {
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: p[plan], quantity: 1 }],
      success_url: `${BASE_URL}/paiement-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/paiement.html?plan=${plan}&cancelled=true`,
      client_reference_id: String(userId),
      metadata,
      subscription_data: { metadata },
      payment_method_collection: 'always',
      integration_identifier: `solitiquo_${Math.random().toString(36).slice(2, 10)}`,
    };
    if (trialEligible) sessionConfig.subscription_data.trial_period_days = 30;

    const session = await stripe.checkout.sessions.create(sessionConfig);
    res.json({ success: true, checkout_url: session.url, session_id: session.id });
  } catch (err) {
    console.error('Stripe Checkout error:', err);
    res.status(500).json({ success: false, error: 'Impossible de créer la session de paiement.' });
  }
});

router.post('/portal', verifyCsrf, isAuthenticated, async (req, res) => {
  try {
    const stripe = stripeClient();
    const userId = req.session.user.id;
    const result = await pool.query(`SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1 AND stripe_customer_id IS NOT NULL ORDER BY id DESC LIMIT 1`, [userId]);
    if (!stripe || !result.rows[0]) return res.status(404).json({ success: false, error: 'Client Stripe introuvable.' });
    const portal = await stripe.billingPortal.sessions.create({ customer: result.rows[0].stripe_customer_id, return_url: `${BASE_URL}/profil.html` });
    res.json({ success: true, url: portal.url });
  } catch (err) {
    console.error('Stripe Portal error:', err);
    res.status(500).json({ success: false, error: 'Impossible d’ouvrir la gestion de votre abonnement.' });
  }
});

router.post('/cancel', verifyCsrf, isAuthenticated, async (req, res) => {
  try {
    const stripe = stripeClient();
    const userId = req.session.user.id;
    const result = await pool.query(`SELECT * FROM subscriptions WHERE user_id = $1 AND stripe_subscription_id IS NOT NULL AND stripe_status IN ('active','trialing','past_due') ORDER BY id DESC LIMIT 1`, [userId]);
    const sub = result.rows[0];
    if (!stripe || !sub) return res.status(404).json({ success: false, error: 'Aucun abonnement actif.' });

    const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
    if (stripeSub.status === 'trialing') {
      const canceled = await stripe.subscriptions.cancel(sub.stripe_subscription_id);
      await pool.query(`UPDATE subscriptions SET stripe_status='canceled', status='cancelled', stripe_cancel_at_period_end=false, ends_at=NOW(), updated_at=NOW() WHERE id=$1`, [sub.id]);
      await setLocalEntitlement(userId, false, new Date());
      return res.json({ success: true, immediate: true, ends_at: new Date(canceled.canceled_at * 1000).toISOString() });
    }

    const updated = await stripe.subscriptions.update(sub.stripe_subscription_id, { cancel_at_period_end: true });
    const end = new Date(updated.current_period_end * 1000);
    await pool.query(`UPDATE subscriptions SET stripe_cancel_at_period_end=true, stripe_current_period_end=$1, ends_at=$1, updated_at=NOW() WHERE id=$2`, [end, sub.id]);
    await setLocalEntitlement(userId, true, end);
    res.json({ success: true, immediate: false, ends_at: end.toISOString() });
  } catch (err) {
    console.error('Stripe cancellation error:', err);
    res.status(500).json({ success: false, error: 'Impossible de résilier l’abonnement.' });
  }
});

router.post('/reactivate', verifyCsrf, isAuthenticated, async (req, res) => {
  try {
    const stripe = stripeClient();
    const userId = req.session.user.id;
    const result = await pool.query(`SELECT * FROM subscriptions WHERE user_id=$1 AND stripe_subscription_id IS NOT NULL AND stripe_status IN ('active','trialing','past_due') ORDER BY id DESC LIMIT 1`, [userId]);
    const sub = result.rows[0];
    if (!stripe || !sub) return res.status(404).json({ success: false, error: 'Aucun abonnement réactivable.' });
    const updated = await stripe.subscriptions.update(sub.stripe_subscription_id, { cancel_at_period_end: false });
    await pool.query(`UPDATE subscriptions SET stripe_cancel_at_period_end=false, stripe_current_period_end=$1, ends_at=$1, updated_at=NOW() WHERE id=$2`, [new Date(updated.current_period_end * 1000), sub.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Stripe reactivation error:', err);
    res.status(500).json({ success: false, error: 'Impossible de réactiver l’abonnement.' });
  }
});

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
        const subscription = await stripe.subscriptions.retrieve(session.subscription, { expand: ['items.data.price.product'] });
        await upsertSubscription(subscription, session, userId);
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
        const metaUserId = subscription.metadata?.solitiquo_user_id;
        const userId = Number(metaUserId || 0);
        let resolvedUserId = userId;
        if (!resolvedUserId) {
          const r = await pool.query('SELECT user_id FROM subscriptions WHERE stripe_customer_id=$1 ORDER BY id DESC LIMIT 1', [customerId]);
          resolvedUserId = r.rows[0]?.user_id;
        }
        if (resolvedUserId) await upsertSubscription(subscription, null, resolvedUserId);
        break;
      }
      case 'invoice.paid': {
        const invoice = event.data.object;
        const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
        if (!subId) break;
        await pool.query(`UPDATE subscriptions SET stripe_status='active', payment_failed_at=NULL, payment_grace_ends_at=NULL, status='active', updated_at=NOW() WHERE stripe_subscription_id=$1`, [subId]);
        break;
      }
      case 'invoice.payment_failed':
      case 'invoice.payment_action_required': {
        const invoice = event.data.object;
        const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
        if (!subId) break;
        await pool.query(`UPDATE subscriptions SET payment_failed_at=COALESCE(payment_failed_at,NOW()), payment_grace_ends_at=COALESCE(payment_grace_ends_at,NOW()+INTERVAL '5 days'), stripe_status='past_due', status='active', updated_at=NOW() WHERE stripe_subscription_id=$1`, [subId]);
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
