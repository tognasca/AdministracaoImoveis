const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {readFile, mkdtemp, rm} = require('node:fs/promises');
const {createServer} = require('node:http');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
const {chromium} = require('playwright');

async function verify() {
  assert(process.env.IMOVEIS_EXTERNAL_ZIP, 'Configure IMOVEIS_EXTERNAL_ZIP.');
  const directory = await mkdtemp(join(tmpdir(), 'imoveis-vitrine-'));
  const server = createServer(async (req, res) => {
    const route = req.url.split('?')[0];
    const file = route === '/imoveis/' ? 'index.html' : /^\/imoveis\/([\w.-]+)$/.exec(route)?.[1];
    const type = {js:'text/javascript',html:'text/html',css:'text/css'}[file?.split('.').pop()];
    if (!type) return res.writeHead(404).end();
    try {
      const body = await readFile(join(directory,file));
      res.writeHead(200,{'Content-Type':type}).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  let browser;
  try {
    execFileSync('unzip',['-q',process.env.IMOVEIS_EXTERNAL_ZIP,'-d',directory]);
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    browser = await chromium.launch({executablePath:process.env.IMOVEIS_CHROMIUM || undefined});
    const page = await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
    const errors = [];
    page.on('pageerror',error => errors.push(error.message));
    const api = process.env.IMOVEIS_URL || 'http://127.0.0.1:5100';
    const login = await page.request.post(api+'/api/admin/login',{
      headers:{'X-Imoveis-Action':'1'},
      data:{username:'admin',password:process.env.IMOVEIS_ADMIN_PASSWORD}
    });
    assert.equal(login.status(),204);
    await page.goto(api+'/#configuracoes');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link',{name:'Baixar arquivos da vitrine'}).click()
    ]);
    assert.equal(download.suggestedFilename(),'vitrine-legacy.zip');

    const site = 'http://127.0.0.1:'+server.address().port+'/imoveis/';
    await page.goto(site);
    const card = page.locator('.listing-card').filter({has:page.getByRole('heading',{name:'Casa comercial'})});
    await card.waitFor();
    assert.equal(await page.title(),'Imobiliária A');
    assert.equal(await page.locator('body').getAttribute('data-estate-template'),'premium');
    await page.locator('header .site-logo').evaluate(img => img.decode());
    await card.getByRole('link').click();
    await page.getByRole('heading',{name:'Casa comercial',level:1}).waitFor();
    await page.locator('#property-cover').evaluate(img => img.decode());
    assert.equal(new URL(page.url()).pathname,'/imoveis/');
    await page.getByRole('link',{name:/Voltar aos imóveis/}).click();
    await page.getByRole('searchbox').fill('REPETIDO');
    await page.getByRole('button',{name:'Buscar imóveis'}).click();
    await page.getByRole('heading',{name:'Resultados da busca'}).waitFor();
    assert.equal(await page.locator('.listing-card').count(),1);
    const updatedBrand = await page.request.put(api+'/api/admin/vitrine/identidade',{
      headers:{'X-Imoveis-Action':'1'},
      data:{name:'Imobiliária atualizada',whatsapp:'5511999990001'}
    });
    assert.equal(updatedBrand.status(),204);
    await page.reload();
    await page.getByText('Imobiliária atualizada',{exact:true}).first().waitFor();
    assert.equal(await page.title(),'Imobiliária atualizada');
    assert.deepEqual(errors,[]);
    console.log('ZIP publicado em /imoveis/ em outra origem e validado no Chromium.');
  } finally {
    if (browser) await browser.close();
    server.close();
    await rm(directory,{recursive:true,force:true});
  }
}

verify().catch(error => { console.error(error); process.exitCode = 1; });
