CREATE TABLE catalog_api_access (
    tenant_id uuid PRIMARY KEY REFERENCES saas_tenants(id),
    token_hash bytea NOT NULL CHECK (octet_length(token_hash) = 32),
    window_start timestamptz NOT NULL DEFAULT date_trunc('minute', now()),
    requests integer NOT NULL DEFAULT 0 CHECK (requests >= 0)
);
