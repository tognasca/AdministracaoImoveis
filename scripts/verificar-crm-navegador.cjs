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
    await lead.getByText('Histórico de etapas').click();
    await lead.locator('ol').getByText(/Visita/).waitFor();
    for (const width of [1366,768,390]) {
      await page.setViewportSize({width,height:900});
      const dimensions = await page.evaluate(() => [document.documentElement.scrollWidth,innerWidth]);
      assert(dimensions[0] <= dimensions[1], 'CRM com rolagem horizontal em '+width+' px');
      await lead.getByRole('button',{name:'Salvar'}).scrollIntoViewIfNeeded();
      assert(await lead.getByRole('button',{name:'Salvar'}).isVisible());
      console.log('Chromium: CRM utilizável em '+width+' px.');
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode=1; });
