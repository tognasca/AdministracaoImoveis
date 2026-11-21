CREATE UNIQUE INDEX saas_leads_tenant_id_pair ON saas_leads(tenant_id,id);
CREATE TABLE saas_lead_stage_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  changed_by uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('new','contacted','visit','proposal','won','lost')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,lead_id) REFERENCES saas_leads(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,changed_by) REFERENCES staff_users(tenant_id,id)
);
CREATE INDEX saas_lead_history_recent ON saas_lead_stage_history(tenant_id,lead_id,id DESC);
