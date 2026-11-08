'use strict';

const db = require('../backend/config/database');

async function normalizeParties() {
  console.log('=== NORMALISATION DES PARTIS POLITIQUES CAMEROUNAIS ===');

  // 1. Mise à jour des partis existants
  // RDPC
  await db.query(`
    UPDATE parties SET
      type = 'majorite',
      seats_assembly = 152,
      creation_date = '1985',
      founded_year = 1985,
      ideology = 'Centre-Droit • Nationalisme • Panafricanisme',
      leader_name = 'Paul Biya',
      description = 'Fondé en 1985 à Bamenda, le Rassemblement Démocratique du Peuple Camerounais (RDPC) est le parti au pouvoir. Il détient la majorité absolue à l''Assemblée nationale (152 députés sur 180 lors de la 10e Législature) et promeut le renforcement de l''unité nationale et l''émergence économique.',
      title_en = 'Cameroon People''s Democratic Rally',
      description_en = 'Founded in 1985 in Bamenda, the CPDM is the ruling party holding the absolute majority in the National Assembly (152 out of 180 seats in the 10th Legislature).',
      updated_at = NOW()
    WHERE acronym = 'RDPC' OR id = 1
  `);
  console.log('✓ RDPC mis à jour (152 sièges, Majorité)');

  // UNDP
  await db.query(`
    UPDATE parties SET
      type = 'majorite',
      seats_assembly = 7,
      creation_date = '1990',
      founded_year = 1990,
      ideology = 'Centre • Libéral-Démocrate',
      leader_name = 'Bello Bouba Maïgari',
      description = 'Créée en 1990, l''Union Nationale pour la Démocratie et le Progrès (UNDP) est alliée à la majorité gouvernementale. Elle compte 7 députés à l''Assemblée nationale au cours de la 10e Législature et s''investit pour le développement territorial et la décentralisation.',
      title_en = 'National Union for Democracy and Progress',
      description_en = 'Formed in 1990, the UNDP is part of the government alliance and holds 7 seats in the National Assembly (10th Legislature).',
      updated_at = NOW()
    WHERE acronym = 'UNDP' OR id = 4
  `);
  console.log('✓ UNDP mis à jour (7 sièges, Majorité / Alliance)');

  // SDF
  await db.query(`
    UPDATE parties SET
      type = 'opposition',
      seats_assembly = 5,
      creation_date = '1990',
      founded_year = 1990,
      ideology = 'Social-Démocratie • Fédéralisme',
      leader_name = 'Joshua Osih',
      description = 'Fondé en 1990 à Bamenda par Ni John Fru Ndi, le Social Democratic Front (SDF) est une formation historique de l''opposition parlementaire camerounaise. Présidé par Joshua Osih, il détient 5 sièges à l''Assemblée nationale (10e Législature).',
      title_en = 'Social Democratic Front',
      description_en = 'Historic opposition party founded in 1990 in Bamenda. Chaired by Joshua Osih, holding 5 seats in the National Assembly (10th Legislature).',
      updated_at = NOW()
    WHERE acronym = 'SDF' OR id = 3
  `);
  console.log('✓ SDF mis à jour (5 sièges, Opposition)');

  // PCRN
  await db.query(`
    UPDATE parties SET
      type = 'opposition',
      seats_assembly = 5,
      creation_date = '2003',
      founded_year = 2003,
      ideology = 'Démocratie Républicaine • Renouveau Générationnel',
      leader_name = 'Cabral Libii',
      description = 'Dirigé par Cabral Libii, le Parti Camerounais pour la Réconciliation Nationale (PCRN) est représenté par 5 députés à l''Assemblée nationale (10e Législature). Il défend le renouvellement des politiques publiques, la protection sociale et la moralisation citoyenne.',
      title_en = 'Cameroon Party for National Reconciliation',
      description_en = 'Led by Cabral Libii, the PCRN represents a new generation of political engagement with 5 seats in the National Assembly (10th Legislature).',
      updated_at = NOW()
    WHERE acronym = 'PCRN' OR id = 5
  `);
  console.log('✓ PCRN mis à jour (5 sièges, Opposition)');

  // MRC (Correction essentielle : type = 'opposition', 0 sièges car boycott 2020)
  await db.query(`
    UPDATE parties SET
      type = 'opposition',
      seats_assembly = 0,
      creation_date = '2012',
      founded_year = 2012,
      ideology = 'Social-Libéralisme • État de Droit • Panafricanisme',
      leader_name = 'Maurice Kamto',
      description = 'Fondé en 2012 par le Pr. Maurice Kamto, le Mouvement pour la Renaissance du Cameroun (MRC) est l''un des principaux partis d''opposition du pays. Non représenté à l''Assemblée nationale suite à sa décision de boycott des élections législatives de 2020, il milite pour la réforme électorale et l''alternance démocratique.',
      title_en = 'Cameroon Renaissance Movement',
      description_en = 'Founded in 2012 by Pr. Maurice Kamto, the MRC is a prominent opposition movement. Not represented in the current legislature following the 2020 boycott, it advocates for electoral reform.',
      updated_at = NOW()
    WHERE acronym = 'MRC' OR id = 2
  `);
  console.log('✓ MRC mis à jour (0 sièges justifiés, Opposition)');

  // Insertion ou mise à jour de l'UDC
  const udcCheck = await db.query(`SELECT id FROM parties WHERE acronym = 'UDC'`);
  if (udcCheck.rows.length === 0) {
    await db.query(`
      INSERT INTO parties (
        name, acronym, leader_name, founded_year, creation_date, ideology,
        type, seats_assembly, description, title_en, description_en, is_active,
        created_at, updated_at
      ) VALUES (
        'Union Démocratique du Cameroun',
        'UDC',
        'Patricia Hermine Ndam Njoya',
        1991,
        '1991',
        'Démocratie Républicaine • Décentralisation Communautaire',
        'opposition',
        4,
        'Fondée en 1991 par le Dr. Adamou Ndam Njoya et aujourd''hui présidée par Patricia Hermine Ndam Njoya, l''Union Démocratique du Cameroun (UDC) compte 4 députés à l''Assemblée nationale (10e Législature) et porte des valeurs d''éthique politique et de décentralisation.',
        'Cameroon Democratic Union',
        'Founded in 1991 by Dr. Adamou Ndam Njoya, the UDC holds 4 seats in the National Assembly (10th Legislature).',
        true,
        NOW(),
        NOW()
      )
    `);
    console.log('✓ UDC inséré avec succès (4 sièges, Opposition)');
  } else {
    await db.query(`
      UPDATE parties SET
        name = 'Union Démocratique du Cameroun',
        leader_name = 'Patricia Hermine Ndam Njoya',
        founded_year = 1991,
        creation_date = '1991',
        ideology = 'Démocratie Républicaine • Décentralisation Communautaire',
        type = 'opposition',
        seats_assembly = 4,
        description = 'Fondée en 1991 par le Dr. Adamou Ndam Njoya et aujourd''hui présidée par Patricia Hermine Ndam Njoya, l''Union Démocratique du Cameroun (UDC) compte 4 députés à l''Assemblée nationale (10e Législature).',
        is_active = true,
        updated_at = NOW()
      WHERE acronym = 'UDC'
    `);
    console.log('✓ UDC mis à jour');
  }

  console.log('=== NORMALISATION PARTIS TERMINEE ===');
  process.exit(0);
}

normalizeParties().catch(err => {
  console.error('Erreur normalisation partis:', err);
  process.exit(1);
});

