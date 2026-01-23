const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const Joi = require('joi');
const axios = require('axios');
const { isAuthenticated } = require('../middleware/auth');

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
    const { plan } = req.body; // 'monthly' ou 'yearly'

    // 1. Définir le montant
    let amount = 0;
    let description = "";

    if (plan === 'monthly') {
      amount = 2000;
      description = "Abonnement Mensuel Solitiquo";
    } else if (plan === 'yearly') {
      amount = 20000;
      description = "Abonnement Annuel Solitiquo";
    } else {
      return res.status(400).json({ success: false, error: "Plan invalide" });
    }

    // 2. Créer ID de transaction unique
    const transactionId = `SOL-${Date.now()}-${userId}`;

    // 3. Enregistrer la transaction en BDD (État PENDING)
    await pool.query(
      `INSERT INTO subscriptions (user_id, plan, amount, transaction_id, status, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, 'pending', NOW(), NOW())`,
      [userId, plan, amount, transactionId]
    );

    // 4. Préparer payload CinetPay
    const payload = {
      apikey: CINETPAY_API_KEY,
      site_id: CINETPAY_SITE_ID,
      transaction_id: transactionId,
      amount: amount,
      currency: 'XAF',
      channels: 'ALL',
      description: description,
      customer_id: userId.toString(),
      customer_name: req.session.user.username || 'Client',
      customer_email: req.session.user.email || 'client@solitiquo.com',
      return_url: `${BASE_URL}/paiement-success.html?transaction_id=${transactionId}`,
      notify_url: `${BASE_URL}/api/subscriptions/webhook` // URL appelée par CinetPay
    };

    // 5. Appel API CinetPay
    const response = await axios.post(`${process.env.CINETPAY_BASE_URL}`, payload);

    if (response.data.code === '201') {
      // Succès : on renvoie l'URL de paiement au front
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
// 2. WEBHOOK (Notification CinetPay)
// CinetPay appelle cette route pour confirmer le paiement
// ==========================================
router.post('/webhook', async (req, res) => {
  // IMPORTANT: Cette route est publique (pas de isAuthenticated) car CinetPay l'appelle
  try {
    const { cpm_trans_id, cpm_site_id } = req.body;

    // Vérification basique
    if (cpm_site_id !== CINETPAY_SITE_ID) {
      return res.status(400).send("Invalid Site ID");
    }

    // VERIFICATION D'ÉTAT AUPRÈS DE CINETPAY
    // On ne fait pas confiance aveuglément au push, on vérifie l'état réel
    const checkPayload = {
      apikey: CINETPAY_API_KEY,
      site_id: CINETPAY_SITE_ID,
      transaction_id: cpm_trans_id
    };

    const checkRes = await axios.post(`${process.env.CINETPAY_BASE_URL}/check`, checkPayload);
    const data = checkRes.data.data;

    if (data.payment_method && data.status === 'ACCEPTED') {
      console.log(`✅ Paiement validé pour transaction ${cpm_trans_id}`);

      // 1. Mettre à jour la transaction
      const updateSub = await pool.query(
        `UPDATE subscriptions 
         SET status = 'active', payment_method = $1, updated_at = NOW(),
             starts_at = NOW(),
             ends_at = NOW() + INTERVAL '1 month' -- Par défaut 1 mois, à ajuster selon le plan stocké
         WHERE transaction_id = $2
         RETURNING user_id, plan`,
        [data.payment_method, cpm_trans_id]
      );

      if (updateSub.rows.length > 0) {
        const { user_id, plan } = updateSub.rows[0];

        // Calculer la vraie date de fin
        const interval = plan === 'yearly' ? '1 year' : '1 month';

        // 2. Activer l'utilisateur (Le Graal)
        await pool.query(
          `UPDATE users 
           SET is_subscriber = TRUE, 
               subscription_start_date = NOW(),
               subscription_end_date = NOW() + INTERVAL '${interval}',
               updated_at = NOW()
           WHERE id = $1`,
          [user_id]
        );

        // 3. Mettre à jour la date de fin précise dans subscriptions aussi
        await pool.query(
          `UPDATE subscriptions SET ends_at = NOW() + INTERVAL '${interval}' WHERE transaction_id = $1`,
          [cpm_trans_id]
        );
      }

      res.status(200).send('OK');
    } else {
      console.log(`⚠️ Paiement échoué ou en attente : ${data.status}`);
      await pool.query("UPDATE subscriptions SET status = 'failed' WHERE transaction_id = $1", [cpm_trans_id]);
      res.status(200).send('OK (Failed)');
    }

  } catch (err) {
    console.error('❌ Erreur Webhook:', err);
    res.status(500).send('Webhook Error');
  }
});

// ==========================================
// 3. VÉRIFICATION MANUELLE (Fallback)
// Si le webhook rate, le front peut appeler ça
// ==========================================
router.post('/check-status', isAuthenticated, async (req, res) => {
  try {
    const { transaction_id } = req.body;

    // Même logique de vérification que le webhook
    // (Simplifié pour l'exemple, idéalement factoriser la fonction de check)

    const checkPayload = {
      apikey: CINETPAY_API_KEY,
      site_id: CINETPAY_SITE_ID,
      transaction_id: transaction_id
    };

    const checkRes = await axios.post(`${process.env.CINETPAY_BASE_URL}/check`, checkPayload);

    if (checkRes.data.code === '00' && checkRes.data.data.status === 'ACCEPTED') {
      // Logique de validation (copie du webhook)
      // ... (Pour éviter la duplication, en prod on extrait cette logique)
      res.json({ success: true, status: 'ACCEPTED' });
    } else {
      res.json({ success: false, status: 'PENDING' });
    }

  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// ==========================================
// 4. MODE DÉVELOPPEUR : SIMULATEUR DE PAIEMENT
// (À utiliser UNIQUEMENT si pas de clés API)
// ==========================================
router.post('/simulate-payment', isAuthenticated, async (req, res) => {
  // Sécurité : On refuse si on est en Production pour ne pas offrir d'abos gratuits
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ success: false, error: "Interdit en production" });
  }

  const userId = req.session.user.id;
  const { plan } = req.body;
  const transactionId = `MOCK-${Date.now()}-${userId}`;

  try {
    // 1. Calculer la durée comme si c'était vrai
    const interval = plan === 'yearly' ? '1 year' : '1 month';

    // 2. Créer la fausse transaction 'ACCEPTED'
    await pool.query(
      `INSERT INTO subscriptions (user_id, plan, amount, transaction_id, status, payment_method, starts_at, ends_at)
         VALUES ($1, $2, $3, $4, 'active', 'SIMULATOR', NOW(), NOW() + INTERVAL '${interval}')`,
      [userId, plan, (plan === 'yearly' ? 20000 : 2000), transactionId]
    );

    // 3. Activer l'utilisateur
    await pool.query(
      `UPDATE users 
         SET is_subscriber = TRUE, 
             subscription_start_date = NOW(),
             subscription_end_date = NOW() + INTERVAL '${interval}',
             updated_at = NOW()
         WHERE id = $1`,
      [userId]
    );

    // 4. MISE À JOUR SESSION IMMÉDIATE (pour accès premium instantané)
    if (req.session && req.session.user) {
      req.session.user.is_subscriber = true;
      req.session.save(); // Force l'écriture immédiate
    }

    console.log(`🚀 Abonnement SIMULÉ activé pour l'user ${userId}`);

    // On renvoie une URL de succès fictive
    res.json({
      success: true,
      payment_url: `${BASE_URL}/paiement-success.html?transaction_id=${transactionId}&mock=true`
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur simulateur" });
  }
});

module.exports = router;