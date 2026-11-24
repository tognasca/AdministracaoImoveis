CREATE UNIQUE INDEX properties_tenant_source_code ON properties(tenant_id,lower(source),lower(code));
CREATE UNIQUE INDEX staff_users_tenant_username ON staff_users(tenant_id,lower(username));
DROP INDEX properties_source_code;
DROP INDEX staff_users_username;

-- The immutable ownership triggers and tenant-aware foreign keys remain in force.
DROP TRIGGER saas_properties_legacy_write_guard ON properties;
DROP TRIGGER saas_staff_legacy_write_guard ON staff_users;
DROP TRIGGER saas_leads_legacy_write_guard ON saas_leads;
