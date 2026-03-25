const express = require('express');
const router = express.Router();
const pool = require('../config/database');

const categoryMap = {
    'Politique': 'politique',
    'Social': 'social',
    'Économie': 'economie',
    'Culture': 'culture',
    'International': 'international',
    'Dossiers': 'dossiers'
};

// =============================================
// REDIRECTION AUTOMATIQUE: URLs avec .html → sans .html
// =============================================
router.get(/^\/(fr|en)\/([^/]+)\.html$/, (req, res) => {
    const lang = req.params[0];
    const section = req.params[1];

    // Redirection 301 vers URL sans extension
    const newUrl = `/${lang}/${section}`;
    res.redirect(301, newUrl);
});

// Article Redirect
router.get('/article.html', async (req, res) => {
    const { id } = req.query;
    if (!id) return res.redirect(301, '/fr/politique');

    try {
        const result = await pool.query(
            'SELECT slug, language, category FROM articles WHERE id = $1 AND status = $2',
            [id, 'published']
        );

        if (result.rows.length === 0) return res.redirect(301, '/fr/politique');

        const { slug, language, category } = result.rows[0];
        const urlCategory = categoryMap[category] || 'politique';
        const newUrl = `/${language}/${urlCategory}/${slug}`;

        res.redirect(301, newUrl);
    } catch (_err) {
        console.error('❌ Erreur redirection article:', _err);
        res.redirect(301, '/fr/politique');
    }
});

// Podcast Redirect
router.get('/podcast.html', async (req, res) => {
    const { id } = req.query;
    if (!id) return res.redirect(301, '/fr/podcasts');

    try {
        const result = await pool.query('SELECT slug FROM podcasts WHERE id = $1 AND status = $2', [id, 'published']);
        if (result.rows.length === 0) return res.redirect(301, '/fr/podcasts');
        res.redirect(301, `/fr/podcasts/${result.rows[0].slug}`);
    } catch {
        res.redirect(301, '/fr/podcasts');
    }
});

// Emission Redirect
router.get('/emissions.html', async (req, res) => {
    const { id } = req.query;
    if (!id) return res.redirect(301, '/fr/emissions');

    try {
        const result = await pool.query('SELECT slug FROM emissions WHERE id = $1 AND status = $2', [id, 'published']);
        if (result.rows.length === 0) return res.redirect(301, '/fr/emissions');
        res.redirect(301, `/fr/emissions/${result.rows[0].slug}`);
    } catch {
        res.redirect(301, '/fr/emissions');
    }
});

// Party Redirect
router.get('/partis.html', async (req, res) => {
    const { id } = req.query;
    if (!id) return res.redirect(301, '/fr/partis');

    try {
        const result = await pool.query('SELECT slug FROM parties WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.redirect(301, '/fr/partis');
        res.redirect(301, `/fr/partis/${result.rows[0].slug}`);
    } catch {
        res.redirect(301, '/fr/partis');
    }
});


module.exports = router;