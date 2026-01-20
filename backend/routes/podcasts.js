const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');

// Configuration Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload = multer({ dest: 'uploads/' });

// GET /api/podcasts
// Récupérer la liste
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT p.*, u.first_name || ' ' || u.last_name as author_name 
      FROM podcasts p LEFT JOIN users u ON p.author_id = u.id
      WHERE p.status = 'published' ORDER BY p.created_at DESC
    `;
    const { rows } = await pool.query(query);
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/podcasts/:id
// Récupérer un épisode spécifique
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const query = `SELECT * FROM podcasts WHERE id = $1`;
    const { rows } = await pool.query(query, [id]);
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Introuvable' });
    res.json({ success: true, podcast: rows[0] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/podcasts
// Créer un podcast (Audio + Image Fichier OU Image URL)
const cpUpload = upload.fields([{ name: 'audio_file', maxCount: 1 }, { name: 'image_file', maxCount: 1 }]);

router.post('/', cpUpload, async (req, res) => {
  try {
    // On récupère aussi 'image_url' du formulaire
    const { title, description, category, author_id, transcript, image_url } = req.body;
    
    // Validation Audio (Obligatoire)
    if (!req.files['audio_file']) {
      return res.status(400).json({ success: false, error: 'Fichier audio requis.' });
    }

    let audioUrl = '';
    let finalImageUrl = image_url; // On commence avec l'URL fournie (ou vide)
    let duration = 0;

    // 1. Upload Audio (Cloudinary)
    const audioFile = req.files['audio_file'][0];
    try {
      const audioRes = await cloudinary.uploader.upload(audioFile.path, { 
        resource_type: "video", 
        folder: "solitiquo_podcasts" 
      });
      audioUrl = audioRes.secure_url;
      duration = Math.round(audioRes.duration);
      fs.unlinkSync(audioFile.path); // Nettoyage
    } catch (e) {
      console.error("Erreur Upload Audio:", e);
      return res.status(500).json({ success: false, error: "Échec upload audio" });
    }

    // 2. Gestion Image (Fichier > URL > Défaut)
    if (req.files['image_file']) {
      // Cas A : Fichier uploadé (Prioritaire)
      const imgFile = req.files['image_file'][0];
      try {
        const imgRes = await cloudinary.uploader.upload(imgFile.path, { folder: "solitiquo_covers" });
        finalImageUrl = imgRes.secure_url;
        fs.unlinkSync(imgFile.path);
      } catch (e) { console.error("Erreur Upload Image:", e); }
    } 
    
    // Si à la fin on n'a toujours rien (ni fichier, ni URL valide), on met l'image par défaut
    if (!finalImageUrl) {
      finalImageUrl = 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?auto=format&fit=crop&w=500&q=80';
    }

    // 3. Enregistrement en Base
    const slug = title.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');

    const query = `
      INSERT INTO podcasts (title, slug, description, transcript, audio_url, image_url, duration, category, author_id, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'published', NOW())
      RETURNING id
    `;
    
    const { rows } = await pool.query(query, [
      title, 
      slug, 
      description, 
      transcript || '', 
      audioUrl, 
      finalImageUrl, 
      duration, 
      category || 'Politique', 
      author_id || 1
    ]);
    
    res.json({ success: true, podcast: rows[0] });

  } catch (err) {
    console.error("Erreur Serveur Podcast:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// RÉCUPÉRER LE PODCAST À LA UNE (Par page)
router.get('/featured/:page', async (req, res) => {
    try {
        const { page } = req.params;
        let query = "";
        let params = [];

        if (page === 'index') {
            // INDEX : Toujours le dernier podcast publié (toutes catégories)
            query = "SELECT * FROM podcasts WHERE is_hidden = FALSE ORDER BY created_at DESC LIMIT 1";
        } 
        else if (page === 'politique') {
            // POLITIQUE : Celui tagué 'politique', sinon le dernier de la catégorie Politique
            query = `
                SELECT * FROM podcasts 
                WHERE featured_scope = 'politique' 
                OR (featured_scope IS NULL AND category = 'Politique')
                ORDER BY featured_scope NULLS LAST, created_at DESC LIMIT 1
            `;
        } 
        else if (page === 'social') {
            // SOCIAL : Celui tagué 'social', sinon le dernier de la catégorie Social
            query = `
                SELECT * FROM podcasts 
                WHERE featured_scope = 'social' 
                OR (featured_scope IS NULL AND category = 'Social')
                ORDER BY featured_scope NULLS LAST, created_at DESC LIMIT 1
            `;
        } else {
            return res.json({ success: false, message: "Page inconnue" });
        }

        const result = await pool.query(query);
        if (result.rows.length > 0) {
            res.json({ success: true, data: result.rows[0] });
        } else {
            res.json({ success: false, message: "Aucun podcast trouvé" });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;