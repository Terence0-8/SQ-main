/**
 * SOLITIQUO DATA — MIGRATION 8 (LOT 3C.4)
 * Fiabilisation de la qualification documentaire :
 * 1. Suppression de la contrainte NOT NULL sur documentary_tier de data_value_sources
 *    pour permettre la conservation d'une source rattachée à l'état 'non qualifiée'.
 * 2. Suppression de la valeur par défaut automatique 'high' sur methodological_robustness.
 * 3. Suppression de la contrainte NOT NULL sur citation_reference pour permettre
 *    d'enregistrer une source institutionnelle avant consultation documentaire effective.
 */

'use strict';

exports.up = (pgm) => {
  pgm.sql(`
    -- 1. documentary_tier nullable pour état non qualifié
    ALTER TABLE data_value_sources 
    ALTER COLUMN documentary_tier DROP NOT NULL;

    -- 2. Suppression de la valeur par défaut automatique 'high'
    ALTER TABLE data_value_sources 
    ALTER COLUMN methodological_robustness DROP DEFAULT;

    -- 3. citation_reference nullable pour source sans document encore consulté
    ALTER TABLE data_value_sources 
    ALTER COLUMN citation_reference DROP NOT NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    -- Remise en état antérieure réversible
    UPDATE data_value_sources 
    SET documentary_tier = 'TIER_5_SECONDARY_PRESS' 
    WHERE documentary_tier IS NULL;

    ALTER TABLE data_value_sources 
    ALTER COLUMN documentary_tier SET NOT NULL;

    ALTER TABLE data_value_sources 
    ALTER COLUMN methodological_robustness SET DEFAULT 'high';

    UPDATE data_value_sources 
    SET citation_reference = 'Référence documentaire à préciser' 
    WHERE citation_reference IS NULL;

    ALTER TABLE data_value_sources 
    ALTER COLUMN citation_reference SET NOT NULL;
  `);
};

