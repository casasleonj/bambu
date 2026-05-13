const { chromium } = require('playwright');

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

  // Dismiss "Base de Caja" modal if present
  const continuar = page.locator('button:has-text("Continuar")');
  if (await continuar.isVisible().catch(() => false)) {
    await continuar.click();
    await page.waitForTimeout(500);
  }

  // Screenshot: Sin filtro (todos)
  await page.screenshot({ path: '/tmp/pedidos-honest-todos.png', fullPage: false });

  // Click Hoy
  const hoyBtn = page.locator('button:has-text("Hoy")').first();
  if (await hoyBtn.isVisible().catch(() => false)) {
    await hoyBtn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: '/tmp/pedidos-honest-hoy.png', fullPage: false });
  }

  // Click Ayer
  const ayerBtn = page.locator('button:has-text("Ayer")').first();
  if (await ayerBtn.isVisible().catch(() => false)) {
    await ayerBtn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: '/tmp/pedidos-honest-ayer.png', fullPage: false });
  }

  await browser.close();
})();
