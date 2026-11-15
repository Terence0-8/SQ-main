/* eslint-disable camelcase */
exports.up = pgm => {
  pgm.createTable('newsletter_subscribers', {
    id: { type: 'serial', primaryKey: true },
    email: { type: 'varchar(255)', notNull: true },
    user_id: { type: 'integer', references: 'users(id)', onDelete: 'SET NULL' },
    status: { type: 'varchar(20)', notNull: true, default: "'active'" },
    language: { type: 'varchar(5)', notNull: true, default: "'fr'" },
    // Préférences granulaires
    pref_daily: { type: 'boolean', notNull: true, default: true },
    pref_weekly: { type: 'boolean', notNull: true, default: true },
    pref_special: { type: 'boolean', notNull: true, default: true },
    // Tokens de gestion
    confirm_token: { type: 'varchar(128)' },
    confirmed_at: { type: 'timestamptz' },
    unsubscribe_token: { type: 'varchar(128)', notNull: false },
    unsubscribed_at: { type: 'timestamptz' },
    // Métadonnées
    source: { type: 'varchar(50)', default: "'web'" },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('newsletter_subscribers', 'newsletter_subscribers_email_unique', 'UNIQUE(email)');
  pgm.createIndex('newsletter_subscribers', 'email');
  pgm.createIndex('newsletter_subscribers', 'user_id');
  pgm.createIndex('newsletter_subscribers', 'status');
  pgm.createIndex('newsletter_subscribers', 'unsubscribe_token');
  pgm.createIndex('newsletter_subscribers', 'confirm_token');

  // Table des campagnes (envois)
  pgm.createTable('newsletter_campaigns', {
    id: { type: 'serial', primaryKey: true },
    type: { type: 'varchar(20)', notNull: true }, // daily | weekly | special
    subject_fr: { type: 'varchar(255)', notNull: true },
    subject_en: { type: 'varchar(255)' },
    body_fr: { type: 'text' },
    body_en: { type: 'text' },
    status: { type: 'varchar(20)', notNull: true, default: "'draft'" }, // draft | sent | cancelled
    recipients_count: { type: 'integer', default: 0 },
    sent_at: { type: 'timestamptz' },
    created_by: { type: 'integer', references: 'users(id)', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

exports.down = pgm => {
  pgm.dropTable('newsletter_campaigns');
  pgm.dropTable('newsletter_subscribers');
};
