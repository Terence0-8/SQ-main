// backend/config/appConfig.js
'use strict';

require('dotenv').config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';
const isTest = NODE_ENV === 'test';
const PORT = parseInt(process.env.PORT, 10) || 5000;

// Base URL configurable (préproduction, production, dev)
const rawBaseUrl = process.env.BASE_URL || process.env.FRONTEND_URL;
const BASE_URL = rawBaseUrl
  ? rawBaseUrl.replace(/\/+$/, '')
  : (isProduction ? 'https://solitiquo.com' : `http://localhost:${PORT}`);

const FRONTEND_URL = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.replace(/\/+$/, '')
  : BASE_URL;

// CORS Origins
let ALLOWED_ORIGINS;
if (process.env.ALLOWED_ORIGINS) {
  ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    .split(',')
    .map(o => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  if (!ALLOWED_ORIGINS.includes(BASE_URL)) ALLOWED_ORIGINS.push(BASE_URL);
  if (!ALLOWED_ORIGINS.includes(FRONTEND_URL)) ALLOWED_ORIGINS.push(FRONTEND_URL);
} else if (isProduction) {
  ALLOWED_ORIGINS = [BASE_URL];
  if (FRONTEND_URL !== BASE_URL) ALLOWED_ORIGINS.push(FRONTEND_URL);
} else {
  ALLOWED_ORIGINS = true; // Permissif en dev / test
}

// Reverse proxy trust (Railway edge proxy / Cloudflare)
const trustProxy = process.env.TRUST_PROXY === 'true' || isProduction;

// Protection SEO / noindex (dynamique : activée si ROBOTS_NOINDEX=true ou si SITE_ACCESS_ENABLED=true)
function checkIsNoIndex() {
  return process.env.ROBOTS_NOINDEX === 'true' || siteAccess.enabled;
}

// Site Access (HTTP Basic Auth)
const siteAccess = {
  enabled: process.env.SITE_ACCESS_ENABLED === 'true',
  user: process.env.SITE_ACCESS_USER ? String(process.env.SITE_ACCESS_USER).trim() : '',
  password: process.env.SITE_ACCESS_PASSWORD ? String(process.env.SITE_ACCESS_PASSWORD) : '',
};

function validateSiteAccessConfig() {
  if (siteAccess.enabled) {
    if (!siteAccess.user || !siteAccess.password) {
      throw new Error(
        '❌ FATAL: SITE_ACCESS_ENABLED=true mais SITE_ACCESS_USER ou SITE_ACCESS_PASSWORD est manquant. Le serveur refuse de démarrer pour protéger le site.'
      );
    }
  }
}

module.exports = {
  NODE_ENV,
  isProduction,
  isTest,
  PORT,
  BASE_URL,
  FRONTEND_URL,
  ALLOWED_ORIGINS,
  trustProxy,
  get isNoIndex() {
    return checkIsNoIndex();
  },
  siteAccess,
  validateSiteAccessConfig,
};
