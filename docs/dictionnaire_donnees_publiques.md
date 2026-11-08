# DICTIONNAIRE CITOYEN DES DONNÉES PUBLIQUES (LOT 3H)

**Plateforme :** Solitiquo DATA  
**Date d'homologation :** 8 novembre 2026  
**Cadre réglementaire de référence :** Loi N° 2020/010 du 20 juillet 2020 régissant l'activité statistique au Cameroun.

---

## 1. PRINCIPES DE NORMALISATION LEXICALE

Pour garantir l'intelligibilité citoyenne, toute information présentée au public sur Solitiquo DATA est traduite selon les équivalences suivantes :

| Terme Informatique / Brut | Unité Citoyenne Solitiquo | Définition Vulgarisée |
|---|---|---|
| `count` (sur effectifs humains) | `habitants` | Nombre d'individus résidant sur le territoire. |
| `count` (sur fichier électoral) | `électeurs inscrits` | Citoyens camerounais majeurs inscrits sur les listes biométriques d'ELECAM. |
| `count` (sur incidents sécuritaires) | `incidents répertoriés` | Événements géolocalisés de violences armées ou affrontements vérifiés. |
| `milliards_fcfa` | `Milliards FCFA` | Milliards de Francs CFA (XAF), valeur monétaire totale. |
| `pourcentage_pib` | `% du PIB` | Proportion par rapport à la taille globale de l'économie camerounaise. |
| `pourcentage` / `pourcent` | `%` | Ratio exprimé pour 100 unités de la population de référence. |
| `kilometres_carres` / `km2` | `km²` | Superficie géographique en kilomètres carrés. |
| `score_sur_100` | `points / 100` | Échelle d'évaluation standardisée de 0 à 100 points. |
| `tonnes_co2e_par_hab` | `t CO2e / hab.` | Tonnes équivalent CO2 émises en moyenne par personne par an. |
| `habitants/km²` | `hab./km²` | Densité d'occupation spatiale moyenne. |

---

## 2. CATALOGUE DES GRANDS INDICATEURS STATISTIQUES CITOYENS

### 2.1. Démographie & Territoires

#### 1. Population totale résidente (`DEMO_POP_TOT` / `POP_TOT_COUNT`)
- **Que mesure cet indicateur ?** L'effectif global des personnes de nationalité camerounaise et étrangère résidant de manière habituelle sur le territoire camerounais.
- **Interprétation du chiffre :** Repère officiel d'environ 28 à 29 millions d'habitants. Il permet de dimensionner les besoins en infrastructures (écoles, hôpitaux, eau, électricité).
- **Périodicité :** Annuelle (au 1er juillet ou 31 décembre).
- **Institution productrice :** Bureau Central des Recensements et des Études de Population (BUCREP) & Institut National de la Statistique (INS).
- **Limites méthodologiques :** Dans l'attente des résultats finaux du 4e RGPH, les chiffres annuels reposent sur le modèle de projection démographique par composantes (accroissement naturel et flux migratoires) calé sur le 3e RGPH de 2005.

#### 2. Densité moyenne de population (`POP_DENS_KM2`)
- **Que mesure cet indicateur ?** Le rapport entre la population totale et la superficie terrestre du pays (475 650 km²).
- **Interprétation :** Mesure la concentration humaine dans l'espace (environ 60 hab./km² au niveau national, mais avec de fortes disparités entre les régions forestières et les grands centres urbains de Douala et Yaoundé).
- **Producteur :** INS / BUCREP.

---

### 2.2. Économie & Finances Publiques

#### 3. Produit Intérieur Brut nominal aux prix courants (`ECO_PIB_NOM`)
- **Que mesure cet indicateur ?** La richesse économique globale créée sur le territoire camerounais au cours d'une année civile donnée, évaluée aux prix réels du marché.
- **Interprétation du chiffre :** Exprimé en Milliards de FCFA (ex. 29 850 Mrds FCFA en 2021). Il s'agit de la somme des valeurs ajoutées générées par l'ensemble des branches d'activité (agriculture, industrie, services) majorée des taxes et nette des subventions.
- **Périodicité :** Annuelle.
- **Institution productrice :** Institut National de la Statistique (INS), Direction des Comptes Nationaux.
- **Limites méthodologiques :** Les comptes font l'objet d'un cycle de consolidation légal en trois temps : *provisoires* (année N+1), *semi-définitifs* (N+2) et *définitifs* (N+3). La part du secteur informel est estimée par sondages périodiques (enquêtes EESI).

#### 4. Encours total de la dette publique (`ECO_DEBT_RATIO`)
- **Que mesure cet indicateur ?** Le poids de l'ensemble des emprunts contractés par l'État camerounais (dette extérieure auprès des bailleurs bilatéraux/multilatéraux et dette intérieure sous forme de titres du Trésor) rapporté au PIB.
- **Interprétation :** Exprimé en `% du PIB` (norme de convergence communautaire CEMAC plafonnée à 70% du PIB).
- **Producteur :** Caisse Autonome d'Amortissement (CAA) & Ministère des Finances (MINFI).

---

### 2.3. Élections & Vie Politique

#### 5. Électeurs inscrits sur les listes électorales nationales (`ELEC_REGISTERED`)
- **Que mesure cet indicateur ?** Le nombre total de citoyens camerounais âgés de 20 ans révolus inscrits sur le fichier électoral national biométrique.
- **Interprétation :** Repère de la base citoyenne appelée à voter lors des scrutins nationaux (présidentielle, législatives, municipales).
- **Producteur :** Elections Cameroon (ELECAM).
- **Limites méthodologiques :** Consolidation annuelle arrêtée au 31 août ou au 31 décembre de chaque année.

#### 6. Représentation à l'Assemblée Nationale (Formations Politiques)
- **Que mesure cet indicateur ?** La répartition des 180 sièges de députés issus des élections législatives de la 10e Législature (2020-2025).
- **Règle citoyenne Solitiquo :**
  - Si un parti détient des sièges : affichage explicite sous la forme `X députés (10e Législature)`.
  - Si un parti n'a aucun député par boycott électoral documenté (ex. MRC en 2020) : affichage sous la forme `0 siège (Non représenté - boycott des législatives 2020)`.
  - Ne jamais afficher un "0" sans explication ou un "N/A" non documenté.

---

## 3. TYPOLOGIE DES BADGES DE PREUVE MÉTHODOLOGIQUE

| Badge Affiché | Couleur | Signification Épistémologique | Critère d'Attribution |
|---|---|---|---|
| **✓ Donnée définitive** | Vert `#15803d` | Donnée issue de comptes nationaux définitifs, d'un recensement exhaustif ou d'un registre d'état civil clos. | Comptes nationaux définitifs INS ou résultats électoraux définitifs validés par le Conseil Constitutionnel. |
| **Donnée provisoire / semi-définitive** | Bleu / Gris | Chiffre économique ou statistique officiel susceptible d'ajustements lors de l'exercice budgétaire ultérieur. | Comptes nationaux semi-définitifs publiés par l'INS. |
| **⚠️ Projection / Estimation** | Orange `#d97706` | Résultat d'un modèle statistique prévisionnel ou d'un cadrage macroéconomique. | Projections démographiques BUCREP ou estimations infra-annuelles. **Interdiction absolue d'attribuer le badge "certifiée"**. |
| **Donnée administrative** | Gris ardoise | Comptage issu d'un registre sectoriel ministériel ou administratif. | Rentrées scolaires MINEDUB, fichier biométrique ELECAM. |

