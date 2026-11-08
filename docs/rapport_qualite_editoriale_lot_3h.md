# RAPPORT DE QUALITÉ ÉDITORIALE ET D'ISOLATION DES DONNÉES (LOT 3H)

**Plateforme :** Solitiquo & Solitiquo DATA  
**Date :** 8 novembre 2026  
**Statut Global de Contrôle :** `CONFORME_PRODUCTION`  
**Score de Qualité Éditoriale Centralisé :** `95 / 100`  
**Anomalies Bloquantes :** `0`

---

## 1. PRINCIPES DIRECTEURS DE LA RÉVISION ÉDITORIALE

Le Lot 3H applique sans concession le principe fondamental de Solitiquo :

> **« Aucune donnée ne doit être présentée au public si son intitulé, sa signification, son unité, sa période ou son origine ne peuvent pas être correctement expliqués. »**

Cet impératif implique trois règles absolues :
1. **Étancheité de l'Annuaire Public :** Aucune entité de test, de migration technique ou incomplète n'est tolérée dans les flux de consultation citoyenne.
2. **Vulgarisation Statistique Rigoureuse :** Remplacement systématique du jargon technique de base de données par des concepts clairs, contextualisés et loyaux.
3. **Vérité Épistémologique des Preuves :** Interdiction d'utiliser le terme "certifié" pour qualifier des projections ou estimations non clôturées.

---

## 2. RÉSULTATS DU MODULE CENTRALISÉ DE CONTRÔLE DE QUALITÉ

Le module centralisé `backend/services/editorialQualityService.js`, accessible via l'API `GET /api/data/admin/quality-report` et intégré au tableau de bord administrateur (`admin.html`), produit l'audit d'intégrité suivant :

### 2.1. Indicateurs Synthétiques

- **Formations politiques publiques auditées :** 6 (100% conformes)
- **Indicateurs statistiques publics exposés :** 52 (100% pourvus d'unités citoyennes et de repères complets)
- **Observations statistiques publiées actives :** 178 (100% rattachées à une source primaire reconnue)
- **Observations historiques sanctuarisées (#260, #261, #262, #323) :** 4/4 conformes, publiées et actives
- **Observations pilotes Vague 1 (#687 à #710) :** 24/24 strictement en brouillon, inactives et en arbitrage pendant
- **Résidus de test dans articles/podcasts/émissions :** 0

### 2.2. Points de Conformité Validés

1. **Annuaire des partis politiques (`partis-politiques.html`) :**
   - RDPC : Paul Biya, 152 sièges à l'Assemblée Nationale (10e Législature), statut Majorité.
   - MRC : Maurice Kamto, 0 siège (justification constitutionnelle du boycott 2020), statut Opposition.
   - SDF : Joshua Osih, 5 sièges, statut Opposition.
   - UNDP : Bello Bouba Maïgari, 7 sièges, statut Majorité (Alliance).
   - PCRN : Cabral Libii, 5 sièges, statut Opposition.
   - UDC : Patricia Hermine Ndam Njoya, 4 sièges, statut Opposition.
   - *Total sièges représentés vérifié :* 173 députés sur les 180 de l'Assemblée nationale documentés à travers les formations actives.
   - *Suppression des valeurs "0" et "N/A" non commentées :* L'affichage mentionne désormais clairement le contexte parlementaire.

2. **Dictionnaire des unités statistiques citoyennes :**
   - Remplacement de l'unité informatique `count` par `habitants` ou `électeurs inscrits`.
   - Remplacement de `milliards_fcfa` par `Milliards FCFA`.
   - Remplacement de `pourcentage_pib` par `% du PIB`.
   - Remplacement de `score_sur_100` par `points / 100`.
   - Remplacement de `tonnes_co2e_par_hab` par `t CO2e / hab.`.

3. **Intégration du Module des 5 Repères Citoyens dans les fiches :**
   - Chaque fiche d'indicateur de `data-explorer.js` structure la réponse aux 5 questions citoyennes :
     1. Que mesure cet indicateur ?
     2. Que signifie le chiffre affiché ?
     3. Sur quelle période porte-t-il ?
     4. Qui a produit cette information ?
     5. Quelles sont ses limites ou réserves méthodologiques ?

4. **Transparence des qualifications de badges :**
   - *Donnée définitive :* Comptes nationaux clos, recensements ou registres validés.
   - *Donnée provisoire / semi-définitive :* Comptes économiques révisables.
   - *Projection / Estimation :* Modèles démographiques ou cadrages macroéconomiques.

---

## 3. TABLEAU RÉCAPITULATIF DES ISOLATIONS TECHNIQUES

| Entités en Base | Volume Total | Volume Public Exposé | Traitement Appliqué |
|---|---|---|---|
| **Partis politiques (`parties`)** | 124 | 6 | 118 partis de test (`Parti Mig3`, `Parti Breakdown`) conservés en base pour l'historique et les tests techniques, mais **strictement filtrés à la source** des requêtes publiques. |
| **Indicateurs (`data_indicators`)** | 558 | 52 | 506 indicateurs de test (`IND_MIG`, `IND_TEST`, `IND_1793...`) masqués des catalogues et explorateurs publics. |
| **Observations (`data_values`)** | 710+ | 178 | Seules les données validées et publiées (`editorial_status = 'published' AND is_active = TRUE`) sont requêtables. Confinement hermétique des 24 pilotes (#687 à #710). |

---

## 4. DÉCISION DE CERTIFICATION ÉDITORIALE

Le comité éditorial et statistique valide formellement la conformité du Lot 3H :
- L'expérience citoyenne est expurgée de tout résidu informatique.
- Les données diffusées sont compréhensibles, fiables, contextualisées et respectueuses des institutions de la République du Cameroun.
- L'intégrité historique et les preuves documentaires accumulées lors des lots 3E.3.1 à 3E.3.5 sont scrupuleusement préservées.

