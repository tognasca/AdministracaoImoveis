-- Disposable validation database only; the second tenant stays inaccessible over HTTP.
INSERT INTO saas_tenants(id,slug,display_name)
VALUES ('00000000-0000-4000-8000-000000000002','homologacao','Outra imobiliária');

INSERT INTO import_models(tenant_id,signature,source,mapping)
VALUES ('00000000-0000-4000-8000-000000000002',repeat('b',64),'Outro tenant','["code"]');

INSERT INTO import_history(id,tenant_id,source,filename,imported,original_file)
OVERRIDING SYSTEM VALUE
VALUES (94001,'00000000-0000-4000-8000-000000000002','Outro tenant','outro-tenant.csv',1,decode('414243','hex'));
