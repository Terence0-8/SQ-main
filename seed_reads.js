const db = require('./backend/config/database');

async function seedReads() {
    try {
        const res = await db.query('SELECT id, views_count FROM articles WHERE views_count > 0');
        let updated = 0;

        for (const article of res.rows) {
            const views = article.views_count;
            // Simulate realistic drop-off rates
            const start = Math.floor(views * (0.90 + Math.random() * 0.10)); // 90-100%
            const r25 = Math.floor(start * (0.75 + Math.random() * 0.15)); // 75-90% of start
            const r50 = Math.floor(r25 * (0.65 + Math.random() * 0.20)); // 65-85% of r25
            const r75 = Math.floor(r50 * (0.60 + Math.random() * 0.25)); // 60-85% of r50
            const r100 = Math.floor(r75 * (0.55 + Math.random() * 0.30)); // 55-85% of r75

            await db.query(
                `UPDATE articles 
         SET reads_start = $1, reads_25 = $2, reads_50 = $3, reads_75 = $4, reads_100 = $5 
         WHERE id = $6`,
                [start, r25, r50, r75, r100, article.id]
            );
            updated++;
        }

        console.log(`Successfully backfilled reads data for ${updated} articles.`);
    } catch (e) {
        console.error('Error:', e);
    } finally {
        process.exit(0);
    }
}

seedReads();
