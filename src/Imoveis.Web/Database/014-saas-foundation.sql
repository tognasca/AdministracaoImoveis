-- SaaS preparation: preserve the existing installation as the legacy tenant.
-- IMPORTANT: this migration does NOT activate multi-tenant routing or isolation.
CREATE TABLE IF NOT EXISTS saas_tenants (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO saas_tenants(id,slug,display_name)
VALUES ('00000000-0000-4000-8000-000000000001','legacy','Imobiliária existente')
ON CONFLICT (id) DO NOTHING;
CREATE TABLE IF NOT EXISTS saas_tenant_themes (
  tenant_id uuid PRIMARY KEY REFERENCES saas_tenants(id) ON DELETE CASCADE,
  template text NOT NULL DEFAULT 'modern' CHECK (template IN ('modern','premium','commercial')),
  accent_color text NOT NULL DEFAULT '#6B5140' CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO saas_tenant_themes(tenant_id)
VALUES ('00000000-0000-4000-8000-000000000001')
ON CONFLICT DO NOTHING;
-- Add tenant ownership metadata without altering existing unique indexes or query semantics.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES saas_tenants(id);
UPDATE properties SET tenant_id='00000000-0000-4000-8000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE properties ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE properties ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS properties_tenant_id_idx ON properties(tenant_id);
