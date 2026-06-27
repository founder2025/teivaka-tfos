# TATI Deploy Runbook — migrations 187→191 + smoke (2026-06-27)

One place to deploy everything from the TATI build (Passport · Trust · Share Sessions ·
Attestation · AI Summary) and the verify-proof-only revert. Safe to re-run — all SQL is
idempotent (`IF NOT EXISTS` / `CREATE OR REPLACE` / `DROP POLICY IF EXISTS` first).

**Migrations covered (187→193):** 187 report-evidence fn (dormant, reserved) · 188 passport_profile ·
189 trust (claim_verifications + trust_snapshots) · 190 share_sessions · 191 attestation +
ai_summary · 192 document_vault · 193 attestation_integrity. Final `tenant.alembic_version`
= `193_attestation_integrity`.

After the SQL: rebuild api `--no-cache` + restart `teivaka_worker_automation` + `teivaka_beat`
(trust nightly + single-tenant task), then `npm run build`. Confirm `/app/uploads` is a Docker
VOLUME (vault + photos persist) before relying on uploads.

> All migrations create **FORCED-RLS tenant tables + SECURITY DEFINER functions**, so they MUST
> be applied as the **`teivaka`** owner (Strike #123), not via in-container alembic (which runs as
> `teivaka_app` and would mis-own the functions). The block below does exactly that.

---

## 1. Pull + check current state
```bash
cd /opt/teivaka && git pull origin claude/beautiful-fermi-F0dLX
docker exec teivaka_db psql -U teivaka -d teivaka_db -c "SELECT version_num FROM tenant.alembic_version;"
```

## 2. Apply ALL TATI schema as owner (one paste, idempotent)
```bash
docker exec -i teivaka_db psql -U teivaka -d teivaka_db <<'SQL'
-- 187: dormant report-evidence projection (reserved for permissioned reuse)
CREATE OR REPLACE FUNCTION audit.report_evidence_by_hash(p_hash CHAR(64)) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, public AS $$
DECLARE v_tenant uuid; v_farm text; v_period text; v_ps date; v_pe date; v_blocks jsonb; v_photos jsonb;
BEGIN
  SELECT ae.tenant_id, ae.payload_jsonb->>'farm_id', ae.payload_jsonb->>'period' INTO v_tenant,v_farm,v_period
  FROM audit.events ae WHERE ae.this_hash=p_hash AND ae.event_type='BANK_PDF_GENERATED' LIMIT 1;
  IF v_tenant IS NULL OR v_farm IS NULL THEN RETURN NULL; END IF;
  BEGIN v_ps:=to_date(v_period||'-01','YYYY-MM-DD'); v_pe:=(v_ps+INTERVAL '1 month')::date;
  EXCEPTION WHEN OTHERS THEN v_ps:=NULL; v_pe:=NULL; END;
  SELECT COALESCE(jsonb_agg(to_jsonb(bq)),'[]'::jsonb) INTO v_blocks FROM (
    SELECT pu.pu_name AS pu_name, round((COALESCE(pu.area_sqm,0)/10000.0)::numeric,3) AS area_ha,
      (SELECT count(*) FROM tenant.production_cycles pc WHERE pc.pu_id=pu.pu_id AND pc.tenant_id=v_tenant
        AND pc.cycle_status IN ('ACTIVE','HARVESTING','CLOSING')) AS active_cycles
    FROM tenant.production_units pu WHERE pu.tenant_id=v_tenant AND pu.farm_id=v_farm AND pu.is_active=TRUE ORDER BY pu.pu_name) bq;
  SELECT COALESCE(jsonb_agg(to_jsonb(pq)),'[]'::jsonb) INTO v_photos FROM (
    SELECT fe.event_type AS event_type, fe.event_date::date AS date, fe.pu_id AS pu_id, fe.photo_url AS photo_url, fe.photo_sha256 AS sha256
    FROM tenant.field_events fe WHERE fe.tenant_id=v_tenant AND fe.farm_id=v_farm AND fe.photo_url IS NOT NULL
      AND fe.deleted_at IS NULL AND (v_ps IS NULL OR (fe.event_date>=v_ps AND fe.event_date<v_pe)) ORDER BY fe.event_date DESC LIMIT 200) pq;
  RETURN jsonb_build_object('period',v_period,'farm_id',v_farm,'blocks',v_blocks,'photos',v_photos);
END; $$;
REVOKE ALL ON FUNCTION audit.report_evidence_by_hash(CHAR(64)) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.report_evidence_by_hash(CHAR(64)) TO teivaka_app;

-- 188: passport_profile
CREATE TABLE IF NOT EXISTS tenant.passport_profile (
  user_id UUID PRIMARY KEY REFERENCES tenant.users(user_id) ON DELETE CASCADE, tenant_id UUID NOT NULL,
  preferred_name TEXT, bio TEXT, languages TEXT[], professional_photo_url TEXT, photo_sha256 TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE tenant.passport_profile ENABLE ROW LEVEL SECURITY; ALTER TABLE tenant.passport_profile FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS passport_profile_tenant_isolation ON tenant.passport_profile;
CREATE POLICY passport_profile_tenant_isolation ON tenant.passport_profile FOR ALL
  USING (tenant_id=(current_setting('app.tenant_id'::text))::uuid) WITH CHECK (tenant_id=(current_setting('app.tenant_id'::text))::uuid);

-- 189: claim_verifications + trust_snapshots
CREATE TABLE IF NOT EXISTS tenant.claim_verifications (
  verification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, claim_type TEXT NOT NULL,
  claim_ref TEXT NOT NULL, source TEXT NOT NULL, source_ref TEXT, status TEXT NOT NULL DEFAULT 'VERIFIED',
  confidence_weight INTEGER NOT NULL DEFAULT 0, evidence_audit_hash TEXT, verified_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (tenant_id, claim_type, claim_ref, source));
ALTER TABLE tenant.claim_verifications ENABLE ROW LEVEL SECURITY; ALTER TABLE tenant.claim_verifications FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS claim_verifications_tenant_isolation ON tenant.claim_verifications;
CREATE POLICY claim_verifications_tenant_isolation ON tenant.claim_verifications FOR ALL
  USING (tenant_id=(current_setting('app.tenant_id'::text))::uuid) WITH CHECK (tenant_id=(current_setting('app.tenant_id'::text))::uuid);
CREATE INDEX IF NOT EXISTS idx_claim_verif_tenant ON tenant.claim_verifications (tenant_id, claim_type);
CREATE TABLE IF NOT EXISTS tenant.trust_snapshots (
  snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, subject_type TEXT NOT NULL DEFAULT 'FARMER',
  subject_id TEXT NOT NULL, dimension TEXT NOT NULL, score INTEGER NOT NULL DEFAULT 0, band TEXT NOT NULL DEFAULT 'Building',
  evidence_count INTEGER NOT NULL DEFAULT 0, inputs JSONB, why TEXT, how_to_improve TEXT, formula_version TEXT,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (tenant_id, subject_id, dimension));
ALTER TABLE tenant.trust_snapshots ENABLE ROW LEVEL SECURITY; ALTER TABLE tenant.trust_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trust_snapshots_tenant_isolation ON tenant.trust_snapshots;
CREATE POLICY trust_snapshots_tenant_isolation ON tenant.trust_snapshots FOR ALL
  USING (tenant_id=(current_setting('app.tenant_id'::text))::uuid) WITH CHECK (tenant_id=(current_setting('app.tenant_id'::text))::uuid);
CREATE INDEX IF NOT EXISTS idx_trust_snap_subject ON tenant.trust_snapshots (tenant_id, subject_id);

-- 190: share_sessions + access + resolver
CREATE TABLE IF NOT EXISTS tenant.share_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, owner_user_id UUID NOT NULL,
  audience TEXT NOT NULL DEFAULT 'OTHER', share_reason TEXT, recipient TEXT, scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  token_hash TEXT NOT NULL UNIQUE, password_hash TEXT, view_only BOOLEAN NOT NULL DEFAULT TRUE,
  allow_download BOOLEAN NOT NULL DEFAULT FALSE, one_time BOOLEAN NOT NULL DEFAULT FALSE, used_at TIMESTAMPTZ,
  report_version TEXT, expires_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE tenant.share_sessions ENABLE ROW LEVEL SECURITY; ALTER TABLE tenant.share_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS share_sessions_tenant_isolation ON tenant.share_sessions;
CREATE POLICY share_sessions_tenant_isolation ON tenant.share_sessions FOR ALL
  USING (tenant_id=(current_setting('app.tenant_id'::text))::uuid) WITH CHECK (tenant_id=(current_setting('app.tenant_id'::text))::uuid);
CREATE INDEX IF NOT EXISTS idx_share_sessions_tenant ON tenant.share_sessions (tenant_id, created_at DESC);
CREATE TABLE IF NOT EXISTS tenant.share_session_access (
  access_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), session_id UUID NOT NULL, tenant_id UUID NOT NULL,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(), ip TEXT, action TEXT NOT NULL DEFAULT 'VIEW');
ALTER TABLE tenant.share_session_access ENABLE ROW LEVEL SECURITY; ALTER TABLE tenant.share_session_access FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS share_session_access_tenant_isolation ON tenant.share_session_access;
CREATE POLICY share_session_access_tenant_isolation ON tenant.share_session_access FOR ALL
  USING (tenant_id=(current_setting('app.tenant_id'::text))::uuid) WITH CHECK (tenant_id=(current_setting('app.tenant_id'::text))::uuid);
CREATE INDEX IF NOT EXISTS idx_share_access_session ON tenant.share_session_access (session_id, accessed_at DESC);
CREATE OR REPLACE FUNCTION audit.resolve_share(p_token_hash TEXT)
RETURNS TABLE (session_id UUID, tenant_id UUID, scope JSONB, password_hash TEXT, view_only BOOLEAN, allow_download BOOLEAN,
  one_time BOOLEAN, used_at TIMESTAMPTZ, expires_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ, audience TEXT, share_reason TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, public AS $$
BEGIN RETURN QUERY SELECT s.session_id,s.tenant_id,s.scope,s.password_hash,s.view_only,s.allow_download,s.one_time,
  s.used_at,s.expires_at,s.revoked_at,s.audience,s.share_reason FROM tenant.share_sessions s WHERE s.token_hash=p_token_hash LIMIT 1; END; $$;
REVOKE ALL ON FUNCTION audit.resolve_share(TEXT) FROM PUBLIC; GRANT EXECUTE ON FUNCTION audit.resolve_share(TEXT) TO teivaka_app;

-- 191: attestation_requests + resolver + ai_summary
CREATE TABLE IF NOT EXISTS tenant.attestation_requests (
  request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, requested_by_user_id UUID NOT NULL,
  claim_type TEXT NOT NULL, claim_ref TEXT NOT NULL, subject_label TEXT, verifier_source TEXT NOT NULL, verifier_label TEXT,
  token_hash TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'PENDING', response_note TEXT, responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE tenant.attestation_requests ENABLE ROW LEVEL SECURITY; ALTER TABLE tenant.attestation_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS attestation_requests_tenant_isolation ON tenant.attestation_requests;
CREATE POLICY attestation_requests_tenant_isolation ON tenant.attestation_requests FOR ALL
  USING (tenant_id=(current_setting('app.tenant_id'::text))::uuid) WITH CHECK (tenant_id=(current_setting('app.tenant_id'::text))::uuid);
CREATE INDEX IF NOT EXISTS idx_attest_tenant ON tenant.attestation_requests (tenant_id, created_at DESC);
CREATE OR REPLACE FUNCTION audit.resolve_attestation(p_token_hash TEXT)
RETURNS TABLE (request_id UUID, tenant_id UUID, claim_type TEXT, claim_ref TEXT, subject_label TEXT,
  verifier_source TEXT, verifier_label TEXT, status TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, public AS $$
BEGIN RETURN QUERY SELECT a.request_id,a.tenant_id,a.claim_type,a.claim_ref,a.subject_label,a.verifier_source,
  a.verifier_label,a.status,a.expires_at FROM tenant.attestation_requests a WHERE a.token_hash=p_token_hash LIMIT 1; END; $$;
REVOKE ALL ON FUNCTION audit.resolve_attestation(TEXT) FROM PUBLIC; GRANT EXECUTE ON FUNCTION audit.resolve_attestation(TEXT) TO teivaka_app;
CREATE TABLE IF NOT EXISTS tenant.passport_ai_summary (
  tenant_id UUID PRIMARY KEY, summary TEXT, source TEXT NOT NULL DEFAULT 'deterministic',
  based_on TIMESTAMPTZ, generated_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE tenant.passport_ai_summary ENABLE ROW LEVEL SECURITY; ALTER TABLE tenant.passport_ai_summary FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS passport_ai_summary_tenant_isolation ON tenant.passport_ai_summary;
CREATE POLICY passport_ai_summary_tenant_isolation ON tenant.passport_ai_summary FOR ALL
  USING (tenant_id=(current_setting('app.tenant_id'::text))::uuid) WITH CHECK (tenant_id=(current_setting('app.tenant_id'::text))::uuid);

-- grants (idempotent)
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.passport_profile, tenant.claim_verifications, tenant.trust_snapshots,
  tenant.share_sessions, tenant.share_session_access, tenant.attestation_requests, tenant.passport_ai_summary TO teivaka_app;

-- final version
-- 192: Document Vault
CREATE TABLE IF NOT EXISTS tenant.documents (
  document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, owner_user_id UUID NOT NULL,
  doc_type TEXT NOT NULL DEFAULT 'OTHER', title TEXT, storage_name TEXT NOT NULL, sha256 TEXT, byte_size BIGINT,
  mime TEXT, issued_date DATE, expiry_date DATE, verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
  supersedes_id UUID, uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted_at TIMESTAMPTZ);
ALTER TABLE tenant.documents ENABLE ROW LEVEL SECURITY; ALTER TABLE tenant.documents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS documents_tenant_isolation ON tenant.documents;
CREATE POLICY documents_tenant_isolation ON tenant.documents FOR ALL
  USING (tenant_id=(current_setting('app.tenant_id'::text))::uuid) WITH CHECK (tenant_id=(current_setting('app.tenant_id'::text))::uuid);
CREATE INDEX IF NOT EXISTS idx_documents_tenant ON tenant.documents (tenant_id, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_expiry ON tenant.documents (tenant_id, expiry_date) WHERE expiry_date IS NOT NULL AND deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS tenant.document_access (
  access_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), document_id UUID NOT NULL, tenant_id UUID NOT NULL,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(), accessor TEXT, action TEXT NOT NULL DEFAULT 'VIEW');
ALTER TABLE tenant.document_access ENABLE ROW LEVEL SECURITY; ALTER TABLE tenant.document_access FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS document_access_tenant_isolation ON tenant.document_access;
CREATE POLICY document_access_tenant_isolation ON tenant.document_access FOR ALL
  USING (tenant_id=(current_setting('app.tenant_id'::text))::uuid) WITH CHECK (tenant_id=(current_setting('app.tenant_id'::text))::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.documents TO teivaka_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.document_access TO teivaka_app;

-- 193: Attestation integrity (verifier identity + self-confirm transparency flag + lineage)
ALTER TABLE tenant.attestation_requests ADD COLUMN IF NOT EXISTS creator_ip TEXT;
ALTER TABLE tenant.claim_verifications ADD COLUMN IF NOT EXISTS independent BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tenant.claim_verifications ADD COLUMN IF NOT EXISTS request_id UUID;

UPDATE tenant.alembic_version SET version_num='193_attestation_integrity';
SQL
```

## 3. Rebuild + restart + frontend
```bash
# logo (skip if already present): verify it exists
ls -l /opt/teivaka/11_application_code/app/static/teivaka-logo.png /opt/teivaka/frontend/public/teivaka-logo.png

# backend (B78: no-cache so COPY refreshes) + the worker/beat for the nightly trust task
docker compose -f 04_environment/docker-compose.yml build --no-cache api
docker compose -f 04_environment/docker-compose.yml up -d api teivaka_worker_automation teivaka_beat

# frontend (Passport page, menu link, share/attest UI)
cd /opt/teivaka/frontend && npm run build
```

## 4. Seed the first trust snapshots (don't wait for 06:15 UTC)
```bash
# tenant uuid:
docker exec teivaka_db psql -U teivaka -d teivaka_db -c "SELECT tenant_id, company_name FROM tenant.tenants;"
docker exec teivaka_api python -c "from app.workers.trust_worker import refresh_tenant; print(refresh_tenant('<TENANT_UUID>'))"
```

---

## 5. Smoke checklist (do these in a browser)
**Passport**
- [ ] Account menu (top-right) → 🪪 Agricultural Passport → `/me/passport` loads with real seasons/production/sales/farms.
- [ ] Reputation tab: dimensions show real scores (after step 4) with why + how-to-improve; empty tenant shows honest "Building".
- [ ] Overview → Executive summary: "Generate" shows the grounded summary; "Refresh with AI" returns AI phrasing (or falls back gracefully).

**Public verify = PROOF ONLY (D2)**
- [ ] Download a Bank Evidence PDF, scan its QR → verify page shows ONLY authenticity/record/integrity. **No photos, blocks, GPS, financials.**

**Share Sessions (security-sensitive)**
- [ ] Mint a link (Reputation → Share securely) → opens in incognito, shows only scoped sections (no raw cash/notes).
- [ ] **Revoke** → reload → "revoked." [ ] **Password** set → opens only with the password. [ ] **One-time** → 2nd open = "already opened." [ ] Past **expiry** → "expired." [ ] **Tamper** a token char → "not valid." [ ] Share list shows the **view count**.

**Attestation**
- [ ] "Get verified" → create request → open `/a/{token}` in incognito → **enter verifier name (required)** → Confirm → Identity/Farm dimensions **rise to ~Developing** (community-attested, partial — not Strong). [ ] Decline adds nothing. [ ] Re-open a used link → "no longer open." [ ] A confirm with no name is rejected.

**Document Vault (192)**
- [ ] Passport → Documents → upload a PDF/image → appears with size + expiry badge. [ ] **Security gate:** copy the `document_id`, hit `/api/v1/documents/<id>/file` **logged-out** → must be **401/403/404, never the file**. [ ] Expiring doc surfaces in the passport attention strip. [ ] Confirm `/app/uploads` is a Docker **volume** (else uploads vanish on rebuild).

**Share with evidence/documents (opt-in)**
- [ ] Mint a share with "Include photo & block evidence" / "Include document details" → portal shows them; default (toggles off) shows neither. [ ] Revoke → link dies.

## 6. Rollback (per piece)
- Code: redeploy the previous api image / `git checkout` the prior commit + rebuild.
- Schema: each table/function has a `DROP` in its migration's `downgrade()`; the features fail
  **soft** (Passport trust shows "Building", share/attest endpoints 404) rather than breaking the
  rest of the app. The audit chain is untouched throughout.
- Public verify revert (D2) is pure code — already proof-only once the api image is rebuilt.
