-- ═══════════════════════════════════════════════════════════════
-- 1. NETTOYAGE (Pour repartir propre)
-- ═══════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS poll_votes CASCADE;
DROP TABLE IF EXISTS poll_options CASCADE;
DROP TABLE IF EXISTS polls CASCADE;
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS banned_words CASCADE;
DROP TABLE IF EXISTS emissions CASCADE;
DROP TABLE IF EXISTS podcasts CASCADE;
DROP TABLE IF EXISTS articles CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS newsletters CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- 2. UTILISATEURS & RÔLES
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL, -- Hashé (bcrypt)
  
  -- Infos profil
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  avatar_url VARCHAR(255), -- Stocké sur Cloudinary
  
  -- Gestion des droits
  role VARCHAR(50) DEFAULT 'reader' CHECK(role IN ('admin', 'writer', 'subscriber', 'reader')),
  can_publish_directly BOOLEAN DEFAULT FALSE, -- Si TRUE, pas besoin de validation
  
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════════
-- 3. ABONNEMENTS & PAIEMENTS (Mobile Money / CB)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'inactive' CHECK(status IN ('active', 'expired', 'cancelled')),
  
  -- Détails techniques paiement
  provider VARCHAR(50) CHECK(provider IN ('cinetpay', 'stripe', 'manual')), 
  payment_method VARCHAR(50), -- ex: 'OM', 'MOMO', 'VISA'
  phone_number VARCHAR(20), -- Pour le Mobile Money
  transaction_ref VARCHAR(255),
  
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════════
-- 4. ARTICLES (Multilingue & Premium)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE articles (
  id SERIAL PRIMARY KEY,
  
  -- Liaison Traduction (2 lignes = 1 article)
  -- Les articles FR et EN partageront le même translation_group_id
  translation_group_id UUID NOT NULL, 
  lang VARCHAR(2) NOT NULL CHECK (lang IN ('fr', 'en')),
  
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL, -- ex: /fr/politique/le-president
  excerpt TEXT, -- Résumé pour les cartes
  content TEXT NOT NULL, -- Contenu HTML riche
  image_url VARCHAR(255), -- Cloudinary
  
  -- Métadonnées
  category VARCHAR(50) NOT NULL, -- Politique, Social, Eco...
  tags TEXT[], -- Tableau de tags : ['Biya', 'Cameroun', 'Budget']
  is_opinion BOOLEAN DEFAULT FALSE, -- Si TRUE -> Tag "OPINION" affiché
  is_premium BOOLEAN DEFAULT FALSE, -- Si TRUE -> Paywall activé
  
  -- Workflow
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(50) DEFAULT 'draft' CHECK(status IN ('draft', 'pending', 'published')),
  
  views_count INTEGER DEFAULT 0,
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Contrainte : Pas de doublon de slug par langue
  UNIQUE(slug, lang)
);

-- ═══════════════════════════════════════════════════════════════
-- 5. SONDAGES (Pour Politique & Social)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE polls (
  id SERIAL PRIMARY KEY,
  question VARCHAR(255) NOT NULL,
  category VARCHAR(50), -- Pour afficher sur la bonne page (ex: 'politique')
  is_active BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE poll_options (
  id SERIAL PRIMARY KEY,
  poll_id INTEGER REFERENCES polls(id) ON DELETE CASCADE,
  label VARCHAR(150) NOT NULL, -- ex: "Pour", "Contre", "Sans avis"
  votes_count INTEGER DEFAULT 0
);

CREATE TABLE poll_votes (
  id SERIAL PRIMARY KEY,
  poll_id INTEGER REFERENCES polls(id) ON DELETE CASCADE,
  ip_address VARCHAR(45), -- Pour limiter 1 vote par IP (simple)
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, -- Si connecté
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(poll_id, user_id) -- Un utilisateur connecté ne vote qu'une fois
);

-- ═══════════════════════════════════════════════════════════════
-- 6. MODÉRATION & COMMENTAIRES
-- ═══════════════════════════════════════════════════════════════
-- Liste des mots interdits pour le script Node.js
CREATE TABLE banned_words (
  id SERIAL PRIMARY KEY,
  word VARCHAR(100) NOT NULL UNIQUE
);

INSERT INTO banned_words (word) VALUES ('arnaque'), ('insulte1'), ('insulte2');

CREATE TABLE comments (
  id SERIAL PRIMARY KEY,
  article_id INTEGER REFERENCES articles(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  
  -- Modération
  status VARCHAR(50) DEFAULT 'approved' CHECK(status IN ('approved', 'flagged', 'rejected')),
  flag_reason VARCHAR(255), -- ex: "Mot interdit détecté: arnaque"
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════════
-- 7. NEWSLETTER & MÉDIAS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE newsletters (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE podcasts (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  audio_url VARCHAR(255) NOT NULL, -- Cloudinary / Serveur
  duration INTEGER, -- en secondes
  category VARCHAR(50),
  author_id INTEGER REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'published',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Intégration Vidéos (YouTube/Facebook)
CREATE TABLE emissions (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  video_provider VARCHAR(50) DEFAULT 'youtube', -- youtube, facebook, twitch
  video_id VARCHAR(255) NOT NULL, -- L'ID de la vidéo (ex: dQw4w9WgXcQ)
  is_live BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);