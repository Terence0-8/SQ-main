// backend/middleware/auth.js
// Middlewares d'authentification et autorisation

// Middleware pour vérifier si l'utilisateur est connecté
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    res.status(401).json({
        success: false,
        error: 'Vous devez être connecté pour effectuer cette action'
    });
};

// Middleware pour vérifier si l'utilisateur est admin ou writer
const isWriter = (req, res, next) => {
    if (req.session && req.session.user) {
        const role = req.session.user.role;
        if (role === 'admin' || role === 'writer') {
            return next();
        }
    }
    res.status(403).json({
        success: false,
        error: 'Accès refusé - Vous devez être rédacteur ou administrateur'
    });
};

// Middleware pour vérifier si l'utilisateur est admin uniquement
const isAdmin = (req, res, next) => {
    if (req.session && req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    res.status(403).json({
        success: false,
        error: 'Accès refusé - Administrateur requis'
    });
};

module.exports = { isAuthenticated, isWriter, isAdmin };
