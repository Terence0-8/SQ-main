/**
 * Ajoute stripe_event_created_at sur subscriptions pour ordonner et ignorer les webhooks obsolètes.
 */

exports.up = (pgm) => {
  pgm.addColumns('subscriptions', {
    stripe_event_created_at: { type: 'bigint' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('subscriptions', ['stripe_event_created_at']);
};
