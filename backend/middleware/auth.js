/**
 * Middlewares d'authentification Solitiquo
 * Fix #3 - Séparation des permissions admin/writer
 */

// Vérifie si l'utilisateur est connecté
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        next();
    } else {
        res.status(401).json({ success: false, error: "Connexion requise." });
    }
};

// Vérifie si l'utilisateur est un administrateur (rôle admin uniquement)
const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ success: false, error: "Accès réservé aux administrateurs." });
    }
};

// Vérifie si l'utilisateur peut créer/modifier du contenu (admin OU writer)
const isWriter = (req, res, next) => {
    if (req.session.user && (req.session.user.role === 'admin' || req.session.user.role === 'writer')) {
        next();
    } else {
        res.status(403).json({ success: false, error: "Accès réservé aux rédacteurs." });
    }
};

// Vérifie si l'utilisateur peut modérer (admin uniquement)
const isModerator = isAdmin; // Pour l'instant, seuls les admins modèrent

module.exports = {
    isAuthenticated,
    isAdmin,
    isWriter,
    isModerator
};
