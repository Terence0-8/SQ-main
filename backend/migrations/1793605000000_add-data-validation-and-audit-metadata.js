/**
 * SOLITIQUO DATA — MIGRATION 6 (LOT 3C.2)
 * Préparation à la validation éditoriale et méthodologique :
 * 1. Ajout des colonnes de qualification méthodologique et d'audit sur data_values :
 *    - audit_status (confirmed, confirmed_with_caveat, unverified, discrepancy, rejected)
 *    - audit_caveat (réserves méthodologiques spécifiques identifiées)
 *    - survey_or_account_status (statut des comptes ou de l'enquête : définitif, semi-définitif, etc.)
 *    - school_year (année scolaire exacte pour les données éducatives)
 *    - audit_decision (pending, accepted, rejected)
 *    - audit_decision_by, audit_decision_at, audit_decision_notes
 * 2. Qualification des 24 observations pilotes (Lot 3C.1 audit) tout en les maintenant impérativement en 'draft'.
 */

'use strict';

exports.up = (pgm) => {
  // 1. Colonnes de qualification méthodologique et d'audit
  pgm.sql(`
    ALTER TABLE data_values
    ADD COLUMN IF NOT EXISTS audit_status VARCHAR(50) DEFAULT NULL CHECK (
      audit_status IN ('confirmed', 'confirmed_with_caveat', 'unverified', 'discrepancy', 'rejected')
    ),
    ADD COLUMN IF NOT EXISTS audit_caveat TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS survey_or_account_status VARCHAR(150) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS school_year VARCHAR(50) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS audit_decision VARCHAR(50) DEFAULT 'pending' CHECK (
      audit_decision IN ('pending', 'accepted', 'rejected')
    ),
    ADD COLUMN IF NOT EXISTS audit_decision_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS audit_decision_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS audit_decision_notes TEXT DEFAULT NULL;
  `);

  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_data_values_audit_status ON data_values(audit_status);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_data_values_audit_decision ON data_values(audit_decision);`);

  // 2. Initialisation des 24 observations pilotes du Lot 3C (IDs 687 à 710)
  // Toutes demeurent STRICTEMENT en statut 'draft'

  // Série 1 : Population (POP_TOT_COUNT) - 6 observations (2018-2023) -> confirmed_with_caveat
  pgm.sql(`
    UPDATE data_values
    SET audit_status = 'confirmed_with_caveat',
        survey_or_account_status = 'Projection démographique officielle (BUCREP, post-RGPH 3)',
        audit_caveat = 'Projection démographique basée sur le RGPH-3 de 2005. Donnée extrapolée sujette aux arrondis statistiques et à une révision formelle lors de la publication du RGPH-4.'
    WHERE id BETWEEN 687 AND 692;
  `);

  // Série 2 : PIB nominal (ECO_PIB_NOM) - 5 observations (2018-2022)
  // 2018-2021 (693-696) -> confirmed (Comptes définitifs)
  pgm.sql(`
    UPDATE data_values
    SET audit_status = 'confirmed',
        survey_or_account_status = 'Comptes définitifs (SCN 2008, base 2016, prix courants)',
        audit_caveat = 'Comptes nationaux définitifs consolidés aux prix courants en milliards FCFA.'
    WHERE id BETWEEN 693 AND 696;
  `);
  // 2022 (697) -> confirmed_with_caveat (Comptes semi-définitifs)
  pgm.sql(`
    UPDATE data_values
    SET audit_status = 'confirmed_with_caveat',
        survey_or_account_status = 'Comptes semi-définitifs (SCN 2008, base 2016, prix courants)',
        audit_caveat = 'Résultat semi-définitif pour 2022, sujet à calage définitif ultérieur par l''INS.'
    WHERE id = 697;
  `);

  // Série 3 : Croissance du PIB réel (ECO_PIB_GROWTH) - 5 observations (2018-2022)
  // 2018-2021 (698-701) -> confirmed (Comptes définitifs en volume)
  pgm.sql(`
    UPDATE data_values
    SET audit_status = 'confirmed',
        survey_or_account_status = 'Comptes définitifs en volume (SCN 2008, base 2016)',
        audit_caveat = 'Taux de croissance annuel réel en volume aux prix de l''année précédente chaînés (base 2016, SCN 2008).'
    WHERE id BETWEEN 698 AND 701;
  `);
  // 2022 (702) -> confirmed_with_caveat (Comptes semi-définitifs en volume)
  pgm.sql(`
    UPDATE data_values
    SET audit_status = 'confirmed_with_caveat',
        survey_or_account_status = 'Comptes semi-définitifs en volume (SCN 2008, base 2016)',
        audit_caveat = 'Taux de croissance réel en volume au statut semi-définitif pour 2022, susceptible d''ajustement lors de l''établissement des comptes définitifs.'
    WHERE id = 702;
  `);

  // Série 4 : Chômage au sens élargi (LAB_UNEMP_RATE) - 3 observations (2010, 2014, 2021) -> confirmed_with_caveat
  // 703 (2010 - EESI 2)
  pgm.sql(`
    UPDATE data_values
    SET audit_status = 'confirmed_with_caveat',
        survey_or_account_status = 'Enquête EESI 2 (INS 2011) — Tranche 15 ans et plus',
        audit_caveat = 'Rupture méthodologique : Enquête dédiée à l''emploi et au secteur informel. Population cible : 15 ans et plus. Série discontinue : interdiction stricte de toute interpolation linéaire avec les enquêtes auprès des ménages.'
    WHERE id = 703;
  `);
  // 704 (2014 - ECAM 4)
  pgm.sql(`
    UPDATE data_values
    SET audit_status = 'confirmed_with_caveat',
        survey_or_account_status = 'Enquête ECAM 4 (INS 2015) — Tranche 15-64 ans',
        audit_caveat = 'Rupture méthodologique : Enquête auprès des ménages (ECAM 4). Population cible : 15 à 64 ans. Non directement comparable avec l''enquête EESI 2 en raison des différences de méthodologie de sondage et de champ d''âge.'
    WHERE id = 704;
  `);
  // 705 (2021 - ECAM 5)
  pgm.sql(`
    UPDATE data_values
    SET audit_status = 'confirmed_with_caveat',
        survey_or_account_status = 'Enquête ECAM 5 (INS 2024) — Tranche 15-64 ans',
        audit_caveat = 'Rupture méthodologique : Cinquième enquête ménages (ECAM 5). Population cible : 15 à 64 ans. Série discontinue interdisant toute interpolation linéaire.'
    WHERE id = 705;
  `);

  // Série 5 : Scolarisation primaire TBS (EDU_PRIM_GROSS) - 5 observations (2018-2022) -> confirmed
  pgm.sql(`
    UPDATE data_values
    SET audit_status = 'confirmed',
        survey_or_account_status = 'Recensement scolaire administratif (INS / MINEDUB)',
        school_year = '2018/2019',
        audit_caveat = 'Année scolaire 2018/2019. TBS primaire : 106.8%. Le taux dépasse 100% en raison des inscriptions d''enfants hors tranche d''âge théorique (6-11 ans) et d''un taux significatif de redoublements.'
    WHERE id = 706;
  `);
  pgm.sql(`
    UPDATE data_values
    SET audit_status = 'confirmed',
        survey_or_account_status = 'Recensement scolaire administratif (INS / MINEDUB)',
        school_year = '2019/2020',
        audit_caveat = 'Année scolaire 2019/2020. TBS primaire : 105.2%. Le taux dépasse 100% en raison des inscriptions hors tranche d''âge (6-11 ans) et des redoublements.'
    WHERE id = 707;
  `);
  pgm.sql(`
    UPDATE data_values
    SET audit_status = 'confirmed',
        survey_or_account_status = 'Recensement scolaire administratif (INS / MINEDUB)',
        school_year = '2020/2021',
        audit_caveat = 'Année scolaire 2020/2021. TBS primaire : 104.1%. Le taux dépasse 100% en raison des scolarisations hors tranche d''âge (6-11 ans) et des redoublements.'
    WHERE id = 708;
  `);
  pgm.sql(`
    UPDATE data_values
    SET audit_status = 'confirmed',
        survey_or_account_status = 'Recensement scolaire administratif (INS / MINEDUB)',
        school_year = '2021/2022',
        audit_caveat = 'Année scolaire 2021/2022. TBS primaire : 105.7%. Le taux dépasse 100% en raison des scolarisations hors tranche d''âge (6-11 ans) et des redoublements.'
    WHERE id = 709;
  `);
  pgm.sql(`
    UPDATE data_values
    SET audit_status = 'confirmed',
        survey_or_account_status = 'Annuaire Statistique Éducation de Base (MINEDUB)',
        school_year = '2022/2023',
        audit_caveat = 'Année scolaire 2022/2023. TBS primaire : 107.3%. Le taux dépasse 100% en raison des entrées précoces, tardives et des redoublements scolaires.'
    WHERE id = 710;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE data_values
    DROP COLUMN IF EXISTS audit_status,
    DROP COLUMN IF EXISTS audit_caveat,
    DROP COLUMN IF EXISTS survey_or_account_status,
    DROP COLUMN IF EXISTS school_year,
    DROP COLUMN IF EXISTS audit_decision,
    DROP COLUMN IF EXISTS audit_decision_by,
    DROP COLUMN IF EXISTS audit_decision_at,
    DROP COLUMN IF EXISTS audit_decision_notes;
  `);
};
