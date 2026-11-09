/**
 * SOLITIQUO DATA — MIGRATION 11 (LOT 3E.2.1)
 * Correction des incohérences documentaires et sécurisation des statuts :
 * 1. Élargissement de la contrainte CHECK sur data_publications.verification_status
 *    pour intégrer les statuts 'institutional_reference_only' et 'unavailable'.
 * 2. Correction des 7 publications du corpus pilote :
 *    - Suppression des fausses dates de consultation (consultation_date = NULL).
 *    - Alignement de verification_status avec data_document_evidence :
 *      * ID 2 (Comptes Nationaux) et ID 72 (ECAM 4) -> 'institutional_reference_only'
 *      * ID 1 (Annuaire INS), ID 4 (EESI 2), ID 6 (ECAM 5), ID 8 (BUCREP), ID 12 (MINEDUB) -> 'unavailable'
 * 3. Réversibilité intégrale via exports.down.
 */

'use strict';

exports.up = (pgm) => {
  // 1. Élargir la contrainte CHECK sur verification_status dans data_publications
  pgm.sql(`
    ALTER TABLE data_publications
      DROP CONSTRAINT IF EXISTS data_publications_verification_status_check;

    ALTER TABLE data_publications
      ADD CONSTRAINT data_publications_verification_status_check
      CHECK (verification_status IN (
        'verified_consulted',
        'identified_unconsulted',
        'potential_to_search',
        'unavailable_or_broken',
        'institutional_reference_only',
        'unavailable'
      ));
  `);

  // 2. Mettre à jour les 7 publications du corpus pilote vers leurs statuts honnêtes
  //    et purger les dates de consultation fictives.
  pgm.sql(`
    -- Publications en référence institutionnelle uniquement (pages portails HTML sans PDF original direct)
    UPDATE data_publications
    SET verification_status = 'institutional_reference_only',
        consultation_date = NULL,
        updated_at = NOW()
    WHERE LOWER(TRIM(title)) IN (
      LOWER('Comptes Nationaux du Cameroun — Résultats définitifs 2021 et semi-définitifs 2022'),
      LOWER('Quatrième Enquête Camerounaise auprès des Ménages (ECAM 4) — Rapport Emploi')
    ) OR id IN (2, 72);

    -- Publications indisponibles (serveurs en timeout, DNS en échec, certificat TLS invalide)
    UPDATE data_publications
    SET verification_status = 'unavailable',
        consultation_date = NULL,
        updated_at = NOW()
    WHERE LOWER(TRIM(title)) IN (
      LOWER('Annuaire Statistique du Cameroun — Édition 2023'),
      LOWER('Deuxième Enquête sur l''Emploi et le Secteur Informel (EESI 2) — Rapport Principal'),
      LOWER('Cinquième Enquête Camerounaise auprès des Ménages (ECAM 5) — Rapport sur la Pauvreté'),
      LOWER('Perspectives Démographiques du Cameroun 2010-2035 — Actualisation post-RGPH 3'),
      LOWER('Annuaire Statistique de l''Éducation de Base — Année scolaire 2022/2023')
    ) OR id IN (1, 4, 6, 8, 12);
  `);
};

exports.down = (pgm) => {
  // Rétablir le statut antérieur 'verified_consulted' (statut historique avant Lot 3E.2.1)
  pgm.sql(`
    UPDATE data_publications
    SET verification_status = 'verified_consulted',
        consultation_date = '2026-03-01',
        updated_at = NOW()
    WHERE LOWER(TRIM(title)) IN (
      LOWER('Comptes Nationaux du Cameroun — Résultats définitifs 2021 et semi-définitifs 2022'),
      LOWER('Quatrième Enquête Camerounaise auprès des Ménages (ECAM 4) — Rapport Emploi'),
      LOWER('Annuaire Statistique du Cameroun — Édition 2023'),
      LOWER('Deuxième Enquête sur l''Emploi et le Secteur Informel (EESI 2) — Rapport Principal'),
      LOWER('Cinquième Enquête Camerounaise auprès des Ménages (ECAM 5) — Rapport sur la Pauvreté'),
      LOWER('Perspectives Démographiques du Cameroun 2010-2035 — Actualisation post-RGPH 3'),
      LOWER('Annuaire Statistique de l''Éducation de Base — Année scolaire 2022/2023')
    ) OR id IN (1, 2, 4, 6, 8, 12, 72);

    ALTER TABLE data_publications
      DROP CONSTRAINT IF EXISTS data_publications_verification_status_check;

    ALTER TABLE data_publications
      ADD CONSTRAINT data_publications_verification_status_check
      CHECK (verification_status IN (
        'verified_consulted',
        'identified_unconsulted',
        'potential_to_search',
        'unavailable_or_broken'
      ));
  `);
};

