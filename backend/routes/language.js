/**
 * ============================================
 * ROUTES: Language Preferences
 * Handles language preference storage for authenticated and anonymous users
 * ============================================
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');

/**
 * GET /api/language/preference
 * Retrieve user's language preference
 * - If authenticated: from users table
 * - If anonymous: from language_preferences table (by IP)
 */
router.get('/preference', async (req, res) => {
    try {
        const userId = req.session?.user?.id;
        const ipAddress = req.ip || req.connection.remoteAddress;

        let preferredLanguage = 'fr'; // Default

        if (userId) {
            // Authenticated user - get from users table
            const result = await pool.query(
                'SELECT preferred_language FROM users WHERE id = $1',
                [userId]
            );

            if (result.rows.length > 0 && result.rows[0].preferred_language) {
                preferredLanguage = result.rows[0].preferred_language;
            }
        } else {
            // Anonymous user - get from language_preferences table by IP
            const result = await pool.query(
                'SELECT preferred_language FROM language_preferences WHERE ip_address = $1',
                [ipAddress]
            );

            if (result.rows.length > 0) {
                preferredLanguage = result.rows[0].preferred_language;
            }
        }

        res.json({
            success: true,
            language: preferredLanguage,
            source: userId ? 'user' : 'ip'
        });

    } catch (error) {
        console.error('❌ Error fetching language preference:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur',
            language: 'fr' // Fallback to French
        });
    }
});

/**
 * POST /api/language/preference
 * Save user's language preference
 * Body: { language: 'fr' | 'en' }
 */
router.post('/preference', async (req, res) => {
    try {
        const { language } = req.body;

        // Validation
        if (!language || !['fr', 'en'].includes(language)) {
            return res.status(400).json({
                success: false,
                error: 'Langue invalide. Utiliser "fr" ou "en".'
            });
        }

        const userId = req.session?.user?.id;
        const ipAddress = req.ip || req.connection.remoteAddress;

        if (userId) {
            // Authenticated user - update users table
            await pool.query(
                'UPDATE users SET preferred_language = $1 WHERE id = $2',
                [language, userId]
            );

        } else {
            // Anonymous user - upsert into language_preferences table
            await pool.query(
                `INSERT INTO language_preferences (ip_address, preferred_language, last_updated)
         VALUES ($1, $2, NOW())
         ON CONFLICT (ip_address) 
         DO UPDATE SET preferred_language = $2, last_updated = NOW()`,
                [ipAddress, language]
            );

        }

        res.json({
            success: true,
            language,
            message: 'Préférence de langue enregistrée'
        });

    } catch (error) {
        console.error('❌ Error saving language preference:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la sauvegarde'
        });
    }
});

module.exports = router;
