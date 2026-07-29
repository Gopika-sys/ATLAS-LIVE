-- ATLAS Migration: Add data_source column to incidents table
-- Run this in your Supabase SQL editor AFTER wiping fake data

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS data_source text DEFAULT NULL;

-- Index for fast filtering
CREATE INDEX IF NOT EXISTS idx_incidents_data_source ON incidents(data_source);

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'incidents' AND column_name = 'data_source';
