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

// GET /api/emissions (Liste)
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT e.*, u.username as author_name 
      FROM emissions e 
      LEFT JOIN users u ON e.author_id = u.id
      WHERE e.status = 'published' 
      ORDER BY e.published_at DESC
    `;
    const { rows } = await pool.query(query);
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/emissions (Ajout)
router.post('/', upload.single('image_file'), async (req, res) => {
  try {
    const { title, description, category, video_url, duration, author_id } = req.body;
    
    let imageUrl = '';

    // 1. Si fichier uploadé -> Cloudinary
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, { folder: "solitiquo_emissions" });
      imageUrl = result.secure_url;
      fs.unlinkSync(req.file.path);
    }

    // 2. Si pas d'image mais lien YouTube -> On prend la miniature YouTube
    if (!imageUrl && video_url && (video_url.includes('youtube') || video_url.includes('youtu.be'))) {
        // Regex pour extraire l'ID
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
        const match = video_url.match(regExp);
        if (match && match[2].length === 11) {
            imageUrl = `https://img.youtube.com/vi/${match[2]}/maxresdefault.jpg`;
        }
    }

    // 3. Insertion
    const slug = title.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');
    const query = `
      INSERT INTO emissions (title, slug, description, video_url, image_url, duration, category, author_id, status, published_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'published', NOW())
      RETURNING id
    `;
    
    const { rows } = await pool.query(query, [
      title, slug, description, video_url, imageUrl, duration || 0, category || 'Politique', author_id || 1
    ]);
    
    res.json({ success: true, emission: rows[0] });

  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;