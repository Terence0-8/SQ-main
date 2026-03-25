// backend/migrations/1_initial_schema.js
// Baseline : schéma réel Solitiquo au 2026-02-25
// Source de vérité = état réel de la base de données (pas schema.sql qui est désynchronisé)
//
// Stratégie :
//   - CREATE TABLE IF NOT EXISTS avec les colonnes de base (schema d'origine)
//   - ADD COLUMN IF NOT EXISTS pour toutes les colonnes ajoutées depuis
//   - Idempotent sur serveurs existants, complet sur serveurs neufs


exports.up = (pgm) => {
  // ============================================================
  // 1. TABLE USERS
  // ============================================================
  pgm.sql(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'reader' CHECK (role IN ('reader', 'writer', 'admin', 'subscriber')),
    is_active BOOLEAN DEFAULT TRUE,
    is_subscriber BOOLEAN DEFAULT FALSE,
    subscription_start_date TIMESTAMP,
    subscription_end_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_users_subscriber ON users(is_subscriber) WHERE is_subscriber = TRUE`);
  // Ajouts historiques
  pgm.sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(5) DEFAULT 'fr' CHECK (preferred_language IN ('fr', 'en'))`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_users_language ON users(preferred_language)`);

  // ============================================================
  // 2. TABLE PARTIES
  // ============================================================
  pgm.sql(`CREATE TABLE IF NOT EXISTS parties (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    acronym VARCHAR(20),
    logo_url TEXT,
    color VARCHAR(7),
    founded_year INT,
    leader_name VARCHAR(255),
    ideology VARCHAR(100),
    description TEXT,
    program_summary TEXT,
    website_url TEXT,
    social_twitter VARCHAR(255),
    social_facebook VARCHAR(255),
    contact_email VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_parties_active ON parties(is_active)`);
  // Colonnes traduction EN
  pgm.sql(`ALTER TABLE parties ADD COLUMN IF NOT EXISTS title_en VARCHAR(255)`);
  pgm.sql(`ALTER TABLE parties ADD COLUMN IF NOT EXISTS description_en TEXT`);
  pgm.sql(`ALTER TABLE parties ADD COLUMN IF NOT EXISTS slug_en VARCHAR(255)`);

  // ============================================================
  // 3. TABLE ARTICLES
  // ============================================================
  pgm.sql(`CREATE TABLE IF NOT EXISTS articles (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    slug VARCHAR(500) UNIQUE NOT NULL,
    content TEXT NOT NULL,
    excerpt TEXT,
    featured_image TEXT,
    author_id INT REFERENCES users(id) ON DELETE SET NULL,
    category VARCHAR(100) NOT NULL,
    tags TEXT[],
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    is_premium BOOLEAN DEFAULT FALSE,
    language VARCHAR(5) DEFAULT 'fr' CHECK (language IN ('fr', 'en')),
    views_count INT DEFAULT 0,
    published_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status)`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category)`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at DESC) WHERE status = 'published'`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_articles_premium ON articles(is_premium)`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug)`);
  // Ajouts historiques : colonnes EN
  pgm.sql(`ALTER TABLE articles ADD COLUMN IF NOT EXISTS title_en VARCHAR(500)`);
  pgm.sql(`ALTER TABLE articles ADD COLUMN IF NOT EXISTS content_en TEXT`);
  pgm.sql(`ALTER TABLE articles ADD COLUMN IF NOT EXISTS excerpt_en TEXT`);
  pgm.sql(`ALTER TABLE articles ADD COLUMN IF NOT EXISTS slug_en VARCHAR(500)`);
  // Ajouts historiques : traductions liées
  pgm.sql(`ALTER TABLE articles ADD COLUMN IF NOT EXISTS translation_id INT REFERENCES articles(id) ON DELETE SET NULL`);
  pgm.sql(`ALTER TABLE articles ADD COLUMN IF NOT EXISTS translation_method VARCHAR(20) CHECK (translation_method IN ('manual', 'ai', NULL))`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_articles_translation ON articles(translation_id)`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_articles_language ON articles(language)`);
  // Ajouts historiques : temps de lecture
  pgm.sql(`ALTER TABLE articles ADD COLUMN IF NOT EXISTS read_time INTEGER NOT NULL DEFAULT 1`);

  // ============================================================
  // 4. TABLE COMMENTS
  // ============================================================
  pgm.sql(`CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    article_id INT REFERENCES articles(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    parent_id INT REFERENCES comments(id) ON DELETE CASCADE,
    is_approved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_comments_article ON comments(article_id)`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id)`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id)`);

  // ============================================================
  // 5. TABLE POLLS
  // ============================================================
  pgm.sql(`CREATE TABLE IF NOT EXISTS polls (
    id SERIAL PRIMARY KEY,
    question TEXT NOT NULL,
    options JSONB NOT NULL,
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE,
    ends_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
  )`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_polls_active ON polls(is_active) WHERE is_active = TRUE`);
  // Ajouts historiques
  pgm.sql(`ALTER TABLE polls ADD COLUMN IF NOT EXISTS category VARCHAR(100)`);
  pgm.sql(`ALTER TABLE polls ADD COLUMN IF NOT EXISTS question_en TEXT`);

  // ============================================================
  // 6. TABLE POLL_VOTES
  // ============================================================
  pgm.sql(`CREATE TABLE IF NOT EXISTS poll_votes (
    id SERIAL PRIMARY KEY,
    poll_id INT REFERENCES polls(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    option_index INT NOT NULL,
    voted_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(poll_id, user_id)
  )`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON poll_votes(poll_id)`);

  // ============================================================
  // 7. TABLE PODCASTS
  // Note: colonne play_count (pas plays_count comme dans schema.sql)
  // ============================================================
  pgm.sql(`CREATE TABLE IF NOT EXISTS podcasts (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    slug VARCHAR(500) UNIQUE NOT NULL,
    description TEXT,
    audio_url TEXT NOT NULL,
    duration_seconds INT,
    transcript TEXT,
    cover_image TEXT,
    author_id INT REFERENCES users(id) ON DELETE SET NULL,
    category VARCHAR(100),
    tags TEXT[],
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    is_premium BOOLEAN DEFAULT FALSE,
    play_count INT DEFAULT 0,
    published_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_podcasts_status ON podcasts(status)`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_podcasts_published ON podcasts(published_at DESC) WHERE status = 'published'`);
  // Ajouts historiques : colonnes EN
  pgm.sql(`ALTER TABLE podcasts ADD COLUMN IF NOT EXISTS title_en VARCHAR(500)`);
  pgm.sql(`ALTER TABLE podcasts ADD COLUMN IF NOT EXISTS description_en TEXT`);
  pgm.sql(`ALTER TABLE podcasts ADD COLUMN IF NOT EXISTS audio_url_en VARCHAR(500)`);
  pgm.sql(`ALTER TABLE podcasts ADD COLUMN IF NOT EXISTS slug_en VARCHAR(500)`);

  // ============================================================
  // 8. TABLE EMISSIONS
  // Note: colonne view_count (pas views_count comme dans schema.sql)
  // ============================================================
  pgm.sql(`CREATE TABLE IF NOT EXISTS emissions (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    slug VARCHAR(500) UNIQUE NOT NULL,
    description TEXT,
    video_url TEXT,
    thumbnail_url TEXT,
    duration_seconds INT,
    host_id INT REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    is_premium BOOLEAN DEFAULT FALSE,
    view_count INT DEFAULT 0,
    aired_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_emissions_status ON emissions(status)`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_emissions_aired ON emissions(aired_at DESC) WHERE status = 'published'`);
  // Ajouts historiques
  pgm.sql(`ALTER TABLE emissions ADD COLUMN IF NOT EXISTS category VARCHAR(100)`);
  pgm.sql(`ALTER TABLE emissions ADD COLUMN IF NOT EXISTS title_en VARCHAR(500)`);
  pgm.sql(`ALTER TABLE emissions ADD COLUMN IF NOT EXISTS description_en TEXT`);
  pgm.sql(`ALTER TABLE emissions ADD COLUMN IF NOT EXISTS slug_en VARCHAR(500)`);

  // ============================================================
  // 9. TABLE SUBSCRIPTIONS
  // ============================================================
  pgm.sql(`CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    plan VARCHAR(20) NOT NULL CHECK (plan IN ('monthly', 'yearly')),
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(5) DEFAULT 'XAF',
    payment_method VARCHAR(50),
    transaction_id VARCHAR(255) UNIQUE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'expired', 'cancelled')),
    starts_at TIMESTAMP NOT NULL,
    ends_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id)`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status)`);

  // ============================================================
  // 10. TABLE ARTICLE_ANALYTICS
  // ============================================================
  pgm.sql(`CREATE TABLE IF NOT EXISTS article_analytics (
    id SERIAL PRIMARY KEY,
    article_id INT REFERENCES articles(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    views INT DEFAULT 0,
    unique_visitors INT DEFAULT 0,
    avg_time_spent INT DEFAULT 0,
    UNIQUE(article_id, date)
  )`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_analytics_article ON article_analytics(article_id)`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_analytics_date ON article_analytics(date DESC)`);
  // Ajouts historiques : colonnes de profondeur de lecture
  pgm.sql(`ALTER TABLE article_analytics ADD COLUMN IF NOT EXISTS reads_start INTEGER DEFAULT 0`);
  pgm.sql(`ALTER TABLE article_analytics ADD COLUMN IF NOT EXISTS reads_25 INTEGER DEFAULT 0`);
  pgm.sql(`ALTER TABLE article_analytics ADD COLUMN IF NOT EXISTS reads_50 INTEGER DEFAULT 0`);
  pgm.sql(`ALTER TABLE article_analytics ADD COLUMN IF NOT EXISTS reads_75 INTEGER DEFAULT 0`);
  pgm.sql(`ALTER TABLE article_analytics ADD COLUMN IF NOT EXISTS reads_100 INTEGER DEFAULT 0`);
  pgm.sql(`ALTER TABLE article_analytics ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`);

  // ============================================================
  // 11. TABLE TRANSLATIONS (cache DeepL)
  // Note: original_hash et original_text (pas source_text_hash/source_text)
  // ============================================================
  pgm.sql(`CREATE TABLE IF NOT EXISTS translations (
    id SERIAL PRIMARY KEY,
    original_hash VARCHAR(64) UNIQUE NOT NULL,
    original_text TEXT NOT NULL,
    translated_text TEXT NOT NULL,
    source_lang VARCHAR(5) NOT NULL,
    target_lang VARCHAR(5) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_translations_hash ON translations(original_hash)`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_translations_langs ON translations(source_lang, target_lang)`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_translations_created ON translations(created_at DESC)`);

  // ============================================================
  // 12. TABLE DEEPL_USAGE
  // Note: characters_count (pas characters_used), updated_at (pas last_updated)
  //       month en VARCHAR(7) format 'YYYY-MM' (pas DATE)
  // ============================================================
  pgm.sql(`CREATE TABLE IF NOT EXISTS deepl_usage (
    id SERIAL PRIMARY KEY,
    month VARCHAR(7) UNIQUE NOT NULL,
    characters_count INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_deepl_usage_month ON deepl_usage(month DESC)`);

  // ============================================================
  // 13. TABLE LANGUAGE_PREFERENCES
  // Note: pas de colonne id (clé = ip_address)
  // ============================================================
  pgm.sql(`CREATE TABLE IF NOT EXISTS language_preferences (
    ip_address VARCHAR(45) NOT NULL,
    preferred_language VARCHAR(5) DEFAULT 'fr' CHECK (preferred_language IN ('fr', 'en')),
    last_updated TIMESTAMP DEFAULT NOW(),
    UNIQUE(ip_address)
  )`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_lang_prefs_ip ON language_preferences(ip_address)`);

  // ============================================================
  // 14. FONCTION + TRIGGERS updated_at
  // ============================================================
  pgm.sql(`CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql`);

  const triggers = [
    ['update_users_updated_at', 'users'],
    ['update_parties_updated_at', 'parties'],
    ['update_articles_updated_at', 'articles'],
    ['update_comments_updated_at', 'comments'],
    ['update_podcasts_updated_at', 'podcasts'],
    ['update_emissions_updated_at', 'emissions'],
  ];
  for (const [triggerName, tableName] of triggers) {
    pgm.sql(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = '${triggerName}') THEN
        CREATE TRIGGER ${triggerName} BEFORE UPDATE ON ${tableName}
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      END IF;
    END $$`);
  }
};

exports.down = (pgm) => {
  // Drop dans l'ordre inverse des dépendances FK
  pgm.sql(`DROP TABLE IF EXISTS language_preferences`);
  pgm.sql(`DROP TABLE IF EXISTS deepl_usage`);
  pgm.sql(`DROP TABLE IF EXISTS translations`);
  pgm.sql(`DROP TABLE IF EXISTS article_analytics`);
  pgm.sql(`DROP TABLE IF EXISTS subscriptions`);
  pgm.sql(`DROP TABLE IF EXISTS emissions`);
  pgm.sql(`DROP TABLE IF EXISTS podcasts`);
  pgm.sql(`DROP TABLE IF EXISTS poll_votes`);
  pgm.sql(`DROP TABLE IF EXISTS polls`);
  pgm.sql(`DROP TABLE IF EXISTS comments`);
  pgm.sql(`DROP TABLE IF EXISTS articles`);
  pgm.sql(`DROP TABLE IF EXISTS parties`);
  pgm.sql(`DROP TABLE IF EXISTS users`);
  pgm.sql(`DROP FUNCTION IF EXISTS update_updated_at_column CASCADE`);
};
