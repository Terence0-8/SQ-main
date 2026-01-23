# 📊 Dashboard Analytics - Solitiquo

> **Date de création** : 23 janvier 2026  
> **Statut** : ✅ Prêt à tester  
> **Auteur** : Équipe Solitiquo + IA Assistant

---

## 🎯 Objectif

Le **Dashboard Analytics** permet aux administrateurs de visualiser des métriques clés sur :
- 📊 Progression de lecture des articles (25%, 50%, 75%, 100%)
- 🏆 Top 10 des articles les plus lus
- 📊 Répartition des contenus par catégorie
- 📅 Évolution temporelle (7 derniers jours)
- 👥 Statistiques utilisateurs (total, abonnés, taux de conversion)

---

## 🛠️ Installation & Configuration

### 1️⃣ Exécuter la migration de base de données

Les colonnes analytics doivent être ajoutées à la table `articles` :

```bash
node backend/migrations/run_fix_analytics.js
```

**Ce que fait cette migration** :
- Ajoute 5 colonnes dans la table `articles` :
  - `reads_start` : Nombre d'ouvertures de l'article
  - `reads_25` : Nombre de lectures à 25%
  - `reads_50` : Nombre de lectures à 50%
  - `reads_75` : Nombre de lectures à 75%
  - `reads_100` : Nombre de lectures complètes (100%)

⚠️ **Note** : La migration est **idempotente** (elle peut être exécutée plusieurs fois sans erreur).

---

### 2️⃣ Vérifier que les routes sont activées

Dans `server.js`, vérifiez que cette ligne existe :

```javascript
app.use('/api/analytics', require('./backend/routes/analytics'));
```

✅ **Déjà présent** dans le code actuel.

---

## 🚀 Accès au Dashboard

### Frontend

1. Démarrez le serveur :
   ```bash
   npm start
   # ou
   node server.js
   ```

2. Connectez-vous en tant qu'admin :
   - URL : `http://localhost:5000/admin.html`
   - Identifiants admin requis

3. Cliquez sur **"📈 Analytics"** dans le menu de gauche

---

## 📡 Endpoints API disponibles

| Endpoint | Méthode | Description | Middleware |
|----------|---------|-------------|------------|
| `/api/analytics/overview` | GET | Statistiques globales | `isAdmin` |
| `/api/analytics/reading-progress` | GET | Graphique funnel de lecture | `isAdmin` |
| `/api/analytics/top-articles` | GET | Top 10 articles | `isAdmin` |
| `/api/analytics/timeline` | GET | Évolution 7 derniers jours | `isAdmin` |
| `/api/analytics/categories` | GET | Répartition par catégorie | `isAdmin` |

### Exemple de réponse : `/api/analytics/overview`

```json
{
  "success": true,
  "data": {
    "articles": {
      "total": 45,
      "totalViews": 12543,
      "avgViews": 278
    },
    "users": {
      "total": 1250,
      "subscribers": 87,
      "active": 1180,
      "conversionRate": 6.96
    },
    "content": {
      "podcasts": 12,
      "emissions": 8,
      "parties": 15
    }
  }
}
```

---

## 📊 Graphiques disponibles

### 1. **Progression de Lecture** (Bar Chart)
- Affiche le nombre de lectures à chaque étape (0%, 25%, 50%, 75%, 100%)
- Permet d'identifier les points d'abandon
- Taux de rétention affichés en pourcentage

### 2. **Répartition par Catégories** (Donut Chart)
- Distribution des articles par catégorie
- Nombre d'articles + vues totales par catégorie

### 3. **Timeline 7 jours** (Line Chart)
- Évolution du nombre d'articles publiés
- Évolution du nombre de nouveaux utilisateurs
- Double courbe comparative

### 4. **Top 10 Articles** (Tableau)
- Titre + Catégorie
- Nombre de vues
- Taux de complétion (% lecture 100%)
- Date de publication

---

## 📝 Fichiers modifiés/créés

| Fichier | Type | Description |
|---------|------|-------------|
| `backend/routes/analytics.js` | ✅ Déjà existant | Routes API analytics complètes |
| `backend/migrations/fix_analytics_columns.sql` | ➕ Nouveau | Migration SQL corrigée |
| `backend/migrations/run_fix_analytics.js` | ➕ Nouveau | Script d'exécution migration |
| `admin.html` | ✅ Déjà existant | Frontend avec graphiques Chart.js |
| `server.js` | ✅ Déjà configuré | Routes analytics montées |

---

## 🐞 Troubleshooting

### ❌ Erreur : "Table articles doesn't have column reads_start"

**Solution** : Exécutez la migration
```bash
node backend/migrations/run_fix_analytics.js
```

### ❌ Erreur : "Cannot find module '../config/database'"

**Solution** : Assurez-vous que le fichier `backend/config/database.js` existe et est correctement configuré avec PostgreSQL.

### ❌ Les graphiques ne s'affichent pas

**Solutions** :
1. Vérifiez que Chart.js est chargé dans `admin.html` :
   ```html
   <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
   ```

2. Ouvrez la console du navigateur (F12) et cherchez les erreurs JavaScript

3. Vérifiez que les routes API renvoient des données :
   ```bash
   curl http://localhost:5000/api/analytics/overview
   ```

---

## ✅ Checklist de test

- [ ] Migration exécutée avec succès
- [ ] Serveur démarré sans erreurs
- [ ] Connexion admin fonctionnelle
- [ ] Section "Analytics" visible dans le menu
- [ ] 4 cartes de statistiques affichées
- [ ] Graphique "Progression de lecture" affiché
- [ ] Graphique "Répartition par catégories" affiché
- [ ] Graphique "Timeline 7 jours" affiché
- [ ] Tableau "Top 10 Articles" affiché
- [ ] Aucune erreur dans la console navigateur

---

## 🔮 Prochaines améliorations possibles

1. **Filtres temporels** : Permettre de choisir la période d'analyse (7j, 30j, 90j, année)
2. **Export PDF/CSV** : Télécharger les rapports analytics
3. **Graphiques temps réel** : Mise à jour automatique toutes les 30 secondes
4. **Analytics par auteur** : Voir les performances de chaque rédacteur
5. **Heat Map** : Visualiser les zones les plus lues dans un article
6. **Alertes** : Notifications si un article a un taux d'abandon élevé

---

## 📞 Support

Pour toute question :
- 📧 Email : support@solitiquo.com
- 🐛 Issues GitHub : [Ouvrir une issue](https://github.com/Terence0-8/SQ-main/issues)

---

**🎉 Le Dashboard Analytics est prêt à l'emploi !**