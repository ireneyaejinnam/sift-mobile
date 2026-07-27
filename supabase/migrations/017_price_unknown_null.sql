-- Migration 017: Fix "free that isn't free".
--
-- Unknown-price events were defaulted to price_min = 0 at ingest, which leaked
-- them into the Free filter (`.eq(price_min, 0)`) and mislabeled them "Free"
-- even though they carry a paid ticket_url (e.g. Met Opera). Going forward the
-- ingest writes NULL for unknown price; this migration (a) ensures the columns
-- are nullable and (b) backfills existing unknown-default rows to NULL.
--
-- Genuinely-free rows have is_free = true, so they are left untouched.

-- (a) Ensure price_min is nullable (no-op if it already is).
ALTER TABLE events         ALTER COLUMN price_min DROP NOT NULL;
ALTER TABLE event_sessions ALTER COLUMN price_min DROP NOT NULL;

-- (b) Reclassify the unknown-default (price_min = 0 AND not marked free) → NULL.
UPDATE events
  SET price_min = NULL
  WHERE price_min = 0 AND is_free = false;

UPDATE event_sessions es
  SET price_min = NULL
  FROM events e
  WHERE es.event_id = e.id
    AND es.price_min = 0
    AND e.is_free = false;
