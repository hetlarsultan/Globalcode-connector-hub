ALTER TABLE public.ad_placements
  ADD COLUMN IF NOT EXISTS ad_client text,
  ADD COLUMN IF NOT EXISTS ad_unit_id text;