-- ============================================
-- SOLITIQUO - SCHÉMA BASE DE DONNÉES
-- PostgreSQL 14+
-- Mis à jour : 2026-02-25
--
-- IMPORTANT : Ce fichier est la documentation de référence.
-- Pour appliquer/modifier le schéma, utiliser node-pg-migrate :
--   npm run migrate          → appliquer les migrations en attente
--   npm run migrate:create   → créer une nouvelle migration
--   npm run migrate:status   → voir l'état des migrations
--
-- Source exécutable : backend/migrations/1_initial_schema.js
-- ============================================

-- ============================================
-- 1. TABLE USERS (Utilisateurs)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'reader' CHECK (role IN ('reader', 'writer', 'admin', 'subscriber')),
  is_active BOOLEAN DEFAULT TRUE,
  is_subscriber BOOLEAN DEFAULT FALSE,
  subscription_start_date TIMESTAMP,
  subscription_end_date TIMESTAMP,
  preferred_language VARCHAR(5) DEFAULT 'fr' CHECK (preferred_language IN ('fr', 'en')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_subscriber ON users(is_subscriber) WHERE is_subscriber = TRUE;
CREATE INDEX IF NOT EXISTS idx_users_language ON users(preferred_language);

-- ============================================
-- 2. TABLE PARTIES (Partis politiques)
-- ============================================
CREATE TABLE IF NOT EXISTS parties (
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
  -- Traductions EN
  title_en VARCHAR(255),
  description_en TEXT,
  slug_en VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parties_active ON parties(is_active);

-- ============================================
-- 3. TABLE ARTICLES
-- ============================================
CREATE TABLE IF NOT EXISTS articles (
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
  read_time INTEGER NOT NULL DEFAULT 1,
  reads_start INTEGER DEFAULT 0,
  reads_25 INTEGER DEFAULT 0,
  reads_50 INTEGER DEFAULT 0,
  reads_75 INTEGER DEFAULT 0,
  reads_100 INTEGER DEFAULT 0,
  -- Lien article traduit
  translation_id INT REFERENCES articles(id) ON DELETE SET NULL,
  translation_method VARCHAR(20) CHECK (translation_method IN ('manual', 'ai', NULL)),
  -- Traductions EN inline
  title_en VARCHAR(500),
  content_en TEXT,
  excerpt_en TEXT,
  slug_en VARCHAR(500),
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_articles_premium ON articles(is_premium);
CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug);
CREATE INDEX IF NOT EXISTS idx_articles_translation ON articles(translation_id);
CREATE INDEX IF NOT EXISTS idx_articles_language ON articles(language);

-- ============================================
-- 4. TABLE COMMENTS (Commentaires)
-- ============================================
CREATE TABLE IF NOT EXISTS comments (
  id SERIAL PRIMARY KEY,
  article_id INT REFERENCES articles(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  parent_id INT REFERENCES comments(id) ON DELETE CASCADE,
  is_approved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_article ON comments(article_id);
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);

-- ============================================
-- 5. TABLE POLLS (Sondages)
-- ============================================
CREATE TABLE IF NOT EXISTS polls (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  options JSONB NOT NULL, -- Format: [{"text": "Oui", "votes": 0}, ...]
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT TRUE,
  ends_at TIMESTAMP,
  category VARCHAR(100),
  -- Traduction EN
  question_en TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_polls_active ON polls(is_active) WHERE is_active = TRUE;

-- ============================================
-- 6. TABLE POLL_VOTES (Votes sondages)
-- ============================================
CREATE TABLE IF NOT EXISTS poll_votes (
  id SERIAL PRIMARY KEY,
  poll_id INT REFERENCES polls(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  option_index INT NOT NULL,
  voted_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(poll_id, user_id) -- 1 vote par utilisateur par sondage
);

CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON poll_votes(poll_id);

-- ============================================
-- 7. TABLE PODCASTS
-- Note: play_count (et non plays_count)
-- ============================================
CREATE TABLE IF NOT EXISTS podcasts (
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
  -- Traductions EN
  title_en VARCHAR(500),
  description_en TEXT,
  audio_url_en VARCHAR(500),
  slug_en VARCHAR(500),
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_podcasts_status ON podcasts(status);
CREATE INDEX IF NOT EXISTS idx_podcasts_published ON podcasts(published_at DESC) WHERE status = 'published';

-- ============================================
-- 8. TABLE EMISSIONS
-- Note: view_count (et non views_count)
-- ============================================
CREATE TABLE IF NOT EXISTS emissions (
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
  category VARCHAR(100),
  -- Traductions EN
  title_en VARCHAR(500),
  description_en TEXT,
  slug_en VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emissions_status ON emissions(status);
CREATE INDEX IF NOT EXISTS idx_emissions_aired ON emissions(aired_at DESC) WHERE status = 'published';

-- ============================================
-- 9. TABLE SUBSCRIPTIONS (Historique abonnements)
-- ============================================
CREATE TABLE IF NOT EXISTS subscriptions (
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
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- ============================================
-- 10. TABLE ARTICLE_ANALYTICS (Statistiques articles)
-- ============================================
CREATE TABLE IF NOT EXISTS article_analytics (
  id SERIAL PRIMARY KEY,
  article_id INT REFERENCES articles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  views INT DEFAULT 0,
  unique_visitors INT DEFAULT 0,
  avg_time_spent INT DEFAULT 0, -- Secondes
  -- Profondeur de lecture (% lu)
  reads_start INTEGER DEFAULT 0,
  reads_25 INTEGER DEFAULT 0,
  reads_50 INTEGER DEFAULT 0,
  reads_75 INTEGER DEFAULT 0,
  reads_100 INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(article_id, date)
);

CREATE INDEX IF NOT EXISTS idx_analytics_article ON article_analytics(article_id);
CREATE INDEX IF NOT EXISTS idx_analytics_date ON article_analytics(date DESC);

-- ============================================
-- 11. TABLE SESSIONS (Géré par connect-pg-simple)
-- Créée automatiquement par connect-pg-simple au démarrage
-- ============================================

-- ============================================
-- 12. TABLE TRANSLATIONS (Cache DeepL)
-- Note: original_hash et original_text (noms réels en BDD)
-- ============================================
CREATE TABLE IF NOT EXISTS translations (
  id SERIAL PRIMARY KEY,
  original_hash VARCHAR(64) UNIQUE NOT NULL,
  original_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  source_lang VARCHAR(5) NOT NULL,
  target_lang VARCHAR(5) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_translations_hash ON translations(original_hash);
CREATE INDEX IF NOT EXISTS idx_translations_langs ON translations(source_lang, target_lang);
CREATE INDEX IF NOT EXISTS idx_translations_created ON translations(created_at DESC);

-- ============================================
-- 13. TABLE DEEPL_USAGE (Suivi consommation API)
-- Note: characters_count, month en VARCHAR(7) 'YYYY-MM'
-- ============================================
CREATE TABLE IF NOT EXISTS deepl_usage (
  id SERIAL PRIMARY KEY,
  month VARCHAR(7) UNIQUE NOT NULL, -- Format 'YYYY-MM'
  characters_count INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deepl_usage_month ON deepl_usage(month DESC);

-- ============================================
-- 14. TABLE LANGUAGE_PREFERENCES (Préférences langue anonymes)
-- Note: pas de colonne id, clé = ip_address
-- ============================================
CREATE TABLE IF NOT EXISTS language_preferences (
  ip_address VARCHAR(45) NOT NULL, -- IPv4 et IPv6
  preferred_language VARCHAR(5) DEFAULT 'fr' CHECK (preferred_language IN ('fr', 'en')),
  last_updated TIMESTAMP DEFAULT NOW(),
  UNIQUE(ip_address)
);

CREATE INDEX IF NOT EXISTS idx_lang_prefs_ip ON language_preferences(ip_address);

-- ============================================
-- FONCTIONS & TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_parties_updated_at BEFORE UPDATE ON parties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_articles_updated_at BEFORE UPDATE ON articles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_podcasts_updated_at BEFORE UPDATE ON podcasts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_emissions_updated_at BEFORE UPDATE ON emissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- FIN DU SCHÉMA
-- ============================================
