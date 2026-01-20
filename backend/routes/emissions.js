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
const emissionSchema = Joi.object({
  title: Joi.string().min(5).max(255).required()
    .messages({
      'string.min': 'Le titre doit contenir au moins 5 caractères',
      'string.max': 'Le titre ne doit pas dépasser 255 caractères',
      'any.required': 'Le titre est requis'
    }),

  description: Joi.string().allow('').optional(),

  video_url: Joi.string().uri().required()
    .messages({
      'string.uri': 'L\'URL de la vidéo doit être valide',
      'any.required': 'L\'URL de la vidéo est requise'
    }),

  duration_seconds: Joi.number().integer().min(0).optional(),

  category: Joi.string().max(100).allow('').optional(),

  host_id: Joi.number().integer().optional(),

  thumbnail_url: Joi.string().uri().allow('').optional()
});

// ==========================================
// FONCTION : Extraire ID YouTube et générer miniature
// ==========================================
function getYoutubeThumbnail(videoUrl) {
  if (!videoUrl) return null;

  // Regex pour extraire l'ID YouTube
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = videoUrl.match(regExp);

  if (match && match[2] && match[2].length === 11) {
    return `https://img.youtube.com/vi/${match[2]}/maxresdefault.jpg`;
  }

  return null;
}

// ==========================================
// 1. LISTE DES ÉMISSIONS PUBLIÉES
// ==========================================
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;

    let query = `
      SELECT 
        e.id,
        e.title,
        e.description,
        e.video_url,
        e.thumbnail_url,
        e.duration_seconds,
        e.category,
        e.status,
        e.is_premium,
        e.view_count,
        e.created_at,
        u.username as author_name
      FROM emissions e
      LEFT JOIN users u ON e.host_id = u.id
      WHERE e.status = 'published'
    `;

    const params = [];

    if (category) {
      params.push(category);
      query += ` AND e.category = $1`;
    }

    query += ` ORDER BY e.created_at DESC LIMIT 50`;

    const { rows } = await pool.query(query, params);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    console.error('❌ Erreur liste émissions:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==========================================
// 2. DÉTAIL D'UNE ÉMISSION
// ==========================================
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const query = `
      SELECT 
        e.*,
        u.username as author_name
      FROM emissions e
      LEFT JOIN users u ON e.host_id = u.id
      WHERE e.id = $1
    `;

    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Émission introuvable'
      });
    }

    // Incrémenter le compteur de vues
    await pool.query('UPDATE emissions SET view_count = view_count + 1 WHERE id = $1', [id]);

    res.json({ success: true, emission: rows[0] });
  } catch (err) {
    console.error('❌ Erreur détail émission:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==========================================
// 3. CRÉER UNE ÉMISSION (Admin/Writer)
// ==========================================
router.post('/', isWriter, upload.single('image_file'), async (req, res) => {
  try {
    // Validation
    const { error, value } = emissionSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    const { title, description, video_url, duration_seconds, category, host_id, thumbnail_url } = value;

    let finalThumbnailUrl = thumbnail_url || '';

    // 1. Si fichier uploadé -> Cloudinary (prioritaire)
    if (req.file) {
      try {
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: "solitiquo_emissions"
        });
        finalThumbnailUrl = result.secure_url;
        fs.unlinkSync(req.file.path);
      } catch (e) {
        console.error("❌ Erreur Upload Image:", e);
      }
    }

    // 2. Sinon, essayer d'extraire miniature YouTube
    if (!finalThumbnailUrl) {
      const ytThumbnail = getYoutubeThumbnail(video_url);
      if (ytThumbnail) {
        finalThumbnailUrl = ytThumbnail;
      }
    }

    // 3. Image par défaut si toujours rien
    if (!finalThumbnailUrl) {
      finalThumbnailUrl = 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?auto=format&fit=crop&w=500&q=80';
    }

    // 4. Insertion en base
    const query = `
      INSERT INTO emissions (
        title, 
        description, 
        video_url, 
        thumbnail_url, 
        duration_seconds, 
        category, 
        host_id, 
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
      video_url,
      finalThumbnailUrl,
      duration_seconds || 0,
      category || 'Politique',
      host_id || req.session.user.id
    ];

    const { rows } = await pool.query(query, values);

    res.json({
      success: true,
      message: 'Émission créée',
      emission: rows[0]
    });

  } catch (err) {
    console.error("❌ Erreur création émission:", err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==========================================
// 4. METTRE À JOUR UNE ÉMISSION (Admin/Writer)
// ==========================================
router.put('/:id', isWriter, upload.single('image_file'), async (req, res) => {
  try {
    const { id } = req.params;

    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    // Validation
    const { error, value } = emissionSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    const { title, description, video_url, duration_seconds, category, thumbnail_url } = value;

    // Vérifier que l'émission existe
    const checkQuery = 'SELECT id, thumbnail_url FROM emissions WHERE id = $1';
    const checkResult = await pool.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Émission introuvable'
      });
    }

    let finalThumbnailUrl = checkResult.rows[0].thumbnail_url;

    // Nouvelle image uploadée ?
    if (req.file) {
      try {
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: "solitiquo_emissions"
        });
        finalThumbnailUrl = result.secure_url;
        fs.unlinkSync(req.file.path);
      } catch (e) {
        console.error("❌ Erreur Upload Image:", e);
      }
    } else if (thumbnail_url) {
      finalThumbnailUrl = thumbnail_url;
    } else {
      // Essayer d'extraire depuis nouvelle URL vidéo
      const ytThumbnail = getYoutubeThumbnail(video_url);
      if (ytThumbnail) {
        finalThumbnailUrl = ytThumbnail;
      }
    }

    // Mise à jour
    const query = `
      UPDATE emissions 
      SET title=$1, description=$2, video_url=$3, thumbnail_url=$4, duration_seconds=$5, category=$6, updated_at=NOW()
      WHERE id=$7 
      RETURNING id, title
    `;

    const values = [
      title,
      description,
      video_url,
      finalThumbnailUrl,
      duration_seconds || 0,
      category,
      id
    ];

    const { rows } = await pool.query(query, values);

    res.json({
      success: true,
      message: 'Émission mise à jour',
      emission: rows[0]
    });

  } catch (err) {
    console.error("❌ Erreur modification émission:", err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==========================================
// 5. SUPPRIMER UNE ÉMISSION (Admin/Writer)
// ==========================================
router.delete('/:id', isWriter, async (req, res) => {
  try {
    const { id } = req.params;

    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const result = await pool.query('DELETE FROM emissions WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Émission introuvable'
      });
    }

    res.json({
      success: true,
      message: 'Émission supprimée'
    });

  } catch (err) {
    console.error('❌ Erreur suppression émission:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==========================================
// 6. ÉMISSIONS PAR CATÉGORIE
// ==========================================
router.get('/category/:category', async (req, res) => {
  try {
    const { category } = req.params;

    const query = `
      SELECT 
        e.id,
        e.title,
        e.description,
        e.video_url,
        e.thumbnail_url,
        e.duration_seconds,
        e.category,
        e.is_premium,
        e.view_count,
        e.created_at,
        u.username as author_name
      FROM emissions e
      LEFT JOIN users u ON e.host_id = u.id
      WHERE e.status = 'published' AND e.category = $1
      ORDER BY e.created_at DESC
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
    console.error('❌ Erreur émissions par catégorie:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

module.exports = router;
