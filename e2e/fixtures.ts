import { test, expect, type Page } from '@playwright/test'
import { execSync } from 'child_process'
import { resolve } from 'path'

export const BASE = 'http://localhost:3000'

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

export async function login(page: Page, user: string, pass: string) {
  await page.goto(`${BASE}/login`)
  await page.fill('input[placeholder="Ingrese usuario"]', user)
  await page.fill('input[placeholder="Ingrese contraseña"]', pass)
  await page.click('button[type="submit"]')
  // Wait for navigation away from login page (any role-specific page)
  await page.waitForURL(/.*\/(dashboard|repartidor|reportes)/, { timeout: 15000 })
}

export async function loginAlt(page: Page, user: string, pass: string) {
  // Fallback selector pattern
  await page.goto(`${BASE}/login`)
  await page.fill('input[type="text"]', user)
  await page.fill('input[type="password"]', pass)
  await page.click('button:has-text("Ingresar")')
  await page.waitForURL(/.*dashboard/, { timeout: 15000 })
}

// ─── Base Caja ───────────────────────────────────────────────────────────────

export async function handleBaseCaja(page: Page) {
  // Poll for modal to appear (it may take time due to async API calls in base-caja-modal)
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(300)
    const btn = page.locator('button:has-text("Continuar")')
    const count = await btn.count()
    if (count > 0) {
      const input = page.locator('.fixed input[type="number"]')
      if (await input.count() > 0) {
        await input.fill('100000')
        await page.waitForTimeout(100)
        await btn.first().click()
        await page.waitForTimeout(600)
      }
      return
    }
  }
}

/** Pre-block Base Caja modal by setting localStorage before page load */
export async function skipBaseCaja(page: Page) {
  const today = new Date().toISOString().split('T')[0]
  await page.addInitScript(({ date }: { date: string }) => {
    localStorage.setItem('baseDiaDate', date)
    localStorage.setItem('baseDia', '100000')
    ;(window as any).__PLAYWRIGHT_TEST__ = true
  }, { date: today })
}

export async function fullLogin(page: Page, user = 'admin', pass = 'admin123') {
  await skipBaseCaja(page)
  await login(page, user, pass)
}

export async function loginAs(page: Page, role: 'admin' | 'asistente' | 'contador' | 'repartidor') {
  const credentials = {
    admin: { user: 'admin', pass: 'admin123' },
    asistente: { user: 'asistente', pass: 'asist123' },
    contador: { user: 'contador', pass: 'cont123' },
    repartidor: { user: 'repartidor', pass: 'rep123' },
  }
  const { user, pass } = credentials[role]
  await skipBaseCaja(page)
  await login(page, user, pass)
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
  await page.goto(`${BASE}${path}`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(500)
  await handleBaseCaja(page)
}

// ─── API Helpers ─────────────────────────────────────────────────────────────

export async function apiPost(page: Page, path: string, data: any) {
  return page.request.post(`${BASE}${path}`, { data })
}

export async function apiGet(page: Page, path: string) {
  return page.request.get(`${BASE}${path}`)
}

export async function apiPut(page: Page, path: string, data: any) {
  return page.request.put(`${BASE}${path}`, { data })
}

export async function apiPatch(page: Page, path: string, data: any) {
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
  nombreNegocio?: string
  tipoNegocio?: string
  fuente?: string
  barrio?: string
  direccion?: string
  linkUbicacion?: string
  contactos?: Array<{ nombre: string; telefono: string; relacion?: string }>
  preciosEspeciales?: string
  notas?: string
  horaApertura?: string
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
  nombre: string; rol: string; tipoPago: string; usaMoto: boolean
}>) {
  const wantsComision = data?.tipoPago === 'COMISION' || data?.tipoPago === 'MIXTO'
  const res = await apiPost(page, '/api/trabajadores', {
    nombre: data?.nombre || `Repartidor Test ${Date.now() % 10000}`,
    rol: data?.rol || 'REPARTIDOR',
    tipoPago: data?.tipoPago || 'COMISION',
    usaMoto: data?.usaMoto ?? wantsComision,
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
  const res = await apiPost(page, '/api/embarques', { trabajadorId })
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
  return body.facturas?.find((f: any) => Number(f.saldo) > 0)
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
