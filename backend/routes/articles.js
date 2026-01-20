const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload = multer({ dest: 'uploads/' });

// ==========================================
// 1. LECTURE INTELLIGENTE (Multi-rubriques)
// ==========================================
router.get('/', async (req, res) => {
  try {
    const { category } = req.query; 
    
    let query = `
      SELECT a.id, a.title, a.image_url, a.slug, a.excerpt, a.category, a.published_at, a.image_url, a.lang, a.tags,
             u.first_name || ' ' || u.last_name as author_name,
             u.avatar_url as author_avatar
      FROM articles a
      LEFT JOIN users u ON a.author_id = u.id
      WHERE a.status = 'published'
    `;
    
    const params = [];
    
    // LOGIQUE CLÉ : On cherche dans la catégorie OU dans les tags
    if (category) {
      params.push(category);
      // La syntaxe $1 = ANY(tags) vérifie si le mot clé est dans le tableau de tags
      query += ` AND (a.category = $1 OR $1 = ANY(a.tags))`;
    }
    
    query += ` ORDER BY a.published_at DESC`;
    
    const { rows } = await pool.query(query, params);
    res.json({ success: true, count: rows.length, data: rows });
    
  } catch (err) {
    console.error('❌ Erreur SQL articles:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// GET /api/articles/:id
// Récupère un article précis (Sécurisé)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // On récupère l'utilisateur connecté via la session (si elle existe)
    const user = req.session && req.session.user ? req.session.user : null;
    const isAdmin = user && (user.role === 'admin' || user.role === 'writer');

    const query = `
      SELECT a.*, 
             u.first_name || ' ' || u.last_name as author_name,
             u.avatar_url as author_avatar
      FROM articles a
      LEFT JOIN users u ON a.author_id = u.id
      WHERE a.id = $1
    `;
    
    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Article introuvable' });
    }

    const article = rows[0];

    // VÉRIFICATION DU STATUT
    // Si l'article n'est pas publié ET que l'utilisateur n'est pas admin -> On cache
    if (article.status !== 'published' && !isAdmin) {
      return res.status(403).json({ success: false, error: "Cet article n'est pas encore public." });
    }

    res.json({ success: true, article: article });
    
  } catch (err) {
    console.error('❌ Erreur SQL article detail:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==========================================
// 2. ÉCRITURE (POST & PUT avec Tags)
// ==========================================

// POST (Création)
// POST /api/articles (Création)
router.post('/', upload.single('image_file'), async (req, res) => {
  try {
    let { title, slug, content, excerpt, category, author_id, lang, image_url, image_caption, tags } = req.body;

    let tagsArray = [];
    if (tags) { try { tagsArray = JSON.parse(tags); } catch (e) { tagsArray = []; } }

    if (!title || !content || !slug) return res.status(400).json({ success: false, error: 'Champs requis.' });

    let finalImageUrl = image_url;
    if (req.file) {
      try {
        const result = await cloudinary.uploader.upload(req.file.path, { folder: "solitiquo_articles" });
        finalImageUrl = result.secure_url;
        fs.unlinkSync(req.file.path);
      } catch (e) { console.error("Err Cloudinary", e); }
    }
    if (!finalImageUrl) finalImageUrl = 'https://via.placeholder.com/800x400';

    // CORRECTION ICI : Statut 'draft' par défaut au lieu de 'published'
    const query = `
      INSERT INTO articles 
      (title, slug, content, excerpt, category, author_id, lang, translation_group_id, image_url, image_caption, tags, status, published_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, uuid_generate_v4(), $8, $9, $10, 'draft', NULL)
      RETURNING id
    `;
    const values = [title, slug, content, excerpt, category, author_id || 1, lang || 'fr', finalImageUrl, image_caption, tagsArray];

    const { rows } = await pool.query(query, values);
    res.json({ success: true, article: rows[0] });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT (Modification)
router.put('/:id', upload.single('image_file'), async (req, res) => {
  try {
    const { id } = req.params;
    let { title, slug, content, excerpt, category, image_url, image_caption, tags } = req.body;

    // Parsing Tags
    let tagsArray = [];
    if (tags) { try { tagsArray = JSON.parse(tags); } catch (e) { tagsArray = []; } }

    // Gestion Image
    let finalImageUrl = image_url;
    if (req.file) {
      try {
        const result = await cloudinary.uploader.upload(req.file.path, { folder: "solitiquo_articles" });
        finalImageUrl = result.secure_url;
        fs.unlinkSync(req.file.path);
      } catch (e) { console.error("Err Cloudinary", e); }
    }

    let query, values;

    // Si nouvelle image, on met tout à jour
    if (finalImageUrl) {
        query = `
          UPDATE articles 
          SET title=$1, slug=$2, content=$3, excerpt=$4, category=$5, image_url=$6, image_caption=$7, tags=$8, updated_at=NOW()
          WHERE id=$9 RETURNING id
        `;
        values = [title, slug, content, excerpt, category, finalImageUrl, image_caption, tagsArray, id];
    } else {
        // Sinon on garde l'image existante (pas dans le SET)
        query = `
          UPDATE articles 
          SET title=$1, slug=$2, content=$3, excerpt=$4, category=$5, image_caption=$6, tags=$7, updated_at=NOW()
          WHERE id=$8 RETURNING id
        `;
        values = [title, slug, content, excerpt, category, image_caption, tagsArray, id];
    }

    const { rows } = await pool.query(query, values);
    if (rows.length === 0) return res.status(404).json({ success: false, error: "Introuvable" });
    res.json({ success: true, article: rows[0] });

  } catch (err) {
    console.error('❌ PUT Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});



module.exports = router;