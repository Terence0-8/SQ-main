// backend/config/passport.js
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const pool = require('./database');
const appConfig = require('./appConfig');

const BASE_URL = appConfig.BASE_URL;

function isGoogleConfigured() {
    return Boolean(
        process.env.GOOGLE_CLIENT_ID &&
        !process.env.GOOGLE_CLIENT_ID.startsWith('votre_client_id') &&
        process.env.GOOGLE_CLIENT_SECRET &&
        !process.env.GOOGLE_CLIENT_SECRET.startsWith('votre_client_secret')
    );
}

function isFacebookConfigured() {
    return Boolean(
        process.env.FACEBOOK_APP_ID &&
        !process.env.FACEBOOK_APP_ID.startsWith('votre_app_id') &&
        process.env.FACEBOOK_APP_SECRET &&
        !process.env.FACEBOOK_APP_SECRET.startsWith('votre_app_secret')
    );
}

// ============================================
// STRATÉGIE GOOGLE
// ============================================
if (isGoogleConfigured()) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || `${BASE_URL}/api/auth/google/callback`,
        state: true,
        passReqToCallback: true
    },
        async (req, accessToken, refreshToken, profile, done) => {
            try {
                const emailObj = profile.emails && profile.emails.length > 0 ? profile.emails[0] : null;
                const email = emailObj?.value || null;
                const isEmailVerified = Boolean(emailObj?.verified === true || emailObj?.verified === 'true');

                if (!email) return done(null, false, { message: "Email non fourni par Google" });

                // 1. Chercher si l'utilisateur existe déjà via son google_id
                let result = await pool.query('SELECT * FROM users WHERE google_id = $1', [profile.id]);

                if (result.rows.length === 0) {
                    // 2. Chercher si l'utilisateur existe déjà via son email (liaison de compte)
                    result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

                    if (result.rows.length > 0) {
                        // Sécurité stricte : liaison automatique uniquement si Google certifie que l'email est vérifié
                        if (!isEmailVerified) {
                            return done(null, false, {
                                message: "L'adresse email fournie par Google n'est pas vérifiée. Liaison impossible."
                            });
                        }

                        // Lier le google_id au compte existant
                        const updateUser = await pool.query(
                            'UPDATE users SET google_id = $1, avatar_url = COALESCE(avatar_url, $2), updated_at = NOW() WHERE email = $3 RETURNING *',
                            [profile.id, profile.photos?.[0]?.value, email]
                        );
                        return done(null, updateUser.rows[0]);
                    }

                    // 3. Créer un NOUVEAU compte
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
                        [username, email, profile.id, profile.photos?.[0]?.value]
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
    console.warn("⚠️  GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET manquant ou non configuré.");
}

// ============================================
// STRATÉGIE FACEBOOK
// ============================================
if (isFacebookConfigured()) {
    passport.use(new FacebookStrategy({
        clientID: process.env.FACEBOOK_APP_ID,
        clientSecret: process.env.FACEBOOK_APP_SECRET,
        callbackURL: process.env.FACEBOOK_CALLBACK_URL || `${BASE_URL}/api/auth/facebook/callback`,
        profileFields: ['id', 'displayName', 'emails', 'picture.type(large)'],
        state: true,
        passReqToCallback: true
    },
        async (req, accessToken, refreshToken, profile, done) => {
            try {
                const email = profile.emails && profile.emails.length > 0 ? profile.emails[0].value : null;

                // 1. Chercher si l'utilisateur existe déjà via son facebook_id
                let result = await pool.query('SELECT * FROM users WHERE facebook_id = $1', [profile.id]);

                if (result.rows.length === 0) {
                    // Facebook sans email = pseudo généré et email fallback
                    if (!email) {
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
                        // RÈGLE IMPÉRATIVE N°5 & 6 :
                        // Facebook ne certifiant pas la vérification de l'email dans son scope standard,
                        // interdire la liaison automatique vers un compte existant par mot de passe pour contrer le vol de compte.
                        return done(null, false, {
                            message: "Un compte existe déjà avec cette adresse email. Veuillez vous connecter avec vos identifiants habituels."
                        });
                    }

                    // 3. NOUVEAU compte avec l'email
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
    console.warn("⚠️  FACEBOOK_APP_ID ou FACEBOOK_APP_SECRET manquant ou non configuré.");
}

passport.isGoogleConfigured = isGoogleConfigured;
passport.isFacebookConfigured = isFacebookConfigured;

module.exports = passport;
