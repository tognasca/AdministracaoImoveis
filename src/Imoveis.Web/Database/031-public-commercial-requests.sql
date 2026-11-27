ALTER TABLE saas_leads
    ADD COLUMN request_kind text CHECK (request_kind IN ('visit','proposal')),
    ADD COLUMN preferred_visit_date date,
    ADD COLUMN proposal_operation text CHECK (proposal_operation IN ('sale','rent')),
    ADD COLUMN proposed_price numeric(15,2);

ALTER TABLE saas_lead_stage_history
    ADD COLUMN action text CHECK (action IN ('counteroffer','accepted','declined','visit-confirmed')),
    ADD COLUMN counteroffer_price numeric(15,2);
