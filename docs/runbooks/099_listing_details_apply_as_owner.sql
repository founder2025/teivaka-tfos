-- 099 listing details — apply-as-owner (Strike #123). Idempotent.
ALTER TABLE community.listings ADD COLUMN IF NOT EXISTS price_basis TEXT NOT NULL DEFAULT 'kg';
ALTER TABLE community.listings ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}'::jsonb;
SELECT (SELECT count(*) FROM information_schema.columns WHERE table_schema='community' AND table_name='listings' AND column_name IN ('price_basis','details')) AS new_cols;
