-- ═══════════════════════════════════════════════════════════════
-- DONNÉES DE TEST COMPATIBLES V2
-- ═══════════════════════════════════════════════════════════════

-- 1. ACTIVATION EXTENSION UUID (Pour les ID de traduction)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. UTILISATEURS (Mots de passe non hashés pour le test : 'password123')
INSERT INTO users (username, email, password, first_name, last_name, role, can_publish_directly) VALUES
('admin', 'admin@solitiquo.com', '$2b$10$EpOlaHf8j8.A.wz.q.wz.Ot/5j5j5j5j5j5j5j5j5j5j5j5j5', 'Térence', 'Admin', 'admin', TRUE),
('redac', 'redac@solitiquo.com', '$2b$10$EpOlaHf8j8.A.wz.q.wz.Ot/5j5j5j5j5j5j5j5j5j5j5j5j5', 'Jean', 'Plume', 'writer', FALSE),
('abonne', 'abonne@solitiquo.com', '$2b$10$EpOlaHf8j8.A.wz.q.wz.Ot/5j5j5j5j5j5j5j5j5j5j5j5j5', 'Marie', 'Lectrice', 'subscriber', FALSE);

-- 3. ARTICLES BILINGUES (Liés par le même UUID)
-- On génère un ID unique pour le groupe de traduction
WITH new_group AS (SELECT uuid_generate_v4() as gid)
INSERT INTO articles (translation_group_id, lang, title, slug, content, category, author_id, status, published_at)
VALUES
-- Version Française
((SELECT gid FROM new_group), 'fr', 'Le budget 2025 adopté', 'le-budget-2025-adopte', '<p>Le parlement a voté...</p>', 'Politique', 1, 'published', NOW()),
-- Version Anglaise (Même GID)
((SELECT gid FROM new_group), 'en', '2025 Budget Adopted', '2025-budget-adopted', '<p>The parliament voted...</p>', 'Politique', 1, 'published', NOW());

-- 4. SONDAGE (Page Politique)
WITH new_poll AS (
  INSERT INTO polls (question, category, expires_at) 
  VALUES ('Pensez-vous que l''inflation va baisser en 2026 ?', 'Politique', NOW() + INTERVAL '7 days') 
  RETURNING id
)
INSERT INTO poll_options (poll_id, label) VALUES
((SELECT id FROM new_poll), 'Oui, absolument'),
((SELECT id FROM new_poll), 'Non, pas du tout'),
((SELECT id FROM new_poll), 'Sans avis');

-- 5. MOTS INTERDITS (Version corrigée anti-doublon)
INSERT INTO banned_words (word) VALUES 
('arnaque'), ('fake'), ('idiot'), ('scam')
ON CONFLICT (word) DO NOTHING;

-- 6. VIDÉO (Émission)
INSERT INTO emissions (title, video_provider, video_id, is_live) 
VALUES ('Débat : La jeunesse au pouvoir ?', 'youtube', 'dQw4w9WgXcQ', FALSE);

-- 7. PODCAST
INSERT INTO podcasts (title, audio_url, duration, category, author_id)
VALUES ('Épisode 1 : Les enjeux du numérique', 'https://res.cloudinary.com/demo/video/upload/sample_audio.mp3', 1800, 'Social', 2);