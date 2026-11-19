-- Enforce tenant ownership at the database boundary without activating multi-tenant routing.
-- The existing application remains bound to the legacy tenant until all endpoints are scoped.
CREATE OR REPLACE FUNCTION saas_enforce_legacy_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM '00000000-0000-4000-8000-000000000001'::uuid THEN
    RAISE EXCEPTION 'Non-legacy tenant writes are disabled until SaaS isolation is enabled';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER saas_properties_legacy_write_guard
  BEFORE INSERT OR UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION saas_enforce_legacy_write();

CREATE TRIGGER saas_staff_legacy_write_guard
  BEFORE INSERT OR UPDATE ON staff_users
  FOR EACH ROW EXECUTE FUNCTION saas_enforce_legacy_write();

CREATE TRIGGER saas_leads_legacy_write_guard
  BEFORE INSERT OR UPDATE ON saas_leads
  FOR EACH ROW EXECUTE FUNCTION saas_enforce_legacy_write();
