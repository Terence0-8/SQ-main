const express = require('express');
const router = express.Router();

const pool = require('../config/database');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const fs = require('fs');
const Joi = require('joi');
const { isWriter } = require('../middleware/auth');
const { sanitizeText, sanitizeHTML } = require('../middleware/sanitize');

const { mixedUpload } = require('../middleware/upload');

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
    const { category, lang } = req.query;
    const isEn = lang === 'en';

    let query = `
      SELECT 
        p.id,
        ${isEn ? 'COALESCE(p.title_en, p.title)' : 'p.title'} as title,
        ${isEn ? 'COALESCE(p.description_en, p.description)' : 'p.description'} as description,
        ${isEn ? 'COALESCE(p.audio_url_en, p.audio_url)' : 'p.audio_url'} as audio_url,
        p.cover_image as image_url,
        p.duration_seconds as duration,
        p.category,
        p.status,
        p.is_premium,
        p.is_featured,
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
// 🆕 1B. PODCAST À LA UNE GLOBAL (pour index.html)
// ==========================================
router.get('/featured', async (req, res) => {
  try {
    const { lang } = req.query;
    const isEn = lang === 'en';

    const query = `
      SELECT 
        p.id,
        ${isEn ? 'COALESCE(p.title_en, p.title)' : 'p.title'} as title,
        ${isEn ? 'COALESCE(p.description_en, p.description)' : 'p.description'} as description,
        ${isEn ? 'COALESCE(p.audio_url_en, p.audio_url)' : 'p.audio_url'} as audio_url,
        p.cover_image as image_url,
        p.duration_seconds,
        p.category,
        p.is_premium,
        p.is_featured,
        p.play_count,
        p.created_at,
        u.username as author_name
      FROM podcasts p
      LEFT JOIN users u ON p.author_id = u.id
      WHERE p.status = 'published'
      ORDER BY p.is_featured DESC, p.created_at DESC
      LIMIT 1
    `;

    const { rows } = await pool.query(query);
    if (rows.length === 0) {
      return res.json({ success: false, message: 'Aucun podcast publié' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('❌ Erreur podcast featured global:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// 🆕 1C. PODCAST À LA UNE PAR CATÉGORIE (pour politique.html / social.html)
// ==========================================
router.get('/featured/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const { lang } = req.query;
    const isEn = lang === 'en';
    const catLower = (category || '').trim().toLowerCase();

    let targetCol = 'is_featured';
    if (catLower === 'politique') targetCol = 'is_featured_politique';
    else if (catLower === 'social' || catLower === 'societe' || catLower === 'société') targetCol = 'is_featured_social';

    const query = `
      SELECT 
        p.id,
        ${isEn ? 'COALESCE(p.title_en, p.title)' : 'p.title'} as title,
        ${isEn ? 'COALESCE(p.description_en, p.description)' : 'p.description'} as description,
        ${isEn ? 'COALESCE(p.audio_url_en, p.audio_url)' : 'p.audio_url'} as audio_url,
        p.cover_image as image_url,
        p.duration_seconds,
        p.category,
        p.is_premium,
        p.is_featured,
        COALESCE(p.is_featured_politique, FALSE) as is_featured_politique,
        COALESCE(p.is_featured_social, FALSE) as is_featured_social,
        p.play_count,
        p.created_at,
        u.username as author_name
      FROM podcasts p
      LEFT JOIN users u ON p.author_id = u.id
      WHERE p.status = 'published'
      ORDER BY 
        CASE WHEN ${targetCol} = TRUE THEN 0
             WHEN LOWER(p.category) = $1 THEN 1
             ELSE 2 END,
        p.created_at DESC
      LIMIT 1
    `;

    const { rows } = await pool.query(query, [catLower]);
    if (rows.length === 0) {
      return res.json({ success: false, message: 'Aucun podcast pour cette catégorie' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('❌ Erreur podcast featured catégorie:', err);
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

    // Incrémenter le compteur de lectures (sauf en mode édition admin)
    if (!req.query.edit) {
      await pool.query('UPDATE podcasts SET play_count = play_count + 1 WHERE id = $1', [id]);
    }

    res.json({ success: true, podcast: rows[0] });
  } catch (err) {
    console.error('❌ Erreur détail podcast:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==========================================
// 3. CRÉER UN PODCAST (Admin/Writer)
// ==========================================
router.post('/', isWriter, mixedUpload.fields([
  { name: 'cover_image', maxCount: 1 },
  { name: 'audio_file', maxCount: 1 }
]), async (req, res) => {
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'published', FALSE, NOW(), NOW(), $8, $9, $10)
      RETURNING id, title
    `;

    // ✅ SANITISATION XSS
    const safeTitle = sanitizeText(title);
    const safeDescription = description ? sanitizeHTML(description) : '';
    const safeCategory = category ? sanitizeText(category) : 'Général';

    const values = [
      safeTitle,
      safeDescription,
      audioUrl,
      finalImageUrl,
      duration,
      safeCategory,
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
router.put('/:id', isWriter, mixedUpload.fields([
  { name: 'cover_image', maxCount: 1 },
  { name: 'audio_file', maxCount: 1 }
]), async (req, res) => {
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

    // ✅ SANITISATION XSS
    const safeTitle = sanitizeText(title);
    const safeDescription = description ? sanitizeHTML(description) : '';
    const safeCategory = category ? sanitizeText(category) : 'Général';

    // Mise à jour
    let query, values;

    if (duration > 0) {
      // Si nouvel audio, on met à jour duration aussi
      query = `
        UPDATE podcasts 
        SET title=$1, description=$2, audio_url=$3, cover_image=$4, duration_seconds=$5, category=$6, is_featured=$7, is_featured_politique=$8, is_featured_social=$9, updated_at=NOW()
        WHERE id=$7 
        RETURNING id, title
      `;
      values = [safeTitle, safeDescription, audioUrl, finalImageUrl, duration, safeCategory, id];
    } else {
      // Sinon on garde la durée existante
      query = `
        UPDATE podcasts 
        SET title=$1, description=$2, cover_image=$3, category=$4, is_featured=$5, is_featured_politique=$6, is_featured_social=$7, updated_at=NOW()
        WHERE id=$5 
        RETURNING id, title
      `;
      values = [safeTitle, safeDescription, finalImageUrl, safeCategory, id];
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

// ==========================================
// TÉLÉCHARGEMENT AUDIO — Premium uniquement
// ==========================================
const axios = require('axios');
const { isSubscriber } = require('../middleware/auth');

router.get('/:slug/download', isSubscriber, async (req, res) => {
  try {
    const lang = req.query.lang || 'fr';
    const slugCol = lang === 'en' ? 'slug_en' : 'slug';
    const audioCol = lang === 'en' ? 'audio_url_en' : 'audio_url';
    const titleCol = lang === 'en' ? 'title_en' : 'title';

    const result = await pool.query(
      `SELECT ${titleCol} AS title, ${audioCol} AS audio_url
       FROM podcasts
       WHERE ${slugCol} = $1 AND status = 'published'`,
      [req.params.slug]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Podcast introuvable' });
    }

    const { title, audio_url } = result.rows[0];

    if (!audio_url) {
      return res.status(404).json({ success: false, error: 'Fichier audio introuvable' });
    }

    // Extraire l'extension depuis l'URL (mp3, m4a, ogg, etc.)
    const urlPath = new URL(audio_url).pathname;
    const ext = urlPath.split('.').pop().split('?')[0] || 'mp3';

    // Nom du fichier en téléchargement
    const safeTitle = (title || req.params.slug)
      .toLowerCase()
      .replace(/[^a-z0-9\u00C0-\u024F\s-]/gi, '')
      .replace(/\s+/g, '-')
      .substring(0, 80);
    const filename = `solitiquo-${safeTitle}.${ext}`;

    // Proxy stream depuis Cloudinary → client
    const audioResponse = await axios.get(audio_url, {
      responseType: 'stream',
      timeout: 30000
    });

    res.setHeader('Content-Type', audioResponse.headers['content-type'] || `audio/${ext}`);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    if (audioResponse.headers['content-length']) {
      res.setHeader('Content-Length', audioResponse.headers['content-length']);
    }

    audioResponse.data.pipe(res);

    audioResponse.data.on('error', (err) => {
      console.error('❌ Stream audio error:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Erreur lors du téléchargement audio' });
      }
    });

  } catch (err) {
    console.error('❌ Erreur téléchargement podcast:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }
});

// ==========================================
// TOGGLE IS_FEATURED (Admin)
// ==========================================
const { isAdmin } = require('../middleware/auth');
router.post('/:id/toggle-featured', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const target = (req.query.target || req.body.target || 'global').toLowerCase();
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'ID invalide' });

    let col = 'is_featured';
    if (target === 'politique') col = 'is_featured_politique';
    if (target === 'social') col = 'is_featured_social';

    const checkRes = await pool.query(`SELECT ${col} FROM podcasts WHERE id = $1`, [id]);
    if (checkRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Podcast introuvable' });

    const isCurrentlyFeatured = checkRes.rows[0][col] === true;

    // Seul un podcast peut être mis en avant par emplacement à la fois
    await pool.query(`UPDATE podcasts SET ${col} = FALSE`);

    let newStatus = false;
    if (!isCurrentlyFeatured) {
      await pool.query(`UPDATE podcasts SET ${col} = TRUE WHERE id = $1`, [id]);
      newStatus = true;
    }

    res.json({ success: true, target, is_featured: newStatus });
  } catch (err) {
    console.error('❌ Erreur toggle featured:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

module.exports = router;

