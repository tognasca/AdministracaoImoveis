ALTER TABLE storefront_brand ADD COLUMN tenant_id uuid NOT NULL
  DEFAULT '00000000-0000-4000-8000-000000000001' REFERENCES saas_tenants(id);
ALTER TABLE storefront_brand DROP CONSTRAINT storefront_brand_pkey,
  ADD PRIMARY KEY (tenant_id);

ALTER TABLE storefront_menu ADD COLUMN tenant_id uuid NOT NULL
  DEFAULT '00000000-0000-4000-8000-000000000001' REFERENCES saas_tenants(id);
CREATE UNIQUE INDEX storefront_menu_tenant_id_pair ON storefront_menu(tenant_id,id);
CREATE UNIQUE INDEX storefront_menu_tenant_category_name
  ON storefront_menu(tenant_id,lower(name)) WHERE kind='category';
DROP INDEX storefront_menu_category_name;

ALTER TABLE properties ADD CONSTRAINT properties_category_same_tenant
  FOREIGN KEY (tenant_id,category_id) REFERENCES storefront_menu(tenant_id,id);

CREATE TRIGGER storefront_brand_tenant_immutable
  BEFORE UPDATE OF tenant_id ON storefront_brand
  FOR EACH ROW EXECUTE FUNCTION saas_prevent_tenant_change();
CREATE TRIGGER storefront_menu_tenant_immutable
  BEFORE UPDATE OF tenant_id ON storefront_menu
  FOR EACH ROW EXECUTE FUNCTION saas_prevent_tenant_change();
