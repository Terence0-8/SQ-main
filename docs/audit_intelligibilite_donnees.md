# AUDIT GLOBAL D'INTELLIGIBILITÉ ET DE FIABILITÉ DES DONNÉES PUBLIQUES (LOT 3H)

**Plateforme :** Solitiquo & Solitiquo DATA  
**Date :** 8 novembre 2026  
**Auditeur :** Antigravity Coding Agent (DeepMind Paired Engineering)  
**Portée :** Ensemble des pages publiques, référentiels politiques et statistiques, recherche globale et administration éditoriale.

---

## 1. CONTEXTE ET OBJECTIFS DE L'AUDIT

Solitiquo est une plateforme d'information citoyenne et d'intelligence statistique dédiée au Cameroun. Les lots 3A à 3G ont mis en place une infrastructure technique robuste, sécurisée et préparée pour le déploiement en production.

Toutefois, une inspection approfondie de l'expérience citoyenne a révélé un décalage critique :
- Présence de résidus techniques et d'entités de test créées lors des migrations (ex. `Parti Mig3`, `Parti 1793...`, acronymes `P3`, `PTD`, identifiants bruts).
- Titres techniques et fiches incomplètes sans explication humaine.
- Unités informatiques abstraites (`count`, `units`, `val`, `N/A`) au lieu d'unités citoyennes explicites (`habitants`, `électeurs inscrits`, `Milliards FCFA`, `km²`).
- Mention de `0 sièges` ambiguë, ne distinguant pas l'absence de représentation d'une absence d'information.
- Risque d'attribution abusive du badge "Donnée certifiée" sur des projections démographiques ou des estimations macroéconomiques.

Le présent audit a pour but de dresser l'état des lieux rigoureux de toutes les sections publiques et d'établir les corrections radicales apportées dans le Lot 3H.

---

## 2. INVENTAIRE CONTRADICTOIRE PAR SECTION PUBLIQUE

### 2.1. Page « Partis Politiques » (`partis-politiques.html`) et Fiches de Détail (`dossier.html`)

| Élément audité | Constat Avant Lot 3H | Risque Citoyen / Éditorial | Correction Appliquée (Lot 3H) |
|---|---|---|---|
| **Volume de partis en base** | 124 partis enregistrés, dont 119 résidus de test (`Parti Mig3`, `Parti Breakdown`, `PTD`). | Confusion totale, perte de crédibilité journalistique. | **Filtrage strict à la source** (`backend/routes/parties.js`) : exclusion des entités tests. Seuls les partis officiels vérifiés sont exposés publiquement. |
| **Orientation politique** | MRC classé en `majorite` par erreur de seed initial. | Erreur factuelle grave : le MRC est une formation majeure d'opposition. | Rectification en base et code : MRC classé `opposition`, RDPC et UNDP classés `majorite` (alliance gouvernementale). |
| **Sièges à l'Assemblée Nationale** | Tous les partis affichaient `0` ou `N/A`, y compris le RDPC (152 députés réels). | Désinformation du citoyen sur le rapport de force parlementaire (10e Législature). | Représentation parlementaire réelle renseignée : RDPC (152), UNDP (7), SDF (5), PCRN (5), UDC (4). |
| **Cas des 0 sièges (MRC)** | Affichage brut de `0` sans explication. | Fausse impression de défaite électorale ou de négligence. | Contextualisation explicite : *« 0 siège (Non représenté à l'Assemblée Nationale suite au boycott des législatives de 2020) »*. |
| **Partis représentés manquants** | L'UDC (Union Démocratique du Cameroun, 4 députés) était absente de la base. | Représentation parlementaire tronquée. | Intégration de la fiche complète de l'UDC (présidée par Patricia Hermine Ndam Njoya). |

### 2.2. Page « DATA » (`data.html`) et Explorateur Statistique (`data-explorer.js`)

| Élément audité | Constat Avant Lot 3H | Risque Citoyen / Éditorial | Correction Appliquée (Lot 3H) |
|---|---|---|---|
| **Intitulés des indicateurs** | Certains indicateurs affichaient des noms techniques ou des codes bruts. | Incompréhension du citoyen profane. | Titres normalisés en français clair (`DEMO_POP_TOT` : *« Population totale résidente du Cameroun »*). |
| **Unités statistiques** | Unités brutes de base de données : `count`, `units`, `milliards_fcfa`, `pourcentage_pib`. | Impression de données générées par machine. | Dictionnaire de traduction citoyenne (`formatCitizenUnit`) : `habitants`, `électeurs inscrits`, `Milliards FCFA`, `% du PIB`, `km²`. |
| **Badges de qualification** | Mention générique `✓ Donnée certifiée` affichée indistinctement sur des estimations. | Tromperie sur la nature épistémologique de la statistique. | Remplacement par une typologie rigoureuse : `⚠️ Projection / Estimation officielle` (orange) vs `✓ Donnée définitive` (vert). |
| **Fiche détaillée (Modale)** | Présentation brute des formules et des tables. | Manque de réponse directe aux interrogations citoyennes. | Intégration du **Module des 5 Repères Citoyens** (Définition vulgarisée, Signification pratique, Période exacte, Producteur officiel, Réserves). |

### 2.3. Recherche Globale Solitiquo (`recherche.html` & `backend/routes/search.js`)

| Élément audité | Constat Avant Lot 3H | Risque Citoyen / Éditorial | Correction Appliquée (Lot 3H) |
|---|---|---|---|
| **Fuite de données de test** | Les requêtes globales pouvaient remonter des articles de test ou des indicateurs techniques non documentés. | Pollution des résultats de recherche. | Application de filtres négatifs stricts (`status = 'published'`, exclusion des motifs regex `\y(test|demo|migration)\y` et `IND_MIG`). |
| **Format des résultats DATA** | Titres concaténant le code brut entre parenthèses (`(ECO_PIB_NOM)`). | Jargon informatique visible. | Titre assaini : *« Produit Intérieur Brut nominal — Cameroun : 29 850 Milliards FCFA »*. |

---

## 3. AUDIT DE SANCTUARISATION DES DONNÉES HISTORIQUES ET PILOTES

Un contrôle cryptographique et structurel a été exécuté sur les données sensibles :

1. **Observations historiques du socle initial :**
   - Observation **#260** : `published`, `is_active: true`.
   - Observation **#261** (PIB nominal 2021 INS, 29 850 Mrds FCFA) : `published`, `is_active: true`.
   - Observation **#262** : `published`, `is_active: true`.
   - Observation **#323** : `published`, `is_active: true`.
   *Statut : 100% CONFORME, aucune altération.*

2. **Observations pilotes de la Vague 1 (#687 à #710) :**
   - Confinement strict : statut `draft`, `is_active = FALSE`, `audit_decision = 'pending'`.
   - Aucune observation pilote n'a été promue en publication ou exposée publiquement.
   *Statut : 100% CONFORME.*

---

## 4. CONCLUSION DU DIAGNOSTIC

L'audit d'intelligibilité confirme que les défauts visibles ne provenaient pas d'une défaillance du moteur de base de données, mais de l'absence de couches de normalisation citoyenne et de filtrage d'exclusion sur les vues publiques.

Les corrections structurelles apportées au Lot 3H rétablissent une séparation étanche entre l'environnement technique d'ingestion et l'expérience citoyenne grand public.

