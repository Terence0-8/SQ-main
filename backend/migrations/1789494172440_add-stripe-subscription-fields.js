/**
 * Ajoute les champs nécessaires au suivi des abonnements Stripe.
 */

exports.up = (pgm) => {
    pgm.addColumns('subscriptions', {
        stripe_customer_id: {
            type: 'text',
        },
        stripe_subscription_id: {
            type: 'text',
        },
        stripe_price_id: {
            type: 'text',
        },
        stripe_product_id: {
            type: 'text',
        },
        stripe_status: {
            type: 'text',
        },
        stripe_cancel_at_period_end: {
            type: 'boolean',
            notNull: true,
            default: false,
        },
        stripe_current_period_start: {
            type: 'timestamptz',
        },
        stripe_current_period_end: {
            type: 'timestamptz',
        },
        stripe_trial_start: {
            type: 'timestamptz',
        },
        stripe_trial_end: {
            type: 'timestamptz',
        },
        stripe_latest_invoice_id: {
            type: 'text',
        },
        stripe_default_payment_method: {
            type: 'text',
        },
        payment_failed_at: {
            type: 'timestamptz',
        },
        payment_grace_ends_at: {
            type: 'timestamptz',
        },
    });

    pgm.createIndex('subscriptions', 'stripe_subscription_id', {
        name: 'subscriptions_stripe_subscription_id_unique',
        unique: true,
        where: 'stripe_subscription_id IS NOT NULL',
    });

    pgm.createIndex('subscriptions', 'stripe_customer_id', {
        name: 'subscriptions_stripe_customer_id_idx',
    });

    pgm.createIndex('subscriptions', 'payment_grace_ends_at', {
        name: 'subscriptions_payment_grace_idx',
        where: 'payment_grace_ends_at IS NOT NULL',
    });
};

exports.down = (pgm) => {
    pgm.dropIndex(
        'subscriptions',
        'subscriptions_stripe_subscription_id_unique'
    );

    pgm.dropIndex(
        'subscriptions',
        'subscriptions_stripe_customer_id_idx'
    );

    pgm.dropIndex(
        'subscriptions',
        'subscriptions_payment_grace_idx'
    );

    pgm.dropColumns('subscriptions', [
        'stripe_customer_id',
        'stripe_subscription_id',
        'stripe_price_id',
        'stripe_product_id',
        'stripe_status',
        'stripe_cancel_at_period_end',
        'stripe_current_period_start',
        'stripe_current_period_end',
        'stripe_trial_start',
        'stripe_trial_end',
        'stripe_latest_invoice_id',
        'stripe_default_payment_method',
        'payment_failed_at',
        'payment_grace_ends_at',
    ]);
};