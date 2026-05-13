import { test, expect, type Page, type APIRequestContext } from '@playwright/test'

export const BASE = 'http://localhost:3000'

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function login(page: Page, user: string, pass: string) {
  await page.goto(`${BASE}/login`)
  await page.fill('input[placeholder="Ingrese usuario"]', user)
  await page.fill('input[placeholder="Ingrese contraseña"]', pass)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard', { timeout: 15000 })
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
  await page.waitForTimeout(300)
  const btn = page.locator('button:has-text("Continuar")')
  if (await btn.count() > 0) {
    await page.fill('input[type="number"]', '100000')
    await btn.first().click()
    await page.waitForTimeout(600)
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
  await login(page, user, pass)
  await handleBaseCaja(page)
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

export async function apiDelete(page: Page, path: string) {
  return page.request.delete(`${BASE}${path}`)
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

export async function createTrabajador(page: Page, data?: Partial<{
  nombre: string; rol: string; tipoPago: string
}>) {
  const res = await apiPost(page, '/api/trabajadores', {
    nombre: data?.nombre || `Repartidor Test ${Date.now() % 10000}`,
    rol: data?.rol || 'REPARTIDOR',
    tipoPago: data?.tipoPago || 'COMISION',
    comPacaAgua: 500,
    comPacaHielo: 300,
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

// ─── Re-export for convenience ───────────────────────────────────────────────

export { test, expect }
