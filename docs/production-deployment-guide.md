# SOLITIQUO DATA — GUIDE OPÉRATIONNEL DE DÉPLOIEMENT EN PRODUCTION (LOT 3G)

## 1. Architecture et Prérequis Système

| Composant | Spécification Recommandée | Rôle |
| :--- | :--- | :--- |
| **Système d'exploitation** | Ubuntu 22.04 LTS / Debian 12 / Linux Enterprise | Hôte système de production |
| **Node.js** | v20.x ou v22.x LTS (actuel v24 compatible) | Moteur d'exécution backend |
| **PostgreSQL** | v16 ou v18 avec extensions `uuid-ossp`, `pg_trgm` | SGBD relationnel et sessions |
| **Process Manager** | PM2 (Mode Cluster) ou Systemd | Redémarrage automatique et clustering CPU |
| **Reverse Proxy** | Nginx ou Caddy avec TLS/SSL (Let's Encrypt) | Terminaison HTTPS, compression, cache statique |
| **Stockage** | SSD NVMe min. 50 Go, répertoires `backups/` et `uploads/` | Données, pièces justificatives, sauvegardes |

---

## 2. Procédure Pas-à-Pas de Déploiement

### Étape 1 : Sauvegarde préalable obligatoire (Point de reprise)
Avant toute modification sur le serveur de production, déclencher systématiquement un point de reprise :
```bash
node scripts/pre-migration-backup.js
```
Cette commande génère un dump complet dans `backups/db/` scellé par empreinte cryptographique SHA-256 avec son fichier manifeste.

### Étape 2 : Récupération du code et installation des dépendances
```bash
git fetch origin
git checkout main
npm ci --only=production
```

### Étape 3 : Configuration des variables d'environnement
Créer ou vérifier le fichier `.env` sur le serveur à partir du modèle :
```bash
cp .env.production.example .env
chmod 600 .env
```
Vérifier impérativement les paramètres critiques :
- `NODE_ENV=production`
- `PORT=5000`
- `TRUST_PROXY=true`
- `SESSION_SECRET` (clé aléatoire d'au moins 64 caractères)
- `JWT_SECRET` (clé aléatoire d'au moins 64 caractères)
- `ALLOWED_ORIGINS=https://solitiquo.com,https://solitiquo.cm`

### Étape 4 : Exécution des migrations de schéma (non destructives)
```bash
# Vérification de l'état des migrations
node backend/migrations/run-migrations.js
```
*Règle impérative : Ne jamais exécuter de migration destructive (`DROP TABLE`, `DROP COLUMN`) sur la base de production.*

### Étape 5 : Contrôle préalable automatisé de préproduction
```bash
node scripts/preprod-check.js
```
*Le script valide les 12 points de contrôle indispensables. Si un seul point est en échec, le déploiement est immédiatement interrompu.*

### Étape 6 : Démarrage ou Rechargement sans interruption (Zero Downtime)
Avec PM2 :
```bash
# Premier démarrage :
pm2 start ecosystem.config.js --env production

# Déploiement ultérieur sans coupure de service :
pm2 reload solitiquo-data-app --env production
```

### Étape 7 : Vérification post-déploiement en direct
```bash
# 1. Vérification du statut PM2
pm2 status

# 2. Vérification de la sonde de santé applicative et base de données
curl -i https://solitiquo.com/api/health

# 3. Vérification des logs temps réel
pm2 logs solitiquo-data-app --lines 50
```

---

## 3. Procédure de Retour Arrière (Rollback Immédiat)

En cas d'anomalie critique post-déploiement, suivre immédiatement cette procédure :

1. **Identifier la dernière sauvegarde valide :**
   ```bash
   node scripts/restore-db.js --dry-run
   ```
2. **Restaurer la base de données :**
   ```bash
   node scripts/restore-db.js
   ```
   *Le script vérifie automatiquement l'empreinte SHA-256 avant toute action pour éviter d'injecter un dump altéré.*
3. **Rebasculer sur la version applicative précédente :**
   ```bash
   git checkout <tag-or-commit-precedent>
   npm ci --only=production
   pm2 reload solitiquo-data-app --env production
   ```
4. **Vérifier le rétablissement du service :**
   ```bash
   node scripts/preprod-check.js
   ```

---

## 4. Configuration Recommandée du Reverse Proxy Nginx

```nginx
# /etc/nginx/sites-available/solitiquo
server {
    listen 80;
    server_name solitiquo.com www.solitiquo.com solitiquo.cm www.solitiquo.cm;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name solitiquo.com www.solitiquo.com;

    ssl_certificate /etc/letsencrypt/live/solitiquo.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/solitiquo.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Sécurité et en-têtes
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    # Protection des répertoires internes
    location ~ ^/(uploads/imports|uploads/document_archive|backend|backups) {
        deny all;
        return 403;
    }

    # Proxy vers Node.js / Express
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 25M;
    }
}
```

