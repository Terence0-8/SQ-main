const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const bcrypt = require('bcrypt');

// 1. INSCRIPTION (Sign Up)
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Vérif basique
    if (!username || !email || !password) {
      return res.status(400).json({ success: false, error: "Tous les champs sont requis." });
    }

    // Hachage du mot de passe (Sécurité)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Rôle par défaut = 'reader' (Lecteur). 
    // Seul un Admin pourra changer le rôle en 'writer' via la base de données pour l'instant.
    const query = `
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'reader', TRUE)
      RETURNING id, username, email, role
    `;

    const { rows } = await pool.query(query, [username, email, hashedPassword]);

    // Connexion automatique après inscription
    req.session.user = rows[0];

    res.json({ success: true, user: rows[0], message: "Compte créé avec succès !" });

  } catch (err) {
    console.error(err);
    if (err.code === '23505') { // Code erreur Postgres pour "Doublon"
      return res.status(400).json({ success: false, error: "Cet email ou nom d'utilisateur existe déjà." });
    }
    res.status(500).json({ success: false, error: "Erreur serveur." });
  }
});

// 2. CONNEXION (Login)
router.post('/login', async (req, res) => {
  try {
    // Note : Le frontend envoie l'identifiant (pseudo ou email) dans la variable 'email'
    const { email, password } = req.body;

    // --- CORRECTION ICI ---
    // On vérifie si la valeur correspond à la colonne 'email' OU à la colonne 'username'
    const query = 'SELECT * FROM users WHERE email = $1 OR username = $1';

    // On exécute la requête. Postgres va remplacer les deux $1 par la valeur de 'email'
    const result = await pool.query(query, [email]);

    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, error: "Email ou mot de passe incorrect." });
    }

    const user = result.rows[0];

    // Vérifier le mot de passe
    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) {
      return res.status(400).json({ success: false, error: "Email ou mot de passe incorrect." });
    }

    // CRUCIAL : On sauvegarde l'info dans la session serveur
    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    };

    res.json({ success: true, user: req.session.user });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur." });
  }
});

// 3. DÉCONNEXION (Logout)
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ success: false, error: "Erreur déconnexion" });
    res.clearCookie('connect.sid'); // Nom par défaut du cookie
    res.json({ success: true, message: "Déconnecté." });
  });
});

// 4. QUI SUIS-JE ? (Check Session)
// Permet au Front-end de savoir si on est connecté et quel est notre rôle
router.get('/me', (req, res) => {
  if (req.session.user) {
    res.json({ success: true, isLoggedIn: true, user: req.session.user });
  } else {
    res.json({ success: true, isLoggedIn: false, user: null });
  }
});

// Route pour mettre à jour le profil (Nom, Email)
router.put('/update', async (req, res) => {
  // FIX: Utiliser req.session.user au lieu de req.session.userId
  if (!req.session.user) return res.status(401).json({ error: "Non connecté" });

  const { username, email } = req.body;

  try {
    // Mise à jour SQL
    const result = await pool.query(
      'UPDATE users SET username = $1, email = $2 WHERE id = $3 RETURNING id, username, email, role',
      [username, email, req.session.user.id]
    );

    // Mettre à jour la session avec les nouvelles infos
    req.session.user = result.rows[0];

    res.json({ success: true, user: result.rows[0], message: "Profil mis à jour !" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur ou email déjà pris." });
  }
});

module.exports = router;