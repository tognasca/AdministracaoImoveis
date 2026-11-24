import {readFileSync, readdirSync} from 'node:fs';

const directory = new URL('../src/Imoveis.Web/Database/', import.meta.url);
console.log('BEGIN; CREATE TABLE imoveis_schema (name text PRIMARY KEY);');
for (const file of readdirSync(directory).filter(file => /^0(?:0[1-9]|1[0-7])-[a-z-]+\.sql$/.test(file)).sort()) {
  console.log(readFileSync(new URL(file, directory), 'utf8'));
  console.log(`INSERT INTO imoveis_schema VALUES ('Imoveis.Web.Database.${file}');`);
}
console.log(`
  INSERT INTO properties(id,code,source,title,kind,district,city,price,bedrooms,size,status,category_id)
  VALUES ('00000000-0000-4000-8000-000000000071','LEG-1','Cadastro anterior','Casa anterior','Casa',
          'Centro','Cotia',500000,3,130,'Publicado','00000000-0000-4000-8000-000000000001');
  INSERT INTO storefront_brand(name) VALUES ('Imobiliária anterior');
  INSERT INTO import_models(signature,source,mapping)
  VALUES (repeat('c',64),'Cadastro anterior','["code"]');
  INSERT INTO import_history(source,filename,imported,original_file)
  VALUES ('Cadastro anterior','anterior.csv',1,decode('414243','hex'));
  COMMIT;
`);
