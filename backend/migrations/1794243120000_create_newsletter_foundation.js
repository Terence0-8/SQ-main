// backend/migrations/1794243120000_create_newsletter_foundation.js
// Fondation PostgreSQL du système Newsletter Solitiquo.
// Cette migration crée uniquement le schéma : aucun appel à Brevo et aucun envoi.

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE newsletter_subscribers (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      email VARCHAR(254) NOT NULL,
      preferred_language VARCHAR(5) NOT NULL DEFAULT 'fr'
        CHECK (preferred_language IN ('fr', 'en')),
      status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'unsubscribed', 'bounced', 'complained', 'suppressed')),
      consented_at TIMESTAMPTZ,
      consent_source VARCHAR(100),
      consent_ip INET,
      consent_user_agent TEXT,
      consent_version VARCHAR(40),
      confirmed_at TIMESTAMPTZ,
      unsubscribed_at TIMESTAMPTZ,
      brevo_contact_id VARCHAR(100),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX newsletter_subscribers_email_lower_uidx
      ON newsletter_subscribers (LOWER(email));
    CREATE UNIQUE INDEX newsletter_subscribers_user_id_uidx
      ON newsletter_subscribers (user_id)
      WHERE user_id IS NOT NULL;
    CREATE INDEX newsletter_subscribers_status_idx
      ON newsletter_subscribers (status);
    CREATE INDEX newsletter_subscribers_brevo_contact_id_idx
      ON newsletter_subscribers (brevo_contact_id)
      WHERE brevo_contact_id IS NOT NULL;

    CREATE TABLE newsletter_preferences (
      subscriber_id BIGINT PRIMARY KEY
        REFERENCES newsletter_subscribers(id) ON DELETE CASCADE,
      daily_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      weekly_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE newsletter_campaigns (
      id BIGSERIAL PRIMARY KEY,
      edition_key VARCHAR(120) NOT NULL,
      frequency VARCHAR(10) NOT NULL
        CHECK (frequency IN ('daily', 'weekly')),
      language VARCHAR(5) NOT NULL
        CHECK (language IN ('fr', 'en')),
      title VARCHAR(255) NOT NULL,
      preheader VARCHAR(255),
      html_content TEXT,
      text_content TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'scheduled', 'queued', 'sending', 'sent', 'cancelled', 'failed')),
      scheduled_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      brevo_campaign_id VARCHAR(100),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT newsletter_campaigns_edition_frequency_language_key
        UNIQUE (edition_key, frequency, language)
    );

    CREATE INDEX newsletter_campaigns_status_schedule_idx
      ON newsletter_campaigns (status, scheduled_at);
    CREATE INDEX newsletter_campaigns_created_by_idx
      ON newsletter_campaigns (created_by);
    CREATE UNIQUE INDEX newsletter_campaigns_brevo_campaign_id_uidx
      ON newsletter_campaigns (brevo_campaign_id)
      WHERE brevo_campaign_id IS NOT NULL;

    CREATE TABLE newsletter_campaign_sends (
      id BIGSERIAL PRIMARY KEY,
      campaign_id BIGINT NOT NULL
        REFERENCES newsletter_campaigns(id) ON DELETE CASCADE,
      subscriber_id BIGINT NOT NULL
        REFERENCES newsletter_subscribers(id) ON DELETE RESTRICT,
      status VARCHAR(20) NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'sending', 'sent', 'delivered', 'bounced', 'blocked', 'complained', 'failed')),
      provider_message_id VARCHAR(150),
      attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      last_error TEXT,
      queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT newsletter_campaign_sends_campaign_subscriber_key
        UNIQUE (campaign_id, subscriber_id)
    );

    CREATE INDEX newsletter_campaign_sends_status_idx
      ON newsletter_campaign_sends (status, queued_at);
    CREATE INDEX newsletter_campaign_sends_subscriber_idx
      ON newsletter_campaign_sends (subscriber_id);
    CREATE UNIQUE INDEX newsletter_campaign_sends_provider_message_id_uidx
      ON newsletter_campaign_sends (provider_message_id)
      WHERE provider_message_id IS NOT NULL;

    CREATE TABLE newsletter_events (
      id BIGSERIAL PRIMARY KEY,
      provider VARCHAR(30) NOT NULL DEFAULT 'brevo',
      provider_event_id VARCHAR(150),
      event_type VARCHAR(60) NOT NULL,
      subscriber_id BIGINT REFERENCES newsletter_subscribers(id) ON DELETE SET NULL,
      campaign_id BIGINT REFERENCES newsletter_campaigns(id) ON DELETE SET NULL,
      campaign_send_id BIGINT REFERENCES newsletter_campaign_sends(id) ON DELETE SET NULL,
      payload JSONB NOT NULL DEFAULT '{}'::JSONB,
      occurred_at TIMESTAMPTZ,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMPTZ,
      processing_error TEXT
    );

    CREATE UNIQUE INDEX newsletter_events_provider_event_uidx
      ON newsletter_events (provider, provider_event_id)
      WHERE provider_event_id IS NOT NULL;
    CREATE INDEX newsletter_events_subscriber_received_idx
      ON newsletter_events (subscriber_id, received_at DESC);
    CREATE INDEX newsletter_events_campaign_received_idx
      ON newsletter_events (campaign_id, received_at DESC);
    CREATE INDEX newsletter_events_unprocessed_idx
      ON newsletter_events (received_at)
      WHERE processed_at IS NULL;

    CREATE TABLE newsletter_tokens (
      id BIGSERIAL PRIMARY KEY,
      subscriber_id BIGINT NOT NULL
        REFERENCES newsletter_subscribers(id) ON DELETE CASCADE,
      token_hash CHAR(64) NOT NULL UNIQUE,
      purpose VARCHAR(20) NOT NULL
        CHECK (purpose IN ('confirmation', 'preferences', 'unsubscribe')),
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX newsletter_tokens_subscriber_purpose_idx
      ON newsletter_tokens (subscriber_id, purpose);
    CREATE INDEX newsletter_tokens_expiry_idx
      ON newsletter_tokens (expires_at)
      WHERE used_at IS NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS newsletter_tokens;
    DROP TABLE IF EXISTS newsletter_events;
    DROP TABLE IF EXISTS newsletter_campaign_sends;
    DROP TABLE IF EXISTS newsletter_campaigns;
    DROP TABLE IF EXISTS newsletter_preferences;
    DROP TABLE IF EXISTS newsletter_subscribers;
  `);
};
