-- SaaS data model only. Multi-tenant traffic remains disabled until every query,
-- media path, login and storefront setting is scoped and integration-tested.
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES saas_tenants(id);
UPDATE staff_users SET tenant_id='00000000-0000-4000-8000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE staff_users ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE staff_users ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS staff_users_tenant_idx ON staff_users(tenant_id);

CREATE TABLE IF NOT EXISTS saas_domains (
  hostname text PRIMARY KEY CHECK (hostname = lower(hostname) AND length(hostname) BETWEEN 4 AND 253),
  tenant_id uuid NOT NULL REFERENCES saas_tenants(id) ON DELETE CASCADE,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saas_domains_tenant_idx ON saas_domains(tenant_id);

CREATE TABLE IF NOT EXISTS saas_plans (
  id text PRIMARY KEY CHECK (id IN ('start','pro','premium')),
  name text NOT NULL,
  max_properties integer NOT NULL CHECK (max_properties > 0),
  max_staff integer NOT NULL CHECK (max_staff > 0)
);
INSERT INTO saas_plans(id,name,max_properties,max_staff) VALUES
 ('start','Start',100,2),('pro','Pro',1000,15),('premium','Premium',10000,100)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS saas_subscriptions (
  tenant_id uuid PRIMARY KEY REFERENCES saas_tenants(id) ON DELETE CASCADE,
  plan_id text NOT NULL REFERENCES saas_plans(id),
  status text NOT NULL CHECK (status IN ('trial','active','past_due','cancelled','suspended')),
  provider text,
  provider_subscription_id text,
  current_period_end timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS saas_subscription_provider_idx
ON saas_subscriptions(provider,provider_subscription_id)
WHERE provider IS NOT NULL AND provider_subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS saas_leads (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES saas_tenants(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  email text,
  phone text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','contacted','visit','proposal','won','lost')),
  assigned_to uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saas_leads_tenant_status_idx ON saas_leads(tenant_id,status,created_at DESC);
