const pool = require('../config/database');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.NODE_ENV === 'production'
    ? 'https://solitiquo.com'
    : `http://localhost:${process.env.PORT || 5000}`;

// Helper: Inject Meta Tags
const injectMetaTags = (html, data, url) => {
    const title = `${data.title} — Solitiquo`;
    const description = (data.description || "Le média de référence au Cameroun.").replace(/"/g, '&quot;');
    const image = data.image || `${BASE_URL}/social-share.jpg`;

    const metaTags = `
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <link rel="canonical" href="${url}" />
    
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${image}" />

    <meta property="twitter:card" content="summary_large_image" />
    <meta property="twitter:url" content="${url}" />
    <meta property="twitter:title" content="${title}" />
    <meta property="twitter:description" content="${description}" />
    <meta property="twitter:image" content="${image}" />
  `;

    return html
        .replace(/<title>.*?<\/title>/i, '')
        .replace('</head>', `${metaTags}</head>`);
};


exports.handleSeoRoute = async (req, res, next) => {
    // If slug is not resolved, pass to next (likely 404 or static file)
    if (!req.resolvedContent) {
        return next();
    }

    const { type, id } = req.resolvedContent;

    try {
        let templateFile, data;

        switch (type) {
            case 'article':
                templateFile = 'article.html';
                const articleRes = await pool.query(
                    'SELECT title, excerpt, featured_image FROM articles WHERE id = $1',
                    [id]
                );
                if (articleRes.rows.length === 0) return next();
                data = articleRes.rows[0];
                break;

            case 'podcast':
                templateFile = 'podcast.html';
                const podcastRes = await pool.query(
                    'SELECT title, description, cover_image FROM podcasts WHERE id = $1',
                    [id]
                );
                if (podcastRes.rows.length === 0) return next();
                data = podcastRes.rows[0];
                break;

            case 'emission':
                templateFile = 'emissions.html';
                const emissionRes = await pool.query(
                    'SELECT title, description, thumbnail_url FROM emissions WHERE id = $1',
                    [id]
                );
                if (emissionRes.rows.length === 0) return next();
                data = emissionRes.rows[0];
                break;

            case 'party':
                templateFile = 'partis.html';
                const partyRes = await pool.query(
                    'SELECT name, description, logo_url FROM parties WHERE id = $1',
                    [id]
                );
                if (partyRes.rows.length === 0) return next();
                data = {
                    title: partyRes.rows[0].name,
                    description: partyRes.rows[0].description,
                    image: partyRes.rows[0].logo_url
                };
                break;

            default:
                return next();
        }

        // Read Template and Inject Meta
        const templatePath = path.resolve(__dirname, '../../', templateFile); // Adjust path relative to controller
        fs.readFile(templatePath, 'utf8', (err, html) => {
            if (err) return next();

            const finalHtml = injectMetaTags(html, {
                title: data.title,
                description: data.excerpt || data.description,
                image: data.featured_image || data.cover_image || data.thumbnail_url || data.image, // unified image prop
            }, `${BASE_URL}${req.originalUrl}`);

            res.send(finalHtml);
        });

    } catch (err) {
        console.error('❌ Erreur rendu contenu SEO:', err);
        next(err);
    }
};
