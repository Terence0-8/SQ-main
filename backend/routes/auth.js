const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const bcrypt = require('bcrypt');
const Joi = require('joi');
const { verifyCsrf } = require('../middleware/csrf');

// ============================================
// SCHÉMAS DE VALIDATION JOI
// ============================================

const registerSchema = Joi.object({
  username: Joi.string()
    .alphanum()
    .min(3)
    .max(30)
    .required()
    .messages({
      'string.alphanum': 'Le nom d\'utilisateur ne doit contenir que des lettres et chiffres',
      'string.min': 'Le nom d\'utilisateur doit contenir au moins 3 caractères',
      'string.max': 'Le nom d\'utilisateur ne doit pas dépasser 30 caractères',
      'any.required': 'Le nom d\'utilisateur est requis'
    }),

  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Email invalide',
      'any.required': 'L\'email est requis'
    }),

  password: Joi.string()
    .min(8)
    .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)'))
    .required()
    .messages({
      'string.min': 'Le mot de passe doit contenir au moins 8 caractères',
      'string.pattern.base': 'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre',
      'any.required': 'Le mot de passe est requis'
    })
});

const loginSchema = Joi.object({
  email: Joi.string().required(),
  password: Joi.string().required()
});

const updateProfileSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  email: Joi.string().email().required()
});

// ============================================
// 1. INSCRIPTION (Sign Up)
// ============================================
router.post('/register', async (req, res) => {
  try {
    // ✅ Validation avec Joi
    const { error, value } = registerSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    const { username, email, password } = value;

    // Hachage du mot de passe
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const query = `
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'reader', TRUE)
      RETURNING id, username, email, role, is_subscriber, subscription_start_date, subscription_end_date
    `;

    const { rows } = await pool.query(query, [username, email, hashedPassword]);

    // Connexion automatique après inscription
    req.session.user = rows[0];

    res.json({ success: true, user: rows[0], message: "Compte créé avec succès !" });

  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      return res.status(400).json({
        success: false,
        error: "Cet email ou nom d'utilisateur existe déjà."
      });
    }
    res.status(500).json({ success: false, error: "Erreur serveur." });
  }
});

// ============================================
// 2. CONNEXION (Login)
// ============================================
router.post('/login', async (req, res) => {
  try {
    // ✅ Validation basique
    const { error, value } = loginSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: "Email et mot de passe requis"
      });
    }

    const { email, password } = value;

    // Chercher par email OU username
    const query = 'SELECT * FROM users WHERE email = $1 OR username = $1';
    const result = await pool.query(query, [email]);

    if (result.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Email ou mot de passe incorrect."
      });
    }

    const user = result.rows[0];

    // Vérifier le mot de passe
    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) {
      return res.status(400).json({
        success: false,
        error: "Email ou mot de passe incorrect."
      });
    }

    // Sauvegarder dans session (avec données abonnement)
    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      is_subscriber: user.is_subscriber,
      subscription_start_date: user.subscription_start_date,
      subscription_end_date: user.subscription_end_date
    };

    res.json({ success: true, user: req.session.user });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur." });
  }
});

// ============================================
// 3. DÉCONNEXION (Logout)
// ============================================
router.post('/logout', verifyCsrf, (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ success: false, error: "Erreur déconnexion" });
    res.clearCookie('connect.sid');
    res.json({ success: true, message: "Déconnecté." });
  });
});

// ============================================
// 4. QUI SUIS-JE ? (Check Session)
// ⚡ AMÉLIORATION : Récupère les données FRAÎCHES depuis la BDD
// ============================================
router.get('/me', async (req, res) => {
  if (!req.session.user) {
    return res.json({ success: true, isLoggedIn: false, user: null });
  }

  try {
    // 🔥 On va chercher les données à jour dans la BDD
    const result = await pool.query(
      `SELECT id, username, email, role, is_subscriber, 
              subscription_start_date, subscription_end_date, 
              created_at, updated_at
       FROM users 
       WHERE id = $1`,
      [req.session.user.id]
    );

    if (result.rows.length === 0) {
      // L'utilisateur n'existe plus, on détruit la session
      req.session.destroy();
      return res.json({ success: true, isLoggedIn: false, user: null });
    }

    const freshUser = result.rows[0];

    // Mise à jour de la session avec les données fraîches
    req.session.user = freshUser;

    res.json({
      success: true,
      isLoggedIn: true,
      user: freshUser
    });

  } catch (err) {
    console.error('Erreur /auth/me:', err);
    // En cas d'erreur BDD, on retourne quand même la session en cache
    res.json({
      success: true,
      isLoggedIn: true,
      user: req.session.user
    });
  }
});

// ============================================
// 5. RAFRAÎCHIR LES DONNÉES UTILISATEUR
// 🆕 NOUVEAU : Force la synchronisation du statut abonné
// ============================================
router.post('/refresh-user', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({
      success: false,
      error: "Non connecté"
    });
  }

  try {
    // Récupération complète des données utilisateur
    const result = await pool.query(
      `SELECT id, username, email, role, is_subscriber, 
              subscription_start_date, subscription_end_date, 
              created_at, updated_at
       FROM users 
       WHERE id = $1`,
      [req.session.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Utilisateur introuvable"
      });
    }

    const freshUser = result.rows[0];

    // Mise à jour de la session
    req.session.user = freshUser;

    // Sauvegarde explicite de la session (important!)
    req.session.save((err) => {
      if (err) {
        console.error('Erreur sauvegarde session:', err);
        return res.status(500).json({
          success: false,
          error: "Erreur de synchronisation"
        });
      }

      console.log(`✅ Données utilisateur ${freshUser.id} synchronisées - Abonné: ${freshUser.is_subscriber}`);

      res.json({
        success: true,
        user: freshUser,
        message: "Données synchronisées"
      });
    });

  } catch (err) {
    console.error('Erreur /auth/refresh-user:', err);
    res.status(500).json({
      success: false,
      error: "Erreur serveur"
    });
  }
});

// ============================================
// 6. MISE À JOUR PROFIL
// ============================================
router.put('/update', verifyCsrf, async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({
      success: false,
      error: "Non connecté"
    });
  }

  // ✅ Validation
  const { error, value } = updateProfileSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }

  const { username, email } = value;

  try {
    const result = await pool.query(
      `UPDATE users 
       SET username = $1, email = $2, updated_at = NOW()
       WHERE id = $3 
       RETURNING id, username, email, role, is_subscriber, subscription_start_date, subscription_end_date`,
      [username, email, req.session.user.id]
    );

    // Mettre à jour la session
    req.session.user = result.rows[0];

    res.json({
      success: true,
      user: result.rows[0],
      message: "Profil mis à jour !"
    });
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      return res.status(400).json({
        success: false,
        error: "Email déjà utilisé"
      });
    }
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
});

module.exports = router;