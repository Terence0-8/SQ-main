// backend/middleware/siteAccess.js
'use strict';

const crypto = require('crypto');
const appConfig = require('../config/appConfig');

/**
 * Middleware de protection globale du site par mot de passe (HTTP Basic Auth)
 * et de gestion des directives de non-indexation SEO (X-Robots-Tag).
 */
function siteAccessMiddleware(req, res, next) {
  // 1. Directive de non-indexation SEO (en-tête HTTP universel pour HTML, JSON, assets)
  if (appConfig.isNoIndex) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }

  // 2. Si la protection par mot de passe n'est pas activée, continuer
  if (!appConfig.siteAccess.enabled) {
    return next();
  }

  const reqPath = req.path || '';

  // 3. Exception stricte pour le health check applicatif
  if (reqPath === '/api/ping' || reqPath === '/api/health/live') {
    return next();
  }

  // 4. Exception strictement ciblée pour les webhooks Stripe & Flutterwave
  // Exige obligatoirement la présence de la signature / hash secret configuré
  if (req.method === 'POST') {
    // Stripe webhooks
    if (reqPath === '/api/stripe/webhook' || reqPath === '/api/subscriptions/stripe-webhook') {
      const stripeSig = req.headers['stripe-signature'];
      const stripeSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (stripeSig && stripeSecret) {
        return next();
      }
    }

    // Flutterwave webhook
    if (reqPath === '/api/subscriptions/webhook') {
      const flwHash = req.headers['verif-hash'];
      const flwSecret = process.env.FLUTTERWAVE_WEBHOOK_SECRET;
      if (flwHash && flwSecret && flwHash === flwSecret) {
        return next();
      }
    }
  }

  // 5. Vérification HTTP Basic Auth
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Solitiquo Private Beta", charset="UTF-8"');
    return res.status(401).send('Accès restreint. Veuillez renseigner les identifiants d\'accès.');
  }

  let credentials;
  try {
    const base64Part = authHeader.slice(6).trim();
    credentials = Buffer.from(base64Part, 'base64').toString('utf8');
  } catch (_err) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Solitiquo Private Beta", charset="UTF-8"');
    return res.status(401).send('Identifiants invalides.');
  }

  const colonIndex = credentials.indexOf(':');
  if (colonIndex === -1) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Solitiquo Private Beta", charset="UTF-8"');
    return res.status(401).send('Format d\'identifiants invalide.');
  }

  const providedUser = credentials.slice(0, colonIndex);
  const providedPass = credentials.slice(colonIndex + 1);

  // Comparaison sécurisée en temps constant (SHA-256) pour contrer les attaques temporelles
  const expectedUserHash = crypto.createHash('sha256').update(appConfig.siteAccess.user).digest();
  const providedUserHash = crypto.createHash('sha256').update(providedUser).digest();
  const expectedPassHash = crypto.createHash('sha256').update(appConfig.siteAccess.password).digest();
  const providedPassHash = crypto.createHash('sha256').update(providedPass).digest();

  const userMatch = crypto.timingSafeEqual(expectedUserHash, providedUserHash);
  const passMatch = crypto.timingSafeEqual(expectedPassHash, providedPassHash);

  if (!userMatch || !passMatch) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Solitiquo Private Beta", charset="UTF-8"');
    return res.status(401).send('Identifiants incorrects.');
  }

  // Authentification Basic réussie
  return next();
}

module.exports = siteAccessMiddleware;

