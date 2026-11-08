# Registre des Données à Corriger, Suivi des Anomalies et Backlog Méthodologique
**Projet :** Solitiquo DATA — Plateforme Citoyenne Camerounaise  
**Référence :** LOT 3H — Gouvernance, Intelligibilité & Qualité Éditoriale  
**Date d'arrêté :** 8 novembre 2026  
**Statut :** Registre de référence opérationnel & Procédure de contrôle continu  

---

## 1. Contexte et Objectifs du Registre

Conformément à la règle fondamentale du Lot 3H :
> **« Aucune donnée ne doit être présentée au public si son intitulé, sa signification, son unité, sa période ou son origine ne peuvent pas être correctement expliqués. »**

Ce document consigne :
1. L'inventaire contradictoire des anomalies détectées et résolues lors du Lot 3H.
2. Le registre des indicateurs et séries secondaires en réserve ou nécessitant un enrichissement méthodologique avant toute publication citoyenne.
3. Le protocole de contrôle qualité éditorial imposé à l'équipe de rédaction et aux administrateurs statistiques.

---

## 2. Anomalies Détectées et Traitements Opérés (Lot 3H)

| ID Anomalie | Domaine / Composant | Problème Constaté | Impact Citoyen | Action Correctrice Appliquée | Statut Post-Lot 3H |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **ANO-3H-01** | Partis Politiques (`partis-politiques.html`, `/api/parties`) | 119 partis fictifs issus de suites de tests de migration (`Parti Mig3_01`, etc.) visibles dans le catalogue public. | Perte totale de crédibilité démocratique ; confusion citoyenne. | Filtrage SQL strict dans `backend/routes/parties.js` (exclusion des slugs/noms de test) sans altération de l'intégrité de la BDD. | **RÉSOLU** (6 partis réels visibles) |
| **ANO-3H-02** | Représentation Parlementaire (`dossier.html`, `partis-politiques.html`) | Mention brute « 0 sièges » ou « N/A » pour le MRC et chefs de partis. | Incompréhension du boycott législatif de 2020 ; impression de bug d'affichage. | Formalisation contextuelle : affichage « Non représenté (boycott 2020) » et qualification des 10e Législature (152 RDPC, 7 UNDP, 5 SDF, 5 PCRN, 4 UDC). | **RÉSOLU** |
| **ANO-3H-03** | DATA Explorer (`data.html`, `js/data-explorer.js`) | Slugs techniques bruts (`count`, `milliards_fcfa`, `percentage`) affichés comme unités de mesure. | Illisibilité des ordres de grandeur pour le grand public. | Implémentation du résolveur `formatCitizenUnit()` traduisant les slugs en unités citoyennes complètes (`habitants`, `Milliards FCFA`, `électeurs inscrits`, etc.). | **RÉSOLU** |
| **ANO-3H-04** | Modale Indicateurs (`data-explorer.js`) | Absence de grille d'interprétation pour les citoyens néophytes (absence de définition de la formule, de l'origine et des limites). | Risque de mauvaise interprétation ou de défiance statistique. | Déploiement du module visuel **« Les 5 Repères Citoyens »** (Que mesure-t-il ? Que signifie le chiffre ? Quelle période ? Qui produit ? Quelles limites ?). | **RÉSOLU** |
| **ANO-3H-05** | Badges d'Audibilité (`data-explorer.js`) | Mention générique « Donnée certifiée » apposée indifféremment sur des projections ou estimations (ex: projections BUCREP 2026). | Risque juridique et déontologique de tromperie sur la nature statistique. | Remplacement par un affichage strict et honnête : `⚠️ Projection / Estimation` vs `✓ Donnée définitive` selon `methodology_nature`. | **RÉSOLU** |
| **ANO-3H-06** | Recherche Globale (`/api/search`) | Codes techniques bruts (`IND_MIG3_01`, `IND_1739...`) ou fiches tests renvoyés dans la recherche en-tête. | Pollution de l'expérience de navigation citoyenne. | Ajout de clauses de sanitisation regex (`di.code !~* '^(IND_MIG|IND_[0-9]{10,})'`) et formatage soigné du titre des résultats statistiques. | **RÉSOLU** |
| **ANO-3H-07** | Surveillance Continue | Absence de monitoring automatisé de la qualité éditoriale avant le Lot 3H. | Risque de réintroduction régressive d'anomalies lors des futurs imports. | Création du service centralisé `editorialQualityService.js` et de son interface de restitution dans le tableau de bord `admin.html`. | **RÉSOLU** |

---

## 3. Backlog des Indicateurs Secondaires à Enrichir (Vagues Suivantes)

Les indicateurs suivants sont actuellement conservés en base mais ne disposent pas encore de la documentation citoyenne complète (formules vulgarisées, limites contextuelles fines). Ils font l'objet d'un moratoire de publication jusqu'à complétion de leur notice :

| Code Indicateur | Nom de l'Indicateur | Producteur Primaire Prévu | Raison du Moratoire / Points à Documenter | Niveau de Priorité |
| :--- | :--- | :--- | :--- | :--- |
| `AGRI_PROD_CACAO` | Production Nationale de Cacao | MINADER / ONCC | Préciser la distinction entre production brute et tonnages exportés certifiés. | P2 |
| `AGRI_PROD_CAFE` | Production Nationale de Café | MINADER / ONCC | Spécifier la ventilation Arabica / Robusta pour éviter les confusions de cours. | P2 |
| `SANTE_LITS_HOP` | Densité de Lits Hospitaliers (pour 10 000 hab.) | MINSANTÉ / OMS | Harmoniser le périmètre : intégration ou non des centres de santé privés confessionnels. | P1 |
| `SANTE_MORT_INF` | Taux de Mortalité Infantile | INS / EDS-MICS | Documenter la périodicité quinquennale des enquêtes EDS pour justifier l'absence de série annuelle. | P1 |
| `ENERG_ACCES_ELEC` | Taux d'Accès à l'Électricité (% pop.) | MINEE / Eneo / Banque Mondiale | Préciser la disparité urbain/rural et le seuil minimal de desserte retenu. | P1 |
| `INFRA_ROUTES_BITUM` | Réseau Routier Bitumé (km) | MINTP | Distinguer les routes nationales, régionales et voiries urbaines dans les fiches méthodologiques. | P2 |
| `FIN_DETTE_PIB` | Ratio Dette Publique / PIB | CAA / MINEPAT | Préciser si la dette inclut la dette flottante et les arriérés intérieurs de l'État. | P1 |

---

## 4. Protocole de Validation Éditoriale Citoyenne (Gouvernance Continue)

Pour toute nouvelle observation ou tout nouvel indicateur soumis à publication sur Solitiquo DATA, l'équipe éditoriale et statistique doit obligatoirement valider la grille d'acceptation suivante :

```
[ ] RÈGLE 1 : CLARTÉ DU TITRE
    Le titre ne comporte aucun acronyme obscur non développé lors de sa première occurrence.

[ ] RÈGLE 2 : UNITÉ CITOYENNE EXPLICITE
    L'unité est intelligible pour un citoyen (ex: "habitants", "Milliards FCFA", "km²"), jamais un slug technique.

[ ] RÈGLE 3 : MATRICULE DOCUMENTAIRE OFFICIEL
    L'observation est adossée à une publication officielle archivée matériellement avec numéro de tableau et page vérifiés.

[ ] RÈGLE 4 : COMPLÉTION DES 5 REPÈRES CITOYENS
    - Question 1 (Mesure) : Définition vulgarisée et formule explicite.
    - Question 2 (Chiffre) : Interprétation concrète du chiffre actuel.
    - Question 3 (Période) : Millésime exact et statut (annuel, mensuel, recensement).
    - Question 4 (Producteur) : Nom de l'institution publique productrice (INS, ELECAM, BUCREP, etc.).
    - Question 5 (Réserves) : Précision des limites méthodologiques et marges d'incertitude.

[ ] RÈGLE 5 : HONNÊTETÉ DE LA NATURE STATISTIQUE
    Si l'observation est une projection ou une estimation, le badge "⚠️ Projection / Estimation" est obligatoire.
    L'intitulé "✓ Donnée définitive" est réservé aux chiffres audités et arrêtés par comptes officiels.
```

---

## 5. Suivi Technique & Audits Automatisés

Le contrôle de qualité éditoriale est désormais auditable à tout moment :
1. **Via l'API :** `GET /api/data/admin/quality-report` ou `GET /api/admin/quality-report`.
2. **Via l'administration :** Section « Contrôle Centralisé de Qualité Éditoriale & Intelligibilité Citoyenne » sur [admin.html](file:///d:/Downloads/SQ-main/admin.html).
3. **Via la suite de tests automatisés :** `tests/editorial_quality_lot3h.test.js` exécutée dans la suite globale d'intégration continue `scripts/run-all-data-tests.js`.

