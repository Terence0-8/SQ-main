# SOLITIQUO DATA — RAPPORT D'AUDIT DE SÉCURITÉ DE PRODUCTION (LOT 3G)

## 1. Synthèse Exécutive

Dans le cadre du **Lot 3G**, une revue complète des vulnérabilités, configurations et contrôles d'accès a été conduite sur l'ensemble de la plateforme Solitiquo DATA.

**Niveau de sécurité évalué : ÉLEVÉ / CONFORME AUX STANDARDS DE PRODUCTION.**

---

## 2. Matrice des Contrôles de Sécurité

| Domaine | Exigence de Production | Implémentation Solitiquo DATA | Statut |
| :--- | :--- | :--- | :---: |
| **Transport Chiffré (HTTPS)** | Chiffrement TLS obligatoire, HSTS | Helmet `Strict-Transport-Security` configuré (31536000s, includeSubDomains, preload). Redirection 301 forcée côté reverse proxy. | **CONFORME** |
| **Sécurité des Cookies** | `HttpOnly`, `Secure`, `SameSite=Lax` | Configuré dans `server.js` (`express-session`). `app.set('trust proxy', 1)` activé pour transmission sécurisée derrière proxy inverse. | **CONFORME** |
| **Gestion des Sessions** | Stockage persistant sécurisé, secret fort | Store PostgreSQL dédié (`connect-pg-simple`) via table `session_user_cookies`. Blocage du démarrage si `SESSION_SECRET` absent. | **CONFORME** |
| **Protection Anti-CSRF** | Jetons synchronisés sur mutations | Middleware global `csrfProtection` + `verifyCsrf` sur toutes les routes POST/PUT/DELETE non exemptées. Rejet strict HTTP 403 en cas d'absence ou invalidité. | **CONFORME** |
| **Contrôle d'Accès CORS** | Origines restreintes | En production, `origin` vérifié sur liste blanche stricte via variable `ALLOWED_ORIGINS` (défaut : domaines officiels Solitiquo). | **CONFORME** |
| **Limitation des Requêtes (Rate Limiting)** | Protection anti-brute-force et anti-DoS | `loginLimiter` (10 tentatives / 15 min), `adminLimiter` (50 req / 15 min), `commentsLimiter` (100 req / 15 min), `globalLimiter` (5000 req / 15 min). | **CONFORME** |
| **Injections SQL** | Requêtes paramétrées obligatoires | 100 % des requêtes SQL utilisent les variables de substitution (`$1, $2, ...`) via le pool `pg`. Aucune concaténation de données utilisateur dans les requêtes. | **CONFORME** |
| **En-têtes HTTP de Sécurité** | Protection clickjacking, reniflage MIME | Helmet activé : `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `X-XSS-Protection: 0`, CSP configurée en production. | **CONFORME** |
| **Protection Stockage Privé** | Interdiction d'accès direct aux archives | Règles Express strictes bloquant l'accès direct HTTP (403 Forbidden) aux dossiers `/uploads/imports`, `/uploads/document_archive` et `/backend/storage`. | **CONFORME** |
| **Fuite d'Informations d'Erreur** | Masquage des stack traces | En production (`NODE_ENV === 'production'`), toutes les erreurs non gérées retournent un message opaque générique (`"Erreur serveur"`), les détails étant conservés dans les journaux structurés Pino. | **CONFORME** |
| **Injections CSV (Formula Injection)** | Neutralisation des déclencheurs DDE | Dans `dataService.js`, tout caractère déclencheur (`=`, `+`, `-`, `@`, `\t`, `\r`) au début d'une cellule est automatiquement préfixé par une apostrophe (`'`). | **CONFORME** |
| **Étanchéité des Données Non Publiées** | Zéro fuite des brouillons et pilotes | Filtres stricts `editorial_status = 'published' AND is_active = TRUE` imposés sur toutes les requêtes publiques. Les 24 pilotes sont strictement inaccessibles. | **CONFORME** |

---

## 3. Vulnérabilités Identifiées et Résolues au Lot 3G

1. **Absence de configuration de proxy de confiance (`trust proxy`) :**
   - *Risque :* Lorsque le serveur Node.js est déployé derrière un reverse proxy HTTPS (Nginx, Traefik, Cloudflare), Express ne reconnaissait pas la connexion comme sécurisée, ce qui empêchait l'émission correcte du cookie de session avec l'attribut `Secure: true`.
   - *Résolution :* Ajout de `app.set('trust proxy', 1)` lorsque `isProduction` ou `TRUST_PROXY=true`.
2. **Sonde de santé non intrusive mais incomplète :**
   - *Risque :* L'ancien endpoint `/api/health` renvoyait un statut statique sans interroger la disponibilité réelle du cluster PostgreSQL, masquant une panne de base de données aux répartiteurs de charge.
   - *Résolution :* Implémentation d'un test de ping réel avec mesure de latence (`SELECT 1`), retour HTTP 503 en cas d'indisponibilité, et ajout de sondes dédiées Kubernetes/Docker `/api/health/live` et `/api/health/ready`.
3. **Sécurisation du pool PostgreSQL pour les bases hébergées (Cloud) :**
   - *Risque :* Impossibilité de forcer le chiffrement SSL/TLS lors de la connexion à des bases managées (AWS RDS, Supabase, Neon) sans modifier le code.
   - *Résolution :* Prise en charge automatique de la variable `DB_SSL` dans `backend/config/database.js`.

---

## 4. Recommandations Complémentaires pour l'Équipe d'Exploitation

1. **Gestion des Secrets :** Stocker le fichier `.env` avec des permissions strictes `chmod 600` appartenant à l'utilisateur système non-root dédié (ex. `solitiquo:solitiquo`).
2. **Rotation des Clés :** Prévoir une rotation annuelle de `SESSION_SECRET` et `JWT_SECRET`.
3. **Certificats SSL/TLS :** Configurer le renouvellement automatique `certbot renew` via tâche cron hebdomadaire.
4. **Surveillance Proactive :** Pointer les outils d'uptime (UptimeRobot, BetterUptime ou Datadog) sur l'endpoint `/api/health` pour une alerte immédiate en cas de latence > 500ms ou statut dégradé.

