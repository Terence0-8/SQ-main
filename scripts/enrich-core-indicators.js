'use strict';

const db = require('../backend/config/database');

async function enrichCoreIndicators() {
  console.log('=== ENRICHISSEMENT DES 6 INDICATEURS CLES ===');

  await db.query(`
    UPDATE data_indicators SET
      name = 'Population totale résidente du Cameroun',
      unit = 'habitants',
      producer_institution = 'Bureau Central des Recensements et des Études de Population (BUCREP) / INS',
      calculation_formula = 'Recensement général de la population et de l''habitat (RGPH) actualisé par les projections démographiques officielles par composantes (fécondité, mortalité, migrations nettes).',
      methodological_limitations = 'Dans l''attente de la publication intégrale du 4e RGPH, les chiffres annuels reposent sur les projections du 3e RGPH (2005) actualisées périodiquement par l''INS et le BUCREP.',
      updated_at = NOW()
    WHERE code = 'DEMO_POP_TOT'
  `);
  console.log('✓ DEMO_POP_TOT enrichi');

  await db.query(`
    UPDATE data_indicators SET
      name = 'Taux d''urbanisation de la population',
      unit = '%',
      producer_institution = 'Institut National de la Statistique (INS) / BUCREP',
      calculation_formula = '(Population résidente des localités urbaines de 5 000 habitants et plus disposant d''équipements collectifs / Population totale résidente) * 100',
      methodological_limitations = 'La délimitation des périmètres urbains combine des critères démographiques stricts et des décrets administratifs de création de communes urbaines.',
      updated_at = NOW()
    WHERE code = 'DEMO_POP_URBAN'
  `);
  console.log('✓ DEMO_POP_URBAN enrichi');

  await db.query(`
    UPDATE data_indicators SET
      name = 'Taux d''inflation annuel moyen (IHPC)',
      unit = '%',
      producer_institution = 'Institut National de la Statistique (INS)',
      calculation_formula = 'Variation moyenne annuelle de l''Indice Harmonisé des Prix à la Consommation (IHPC base 2011=100) calculé selon la méthodologie harmonisée d''AFRISTAT.',
      methodological_limitations = 'Le panier de la ménagère est calculé principalement dans les métropoles régionales chefs-lieux ; l''impact des zones rurales est appréhendé par les flux d''approvisionnement.',
      updated_at = NOW()
    WHERE code = 'ECO_INFLATION'
  `);
  console.log('✓ ECO_INFLATION enrichi');

  await db.query(`
    UPDATE data_indicators SET
      name = 'Taux d''alphabétisation des adultes (15 ans et plus)',
      unit = '%',
      producer_institution = 'Institut National de la Statistique (INS) / UNESCO-ISU',
      calculation_formula = '(Nombre de personnes âgées de 15 ans et plus sachant lire et écrire en français, anglais ou langue nationale / Population totale des 15 ans et plus) * 100',
      methodological_limitations = 'Indicateur issu des enquêtes lourdes auprès des ménages (ECAM, EDS) avec un cycle de collecte pluriannuel (4 à 5 ans).',
      updated_at = NOW()
    WHERE code = 'EDUC_ALPHABET'
  `);
  console.log('✓ EDUC_ALPHABET enrichi');

  await db.query(`
    UPDATE data_indicators SET
      name = 'Électeurs inscrits sur les listes électorales nationales',
      unit = 'électeurs inscrits',
      producer_institution = 'Elections Cameroon (ELECAM)',
      calculation_formula = 'Effectif cumulé des citoyens inscrits sur le fichier électoral biométrique national au terme de la campagne annuelle de révision (au 31 août ou 31 décembre).',
      methodological_limitations = 'L''apurement du fichier électoral pour cause de décès ou déchéance civique est progressif et tributaire des déclarations d''état civil.',
      updated_at = NOW()
    WHERE code = 'ELEC_REGISTERED'
  `);
  console.log('✓ ELEC_REGISTERED enrichi');

  await db.query(`
    UPDATE data_indicators SET
      name = 'Nombre d''incidents sécuritaires répertoriés',
      unit = 'incidents répertoriés',
      producer_institution = 'ACLED / Cellules d''analyse sécuritaire',
      calculation_formula = 'Comptage des événements violents géolocalisés (affrontements armés, attaques contre des civils, explosions et émeutes) vérifiés par sources croisées.',
      methodological_limitations = 'La collecte est soumise aux contraintes de remontée des données dans les zones d''accès difficile ou isolées des réseaux de communication.',
      updated_at = NOW()
    WHERE code = 'SEC_INCIDENTS'
  `);
  console.log('✓ SEC_INCIDENTS enrichi');

  console.log('=== ENRICHISSEMENT TERMINE ===');
  process.exit(0);
}

enrichCoreIndicators().catch(err => {
  console.error(err);
  process.exit(1);
});

