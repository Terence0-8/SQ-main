

exports.shorthands = undefined;

exports.up = pgm => {
    pgm.sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id varchar(255)`);
    pgm.sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_id varchar(255)`);
    pgm.sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text`);
    pgm.sql(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_google_id_key') THEN
        ALTER TABLE users ADD CONSTRAINT users_google_id_key UNIQUE (google_id);
      END IF;
    END $$`);
    pgm.sql(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_facebook_id_key') THEN
        ALTER TABLE users ADD CONSTRAINT users_facebook_id_key UNIQUE (facebook_id);
      END IF;
    END $$`);
    // Rendre le mot de passe optionnel (idempotent — DROP NOT NULL sur une colonne déjà nullable est sans effet)
    pgm.sql(`ALTER TABLE users ALTER COLUMN password DROP NOT NULL`);
};

exports.down = pgm => {
    pgm.dropColumns('users', ['avatar_url', 'facebook_id', 'google_id']);

    pgm.alterColumn('users', 'password', {
        notNull: true
    });
};
