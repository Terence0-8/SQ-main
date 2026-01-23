const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const Joi = require('joi');
const { isWriter } = require('../middleware/auth');
const { createUniqueSlug } = require('../utils/slugify');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload = multer({ dest: 'uploads/' });

// ==========================================
// VALIDATION SCHEMA
// ==========================================
const articleSchema = Joi.object({
  title: Joi.string().min(5).max(500).required()
    .messages({
      'string.min': 'Le titre doit contenir au moins 5 caractères',
      'string.max': 'Le titre ne doit pas dépasser 500 caractères',
      'any.required': 'Le titre est requis'
    }),

  slug: Joi.string().pattern(/^[a-z0-9-]+$/).max(500).optional()
    .messages({
      'string.pattern.base': 'Le slug ne doit contenir que des lettres minuscules, chiffres et tirets'
    }),

  content: Joi.string().min(50).required()
    .messages({
      'string.min': 'Le contenu doit contenir au moins 50 caractères',
      'any.required': 'Le contenu est requis'
    }),

  excerpt: Joi.string().max(1000).allow('').optional(),

  category: Joi.string().required()
    .messages({
      'any.required': 'La catégorie est requise'
    }),

  tags: Joi.alternatives().try(
    Joi.array().items(Joi.string()),
    Joi.string()
  ).optional(),

  lang: Joi.string().valid('fr', 'en').optional(),
  image_url: Joi.string().uri().allow('').optional(),
  image_caption: Joi.string().allow('').optional(),
  author_id: Joi.number().integer().optional()
});


// ==========================================
// 1. LECTURE INTELLIGENTE (Multi-rubriques & Langue)
// ==========================================
router.get('/', async (req, res) => {
  try {
    const { category, lang } = req.query;

    // 1. Définition de la langue (Défaut: 'fr')
    // Si le paramètre ?lang= est absent, on force 'fr' pour éviter le contenu mixte
    const targetLang = (lang === 'en') ? 'en' : 'fr';

    let query = `
      SELECT 
        a.id, 
        a.title, 
        a.slug, 
        a.excerpt, 
        a.category, 
        a.published_at, 
        a.featured_image AS image_url, 
        a.language, 
        a.tags,
        a.views_count,
        u.username as author_name
      FROM articles a
      LEFT JOIN users u ON a.author_id = u.id
      WHERE a.status = 'published'
      AND a.language = $1 
    `;

    const params = [targetLang];

    // 2. Filtrage par Catégorie ou Tags
    if (category) {
      params.push(category);
      // $2 sera la catégorie
      query += ` AND (a.category = $${params.length} OR $${params.length} = ANY(a.tags))`;
    }

    query += ` ORDER BY a.published_at DESC`;

    const { rows } = await pool.query(query, params);
    res.json({ success: true, count: rows.length, lang: targetLang, data: rows });

  } catch (err) {
    console.error('❌ Erreur SQL articles:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==========================================
// 1b. LECTURE ARTICLE PAR SLUG (SEO)
// ==========================================
router.get('/by-slug/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const { lang } = req.query;

    const targetLang = lang || 'fr';

    const query = `
      SELECT 
        a.id,
        a.title,
        a.slug,
        a.content,
        a.excerpt,
        a.category,
        a.status,
        a.is_premium,
        a.language,
        a.tags,
        a.views_count,
        a.featured_image AS image_url,
        a.published_at,
        a.created_at,
        a.updated_at,
        a.author_id,
        u.username as author_name
      FROM articles a
      LEFT JOIN users u ON a.author_id = u.id
      WHERE a.slug = $1 AND a.language = $2
    `;

    const { rows } = await pool.query(query, [slug, targetLang]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Article introuvable' });
    }

    const article = rows[0];

    // Vérification droits accès
    const user = req.session && req.session.user ? req.session.user : null;
    const isAdmin = user && (user.role === 'admin' || user.role === 'writer');

    if (article.status !== 'published' && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: "Cet article n'est pas encore public."
      });
    }

    // Incrémenter les vues (seulement pour articles publiés)
    if (article.status === 'published') {
      await pool.query('UPDATE articles SET views_count = views_count + 1 WHERE id = $1', [article.id]);
    }

    res.json({ success: true, article: article });

  } catch (err) {
    console.error('❌ Erreur lecture article par slug:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==========================================
// 2. LECTURE ARTICLE UNIQUE PAR ID
// ==========================================
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validation ID
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    // On récupère l'utilisateur connecté via la session (si elle existe)
    const user = req.session && req.session.user ? req.session.user : null;
    const isAdmin = user && (user.role === 'admin' || user.role === 'writer');

    const query = `
      SELECT 
        a.id,
        a.title,
        a.slug,
        a.content,
        a.excerpt,
        a.category,
        a.status,
        a.is_premium,
        a.language,
        a.tags,
        a.views_count,
        a.featured_image AS image_url,
        a.published_at,
        a.created_at,
        a.updated_at,
        a.author_id,
        u.username as author_name
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
      return res.status(403).json({
        success: false,
        error: "Cet article n'est pas encore public."
      });
    }

    // Incrémenter les vues (seulement pour articles publiés)
    if (article.status === 'published') {
      await pool.query('UPDATE articles SET views_count = views_count + 1 WHERE id = $1', [id]);
    }

    res.json({ success: true, article: article });

  } catch (err) {
    console.error('❌ Erreur SQL article detail:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==========================================
// 3. CRÉATION ARTICLE (SLUG AUTO)
// ==========================================
router.post('/', isWriter, upload.single('image_file'), async (req, res) => {
  try {
    // Validation des données
    const { error, value } = articleSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    let { title, slug, content, excerpt, category, author_id, lang, image_url, tags } = value;

    // ✅ GÉNÉRATION AUTOMATIQUE DU SLUG
    if (!slug) {
      slug = await createUniqueSlug(title, 'articles');
      console.log(`✅ Slug généré automatiquement: ${slug}`);
    } else {
      // Vérifier unicité du slug fourni
      const existing = await pool.query('SELECT id FROM articles WHERE slug = $1', [slug]);
      if (existing.rows.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Ce slug existe déjà, veuillez en choisir un autre'
        });
      }
    }

    // Parsing tags
    let tagsArray = [];
    if (tags) {
      if (typeof tags === 'string') {
        try {
          tagsArray = JSON.parse(tags);
        } catch (e) {
          tagsArray = tags.split(',').map(t => t.trim());
        }
      } else if (Array.isArray(tags)) {
        tagsArray = tags;
      }
    }

    // Gestion de l'upload image
    let finalImageUrl = image_url;
    if (req.file) {
      try {
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: "solitiquo_articles"
        });
        finalImageUrl = result.secure_url;
        fs.unlinkSync(req.file.path);
      } catch (e) {
        console.error("❌ Erreur Cloudinary:", e);
        return res.status(500).json({
          success: false,
          error: 'Erreur lors de l\'upload de l\'image'
        });
      }
    }

    if (!finalImageUrl) {
      finalImageUrl = 'https://via.placeholder.com/800x400';
    }

    const targetLang = lang || 'fr';

    // Insertion en base (statut 'draft' par défaut)
    const query = `
      INSERT INTO articles 
      (title, slug, content, excerpt, category, author_id, language, featured_image, tags, status, published_at, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', NULL, NOW(), NOW())
      RETURNING id, title, slug, status, language, category
    `;

    const values = [
      title,
      slug,
      content,
      excerpt || '',
      category,
      author_id || req.session.user.id,
      targetLang,
      finalImageUrl,
      tagsArray
    ];

    const { rows } = await pool.query(query, values);

    // ✅ RETOURNER LA NOUVELLE URL SEO
    const categoryMap = {
      'Politique': 'politique',
      'Social': 'social',
      'Économie': 'economie',
      'Culture': 'culture',
      'International': 'international',
      'Dossiers': 'dossiers'
    };

    const urlCategory = categoryMap[rows[0].category] || 'politique';
    const seoUrl = `/${rows[0].language}/${urlCategory}/${rows[0].slug}`;

    res.json({
      success: true,
      message: 'Article créé en mode brouillon',
      article: rows[0],
      url: seoUrl
    });

  } catch (err) {
    console.error('❌ Erreur création article:', err);

    // Gestion erreur slug déjà existant
    if (err.code === '23505') {
      return res.status(400).json({
        success: false,
        error: 'Ce slug existe déjà, veuillez en choisir un autre'
      });
    }

    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==========================================
// 4. MODIFICATION ARTICLE (RÉGÉNÉRATION SLUG SI TITRE CHANGE)
// ==========================================
router.put('/:id', isWriter, upload.single('image_file'), async (req, res) => {
  try {
    const { id } = req.params;

    // Validation ID
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    // Récupérer l'article actuel
    const currentArticle = await pool.query('SELECT title, slug FROM articles WHERE id = $1', [id]);
    
    if (currentArticle.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Article introuvable' });
    }

    // Validation des données
    const { error, value } = articleSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    let { title, slug, content, excerpt, category, image_url, tags } = value;

    // ✅ RÉGÉNÉRER LE SLUG SI LE TITRE CHANGE
    if (title !== currentArticle.rows[0].title && !slug) {
      slug = await createUniqueSlug(title, 'articles', id);
      console.log(`✅ Slug régénéré automatiquement: ${slug}`);
    } else if (!slug) {
      slug = currentArticle.rows[0].slug; // Garder l'ancien slug
    }

    // Parsing tags
    let tagsArray = [];
    if (tags) {
      if (typeof tags === 'string') {
        try {
          tagsArray = JSON.parse(tags);
        } catch (e) {
          tagsArray = tags.split(',').map(t => t.trim());
        }
      } else if (Array.isArray(tags)) {
        tagsArray = tags;
      }
    }

    // Gestion Image
    let finalImageUrl = image_url;
    if (req.file) {
      try {
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: "solitiquo_articles"
        });
        finalImageUrl = result.secure_url;
        fs.unlinkSync(req.file.path);
      } catch (e) {
        console.error("❌ Erreur Cloudinary:", e);
      }
    }

    let query, values;

    // Si nouvelle image, on met tout à jour
    if (finalImageUrl) {
      query = `
        UPDATE articles 
        SET title=$1, slug=$2, content=$3, excerpt=$4, category=$5, featured_image=$6, tags=$7, updated_at=NOW()
        WHERE id=$8 
        RETURNING id, title, slug, status
      `;
      values = [title, slug, content, excerpt || '', category, finalImageUrl, tagsArray, id];
    } else {
      // Sinon on garde l'image existante
      query = `
        UPDATE articles 
        SET title=$1, slug=$2, content=$3, excerpt=$4, category=$5, tags=$6, updated_at=NOW()
        WHERE id=$7 
        RETURNING id, title, slug, status
      `;
      values = [title, slug, content, excerpt || '', category, tagsArray, id];
    }

    const { rows } = await pool.query(query, values);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Article introuvable"
      });
    }

    res.json({
      success: true,
      message: 'Article mis à jour',
      article: rows[0]
    });

  } catch (err) {
    console.error('❌ Erreur modification article:', err);

    // Gestion erreur slug déjà existant
    if (err.code === '23505') {
      return res.status(400).json({
        success: false,
        error: 'Ce slug existe déjà'
      });
    }

    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==========================================
// 5. SUPPRESSION ARTICLE
// ==========================================
router.delete('/:id', isWriter, async (req, res) => {
  try {
    const { id } = req.params;

    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const { rows } = await pool.query('DELETE FROM articles WHERE id = $1 RETURNING id', [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Article introuvable'
      });
    }

    res.json({
      success: true,
      message: 'Article supprimé'
    });

  } catch (err) {
    console.error('❌ Erreur suppression article:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

module.exports = router;