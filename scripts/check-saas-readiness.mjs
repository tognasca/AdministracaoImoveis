#!/usr/bin/env node
// Non-destructive release guard: run with node scripts/check-saas-readiness.mjs
import {readFileSync} from 'node:fs';
const read = file => readFileSync(file,'utf8');
const checks = [
 ['legacy tenant migration', 'src/Imoveis.Web/Database/014-saas-foundation.sql', /UPDATE properties SET tenant_id=/],
 ['tenant-aware users', 'src/Imoveis.Web/Database/015-saas-business-foundation.sql', /ALTER TABLE staff_users ADD COLUMN/],
 ['ownership constraints', 'src/Imoveis.Web/Database/016-saas-ownership-constraints.sql', /saas_leads_property_same_tenant/],
 ['verified tenant domain', 'src/Imoveis.Web/TenantContext.cs', /d.verified_at IS NOT NULL/],
 ['CRM endpoint registration', 'src/Imoveis.Web/Program.cs', /LeadEndpoints\.Map\(admin\)/],
 ['theme endpoint registration', 'src/Imoveis.Web/Program.cs', /SaasThemeEndpoints\.Map\(admin\)/],
 ['CRM navigation', 'src/Imoveis.Web/wwwroot/app.js', /await crm\(isCurrent\)/]
];
let failed = 0;
for (const [name,path,pattern] of checks) {
  const ok = pattern.test(read(path));
  process.stdout.write((ok?'OK  ':'FAIL')+' '+name+'\n');
  if(!ok) failed++;
}
if(failed) process.exitCode=1;
else console.log('Static checks passed. NOT a substitute for build, database or security integration tests.');
