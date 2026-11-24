-- The default assigns existing import records to the original installation.
ALTER TABLE import_models ADD COLUMN tenant_id uuid NOT NULL
  DEFAULT '00000000-0000-4000-8000-000000000001' REFERENCES saas_tenants(id);
ALTER TABLE import_history ADD COLUMN tenant_id uuid NOT NULL
  DEFAULT '00000000-0000-4000-8000-000000000001' REFERENCES saas_tenants(id);

ALTER TABLE import_models DROP CONSTRAINT import_models_pkey,
  ADD PRIMARY KEY (tenant_id, signature, source);
CREATE INDEX import_history_tenant_recent_idx ON import_history(tenant_id, id DESC);

CREATE TRIGGER saas_import_models_tenant_immutable
  BEFORE UPDATE OF tenant_id ON import_models
  FOR EACH ROW EXECUTE FUNCTION saas_prevent_tenant_change();
CREATE TRIGGER saas_import_history_tenant_immutable
  BEFORE UPDATE OF tenant_id ON import_history
  FOR EACH ROW EXECUTE FUNCTION saas_prevent_tenant_change();
