ALTER TABLE saas_tenant_audit DROP CONSTRAINT saas_tenant_audit_action_check;
ALTER TABLE saas_tenant_audit ADD CONSTRAINT saas_tenant_audit_action_check
    CHECK (action IN ('tenant_created','domain_requested','domain_verified','tenant_suspended','tenant_activated'));
