const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const Joi = require('joi');
const { isWriter } = require('../middleware/auth');
const { createUniqueSlug } = require('../utils/slugify');
const translationService = require('../utils/translationService');

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
  author_id: Joi.number().integer().optional(),
  translation_id: Joi.number().integer().optional()
});


// ==========================================
// 1. LECTURE INTELLIGENTE (Multi-langues - AFFICHE TOUT)
// ==========================================
router.get('/', async (req, res) => {
  try {
    const { category, lang } = req.query;

    // 🌍 NOUVEAUTÉ: On affiche TOUS les articles, pas seulement ceux de la langue active
    // On trie juste en priorité les articles dans la langue demandée
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
        a.translation_id,
        a.translation_method,
        u.username as author_name,
        -- Vérifier si une traduction existe
        CASE 
          WHEN a.translation_id IS NOT NULL THEN true
          WHEN EXISTS(SELECT 1 FROM articles t WHERE t.translation_id = a.id) THEN true
          ELSE false
        END as has_translation,
        -- Récupérer l'ID de la traduction opposée
        COALESCE(
          a.translation_id,
          (SELECT id FROM articles t WHERE t.translation_id = a.id LIMIT 1)
        ) as linked_translation_id
      FROM articles a
      LEFT JOIN users u ON a.author_id = u.id
      WHERE a.status = 'published'
    `;

    const params = [];

    // Filtrage par Catégorie ou Tags
    if (category) {
      params.push(category);
      query += ` AND (a.category = $${params.length} OR $${params.length} = ANY(a.tags))`;
    }

    // Tri: Langue demandée en premier, puis par date
    query += ` ORDER BY 
      CASE WHEN a.language = $${params.length + 1} THEN 0 ELSE 1 END,
      a.published_at DESC
    `;
    params.push(targetLang);

    const { rows } = await pool.query(query, params);
    res.json({ 
      success: true, 
      count: rows.length, 
      preferredLang: targetLang, 
      data: rows 
    });

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
        a.translation_id,
        a.translation_method,
        u.username as author_name,
        -- Infos sur la traduction liée
        t.id as translation_article_id,
        t.title as translation_title,
        t.slug as translation_slug,
        t.language as translation_language
      FROM articles a
      LEFT JOIN users u ON a.author_id = u.id
      LEFT JOIN articles t ON (a.translation_id = t.id OR t.translation_id = a.id)
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
        a.translation_id,
        a.translation_method,
        u.username as author_name,
        -- Infos sur la traduction liée
        t.id as translation_article_id,
        t.title as translation_title,
        t.slug as translation_slug,
        t.language as translation_language
      FROM articles a
      LEFT JOIN users u ON a.author_id = u.id
      LEFT JOIN articles t ON (a.translation_id = t.id OR t.translation_id = a.id)
      WHERE a.id = $1
    `;

    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Article introuvable' });
    }

    const article = rows[0];

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
// 2b. RÉCUPÉRER LA TRADUCTION D'UN ARTICLE
// ==========================================
router.get('/:id/translation', async (req, res) => {
  try {
    const { id } = req.params;

    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const query = `
      SELECT 
        t.id,
        t.title,
        t.slug,
        t.language,
        t.translation_method,
        t.category,
        t.featured_image as image_url
      FROM articles a
      LEFT JOIN articles t ON (a.translation_id = t.id OR t.translation_id = a.id)
      WHERE a.id = $1 AND t.id IS NOT NULL
    `;

    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0) {
      return res.json({ 
        success: true, 
        has_translation: false, 
        message: 'Aucune traduction disponible' 
      });
    }

    res.json({ 
      success: true, 
      has_translation: true, 
      translation: rows[0] 
    });

  } catch (err) {
    console.error('❌ Erreur récupération traduction:', err);
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

    let { title, slug, content, excerpt, category, author_id, lang, image_url, tags, translation_id } = value;

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
      (title, slug, content, excerpt, category, author_id, language, featured_image, tags, translation_id, status, published_at, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'draft', NULL, NOW(), NOW())
      RETURNING id, title, slug, status, language, category, translation_id
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
      tagsArray,
      translation_id || null
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
// 3b. TRADUIRE UN ARTICLE AVEC IA (DeepL)
// ==========================================
router.post('/:id/translate', isWriter, async (req, res) => {
  try {
    const { id } = req.params;
    const { targetLang } = req.body; // 'fr' ou 'en'

    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    if (!targetLang || !['fr', 'en'].includes(targetLang)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Langue cible invalide (fr ou en requis)' 
      });
    }

    // Vérifier que DeepL est configuré
    if (!translationService.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Service de traduction non configuré. Ajoutez DEEPL_API_KEY dans .env'
      });
    }

    // Récupérer l'article source
    const articleQuery = await pool.query(
      'SELECT * FROM articles WHERE id = $1',
      [id]
    );

    if (articleQuery.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Article introuvable' });
    }

    const sourceArticle = articleQuery.rows[0];

    // Vérifier qu'on ne traduit pas vers la même langue
    if (sourceArticle.language === targetLang) {
      return res.status(400).json({
        success: false,
        error: `L'article est déjà en ${targetLang}`
      });
    }

    // Vérifier si une traduction existe déjà
    const existingTranslation = await pool.query(
      'SELECT id FROM articles WHERE translation_id = $1 OR (id = $2 AND translation_id IS NOT NULL)',
      [id, sourceArticle.translation_id]
    );

    if (existingTranslation.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Une traduction existe déjà pour cet article',
        existing_id: existingTranslation.rows[0].id
      });
    }

    console.log(`🌍 Démarrage traduction article ${id} vers ${targetLang}...`);

    // Traduire avec DeepL
    const translated = await translationService.translateArticle(sourceArticle, targetLang);

    // Générer un slug unique pour la traduction
    const translatedSlug = await createUniqueSlug(translated.title, 'articles');

    // Insérer la traduction en BDD
    const insertQuery = `
      INSERT INTO articles 
      (title, slug, content, excerpt, category, author_id, language, featured_image, tags, 
       translation_id, translation_method, status, is_premium, published_at, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ai', $11, $12, $13, NOW(), NOW())
      RETURNING id, title, slug, language, translation_method
    `;

    const insertValues = [
      translated.title,
      translatedSlug,
      translated.content,
      translated.excerpt,
      sourceArticle.category,
      sourceArticle.author_id,
      targetLang,
      sourceArticle.featured_image, // On garde la même image
      sourceArticle.tags, // On garde les mêmes tags
      id, // Lien vers l'article source
      sourceArticle.status, // Même statut que l'original
      sourceArticle.is_premium,
      sourceArticle.published_at
    ];

    const { rows } = await pool.query(insertQuery, insertValues);

    console.log(`✅ Traduction créée avec succès (ID: ${rows[0].id})`);

    res.json({
      success: true,
      message: `Article traduit en ${targetLang} avec succès`,
      translation: rows[0],
      source_id: id
    });

  } catch (err) {
    console.error('❌ Erreur traduction article:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message || 'Erreur lors de la traduction' 
    });
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

    let { title, slug, content, excerpt, category, image_url, tags, translation_id } = value;

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
        SET title=$1, slug=$2, content=$3, excerpt=$4, category=$5, featured_image=$6, tags=$7, translation_id=$8, updated_at=NOW()
        WHERE id=$9 
        RETURNING id, title, slug, status, language
      `;
      values = [title, slug, content, excerpt || '', category, finalImageUrl, tagsArray, translation_id || null, id];
    } else {
      // Sinon on garde l'image existante
      query = `
        UPDATE articles 
        SET title=$1, slug=$2, content=$3, excerpt=$4, category=$5, tags=$6, translation_id=$7, updated_at=NOW()
        WHERE id=$8 
        RETURNING id, title, slug, status, language
      `;
      values = [title, slug, content, excerpt || '', category, tagsArray, translation_id || null, id];
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