// backend/config/passport.js
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const pool = require('./database');

const BASE_URL = process.env.NODE_ENV === 'production'
    ? 'https://solitiquo.com'
    : `http://localhost:${process.env.PORT || 5000}`;

// ============================================
// STRATÉGIE GOOGLE
// ============================================
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${BASE_URL}/api/auth/google/callback`,
        passReqToCallback: true
    },
        async (req, accessToken, refreshToken, profile, done) => {
            try {
                const email = profile.emails && profile.emails.length > 0 ? profile.emails[0].value : null;
                if (!email) return done(null, false, { message: "Email non fourni par Google" });

                // 1. Chercher si l'utilisateur existe déjà via son google_id
                let result = await pool.query('SELECT * FROM users WHERE google_id = $1', [profile.id]);

                if (result.rows.length === 0) {
                    // 2. Chercher si l'utilisateur existe déjà via son email (liaison de compte)
                    result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

                    if (result.rows.length > 0) {
                        // Lier le google_id au compte existant
                        const updateUser = await pool.query(
                            'UPDATE users SET google_id = $1, avatar_url = COALESCE(avatar_url, $2) WHERE email = $3 RETURNING *',
                            [profile.id, profile.photos[0]?.value, email]
                        );
                        return done(null, updateUser.rows[0]);
                    }

                    // 3. Créer un NOUVEAU compte
                    // On génère un pseudo à partir de l'email ou du nom Google
                    let baseUsername = profile.displayName ? profile.displayName.replace(/[^a-zA-Z0-9]/g, '') : email.split('@')[0];
                    if (!baseUsername || baseUsername.length < 3) baseUsername = 'User' + Math.floor(Math.random() * 10000);

                    // Vérifier que le pseudo est unique
                    let username = baseUsername;
                    let counter = 1;
                    while ((await pool.query('SELECT id FROM users WHERE username = $1', [username])).rows.length > 0) {
                        username = `${baseUsername}${counter++}`;
                    }

                    const insertUser = await pool.query(
                        `INSERT INTO users (username, email, google_id, avatar_url, role, is_active)
           VALUES ($1, $2, $3, $4, 'reader', TRUE) RETURNING *`,
                        [username, email, profile.id, profile.photos[0]?.value]
                    );
                    return done(null, insertUser.rows[0]);
                }

                // L'utilisateur existe via google_id
                return done(null, result.rows[0]);

            } catch (error) {
                console.error("Erreur Google OAuth:", error);
                return done(error, null);
            }
        }));
} else {
    console.warn("⚠️  GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET manquant.");
}

// ============================================
// STRATÉGIE FACEBOOK
// ============================================
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
    passport.use(new FacebookStrategy({
        clientID: process.env.FACEBOOK_APP_ID,
        clientSecret: process.env.FACEBOOK_APP_SECRET,
        callbackURL: `${BASE_URL}/api/auth/facebook/callback`,
        profileFields: ['id', 'displayName', 'emails', 'picture.type(large)'],
        passReqToCallback: true
    },
        async (req, accessToken, refreshToken, profile, done) => {
            try {
                const email = profile.emails && profile.emails.length > 0 ? profile.emails[0].value : null;
                // Note: Facebook ne permet pas toujours de récupérer l'email si l'utilisateur s'inscrit par téléphone
                // Dans ce cas on doit utiliser l'ID FB

                // 1. Chercher si l'utilisateur existe déjà via son facebook_id
                let result = await pool.query('SELECT * FROM users WHERE facebook_id = $1', [profile.id]);

                if (result.rows.length === 0) {
                    // Facebook sans email = pseudo généré et email fallback ou erreur.
                    if (!email) {
                        // Création avec un email temporaire car la contrainte DB exige un email NOT NULL
                        const tempEmail = `${profile.id}@facebook.solitiquo.com`;
                        let username = profile.displayName ? profile.displayName.replace(/[^a-zA-Z0-9]/g, '') : 'FBUser' + profile.id;

                        // Vérifier unicité
                        let counter = 1;
                        let tempUser = username;
                        while ((await pool.query('SELECT id FROM users WHERE username = $1', [tempUser])).rows.length > 0) {
                            tempUser = `${username}${counter++}`;
                        }
                        username = tempUser;

                        const insertFB = await pool.query(
                            `INSERT INTO users (username, email, facebook_id, avatar_url, role, is_active)
                VALUES ($1, $2, $3, $4, 'reader', TRUE) RETURNING *`,
                            [username, tempEmail, profile.id, profile.photos ? profile.photos[0].value : null]
                        );
                        return done(null, insertFB.rows[0]);
                    }

                    // 2. Chercher si l'utilisateur existe via son email
                    result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

                    if (result.rows.length > 0) {
                        // Lier le facebook_id
                        const updateUser = await pool.query(
                            'UPDATE users SET facebook_id = $1, avatar_url = COALESCE(avatar_url, $2) WHERE email = $3 RETURNING *',
                            [profile.id, profile.photos ? profile.photos[0].value : null, email]
                        );
                        return done(null, updateUser.rows[0]);
                    }

                    // 3. NOUVEAU compte avec l'email vérifié
                    let baseUsername = profile.displayName ? profile.displayName.replace(/[^a-zA-Z0-9]/g, '') : email.split('@')[0];
                    if (!baseUsername || baseUsername.length < 3) baseUsername = 'User' + Math.floor(Math.random() * 10000);

                    let username = baseUsername;
                    let counter = 1;
                    while ((await pool.query('SELECT id FROM users WHERE username = $1', [username])).rows.length > 0) {
                        username = `${baseUsername}${counter++}`;
                    }

                    const insertUser = await pool.query(
                        `INSERT INTO users (username, email, facebook_id, avatar_url, role, is_active)
           VALUES ($1, $2, $3, $4, 'reader', TRUE) RETURNING *`,
                        [username, email, profile.id, profile.photos ? profile.photos[0].value : null]
                    );
                    return done(null, insertUser.rows[0]);
                }

                // Existe déjà avec facebook_id
                return done(null, result.rows[0]);

            } catch (error) {
                console.error("Erreur Facebook OAuth:", error);
                return done(error, null);
            }
        }));
} else {
    console.warn("⚠️  FACEBOOK_APP_ID ou FACEBOOK_APP_SECRET manquant.");
}

// Comme nous utilisons express-session purement et créons manuellement `req.session.user` dans notre propre contrôleur,
// pas besoin de serialiser/desérialiser via Passport. Cette config crée juste les Strategies.
module.exports = passport;
