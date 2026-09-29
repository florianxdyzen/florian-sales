-- Recare Phase F: Owner flag — panels available for sales quotations.
-- Sales builder lists available_for_sales = true; Owner catalogue still sees all.

ALTER TABLE rate_card_companies
  ADD COLUMN IF NOT EXISTS available_for_sales BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN rate_card_companies.available_for_sales IS
  'When false, Sales cannot pick this panel on new/edit quotes. Owner still sees it on the rate card.';
