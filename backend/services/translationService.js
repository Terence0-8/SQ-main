
const axios = require('axios');
const crypto = require('crypto');
const pool = require('../config/database');

const DEEPL_API_KEY = process.env.DEEPL_API_KEY;
const DEEPL_API_URL = process.env.DEEPL_API_URL || 'https://api-free.deepl.com/v2';

class TranslationService {
    constructor() {
        if (!DEEPL_API_KEY) {
            console.warn('⚠️ DEEPL_API_KEY is not set in .env');
        }
    }

    /**
     * Generates a SHA-256 hash for a given text.
     * @param {string} text 
     * @returns {string} Hex string of the hash
     */
    generateHash(text) {
        if (!text) return null;
        return crypto.createHash('sha256').update(text).digest('hex');
    }

    /**
     * Translates text with caching.
     * 1. Checks DB for existing translation (by hash).
     * 2. If not found, calls DeepL.
     * 3. Saves new translation to DB.
     * @param {string} text - Text to translate
     * @param {string} sourceLang - Source language code (e.g. 'fr')
     * @param {string} targetLang - Target language code (e.g. 'en')
     * @param {string} format - 'text' or 'html'
     * @returns {Promise<string>} Translated text
     */
    async translateWithCache(text, sourceLang, targetLang, format = 'html') {
        if (!text || !text.trim()) return '';

        const hash = this.generateHash(text);
        const sLang = sourceLang.toUpperCase();
        const tLang = targetLang.toUpperCase();

        // 1. Check Cache
        try {
            const cached = await pool.query(
                'SELECT translated_text FROM translations WHERE original_hash = $1 AND target_lang = $2',
                [hash, tLang]
            );

            if (cached.rows.length > 0) {
                // console.log(`✅ Cache hit for hash: ${hash.substring(0, 8)}...`);
                return cached.rows[0].translated_text;
            }
        } catch (err) {
            console.error('❌ Cache check error:', err.message);
            // Fallback to direct translation if cache fails (optional, but safer)
        }

        // 2. Call DeepL
        console.log(`🌍 DeepL Start: ${text.length} chars (${sLang} -> ${tLang})`);

        // DeepL specific parameters
        const params = {
            text: [text],
            target_lang: tLang === 'EN' ? 'EN-US' : tLang, // DeepL quirk
            source_lang: sLang,
        };

        if (format === 'html') {
            params.tag_handling = 'html';
        }

        try {
            const response = await axios.post(
                `${DEEPL_API_URL}/translate`,
                params,
                {
                    headers: {
                        'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const translatedText = response.data.translations[0].text;
            const charsUsed = response.data.translations[0].billed_characters || text.length; // Approximate if not provided

            // 3. Save to Cache (Async, don't block return)
            this.saveTranslation(hash, text, translatedText, sLang, tLang).catch(err =>
                console.error('❌ Failed to save translation to cache:', err.message)
            );

            // 4. Update Usage (Async)
            this.updateDeepLUsage(charsUsed).catch(err =>
                console.error('❌ Failed to update DeepL usage:', err.message)
            );

            return translatedText;

        } catch (error) {
            console.error('❌ DeepL API Error:', error.response?.data || error.message);
            throw new Error('Translation service unavailable');
        }
    }

    /**
     * Saves a translation to the database.
     */
    async saveTranslation(hash, originalText, translatedText, sourceLang, targetLang) {
        const query = `
      INSERT INTO translations (original_hash, original_text, translated_text, source_lang, target_lang)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (original_hash, target_lang) DO NOTHING
    `;
        await pool.query(query, [hash, originalText, translatedText, sourceLang, targetLang]);
    }

    /**
     * Updates the monthly character usage count.
     */
    async updateDeepLUsage(chars) {
        const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
        const query = `
      INSERT INTO deepl_usage (month, characters_count)
      VALUES ($1, $2)
      ON CONFLICT (month)
      DO UPDATE SET characters_count = deepl_usage.characters_count + $2, updated_at = NOW()
    `;
        await pool.query(query, [currentMonth, chars]);
    }

    /**
     * Translates a whole article object (title, excerpt, content).
     */
    async translateArticle(article, targetLang) {
        const sourceLang = article.language || 'fr';

        // Translate parts in parallel
        const [title, excerpt, content] = await Promise.all([
            this.translateWithCache(article.title, sourceLang, targetLang, 'text'),
            this.translateWithCache(article.excerpt, sourceLang, targetLang, 'text'),
            this.translateWithCache(article.content, sourceLang, targetLang, 'html') // Content is HTML
        ]);

        return {
            title,
            excerpt,
            content,
            language: targetLang
        };
    }
}

module.exports = new TranslationService();
