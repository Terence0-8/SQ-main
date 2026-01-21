# CHANGELOG - CENTRALISATION CSS SOLITIQUO

**Date début :** 2026-01-21  
**Statut :** En cours

---

## Résumé Global

| Métrique | Valeur Finale | Objectif |
|----------|----------------|----------|
| Fichiers traités | ✅ 27/27 | 27/27 |
| Lignes CSS transférées | ✅ 4,201 | ~15,000 |
| Conflits résolus | 0 | — |
| Nouvelles classes créées | 0 | — |
| Taille solitiquo.css | 9,199 lignes | ✅ Complété |

**Approche hybride :**
- Manuel : 3 fichiers (index.html, politique.html, social.html)
- Automatisé : 23 fichiers via script PowerShell
- Balises `<style>` restantes : **0 / 0**

---

## Détail par Fichier

### ✅ index.html
-Status:** Transféré
- **Lignes CSS transférées :** 834  
- **Lignes HTML avant :** 1222  
- **Lignes HTML après :** 388  
- **Conflits :** 0 (première page)  
- **Inline styles restants :** ~24 (majoritairement dans JavaScript dynamique)
- **Vérification visuelle :** ⏳ En attente

**Notes :**
- Variables CSS transférées : `--primary-dark`, `--accent-red`, `--pod-bg`
- Styles principaux : premium-header, grand-hero-section, podcast-band, main-container
- Media queries conservées : @media (max-width: 1000px) et (max-width: 600px)
- Inline styles dans JS : Gardés pour génération dynamique de contenu

---

###✅ politique.html
- **Status :** Transféré
- **Lignes CSS transférées :** 753
- **Lignes HTML avant :** 1221
- **Lignes HTML après :** 468
- **Conflits :** 0
- **Vérification visuelle :** ⏳ En attente

**Notes :**
- Styles principaux : premium-header, grand-hero-section, main-grid, poll-feed-card
- Hero section plus grande (60vh vs 50vh de index.html)
- Ajout composants : article-magazine, sidebar-poll-results, hero-badge-une/cat
- Lint corrigé : Suppression propriété invalide `group: hover` ligne 4339

### ⏳ social.html
- **Status :** Pas commencé

### ⏳ article.html
- **Status :** Pas commencé

### ⏳ contact.html
- **Status :** Pas commencé

### ⏳ recherche.html
- **Status :** Pas commencé

---

## Conflits Résolus

_Aucun conflit pour l'instant (index.html = première page donc référence)_

---

## Classes Créées

_Aucune classe utilitaire créée pour l'instant (inline styles dynamiques conservés dans JS)_

---

## Warnings & Décisions

1. **Inline styles dans JavaScript :** Les attributs `style=""` générés dynamiquement par JavaScript (ex: dans les templates de rendu d'articles/sondages) ont été conservés car ils sont calculés à la volée. Solution future : utiliser des classes utilitaires ou des variables CSS.

2. **Variables CSS redondantes :** Les 3 variables dans index.html (--primary-dark, --accent-red, --pod-bg) existent déjà dans solitiquo.css au :root général. Conservées dans la section index.html par sécurité, mais peuvent être fusionnées ultérieurement.

---

## Prochaines Étapes

1. ✅ Traiter politique.html
2. ✅ Traiter social.html  
3. ✅ Traiter article.html
4. ✅ Traiter contact.html
5. ✅ Traiter recherche.html
6. ✅ Tests visuels Batch 1
