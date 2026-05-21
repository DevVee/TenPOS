-- ─────────────────────────────────────────────────────────────────────────────
-- 007_product_details.sql
-- Adds extended optional fields to the products table.
--
-- Run in Supabase SQL Editor (Project → SQL Editor → New query).
-- Safe to re-run — all statements use IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS description  TEXT,
  ADD COLUMN IF NOT EXISTS brand        VARCHAR(150),
  ADD COLUMN IF NOT EXISTS material     VARCHAR(150),
  ADD COLUMN IF NOT EXISTS color        VARCHAR(150),
  ADD COLUMN IF NOT EXISTS weight_grams NUMERIC,
  ADD COLUMN IF NOT EXISTS length_cm    NUMERIC,
  ADD COLUMN IF NOT EXISTS width_cm     NUMERIC,
  ADD COLUMN IF NOT EXISTS height_cm    NUMERIC,
  ADD COLUMN IF NOT EXISTS tags         TEXT[],
  ADD COLUMN IF NOT EXISTS notes        TEXT;

-- Optional: helpful index for tag-based search in the future
CREATE INDEX IF NOT EXISTS idx_products_tags ON products USING GIN (tags);
