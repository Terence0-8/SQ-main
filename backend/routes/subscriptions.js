// backend/routes/subscriptions.js (VERSION SÉCURISÉE)
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const Joi = require('joi');
const axios = require('axios');
const { isAuthenticated } = require('../middleware/auth');

// ==========================================
// HELPER: VALIDATION PLAN & INTERVALLE
// ==========================================
const PLAN_CONFIG = {
  'monthly': {
    amount: 2000,
    interval: '1 month',
    description: 'Abonnement Mensuel Solitiquo'
  },
  'yearly': {
    amount: 20000,
    interval: '1 year',
    description: 'Abonnement Annuel Solitiquo'
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
// 1. INITIALISER LE PAIEMENT
// ==========================================
router.post('/init-payment', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { plan } = req.body;

    // ✅ VALIDATION STRICTE
    const planConfig = validatePlan(plan);
    if (!planConfig) {
      return res.status(400).json({ success: false, error: "Plan invalide" });
    }

    const transactionId = `SOL-${Date.now()}-${userId}`;

    // ✅ REQUÊTE PARAMÉTRÉE (pas d'interpolation)
    await pool.query(
      `INSERT INTO subscriptions (user_id, plan, amount, transaction_id, status, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, 'pending', NOW(), NOW())`,
      [userId, plan, planConfig.amount, transactionId]
    );

    // Payload CinetPay
    const payload = {
      apikey: CINETPAY_API_KEY,
      site_id: CINETPAY_SITE_ID,
      transaction_id: transactionId,
      amount: planConfig.amount,
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
      res.json({
        success: true,
        payment_url: response.data.data.payment_url
      });
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
// 2. WEBHOOK (SÉCURISÉ)
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
      console.log(`✅ Paiement validé pour transaction ${cpm_trans_id}`);

      // ✅ 1. Récupérer le plan pour avoir le bon intervalle
      const subInfo = await pool.query(
        'SELECT user_id, plan FROM subscriptions WHERE transaction_id = $1',
        [cpm_trans_id]
      );

      if (subInfo.rows.length === 0) {
        return res.status(404).send('Transaction introuvable');
      }

      const { user_id, plan } = subInfo.rows[0];
      const planConfig = validatePlan(plan);

      if (!planConfig) {
        return res.status(400).send('Plan invalide');
      }

      // ✅ 2. Mise à jour subscription (SÉCURISÉE)
      await pool.query(
        `UPDATE subscriptions 
         SET status = 'active', 
             payment_method = $1, 
             updated_at = NOW(),
             starts_at = NOW(),
             ends_at = NOW() + $2::INTERVAL
         WHERE transaction_id = $3`,
        [data.payment_method, planConfig.interval, cpm_trans_id]
      );

      // ✅ 3. Activer l'utilisateur (SÉCURISÉE)
      await pool.query(
        `UPDATE users 
         SET is_subscriber = TRUE, 
             subscription_start_date = NOW(),
             subscription_end_date = NOW() + $1::INTERVAL,
             updated_at = NOW()
         WHERE id = $2`,
        [planConfig.interval, user_id]
      );

      res.status(200).send('OK');
    } else {
      console.log(`⚠️ Paiement échoué : ${data.status}`);
      await pool.query(
        "UPDATE subscriptions SET status = 'failed' WHERE transaction_id = $1",
        [cpm_trans_id]
      );
      res.status(200).send('OK (Failed)');
    }

  } catch (err) {
    console.error('❌ Erreur Webhook:', err);
    res.status(500).send('Webhook Error');
  }
});

// ==========================================
// 3. SIMULATEUR (MODE DEV) - SÉCURISÉ
// ==========================================
router.post('/simulate-payment', isAuthenticated, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ success: false, error: "Interdit en production" });
  }

  const userId = req.session.user.id;
  const { plan } = req.body;

  // ✅ VALIDATION STRICTE
  const planConfig = validatePlan(plan);
  if (!planConfig) {
    return res.status(400).json({ success: false, error: "Plan invalide" });
  }

  const transactionId = `MOCK-${Date.now()}-${userId}`;

  try {
    // ✅ REQUÊTES SÉCURISÉES
    await pool.query(
      `INSERT INTO subscriptions (user_id, plan, amount, transaction_id, status, payment_method, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, 'active', 'SIMULATOR', NOW(), NOW() + $5::INTERVAL)`,
      [userId, plan, planConfig.amount, transactionId, planConfig.interval]
    );

    await pool.query(
      `UPDATE users 
       SET is_subscriber = TRUE, 
           subscription_start_date = NOW(),
           subscription_end_date = NOW() + $1::INTERVAL,
           updated_at = NOW()
       WHERE id = $2`,
      [planConfig.interval, userId]
    );

    // Mise à jour session
    if (req.session && req.session.user) {
      req.session.user.is_subscriber = true;

      req.session.save((err) => {
        if (err) {
          console.error('Erreur sauvegarde session:', err);
          return res.status(500).json({ success: false, error: "Erreur session" });
        }

        console.log(`🚀 Abonnement SIMULÉ activé pour l'user ${userId}`);

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
// 4. RÉSILIATION (inchangé, déjà sécurisé)
// ==========================================
router.post('/cancel', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user.id;

    await pool.query(
      `UPDATE users 
       SET is_subscriber = FALSE,
           subscription_end_date = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [userId]
    );

    if (req.session && req.session.user) {
      req.session.user.is_subscriber = false;

      req.session.save((err) => {
        if (err) {
          console.error('Erreur sauvegarde session:', err);
          return res.status(500).json({ success: false, error: "Erreur session" });
        }

        console.log(`❌ Abonnement résilié pour l'user ${userId}`);

        res.json({
          success: true,
          message: "Votre abonnement a été résilié avec succès."
        });
      });
    } else {
      res.json({
        success: true,
        message: "Votre abonnement a été résilié avec succès."
      });
    }

  } catch (err) {
    console.error('Erreur résiliation:', err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
});

module.exports = router;
