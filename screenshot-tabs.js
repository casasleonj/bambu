const { chromium } = require('playwright');

async function screenshotTab(page, name) {
  await page.screenshot({ path: `/tmp/pedidos-${name}.png`, fullPage: false });
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // Login
  await page.goto('http://localhost:3000/login');
  await page.fill('input[name="email"], input[type="text"]', 'admin');
  await page.fill('input[name="password"], input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 10000 }).catch(() => {});

  await page.goto('http://localhost:3000/pedidos');
  await page.waitForTimeout(2000);

  const continuar = page.locator('button:has-text("Continuar")');
  if (await continuar.isVisible().catch(() => false)) {
    await continuar.click();
    await page.waitForTimeout(500);
  }

  // Tab Hoy (default)
  await screenshotTab(page, 'tab-hoy');

  // Click Tab Fiados
  await page.click('button:has-text("Fiados")');
  await page.waitForTimeout(800);
  await screenshotTab(page, 'tab-fiados');

  // Click Tab Alertas
  await page.click('button:has-text("Alertas")');
  await page.waitForTimeout(800);
  await screenshotTab(page, 'tab-alertas');

  // Volver a Hoy y mostrar FAB
  await page.click('button:has-text("Hoy")');
  await page.waitForTimeout(500);
  const fab = page.locator('button[aria-label="Acciones rápidas"]');
  if (await fab.isVisible().catch(() => false)) {
    await fab.click();
    await page.waitForTimeout(400);
    await screenshotTab(page, 'fab-open');
  }

  await browser.close();
})();
