-- Run after fixtures-saas-isolation.sql against the disposable database.
INSERT INTO saas_domains(hostname,tenant_id,verified_at) VALUES
 ('127.0.0.1','00000000-0000-4000-8000-000000000001',now()),
 ('imoveis-ci.test','00000000-0000-4000-8000-000000000001',now()),
 ('outra-ci.test','00000000-0000-4000-8000-000000000002',now()),
 ('nao-verificado-ci.test','00000000-0000-4000-8000-000000000002',NULL);

INSERT INTO staff_users(id,username,password_hash,role,tenant_id)
SELECT '00000000-0000-4000-8000-000000000099',username,password_hash,role,
 '00000000-0000-4000-8000-000000000002'
FROM staff_users WHERE username='admin' AND tenant_id='00000000-0000-4000-8000-000000000001';
