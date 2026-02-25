-- ============================================
-- MIGRATION: Add Language Preference Support
-- Created: 2026-01-23
-- ============================================

-- 1. Add preferred_language column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(5) DEFAULT 'fr' CHECK (preferred_language IN ('fr', 'en'));

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_users_language ON users(preferred_language);

-- 2. Create language_preferences table for anonymous users (by IP)
CREATE TABLE IF NOT EXISTS language_preferences (
  id SERIAL PRIMARY KEY,
  ip_address VARCHAR(45) NOT NULL, -- Supports IPv4 and IPv6
  preferred_language VARCHAR(5) DEFAULT 'fr' CHECK (preferred_language IN ('fr', 'en')),
  last_updated TIMESTAMP DEFAULT NOW(),
  UNIQUE(ip_address)
);

-- Index for fast IP lookups
CREATE INDEX IF NOT EXISTS idx_lang_prefs_ip ON language_preferences(ip_address);

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON COLUMN users.preferred_language IS 'User preferred interface language (fr/en)';
COMMENT ON TABLE language_preferences IS 'Stores language preferences for anonymous users based on IP address';
