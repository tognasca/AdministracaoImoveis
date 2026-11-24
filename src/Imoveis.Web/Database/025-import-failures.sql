CREATE TABLE import_failures (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES saas_tenants(id),
    operation text NOT NULL,
    http_status integer NOT NULL CHECK (http_status BETWEEN 400 AND 599),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX import_failures_tenant_recent ON import_failures (tenant_id, id DESC);
