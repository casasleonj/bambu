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

  const continuar = page.locator('button:has-text("Continuar")');
  if (await continuar.isVisible().catch(() => false)) {
    await continuar.click();
    await page.waitForTimeout(500);
  }

  // Screenshot: Hoy con título dinámico
  await page.screenshot({ path: '/tmp/pedidos-fix-hoy.png', fullPage: false });

  // Click Ayer
  await page.click('button:has-text("Ayer")');
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/pedidos-fix-ayer.png', fullPage: false });

  // Volver a Hoy
  await page.click('button:has-text("Hoy")');
  await page.waitForTimeout(500);

  // Tab Fiados
  await page.click('button:has-text("Fiados")');
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/pedidos-fix-fiados.png', fullPage: false });

  // Tab Alertas
  await page.click('button:has-text("Alertas")');
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/pedidos-fix-alertas.png', fullPage: false });

  await browser.close();
})();
