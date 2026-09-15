// Stabilise les colonnes et tables auparavant créées à l'exécution des routes.
exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`);
  pgm.sql(`ALTER TABLE comments ADD COLUMN IF NOT EXISTS is_edited BOOLEAN NOT NULL DEFAULT FALSE`);
  pgm.sql(`ALTER TABLE comments ADD COLUMN IF NOT EXISTS upvotes INTEGER NOT NULL DEFAULT 0`);
  pgm.sql(`CREATE TABLE IF NOT EXISTS user_bookmarks (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    article_id INT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (user_id, article_id)
  )`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_user_bookmarks_article ON user_bookmarks(article_id)`);
  pgm.sql(`CREATE TABLE IF NOT EXISTS comment_upvotes (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    comment_id INT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (user_id, comment_id)
  )`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_comment_upvotes_comment ON comment_upvotes(comment_id)`);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS comment_upvotes`);
  pgm.sql(`DROP TABLE IF EXISTS user_bookmarks`);
  pgm.sql(`ALTER TABLE comments DROP COLUMN IF EXISTS upvotes`);
  pgm.sql(`ALTER TABLE comments DROP COLUMN IF EXISTS is_edited`);
  pgm.sql(`ALTER TABLE subscriptions DROP COLUMN IF EXISTS updated_at`);
};