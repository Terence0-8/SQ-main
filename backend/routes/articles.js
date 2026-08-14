const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const fs = require('fs');
const Joi = require('joi');
const { isWriter } = require('../middleware/auth');
const { createUniqueSlug } = require('../utils/slugify');
const translationService = require('../services/translationService');
const { sanitizeHTML, sanitizeText, sanitizeArray } = require('../middleware/sanitize');


const { imageUpload } = require('../middleware/upload');

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
// UTILITAIRE : CALCUL DU READ_TIME
// ==========================================
// Vitesse de lecture adulte standard presse : 230 mots/minute
// On strip le HTML pour ne compter que les mots réels
const WORDS_PER_MINUTE = 230;

function calcReadTime(content) {
  if (!content || content.trim() === '') return 1;
  const plainText = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = plainText.split(' ').filter(w => w.length > 0).length;
  return Math.max(Math.ceil(wordCount / WORDS_PER_MINUTE), 1);
}

// ==========================================
// 1. LECTURE INTELLIGENTE (Multi-langues - AFFICHE TOUT)
// ==========================================
router.get('/', async (req, res) => {
  try {
    const { category, lang } = req.query;

    // 🌍 NOUVEAUTÉ: On filtre strictement par langue pour éviter les doublons avec les traductions
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
        a.read_time,
        a.translation_id,
        a.translation_method,
        a.is_premium,
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
      WHERE a.status = 'published' AND a.language = $1
    `;

    const params = [targetLang];

    // Filtrage par Catégorie ou Tags
    if (category) {
      params.push(category);
      query += ` AND (a.category = $${params.length} OR $${params.length} = ANY(a.tags))`;
    }

    // Tri par date
    query += ` ORDER BY a.published_at DESC`;

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
        a.read_time,
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
    if (article.status === 'published' || !article.status) {
      await pool.query('UPDATE articles SET views_count = COALESCE(views_count, 0) + 1, reads_start = COALESCE(reads_start, 0) + 1 WHERE id = $1', [article.id]);
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
        a.read_time,
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
    if (article.status === 'published' || !article.status) {
      await pool.query('UPDATE articles SET views_count = COALESCE(views_count, 0) + 1, reads_start = COALESCE(reads_start, 0) + 1 WHERE id = $1', [id]);
    }

    res.json({ success: true, article: article });

  } catch (err) {
    console.error('❌ Erreur SQL article detail:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==========================================
// 3. CRÉATION ARTICLE (SLUG AUTO + READ_TIME)
// ==========================================
router.post('/', isWriter, imageUpload.single('image'), async (req, res) => {
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

    // ✅ SANITISATION XSS avant insertion
    title = sanitizeText(title);
    content = sanitizeHTML(content);
    excerpt = excerpt ? sanitizeText(excerpt) : '';
    if (tagsArray.length) tagsArray = sanitizeArray(tagsArray);

    // ✅ CALCUL DU READ_TIME
    const readTime = calcReadTime(content);

    // Insertion en base (statut 'draft' par défaut)
    const query = `
      INSERT INTO articles 
      (title, slug, content, excerpt, category, author_id, language, featured_image, tags, translation_id, read_time, status, published_at, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'draft', NULL, NOW(), NOW())
      RETURNING id, title, slug, status, language, category, translation_id, read_time
    `;

    const values = [
      title,
      slug,
      content,
      excerpt,
      category,
      author_id || req.session.user.id,
      targetLang,
      finalImageUrl,
      tagsArray,
      translation_id || null,
      readTime
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
// MOVED TO /api/translate/article/:id
// ==========================================

// ==========================================
// 4. MODIFICATION ARTICLE (RÉGÉNÉRATION SLUG + READ_TIME)
// ==========================================
router.put('/:id', isWriter, imageUpload.single('image'), async (req, res) => {
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

    // ✅ SANITISATION XSS avant modification
    title = sanitizeText(title);
    content = sanitizeHTML(content);
    excerpt = excerpt ? sanitizeText(excerpt) : '';
    if (tagsArray.length) tagsArray = sanitizeArray(tagsArray);

    // ✅ RECALCUL DU READ_TIME à chaque modification du contenu
    const readTime = calcReadTime(content);

    let query, values;

    // Si nouvelle image, on met tout à jour
    if (finalImageUrl) {
      query = `
        UPDATE articles 
        SET title=$1, slug=$2, content=$3, excerpt=$4, category=$5, featured_image=$6, tags=$7, translation_id=$8, read_time=$9, updated_at=NOW()
        WHERE id=$10 
        RETURNING id, title, slug, status, language, read_time
      `;
      values = [title, slug, content, excerpt, category, finalImageUrl, tagsArray, translation_id || null, readTime, id];
    } else {
      // Sinon on garde l'image existante
      query = `
        UPDATE articles 
        SET title=$1, slug=$2, content=$3, excerpt=$4, category=$5, tags=$6, translation_id=$7, read_time=$8, updated_at=NOW()
        WHERE id=$9 
        RETURNING id, title, slug, status, language, read_time
      `;
      values = [title, slug, content, excerpt, category, tagsArray, translation_id || null, readTime, id];
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

// ==========================================
// TÉLÉCHARGEMENT PDF — Premium uniquement
// ==========================================
const PDFDocument = require('pdfkit');
const { isSubscriber } = require('../middleware/auth');
const https = require('https');
const http = require('http');

router.get('/:slug/download', isSubscriber, async (req, res) => {
  try {
    const lang = req.query.lang || 'fr';
    const slugCol = lang === 'en' ? 'slug_en' : 'slug';
    const titleCol = lang === 'en' ? 'title_en' : 'title';
    const contentCol = lang === 'en' ? 'content_en' : 'content';

    const result = await pool.query(
      `SELECT a.id, a.${titleCol} AS title, a.${contentCol} AS content,
              a.excerpt, a.featured_image, a.published_at, a.category,
              u.username AS author_name
       FROM articles a
       LEFT JOIN users u ON u.id = a.author_id
       WHERE a.${slugCol} = $1 AND a.status = 'published'`,
      [req.params.slug]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Article introuvable' });
    }

    const article = result.rows[0];
    const doc = new PDFDocument({ margin: 60, size: 'A4' });

    const filename = `solitiquo-${req.params.slug}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    // ── En-tête ──────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 90).fill('#37463D');
    doc.fill('#FFFFFF')
      .fontSize(22)
      .font('Helvetica-Bold')
      .text('SOLITIQUO', 60, 34, { align: 'left' });
    doc.fill('#A8C4A2')
      .fontSize(10)
      .font('Helvetica')
      .text('Le média de référence', 60, 60, { align: 'left' });

    doc.moveDown(4);

    // ── Catégorie ─────────────────────────────────────────
    if (article.category) {
      doc.fill('#C82823')
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(article.category.toUpperCase(), { align: 'left' });
      doc.moveDown(0.5);
    }

    // ── Titre ─────────────────────────────────────────────
    doc.fill('#1a1a1a')
      .fontSize(24)
      .font('Helvetica-Bold')
      .text(article.title || 'Sans titre', { align: 'left' });
    doc.moveDown(0.8);

    // ── Méta (auteur + date) ──────────────────────────────
    const authorName = article.author_name || 'Solitiquo';
    const publishDate = article.published_at
      ? new Date(article.published_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
      : '';
    doc.fill('#888888')
      .fontSize(10)
      .font('Helvetica')
      .text(`Par ${authorName}${publishDate ? '  ·  ' + publishDate : ''}`, { align: 'left' });

    // ── Séparateur ────────────────────────────────────────
    doc.moveDown(1);
    doc.moveTo(60, doc.y).lineTo(doc.page.width - 60, doc.y).strokeColor('#DDDDDD').lineWidth(1).stroke();
    doc.moveDown(1.5);

    // ── Contenu (strip HTML) ─────────────────────────────
    const rawContent = article.content || '';
    const cleanContent = rawContent
      .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n\n$1\n\n')
      .replace(/<\/?strong>/gi, '')
      .replace(/<\/?em>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    doc.fill('#333333')
      .fontSize(11.5)
      .font('Helvetica')
      .lineGap(4)
      .text(cleanContent, { align: 'justify', lineBreak: true });

    // ── Pied de page premium ─────────────────────────────
    doc.moveDown(2);
    doc.moveTo(60, doc.y).lineTo(doc.page.width - 60, doc.y).strokeColor('#DDDDDD').lineWidth(1).stroke();
    doc.moveDown(0.5);
    doc.fill('#AAAAAA')
      .fontSize(9)
      .text('Ce contenu est réservé aux abonnés Premium de Solitiquo — solitiquo.com', {
        align: 'center'
      });

    doc.end();

  } catch (err) {
    console.error('❌ Erreur génération PDF article:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Erreur lors de la génération du PDF' });
    }
  }
});

module.exports = router;

