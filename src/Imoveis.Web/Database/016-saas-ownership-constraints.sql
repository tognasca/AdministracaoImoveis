-- Defense in depth for CRM ownership: cross-tenant references cannot be stored.
-- These constraints apply even when an application endpoint is bypassed.
CREATE UNIQUE INDEX IF NOT EXISTS properties_tenant_id_pair
  ON properties(tenant_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS staff_users_tenant_id_pair
  ON staff_users(tenant_id,id);
ALTER TABLE saas_leads
  ADD CONSTRAINT saas_leads_property_same_tenant
  FOREIGN KEY (tenant_id,property_id) REFERENCES properties(tenant_id,id);
ALTER TABLE saas_leads
  ADD CONSTRAINT saas_leads_assignee_same_tenant
  FOREIGN KEY (tenant_id,assigned_to) REFERENCES staff_users(tenant_id,id);
-- Prevent reassignment of existing records between tenants through direct SQL updates.
CREATE OR REPLACE FUNCTION saas_prevent_tenant_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'Tenant ownership cannot be changed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER saas_properties_tenant_immutable
  BEFORE UPDATE OF tenant_id ON properties
  FOR EACH ROW EXECUTE FUNCTION saas_prevent_tenant_change();
CREATE TRIGGER saas_staff_tenant_immutable
  BEFORE UPDATE OF tenant_id ON staff_users
  FOR EACH ROW EXECUTE FUNCTION saas_prevent_tenant_change();
CREATE TRIGGER saas_leads_tenant_immutable
  BEFORE UPDATE OF tenant_id ON saas_leads
  FOR EACH ROW EXECUTE FUNCTION saas_prevent_tenant_change();
