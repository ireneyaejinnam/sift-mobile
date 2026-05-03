-- Expand taste profiles with tag, borough, price preferences and interaction count
ALTER TABLE user_taste_profiles
  ADD COLUMN IF NOT EXISTS tag_weights JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS borough_weights JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS price_preference JSONB NOT NULL DEFAULT '{"ceiling": null, "freeBoost": 0}',
  ADD COLUMN IF NOT EXISTS interaction_count INT NOT NULL DEFAULT 0;
