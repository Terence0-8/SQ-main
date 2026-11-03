/**
 * SOLITIQUO DATA — MIGRATION 7 (LOT 3C.3)
 * Validation humaine et documentaire des observations :
 * 1. Extension des décisions d'audit autorisées :
 *    - 'pending' : En attente d'examen
 *    - 'accepted' : Audit accepté
 *    - 'rejected' : Audit refusé (motif obligatoire)
 *    - 'correction_requested' : Demande de correction (motif obligatoire)
 *    - 'pending_evidence' : Maintien en attente faute de preuve suffisante (pièce justificative demandée)
 * 2. Ajout des colonnes de pièces justificatives :
 *    - audit_evidence_url (lien ou URL vers la pièce justificative)
 *    - audit_evidence_reference (référence bibliographique ou administrative de la pièce)
 */

'use strict';

exports.up = (pgm) => {
  // 1. Ajouter les colonnes de pièces justificatives si elles n'existent pas
  pgm.sql(`
    ALTER TABLE data_values
    ADD COLUMN IF NOT EXISTS audit_evidence_url TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS audit_evidence_reference TEXT DEFAULT NULL;
  `);

  // 2. Mettre à jour la contrainte CHECK sur audit_decision
  pgm.sql(`
    DO $$
    DECLARE
      chk_name RECORD;
    BEGIN
      -- Rechercher et supprimer la contrainte existante sur audit_decision
      FOR chk_name IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'data_values'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%audit_decision%'
      LOOP
        EXECUTE 'ALTER TABLE data_values DROP CONSTRAINT ' || quote_ident(chk_name.conname);
      END LOOP;
    END $$;

    ALTER TABLE data_values
    ADD CONSTRAINT chk_data_values_audit_decision
    CHECK (audit_decision IN ('pending', 'accepted', 'rejected', 'correction_requested', 'pending_evidence'));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DO $$
    DECLARE
      chk_name RECORD;
    BEGIN
      FOR chk_name IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'data_values'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%audit_decision%'
      LOOP
        EXECUTE 'ALTER TABLE data_values DROP CONSTRAINT ' || quote_ident(chk_name.conname);
      END LOOP;
    END $$;

    ALTER TABLE data_values
    ADD CONSTRAINT chk_data_values_audit_decision
    CHECK (audit_decision IN ('pending', 'accepted', 'rejected'));

    ALTER TABLE data_values
    DROP COLUMN IF EXISTS audit_evidence_url,
    DROP COLUMN IF EXISTS audit_evidence_reference;
  `);
};
