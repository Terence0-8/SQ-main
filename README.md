# Solitiquo

Média de référence pour l'analyse politique et sociale au Cameroun.

## Description

Solitiquo est une application web Node.js complète, conçue pour servir de média d'analyse politique. Le projet comprend un backend robuste (Node.js, Express, PostgreSQL) et un frontend natif en HTML, CSS et JavaScript vanilla.

## Technologies

- **Backend** : Node.js, Express
- **Base de données** : PostgreSQL
- **Frontend** : HTML5, CSS3, JavaScript Vanilla
- **Stockage externe** : Cloudinary
- **Paiements** : Stripe, CinetPay
- **Authentification** : Passport (Local, Google, Facebook)

## Prérequis

- Node.js (version >= 18.0.0)
- PostgreSQL
- npm (Node Package Manager)

## Installation et démarrage local

1. **Cloner le dépôt et installer les dépendances**
   ```bash
   npm install
   ```

2. **Configuration des variables d'environnement**
   Copiez le fichier d'exemple des variables d'environnement pour créer votre configuration locale :
   ```bash
   cp .env.example .env
   ```
   **Important :** Vous devez impérativement configurer la variable `SESSION_SECRET` dans votre fichier `.env` pour que l'application puisse démarrer. Il est également recommandé de configurer l'URL de la base de données (`DATABASE_URL`).

3. **Lancer l'application**
   ```bash
   npm start
   ```
   Le serveur local sera accessible à l'adresse : [http://localhost:5000](http://localhost:5000)

## Tests

Le projet utilise le runner de test natif de Node.js.

Pour exécuter les tests :
```bash
npm test
```

*Remarque pour la CI :* Le fichier de test `tests/dummy/dummy.test.js` doit être conservé dans le dépôt. Il garantit que les environnements de CI (comme GitHub Actions) trouvent au moins un fichier de test correspondant au pattern de recherche globale, évitant ainsi des échecs de pipeline inutiles.

## Linting et Conventions de code

Le projet applique des règles ESLint strictes pour assurer la qualité du code :
- **Variables inutilisées :** Elles doivent obligatoirement être préfixées par un tiret du bas (ex: `_err`).
- **Switch cases :** Ils nécessitent une portée lexicale (les cas doivent être enveloppés dans des accolades `{}`).
- **Gestion des erreurs :** Les erreurs relancées doivent préserver l'erreur d'origine en utilisant la propriété `cause`.

Pour vérifier le code :
```bash
npm run lint
```

Pour corriger automatiquement les erreurs :
```bash
npm run lint:fix
```

## Autres commandes utiles

- **Mode développement :** `npm run dev` (utilise nodemon pour recharger le serveur automatiquement)
- **Migrations de base de données :**
  - Exécuter les migrations : `npm run migrate`
  - Annuler une migration : `npm run migrate:down`
  - Créer une nouvelle migration : `npm run migrate:create`
- **Formatage du code :** `npm run format` (utilise Prettier)
- **Minification CSS :** `npm run css:minify`
