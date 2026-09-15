/**
 * Ajoute l'état nécessaire à la gestion Stripe des essais et webhooks.
 */

exports.up = (pgm) => {
  pgm.addColumns('users', {
    subscription_trial_used_at: { type: 'timestamptz' },
  });

  pgm.createTable('stripe_webhook_events', {
    event_id: { type: 'text', notNull: true, primaryKey: true },
    event_type: { type: 'text', notNull: true },
    processed_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });

  pgm.createIndex('subscriptions', 'user_id', {
    name: 'subscriptions_one_active_per_user_unique',
    unique: true,
    where: "status = 'active' AND stripe_subscription_id IS NOT NULL",
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('subscriptions', 'subscriptions_one_active_per_user_unique');
  pgm.dropTable('stripe_webhook_events');
  pgm.dropColumns('users', ['subscription_trial_used_at']);
};
