require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const pool = require('./backend/config/database');
const slugResolver = require('./backend/middleware/slugResolver');
const seoController = require('./backend/controllers/seoController');
const legacyRedirects = require('./backend/routes/legacyRedirects');

const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';
const BASE_URL = isProduction ? 'https://solitiquo.com' : `http://localhost:${PORT}`;

// =============================================================================
// 1. COMPRESSION (avant tout le reste pour maximiser l'effet)
// =============================================================================
app.use(compression());

// =============================================================================
// 2. FICHIERS STATIQUES — Cache HTTP par type de fichier
// =============================================================================
// ETag & Last-Modified activés par défaut (→ réponses 304 Not Modified)
// HTML : pas de cache (mises à jour immédiates)
// CSS / JS / polices : cache 7 jours
// Images : cache 30 jours
const setStaticCacheHeaders = (res, filePath) => {
  if (/\.(html?)$/i.test(filePath)) {
    res.setHeader('Cache-Control', 'no-cache');
  } else if (/\.(css|js|woff2?|ttf|otf|eot)$/i.test(filePath)) {
    res.setHeader('Cache-Control', 'public, max-age=604800');   // 7 jours
  } else if (/\.(png|jpe?g|gif|ico|svg|webp)$/i.test(filePath)) {
    res.setHeader('Cache-Control', 'public, max-age=2592000');  // 30 jours
  }
};

const staticOptions = { setHeaders: setStaticCacheHeaders, etag: true, lastModified: true };
app.use(express.static(__dirname, staticOptions));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), staticOptions));
app.use(['/fr', '/en'], express.static(__dirname, staticOptions));

// =============================================================================
// 2. SÉCURITÉ & MIDDLEWARES
// =============================================================================
app.use(helmet({
  contentSecurityPolicy: isProduction ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://www.googletagmanager.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://res.cloudinary.com"],
      mediaSrc: ["'self'", "https://res.cloudinary.com"],
      frameSrc: ["'self'", "https://www.youtube.com", "https://www.youtube-nocookie.com", "https://www.facebook.com", "https://w.soundcloud.com"]
    }
  } : false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

const corsOptions = {
  origin: isProduction ? (process.env.ALLOWED_ORIGINS || '').split(',') : true,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Rate Limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  message: { success: false, error: 'Trop de requêtes, réessayez dans 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false
});

// Session
app.use(session({
  store: new (require('connect-pg-simple')(session))({
    pool: pool,
    tableName: 'session_user_cookies',
    createTableIfMissing: true
  }),
  secret: (() => {
    if (!process.env.SESSION_SECRET) throw new Error('❌ SESSION_SECRET manquant dans .env - Le serveur refuse de démarrer.');
    return process.env.SESSION_SECRET;
  })(),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000
  }
}));

// Synchro Session (Anti-Ban & Robustesse)
app.use(async (req, res, next) => {
  if (req.session?.user?.id) { // Robustesse : Optional chaining
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
const crypto = require('crypto');
app.use((req, res, next) => {
  if (!req.session) return next(); // Safety check
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
});

app.get('/api/csrf-token', (req, res) => res.json({ csrfToken: req.session?.csrfToken }));

const verifyCsrf = (req, res, next) => {
  if (['GET', 'OPTIONS', 'HEAD'].includes(req.method)) return next();
  const token = req.headers['x-csrf-token'] || (req.body && req.body._csrf);
  if (!isProduction && !token) return next();
  if (isProduction && token !== req.session?.csrfToken) {
    return res.status(403).json({ success: false, error: 'Token CSRF invalide' });
  }
  next();
};
app.use('/api/admin', verifyCsrf);

// =============================================================================
// 3. ROUTING & CONTROLLERS
// =============================================================================

// Redirections Legacy (301)
app.use(legacyRedirects);

// Routes API
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

// Note: Static files moved to top

// SEO Friendly Routing (Front-Controller for SEO)
app.use(slugResolver); // 1. Resolve Slug
app.get(/^\/(fr|en)\/([^/]+)\/(?!.*\.(css|js|png|jpg|jpeg|gif|ico|svg|json)$)(.+)$/, seoController.handleSeoRoute); // 2. Inject Meta

// SPA Fallback (Language Roots)
app.get(/^\/(fr|en)\/?$/, (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get(/^\/(fr|en)\/([^/]+)\/?$/, (req, res, next) => {
  console.log(`🔍 Routing check: /${req.params[0]}/${req.params[1]}`);

  // Redirection propre: /fr/index -> /fr
  if (req.params[1] === 'index') {
    return res.redirect(`/${req.params[0]}`);
  }

  const map = {
    'politique': 'politique.html',
    'social': 'social.html',
    'emissions': 'emissions.html',
    'podcasts': 'podcasts.html',
    'partis': 'partis-politiques.html',
    'parties': 'partis-politiques.html',
    'partis-politiques': 'partis-politiques.html',
    'admin': 'admin.html'
  };
  if (map[req.params[1]]) return res.sendFile(path.join(__dirname, map[req.params[1]]));
  next();
});

// Health Check
app.get('/api/health', (req, res) => res.json({ status: 'Server Running', environment: isProduction ? 'production' : 'development' }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Error Handling
app.use('/api', (req, res) => res.status(404).json({ success: false, error: 'Route API introuvable' }));
app.use((err, req, res, next) => {
  console.error('❌ Erreur serveur:', err.message);
  res.status(500).json({ success: false, error: isProduction ? 'Erreur serveur' : err.message });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Serveur Solitiquo (OPTIMIZED) lancé sur ${BASE_URL}`);
  console.log(`🔒 Mode : ${isProduction ? 'PRODUCTION' : 'DEVELOPPEMENT'}`);
});
