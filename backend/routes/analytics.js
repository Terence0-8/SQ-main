const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const Joi = require('joi');

// ==========================================
// VALIDATION SCHEMA
// ==========================================
const analyticsSchema = Joi.object({
    article_id: Joi.number().integer().required(),
    milestone: Joi.alternatives().try(
        Joi.string().valid('start'),
        Joi.number().valid(25, 50, 75, 100)
    ).required()
});

// ==========================================
// POST /api/analytics/track
// Reçoit les pings de lecture d'articles
// ==========================================
router.post('/track', async (req, res) => {
    try {
        // Validation
        const { error, value } = analyticsSchema.validate(req.body);

        if (error) {
            return res.status(400).json({
                success: false,
                error: error.details[0].message
            });
        }

        const { article_id, milestone } = value;

        // Mapping sécurisé des milestones vers colonnes
        const columnMap = {
            'start': 'reads_start',
            25: 'reads_25',
            50: 'reads_50',
            75: 'reads_75',
            100: 'reads_100'
        };

        const column = columnMap[milestone];

        if (!column) {
            return res.status(400).json({
                success: false,
                error: 'Milestone invalide'
            });
        }

        // Vérifier que l'article existe
        const articleCheck = await pool.query(
            'SELECT id FROM articles WHERE id = $1',
            [article_id]
        );

        if (articleCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Article introuvable'
            });
        }

        // Upsert sans ON CONFLICT (fonctionne sans contrainte unique)
        // 1. Essayer d'insérer si n'existe pas
        const insertResult = await pool.query(`
            INSERT INTO article_analytics (article_id, ${column}, updated_at) 
            SELECT $1, 1, NOW()
            WHERE NOT EXISTS (SELECT 1 FROM article_analytics WHERE article_id = $1)
            RETURNING article_id
        `, [article_id]);

        // 2. Si pas inséré (existe déjà), on update
        if (insertResult.rowCount === 0) {
            await pool.query(`
                UPDATE article_analytics 
                SET ${column} = ${column} + 1, updated_at = NOW()
                WHERE article_id = $1
            `, [article_id]);
        }

        res.json({ success: true });

    } catch (err) {
        console.error('❌ Erreur analytics:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// ==========================================
// GET /api/analytics/:articleId
// Récupérer les stats d'un article (Admin)
// ==========================================
router.get('/:articleId', async (req, res) => {
    try {
        const { articleId } = req.params;

        if (isNaN(articleId)) {
            return res.status(400).json({ success: false, error: 'ID invalide' });
        }

        const query = `
      SELECT * FROM article_analytics WHERE article_id = $1
    `;

        const result = await pool.query(query, [articleId]);

        if (result.rows.length === 0) {
            return res.json({
                success: true,
                data: {
                    article_id: parseInt(articleId),
                    reads_start: 0,
                    reads_25: 0,
                    reads_50: 0,
                    reads_75: 0,
                    reads_100: 0
                }
            });
        }

        res.json({ success: true, data: result.rows[0] });

    } catch (err) {
        console.error('❌ Erreur récupération analytics:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

module.exports = router;
