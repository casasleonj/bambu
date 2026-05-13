const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();

  // ===== DESKTOP =====
  const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const desktopPage = await desktopContext.newPage();

  await desktopPage.goto('http://localhost:3000/login');
  await desktopPage.fill('input[name="email"], input[type="text"]', 'admin');
  await desktopPage.fill('input[name="password"], input[type="password"]', 'admin123');
  await desktopPage.click('button[type="submit"]');
  await desktopPage.waitForURL('**/dashboard', { timeout: 10000 }).catch(() => {});

  await desktopPage.goto('http://localhost:3000/pedidos');
  await desktopPage.waitForTimeout(2000);

  const continuar = desktopPage.locator('button:has-text("Continuar")');
  if (await continuar.isVisible().catch(() => false)) {
    await continuar.click();
    await desktopPage.waitForTimeout(500);
  }

  await desktopPage.screenshot({ path: '/tmp/pedidos-desktop.png', fullPage: false });

  const filtrosBtn = desktopPage.locator('button:has-text("Filtros")').first();
  if (await filtrosBtn.isVisible().catch(() => false)) {
    await filtrosBtn.click();
    await desktopPage.waitForTimeout(600);
    await desktopPage.screenshot({ path: '/tmp/pedidos-desktop-expanded.png', fullPage: false });
  }

  await desktopContext.close();

  // ===== MOBILE =====
  const mobileContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const mobilePage = await mobileContext.newPage();

  await mobilePage.goto('http://localhost:3000/login');
  await mobilePage.fill('input[name="email"], input[type="text"]', 'admin');
  await mobilePage.fill('input[name="password"], input[type="password"]', 'admin123');
  await mobilePage.click('button[type="submit"]');
  await mobilePage.waitForURL('**/dashboard', { timeout: 10000 }).catch(() => {});

  await mobilePage.goto('http://localhost:3000/pedidos');
  await mobilePage.waitForTimeout(2000);

  const continuarMob = mobilePage.locator('button:has-text("Continuar")');
  if (await continuarMob.isVisible().catch(() => false)) {
    await continuarMob.click();
    await mobilePage.waitForTimeout(500);
  }

  // Close mobile sidebar by clicking hamburger menu button again
  const hamburger = mobilePage.locator('header button').first();
  if (await hamburger.isVisible().catch(() => false)) {
    await hamburger.click();
    await mobilePage.waitForTimeout(500);
  }

  await mobilePage.screenshot({ path: '/tmp/pedidos-mobile.png', fullPage: false });

  // Use JS click to bypass sidebar overlay
  await mobilePage.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Filtros'));
    if (btn) btn.click();
  });
  await mobilePage.waitForTimeout(600);
  await mobilePage.screenshot({ path: '/tmp/pedidos-mobile-expanded.png', fullPage: false });

  // Open first details via JS
  await mobilePage.evaluate(() => {
    const details = document.querySelector('details');
    if (details) details.open = true;
  });
  await mobilePage.waitForTimeout(400);
  await mobilePage.screenshot({ path: '/tmp/pedidos-mobile-details.png', fullPage: false });

  await mobileContext.close();
  await browser.close();
})();
