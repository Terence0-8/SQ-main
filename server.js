require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const pinoHttp = require('pino-http');
const logger = require('./backend/config/logger');
const pool = require('./backend/config/database');
const slugResolver = require('./backend/middleware/slugResolver');
const seoController = require('./backend/controllers/seoController');
const legacyRedirects = require('./backend/routes/legacyRedirects');

const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';
const BASE_URL = isProduction ? 'https://solitiquo.com' : `http://localhost:${PORT}`;

// =============================================================================
// 1. COMPRESSION (avant tout le reste pour maximiser l'effet)
// =============================================================================
app.use(compression());

// HTTP request logging (silencieux en test)
if (!isTest) {
  app.use(pinoHttp({
    logger,
    // Ne pas logger les assets statiques pour ne pas noyer les vrais logs
    autoLogging: { ignore: req => /\.(css|js|png|jpg|webp|ico|svg|woff2?)$/.test(req.url) },
    customLogLevel: (_req, res) => {
      if (res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  }));
}

// Stripe webhook needs the raw body BEFORE express.json() parses it
app.use('/api/subscriptions/stripe-webhook', express.raw({ type: 'application/json' }));

// =============================================================================
// 2. FICHIERS STATIQUES — Cache HTTP par type de fichier
// =============================================================================
// ETag & Last-Modified activés par défaut (→ réponses 304 Not Modified)
// HTML : pas de cache (mises à jour immédiates)
// CSS / JS / polices : cache 7 jours
// Images : cache 30 jours
const setStaticCacheHeaders = (res, filePath) => {
  if (/\.(html?)$/i.test(filePath) || /sw\.js$/i.test(filePath)) {
    res.setHeader('Cache-Control', 'no-cache');
  } else if (/\.(css|js|woff2?|ttf|otf|eot)$/i.test(filePath)) {
    res.setHeader('Cache-Control', isProduction ? 'public, max-age=604800' : 'no-cache');   // 7 jours en prod, no-cache en dev
  } else if (/\.(png|jpe?g|gif|ico|svg|webp)$/i.test(filePath)) {
    res.setHeader('Cache-Control', 'public, max-age=2592000');  // 30 jours
  }
};

const staticOptions = { setHeaders: setStaticCacheHeaders, etag: true, lastModified: true };
// admin.html est exclu du serving statique — servi via route protégée après session/auth
const rootStatic = express.static(__dirname, staticOptions);
app.use((req, res, next) => {
  if (req.path === '/admin.html') return next();
  rootStatic(req, res, next);
});
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), staticOptions));
app.use(['/fr', '/en'], express.static(__dirname, staticOptions));

// =============================================================================
// 2. SÉCURITÉ & MIDDLEWARES
// =============================================================================
app.use(helmet({
  contentSecurityPolicy: isProduction ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://www.googletagmanager.com", "https://js.stripe.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://res.cloudinary.com", "https://api.stripe.com"],
      mediaSrc: ["'self'", "https://res.cloudinary.com"],
      frameSrc: ["'self'", "https://www.youtube.com", "https://www.youtube-nocookie.com", "https://www.facebook.com", "https://w.soundcloud.com", "https://js.stripe.com", "https://*.stripe.com"]
    }
  } : false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

const corsOptions = {
  origin: isProduction ? (process.env.ALLOWED_ORIGINS || 'https://solitiquo.com').split(',').filter(Boolean) : true,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Rate Limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  message: { success: false, error: 'Trop de requêtes, réessayez dans 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: 'Trop de tentatives de connexion, réessayez dans 15 minutes' }
});

const commentsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: 'Trop de commentaires, réessayez dans 15 minutes' }
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { success: false, error: 'Trop de requêtes admin, réessayez dans 15 minutes' }
});

app.use('/api/auth/login', loginLimiter);
app.use('/api/comments', commentsLimiter);
app.use('/api/admin', adminLimiter);
app.use(globalLimiter);

// Session
const sessionSecret = process.env.SESSION_SECRET || (isTest ? 'test-secret-only' : null);
if (!sessionSecret) throw new Error('❌ SESSION_SECRET manquant dans .env - Le serveur refuse de démarrer.');

const sessionStore = isTest
  ? undefined // MemoryStore (in-process, pas de pg)
  : new (require('connect-pg-simple')(session))({
      pool: pool,
      tableName: 'session_user_cookies',
      createTableIfMissing: true
    });

app.use(session({
  store: sessionStore,
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000
  }
}));

// Synchro Session
app.use(async (req, res, next) => {
  if (isTest || !req.session?.user?.id) return next();
  if (req.session?.user?.id) {
    try {
      const result = await pool.query('SELECT is_active, is_subscriber, role FROM users WHERE id = $1', [req.session.user.id]);
      if (result.rows.length === 0 || !result.rows[0].is_active) {
        return req.session.destroy(() => {
          if (req.xhr || req.headers.accept?.includes('json')) {
            return res.status(403).json({ success: false, error: "Compte suspendu." });
          }
          res.redirect('/auth.html?error=banned');
        });
      }
      Object.assign(req.session.user, result.rows[0]);
      req.session.save();
    } catch (err) {
      console.error("Erreur sync session:", err.message);
    }
  }
  next();
});

// CSRF Protection
const { csrfProtection, verifyCsrf } = require('./backend/middleware/csrf');
app.use(csrfProtection);

app.get('/api/csrf-token', (req, res) => res.json({ csrfToken: req.session?.csrfToken }));

const csrfExemptPaths = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/subscriptions/webhook',
  '/api/subscriptions/stripe-webhook',
  '/api/language/preference',
  '/api/analytics/track',
];

app.use('/api', (req, res, next) => {
  if (['GET', 'OPTIONS', 'HEAD'].includes(req.method)) return next();
  const fullPath = req.originalUrl.split('?')[0];
  if (csrfExemptPaths.some(exempt => fullPath === exempt)) return next();
  verifyCsrf(req, res, next);
});

// =============================================================================
// 3. ROUTING & CONTROLLERS
// =============================================================================

// Route protégée : admin.html — réservée aux admins
app.get('/admin.html', (req, res) => {
  if (!req.session?.user || req.session.user.role !== 'admin') {
    return res.redirect('/auth.html?error=access_denied');
  }
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Redirections Legacy (301)
app.use(legacyRedirects);

// Routes API
app.use('/api', (req, res, next) => {
  console.log(`📡 API Request: ${req.method} ${req.originalUrl}`);
  next();
});

const apiRoutes = [
  'articles', 'language', 'polls', 'comments', 'auth', 'podcasts',
  'admin', 'analytics', 'emissions', 'contact', 'search', 'subscriptions', 'parties', 'translate'
];

apiRoutes.forEach(route => {
  try {
    app.use(`/api/${route}`, require(`./backend/routes/${route}`));
  } catch (err) {
    console.error(`❌ Erreur chargement route ${route}:`, err.message);
  }
});

// Sitemap XML
app.get('/sitemap.xml', async (req, res) => {
  try {
    const staticPages = ['index.html', 'politique.html', 'social.html', 'partis-politiques.html', 'podcasts.html', 'emissions.html', 'auth.html', 'abonnement.html'];
    const [articles, podcasts, emissions] = await Promise.all([
      pool.query("SELECT slug, language, category, updated_at FROM articles WHERE status = 'published' ORDER BY updated_at DESC"),
      pool.query("SELECT slug, updated_at FROM podcasts WHERE status = 'published' ORDER BY updated_at DESC"),
      pool.query("SELECT slug, updated_at FROM emissions WHERE status = 'published' ORDER BY updated_at DESC")
    ]);

    let xml = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
    staticPages.forEach(p => xml += `<url><loc>${BASE_URL}/${p}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`);

    const categoryMap = { 'Politique': 'politique', 'Social': 'social', 'Économie': 'economie', 'Culture': 'culture', 'International': 'international', 'Dossiers': 'dossiers' };
    articles.rows.forEach(i => {
      const cat = categoryMap[i.category] || 'politique';
      xml += `<url><loc>${BASE_URL}/${i.language}/${cat}/${i.slug}</loc><lastmod>${new Date(i.updated_at).toISOString()}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`;
    });
    podcasts.rows.forEach(i => xml += `<url><loc>${BASE_URL}/fr/podcasts/${i.slug}</loc><lastmod>${new Date(i.updated_at).toISOString()}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>`);
    emissions.rows.forEach(i => xml += `<url><loc>${BASE_URL}/fr/emissions/${i.slug}</loc><lastmod>${new Date(i.updated_at).toISOString()}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>`);

    xml += '</urlset>';
    res.header('Content-Type', 'application/xml').send(xml);
  } catch (err) {
    console.error('❌ Sitemap Error:', err);
    res.status(500).end();
  }
});

// =============================================================================
// 4. SSR META — article.html?id=X (bots de partage social)
// Intercepte AVANT que Express serve le fichier statique.
// Si l'article existe en BDD, injecte les bonnes balises <meta> OG + Twitter.
// Si l'id est absent ou l'article introuvable, laisse passer vers le fichier
// statique normalement (fallback transparent).
// =============================================================================
app.get('/article.html', seoController.handleArticleById);

// SEO Friendly Routing
app.use(slugResolver);
app.get(/^\/(fr|en)\/([^/]+)\/(?!.*\.(css|js|png|jpg|jpeg|gif|ico|svg|json)$)(.+)$/, seoController.handleSeoRoute);

// SPA Fallback (Language Roots)
app.get(/^\/(fr|en)\/?$/, (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get(/^\/(fr|en)\/([^/]+)\/?$/, seoController.handleStaticSeoRoute);

// Health Check
app.get('/api/health', (req, res) => res.json({ status: 'Server Running', environment: isProduction ? 'production' : 'development' }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Error Handling
app.use('/api', (req, res) => res.status(404).json({ success: false, error: 'Route API introuvable' }));
app.use((err, req, res, next) => {
  logger.error({ err, method: req.method, url: req.originalUrl }, 'Erreur serveur non gérée');
  res.status(500).json({ success: false, error: isProduction ? 'Erreur serveur' : err.message });
});

if (require.main === module) {
  app.listen(PORT, () => {
    logger.info({ url: BASE_URL, env: isProduction ? 'production' : 'development' }, '🚀 Serveur Solitiquo démarré');
  });
}

module.exports = app;
