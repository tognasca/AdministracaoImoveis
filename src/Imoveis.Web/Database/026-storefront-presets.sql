ALTER TABLE saas_tenant_themes DROP CONSTRAINT saas_tenant_themes_template_check;
ALTER TABLE saas_tenant_themes ADD CONSTRAINT saas_tenant_themes_template_check
    CHECK (template IN ('modern','premium','commercial','minimal','boutique'));
ALTER TABLE saas_tenant_themes
    ADD COLUMN draft_template text,
    ADD COLUMN draft_accent text,
    ADD COLUMN previous_template text,
    ADD COLUMN previous_accent text;
