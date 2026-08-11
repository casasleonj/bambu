import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'child_process'
import { resolve } from 'path'

declare global {
  interface Window {
    __PLAYWRIGHT_TEST__?: boolean
  }
}

export const BASE = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3001'

// ─── Test Database Reset ─────────────────────────────────────────────────────

export function resetTestDatabase() {
  const root = resolve(__dirname, '..')
  execSync('npx tsx prisma/clean.ts', { cwd: root, stdio: 'ignore' })
  execSync('npx tsx prisma/seed-test.ts', { cwd: root, stdio: 'ignore' })
}

// ─── Database Cleanup ────────────────────────────────────────────────────────

export function resetDatabase() {
  const root = resolve(__dirname, '..')
  execSync('npx tsx prisma/clean.ts', { cwd: root, stdio: 'ignore' })
  execSync('npx tsx prisma/seed.ts', { cwd: root, stdio: 'ignore' })
}

// ─── Auth ────────────────────────────────────────────────────────────────────

const LOGIN_TIMEOUT = BASE.startsWith('http://localhost') ? 15000 : 60000

export async function login(page: Page, user: string, pass: string) {
  await page.goto(`${BASE}/login`, { timeout: LOGIN_TIMEOUT })
  await page.fill('input[placeholder="Ingrese usuario"]', user)
  await page.fill('input[placeholder="Ingrese contraseña"]', pass)
  await page.click('button[type="submit"]')
  // Wait for navigation away from login page (any role-specific page).
  // Cold starts on Vercel Hobby can take >15s for the first auth callback.
  await page.waitForURL(/.*\/(dashboard|repartidor|reportes)/, { timeout: LOGIN_TIMEOUT })
}

export async function loginAlt(page: Page, user: string, pass: string) {
  // Fallback selector pattern
  await page.goto(`${BASE}/login`, { timeout: LOGIN_TIMEOUT })
  await page.fill('input[type="text"]', user)
  await page.fill('input[type="password"]', pass)
  await page.click('button:has-text("Ingresar")')
  await page.waitForURL(/.*dashboard/, { timeout: LOGIN_TIMEOUT })
}

// ─── Base Caja ───────────────────────────────────────────────────────────────

export async function handleBaseCaja(page: Page) {
  // Fast path: check localStorage first (works in all viewports, sidesteps
  // the mobile polling bug where sidebar `text=Caja base` is hidden).
  const bogotaDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  const hasBaseInStorage = await page.evaluate((date) => {
    return !!localStorage.getItem(`baseDia_${date}`)
  }, bogotaDate).catch(() => false)
  if (hasBaseInStorage) return

  // If the sidebar already shows a base for today, the modal will not appear.
  const baseSetIndicator = page.locator('text=Caja base').first()
  if (await baseSetIndicator.isVisible({ timeout: 1000 }).catch(() => false)) return

  // Poll for modal to appear (cold dev-server API calls can take several seconds).
  // Reduced from 25→10 iterations (3s max vs 7.5s) since dev server is typically
  // warm after the first test navigation.
  const input = page.locator('#base-dia-input')
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(300)
    const count = await input.count()
    if (count > 0 && await input.isVisible().catch(() => false)) {
      try {
        await input.click()
        // Controlled React input: fill then dispatch input/change events to ensure state updates.
        await input.fill('100000')
        await input.evaluate((el: HTMLInputElement) => {
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.dispatchEvent(new Event('change', { bubbles: true }))
        })
        await page.waitForTimeout(200)
        // Wait for React controlled state to update and enable the submit button.
        const submitBtn = page.locator('button[type="submit"]').filter({ hasText: /Continuar|Guardar/ })
        await expect(submitBtn).toBeEnabled({ timeout: 3000 })
        await submitBtn.click()
        await page.waitForSelector('#base-dia-input', { state: 'detached', timeout: 5000 })
      } catch {
        // Modal may have been closed concurrently; ignore
      }
      return
    }
  }
}

/** Pre-block Base Caja modal by setting localStorage before page load */
export async function skipBaseCaja(page: Page) {
  const now = new Date()
  const utcDate = now.toISOString().split('T')[0]
  const bogotaDate = now.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  await page.addInitScript(({ dates }: { dates: string[] }) => {
    for (const date of dates) {
      localStorage.setItem(`baseDia_${date}`, '100000')
    }
    ;(window).__PLAYWRIGHT_TEST__ = true
  }, { dates: [utcDate, bogotaDate] })
}

export async function fullLogin(page: Page, user = 'admin', pass = 'admin123') {
  await skipBaseCaja(page)

  // CSRF-based login (~3s vs ~9s for UI form filling).
  // Avoids the slow page.fill/click/waitForURL round-trip through /login.
  await csrfLogin(page, user, pass)

  // Navigate to dashboard to establish session cookie in the browser context.
  await page.goto(`${BASE}/dashboard`, { timeout: 15000 })
  await page.waitForLoadState('networkidle')

  await handleBaseCaja(page)
}

/** CSRF-based authentication — 3x faster than UI form filling. */
export async function csrfLogin(page: Page, user: string, pass: string) {
  const csrfRes = await page.request.get(`${BASE}/api/auth/csrf`)
  const { csrfToken } = await csrfRes.json()
  await page.request.post(`${BASE}/api/auth/callback/credentials`, {
    data: { csrfToken, username: user, password: pass, redirect: false, json: true },
  })
}

/**
 * Helper for shared-page-per-describe-block pattern.
 * Use in test.beforeAll to create a single authenticated page for all tests
 * in the block, eliminating redundant login calls.
 *
 * Usage:
 *   let p: Page
 *   test.beforeAll(async ({ browser }) => { p = await sharedPageLogin(browser) })
 *   test.afterAll(async () => { await p?.close() })
 *   test('name', async () => { await goto(p, '/page') })
 */
export async function sharedPageLogin(browser: { newPage: () => Promise<Page> }, user = 'admin', pass = 'admin123') {
  const page = await browser.newPage()
  await page.context().clearCookies()
  await page.goto(`${BASE}/login`, { timeout: 15000 })
  await page.evaluate(() => localStorage.clear())
  await skipBaseCaja(page)
  await csrfLogin(page, user, pass)
  await page.goto(`${BASE}/dashboard`, { timeout: 15000 })
  await page.waitForLoadState('networkidle')
  await handleBaseCaja(page)
  return page
}

export async function loginAs(page: Page, role: 'admin' | 'asistente' | 'contador' | 'repartidor') {
  const credentials: Record<string, { user: string; pass: string }> = {
    admin: { user: 'admin', pass: 'admin123' },
    asistente: { user: 'asistente', pass: 'asist123' },
    contador: { user: 'contador', pass: 'cont123' },
    repartidor: { user: 'repartidor', pass: 'rep123' },
  }
  const { user, pass } = credentials[role]
  await skipBaseCaja(page)
  await csrfLogin(page, user, pass)
  await page.goto(`${BASE}/dashboard`, { timeout: 15000 })
  await page.waitForLoadState('networkidle')
  await handleBaseCaja(page)
}

/** Role-aware shared page login. */
export async function sharedLoginAs(browser: { newPage: () => Promise<Page> }, role: 'admin' | 'asistente' | 'contador' | 'repartidor') {
  const credentials: Record<string, { user: string; pass: string }> = {
    admin: { user: 'admin', pass: 'admin123' },
    asistente: { user: 'asistente', pass: 'asist123' },
    contador: { user: 'contador', pass: 'cont123' },
    repartidor: { user: 'repartidor', pass: 'rep123' },
  }
  const { user, pass } = credentials[role]
  const page = await browser.newPage()
  await page.context().clearCookies()
  await page.goto(`${BASE}/login`, { timeout: 15000 })
  await page.evaluate(() => localStorage.clear())
  await skipBaseCaja(page)
  await csrfLogin(page, user, pass)
  await page.goto(`${BASE}/dashboard`, { timeout: 15000 })
  await page.waitForLoadState('networkidle')
  await handleBaseCaja(page)
  return page
}

// ─── UI Helpers ──────────────────────────────────────────────────────────────

export async function waitForToast(page: Page, text: string, type: 'success' | 'error' = 'success') {
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: text })
  await expect(toast).toBeVisible({ timeout: 10000 })
  if (type === 'error') {
    await expect(toast).toHaveAttribute('data-type', 'error')
  }
}

export async function clickButton(page: Page, text: string) {
  await page.locator(`button:has-text("${text}")`).first().click()
}

export async function fillInput(page: Page, selector: string, value: string) {
  const input = page.locator(selector).first()
  await input.clear()
  await input.fill(value)
}

export async function selectOption(page: Page, selector: string, value: string) {
  await page.locator(selector).first().selectOption(value)
}

export async function getText(page: Page, selector: string): Promise<string> {
  return page.locator(selector).first().textContent() as Promise<string>
}

export async function isDisabled(page: Page, selector: string): Promise<boolean> {
  return page.locator(selector).first().isDisabled()
}

export async function isVisible(page: Page, selector: string): Promise<boolean> {
  return page.locator(selector).first().isVisible()
}

export async function countElements(page: Page, selector: string): Promise<number> {
  return page.locator(selector).count()
}

// ─── Mobile Viewport ─────────────────────────────────────────────────────────

export async function setMobileViewport(page: Page) {
  await page.setViewportSize({ width: 375, height: 667 })
}

export async function checkTouchTargets(page: Page, minSize = 44) {
  const buttons = page.locator('button, [role="button"], a, input[type="submit"]')
  const count = await buttons.count()
  const failures: string[] = []
  for (let i = 0; i < Math.min(count, 20); i++) {
    const box = await buttons.nth(i).boundingBox()
    if (box) {
      if (box.width < minSize || box.height < minSize) {
        failures.push(`Button ${i}: ${box.width}x${box.height} (min: ${minSize}x${minSize})`)
      }
    }
  }
  if (failures.length > 0) {
    throw new Error(`Touch targets too small:\n${failures.join('\n')}`)
  }
}

export async function checkHorizontalOverflow(page: Page) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
  if (scrollWidth > clientWidth + 2) {
    throw new Error(`Horizontal overflow: scrollWidth=${scrollWidth}, clientWidth=${clientWidth}`)
  }
}

// ─── Date Helpers ────────────────────────────────────────────────────────────

export function getUniqueFutureDate(offsetDays: number = 0): string {
  const date = new Date()
  date.setDate(date.getDate() + 1 + offsetDays)
  return date.toISOString().split('T')[0]
}

// ─── Navigation ──────────────────────────────────────────────────────────────

export async function goto(page: Page, path: string) {
  // Cold dev-server compiles can take >60s on the first navigation;
  // give the page load enough headroom before the test timeout kicks in.
  await page.goto(`${BASE}${path}`, { timeout: 120000 })
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(500)
  await handleBaseCaja(page)
  await dismissInstallBanner(page)
}

export async function dismissInstallBanner(page: Page) {
  const closeBtn = page.locator('[aria-label="Cerrar banner de instalación"]').first()
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click()
  }
}

/**
 * Opens the "Nuevo Pedido" (Pedido con Envío) form via the FAB speed-dial.
 * Assumes the page is already on /pedidos and loaded. The old direct
 * `button:has-text("+ Nuevo Pedido")` open button was replaced by this FAB
 * (`data-testid="fab-main"` -> `data-testid="fab-pedido-envio"`).
 */
export async function openFabPedidoEnvio(page: Page) {
  // Defensive re-check: under heavy CI load a SessionProvider poll can
  // race checkBaseDia() and reopen the Base Caja modal moments after the
  // caller's own handleBaseCaja() call resolved, leaving its backdrop
  // (fixed inset-0 bg-black/50) intercepting the FAB click.
  await handleBaseCaja(page)
  await dismissInstallBanner(page)
  // .first(): observed in CI as a transient strict-mode violation
  // (getByTestId('fab-main') resolving to 2 elements, one hidden) — same
  // class of flake fixed for the Base Caja modal buttons in #58.
  const fabMain = page.getByTestId('fab-main').first()
  await expect(fabMain).toBeVisible({ timeout: 5000 })
  await fabMain.click()
  const fabPedido = page.getByTestId('fab-pedido-envio').first()
  await expect(fabPedido).toBeVisible({ timeout: 5000 })
  await fabPedido.click()
}

/**
 * On mobile viewports the sidebar `<aside>` (nav items + "Cerrar Sesión")
 * is not rendered in the DOM until the hamburger button is tapped; on
 * desktop it's always in the DOM. Call this before asserting on/clicking
 * sidebar content so the same test works on both `chromium` and
 * `chromium-mobile` projects.
 */
export async function openSidebarIfMobile(page: Page) {
  const hamburger = page.getByRole('button', { name: /abrir men[uú]/i })
  if (await hamburger.isVisible({ timeout: 1000 }).catch(() => false)) {
    await hamburger.click()
  }
}

// Selector de contenedor responsive: vista mobile (`md:hidden`) o desktop
// (`hidden md:block`) según el ancho del viewport. Los componentes duplican
// textos en ambas vistas (display:none en la inactiva); scoping con .first()
// o con un solo data-testid rompe en uno de los dos proyectos de Playwright
// (AGENTS.md #24).
export function responsiveContainer(page: Page, mobileTestId: string, desktopTestId: string) {
  const width = page.viewportSize()?.width ?? 1280
  return width < 768 ? page.getByTestId(mobileTestId) : page.getByTestId(desktopTestId)
}

// ─── API Helpers ─────────────────────────────────────────────────────────────

export async function apiPost(page: Page, path: string, data: unknown) {
  return page.request.post(`${BASE}${path}`, { data })
}

export async function apiGet(page: Page, path: string) {
  return page.request.get(`${BASE}${path}`)
}

export async function apiPut(page: Page, path: string, data: unknown) {
  return page.request.put(`${BASE}${path}`, { data })
}

export async function apiPatch(page: Page, path: string, data: unknown) {
  return page.request.patch(`${BASE}${path}`, { data })
}

export async function apiDelete(page: Page, path: string) {
  return page.request.delete(`${BASE}${path}`)
}

export async function closeAllEmbarques(page: Page) {
  const res = await apiGet(page, '/api/embarques?estado=ABIERTO&all=true')
  const body = await res.json()
  const embarques = body.embarques || []
  for (const embarque of embarques) {
    await apiPost(page, `/api/embarques/${embarque.id}/cerrar`, {})
  }
}

// ─── Entity Creators (via API) ───────────────────────────────────────────────

export async function createCliente(page: Page, data?: Partial<{
  nombre: string; telefono: string; direccion: string; barrio: string
}>) {
  const res = await apiPost(page, '/api/clientes', {
    nombre: data?.nombre || `Cliente Test ${Date.now()}`,
    telefono: data?.telefono || `3${String(Date.now()).slice(-9)}`,
    direccion: data?.direccion || 'Calle Test 123',
    barrio: data?.barrio || 'Centro',
  })
  return res.json()
}

export async function createClienteFull(page: Page, data: {
  nombre: string
  telefono: string
  apellido?: string
  fuente?: string
  barrio?: string
  direccion?: string
  linkUbicacion?: string
  preciosEspeciales?: string
  notas?: string
  limitePedidosFiados?: number
}) {
  const res = await apiPost(page, '/api/clientes', data)
  return res.json()
}

export async function createNegocio(page: Page, data: {
  clienteId: string
  nombre: string
  tipoNegocio?: string
  direccion?: string
  barrio?: string
  referencia?: string
  linkUbicacion?: string
  horaApertura?: string
  rutaId?: string | null
  habAgua?: boolean
  habHielo?: boolean
}) {
  const res = await apiPost(page, '/api/negocios', {
    clienteId: data.clienteId,
    nombre: data.nombre,
    tipoNegocio: data.tipoNegocio,
    direccion: data.direccion,
    barrio: data.barrio,
    referencia: data.referencia,
    linkUbicacion: data.linkUbicacion,
    horaApertura: data.horaApertura,
    rutaId: data.rutaId ?? null,
    habAgua: data.habAgua ?? true,
    habHielo: data.habHielo ?? true,
  })
  return res.json()
}

export async function setupClienteWithPedidos(page: Page, count: number = 3) {
  const c = await createCliente(page)
  for (let i = 0; i < count; i++) {
    await apiPost(page, '/api/pedidos', {
      clienteId: c.cliente.id,
      canal: 'DOMICILIO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: i + 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 5000 * (i + 1) }],
    })
  }
  return c
}

export async function createTrabajador(page: Page, data?: Partial<{
  nombre: string; rol: string; tipoPago: string; usaMoto: boolean; capacidadKg: number
}>) {
  const tipoPago = data?.tipoPago || 'COMISION'
  const wantsComision = tipoPago === 'COMISION' || tipoPago === 'MIXTO'
  const res = await apiPost(page, '/api/trabajadores', {
    nombre: data?.nombre || `Repartidor Test ${Date.now() % 10000}`,
    rol: data?.rol || 'REPARTIDOR',
    tipoPago,
    usaMoto: data?.usaMoto ?? wantsComision,
    capacidadKg: data?.capacidadKg ?? (wantsComision ? 500 : 0),
    comPacaAgua: wantsComision ? 500 : 0,
    comPacaHielo: wantsComision ? 300 : 0,
    comBotellon: wantsComision ? 200 : 0,
    comRepartAgua: (data?.usaMoto ?? wantsComision) ? 500 : 0,
    comRepartHielo: (data?.usaMoto ?? wantsComision) ? 300 : 0,
    comRepartBotellon: (data?.usaMoto ?? wantsComision) ? 200 : 0,
  })
  return res.json()
}

export async function createPedido(page: Page, data?: Partial<{
  clienteId: string; canal: string; ventaRapida: boolean
  pacaAgua: number; pacaHielo: number
  pagoMetodo: string; pagoMonto: number
}>) {
  const items = []
  if ((data?.pacaAgua ?? 1) > 0) items.push({ producto: 'PACA_AGUA', cantidad: data?.pacaAgua ?? 1 })
  if ((data?.pacaHielo ?? 0) > 0) items.push({ producto: 'PACA_HIELO', cantidad: data?.pacaHielo ?? 0 })
  if (items.length === 0) items.push({ producto: 'PACA_AGUA', cantidad: 1 })
  const res = await apiPost(page, '/api/pedidos', {
    clienteId: data?.clienteId || 'CONSUMIDOR_FINAL',
    canal: data?.canal || 'PUNTO',
    ventaRapida: data?.ventaRapida ?? true,
    items,
    pagos: data?.pagoMetodo ? [{ metodo: data.pagoMetodo, monto: data.pagoMonto ?? 5000 }] : [],
  })
  return res.json()
}

export async function createEmbarque(page: Page, trabajadorId: string) {
  const res = await apiPost(page, '/api/embarques', {
    trabajadorId,
    horaSalida: '08:00',
    carga: [{ producto: 'PACA_AGUA', cargadas: 1 }],
  })
  return res.json()
}

export async function createProveedor(page: Page) {
  const res = await apiPost(page, '/api/proveedores', {
    nombre: `Proveedor Test ${Date.now() % 10000}`,
    telefono: `3${String(Date.now()).slice(-9)}`,
  })
  return res.json()
}

export async function createInsumo(page: Page) {
  const res = await apiPost(page, '/api/insumos', {
    nombre: `Insumo Test ${Date.now() % 10000}`,
    unidad: 'UNIDAD',
    stock: 100,
    stockMin: 10,
    precioUnit: 5000,
  })
  return res.json()
}

// ─── Get first from list ─────────────────────────────────────────────────────

export async function getFirstCliente(page: Page) {
  const res = await apiGet(page, '/api/clientes')
  const body = await res.json()
  return body.clientes?.[0]
}

export async function getFirstTrabajador(page: Page) {
  const res = await apiGet(page, '/api/trabajadores')
  const body = await res.json()
  return body.trabajadores?.[0]
}

export async function getFirstFacturaConSaldo(page: Page) {
  const res = await apiGet(page, '/api/facturas')
  const body = await res.json()
  return body.facturas?.find((f: { saldo: number | string }) => Number(f.saldo) > 0)
}

// ─── Produccion Helpers ──────────────────────────────────────────────────────

export async function createSellador(page: Page, data?: Partial<{
  nombre: string; tipoPago: string
}>) {
  const wantsComision = data?.tipoPago !== 'FIJO'
  const res = await apiPost(page, '/api/trabajadores', {
    nombre: data?.nombre || `Sellador Test ${Date.now() % 10000}`,
    rol: 'SELLADOR',
    tipoPago: data?.tipoPago || 'COMISION',
    usaMoto: false,
    comPacaAgua: wantsComision ? 500 : 0,
    comPacaHielo: wantsComision ? 300 : 0,
    comBotellon: wantsComision ? 200 : 0,
    salarioFijo: data?.tipoPago === 'FIJO' || data?.tipoPago === 'MIXTO' ? 50000 : 0,
  })
  return res.json()
}

export async function getSellador(page: Page) {
  const res = await apiGet(page, '/api/trabajadores?rol=SELLADOR&activo=true')
  const body = await res.json()
  return body.trabajadores?.[0]
}

// ─── Re-export for convenience ───────────────────────────────────────────────

export { test, expect }
