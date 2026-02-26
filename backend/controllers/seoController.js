const pool = require('../config/database');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.NODE_ENV === 'production'
    ? 'https://solitiquo.com'
    : `http://localhost:${process.env.PORT || 5000}`;

// Helper: Inject Meta Tags
const injectMetaTags = (html, data, url, alternates = []) => {
    const title = `${data.title} — Solitiquo`;
    const description = (data.description || "Le média de référence au Cameroun.").replace(/"/g, '&quot;');
    const image = data.image || `${BASE_URL}/social-share.jpg`;

    let metaTags = `
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <link rel="canonical" href="${url}" />
    `;

    // Inject Alternate Hreflang Tags
    alternates.forEach(alt => {
        metaTags += `<link rel="alternate" hreflang="${alt.lang}" href="${BASE_URL}${alt.url}" />\n    `;
    });

    metaTags += `
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${image}" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@Solitiquo" />
    <meta name="twitter:url" content="${url}" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${image}" />
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
        let templateFile, data, alternates = [];

        switch (type) {
            case 'article':
                templateFile = 'article.html';
                const articleRes = await pool.query(
                    'SELECT a.title, a.excerpt, a.featured_image, a.language, a.category, a.slug, ' +
                    't.slug as trans_slug, t.language as trans_lang, t.category as trans_cat ' +
                    'FROM articles a ' +
                    'LEFT JOIN articles t ON (a.translation_id = t.id OR t.translation_id = a.id OR (a.translation_id IS NOT NULL AND t.translation_id = a.translation_id)) ' +
                    'WHERE a.id = $1 AND (t.id IS NULL OR t.id != a.id)',
                    [id]
                );

                if (articleRes.rows.length === 0) return next();

                data = articleRes.rows[0];
                const categoryMap = { 'Politique': 'politique', 'Social': 'social', 'Économie': 'economie', 'Culture': 'culture', 'International': 'international', 'Dossiers': 'dossiers' };

                // Current Language
                const currentCat = categoryMap[data.category] || 'politique';
                alternates.push({ lang: data.language, url: `/${data.language}/${currentCat}/${data.slug}` });

                // Translations
                articleRes.rows.forEach(row => {
                    if (row.trans_lang && row.trans_slug) {
                        const transCat = categoryMap[row.trans_cat] || 'politique';
                        alternates.push({ lang: row.trans_lang, url: `/${row.trans_lang}/${transCat}/${row.trans_slug}` });
                    }
                });
                break;

            case 'podcast':
                templateFile = 'podcast.html';
                const podcastRes = await pool.query(
                    'SELECT title, description, cover_image, language, slug FROM podcasts WHERE id = $1',
                    [id]
                );
                if (podcastRes.rows.length === 0) return next();
                data = podcastRes.rows[0];
                if (data.language && data.slug) {
                    alternates.push({ lang: data.language, url: `/${data.language}/podcasts/${data.slug}` });
                }
                break;

            case 'emission':
                templateFile = 'emissions.html';
                const emissionRes = await pool.query(
                    'SELECT title, description, thumbnail_url, slug FROM emissions WHERE id = $1',
                    [id]
                );
                if (emissionRes.rows.length === 0) return next();
                data = emissionRes.rows[0];
                alternates.push({ lang: 'fr', url: `/fr/emissions/${data.slug}` });
                break;

            case 'party':
                templateFile = 'partis.html';
                const partyRes = await pool.query(
                    'SELECT name, description, logo_url, slug_en FROM parties WHERE id = $1',
                    [id]
                );
                if (partyRes.rows.length === 0) return next();
                data = {
                    title: partyRes.rows[0].name,
                    description: partyRes.rows[0].description,
                    image: partyRes.rows[0].logo_url
                };
                alternates.push({ lang: 'fr', url: `/fr/partis` });
                if (partyRes.rows[0].slug_en) {
                    alternates.push({ lang: 'en', url: `/en/parties` });
                }
                break;

            default:
                return next();
        }

        // Read Template and Inject Meta
        const templatePath = path.resolve(__dirname, '../../', templateFile);
        fs.readFile(templatePath, 'utf8', (err, html) => {
            if (err) {
                console.error(`❌ Template manquant: ${templatePath}`);
                return next();
            }

            const finalHtml = injectMetaTags(html, {
                title: data.title,
                description: data.excerpt || data.description,
                image: data.featured_image || data.cover_image || data.thumbnail_url || data.image,
            }, `${BASE_URL}${req.originalUrl}`, alternates);

            res.send(finalHtml);
        });

    } catch (err) {
        console.error('❌ Erreur rendu contenu SEO:', err);
        next(err);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Route SSR pour article.html?id=X  (utilisée par les bots de partage social)
// Twitter/X, Facebook, WhatsApp ne font pas tourner le JS — ils lisent le HTML
// brut. Cette route intercepte la requête avant que Express serve le fichier
// statique, interroge la BDD pour l'article demandé, et injecte les bonnes
// balises <meta> dans le HTML avant de l'envoyer.
// ─────────────────────────────────────────────────────────────────────────────
exports.handleArticleById = async (req, res, next) => {
    const id = req.query.id;

    // Pas d'id = on laisse passer (Express sert le fichier statique normalement)
    if (!id || isNaN(parseInt(id))) return next();

    try {
        const result = await pool.query(
            `SELECT a.title, a.excerpt, a.image_url, a.language, a.category, a.slug,
                    t.id AS trans_id, t.language AS trans_lang, t.category AS trans_cat, t.slug AS trans_slug
             FROM articles a
             LEFT JOIN articles t
               ON (a.translation_id = t.id OR t.translation_id = a.id)
               AND t.id != a.id
             WHERE a.id = $1 AND a.status = 'published'
             LIMIT 1`,
            [parseInt(id)]
        );

        // Article introuvable ou non publié → fichier statique normal
        if (result.rows.length === 0) return next();

        const article = result.rows[0];
        const categoryMap = {
            'Politique': 'politique', 'Social': 'social',
            'Économie': 'economie', 'Culture': 'culture',
            'International': 'international', 'Dossiers': 'dossiers'
        };

        const currentCat = categoryMap[article.category] || 'politique';
        const canonicalUrl = `${BASE_URL}/${article.language}/${currentCat}/${article.slug}`;

        const alternates = [
            { lang: article.language, url: `/${article.language}/${currentCat}/${article.slug}` }
        ];

        if (article.trans_lang && article.trans_slug) {
            const transCat = categoryMap[article.trans_cat] || 'politique';
            alternates.push({ lang: article.trans_lang, url: `/${article.trans_lang}/${transCat}/${article.trans_slug}` });
        }

        const templatePath = path.resolve(__dirname, '../../article.html');
        fs.readFile(templatePath, 'utf8', (err, html) => {
            if (err) return next();

            const finalHtml = injectMetaTags(html, {
                title: article.title,
                description: article.excerpt,
                image: article.image_url,
            }, canonicalUrl, alternates);

            res.send(finalHtml);
        });

    } catch (err) {
        console.error('❌ Erreur SSR article.html?id:', err);
        next(); // fallback silencieux → fichier statique
    }
};

exports.handleStaticSeoRoute = async (req, res, next) => {
    const lang = req.params[0]; // 'fr' or 'en'
    const slug = req.params[1]; // 'politique', 'social', etc.

    const map = {
        'politique': 'politique.html',
        'social': 'social.html',
        'emissions': 'emissions.html',
        'podcasts': 'podcasts.html',
        'partis': 'partis-politiques.html',
        'parties': 'partis-politiques.html',
        'partis-politiques': 'partis-politiques.html',
        'admin': 'admin.html'
    };

    const templateFile = map[slug];
    if (!templateFile) return next();

    const hreflangMap = {
        'politique.html': { fr: 'politique', en: 'politics' },
        'social.html': { fr: 'social', en: 'social' },
        'emissions.html': { fr: 'emissions', en: 'shows' },
        'podcasts.html': { fr: 'podcasts', en: 'podcasts' },
        'partis-politiques.html': { fr: 'partis', en: 'parties' },
    };

    const alternates = [];
    const meta = hreflangMap[templateFile] || { fr: slug, en: slug };

    alternates.push({ lang: 'fr', url: `/fr/${meta.fr}` });
    alternates.push({ lang: 'en', url: `/en/${meta.en}` });

    try {
        const templatePath = path.resolve(__dirname, '../../', templateFile);
        fs.readFile(templatePath, 'utf8', (err, html) => {
            if (err) return next();

            const titles = {
                'politique.html': 'Politique',
                'social.html': 'Social',
                'emissions.html': 'Émissions',
                'podcasts.html': 'Podcasts',
                'partis-politiques.html': 'Partis Politiques'
            };

            const finalHtml = injectMetaTags(html, {
                title: titles[templateFile] || 'Solitiquo',
                description: "Le média de référence pour l'analyse politique et sociale au Cameroun."
            }, `${BASE_URL}${req.originalUrl}`, alternates);

            res.send(finalHtml);
        });
    } catch (err) {
        next(err);
    }
};
