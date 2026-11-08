const pool = require('../backend/config/database');

async function test() {
  const res = await pool.query(`SELECT id, title, slug, status FROM articles WHERE (title ILIKE '%test%' OR title ILIKE '%demo%' OR title ILIKE '%migration%') AND status = 'published'`);
  console.log('Published test articles:', res.rows);
  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});

