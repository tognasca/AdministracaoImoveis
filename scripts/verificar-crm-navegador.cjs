const assert = require('node:assert/strict');
const {chromium} = require('playwright');
(async () => {
  const base = process.env.IMOVEIS_URL ?? 'http://127.0.0.1:5099';
  const password = process.env.IMOVEIS_ADMIN_PASSWORD;
  assert(password, 'Configure IMOVEIS_ADMIN_PASSWORD.');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport:{width:1366,height:900}});
    await page.goto(new URL('/admin',base).href);
    await page.locator('#login input[name=password]').fill(password);
    await page.getByRole('button',{name:'Entrar',exact:true}).click();
    await page.getByRole('link',{name:'CRM',exact:true}).click();
    await page.getByText('Novo contato',{exact:true}).click();
    const form = page.locator('#lead-new');
    await form.locator('[name=name]').fill('Contato navegador');
    await form.locator('[name=assignedTo]').selectOption({label:'admin'});
    await form.getByRole('searchbox').fill('LEG-1');
    await form.getByRole('button',{name:'Buscar imóvel'}).click();
    await form.locator('[name=propertyId]').selectOption({label:'LEG-1 · Casa anterior'});
    await form.getByRole('button',{name:'Adicionar contato'}).click();
    const lead = page.locator('.crm-lead').filter({hasText:'Contato navegador'});
    await lead.waitFor();
    await lead.locator('[name=status]').selectOption('visit');
    await lead.getByRole('button',{name:'Salvar'}).click();
    await lead.getByText('Histórico de atendimento').click();
    await lead.locator('ol').getByText(/Visita/).waitFor();
    const fixture = await page.request.post(base+'/api/admin/crm/leads',{
      headers:{'X-Imoveis-Action':'1'},
      data:{name:'Contato da fila',phone:'(11) 99999-1234',status:'new',
        propertyId:'00000000-0000-4000-8000-000000000071'}
    });
    assert.equal(fixture.status(),201);
    const filters = page.locator('#crm-filters');
    await filters.locator('[name=queue]').selectOption('true');
    await filters.getByRole('button',{name:'Aplicar filtros'}).click();
    await page.locator('.crm-inbox-item').filter({hasText:'Contato da fila'}).click();
    const queued = page.locator('.crm-lead').filter({hasText:'Contato da fila'});
    await queued.getByText('Chegou agora').waitFor();
    assert.equal(await lead.count(),0);
    const whatsapp = new URL(await queued.getByRole('link',{name:'WhatsApp'}).getAttribute('href'));
    assert.equal(whatsapp.pathname,'/5511999991234');
    assert.match(whatsapp.searchParams.get('text'),/LEG-1/);
    await filters.locator('[name=queue]').selectOption('false');
    await filters.getByRole('searchbox').fill('Contato navegador');
    await filters.getByRole('button',{name:'Aplicar filtros'}).click();
    await lead.waitFor();
    assert.equal(await queued.count(),0);
    for (const width of [1366,768,390]) {
      await page.setViewportSize({width,height:900});
      const dimensions = await page.evaluate(() => [document.documentElement.scrollWidth,innerWidth]);
      assert(dimensions[0] <= dimensions[1], 'CRM com rolagem horizontal em '+width+' px');
      await lead.getByRole('button',{name:'Salvar'}).scrollIntoViewIfNeeded();
      assert(await lead.getByRole('button',{name:'Salvar'}).isVisible());
      console.log('Chromium: CRM utilizável em '+width+' px.');
    }
    await page.goto(new URL('/#configuracoes',base).href);
    const theme = page.locator('#template-form select[name=template]');
    await theme.selectOption('boutique');
    await page.locator('#preview-width').selectOption('390');
    const frame = page.frameLocator('#storefront-preview');
    await frame.locator('body[data-estate-template=boutique]').waitFor();
    await page.locator('#hero-source').selectOption('upload');
    await page.locator('#hero-file').setInputFiles({name:'hero.png',mimeType:'image/png',
      buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGMUi6hgYGBgYmBgYGBgAAAKkADqFPYWGgAAAABJRU5ErkJggg==','base64')});
    await page.locator('#hero-save').click();
    await page.locator('#hero-status').getByText('Imagem salva como rascunho.').waitFor();
    await frame.locator('.estate-hero:not(.estate-hero-plain) .estate-banner img').waitFor();
    await page.getByRole('button',{name:'Salvar rascunho',exact:true}).click();
    await page.getByText('Rascunho do modelo salvo.',{exact:true}).waitFor();
    assert.equal(await theme.inputValue(),'boutique');
    await page.getByRole('button',{name:'Menu',exact:true}).click();
    await page.getByRole('button',{name:'Tema escuro',exact:true}).click();
    assert(await page.locator('body.workspace-dark').count());
    await page.setViewportSize({width:1366,height:900});
    await page.getByRole('button',{name:'Recolher menu lateral'}).click();
    assert(await page.locator('body.workspace-sidebar-collapsed').count());
    await page.getByRole('button',{name:'Expandir menu lateral'}).click();
    await page.getByRole('button',{name:'Sair',exact:true}).click();
    await page.getByRole('heading',{name:'Acesso administrativo'}).waitFor();
    assert.equal((await page.request.get(base+'/api/admin/session')).status(),401);
    const docs = await page.context().newPage();
    await docs.goto(base+'/docs/catalogo/index.html');
    await docs.locator('.swagger-ui .opblock').first().waitFor();
    const cssApplied = await docs.locator('.swagger-ui').evaluate(node =>
      getComputedStyle(node).fontFamily.includes('sans-serif'));
    assert(cssApplied);
    await docs.close();
    console.log('Chromium: prévia real da vitrine, rascunho e tema escuro do painel.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode=1; });
