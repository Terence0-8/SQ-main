require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const pool = require('./backend/config/database');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';
const BASE_URL = 'https://solitiquo.com'; // URL de production anticipée

// =============================================================================
// 1. SÉCURITÉ HEADERS HTTP - HELMET.JS
// =============================================================================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://cdn.jsdelivr.net",
        "https://www.googletagmanager.com"
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com"
      ],
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com"
      ],
      imgSrc: [
        "'self'",
        "data:",
        "https:",
        "blob:"
      ],
      connectSrc: [
        "'self'",
        "https://res.cloudinary.com"
      ],
      mediaSrc: [
        "'self'",
        "https://res.cloudinary.com"
      ],
      frameSrc: [
        "'self'",
        "https://www.youtube.com",
        "https://www.youtube-nocookie.com",
        "https://www.facebook.com",
        "https://w.soundcloud.com" // Ajout potentiel pour podcasts externes
      ]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// =============================================================================
// 2. MIDDLEWARES DE BASE
// =============================================================================
const corsOptions = {
  origin: isProduction
    ? (process.env.ALLOWED_ORIGINS || '').split(',')
    : true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
};
app.use(cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// =============================================================================
// ⚡ SEO & SSR - INJECTION DYNAMIQUE (ARTICLES, PODCASTS, ÉMISSIONS)
// =============================================================================

// Fonction utilitaire pour injecter les balises
const injectMetaTags = (html, data) => {
  const title = `${data.title} — Solitiquo`;
  const description = (data.description || "Le média de référence au Cameroun.").replace(/"/g, '&quot;');
  const image = data.image || `${BASE_URL}/social-share.jpg`;
  const url = data.url;

  const metaTags = `
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <link rel="canonical" href="${url}" />
    
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${image}" />

    <meta property="twitter:card" content="summary_large_image" />
    <meta property="twitter:url" content="${url}" />
    <meta property="twitter:title" content="${title}" />
    <meta property="twitter:description" content="${description}" />
    <meta property="twitter:image" content="${image}" />
  `;

  return html
    .replace(/<title>.*?<\/title>/i, '')
    .replace('</head>', `${metaTags}</head>`);
};

// --- A. Route SITEMAP XML (Global) ---
app.get('/sitemap.xml', async (req, res) => {
  try {
    const staticPages = ['index.html', 'politique.html', 'social.html', 'partis-politiques.html', 'podcasts.html', 'emissions.html', 'auth.html', 'abonnement.html'];

    // Récupération parallèle des contenus
    const [articles, podcasts, emissions] = await Promise.all([
      pool.query("SELECT id, updated_at FROM articles WHERE status = 'published' ORDER BY updated_at DESC"),
      pool.query("SELECT id, updated_at FROM podcasts WHERE status = 'published' ORDER BY updated_at DESC"),
      pool.query("SELECT id, updated_at FROM emissions WHERE status = 'published' ORDER BY updated_at DESC")
    ]);

    let xml = '<?xml version="1.0" encoding="UTF-8"?>';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';

    // Pages statiques
    staticPages.forEach(page => {
      xml += `<url><loc>${BASE_URL}/${page}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`;
    });

    // Articles
    articles.rows.forEach(item => {
      xml += `<url><loc>${BASE_URL}/article.html?id=${item.id}</loc><lastmod>${new Date(item.updated_at).toISOString()}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`;
    });

    // Podcasts
    podcasts.rows.forEach(item => {
      xml += `<url><loc>${BASE_URL}/podcast.html?id=${item.id}</loc><lastmod>${new Date(item.updated_at).toISOString()}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>`;
    });

    // Émissions
    emissions.rows.forEach(item => {
      xml += `<url><loc>${BASE_URL}/emission.html?id=${item.id}</loc><lastmod>${new Date(item.updated_at).toISOString()}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>`;
    });

    xml += '</urlset>';
    res.header('Content-Type', 'application/xml');
    res.send(xml);

  } catch (err) {
    console.error('❌ Sitemap Error:', err);
    res.status(500).end();
  }
});

// --- B. Intercepteur ARTICLES ---
app.get('/article.html', async (req, res, next) => {
  if (!req.query.id) return next();
  try {
    const { rows } = await pool.query("SELECT title, excerpt, featured_image FROM articles WHERE id = $1", [req.query.id]);
    if (rows.length === 0) return next();

    fs.readFile(path.join(__dirname, 'article.html'), 'utf8', (err, html) => {
      if (err) return next();
      const finalHtml = injectMetaTags(html, {
        title: rows[0].title,
        description: rows[0].excerpt,
        image: rows[0].featured_image,
        url: `${BASE_URL}/article.html?id=${req.query.id}`
      });
      res.send(finalHtml);
    });
  } catch (err) { next(); }
});

// --- C. Intercepteur PODCASTS ---
app.get('/podcast.html', async (req, res, next) => {
  if (!req.query.id) return next();
  try {
    const { rows } = await pool.query("SELECT title, description, cover_image FROM podcasts WHERE id = $1", [req.query.id]);
    if (rows.length === 0) return next();

    fs.readFile(path.join(__dirname, 'podcast.html'), 'utf8', (err, html) => {
      if (err) return next();
      const finalHtml = injectMetaTags(html, {
        title: rows[0].title,
        description: rows[0].description,
        image: rows[0].cover_image,
        url: `${BASE_URL}/podcast.html?id=${req.query.id}`
      });
      res.send(finalHtml);
    });
  } catch (err) { next(); }
});

// --- D. Intercepteur ÉMISSIONS ---
app.get('/emission.html', async (req, res, next) => {
  if (!req.query.id) return next(); // Attention: le fichier s'appelle peut-être emissions.html (pluriel) ou emission.html (singulier) ? Vérifie le nom.
  // Basé sur tes fichiers uploadés, tu as 'emissions.html' (liste) mais pas de 'emission.html' (détail) clair dans la liste ?
  // Je suppose ici que tu vas créer une page de détail 'emission.html' ou 'video.html'.
  // Si tu utilises une modal sur la page liste, le SEO ne marchera pas pareil.
  // ASSUMPTION: Tu as ou auras une page de détail.

  try {
    const { rows } = await pool.query("SELECT title, description, thumbnail_url FROM emissions WHERE id = $1", [req.query.id]);
    if (rows.length === 0) return next();

    // Note: Vérifie si le fichier est emission.html ou video.html
    const templatePath = path.join(__dirname, 'emissions.html');

    fs.readFile(templatePath, 'utf8', (err, html) => {
      if (err) return next();
      const finalHtml = injectMetaTags(html, {
        title: rows[0].title,
        description: rows[0].description,
        image: rows[0].thumbnail_url,
        url: `${BASE_URL}/emissions.html?id=${req.query.id}` // Lien vers la liste filtrée si pas de page détail
      });
      res.send(finalHtml);
    });
  } catch (err) { next(); }
});


// Servir les fichiers statiques (HTML, CSS, JS) - Doit être APRÈS les intercepteurs
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// =============================================================================
// 3. RATE LIMITING & SESSIONS
// =============================================================================
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  message: { success: false, error: 'Trop de requêtes, réessayez dans 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false
});

app.use(session({
  store: new (require('connect-pg-simple')(session))({
    pool: pool,
    tableName: 'session_user_cookies',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || 'secret_solitiquo_secure',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000
  }
}));

// =============================================================================
// 4. PROTECTION CSRF
// =============================================================================
const crypto = require('crypto');

app.use((req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
});

app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: req.session.csrfToken });
});

const verifyCsrf = (req, res, next) => {
  if (['GET', 'OPTIONS', 'HEAD'].includes(req.method)) return next();
  const token = req.headers['x-csrf-token'] || req.body._csrf;
  if (!isProduction && !token) return next();
  if (isProduction && token !== req.session.csrfToken) {
    return res.status(403).json({ success: false, error: 'Token CSRF invalide' });
  }
  next();
};

app.use('/api/admin', verifyCsrf);

// =============================================================================
// 5. ROUTES API
// =============================================================================
try {
  app.use('/api/articles', require('./backend/routes/articles'));
  app.use('/api/polls', require('./backend/routes/polls'));
  app.use('/api/comments', require('./backend/routes/comments'));
  app.use('/api/auth', require('./backend/routes/auth'));
  app.use('/api/podcasts', require('./backend/routes/podcasts')); // Déjà là, parfait
  app.use('/api/admin', require('./backend/routes/admin'));
  app.use('/api/analytics', require('./backend/routes/analytics'));
  app.use('/api/emissions', require('./backend/routes/emissions')); // Déjà là, parfait
  app.use('/api/contact', require('./backend/routes/contact'));
  app.use('/api/search', require('./backend/routes/search'));
  app.use('/api/subscriptions', require('./backend/routes/subscriptions'));
  app.use('/api/parties', require('./backend/routes/parties'));
  console.log('✅ Toutes les routes API chargées');
} catch (error) {
  console.error("❌ Erreur chargement routes:", error.message);
}

// =============================================================================
// 6. SERVER START & ERROR HANDLING
// =============================================================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'Server Running',
    environment: isProduction ? 'production' : 'development',
    seo_engine: 'Active (Articles, Podcasts, Emissions)'
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use('/api', (req, res) => res.status(404).json({ success: false, error: 'Route API introuvable' }));

app.use((err, req, res, next) => {
  console.error('❌ Erreur serveur:', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ success: false, error: 'Fichier trop volumineux' });
  res.status(500).json({ success: false, error: isProduction ? 'Erreur serveur' : err.message });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Serveur Solitiquo (FULL) lancé sur http://localhost:${PORT}`);
  console.log(`🌍 SEO Engine: Prêt pour ${BASE_URL}`);
  console.log(`🛡️  Mode : ${isProduction ? 'PRODUCTION' : 'DEVELOPPEMENT'}`);
});