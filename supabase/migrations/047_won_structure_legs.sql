-- Recare Phase A — structure legs at Won + JSON heights.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS structure_leg_count INT,
  ADD COLUMN IF NOT EXISTS structure_leg_heights JSONB;

COMMENT ON COLUMN public.leads.structure_leg_count IS
  'Total mounting structure legs captured at Won (2–24).';
COMMENT ON COLUMN public.leads.structure_leg_heights IS
  'Two rows of leg heights in mm: { "rows": [[...], [...]] }.';
