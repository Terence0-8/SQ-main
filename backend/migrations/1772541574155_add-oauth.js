/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
    pgm.addColumns('users', {
        google_id: { type: 'varchar(255)', unique: true },
        facebook_id: { type: 'varchar(255)', unique: true },
        avatar_url: { type: 'text' }
    });

    // Rendre le mot de passe optionnel
    pgm.alterColumn('users', 'password', {
        notNull: false
    });
};

exports.down = pgm => {
    pgm.dropColumns('users', ['avatar_url', 'facebook_id', 'google_id']);

    pgm.alterColumn('users', 'password', {
        notNull: true
    });
};
