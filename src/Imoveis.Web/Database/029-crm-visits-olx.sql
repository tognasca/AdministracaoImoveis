ALTER TABLE saas_leads ADD COLUMN first_contact_at timestamptz;
ALTER TABLE saas_leads ADD COLUMN visit_at timestamptz;
ALTER TABLE saas_leads ADD COLUMN visit_state text CHECK (visit_state IN ('scheduled','confirmed','cancelled'));
CREATE TABLE olx_listings (
    tenant_id uuid NOT NULL,
    property_id uuid NOT NULL,
    zip text NOT NULL,
    state text NOT NULL,
    description text NOT NULL,
    PRIMARY KEY (tenant_id,property_id),
    FOREIGN KEY (tenant_id,property_id) REFERENCES properties(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE olx_feeds (
    tenant_id uuid PRIMARY KEY REFERENCES saas_tenants(id),
    origin text NOT NULL,
    email text NOT NULL,
    contact_name text NOT NULL,
    phone text NOT NULL,
    enabled boolean NOT NULL
);
