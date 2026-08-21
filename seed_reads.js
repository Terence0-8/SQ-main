const db = require('./backend/config/database');

async function seedReads() {
    try {
        const res = await db.query('SELECT id, views_count FROM articles');
        let updated = 0;

        for (const article of res.rows) {
            const views = Math.floor(180 + Math.random() * 950);
            const start = views;
            const r25 = Math.floor(start * (0.76 + Math.random() * 0.12)); // ~80%
            const r50 = Math.floor(r25 * (0.68 + Math.random() * 0.14));  // ~55%
            const r75 = Math.floor(r50 * (0.60 + Math.random() * 0.16));  // ~35%
            const r100 = Math.floor(r75 * (0.52 + Math.random() * 0.20)); // ~20%

            await db.query(
                `UPDATE articles 
                 SET views_count = $1, reads_start = $2, reads_25 = $3, reads_50 = $4, reads_75 = $5, reads_100 = $6 
                 WHERE id = $7`,
                [views, start, r25, r50, r75, r100, article.id]
            );
            updated++;
        }

        console.log(`🎉 Successfully seeded realistic reading analytics for ALL ${updated} articles!`);
    } catch (e) {
        console.error('Error seeding reads:', e);
    } finally {
        process.exit(0);
    }
}

seedReads();
