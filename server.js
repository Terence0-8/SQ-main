require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const pool = require('./backend/config/database');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';

// =============================================================================
// 1. MIDDLEWARES DE BASE
// =============================================================================

// Fix #9 - CORS restrictif en production
const corsOptions = {
  origin: isProduction
    ? (process.env.ALLOWED_ORIGINS || '').split(',')
    : true, // En dev, on accepte tout
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
};
app.use(cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Servir les fichiers statiques (HTML, CSS, JS)
app.use(express.static(__dirname));
// Permettre l'accès aux images uploadées via l'URL /uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// =============================================================================
// 3. RATE LIMITING - Protection brute-force
// =============================================================================
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Max 100 requêtes par IP
  message: { success: false, error: 'Trop de requêtes, réessayez dans 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // Max 5 tentatives de connexion
  message: { success: false, error: 'Trop de tentatives de connexion, réessayez dans 15 minutes' },
  skipSuccessfulRequests: true // Ne compte que les échecs
});

// Appliquer limites
app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// =============================================================================
// 2. SESSIONS - Fix #8 Sessions sécurisées
// =============================================================================
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
    secure: isProduction, // HTTPS seulement en production
    httpOnly: true,       // Cookie inaccessible au JS client
    sameSite: 'lax',      // Protection CSRF partielle
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 jours
  }
}));

// =============================================================================
// Fix #5 - PROTECTION CSRF SIMPLE (Token dans session)
// =============================================================================
const crypto = require('crypto');

// Générer un token CSRF pour chaque session
app.use((req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
});

// Route pour récupérer le token CSRF (côté client)
app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: req.session.csrfToken });
});

// Middleware de vérification CSRF pour les routes sensibles
const verifyCsrf = (req, res, next) => {
  // Ignorer GET, OPTIONS, HEAD
  if (['GET', 'OPTIONS', 'HEAD'].includes(req.method)) {
    return next();
  }

  const token = req.headers['x-csrf-token'] || req.body._csrf;

  // En dev, on peut désactiver si besoin
  if (!isProduction && !token) {
    return next(); // Tolérant en développement
  }

  if (isProduction && token !== req.session.csrfToken) {
    return res.status(403).json({ success: false, error: 'Token CSRF invalide' });
  }

  next();
};

// Appliquer la vérification CSRF aux routes admin
app.use('/api/admin', verifyCsrf);

// =============================================================================
// 3. ROUTES API
// =============================================================================
try {
  app.use('/api/articles', require('./backend/routes/articles'));
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
  console.error("❌ Une route n'a pas pu être chargée :", error.message);
  console.error(error.stack);
}

// =============================================================================
// 4. ROUTES DE BASE
// =============================================================================

// Route de test / health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'Server Running',
    environment: isProduction ? 'production' : 'development',
    user: req.session.user ? req.session.user.email : 'Visiteur'
  });
});

// Redirection par défaut
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// =============================================================================
// Fix #7 - GESTION D'ERREURS CENTRALISÉE
// =============================================================================

// Route 404 pour API (Express 5 syntax)
app.use('/api', (req, res, next) => {
  // Si on arrive ici, aucune route n'a matché
  res.status(404).json({ success: false, error: 'Route API introuvable' });
});

// Middleware d'erreur global
app.use((err, req, res, next) => {
  console.error('❌ Erreur serveur:', err.message);
  console.error(err.stack);

  // Erreur multer (upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, error: 'Fichier trop volumineux' });
  }

  if (err.message && err.message.includes('Type de fichier non autorisé')) {
    return res.status(400).json({ success: false, error: err.message });
  }

  // Erreur générique
  res.status(500).json({
    success: false,
    error: isProduction ? 'Erreur serveur' : err.message
  });
});

// =============================================================================
// LANCEMENT
// =============================================================================
app.listen(PORT, () => {
  console.log(`\n🚀 Serveur lancé sur http://localhost:${PORT}`);
  console.log(`📂 Dossier racine : ${__dirname}`);
  console.log(`🔒 Mode : ${isProduction ? 'PRODUCTION' : 'DÉVELOPPEMENT'}`);
  if (!isProduction) {
    console.log('⚠️  CSRF désactivé en mode dev (headers non requis)');
  }
});