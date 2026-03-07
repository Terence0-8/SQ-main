require('dotenv').config();
const { Pool } = require('pg');
const translationService = require('../backend/services/translationService');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
});

async function run() {
    console.log('🚀 Démarrage de la traduction automatique globale...');

    // 1. ARTICLES
    console.log('\n--- 1. ARTICLES ---');
    // Sélectionner les articles FR qui n'ont pas de traduction EN
    const { rows: articles } = await pool.query(`
    SELECT a.* FROM articles a
    WHERE a.language = 'fr' 
    AND NOT EXISTS (
      SELECT 1 FROM articles t 
      WHERE t.language = 'en' AND (t.translation_id = a.id OR t.id = a.translation_id)
    )
  `);

    console.log(`📰 ${articles.length} articles à traduire.`);
    for (const art of articles) {
        try {
            console.log(`Traductions de l'article : ${art.title}`);
            const t = await translationService.translateArticle(art, 'en');
            // Create slug
            const newSlug = art.slug + '-en';
            await pool.query(`
        INSERT INTO articles (title, slug, content, excerpt, category, author_id, language, featured_image, tags, translation_id, translation_method, status, is_premium, published_at, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ai', $11, $12, $13, NOW(), NOW())
      `, [t.title, newSlug, t.content, t.excerpt, art.category, art.author_id, 'en', art.featured_image, art.tags, (art.translation_id || art.id), art.status, art.is_premium, art.published_at]);
            console.log(`✅ Créé article EN : ${t.title}`);
        } catch (e) {
            console.error(`❌ Erreur ${art.id}:`, e.message);
        }
    }

    // 2. PODCASTS
    console.log('\n--- 2. PODCASTS ---');
    const { rows: podcasts } = await pool.query(`SELECT * FROM podcasts WHERE title_en IS NULL OR title_en = ''`);
    console.log(`🎙️ ${podcasts.length} podcasts à traduire.`);
    for (const p of podcasts) {
        try {
            const title_en = await translationService.translateWithCache(p.title, 'fr', 'en', 'text');
            const desc_en = await translationService.translateWithCache(p.description, 'fr', 'en', 'text');
            const slug_en = p.slug + '-en';
            await pool.query(`UPDATE podcasts SET title_en = $1, description_en = $2, slug_en = $3 WHERE id = $4`, [title_en, desc_en, slug_en, p.id]);
            console.log(`✅ Traduit podcast : ${title_en}`);
        } catch (e) { console.error(`❌ Erreur ${p.id}:`, e.message); }
    }

    // 3. EMISSIONS
    console.log('\n--- 3. EMISSIONS ---');
    const { rows: emissions } = await pool.query(`SELECT * FROM emissions WHERE title_en IS NULL OR title_en = ''`);
    console.log(`📺 ${emissions.length} émissions à traduire.`);
    for (const e of emissions) {
        try {
            const title_en = await translationService.translateWithCache(e.title, 'fr', 'en', 'text');
            const desc_en = await translationService.translateWithCache(e.description, 'fr', 'en', 'text');
            const slug_en = e.slug + '-en';
            await pool.query(`UPDATE emissions SET title_en = $1, description_en = $2, slug_en = $3 WHERE id = $4`, [title_en, desc_en, slug_en, e.id]);
            console.log(`✅ Traduit émission : ${title_en}`);
        } catch (err) { console.error(`❌ Erreur ${e.id}:`, err.message); }
    }

    // 4. PARTIES
    console.log('\n--- 4. PARTIES ---');
    const { rows: parties } = await pool.query(`SELECT * FROM parties WHERE title_en IS NULL OR title_en = ''`);
    console.log(`🏛️ ${parties.length} partis à traduire.`);
    for (const p of parties) {
        try {
            const title_en = await translationService.translateWithCache(p.name, 'fr', 'en', 'text');
            const desc_en = await translationService.translateWithCache(p.description || p.program_summary, 'fr', 'en', 'text');
            const slug_en = p.acronym ? p.acronym.toLowerCase() + '-en' : 'party-' + p.id + '-en';
            await pool.query(`UPDATE parties SET title_en = $1, description_en = $2, slug_en = $3 WHERE id = $4`, [title_en, desc_en, slug_en, p.id]);
            console.log(`✅ Traduit parti : ${title_en}`);
        } catch (err) { console.error(`❌ Erreur ${p.id}:`, err.message); }
    }

    console.log('\n🎉 Traduction de DB terminée !');
    process.exit(0);
}

run().catch(console.error);
