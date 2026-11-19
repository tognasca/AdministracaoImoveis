-- Incremental SaaS provisioning and ownership audit; legacy data is untouched.
CREATE TABLE saas_tenant_audit (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES saas_tenants(id),
    actor_tenant_id uuid NOT NULL REFERENCES saas_tenants(id),
    actor_user_id uuid NOT NULL,
    action text NOT NULL CHECK (action IN ('tenant_created','domain_requested','tenant_suspended','tenant_activated')),
    detail text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX saas_tenant_audit_tenant_recent ON saas_tenant_audit(tenant_id,id DESC);
ALTER TABLE saas_domains ADD COLUMN IF NOT EXISTS verification_token_hash text;
ALTER TABLE saas_domains ADD COLUMN IF NOT EXISTS verification_requested_at timestamptz;
