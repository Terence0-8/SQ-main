/**
 * SOLITIQUO — MIGRATION 24
 * Attribution du rôle 'admin' au compte Terence (terencepouhekaa@gmail.com / Terence0123 / Terence0)
 */

exports.up = (pgm) => {
  pgm.sql(`
    UPDATE users
    SET role = 'admin', updated_at = NOW()
    WHERE LOWER(email) = 'terencepouhekaa@gmail.com'
       OR LOWER(username) IN ('terence0123', 'terence0');
  `);
};

exports.down = (_pgm) => {
  // Pas de rollback nécessaire
};
