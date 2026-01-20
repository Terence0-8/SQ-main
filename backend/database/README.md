# 📊 Documentation Base de Données Solitiquo

## Vue d'ensemble

Base de données PostgreSQL 14+ avec 11 tables principales pour gérer :
- Utilisateurs et authentification
- Contenu éditorial (articles, podcasts, émissions)
- Interactions (commentaires, votes)
- Abonnements et analytics

---

## 📋 Tables principales

### 1. users - Utilisateurs
Gestion des comptes utilisateurs et abonnements.

**Colonnes :**
- `id` (SERIAL) : Identifiant unique
- `username` (VARCHAR 50) : Nom d'utilisateur unique
- `email` (VARCHAR 255) : Email unique
- `password` (VARCHAR 255) : Mot de passe hashé bcrypt
- `role` (VARCHAR 20) : reader, writer, admin, subscriber
- `is_active` (BOOLEAN) : Compte actif ou suspendu
- `is_subscriber` (BOOLEAN) : Abonné premium ou non
- `subscription_start_date` (TIMESTAMP) : Début abonnement
- `subscription_end_date` (TIMESTAMP) : Fin abonnement
- `created_at` (TIMESTAMP) : Date de création
- `updated_at` (TIMESTAMP) : Dernière modification

**Index :**
- idx_users_email : Recherche par email
- idx_users_role : Filtrage par rôle
- idx_users_subscriber : Liste des abonnés actifs

**Relations :**
- articles.author_id → users.id
- comments.user_id → users.id
- subscriptions.user_id → users.id

---

### 2. parties - Partis politiques
Catalogue des partis politiques camerounais.

**Colonnes :**
- `id` (SERIAL) : Identifiant unique
- `name` (VARCHAR 255) : Nom complet du parti
- `acronym` (VARCHAR 20) : Sigle (ex: RDPC, MRC)
- `logo_url` (TEXT) : URL du logo
- `color` (VARCHAR 7) : Couleur hexa (ex: #FF5733)
- `founded_year` (INT) : Année de création
- `leader_name` (VARCHAR 255) : Nom du leader
- `ideology` (VARCHAR 100) : Orientation politique
- `description` (TEXT) : Présentation générale
- `program_summary` (TEXT) : Résumé du programme
- `website_url` (TEXT) : Site officiel
- `social_twitter` (VARCHAR 255) : Compte Twitter
- `social_facebook` (VARCHAR 255) : Page Facebook
- `contact_email` (VARCHAR 255) : Email de contact
- `is_active` (BOOLEAN) : Parti actif ou dissous

**Données initiales :**
- RDPC (Paul Biya)
- MRC (Maurice Kamto)
- SDF (Joshua Osih)
- UPC (Collégiale)
- PCRN (Cabral Libii)

---

### 3. articles - Articles
Contenu éditorial principal.

**Colonnes :**
- `id` (SERIAL) : Identifiant unique
- `title` (VARCHAR 500) : Titre de l'article
- `slug` (VARCHAR 500) : URL-friendly (ex: cameroun-elections-2025)
- `content` (TEXT) : Contenu HTML
- `excerpt` (TEXT) : Résumé court
- `featured_image` (TEXT) : Image principale
- `author_id` (INT) : Référence vers users.id
- `category` (VARCHAR 100) : Catégorie (Politique, Économie, etc.)
- `tags` (TEXT[]) : Mots-clés (array PostgreSQL)
- `status` (VARCHAR 20) : draft, published, archived
- `is_premium` (BOOLEAN) : Contenu réservé abonnés
- `language` (VARCHAR 5) : fr ou en
- `views_count` (INT) : Nombre de vues
- `published_at` (TIMESTAMP) : Date de publication

**Index clés :**
- idx_articles_published : Tri par date publication
- idx_articles_slug : Recherche par URL
- idx_articles_category : Filtrage par catégorie

---

### 4. comments - Commentaires
Discussions sur les articles.

**Colonnes :**
- `id` (SERIAL) : Identifiant unique
- `article_id` (INT) : Référence vers articles.id
- `user_id` (INT) : Référence vers users.id
- `content` (TEXT) : Texte du commentaire
- `parent_id` (INT) : Pour les réponses (commentaire parent)
- `is_approved` (BOOLEAN) : Validé par modération

**Structure hiérarchique :**
Comment 1 (parent_id = NULL)
  - Comment 2 (parent_id = 1)
  - Comment 3 (parent_id = 1)
Comment 4 (parent_id = NULL)

---

### 5. polls - Sondages
Sondages d'opinion interactifs.

**Colonnes :**
- `id` (SERIAL) : Identifiant unique
- `question` (TEXT) : Question posée
- `options` (JSONB) : Options de vote
- `created_by` (INT) : Auteur du sondage
- `is_active` (BOOLEAN) : Sondage ouvert ou fermé
- `ends_at` (TIMESTAMP) : Date de fin

**Format options JSONB :**
[
  {"text": "Oui", "votes": 145},
  {"text": "Non", "votes": 89},
  {"text": "Sans opinion", "votes": 23}
]

---

### 6. poll_votes - Votes sondages
Enregistrement des votes (empêche double vote).

**Colonnes :**
- `id` (SERIAL) : Identifiant unique
- `poll_id` (INT) : Référence vers polls.id
- `user_id` (INT) : Référence vers users.id
- `option_index` (INT) : Index de l'option votée (0, 1, 2...)

**Contrainte :** UNIQUE(poll_id, user_id) = 1 seul vote par utilisateur

---

### 7. podcasts - Podcasts
Contenu audio.

**Colonnes :**
- `id` (SERIAL) : Identifiant unique
- `title` (VARCHAR 500) : Titre de l'épisode
- `slug` (VARCHAR 500) : URL-friendly
- `description` (TEXT) : Description
- `audio_url` (TEXT) : Lien fichier MP3
- `duration_seconds` (INT) : Durée (secondes)
- `transcript` (TEXT) : Transcription automatique
- `cover_image` (TEXT) : Vignette
- `author_id` (INT) : Référence vers users.id
- `status` (VARCHAR 20) : draft, published, archived
- `is_premium` (BOOLEAN) : Contenu premium
- `plays_count` (INT) : Nombre d'écoutes

---

### 8. emissions - Émissions vidéo
Contenu vidéo (talk-shows, interviews).

**Colonnes :**
- `id` (SERIAL) : Identifiant unique
- `title` (VARCHAR 500) : Titre de l'émission
- `video_url` (TEXT) : Lien YouTube/Vimeo
- `thumbnail_url` (TEXT) : Miniature
- `host_id` (INT) : Animateur (référence users.id)
- `views_count` (INT) : Nombre de vues
- `aired_at` (TIMESTAMP) : Date de diffusion

---

### 9. subscriptions - Historique abonnements
Traçabilité des paiements.

**Colonnes :**
- `id` (SERIAL) : Identifiant unique
- `user_id` (INT) : Référence vers users.id
- `plan` (VARCHAR 20) : monthly (6000 XAF) ou yearly (60000 XAF)
- `amount` (DECIMAL) : Montant payé
- `currency` (VARCHAR 5) : XAF ou EUR
- `payment_method` (VARCHAR 50) : cinetpay, stripe, etc.
- `transaction_id` (VARCHAR 255) : ID unique de la transaction
- `status` (VARCHAR 20) : pending, active, expired, cancelled
- `starts_at` (TIMESTAMP) : Début de l'abonnement
- `ends_at` (TIMESTAMP) : Fin de l'abonnement

**Note :** Cette table conserve l'historique même après expiration.

---

### 10. article_analytics - Statistiques articles
Métriques de performance par article.

**Colonnes :**
- `id` (SERIAL) : Identifiant unique
- `article_id` (INT) : Référence vers articles.id
- `date` (DATE) : Jour des statistiques
- `views` (INT) : Nombre de vues ce jour
- `unique_visitors` (INT) : Visiteurs uniques
- `avg_time_spent` (INT) : Temps de lecture moyen (secondes)

**Contrainte :** UNIQUE(article_id, date) = 1 ligne par jour par article

---

### 11. session_user_cookies - Sessions
Table créée automatiquement par connect-pg-simple.
Stocke les sessions Express côté serveur.

---

## 🔄 Triggers automatiques

### Fonction update_updated_at_column()
Met à jour automatiquement updated_at à chaque modification.

**Appliqué sur :**
- users
- parties
- articles
- comments
- podcasts
- emissions

**Exemple :**
UPDATE articles SET title = 'Nouveau titre' WHERE id = 5;
-- updated_at sera automatiquement défini à NOW()

---

## 📊 Relations clés

users (1) → articles (N)
users (1) → comments (N)
users (1) → subscriptions (N)
articles (1) → comments (N)
articles (1) → article_analytics (N)
polls (1) → poll_votes (N)
users (1) → poll_votes (N)

---

## 🔍 Requêtes utiles

### Lister les articles publiés récents
SELECT id, title, published_at, views_count
FROM articles
WHERE status = 'published'
ORDER BY published_at DESC
LIMIT 10;

### Trouver les abonnés actifs
SELECT id, username, email, subscription_end_date
FROM users
WHERE is_subscriber = TRUE
  AND subscription_end_date > NOW()
ORDER BY subscription_end_date ASC;

### Top 5 articles les plus vus
SELECT title, views_count
FROM articles
WHERE status = 'published'
ORDER BY views_count DESC
LIMIT 5;

### Statistiques par parti politique
SELECT 
  p.name,
  COUNT(a.id) as nb_articles
FROM parties p
LEFT JOIN articles a ON a.tags @> ARRAY[p.acronym]
GROUP BY p.name
ORDER BY nb_articles DESC;

---

## 🛠️ Maintenance

### Réindexer les tables (si lenteur)
REINDEX DATABASE solitiquo_db;

### Nettoyer les sessions expirées
-- connect-pg-simple le fait automatiquement toutes les 24h
-- Forcer manuellement :
DELETE FROM session_user_cookies WHERE expire < NOW();

### Backup de la base
pg_dump -U postgres solitiquo_db > backup_$(date +%Y%m%d).sql

---

## 📈 Évolutions futures

- Table notifications (alertes utilisateurs)
- Table bookmarks (articles favoris)
- Table user_preferences (paramètres personnalisés)
- Full-text search avec tsvector PostgreSQL
- Table media_library (gestion centralisée images/vidéos)
