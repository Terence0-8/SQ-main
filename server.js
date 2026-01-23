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
const slugResolver = require('./backend/middleware/slugResolver');

const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';
const BASE_URL = isProduction ? 'https://solitiquo.com' : `http://localhost:${PORT}`;

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
        "https://w.soundcloud.com"
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
// MIDDLEWARE DE SYNCHRONISATION & SÉCURITÉ (Anti-Ban & Update Role)
// =============================================================================
app.use(async (req, res, next) => {
  if (req.session && req.session.user && req.session.user.id) {
    try {
      const result = await pool.query(
        'SELECT is_active, is_subscriber, role FROM users WHERE id = $1',
        [req.session.user.id]
      );

      if (result.rows.length === 0 || !result.rows[0].is_active) {
        return req.session.destroy((err) => {
          if (req.xhr || req.headers.accept && req.headers.accept.indexOf('json') > -1) {
            return res.status(403).json({ success: false, error: "Compte suspendu." });
          }
          res.redirect('/auth.html?error=banned');
        });
      }

      req.session.user.is_active = result.rows[0].is_active;
      req.session.user.is_subscriber = result.rows[0].is_subscriber;
      req.session.user.role = result.rows[0].role;
      req.session.save();

    } catch (err) {
      console.error("Erreur sync session:", err.message);
    }
  }
  next();
});

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
  const token = req.headers['x-csrf-token'] || (req.body && req.body._csrf);
  if (!isProduction && !token) return next();
  if (isProduction && token !== req.session.csrfToken) {
    return res.status(403).json({ success: false, error: 'Token CSRF invalide' });
  }
  next();
};

app.use('/api/admin', verifyCsrf);

// =============================================================================
// ✅ SEO ENGINE - URLs SEO-FRIENDLY
// =============================================================================

// Fonction utilitaire pour injecter les balises meta
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

// ==========================================
// ✅ REDIRECTIONS 301 (Anciennes URLs → Nouvelles)
// ==========================================

app.get('/article.html', async (req, res) => {
  const { id } = req.query;
  
  if (!id) {
    return res.redirect(301, '/fr/politique');
  }

  try {
    const result = await pool.query(
      'SELECT slug, language, category FROM articles WHERE id = $1 AND status = $2',
      [id, 'published']
    );

    if (result.rows.length === 0) {
      return res.redirect(301, '/fr/politique');
    }

    const { slug, language, category } = result.rows[0];
    
    const categoryMap = {
      'Politique': 'politique',
      'Social': 'social',
      'Économie': 'economie',
      'Culture': 'culture',
      'International': 'international',
      'Dossiers': 'dossiers'
    };

    const urlCategory = categoryMap[category] || 'politique';
    const newUrl = `/${language}/${urlCategory}/${slug}`;

    console.log(`♻️ Redirection 301: /article.html?id=${id} → ${newUrl}`);
    res.redirect(301, newUrl);
  } catch (err) {
    console.error('❌ Erreur redirection article:', err);
    res.redirect(301, '/fr/politique');
  }
});

app.get('/podcast.html', async (req, res) => {
  const { id } = req.query;
  
  if (!id) {
    return res.redirect(301, '/fr/podcasts');
  }

  try {
    const result = await pool.query(
      'SELECT slug FROM podcasts WHERE id = $1 AND status = $2',
      [id, 'published']
    );

    if (result.rows.length === 0) {
      return res.redirect(301, '/fr/podcasts');
    }

    const newUrl = `/fr/podcasts/${result.rows[0].slug}`;
    console.log(`♻️ Redirection 301: /podcast.html?id=${id} → ${newUrl}`);
    res.redirect(301, newUrl);
  } catch (err) {
    res.redirect(301, '/fr/podcasts');
  }
});

app.get('/emissions.html', async (req, res) => {
  const { id } = req.query;
  
  if (!id) {
    return res.redirect(301, '/fr/emissions');
  }

  try {
    const result = await pool.query(
      'SELECT slug FROM emissions WHERE id = $1 AND status = $2',
      [id, 'published']
    );

    if (result.rows.length === 0) {
      return res.redirect(301, '/fr/emissions');
    }

    const newUrl = `/fr/emissions/${result.rows[0].slug}`;
    console.log(`♻️ Redirection 301: /emissions.html?id=${id} → ${newUrl}`);
    res.redirect(301, newUrl);
  } catch (err) {
    res.redirect(301, '/fr/emissions');
  }
});

app.get('/partis.html', async (req, res) => {
  const { id } = req.query;
  
  if (!id) {
    return res.redirect(301, '/fr/partis');
  }

  try {
    const result = await pool.query(
      'SELECT slug FROM parties WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.redirect(301, '/fr/partis');
    }

    const newUrl = `/fr/partis/${result.rows[0].slug}`;
    console.log(`♻️ Redirection 301: /partis.html?id=${id} → ${newUrl}`);
    res.redirect(301, newUrl);
  } catch (err) {
    res.redirect(301, '/fr/partis');
  }
});

// ==========================================
// ✅ ROUTING SEO-FRIENDLY DYNAMIQUE
// ==========================================

// Appliquer le middleware de résolution de slug
app.use(slugResolver);

// Route générique pour tous les contenus SEO
app.get('/:lang(fr|en)/:category/:slug(*)', async (req, res, next) => {
  // Si le slug n'a pas été résolu, passer au gestionnaire 404
  if (!req.resolvedContent) {
    return next();
  }

  const { type, id, lang } = req.resolvedContent;

  try {
    let templateFile, data;

    // Sélectionner le template et récupérer les données
    switch (type) {
      case 'article':
        templateFile = 'article.html';
        const articleRes = await pool.query(
          'SELECT title, excerpt, featured_image FROM articles WHERE id = $1',
          [id]
        );
        if (articleRes.rows.length === 0) return next();
        data = articleRes.rows[0];
        break;

      case 'podcast':
        templateFile = 'podcast.html';
        const podcastRes = await pool.query(
          'SELECT title, description, cover_image FROM podcasts WHERE id = $1',
          [id]
        );
        if (podcastRes.rows.length === 0) return next();
        data = podcastRes.rows[0];
        break;

      case 'emission':
        templateFile = 'emissions.html';
        const emissionRes = await pool.query(
          'SELECT title, description, thumbnail_url FROM emissions WHERE id = $1',
          [id]
        );
        if (emissionRes.rows.length === 0) return next();
        data = emissionRes.rows[0];
        break;

      case 'party':
        templateFile = 'partis.html';
        const partyRes = await pool.query(
          'SELECT name, description, logo_url FROM parties WHERE id = $1',
          [id]
        );
        if (partyRes.rows.length === 0) return next();
        data = { title: partyRes.rows[0].name, excerpt: partyRes.rows[0].description, featured_image: partyRes.rows[0].logo_url };
        break;

      default:
        return next();
    }

    // Lire le template HTML
    fs.readFile(path.join(__dirname, templateFile), 'utf8', (err, html) => {
      if (err) return next();

      // Injection des meta tags SEO
      const finalHtml = injectMetaTags(html, {
        title: data.title,
        description: data.excerpt || data.description,
        image: data.featured_image || data.cover_image || data.thumbnail_url || data.logo_url,
        url: `${BASE_URL}${req.path}`
      });

      res.send(finalHtml);
    });

  } catch (err) {
    console.error('❌ Erreur rendu contenu SEO:', err);
    next(err);
  }
});

// ==========================================
// SITEMAP XML (URLs SEO-FRIENDLY)
// ==========================================
app.get('/sitemap.xml', async (req, res) => {
  try {
    const staticPages = ['index.html', 'politique.html', 'social.html', 'partis-politiques.html', 'podcasts.html', 'emissions.html', 'auth.html', 'abonnement.html'];

    // Récupération parallèle des contenus
    const [articles, podcasts, emissions] = await Promise.all([
      pool.query("SELECT slug, language, category, updated_at FROM articles WHERE status = 'published' ORDER BY updated_at DESC"),
      pool.query("SELECT slug, updated_at FROM podcasts WHERE status = 'published' ORDER BY updated_at DESC"),
      pool.query("SELECT slug, updated_at FROM emissions WHERE status = 'published' ORDER BY updated_at DESC")
    ]);

    let xml = '<?xml version="1.0" encoding="UTF-8"?>';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';

    // Pages statiques
    staticPages.forEach(page => {
      xml += `<url><loc>${BASE_URL}/${page}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`;
    });

    // Articles (URLs SEO)
    const categoryMap = {
      'Politique': 'politique',
      'Social': 'social',
      'Économie': 'economie',
      'Culture': 'culture',
      'International': 'international',
      'Dossiers': 'dossiers'
    };

    articles.rows.forEach(item => {
      const urlCategory = categoryMap[item.category] || 'politique';
      xml += `<url><loc>${BASE_URL}/${item.language}/${urlCategory}/${item.slug}</loc><lastmod>${new Date(item.updated_at).toISOString()}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`;
    });

    // Podcasts (URLs SEO)
    podcasts.rows.forEach(item => {
      xml += `<url><loc>${BASE_URL}/fr/podcasts/${item.slug}</loc><lastmod>${new Date(item.updated_at).toISOString()}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>`;
    });

    // Émissions (URLs SEO)
    emissions.rows.forEach(item => {
      xml += `<url><loc>${BASE_URL}/fr/emissions/${item.slug}</loc><lastmod>${new Date(item.updated_at).toISOString()}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>`;
    });

    xml += '</urlset>';
    res.header('Content-Type', 'application/xml');
    res.send(xml);

  } catch (err) {
    console.error('❌ Sitemap Error:', err);
    res.status(500).end();
  }
});

// Servir les fichiers statiques (HTML, CSS, JS) - Doit être APRÈS les routes dynamiques
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// =============================================================================
// 5. ROUTES API
// =============================================================================
try {
  app.use('/api/articles', require('./backend/routes/articles'));
  app.use('/api/language', require('./backend/routes/language'));
  app.use('/api/polls', require('./backend/routes/polls'));
  app.use('/api/comments', require('./backend/routes/comments'));
  app.use('/api/auth', require('./backend/routes/auth'));
  app.use('/api/podcasts', require('./backend/routes/podcasts'));
  app.use('/api/admin', require('./backend/routes/admin'));
  app.use('/api/analytics', require('./backend/routes/analytics'));
  app.use('/api/emissions', require('./backend/routes/emissions'));
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
    seo_engine: 'Active (SEO-Friendly URLs)'
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
  console.log(`\n🚀 Serveur Solitiquo (FULL) lancé sur ${BASE_URL}`);
  console.log(`🌍 SEO Engine: URLs SEO-Friendly actives (/fr/politique/slug)`);
  console.log(`🔒 Mode : ${isProduction ? 'PRODUCTION' : 'DEVELOPPEMENT'}`);
  console.log(`♻️  Redirections 301: Anciennes URLs → Nouvelles URLs`);
});
