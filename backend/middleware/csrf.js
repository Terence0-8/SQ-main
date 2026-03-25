const crypto = require('crypto');

const timingSafeEqual = (a, b) => {
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

// Middleware pour générer le token CSRF et l'attacher à la session/réponse
const csrfProtection = (req, res, next) => {
    if (!req.session) return next(); // Safety check

    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }

    // Rendre le token disponible pour les vues (si EJS utilisé) et les headers
    res.locals.csrfToken = req.session.csrfToken;

    // Si c'est une requête GET, on peut aussi renvoyer le token dans un cookie (optionnel mais pratique pour les SPA)
    // res.cookie('XSRF-TOKEN', req.session.csrfToken, { httpOnly: false, secure: process.env.NODE_ENV === 'production' });

    next();
};

// Middleware pour vérifier le token CSRF sur les requêtes mutantes
const verifyCsrf = (req, res, next) => {
    // 1. Ignorer les méthodes safe
    if (['GET', 'OPTIONS', 'HEAD'].includes(req.method)) return next();

    // 2. Récupérer le token depuis Headers ou Body
    const token = req.headers['x-csrf-token'] || (req.body && req.body._csrf);

    // 3. Validation
    if (!token) {
        console.warn(`⚠️ [CSRF] Token manquant pour ${req.method} ${req.originalUrl}`);
        return res.status(403).json({ success: false, error: 'Token CSRF manquant' });
    }

    const sessionToken = req.session?.csrfToken;
    if (!sessionToken || !timingSafeEqual(token, sessionToken)) {
        console.warn(`⛔ [CSRF] Token invalide pour ${req.method} ${req.originalUrl}`);
        return res.status(403).json({ success: false, error: 'Token CSRF invalide (Session expirée ?)' });
    }

    next();
};

module.exports = { csrfProtection, verifyCsrf };
