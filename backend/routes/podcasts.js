const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const Joi = require('joi');
const { isWriter } = require('../middleware/auth');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload = multer({ dest: 'uploads/' });

// ==========================================
// VALIDATION SCHEMA
// ==========================================
const podcastSchema = Joi.object({
  title: Joi.string().min(5).max(255).required()
    .messages({
      'string.min': 'Le titre doit contenir au moins 5 caractères',
      'string.max': 'Le titre ne doit pas dépasser 255 caractères',
      'any.required': 'Le titre est requis'
    }),

  description: Joi.string().allow('').optional(),

  category: Joi.string().max(100).allow('').optional(),

  author_id: Joi.number().integer().optional(),

  cover_image: Joi.string().uri().allow('').optional()
});

// ==========================================
// 1. LISTE DES PODCASTS PUBLIÉS
// ==========================================
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;

    let query = `
      SELECT 
        p.id,
        p.title,
        p.description,
        p.audio_url,
        p.cover_image,
        p.duration_seconds,
        p.category,
        p.status,
        p.is_premium,
        p.play_count,
        p.created_at,
        u.username as author_name
      FROM podcasts p
      LEFT JOIN users u ON p.author_id = u.id
      WHERE p.status = 'published'
    `;

    const params = [];

    if (category) {
      params.push(category);
      query += ` AND p.category = $1`;
    }

    query += ` ORDER BY p.created_at DESC LIMIT 50`;

    const { rows } = await pool.query(query, params);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    console.error('❌ Erreur liste podcasts:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==========================================
// 🆕 1B. PODCASTS EN VEDETTE PAR CATÉGORIE
// ==========================================
router.get('/featured/:category', async (req, res) => {
  try {
    const { category } = req.params;

    // Normaliser la catégorie
    const normalizedCategory = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();

    const query = `
      SELECT 
        p.id,
        p.title,
        p.description,
        p.audio_url,
        p.cover_image,
        p.duration_seconds,
        p.category,
        p.is_premium,
        p.play_count,
        p.created_at,
        u.username as author_name
      FROM podcasts p
      LEFT JOIN users u ON p.author_id = u.id
      WHERE p.status = 'published' AND p.category = $1
      ORDER BY p.play_count DESC, p.created_at DESC
      LIMIT 5
    `;

    const { rows } = await pool.query(query, [normalizedCategory]);

    res.json({
      success: true,
      category: normalizedCategory,
      count: rows.length,
      data: rows
    });
  } catch (err) {
    console.error('❌ Erreur podcasts featured:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==========================================
// 2. DÉTAIL D'UN PODCAST
// ==========================================
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const query = `
      SELECT 
        p.*,
        u.username as author_name
      FROM podcasts p
      LEFT JOIN users u ON p.author_id = u.id
      WHERE p.id = $1
    `;

    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Podcast introuvable'
      });
    }

    // Incrémenter le compteur de lectures
    await pool.query('UPDATE podcasts SET play_count = play_count + 1 WHERE id = $1', [id]);

    res.json({ success: true, podcast: rows[0] });
  } catch (err) {
    console.error('❌ Erreur détail podcast:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==========================================
// 3. CRÉER UN PODCAST (Admin/Writer)
// ==========================================
const cpUpload = upload.fields([
  { name: 'audio_file', maxCount: 1 },
  { name: 'image_file', maxCount: 1 }
]);

router.post('/', isWriter, cpUpload, async (req, res) => {
  try {
    // Validation
    const { error, value } = podcastSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    const { title, description, category, author_id, cover_image } = value;

    // Validation Audio (Obligatoire)
    if (!req.files || !req.files['audio_file']) {
      return res.status(400).json({
        success: false,
        error: 'Fichier audio requis'
      });
    }

    let audioUrl = '';
    let finalImageUrl = cover_image || '';
    let duration = 0;

    // 1. Upload Audio vers Cloudinary
    const audioFile = req.files['audio_file'][0];
    try {
      const audioRes = await cloudinary.uploader.upload(audioFile.path, {
        resource_type: "video",
        folder: "solitiquo_podcasts"
      });
      audioUrl = audioRes.secure_url;
      duration = Math.round(audioRes.duration || 0);
      fs.unlinkSync(audioFile.path);
    } catch (e) {
      console.error("❌ Erreur Upload Audio:", e);
      return res.status(500).json({
        success: false,
        error: "Échec de l'upload audio"
      });
    }

    // 2. Gestion Image (Fichier prioritaire > URL > Défaut)
    if (req.files['image_file']) {
      const imgFile = req.files['image_file'][0];
      try {
        const imgRes = await cloudinary.uploader.upload(imgFile.path, {
          folder: "solitiquo_covers"
        });
        finalImageUrl = imgRes.secure_url;
        fs.unlinkSync(imgFile.path);
      } catch (e) {
        console.error("❌ Erreur Upload Image:", e);
      }
    }

    // Image par défaut si rien fourni
    if (!finalImageUrl) {
      finalImageUrl = 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?auto=format&fit=crop&w=500&q=80';
    }

    // 3. Insertion en base
    const query = `
      INSERT INTO podcasts (
        title, 
        description, 
        audio_url, 
        cover_image, 
        duration_seconds, 
        category, 
        author_id, 
        status, 
        is_premium,
        created_at, 
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'published', FALSE, NOW(), NOW())
      RETURNING id, title
    `;

    const values = [
      title,
      description || '',
      audioUrl,
      finalImageUrl,
      duration,
      category || 'Général',
      author_id || req.session.user.id
    ];

    const { rows } = await pool.query(query, values);

    res.json({
      success: true,
      message: 'Podcast créé',
      podcast: rows[0]
    });

  } catch (err) {
    console.error("❌ Erreur création podcast:", err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==========================================
// 4. METTRE À JOUR UN PODCAST (Admin/Writer)
// ==========================================
router.put('/:id', isWriter, cpUpload, async (req, res) => {
  try {
    const { id } = req.params;

    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    // Validation
    const { error, value } = podcastSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    const { title, description, category, cover_image } = value;

    // Vérifier que le podcast existe
    const checkQuery = 'SELECT id, audio_url, cover_image FROM podcasts WHERE id = $1';
    const checkResult = await pool.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Podcast introuvable'
      });
    }

    let audioUrl = checkResult.rows[0].audio_url;
    let finalImageUrl = checkResult.rows[0].cover_image;
    let duration = 0;

    // Nouvel audio ?
    if (req.files && req.files['audio_file']) {
      const audioFile = req.files['audio_file'][0];
      try {
        const audioRes = await cloudinary.uploader.upload(audioFile.path, {
          resource_type: "video",
          folder: "solitiquo_podcasts"
        });
        audioUrl = audioRes.secure_url;
        duration = Math.round(audioRes.duration || 0);
        fs.unlinkSync(audioFile.path);
      } catch (e) {
        console.error("❌ Erreur Upload Audio:", e);
      }
    }

    // Nouvelle image ?
    if (req.files && req.files['image_file']) {
      const imgFile = req.files['image_file'][0];
      try {
        const imgRes = await cloudinary.uploader.upload(imgFile.path, {
          folder: "solitiquo_covers"
        });
        finalImageUrl = imgRes.secure_url;
        fs.unlinkSync(imgFile.path);
      } catch (e) {
        console.error("❌ Erreur Upload Image:", e);
      }
    } else if (cover_image) {
      finalImageUrl = cover_image;
    }

    // Mise à jour
    let query, values;

    if (duration > 0) {
      // Si nouvel audio, on met à jour duration aussi
      query = `
        UPDATE podcasts 
        SET title=$1, description=$2, audio_url=$3, cover_image=$4, duration_seconds=$5, category=$6, updated_at=NOW()
        WHERE id=$7 
        RETURNING id, title
      `;
      values = [title, description, audioUrl, finalImageUrl, duration, category, id];
    } else {
      // Sinon on garde la durée existante
      query = `
        UPDATE podcasts 
        SET title=$1, description=$2, cover_image=$3, category=$4, updated_at=NOW()
        WHERE id=$5 
        RETURNING id, title
      `;
      values = [title, description, finalImageUrl, category, id];
    }

    const { rows } = await pool.query(query, values);

    res.json({
      success: true,
      message: 'Podcast mis à jour',
      podcast: rows[0]
    });

  } catch (err) {
    console.error("❌ Erreur modification podcast:", err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==========================================
// 5. SUPPRIMER UN PODCAST (Admin/Writer)
// ==========================================
router.delete('/:id', isWriter, async (req, res) => {
  try {
    const { id } = req.params;

    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const result = await pool.query('DELETE FROM podcasts WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Podcast introuvable'
      });
    }

    res.json({
      success: true,
      message: 'Podcast supprimé'
    });

  } catch (err) {
    console.error('❌ Erreur suppression podcast:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==========================================
// 6. PODCASTS PAR CATÉGORIE (Politique/Social)
// ==========================================
router.get('/category/:category', async (req, res) => {
  try {
    const { category } = req.params;

    const query = `
      SELECT 
        p.id,
        p.title,
        p.description,
        p.audio_url,
        p.cover_image,
        p.duration_seconds,
        p.category,
        p.is_premium,
        p.play_count,
        p.created_at,
        u.username as author_name
      FROM podcasts p
      LEFT JOIN users u ON p.author_id = u.id
      WHERE p.status = 'published' AND p.category = $1
      ORDER BY p.created_at DESC
      LIMIT 20
    `;

    const { rows } = await pool.query(query, [category]);

    res.json({
      success: true,
      category: category,
      count: rows.length,
      data: rows
    });
  } catch (err) {
    console.error('❌ Erreur podcasts par catégorie:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

module.exports = router;
