
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const translationService = require('../services/translationService');
const { createUniqueSlug } = require('../utils/slugify');
const { isWriter } = require('../middleware/auth'); // Optional: restrict if needed, but "first user translates" implies public access? 
// Waiting: logic "First user translates" implies any user can trigger it? 
// Implementation plan says: "User 1 clicks Translate -> Backend calls DeepL".
// So it seems public users can trigger it. I will NOT use isWriter for the trigger, BUT I might need to protect against abuse.
// Plan didn't specify authentication for translation trigger. I'll make it open but rate-limited by IP (already in server.js maybe?)
// or maybe check if user is logged in?
// "User 1 clicks Translate" -> implies user is logged in?
// The prompt says "User 1 clique Translate... User 2 clique Translate". It doesn't explicitly say "Subscriber".
// But `article.html` has `initTranslationButton`.
// I will assume it's publicly accessible or simpler: authenticated users.
// Let's stick to the prompt's simplicity: "User 1 triggers". I'll allow it for now without strict auth middleware on the route itself 
// because `server.js` has rate limiting.
// ACTUALLY, checking `article.html`... the button is shown.
// I will NOT add `isWriter` middleware to the route.

// ==========================================
// POST /api/translate/article/:id
// Trigger translation of an article
// ==========================================
router.post('/article/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { targetLang } = req.body; // 'fr' or 'en'

        if (!['fr', 'en'].includes(targetLang)) {
            return res.status(400).json({ success: false, error: 'Invalid target language' });
        }

        // 1. Fetch Source Article
        const articleRes = await pool.query('SELECT * FROM articles WHERE id = $1', [id]);
        if (articleRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Article not found' });
        }
        const sourceArticle = articleRes.rows[0];

        // 2. Check if already translated (in articles table) or if it IS the target lang
        if (sourceArticle.language === targetLang) {
            return res.json({ success: true, translation: sourceArticle, message: 'Already in target language' });
        }

        // Check if a linked translation exists
        const existingRes = await pool.query(`
      SELECT * FROM articles 
      WHERE (translation_id = $1 OR id = $2) 
      AND language = $3
      LIMIT 1
    `, [sourceArticle.translation_id || sourceArticle.id, sourceArticle.translation_id || sourceArticle.id, targetLang]);

        if (existingRes.rows.length > 0) {
            return res.json({ success: true, translation: existingRes.rows[0], from_cache: true });
        }

        // 3. Perform Translation (with Cache)
        // This part might take 1-3 seconds.
        const translatedData = await translationService.translateArticle(sourceArticle, targetLang);

        // 4. Create New Article in DB
        const newSlug = await createUniqueSlug(translatedData.title, 'articles');

        const insertQuery = `
      INSERT INTO articles 
      (title, slug, content, excerpt, category, author_id, language, featured_image, tags, 
       translation_id, translation_method, status, is_premium, published_at, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ai', $11, $12, $13, NOW(), NOW())
      RETURNING id, title, slug, language
    `;

        // Linked ID: if source has translation_id, use it. Else use source ID.
        // Ideally validation logic: all translations of same article share content.
        // Simple logic: Link to source.
        const linkId = sourceArticle.translation_id || sourceArticle.id;

        const values = [
            translatedData.title,
            newSlug,
            translatedData.content,
            translatedData.excerpt,
            sourceArticle.category,
            sourceArticle.author_id, // Keep same author
            targetLang,
            sourceArticle.featured_image,
            sourceArticle.tags,
            linkId, // Link them
            sourceArticle.status, // Keep status
            sourceArticle.is_premium,
            sourceArticle.published_at
        ];

        const insertRes = await pool.query(insertQuery, values);
        const newArticle = insertRes.rows[0];

        // Update source article to link as well if needed (often handled by usage of translation_id)
        // If source didn't have translation_id, we might want to set it?
        // The current logic in `articles.js` uses `LEFT JOIN articles t ON (a.translation_id = t.id OR t.translation_id = a.id)`.
        // So usually we link child to parent.
        // If we want bidirectional, we usually update parent too. But let's keep it simple: 
        // Child references Parent (source) via translation_id. Parent might have translation_id NULL.
        // The previous articles.js logic handles this.

        res.json({ success: true, translation: newArticle });

    } catch (err) {
        console.error('❌ Translation Error:', err);
        res.status(500).json({ success: false, error: 'Translation failed' });
    }
});

// ==========================================
// GET /api/translate/article/:id
// Check if translation exists
// ==========================================
router.get('/article/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { lang } = req.query; // Target lang

        // Check if translation exists in articles table
        // Logic similar to POST check but lightweight
        const query = `
      SELECT t.id, t.title, t.slug, t.language
      FROM articles a
      JOIN articles t ON (a.translation_id = t.id OR t.translation_id = a.id OR t.translation_id = a.translation_id)
      WHERE a.id = $1 AND t.language = $2 AND t.id != a.id
      LIMIT 1
    `;
        // Note: The JOIN condition is a bit broad to catch all siblings/parents.
        // If a.translation_id is set, it's a child. Parent is t where t.id = a.translation_id.
        // If a.translation_id is null, it's a parent. Child is t where t.translation_id = a.id.

        const result = await pool.query(query, [id, lang || 'en']); // Default to EN check if not specified? Or just return boolean

        if (result.rows.length > 0) {
            res.json({ has_translation: true, translation: result.rows[0] });
        } else {
            res.json({ has_translation: false });
        }

    } catch (err) {
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

module.exports = router;
