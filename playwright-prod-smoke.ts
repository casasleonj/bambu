import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'https://bambudemomultimodelo.vercel.app';
const SCREENSHOTS_DIR = '/tmp/playwright-prod-smoke-screenshots';

interface RoleConfig {
  username: string;
  password: string;
  expectedRedirect: string;
  routes: string[];
}

const ROLES: Record<string, RoleConfig> = {
  admin: {
    username: 'admin',
    password: 'admin123',
    expectedRedirect: '/dashboard',
    routes: [
      '/dashboard',
      '/clientes',
      '/pedidos',
      '/productos',
      '/proveedores',
      '/insumos',
      '/trabajadores',
      '/embarques',
      '/rutas',
      '/compras',
      '/gastos',
      '/facturas',
      '/resumen-facturas',
      '/deudas',
      '/nomina',
      '/cierre',
      '/configuracion',
      '/reportes',
      '/reportes/forecast',
      '/reportes/salud-antifraude',
      '/mi-perfil',
    ],
  },
  asistente: {
    username: 'asistente',
    password: 'asist123',
    expectedRedirect: '/dashboard',
    routes: [
      '/dashboard',
      '/clientes',
      '/pedidos',
      '/productos',
      '/proveedores',
      '/insumos',
      '/trabajadores',
      '/embarques',
      '/rutas',
      '/compras',
      '/gastos',
      '/facturas',
      '/resumen-facturas',
      '/deudas',
      '/nomina',
      '/cierre',
      '/reportes',
      '/mi-perfil',
    ],
  },
  contador: {
    username: 'contador',
    password: 'cont123',
    expectedRedirect: '/reportes',
    routes: [
      '/reportes',
      '/reportes/forecast',
      '/reportes/salud-antifraude',
      '/facturas',
      '/resumen-facturas',
      '/deudas',
      '/nomina',
      '/cierre',
      '/mi-perfil',
    ],
  },
  repartidor: {
    username: 'repartidor',
    password: 'rep123',
    expectedRedirect: '/repartidor',
    routes: [
      '/repartidor',
      '/pedidos',
      '/embarques',
      '/rutas',
      '/mi-perfil',
    ],
  },
};

async function login(page: Page, username: string, password: string): Promise<void> {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  
  await page.waitForSelector('#login-username', { timeout: 10000 });
  await page.waitForSelector('#login-password', { timeout: 10000 });
  
  await page.fill('#login-username', username);
  await page.fill('#login-password', password);
  
  const submitButton = await page.$('button[type="submit"]');
  if (!submitButton) {
    throw new Error('Submit button not found');
  }
  
  await submitButton.click();
  
  // Wait for redirect away from login
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 });
}

async function testPage(page: Page, route: string, role: string): Promise<{ ok: boolean; error?: string; status?: number; finalUrl?: string }> {
  const url = `${BASE_URL}${route}`;
  const screenshotPath = path.join(SCREENSHOTS_DIR, `${role}-${route.replace(/\//g, '_')}.png`);
  
  try {
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    const status = response ? response.status() : 0;
    await page.waitForTimeout(2000);
    
    const bodyText = await page.$eval('body', el => el.innerText).catch(() => '');
    const hasNextError = bodyText.includes('Application error') 
      || bodyText.includes('Internal Server Error')
      || bodyText.includes('Something went wrong')
      || bodyText.includes('Error inesperado');
    
    const currentUrl = page.url();
    const isLogin = currentUrl.includes('/login');
    
    await page.screenshot({ path: screenshotPath, fullPage: true });
    
    if (status >= 500) {
      return { ok: false, error: `HTTP ${status}`, status, finalUrl: currentUrl };
    }
    
    if (hasNextError) {
      return { ok: false, error: 'Next.js error page detected', status, finalUrl: currentUrl };
    }
    
    if (isLogin) {
      return { ok: false, error: 'Redirected to login (unauthorized or session lost)', status, finalUrl: currentUrl };
    }
    
    return { ok: true, status, finalUrl: currentUrl };
  } catch (err) {
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function testRole(browser: Browser, roleName: string, config: RoleConfig): Promise<{ role: string; results: Array<{ route: string; ok: boolean; error?: string; status?: number; finalUrl?: string }> }> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: 'Playwright Smoke Test',
  });
  const page = await context.newPage();
  
  const results: Array<{ route: string; ok: boolean; error?: string; status?: number; finalUrl?: string }> = [];
  
  try {
    console.log(`\n[${roleName}] Logging in as ${config.username}...`);
    await login(page, config.username, config.password);
    
    const currentUrl = page.url();
    console.log(`[${roleName}] Current URL after login: ${currentUrl}`);
    
    if (!currentUrl.includes(config.expectedRedirect) && !currentUrl.includes('/login')) {
      console.warn(`[${roleName}] Warning: expected redirect to ${config.expectedRedirect}, got ${currentUrl}`);
    }
    
    for (const route of config.routes) {
      const result = await testPage(page, route, roleName);
      results.push({ route, ...result });
      const status = result.status ? `(${result.status})` : '';
      console.log(`[${roleName}] ${route} ${result.ok ? 'OK' : 'FAIL'} ${status}${result.error ? ' - ' + result.error : ''}`);
    }
  } catch (err) {
    console.error(`[${roleName}] Fatal error:`, err);
    results.push({ route: 'LOGIN', ok: false, error: err instanceof Error ? err.message : String(err) });
  } finally {
    await context.close();
  }
  
  return { role: roleName, results };
}

async function main() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
  
  console.log('Starting production smoke test...');
  console.log('Base URL:', BASE_URL);
  console.log('Screenshots:', SCREENSHOTS_DIR);
  
  const browser = await chromium.launch({ headless: true });
  
  const allResults: Array<{ role: string; results: Array<{ route: string; ok: boolean; error?: string; status?: number; finalUrl?: string }> }> = [];
  
  try {
    for (const [roleName, config] of Object.entries(ROLES)) {
      const result = await testRole(browser, roleName, config);
      allResults.push(result);
    }
  } finally {
    await browser.close();
  }
  
  console.log('\n========== SUMMARY ==========');
  let totalTests = 0;
  let totalFailures = 0;
  
  for (const { role, results } of allResults) {
    const failures = results.filter(r => !r.ok);
    totalTests += results.length;
    totalFailures += failures.length;
    console.log(`\n${role.toUpperCase()}: ${results.length - failures.length}/${results.length} passed`);
    for (const failure of failures) {
      console.log(`  ❌ ${failure.route}${failure.error ? ' - ' + failure.error : ''}${failure.finalUrl ? ' [' + failure.finalUrl + ']' : ''}`);
    }
  }
  
  console.log(`\nTotal: ${totalTests - totalFailures}/${totalTests} passed`);
  
  if (totalFailures > 0) {
    console.log(`\nScreenshots saved to: ${SCREENSHOTS_DIR}`);
    process.exit(1);
  }
  
  console.log('\nAll smoke tests passed!');
}

main().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
