-- Migration : ajout colonne fedapay_id sur la table subscriptions
-- À exécuter une fois avant de déployer l'intégration FedaPay

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS fedapay_id VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_subscriptions_fedapay_id
  ON subscriptions (fedapay_id);
